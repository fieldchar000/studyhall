// Life → Habits: tick things off each day. A habit can be daily or "N days a week"
// (realistic targets keep streaks alive). Checking one off also earns Pixel Quest gems.

import { useMemo, useState } from 'react'
import type { Habit, HabitCheck } from '@shared/types'
import { AutoText } from '@/components/AutoField'
import { Icon } from '@/components/ui'
import { api, db, useLive } from '@/lib/data'
import { addDays, localDate } from '@/lib/dates'
import { navigate } from '@/lib/nav'
import { Heatmap } from './Languages'

const SUGGESTIONS: Pick<Habit, 'name' | 'emoji' | 'color' | 'days_per_week'>[] = [
  { name: 'Read 20 minutes', emoji: '📚', color: '#6366f1', days_per_week: 7 },
  { name: 'Exercise', emoji: '🏃', color: '#ef4444', days_per_week: 3 },
  { name: 'Meditate', emoji: '🧘', color: '#14b8a6', days_per_week: 7 },
  { name: 'Drink 2L of water', emoji: '💧', color: '#0ea5e9', days_per_week: 7 },
  { name: 'Asleep by 11pm', emoji: '😴', color: '#8b5cf6', days_per_week: 5 },
  { name: 'Practice a language', emoji: '🗣️', color: '#f59e0b', days_per_week: 7 },
  { name: 'No phone in bed', emoji: '📵', color: '#64748b', days_per_week: 7 },
  { name: 'Cook a meal', emoji: '🍳', color: '#f97316', days_per_week: 3 },
  { name: 'Journal', emoji: '✍️', color: '#ec4899', days_per_week: 5 },
  { name: 'Call family or a friend', emoji: '📞', color: '#10b981', days_per_week: 2 }
]

const EMOJIS = ['✅', '📚', '🏃', '🧘', '💧', '😴', '🗣️', '📵', '🍳', '✍️', '📞', '🎸', '🧹', '💪', '🚶', '🥗', '🌱', '🎨', '💊', '🙏']

const mondayOf = (date: string): string => {
  const [y, m, d] = date.split('-').map(Number)
  const dow = (new Date(y, m - 1, d).getDay() + 6) % 7
  return addDays(date, -dow)
}

export interface HabitStat {
  done: Set<string>
  weekCount: number
  streak: number
  unit: 'day' | 'week'
}

/** Daily habits: days in a row. N-per-week habits: weeks in a row that hit N. */
export function habitStat(h: Habit, checks: HabitCheck[]): HabitStat {
  const done = new Set(checks.filter((c) => c.habit_id === h.id).map((c) => c.date))
  const today = localDate(new Date())
  const monday = mondayOf(today)
  let weekCount = 0
  for (let i = 0; i < 7; i++) if (done.has(addDays(monday, i))) weekCount++
  let streak = 0
  if (h.days_per_week >= 7) {
    let day = done.has(today) ? today : addDays(today, -1)
    while (done.has(day)) {
      streak++
      day = addDays(day, -1)
    }
    return { done, weekCount, streak, unit: 'day' }
  }
  if (weekCount >= h.days_per_week) streak++ // this week already counts once it's met
  let wk = addDays(monday, -7)
  for (;;) {
    let n = 0
    for (let i = 0; i < 7; i++) if (done.has(addDays(wk, i))) n++
    if (n < h.days_per_week) break
    streak++
    wk = addDays(wk, -7)
  }
  return { done, weekCount, streak, unit: 'week' }
}

export async function toggleHabit(h: Habit, date: string, checks: HabitCheck[]): Promise<void> {
  const existing = checks.find((c) => c.habit_id === h.id && c.date === date)
  if (existing) await db.remove('habit_checks', existing.id)
  else await db.create('habit_checks', { habit_id: h.id, date })
}

