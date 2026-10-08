// Exam countdowns and auto-generated revision tasks.

import { useState } from 'react'
import type { Assessment, Task } from '@shared/types'
import { api, notifyChanged, track, useLive } from '@/lib/data'
import { useMode } from '@/lib/profile'
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

const isRevisionFor = (t: Task, assessmentId: string): boolean => t.assessment_id === assessmentId && parseLabels(t).includes('revision')

/** Spread `n` revision tasks from today/tomorrow up to the day before the exam. */
async function generateRevision(exam: Assessment, n: number): Promise<number> {
  const days = Math.max(0, daysUntil(exam.due_at!))
  const [module, weeks, tasks] = await Promise.all([
    api.get('modules', exam.module_id),
    api.list('weeks', { module_id: exam.module_id }, 'number'),
    api.list('tasks', { assessment_id: exam.id })
  ])
  // Replace any unfinished revision tasks from a previous plan.
  await Promise.all(tasks.filter((t) => isRevisionFor(t, exam.id) && t.status !== 'done').map((t) => api.remove('tasks', t.id)))

  const topics = weeks.map((w) => (w.title ? w.title : `week ${w.number}`))
  const prefix = module?.code || module?.name || 'Exam'
  const first = days >= 2 ? 1 : 0
  const last = Math.max(first, days - 1)
  for (let k = 0; k < n; k++) {
    const offset = n === 1 ? first : first + Math.round((k * (last - first)) / (n - 1))
    const due = new Date()
    due.setDate(due.getDate() + offset)
    due.setHours(23, 59, 0, 0)
    const topic = topics.length ? topics[k % topics.length] : null
    await createTask('study', {
      title: topic ? `${prefix}: revise ${topic}` : `${prefix}: revision session ${k + 1}/${n}`,
      module_id: exam.module_id,
      assessment_id: exam.id,
      due_at: due.toISOString(),
      priority: 2,
      labels: JSON.stringify(['revision'])
    })
  }
  await track(api.update('assessments', exam.id, { auto_revision: 1 }))
  notifyChanged('*')
  return n
}

export function RevisionDialog({ exam, onClose }: { exam: Assessment; onClose: () => void }): React.JSX.Element {
  const days = Math.max(0, daysUntil(exam.due_at!))
  const [n, setN] = useState(Math.min(8, Math.max(1, Math.floor(days / 2))))
  const [busy, setBusy] = useState(false)
  const { data: existing } = useLive(['tasks'], async () => (await api.list('tasks', { assessment_id: exam.id })).filter((t) => isRevisionFor(t, exam.id)), [exam.id])
  const open = existing?.filter((t) => t.status !== 'done').length ?? 0

  return (
    <Modal title={`Plan revision · ${exam.title}`} onClose={onClose}>
      <div className="flex flex-col gap-4 text-sm">
        <p className="text-muted">
          The exam is {days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}. Revision tasks are spread evenly until the day before, cycling through the
          module's week topics, and appear in Tasks and on your calendar.
        </p>
        <label className="flex items-center gap-3">
          <span>Number of revision sessions</span>
          <input type="number" min={1} max={30} className="field-boxed w-20" value={n} onChange={(e) => setN(Math.min(30, Math.max(1, Number(e.target.value) || 1)))} />
        </label>
        {open > 0 && <p className="text-xs text-amber-600">This replaces the {open} unfinished revision task(s) from your last plan. Finished ones are kept.</p>}
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={busy || days < 0}
            onClick={() => {
              setBusy(true)
              void generateRevision(exam, n).finally(onClose)
            }}
          >
            Create {n} tasks
          </button>
        </div>
      </div>
    </Modal>
  )
}

/** Home panel: upcoming exams with a big day count. */
export function ExamCountdownPanel(): React.JSX.Element | null {
  const mode = useMode()
  const [planning, setPlanning] = useState<Assessment | null>(null)
  const { data } = useLive(
    ['assessments', 'modules', 'tasks'],
    async () => {
      const [exams, modules, tasks] = await Promise.all([api.list('assessments', { kind: 'exam' }, 'due_at'), api.list('modules'), api.list('tasks', { mode: 'study' })])
      const now = new Date().toISOString()
      return exams
        .filter((e) => e.due_at && e.due_at >= now && e.score_pct == null)
        .slice(0, 4)
        .map((e) => ({
          exam: e,
          module: modules.find((m) => m.id === e.module_id),
          revision: tasks.filter((t) => isRevisionFor(t, e.id))
        }))
        .filter((r) => r.module && !r.module.deleted_at && !r.module.archived)
    },
    []
  )
  if (mode !== 'study' || !data?.length) return null
  return (
    <section className="card p-4">
      <h2 className="mb-3 text-sm font-semibold">Exam countdown</h2>
      <ul className="flex flex-col gap-3">
        {data.map(({ exam, module, revision }) => {
          const d = daysUntil(exam.due_at!)
          const done = revision.filter((t) => t.status === 'done').length
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
                  {revision.length > 0 && ` · revision ${done}/${revision.length}`}
                </div>
              </div>
              <button className="btn-ghost px-1.5" title="Plan revision tasks" onClick={() => setPlanning(exam)}>
                <Icon name="calendar" />
              </button>
            </li>
          )
        })}
      </ul>
      {planning && <RevisionDialog exam={planning} onClose={() => setPlanning(null)} />}
    </section>
  )
}

/** Convenience used by the assessments table. */
export function PlanRevisionButton({ exam }: { exam: Assessment }): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  if (exam.kind !== 'exam' || !exam.due_at || exam.score_pct != null) return null
  return (
    <>
      <button className="btn-ghost px-1" title="Plan revision tasks" onClick={() => setOpen(true)}>
        <Icon name="calendar" />
      </button>
      {open && <RevisionDialog exam={exam} onClose={() => setOpen(false)} />}
    </>
  )
}
