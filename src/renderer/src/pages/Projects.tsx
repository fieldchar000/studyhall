import { useState } from 'react'
import type { Project, ProjectStatus, Task } from '@shared/types'
import { Icon, PALETTE } from '@/components/ui'
import { api, db, useLive } from '@/lib/data'
import { relativeDue } from '@/lib/dates'
import { navigate } from '@/lib/nav'
import { useMode } from '@/lib/profile'

export const STATUS_LABEL: Record<ProjectStatus, string> = { active: 'Active', on_hold: 'On hold', done: 'Done' }

/** Share of a project's (top-level) tasks that are done, 0..1, or null without tasks. */
export function progressOf(projectId: string, tasks: Task[]): { done: number; total: number; pct: number | null } {
  const mine = tasks.filter((t) => t.project_id === projectId && !t.parent_task_id)
  const done = mine.filter((t) => t.status === 'done').length
  return { done, total: mine.length, pct: mine.length ? done / mine.length : null }
}

export function ProgressBar({ pct, color }: { pct: number | null; color: string }): React.JSX.Element {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-line">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.round((pct ?? 0) * 100)}%`, background: color }} />
    </div>
  )
}

export function ProjectsPage(): React.JSX.Element {
  const mode = useMode()
  const [status, setStatus] = useState<ProjectStatus>('active')
  const { data } = useLive(
    ['projects', 'tasks', 'modules', 'clients'],
    async () => {
      const [projects, tasks, modules, clients] = await Promise.all([
        api.list('projects', { mode }, 'sort'),
        api.list('tasks', { mode }),
        api.list('modules'),
        api.list('clients')
      ])
      const linkName = (p: Project): string | null =>
        modules.find((m) => m.id === p.module_id)?.code ||
        modules.find((m) => m.id === p.module_id)?.name ||
        clients.find((c) => c.id === p.client_id)?.name ||
        null
      return { projects, tasks, linkName }
    },
    [mode]
  )

  const add = async (): Promise<void> => {
    const n = data?.projects.length ?? 0
    const p = await db.create('projects', { title: mode === 'life' ? 'New goal' : 'New project', mode, color: PALETTE[(n + 2) % PALETTE.length], sort: n })
    navigate({ name: 'project', id: p.id })
  }

  const shown = data?.projects.filter((p) => p.status === status) ?? []
  const noun = mode === 'life' ? 'goal' : 'project' // Life mode calls projects "goals"

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{mode === 'life' ? 'Goals' : 'Projects'}</h1>
        <div className="ml-4 flex gap-1 rounded-lg bg-line/50 p-0.5">
          {(Object.keys(STATUS_LABEL) as ProjectStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-md px-3 py-1 text-sm ${status === s ? 'bg-panel font-medium shadow-sm' : 'text-muted'}`}
            >
              {STATUS_LABEL[s]} ({data?.projects.filter((p) => p.status === s).length ?? 0})
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button className="btn-primary" onClick={() => void add()}>
          <Icon name="plus" /> New {noun}
        </button>
      </div>

      {data && shown.length === 0 && (
        <div className="card p-10 text-center text-muted">
          {status === 'active'
            ? mode === 'life'
              ? 'No active goals. A goal groups tasks with milestones and a deadline — e.g. run a 10K, cook 20 new recipes, or pass JLPT N4.'
              : 'No active projects. Projects group tasks with milestones and a deadline — e.g. a dissertation or a client job.'
            : `No ${STATUS_LABEL[status].toLowerCase()} ${noun}s.`}
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
        {shown.map((p) => {
          const prog = progressOf(p.id, data!.tasks)
          const link = data!.linkName(p)
          return (
            <button key={p.id} className="card p-4 text-left transition-shadow hover:shadow-md" onClick={() => navigate({ name: 'project', id: p.id })}>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
                <span className="truncate font-semibold">{p.title}</span>
              </div>
              <div className="mt-1 h-4 text-xs text-muted">
                {link}
                {link && p.deadline && ' · '}
                {p.deadline && `Deadline ${relativeDue(p.deadline)}`}
              </div>
              <div className="mt-3">
                <ProgressBar pct={prog.pct} color={p.color} />
              </div>
              <div className="mt-1.5 text-xs text-muted">
                {prog.total ? `${prog.done}/${prog.total} tasks done` : 'No tasks yet'}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
