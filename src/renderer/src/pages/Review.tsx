// Weekly review: what you got done, how you felt, where the money went, and what's coming
// next week — plus three short reflections saved for the week.

import { useMemo, useState } from 'react'
import type { WeeklyReview } from '@shared/types'
import { AutoText } from '@/components/AutoField'
import { MOODS } from './Journal'
import { Icon } from '@/components/ui'
import { api, db, useLive } from '@/lib/data'
import { addDays, localDate } from '@/lib/dates'
import { navigate } from '@/lib/nav'
import { upcomingOccasions } from '@/lib/occasions'
import { money, useCurrency } from './Money'

const mondayOf = (d: string): string => addDays(d, -((new Date(`${d}T00:00`).getDay() + 6) % 7))
const fmtDay = (d: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string => new Date(`${d}T00:00`).toLocaleDateString(undefined, opts)
const hm = (min: number): string => (min < 60 ? `${Math.round(min)}m` : `${Math.floor(min / 60)}h${Math.round(min % 60) ? ` ${Math.round(min % 60)}m` : ''}`)
const dayOfIso = (iso: string): string => (iso.length === 10 ? iso : localDate(new Date(iso)))

/** Monday of the week to show first: last week early in the week, else this one. */
function defaultWeek(): string {
  const today = localDate(new Date())
  const dow = new Date().getDay()
  return dow === 1 || dow === 2 ? addDays(mondayOf(today), -7) : mondayOf(today)
}

export function ReviewPage(): React.JSX.Element {
  const [week, setWeek] = useState(defaultWeek)
  const end = addDays(week, 6)
  const nextFrom = addDays(week, 7)
  const nextTo = addDays(week, 13)
  const cur = useCurrency()
  const thisWeek = mondayOf(localDate(new Date()))

  const { data } = useLive(
    ['tasks', 'focus_sessions', 'modules', 'projects', 'habits', 'habit_checks', 'journal_entries', 'money_entries', 'budgets', 'assessments', 'events', 'people', 'person_facts', 'plans', 'weekly_reviews'],
    async () => {
      const [tasks, sessions, modules, projects, habits, checks, journal, moneyRows, assessments, events, people, facts, plans, reviews] = await Promise.all([
        api.list('tasks'),
        api.list('focus_sessions'),
        api.list('modules'),
        api.list('projects'),
        api.list('habits', { archived: 0 }, 'sort'),
        api.list('habit_checks'),
        api.list('journal_entries', {}, 'date'),
        api.list('money_entries'),
        api.list('assessments'),
        api.list('events'),
        api.list('people', { archived: 0 }),
        api.list('person_facts'),
        api.list('plans'),
        api.list('weekly_reviews', { week_start: week })
      ])
      return { tasks, sessions, modules, projects, habits, checks, journal, money: moneyRows, assessments, events, people, facts, plans, review: reviews[0] ?? null }
    },
    [week]
  )

  const v = useMemo(() => {
    if (!data) return null
    const inWeek = (d: string | null | undefined): boolean => !!d && d >= week && d <= end
    const inNext = (d: string | null | undefined): boolean => !!d && d >= nextFrom && d <= nextTo
    const done = data.tasks.filter((t) => t.status === 'done' && t.completed_at && inWeek(dayOfIso(t.completed_at)))
    const sessions = data.sessions.filter((s) => s.focused_seconds > 0 && inWeek(dayOfIso(s.started_at)))
    const focusMin = sessions.reduce((n, s) => n + s.focused_seconds / 60, 0)
    const byWhat = new Map<string, { label: string; color: string; min: number }>()
    for (const s of sessions) {
      const m = s.module_id ? data.modules.find((x) => x.id === s.module_id) : null
      const p = !m && s.project_id ? data.projects.find((x) => x.id === s.project_id) : null
      const key = m?.id ?? p?.id ?? 'other'
      const cur0 = byWhat.get(key) ?? { label: m ? m.code || m.name : p ? p.title : 'Other focus', color: m?.color ?? p?.color ?? 'var(--color-muted)', min: 0 }
      cur0.min += s.focused_seconds / 60
      byWhat.set(key, cur0)
    }
    const habitRows = data.habits.map((h) => {
      const n = data.checks.filter((c) => c.habit_id === h.id && inWeek(c.date)).length
      return { h, n, hit: n >= h.days_per_week }
    })
    const days = Array.from({ length: 7 }, (_, i) => addDays(week, i))
    const entries = days.map((d) => data.journal.find((e) => e.date === d))
    const moods = entries.map((e) => e?.mood ?? null)
    const energies = entries.map((e) => e?.energy ?? null)
    const sleeps = entries.map((e) => e?.sleep_hours ?? null)
    const moodVals = moods.filter((m): m is number => m != null)
    const highlights = entries
      .map((e, i) => {
        try {
          const h = (JSON.parse(e?.details || '{}') as { highlight?: string }).highlight
          return h ? { day: days[i], text: h } : null
        } catch {
          return null
        }
      })
      .filter((x): x is { day: string; text: string } => !!x)
    const spentRows = data.money.filter((m) => m.kind === 'expense' && inWeek(m.date))
    const spent = spentRows.reduce((n, m) => n + m.amount, 0)
    const prevSpent = data.money.filter((m) => m.kind === 'expense' && m.date >= addDays(week, -7) && m.date < week).reduce((n, m) => n + m.amount, 0)
    const cats = new Map<string, number>()
    for (const m of spentRows) cats.set(m.category, (cats.get(m.category) ?? 0) + m.amount)
    const topCats = [...cats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)

    // Next week
    const dueNext = data.tasks.filter((t) => t.status !== 'done' && t.due_at && inNext(dayOfIso(t.due_at))).sort((a, b) => a.due_at!.localeCompare(b.due_at!))
    const assessNext = data.assessments.filter((a) => a.due_at && a.score_pct == null && inNext(dayOfIso(a.due_at))).sort((a, b) => a.due_at!.localeCompare(b.due_at!))
    const eventsNext = data.events.filter((e) => inNext(dayOfIso(e.start_at))).sort((a, b) => a.start_at.localeCompare(b.start_at))
    const plansNext = data.plans.filter((p) => p.status === 'planned' && inNext(p.date))
    const occasions = upcomingOccasions(data.people, data.facts, 400, new Date(`${nextFrom}T00:00`)).filter((o) => o.days <= 6)
    return { done, focusMin, byWhat: [...byWhat.values()].sort((a, b) => b.min - a.min), habitRows, days, moods, energies, sleeps, moodAvg: moodVals.length ? moodVals.reduce((a, b) => a + b, 0) / moodVals.length : null, highlights, spent, prevSpent, topCats, dueNext, assessNext, eventsNext, plansNext, occasions, modules: data.modules }
  }, [data, week, end, nextFrom, nextTo])

  if (!data || !v) return <div />
  const review = data.review

  const saveReview = async (patch: Partial<WeeklyReview>): Promise<void> => {
    const existing = (await api.list('weekly_reviews', { week_start: week }))[0]
    if (existing) await db.update('weekly_reviews', existing.id, patch)
    else await db.create('weekly_reviews', { week_start: week, ...patch })
  }
  const habitsHit = v.habitRows.filter((r) => r.hit).length
  const maxMin = Math.max(1, ...v.byWhat.map((b) => b.min))

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 px-8 py-7">
        <header className="flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <div className="label-caps">Weekly review</div>
            <h1 className="text-3xl">
              {fmtDay(week)} – {fmtDay(end, { day: 'numeric', month: 'short', year: 'numeric' })}
            </h1>
            <p className="text-sm text-muted">{week === thisWeek ? 'This week so far' : week === addDays(thisWeek, -7) ? 'Last week' : ' '}</p>
          </div>
          <button className="btn-ghost px-1.5" onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week">
            <Icon name="back" />
          </button>
          <button className="btn-ghost px-1.5 disabled:opacity-30" disabled={week >= thisWeek} onClick={() => setWeek(addDays(week, 7))} aria-label="Next week">
            <Icon name="chevron" />
          </button>
        </header>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Tasks done" value={String(v.done.length)} />
          <Stat label="Focused" value={hm(v.focusMin)} />
          <Stat label="Habit targets hit" value={v.habitRows.length ? `${habitsHit} / ${v.habitRows.length}` : '—'} />
          <Stat label="Average mood" value={v.moodAvg == null ? '—' : `${v.moodAvg.toFixed(1)} / 5`} />
          <Stat label="Spent" value={money(v.spent, cur)} sub={v.prevSpent ? `${v.spent > v.prevSpent ? '▲' : '▼'} ${money(Math.abs(v.spent - v.prevSpent), cur)} vs week before` : undefined} />
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="card p-5">
            <h2 className="mb-3 font-semibold">What you did</h2>
            {v.done.length === 0 && v.byWhat.length === 0 && <p className="text-sm text-muted">Nothing logged this week yet.</p>}
            {v.byWhat.length > 0 && (
              <ul className="mb-4 flex flex-col gap-1.5 text-sm">
                {v.byWhat.slice(0, 6).map((b) => (
                  <li key={b.label} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 truncate">{b.label}</span>
                    <span className="h-2 rounded-r" style={{ width: `${(b.min / maxMin) * 60}%`, background: b.color, minWidth: 4 }} />
                    <span className="text-xs text-muted tabular-nums">{hm(b.min)}</span>
                  </li>
                ))}
              </ul>
            )}
            {v.done.length > 0 && (
              <ul className="flex flex-col gap-1 text-sm">
                {v.done.slice(0, 10).map((t) => (
                  <li key={t.id} className="flex gap-2">
                    <span className="text-ok">✓</span>
                    <span className="truncate">{t.title}</span>
                  </li>
                ))}
                {v.done.length > 10 && <li className="text-xs text-muted">and {v.done.length - 10} more</li>}
              </ul>
            )}
            {v.highlights.length > 0 && (
              <div className="mt-4 border-t border-line pt-3">
                <div className="label-caps mb-1 text-[10px] text-muted">Highlights</div>
                <ul className="flex flex-col gap-1 text-sm">
                  {v.highlights.map((h) => (
                    <li key={h.day}>
                      <span className="text-muted">{fmtDay(h.day, { weekday: 'short' })}</span> · {h.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="card p-5">
            <h2 className="mb-2 font-semibold">How you felt</h2>
            {v.moods.some((m) => m != null) || v.energies.some((m) => m != null) ? (
              <table className="w-full table-fixed text-center text-xs">
                <thead className="text-muted">
                  <tr>
                    <th className="w-14" />
                    {v.days.map((d) => (
                      <th key={d} className="pb-1 font-normal">
                        {fmtDay(d, { weekday: 'short' })}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="text-left text-muted">Mood</td>
                    {v.moods.map((m, i) => (
                      <td key={i} className="text-lg" title={m ? `${MOODS[m - 1].label} (${m}/5)` : 'No check-in'}>
                        {m ? MOODS[m - 1].emoji : <span className="text-muted">·</span>}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="text-left text-muted">Energy</td>
                    {v.energies.map((e, i) => (
                      <td key={i} title={e ? `${e}/5` : 'No check-in'}>
                        <div className="mx-auto flex h-5 w-3 items-end rounded-sm bg-line/60">
                          {e ? <div className="w-full rounded-sm" style={{ height: `${e * 20}%`, background: 'var(--chart-2)' }} /> : null}
                        </div>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="pt-1 text-left text-muted">Sleep</td>
                    {v.sleeps.map((s, i) => (
                      <td key={i} className="pt-1 tabular-nums">
                        {s != null ? `${s}h` : <span className="text-muted">·</span>}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-muted">No check-ins this week. The daily check-in on Home takes 20 seconds.</p>
            )}
            {v.habitRows.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1 border-t border-line pt-3 text-sm">
                {v.habitRows.map((r) => (
                  <li key={r.h.id} className="flex items-center gap-2">
                    <span>{r.h.emoji}</span>
                    <span className="flex-1 truncate">{r.h.name}</span>
                    <span className={`text-xs tabular-nums ${r.hit ? 'text-ok' : 'text-muted'}`}>
                      {r.n}/{r.h.days_per_week}
                      {r.hit ? ' ✓' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {v.topCats.length > 0 && (
              <div className="mt-3 border-t border-line pt-3 text-sm">
                <div className="label-caps mb-1 text-[10px] text-muted">Where the money went</div>
                {v.topCats.map(([c, n]) => (
                  <div key={c} className="flex justify-between">
                    <span>{c}</span>
                    <span className="tabular-nums">{money(n, cur)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="card p-5">
          <h2 className="mb-3 font-semibold">
            Coming up · {fmtDay(nextFrom)} – {fmtDay(nextTo)}
          </h2>
          {v.dueNext.length + v.assessNext.length + v.eventsNext.length + v.plansNext.length + v.occasions.length === 0 ? (
            <p className="text-sm text-muted">Nothing scheduled yet — a calm week.</p>
          ) : (
            <ul className="grid gap-x-6 gap-y-1.5 text-sm md:grid-cols-2">
              {v.assessNext.map((a) => (
                <Item key={a.id} icon="📝" day={dayOfIso(a.due_at!)} text={`${a.title}${v.modules.find((m) => m.id === a.module_id) ? ` · ${v.modules.find((m) => m.id === a.module_id)!.code}` : ''}`} strong />
              ))}
              {v.occasions.map((o) => (
                <Item key={`${o.person.id}${o.kind}`} icon="🎁" day={o.date} text={`${o.person.name.split(' ')[0]}’s ${o.kind}${o.ideas.length ? ` — ideas: ${o.ideas.slice(0, 2).join(', ')}` : ''}`} strong />
              ))}
              {v.eventsNext.slice(0, 10).map((e) => (
                <Item key={e.id} icon="📅" day={dayOfIso(e.start_at)} text={e.title} />
              ))}
              {v.plansNext.map((p) => (
                <Item key={p.id} icon="💛" day={p.date!} text={p.title} />
              ))}
              {v.dueNext.slice(0, 12).map((t) => (
                <Item key={t.id} icon="☐" day={dayOfIso(t.due_at!)} text={t.title} />
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h2 className="mr-auto font-semibold">Your reflection</h2>
            <span className="text-sm text-muted">How was the week?</span>
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} className={`text-xl ${(review?.rating ?? 0) >= n ? '' : 'opacity-25 grayscale'}`} onClick={() => void saveReview({ rating: n })} aria-label={`${n} of 5`}>
                  ⭐
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {(
              [
                ['wins', 'Wins', 'What went well? What are you proud of?'],
                ['lessons', 'What got in the way', 'What would you do differently?'],
                ['next_focus', 'Focus for next week', 'One to three things that matter most.']
              ] as const
            ).map(([k, label, ph]) => (
              <label key={k} className="flex flex-col gap-1 text-sm">
                <span className="font-medium">{label}</span>
                <AutoText key={`${week}-${k}`} multiline rows={4} value={review?.[k] ?? ''} onSave={(val) => void saveReview({ [k]: val })} placeholder={ph} className="field-boxed text-sm" />
              </label>
            ))}
          </div>
          <div className="mt-3 flex justify-end">
            <button className="btn-ghost text-xs" onClick={() => navigate({ name: 'trends' })}>
              See longer trends →
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }): React.JSX.Element {
  return (
    <div className="card p-4">
      <div className="label-caps text-[10px] text-muted">{label}</div>
      <div className="mt-1 text-xl tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted">{sub}</div>}
    </div>
  )
}

function Item({ icon, day, text, strong }: { icon: string; day: string; text: string; strong?: boolean }): React.JSX.Element {
  return (
    <li className="flex min-w-0 gap-2">
      <span className="w-5 shrink-0 text-center">{icon}</span>
      <span className="w-20 shrink-0 text-muted">{fmtDay(day, { weekday: 'short', day: 'numeric' })}</span>
      <span className={`truncate ${strong ? 'font-medium' : ''}`}>{text}</span>
    </li>
  )
}
