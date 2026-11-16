// Exam countdowns and the revision planner: every upcoming exam's topics spread across the
// weeks before it (first pass, spaced review, past paper, final review), previewed week by
// week, then added to Tasks with the "revision" label.

import { useMemo, useState } from 'react'
import type { Assessment, Task } from '@shared/types'
import { api, notifyChanged, track, useLive } from '@/lib/data'
import { addDays, localDate } from '@/lib/dates'
import { useMode } from '@/lib/profile'
import { planRevision, unplanned, type PlanExam, type PlanSession } from '@/lib/revisionPlan'
import { createTask, parseLabels } from '@/lib/tasks'
import { Icon, Modal } from './ui'

const DAY = 864e5

export const daysUntil = (iso: string): number => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(iso)
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / DAY)
}

const isRevision = (t: Task): boolean => !!t.assessment_id && parseLabels(t).includes('revision')
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const KIND_ICON: Record<PlanSession['kind'], string> = { learn: '📖', review: '🧠', paper: '📝', final: '🎯', extra: '➕' }

// Remembered between visits (this device only).
const loadOpts = (): { perWeek: number; restDay: number | null } => {
  try {
    return { perWeek: 8, restDay: 0, ...(JSON.parse(localStorage.getItem('revision-plan') ?? '{}') as object) }
  } catch {
    return { perWeek: 8, restDay: 0 }
  }
}

/** Upcoming exams (yours, not friends' shared modules) with their modules' topics. */
async function loadExams(): Promise<PlanExam[]> {
  const [exams, modules, weeks, me] = await Promise.all([api.list('assessments', { kind: 'exam' }, 'due_at'), api.list('modules'), api.list('weeks', {}, 'number'), api.profile.get()])
  const today = localDate(new Date())
  return exams
    .filter((e) => e.due_at && localDate(new Date(e.due_at)) > today && e.score_pct == null)
    .map((e) => {
      const m = modules.find((x) => x.id === e.module_id && x.owner_id === me.id && !x.archived)
      if (!m) return null
      return {
        id: e.id,
        title: e.title,
        date: localDate(new Date(e.due_at!)),
        moduleId: m.id,
        moduleLabel: m.code || m.name,
        color: m.color,
        topics: weeks.filter((w) => w.module_id === m.id).map((w) => (w.title?.trim() ? w.title.trim() : `week ${w.number}`)),
        weight: Math.max(0.5, Math.min(2, (m.credits ?? 15) / 15))
      }
    })
    .filter((x): x is PlanExam => !!x)
}

