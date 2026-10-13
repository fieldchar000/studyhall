// A module's numbers: focus time, active recall (how much, how well, which weeks are weak),
// tasks and materials. The strip shows the headline numbers above the tabs; the tab has detail.

import type { FocusSession, Material, Note, RecallCard, Task, Week } from '@shared/types'
import { api, useLive } from '@/lib/data'
import { addDays, localDate } from '@/lib/dates'

interface ModuleStats {
  focusWeek: number // seconds
  focusTotal: number
  focusByWeek: { label: string; seconds: number }[] // last 10 weeks
  reviewsTotal: number
  reviewedCards: number
  cards: number
  mastered: number
  due: number
  got: number
  partly: number
  missed: number
  reviewsByDay: { day: string; n: number }[] // last 14 days (cards last reviewed that day)
  weeks: { week: Week | null; cards: number; strength: number; seen: number }[]
  tasksOpen: number
  tasksDone: number
  notes: number
  worksheets: number
}

const mondayOf = (d: Date): Date => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

export function useModuleStats(moduleId: string): ModuleStats | undefined {
  return useLive(
    ['focus_sessions', 'recall_cards', 'tasks', 'materials', 'notes', 'weeks'],
    async (): Promise<ModuleStats> => {
      const [sessions, cards, tasks, files, notes, weeks] = await Promise.all([
        api.list('focus_sessions', { module_id: moduleId }) as Promise<FocusSession[]>,
        api.list('recall_cards', { module_id: moduleId }) as Promise<RecallCard[]>,
        api.list('tasks', { module_id: moduleId }) as Promise<Task[]>,
        api.list('materials', { module_id: moduleId }) as Promise<Material[]>,
        api.list('notes', { module_id: moduleId }) as Promise<Note[]>,
        api.list('weeks', { module_id: moduleId }) as Promise<Week[]>
      ])
      const now = new Date()
      const thisMonday = mondayOf(now)
      const focusByWeek = Array.from({ length: 10 }, (_, i) => {
        const start = new Date(thisMonday)
        start.setDate(start.getDate() - (9 - i) * 7)
        const end = new Date(start)
        end.setDate(end.getDate() + 7)
        const seconds = sessions.filter((s) => new Date(s.started_at) >= start && new Date(s.started_at) < end).reduce((n, s) => n + s.focused_seconds, 0)
        return { label: start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), seconds }
      })
      const today = localDate(now)
      const reviewsByDay = Array.from({ length: 14 }, (_, i) => {
        const day = addDays(today, i - 13)
        return { day, n: cards.filter((c) => c.last_reviewed_at && localDate(new Date(c.last_reviewed_at)) === day).length }
      })
      // Which week each card's page comes from.
      const weekOfSource = new Map<string, string | null>([...files.map((f) => [f.id, f.week_id] as const), ...notes.map((n) => [n.id, n.week_id] as const)])
      const byWeek = new Map<string, RecallCard[]>()
      for (const c of cards) {
        const w = weekOfSource.get(c.source_id) ?? null
        const k = w && weeks.some((x) => x.id === w) ? w : 'none'
        byWeek.set(k, [...(byWeek.get(k) ?? []), c])
      }
      const weekRows = [...weeks]
        .sort((a, b) => a.number - b.number)
        .map((w) => ({ week: w as Week | null, list: byWeek.get(w.id) ?? [] }))
        .concat(byWeek.get('none') ? [{ week: null, list: byWeek.get('none')! }] : [])
        .filter((r) => r.list.length)
        .map((r) => ({
          week: r.week,
          cards: r.list.length,
          seen: r.list.filter((c) => c.reviews > 0).length,
          strength: r.list.reduce((n, c) => n + c.box, 0) / (r.list.length * 5)
        }))
      const all = [...files, ...notes]
      return {
        focusWeek: sessions.filter((s) => new Date(s.started_at) >= thisMonday).reduce((n, s) => n + s.focused_seconds, 0),
        focusTotal: sessions.reduce((n, s) => n + s.focused_seconds, 0),
        focusByWeek,
        reviewsTotal: cards.reduce((n, c) => n + c.reviews, 0),
        reviewedCards: cards.filter((c) => c.reviews > 0).length,
        cards: cards.length,
        mastered: cards.filter((c) => c.box >= 4).length,
        due: cards.filter((c) => c.due_on && c.due_on <= today).length,
        got: cards.filter((c) => c.last_result === 'got').length,
        partly: cards.filter((c) => c.last_result === 'partly').length,
        missed: cards.filter((c) => c.last_result === 'missed').length,
        reviewsByDay,
        weeks: weekRows,
        tasksOpen: tasks.filter((t) => t.status !== 'done' && !t.parent_task_id).length,
        tasksDone: tasks.filter((t) => t.status === 'done' && !t.parent_task_id).length,
        notes: all.filter((x) => x.category !== 'worksheet').length,
        worksheets: all.filter((x) => x.category === 'worksheet').length
      }
    },
    [moduleId]
  ).data
}

