// Life → Trends: mood, energy and sleep over time (from your daily check-ins), how often you
// keep each habit, and simple patterns ("on days you run, your mood is higher").

import { useMemo, useState } from 'react'
import type { FocusSession, Habit, HabitCheck, JournalEntry } from '@shared/types'
import { BarChart, Heatmap, LineChart } from '@/components/Charts'
import { api, useLive } from '@/lib/data'
import { addDays, localDate } from '@/lib/dates'
import { navigate } from '@/lib/nav'

const RANGES = [
  { days: 30, label: '30 days' },
  { days: 90, label: '3 months' },
  { days: 365, label: 'Year' }
]
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const short = (d: string): string => new Date(`${d}T00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
const mondayOf = (d: string): string => {
  const x = new Date(`${d}T00:00`)
  return addDays(d, -((x.getDay() + 6) % 7))
}

interface Data {
  journal: JournalEntry[]
  habits: Habit[]
  checks: HabitCheck[]
  sessions: FocusSession[]
}

export function TrendsPage(): React.JSX.Element {
  const [range, setRange] = useState(30)
  const { data } = useLive(
    ['journal_entries', 'habits', 'habit_checks', 'focus_sessions'],
    async (): Promise<Data> => {
      const [journal, habits, checks, sessions] = await Promise.all([api.list('journal_entries', {}, 'date'), api.list('habits', { archived: 0 }, 'sort'), api.list('habit_checks'), api.list('focus_sessions')])
      return { journal, habits, checks, sessions }
    },
    []
  )
  const view = useMemo(() => (data ? build(data, range) : null), [data, range])
  if (!view) return <div />

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 px-8 py-7">
        <header className="flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <h1 className="text-3xl">Trends</h1>
            <p className="text-sm text-muted">How you’ve been feeling, sleeping and keeping your habits.</p>
          </div>
          <div className="flex gap-0.5 rounded-lg bg-line/50 p-0.5 text-sm" role="tablist">
            {RANGES.map((r) => (
              <button key={r.days} role="tab" aria-selected={range === r.days} onClick={() => setRange(r.days)} className={`rounded-md px-3 py-1 ${range === r.days ? 'bg-panel font-medium shadow-sm' : 'text-muted'}`}>
                {r.label}
              </button>
            ))}
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-4">
          <Tile label="Average mood" value={view.avgMood} unit="/ 5" change={view.moodChange} />
          <Tile label="Average energy" value={view.avgEnergy} unit="/ 5" change={view.energyChange} />
          <Tile label="Average sleep" value={view.avgSleep} unit="h" change={view.sleepChange} />
          <div className="card p-4">
            <div className="label-caps text-[10px] text-muted">Check-ins</div>
            <div className="mt-1 text-2xl tabular-nums">
              {view.checkins}
              <span className="text-sm text-muted"> / {range} days</span>
            </div>
          </div>
        </div>

        {view.checkins === 0 ? (
          <section className="card p-6 text-center text-sm text-muted">
            No check-ins in this period yet. Use the Daily check-in on Home (or say “Hey Bauer, I’m feeling good, slept 7 hours…”) and your trends appear here.
            <div className="mt-3">
              <button className="btn" onClick={() => navigate({ name: 'home' })}>
                Go to Home
              </button>
            </div>
          </section>
        ) : (
          <>
            <section className="card p-5">
              <h2 className="mb-2 font-semibold">Mood and energy <span className="text-xs font-normal text-muted">{view.weekly ? 'weekly average' : '7-day average · dots are single days'}</span></h2>
              <LineChart
                labels={view.labels}
                min={1}
                max={5}
                ticks={[1, 2, 3, 4, 5]}
                series={[
                  { name: 'Mood', color: 'var(--chart-1)', values: view.mood, raw: view.moodRaw, format: (v) => `${v.toFixed(view.weekly ? 1 : 0)} / 5` },
                  { name: 'Energy', color: 'var(--chart-2)', values: view.energy, raw: view.energyRaw, format: (v) => `${v.toFixed(view.weekly ? 1 : 0)} / 5` }
                ]}
                tooltipTitle={(i) => view.titles[i]}
              />
            </section>
            <section className="card p-5">
              <h2 className="mb-2 font-semibold">Sleep{view.weekly ? ' (weekly average)' : ''}</h2>
              <BarChart labels={view.labels} values={view.sleep} color="var(--chart-1)" max={Math.max(10, ...view.sleep.map((v) => v ?? 0))} ticks={[0, 4, 8]} name="Hours slept" format={(v) => `${v.toFixed(1)} h`} tooltipTitle={(i) => view.titles[i]} />
            </section>
          </>
        )}

        {view.insights.length > 0 && (
          <section className="card p-5">
            <h2 className="mb-2 font-semibold">Patterns</h2>
            <ul className="flex flex-col gap-2 text-sm">
              {view.insights.map((t) => (
                <li key={t} className="flex gap-2">
                  <span aria-hidden>•</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">Patterns from your own check-ins — worth noticing, not proof.</p>
          </section>
        )}

        {data!.habits.length > 0 && (
          <section className="card p-5">
            <div className="mb-3 flex items-baseline gap-2">
              <h2 className="font-semibold">Habits, week by week</h2>
              <span className="text-xs text-muted">shaded by how much of each week’s target you hit</span>
            </div>
            <Heatmap
              rows={data!.habits.map((h) => ({ id: h.id, label: `${h.emoji} ${h.name}` }))}
              cols={view.weeks.map(short)}
              value={(r, c) => {
                const h = data!.habits[r]
                const done = view.habitWeek(h.id, view.weeks[c])
                return { share: Math.min(1, done / Math.max(1, h.days_per_week)), text: `${done} of ${h.days_per_week} days` }
              }}
              title={(r, c) => `${data!.habits[r].name} · week of ${short(view.weeks[c])}`}
            />
          </section>
        )}

        {view.checkins > 0 && (
          <details className="card p-5 text-sm">
            <summary className="cursor-pointer font-semibold">Show as a table</summary>
            <table className="mt-3 w-full text-left text-xs">
              <thead className="text-muted">
                <tr>
                  <th className="py-1 font-normal">{view.weekly ? 'Week of' : 'Day'}</th>
                  <th className="font-normal">Mood</th>
                  <th className="font-normal">Energy</th>
                  <th className="font-normal">Sleep</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {view.titles.map((t, i) =>
                  view.mood[i] == null && view.energy[i] == null && view.sleep[i] == null ? null : (
                    <tr key={t} className="border-t border-line">
                      <td className="py-1">{t}</td>
                      <td>{view.mood[i]?.toFixed(1) ?? '—'}</td>
                      <td>{view.energy[i]?.toFixed(1) ?? '—'}</td>
                      <td>{view.sleep[i] != null ? `${view.sleep[i]!.toFixed(1)} h` : '—'}</td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </details>
        )}
      </div>
    </div>
  )
}

function Tile({ label, value, unit, change }: { label: string; value: number | null; unit: string; change: number | null }): React.JSX.Element {
  return (
    <div className="card p-4">
      <div className="label-caps text-[10px] text-muted">{label}</div>
      <div className="mt-1 text-2xl tabular-nums">
        {value == null ? '—' : value.toFixed(1)}
        {value != null && <span className="text-sm text-muted"> {unit}</span>}
      </div>
      {change != null && Math.abs(change) >= 0.05 && (
        <div className="text-xs text-muted">
          {change > 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)} vs the period before
        </div>
      )}
    </div>
  )
}

function build(d: Data, range: number) {
  const today = localDate(new Date())
  const from = addDays(today, -(range - 1))
  const prevFrom = addDays(from, -range)
  const byDate = new Map(d.journal.map((e) => [e.date, e]))
  const days: string[] = []
  for (let x = from; x <= today; x = addDays(x, 1)) days.push(x)
  const inPeriod = d.journal.filter((e) => e.date >= from && e.date <= today)
  const prev = d.journal.filter((e) => e.date >= prevFrom && e.date < from)
  const pick = (list: JournalEntry[], k: 'mood' | 'energy' | 'sleep_hours'): number[] => list.map((e) => e[k]).filter((v): v is number => v != null)
  const change = (k: 'mood' | 'energy' | 'sleep_hours'): number | null => {
    const a = avg(pick(inPeriod, k))
    const b = avg(pick(prev, k))
    return a != null && b != null && pick(prev, k).length >= 3 ? a - b : null
  }

  // Daily points, or weekly averages for the year view.
  const weekly = range > 120
  let labels: string[]
  let titles: string[]
  let mood: (number | null)[]
  let energy: (number | null)[]
  let sleep: (number | null)[]
  let moodRaw: (number | null)[] | undefined
  let energyRaw: (number | null)[] | undefined
  if (weekly) {
    const weeks = [...new Set(days.map(mondayOf))]
    const inWeek = (w: string): JournalEntry[] => inPeriod.filter((e) => mondayOf(e.date) === w)
    labels = weeks.map(short)
    titles = weeks.map((w) => `Week of ${short(w)}`)
    mood = weeks.map((w) => avg(pick(inWeek(w), 'mood')))
    energy = weeks.map((w) => avg(pick(inWeek(w), 'energy')))
    sleep = weeks.map((w) => avg(pick(inWeek(w), 'sleep_hours')))
  } else {
    labels = days.map(short)
    titles = days.map((x) => new Date(`${x}T00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }))
    // Lines are 7-day averages (daily 1–5 scores zig-zag and hide each other); each day's
    // own score is a dot.
    const series = (k: 'mood' | 'energy'): (number | null)[] => {
      const all = d.journal.filter((e) => e.date >= addDays(from, -6) && e.date <= today)
      return days.map((x) => avg(all.filter((e) => e.date > addDays(x, -7) && e.date <= x && e[k] != null).map((e) => e[k]!)))
    }
    moodRaw = days.map((x) => byDate.get(x)?.mood ?? null)
    energyRaw = days.map((x) => byDate.get(x)?.energy ?? null)
    mood = series('mood')
    energy = series('energy')
    sleep = days.map((x) => byDate.get(x)?.sleep_hours ?? null)
  }

  // Habits: done-days per week (last up to 26 weeks of the range).
  const weeks = [...new Set(days.map(mondayOf))].slice(-26)
  const checkSet = new Set(d.checks.map((c) => `${c.habit_id}|${c.date}`))
  const habitWeek = (habitId: string, monday: string): number => {
    let n = 0
    for (let i = 0; i < 7; i++) if (checkSet.has(`${habitId}|${addDays(monday, i)}`)) n++
    return n
  }

  // Patterns: compare mood on days with / without something (need a few days on each side).
  const insights: string[] = []
  const withMood = inPeriod.filter((e) => e.mood != null)
  const compare = (test: (e: JournalEntry) => boolean): number | null => {
    const yes = withMood.filter(test).map((e) => e.mood!)
    const no = withMood.filter((e) => !test(e)).map((e) => e.mood!)
    if (yes.length < 4 || no.length < 4) return null
    return avg(yes)! - avg(no)!
  }
  const say = (diff: number | null, what: string): void => {
    if (diff == null || Math.abs(diff) < 0.3) return
    insights.push(`On days ${what}, your mood was ${Math.abs(diff).toFixed(1)} ${diff > 0 ? 'higher' : 'lower'} on average.`)
  }
  say(
    compare((e) => (e.sleep_hours ?? 0) >= 7),
    'you slept 7 hours or more'
  )
  const studyMin = new Map<string, number>()
  for (const s of d.sessions) {
    const day = localDate(new Date(s.started_at))
    studyMin.set(day, (studyMin.get(day) ?? 0) + s.focused_seconds / 60)
  }
  say(
    compare((e) => (studyMin.get(e.date) ?? 0) >= 60),
    'you focused for an hour or more'
  )
  for (const h of d.habits) say(compare((e) => checkSet.has(`${h.id}|${e.date}`)), `you did ${h.emoji ? `${h.emoji} ` : ''}${h.name}`)
  if (withMood.length >= 14) {
    const byDay = WEEKDAYS.map((_, i) => avg(withMood.filter((e) => new Date(`${e.date}T00:00`).getDay() === i).map((e) => e.mood!)))
    const counts = WEEKDAYS.map((_, i) => withMood.filter((e) => new Date(`${e.date}T00:00`).getDay() === i).length)
    const best = byDay.reduce<number>((b, v, i) => (v != null && counts[i] >= 2 && (byDay[b] == null || v > byDay[b]!) ? i : b), 0)
    const worst = byDay.reduce<number>((b, v, i) => (v != null && counts[i] >= 2 && (byDay[b] == null || v < byDay[b]!) ? i : b), 0)
    if (byDay[best] != null && byDay[worst] != null && byDay[best]! - byDay[worst]! >= 0.5) insights.push(`${WEEKDAYS[best]}s tend to be your best days (${byDay[best]!.toFixed(1)}), ${WEEKDAYS[worst]}s the hardest (${byDay[worst]!.toFixed(1)}).`)
  }
  for (const h of d.habits) {
    const w = weeks.slice(-4)
    if (w.length < 4) continue
    const hit = w.filter((m) => habitWeek(h.id, m) >= h.days_per_week).length
    if (hit === 4) insights.push(`${h.emoji} ${h.name}: you hit your target every week for the last four weeks. 🔥`)
  }

  return {
    labels,
    titles,
    mood,
    energy,
    moodRaw,
    energyRaw,
    sleep,
    weekly,
    weeks,
    habitWeek,
    insights,
    checkins: inPeriod.filter((e) => e.mood != null || e.energy != null || e.sleep_hours != null).length,
    avgMood: avg(pick(inPeriod, 'mood')),
    avgEnergy: avg(pick(inPeriod, 'energy')),
    avgSleep: avg(pick(inPeriod, 'sleep_hours')),
    moodChange: change('mood'),
    energyChange: change('energy'),
    sleepChange: change('sleep_hours')
  }
}