export function useHabits(): { habits: Habit[]; checks: HabitCheck[] } | undefined {
  return useLive(
    ['habits', 'habit_checks'],
    async () => {
      const [habits, checks] = await Promise.all([api.list('habits', { archived: 0 }, 'sort'), api.list('habit_checks')])
      return { habits, checks }
    },
    []
  ).data
}

export function HabitsPage(): React.JSX.Element {
  const data = useHabits()
  const [adding, setAdding] = useState(false)
  const today = localDate(new Date())
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)), [today])
  if (!data) return <div />

  const add = async (s: Partial<Habit>): Promise<void> => {
    await db.create('habits', { ...s, sort: data.habits.length })
    setAdding(false)
  }
  const doneToday = data.habits.filter((h) => data.checks.some((c) => c.habit_id === h.id && c.date === today)).length

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Habits</h1>
        {data.habits.length > 0 && (
          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-sm text-accent">
            {doneToday}/{data.habits.length} today
          </span>
        )}
        <div className="flex-1" />
        <button className="btn-primary" onClick={() => setAdding((v) => !v)}>
          <Icon name="plus" /> New habit
        </button>
      </div>

      {(adding || data.habits.length === 0) && (
        <section className="card mb-5 p-5">
          <h2 className="mb-1 text-sm font-semibold">{data.habits.length ? 'Add a habit' : 'Start with one or two habits'}</h2>
          <p className="mb-3 text-sm text-muted">Small and specific works best. You can rename any of these.</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.filter((s) => !data.habits.some((h) => h.name === s.name)).map((s) => (
              <button key={s.name} className="btn" onClick={() => void add(s)}>
                {s.emoji} {s.name}
                {s.days_per_week < 7 && <span className="text-xs text-muted">{s.days_per_week}×/wk</span>}
              </button>
            ))}
            <button className="btn text-accent" onClick={() => void add({ name: 'New habit', emoji: '✅' })}>
              <Icon name="plus" /> Custom
            </button>
          </div>
        </section>
      )}

      {data.habits.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-4 py-2 text-left font-medium">Habit</th>
                {days.map((d) => {
                  const dt = new Date(d + 'T00:00')
                  return (
                    <th key={d} className={`w-11 py-2 text-center font-medium ${d === today ? 'text-accent' : ''}`}>
                      {dt.toLocaleDateString(undefined, { weekday: 'narrow' })}
                      <div className="text-[10px] font-normal">{dt.getDate()}</div>
                    </th>
                  )
                })}
                <th className="px-3 py-2 text-left font-medium">This week</th>
                <th className="px-3 py-2 text-left font-medium">Streak</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.habits.map((h) => (
                <HabitRow key={h.id} h={h} days={days} checks={data.checks} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.habits.length > 0 && (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {data.habits.map((h) => {
            const s = habitStat(h, data.checks)
            return (
              <div key={h.id} className="card flex flex-col gap-3 p-4">
                <div className="text-sm font-medium">
                  {h.emoji} {h.name}
                </div>
                <Heatmap byDay={new Map([...s.done].map((d) => [d, 1]))} goal={1} color={h.color} />
              </div>
            )
          })}
        </div>
      )}
      <p className="mt-4 text-xs text-muted">
        Each habit ticked off earns 💎 10 in{' '}
        <button className="underline" onClick={() => navigate({ name: 'game' })}>
          Pixel Quest
        </button>
        .
      </p>
    </div>
  )
}