export const hm = (s: number): string => {
  const m = Math.round(s / 60)
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`
}
const pct = (a: number, b: number): string => (b ? `${Math.round((a / b) * 100)}%` : '—')

/** Headline numbers above the module's tabs. */
export function ModuleStatStrip({ moduleId, onMore }: { moduleId: string; onMore: () => void }): React.JSX.Element | null {
  const s = useModuleStats(moduleId)
  if (!s) return null
  const results = s.got + s.partly + s.missed
  const tiles: [string, string, string][] = [
    ['Focus this week', hm(s.focusWeek), `${hm(s.focusTotal)} in total`],
    ['Active recall', `${s.reviewsTotal}`, `${s.reviewedCards} pages reviewed`],
    ['Remembered', pct(s.got, results), results ? `${s.partly} partly · ${s.missed} missed` : 'no reviews yet'],
    ['Mastered', `${s.mastered}/${s.cards}`, `${s.due} due now`],
    ['Tasks', `${s.tasksOpen} open`, `${s.tasksDone} done`]
  ]
  return (
    <button className="mb-5 grid w-full grid-cols-2 gap-3 text-left sm:grid-cols-3 lg:grid-cols-5" onClick={onMore} title="See all stats">
      {tiles.map(([label, value, sub]) => (
        <div key={label} className="card px-4 py-3">
          <div className="label-caps">{label}</div>
          <div className="font-display text-2xl leading-tight font-semibold tabular-nums">{value}</div>
          <div className="text-[11px] text-muted">{sub}</div>
        </div>
      ))}
    </button>
  )
}

function Bars({ data, format, height = 110 }: { data: { label: string; value: number }[]; format: (v: number) => string; height?: number }): React.JSX.Element {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="flex items-end gap-1.5" style={{ height: height + 34 }}>
      {data.map((d, i) => (
        <div key={i} className="group flex flex-1 flex-col items-center justify-end gap-1">
          <span className="text-[10px] text-muted tabular-nums opacity-0 group-hover:opacity-100">{d.value ? format(d.value) : ''}</span>
          <div
            className={`w-full rounded-t-sm transition-colors ${i === data.length - 1 ? 'bg-accent' : 'bg-accent/45 group-hover:bg-accent/70'}`}
            style={{ height: Math.max(2, (d.value / max) * height) }}
          />
          <span className="w-full truncate text-center text-[9.5px] text-muted">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

export function StatsTab({ moduleId }: { moduleId: string }): React.JSX.Element {
  const s = useModuleStats(moduleId)
  if (!s) return <div />
  const results = s.got + s.partly + s.missed
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="card p-5">
        <h3 className="text-xl">Focus time</h3>
        <p className="mb-3 text-xs text-muted">Per week, the last 10 weeks · {hm(s.focusTotal)} in total</p>
        <Bars data={s.focusByWeek.map((w) => ({ label: w.label, value: w.seconds }))} format={hm} />
      </section>
      <section className="card p-5">
        <h3 className="text-xl">Active recall</h3>
        <p className="mb-3 text-xs text-muted">Pages reviewed per day, the last 14 days</p>
        <Bars data={s.reviewsByDay.map((d, i) => { const t = new Date(d.day + 'T00:00'); return { label: t.toLocaleDateString(undefined, i === 0 || t.getDate() === 1 ? { day: 'numeric', month: 'short' } : { day: 'numeric' }), value: d.n } })} format={(v) => String(v)} />
        {results > 0 && (
          <div className="mt-4">
            <div className="flex h-2.5 overflow-hidden rounded-full">
              <div className="bg-ok" style={{ width: `${(s.got / results) * 100}%` }} />
              <div className="bg-brass" style={{ width: `${(s.partly / results) * 100}%` }} />
              <div className="bg-danger" style={{ width: `${(s.missed / results) * 100}%` }} />
            </div>
            <div className="mt-1.5 flex gap-4 text-xs text-muted">
              <span>● Got it {s.got}</span>
              <span>● Partly {s.partly}</span>
              <span>● Missed {s.missed}</span>
            </div>
          </div>
        )}
      </section>
      <section className="card p-5 lg:col-span-2">
        <h3 className="text-xl">How well you know each week</h3>
        <p className="mb-3 text-xs text-muted">Strength grows each time you remember a page; missed pages pull it down. Start with the weakest weeks.</p>
        {s.weeks.length === 0 ? (
          <p className="text-sm text-muted">No active recall yet for this module.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {[...s.weeks]
              .sort((a, b) => a.strength - b.strength)
              .map((w) => (
                <div key={w.week?.id ?? 'none'} className="flex items-center gap-3 text-sm">
                  <span className="w-40 shrink-0 truncate">{w.week ? `Week ${w.week.number}${w.week.title ? ` · ${w.week.title}` : ''}` : 'Not in a week'}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(3, w.strength * 100)}%`, background: w.strength < 0.3 ? 'var(--color-danger)' : w.strength < 0.6 ? 'var(--color-brass)' : 'var(--color-ok)' }} />
                  </div>
                  <span className="w-28 shrink-0 text-right text-xs text-muted tabular-nums">
                    {w.seen}/{w.cards} pages seen
                  </span>
                </div>
              ))}
          </div>
        )}
      </section>
      <section className="card p-5">
        <h3 className="text-xl">Materials</h3>
        <div className="mt-2 grid grid-cols-2 gap-3 text-center">
          <div>
            <div className="font-display text-3xl font-semibold">{s.notes}</div>
            <div className="text-xs text-muted">notes</div>
          </div>
          <div>
            <div className="font-display text-3xl font-semibold">{s.worksheets}</div>
            <div className="text-xs text-muted">worksheets</div>
          </div>
        </div>
      </section>
      <section className="card p-5">
        <h3 className="text-xl">Tasks</h3>
        <div className="mt-2 grid grid-cols-2 gap-3 text-center">
          <div>
            <div className="font-display text-3xl font-semibold">{s.tasksOpen}</div>
            <div className="text-xs text-muted">open</div>
          </div>
          <div>
            <div className="font-display text-3xl font-semibold">{s.tasksDone}</div>
            <div className="text-xs text-muted">done</div>
          </div>
        </div>
      </section>
    </div>
  )
}
