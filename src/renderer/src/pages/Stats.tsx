// Study stats from focus sessions: time per day, per module/project, streaks.

import { useState } from 'react'
import type { FocusSession } from '@shared/types'
import { api, useLive } from '@/lib/data'
import { addDays, localDate } from '@/lib/dates'
import { useMode } from '@/lib/profile'

const RANGES = [7, 30, 90]

const fmtHours = (min: number): string => (min < 60 ? `${Math.round(min)}m` : `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`)

/** Days (YYYY-MM-DD) with at least one minute of focus. */
function focusDays(sessions: FocusSession[]): Set<string> {
  return new Set(sessions.filter((s) => s.focused_seconds >= 60).map((s) => localDate(new Date(s.started_at))))
}

function streaks(days: Set<string>): { current: number; longest: number } {
  // Current: counts back from today (or yesterday, so an unfinished today doesn't break it).
  let day = localDate(new Date())
  if (!days.has(day)) day = addDays(day, -1)
  let current = 0
  while (days.has(day)) {
    current++
    day = addDays(day, -1)
  }
  let longest = 0
  let run = 0
  let prev: string | null = null
  for (const d of [...days].sort()) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1
    longest = Math.max(longest, run)
    prev = d
  }
  return { current, longest }
}

export function StatsPage(): React.JSX.Element {
  const mode = useMode()
  const [range, setRange] = useState(30)
  const { data } = useLive(
    ['focus_sessions', 'tasks', 'modules', 'projects', 'languages'],
    async () => {
      const [sessions, tasks, modules, projects, languages] = await Promise.all([
        api.list('focus_sessions', {}, 'started_at'),
        api.list('tasks', { mode }),
        api.list('modules'),
        api.list('projects', { mode }),
        api.list('languages')
      ])
      return { sessions: sessions.filter((s) => (s.mode ?? 'study') === mode && s.focused_seconds > 0), tasks, modules, projects, languages }
    },
    [mode]
  )
  if (!data) return <div />

  const today = localDate(new Date())
  const from = addDays(today, -(range - 1))
  const inRange = data.sessions.filter((s) => localDate(new Date(s.started_at)) >= from)
  const totalMin = inRange.reduce((m, s) => m + s.focused_seconds / 60, 0)
  const completed = inRange.filter((s) => s.completed).length
  const tasksDone = data.tasks.filter((t) => t.completed_at && localDate(new Date(t.completed_at)) >= from).length
  const { current, longest } = streaks(focusDays(data.sessions))

  // Minutes per day across the range
  const perDay = new Map<string, number>()
  for (let i = 0; i < range; i++) perDay.set(addDays(from, i), 0)
  for (const s of inRange) {
    const d = localDate(new Date(s.started_at))
    perDay.set(d, (perDay.get(d) ?? 0) + s.focused_seconds / 60)
  }

  // Minutes per module (study) or project (work)
  const groups =
    mode === 'study'
      ? data.modules.map((m) => ({ id: m.id, label: m.code ? `${m.code} · ${m.name}` : m.name, color: m.color }))
      : mode === 'life'
        ? data.languages.map((l) => ({ id: l.id, label: l.name, color: l.color }))
        : data.projects.map((p) => ({ id: p.id, label: p.title, color: p.color }))
  const perGroup = new Map<string, number>()
  for (const s of inRange) {
    const key = (mode === 'study' ? s.module_id : mode === 'life' ? s.language_id : s.project_id) ?? 'none'
    perGroup.set(key, (perGroup.get(key) ?? 0) + s.focused_seconds / 60)
  }
  const groupRows = [...perGroup.entries()]
    .map(([id, min]) => {
      const g = groups.find((x) => x.id === id)
      return { id, min, label: g?.label ?? (mode === 'study' ? 'No module' : mode === 'life' ? 'Other' : 'No project'), color: g?.color ?? 'var(--color-muted)' }
    })
    .sort((a, b) => b.min - a.min)

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-8">
      <div className="flex items-center gap-3">
        <h1 className="flex-1 text-2xl font-semibold tracking-tight">Stats</h1>
        <div className="flex gap-1 rounded-lg bg-line/50 p-0.5">
          {RANGES.map((r) => (
            <button key={r} onClick={() => setRange(r)} className={`rounded-md px-3 py-1 text-sm ${range === r ? 'bg-panel font-medium shadow-sm' : 'text-muted'}`}>
              {r} days
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3">
        <Tile label="Focused" value={fmtHours(totalMin)} hint={`avg ${fmtHours(totalMin / range)} / day`} />
        <Tile label="Sessions completed" value={String(completed)} hint={`${inRange.length} started`} />
        <Tile label="Current streak" value={`${current} ${current === 1 ? 'day' : 'days'}`} hint={current ? 'keep it going 🔥' : 'focus today to start one'} />
        <Tile label="Longest streak" value={`${longest} ${longest === 1 ? 'day' : 'days'}`} hint="days in a row with focus" />
        <Tile label="Tasks done" value={String(tasksDone)} hint={`in the last ${range} days`} />
      </div>

      <section className="card p-5">
        <h2 className="mb-4 text-sm font-semibold">Focus time per day</h2>
        <DailyBars data={[...perDay.entries()]} />
      </section>

      <section className="card p-5">
        <h2 className="mb-4 text-sm font-semibold">Focus time per {mode === 'study' ? 'module' : mode === 'life' ? 'language' : 'project'}</h2>
        {groupRows.length === 0 ? (
          <div className="text-sm text-muted">No focus sessions in this period yet — start one in the Focus room.</div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {groupRows.map((g) => (
              <div key={g.id} className="grid grid-cols-[12rem_1fr_4.5rem] items-center gap-3 text-sm" title={`${g.label}: ${fmtHours(g.min)}`}>
                <span className="flex items-center gap-2 truncate">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: g.color }} />
                  <span className="truncate">{g.label}</span>
                </span>
                <div className="h-3 rounded-r-[4px] bg-transparent">
                  <div className="h-full rounded-r-[4px]" style={{ width: `${Math.max(1, (g.min / groupRows[0].min) * 100)}%`, background: g.color }} />
                </div>
                <span className="text-right text-muted tabular-nums">{fmtHours(g.min)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

/** Vertical bars, one per day, with a hover tooltip and a recessive scale. */
function DailyBars({ data }: { data: [string, number][] }): React.JSX.Element {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(30, ...data.map(([, m]) => m))
  const niceMax = Math.ceil(max / 30) * 30 // round up to the next half hour
  const H = 160
  const labelEvery = data.length <= 7 ? 1 : data.length <= 30 ? 5 : 15
  return (
    <div className="relative">
      <div className="flex">
        {/* y-axis: 0 and max only, recessive */}
        <div className="flex w-12 shrink-0 flex-col justify-between pr-2 text-right text-[10px] text-muted" style={{ height: H }}>
          <span>{fmtHours(niceMax)}</span>
          <span>{fmtHours(niceMax / 2)}</span>
          <span>0</span>
        </div>
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-line" />
          <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-line" style={{ top: H / 2 }} />
          <div className="flex items-end gap-[2px] border-b border-line" style={{ height: H }}>
            {data.map(([day, min], i) => (
              <div
                key={day}
                className="flex h-full flex-1 items-end"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <div
                  className={`w-full rounded-t-[4px] transition-opacity ${hover !== null && hover !== i ? 'opacity-50' : ''}`}
                  style={{ height: `${(min / niceMax) * 100}%`, minHeight: min > 0 ? 2 : 0, background: 'var(--color-accent)' }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-[2px] text-[10px] text-muted">
            {data.map(([day], i) => (
              <span key={day} className="flex-1 text-center whitespace-nowrap">
                {i % labelEvery === 0 ? new Date(`${day}T12:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''}
              </span>
            ))}
          </div>
          {hover !== null && (
            <div
              className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-md border border-line bg-panel px-2 py-1 text-xs whitespace-nowrap shadow-lg"
              style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}
            >
              <div className="text-muted">{new Date(`${data[hover][0]}T12:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
              <div className="font-semibold">{fmtHours(data[hover][1])}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }): React.JSX.Element {
  return (
    <div className="card p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      <div className="mt-0.5 text-[11px] text-muted">{hint}</div>
    </div>
  )
}