export function RevisionPlannerDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { data } = useLive(['assessments', 'modules', 'weeks', 'tasks'], async () => ({ exams: await loadExams(), tasks: await api.list('tasks', { mode: 'study' }) }), [])
  const [opts, setOpts] = useState(loadOpts)
  const [skip, setSkip] = useState<Set<string>>(new Set())
  const [startTomorrow, setStartTomorrow] = useState(new Date().getHours() >= 17)
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const today = localDate(new Date())
  const start = startTomorrow ? addDays(today, 1) : today

  const chosen = useMemo(() => (data?.exams ?? []).filter((e) => !skip.has(e.id)), [data, skip])
  const sessions = useMemo(() => planRevision(chosen, { start, perWeek: opts.perWeek, restDay: opts.restDay }), [chosen, start, opts])
  const short = useMemo(() => unplanned(chosen, sessions), [chosen, sessions])
  const weeks = useMemo(() => {
    const m = new Map<string, PlanSession[]>()
    for (const s of sessions) {
      const monday = addDays(s.date, -((new Date(`${s.date}T00:00`).getDay() + 6) % 7))
      m.set(monday, [...(m.get(monday) ?? []), s])
    }
    return [...m.entries()]
  }, [sessions])
  const replacing = (data?.tasks ?? []).filter((t) => isRevision(t) && t.status !== 'done' && chosen.some((e) => e.id === t.assessment_id)).length

  const setO = (patch: Partial<typeof opts>): void => {
    const next = { ...opts, ...patch }
    setOpts(next)
    try {
      localStorage.setItem('revision-plan', JSON.stringify(next))
    } catch {
      /* fine */
    }
  }

  const create = async (): Promise<void> => {
    setBusy(true)
    const old = (data?.tasks ?? []).filter((t) => isRevision(t) && t.status !== 'done' && chosen.some((e) => e.id === t.assessment_id))
    await Promise.all(old.map((t) => api.remove('tasks', t.id)))
    for (const s of sessions) {
      const exam = chosen.find((e) => e.id === s.examId)!
      const [y, mo, d] = s.date.split('-').map(Number)
      await createTask('study', {
        title: s.title,
        module_id: exam.moduleId,
        assessment_id: exam.id,
        due_at: new Date(y, mo - 1, d, 23, 59).toISOString(),
        priority: s.kind === 'paper' || s.kind === 'final' ? 3 : 2,
        labels: JSON.stringify(['revision'])
      })
    }
    await Promise.all(chosen.map((e) => track(api.update('assessments', e.id, { auto_revision: 1 }))))
    notifyChanged('*')
    onClose()
  }

  const examOf = (id: string): PlanExam | undefined => data?.exams.find((e) => e.id === id)

  return (
    <Modal title="Plan my revision" onClose={onClose} wide>
      {!data ? null : data.exams.length === 0 ? (
        <p className="p-5 text-sm text-muted">No upcoming exams. Add exams (with dates) in a module’s Assessments tab, then plan here.</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5 text-sm">
          <p className="text-muted">
            Every topic (your module’s week titles) gets a first pass and a spaced “test yourself” review; the last two study days before each exam are a timed past paper and a final review.
            Sessions go to whichever exam needs them most, so subjects stay mixed.
          </p>
          <div className="flex flex-wrap gap-2">
            {data.exams.map((e) => (
              <label key={e.id} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 ${skip.has(e.id) ? 'border-line text-muted' : 'border-transparent bg-accent-soft'}`}>
                <input
                  type="checkbox"
                  checked={!skip.has(e.id)}
                  onChange={(ev) => {
                    const s = new Set(skip)
                    if (ev.target.checked) s.delete(e.id)
                    else s.add(e.id)
                    setSkip(s)
                  }}
                />
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: e.color }} />
                {e.moduleLabel} · {e.title} · {new Date(`${e.date}T00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ({daysUntil(`${e.date}T00:00`)}d)
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <label className="flex items-center gap-2">
              Sessions a week
              <input type="number" min={2} max={30} className="field-boxed w-16" value={opts.perWeek} onChange={(e) => setO({ perWeek: Math.min(30, Math.max(2, Number(e.target.value) || 2)) })} />
            </label>
            <label className="flex items-center gap-2">
              Day off
              <select className="field-boxed w-auto" value={opts.restDay ?? ''} onChange={(e) => setO({ restDay: e.target.value === '' ? null : Number(e.target.value) })}>
                <option value="">None</option>
                {WEEKDAYS.map((w, i) => (
                  <option key={w} value={i}>
                    {w}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={startTomorrow} onChange={(e) => setStartTomorrow(e.target.checked)} />
              Start tomorrow
            </label>
          </div>
          {short.length > 0 && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs">
              ⚠️ Not enough time for everything: {short.map((s) => `${s.exam.moduleLabel} is ${s.missing} session${s.missing === 1 ? '' : 's'} short`).join(', ')}. Add more sessions a week, or drop the day off.
            </p>
          )}
          <div className="rounded-lg border border-line">
            {weeks.map(([monday, list], wi) => {
              const isOpen = open === monday || (open === null && wi === 0)
              return (
                <div key={monday} className="border-b border-line last:border-0">
                  <button className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-canvas" onClick={() => setOpen(isOpen ? '' : monday)} aria-expanded={isOpen}>
                    <span className="font-medium">Week of {new Date(`${monday}T00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                    <span className="flex gap-0.5">
                      {list.map((s, i) => (
                        <span key={i} className="inline-block h-2 w-2 rounded-full" style={{ background: examOf(s.examId)?.color }} />
                      ))}
                    </span>
                    <span className="ml-auto text-xs text-muted">{list.length} sessions</span>
                  </button>
                  {isOpen && (
                    <ul className="flex flex-col gap-1 px-3 pb-2">
                      {list.map((s, i) => (
                        <li key={i} className="flex items-center gap-2 text-[13px]">
                          <span className="w-20 shrink-0 text-muted">{new Date(`${s.date}T00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</span>
                          <span>{KIND_ICON[s.kind]}</span>
                          <span className="truncate">{s.title}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
          {replacing > 0 && <p className="text-xs text-muted">This replaces {replacing} unfinished revision task{replacing === 1 ? '' : 's'} from your last plan. Finished ones are kept.</p>}
          <div className="flex justify-end gap-2">
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary" disabled={busy || !sessions.length} onClick={() => void create()}>
              Add {sessions.length} sessions to Tasks
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

/** Home panel: upcoming exams with a big day count. */
export function ExamCountdownPanel(): React.JSX.Element | null {
  const mode = useMode()
  const [planning, setPlanning] = useState(false)
  const { data } = useLive(
    ['assessments', 'modules', 'tasks'],
    async () => {
      const [exams, all, tasks, me] = await Promise.all([api.list('assessments', { kind: 'exam' }, 'due_at'), api.list('modules'), api.list('tasks', { mode: 'study' }), api.profile.get()])
      const modules = all.filter((m) => m.owner_id === me.id) // not friends' shared modules
      const now = new Date().toISOString()
      return exams
        .filter((e) => e.due_at && e.due_at >= now && e.score_pct == null)
        .slice(0, 4)
        .map((e) => ({
          exam: e,
          module: modules.find((m) => m.id === e.module_id),
          revision: tasks.filter((t) => isRevision(t) && t.assessment_id === e.id)
        }))
        .filter((r) => r.module && !r.module.deleted_at && !r.module.archived)
    },
    []
  )
  if (mode !== 'study' || !data?.length) return null
  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="flex-1 text-sm font-semibold">Exam countdown</h2>
        <button className="btn-ghost px-1.5 text-xs" onClick={() => setPlanning(true)}>
          <Icon name="calendar" /> Plan revision
        </button>
      </div>
      <ul className="flex flex-col gap-3">
        {data.map(({ exam, module, revision }) => {
          const d = daysUntil(exam.due_at!)
          const done = revision.filter((t) => t.status === 'done').length
          const dueSoFar = revision.filter((t) => t.due_at && t.due_at < new Date().toISOString()).length
          return (
            <li key={exam.id} className="flex items-center gap-3">
              <div className="flex w-12 shrink-0 flex-col items-center rounded-lg py-1 text-white" style={{ background: module!.color }}>
                <span className="text-lg leading-tight font-bold">{d}</span>
                <span className="text-[9px] tracking-wide uppercase">{d === 1 ? 'day' : 'days'}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{exam.title}</div>
                <div className="text-xs text-muted">
                  {module!.code || module!.name}
                  {revision.length > 0 ? ` · revision ${done}/${revision.length}${dueSoFar > done ? ` · ${dueSoFar - done} behind` : ''}` : ' · no revision plan yet'}
                </div>
                {revision.length > 0 && (
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full" style={{ width: `${(done / revision.length) * 100}%`, background: module!.color }} />
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {planning && <RevisionPlannerDialog onClose={() => setPlanning(false)} />}
    </section>
  )
}

/** Convenience used by the assessments table. */
export function PlanRevisionButton({ exam }: { exam: Assessment }): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  if (exam.kind !== 'exam' || !exam.due_at || exam.score_pct != null) return null
  return (
    <>
      <button className="btn-ghost px-1" title="Plan revision for your exams" onClick={() => setOpen(true)}>
        <Icon name="calendar" />
      </button>
      {open && <RevisionPlannerDialog onClose={() => setOpen(false)} />}
    </>
  )
}