function HabitRow({ h, days, checks }: { h: Habit; days: string[]; checks: HabitCheck[] }): React.JSX.Element {
  const s = habitStat(h, checks)
  const [menu, setMenu] = useState(false)
  const save = (p: Partial<Habit>): Promise<Habit> => db.update('habits', h.id, p)
  return (
    <tr className="group border-b border-line last:border-0">
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <select className="w-9 appearance-none bg-transparent text-center text-lg" value={h.emoji} onChange={(e) => void save({ emoji: e.target.value })} title="Icon">
            {[...new Set([h.emoji, ...EMOJIS])].map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
          <div className="min-w-0 flex-1">
            <AutoText value={h.name} onSave={(v) => save({ name: v.trim() || 'Habit' })} className="field py-0.5 font-medium" />
            <select className="ml-2 bg-transparent text-xs text-muted" value={h.days_per_week} onChange={(e) => void save({ days_per_week: Number(e.target.value) })}>
              <option value={7}>Every day</option>
              {[6, 5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n}× a week
                </option>
              ))}
            </select>
          </div>
        </div>
      </td>
      {days.map((d) => {
        const on = s.done.has(d)
        return (
          <td key={d} className="py-2 text-center">
            <button
              onClick={() => void toggleHabit(h, d, checks)}
              className={`h-8 w-8 rounded-lg border-2 transition-transform active:scale-90 ${on ? 'border-transparent text-white' : 'border-line hover:border-muted'}`}
              style={on ? { background: h.color } : undefined}
              title={on ? 'Done — click to undo' : 'Mark done'}
            >
              {on ? '✓' : ''}
            </button>
          </td>
        )
      })}
      <td className="px-3 py-2">
        <span className={s.weekCount >= h.days_per_week ? 'font-medium text-ok' : ''}>
          {s.weekCount}/{h.days_per_week}
        </span>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        🔥 {s.streak} {s.unit === 'day' ? (s.streak === 1 ? 'day' : 'days') : s.streak === 1 ? 'week' : 'weeks'}
      </td>
      <td className="relative pr-3">
        <button className="btn-ghost invisible px-1 group-hover:visible" onClick={() => setMenu((v) => !v)} title="More">
          •••
        </button>
        {menu && (
          <div className="card absolute right-2 z-20 mt-1 flex w-44 flex-col p-1 text-sm shadow-xl" onMouseLeave={() => setMenu(false)}>
            <div className="flex flex-wrap gap-1 p-1">
              {['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#64748b'].map((c) => (
                <button key={c} className="h-5 w-5 rounded-full" style={{ background: c }} onClick={() => void save({ color: c })} />
              ))}
            </div>
            <button className="rounded-md px-2 py-1.5 text-left hover:bg-canvas" onClick={() => void save({ archived: 1 })}>
              Archive
            </button>
            <button
              className="rounded-md px-2 py-1.5 text-left text-danger hover:bg-canvas"
              onClick={() => confirm(`Delete “${h.name}” and its history?`) && void db.remove('habits', h.id)}
            >
              Delete
            </button>
          </div>
        )}
      </td>
    </tr>
  )
}

/** Home (Life mode): today's habits and language goals at a glance. */
export function LifeTodayCard(): React.JSX.Element | null {
  const data = useHabits()
  const langs = useLive(['languages'], () => api.list('languages', { active: 1 }, 'sort'), []).data
  const today = localDate(new Date())
  if (!data) return null
  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center gap-2">
        <Icon name="flame" className="text-amber-500" />
        <h2 className="flex-1 font-semibold">Today</h2>
        <button className="text-xs text-muted hover:text-ink" onClick={() => navigate({ name: 'habits' })}>
          Habits →
        </button>
      </div>
      {data.habits.length === 0 ? (
        <button className="text-sm text-accent" onClick={() => navigate({ name: 'habits' })}>
          + Add a habit to track
        </button>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {data.habits.map((h) => {
            const on = data.checks.some((c) => c.habit_id === h.id && c.date === today)
            return (
              <li key={h.id}>
                <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                  <input type="checkbox" checked={on} onChange={() => void toggleHabit(h, today, data.checks)} />
                  <span>{h.emoji}</span>
                  <span className={on ? 'text-muted line-through' : ''}>{h.name}</span>
                </label>
              </li>
            )
          })}
        </ul>
      )}
      {!!langs?.length && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
          {langs.map((l) => (
            <button
              key={l.id}
              className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs hover:bg-canvas"
              onClick={() => navigate({ name: 'language', id: l.id })}
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: l.color }} />
              {l.name}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
