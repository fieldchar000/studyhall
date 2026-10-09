import { useState } from 'react'
import type { Milestone, Project, ProjectStatus, Task } from '@shared/types'
import { AutoText } from '@/components/AutoField'
import { Board } from '@/components/Board'
import { ColorPicker, Icon } from '@/components/ui'
import { api, db, useLive } from '@/lib/data'
import { localDate } from '@/lib/dates'
import { navigate } from '@/lib/nav'
import { useMode } from '@/lib/profile'
import { openTask } from '@/lib/tasks'
import { progressOf, ProgressBar, STATUS_LABEL } from './Projects'
import { DevPanel } from './dev/DevProject'

/** <input type="date"> value <-> end of that local day as ISO. */
const dateToIso = (d: string): string | null => (d ? new Date(`${d}T23:59`).toISOString() : null)
const isoToDate = (iso: string | null): string => (iso ? localDate(new Date(iso)) : '')

export function ProjectDetailPage({ id }: { id: string }): React.JSX.Element {
  const mode = useMode()
  const [view, setView] = useState<'board' | 'timeline'>('board')
  const [showColors, setShowColors] = useState(false)
  const { data } = useLive(
    ['projects', 'milestones', 'tasks', 'modules', 'clients'],
    async () => {
      const project = await api.get('projects', id)
      if (!project) return null
      const [milestones, tasks, modules, clients] = await Promise.all([
        api.list('milestones', { project_id: id }, 'due_at'),
        api.list('tasks', { project_id: id }),
        api.list('modules', { archived: 0 }, 'sort'),
        api.list('clients', { archived: 0 })
      ])
      return { project, milestones, tasks, modules, clients }
    },
    [id]
  )
  if (data === undefined) return <div />
  if (data === null) {
    return (
      <div className="p-8 text-muted">
        This project was deleted.{' '}
        <button className="text-accent underline" onClick={() => navigate({ name: 'projects' })}>
          Back to projects
        </button>
      </div>
    )
  }
  const { project: p, milestones, tasks, modules, clients } = data
  const save = (patch: Partial<Project>): Promise<unknown> => db.update('projects', id, patch)
  const prog = progressOf(id, tasks)
  const msDone = milestones.filter((m) => m.done_at).length

  const remove = async (): Promise<void> => {
    if (!confirm(`Delete "${p.title}" with its ${prog.total} task(s) and ${milestones.length} milestone(s)?`)) return
    await db.remove('projects', id)
    navigate({ name: 'projects' })
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-8">
      <button className="btn-ghost -mb-2 -ml-2 self-start" onClick={() => navigate({ name: 'projects' })}>
        <Icon name="back" /> Projects
      </button>

      <div className="card p-5">
        <div className="flex items-start gap-3">
          <div className="relative">
            <button className="mt-2 h-6 w-6 rounded-full border border-line" style={{ background: p.color }} onClick={() => setShowColors((s) => !s)} title="Colour" />
            {showColors && (
              <div className="card absolute top-10 left-0 z-10 w-60 p-3 shadow-lg">
                <ColorPicker
                  value={p.color}
                  onChange={(c) => {
                    void save({ color: c })
                    setShowColors(false)
                  }}
                />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <AutoText value={p.title} onSave={(v) => save({ title: v || 'Untitled project' })} className="field text-2xl font-semibold tracking-tight" />
            <AutoText
              multiline
              rows={2}
              value={p.description}
              onSave={(v) => save({ description: v })}
              placeholder="What is this project about?"
              className="field resize-none text-sm text-muted"
            />
          </div>
          <button className="btn-ghost hover:text-danger" onClick={() => void remove()} title="Delete project">
            <Icon name="trash" />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-4 pl-9 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Status</span>
            <select className="field-boxed" value={p.status} onChange={(e) => void save({ status: e.target.value as ProjectStatus })}>
              {(Object.keys(STATUS_LABEL) as ProjectStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Deadline</span>
            <input type="date" className="field-boxed" value={isoToDate(p.deadline)} onChange={(e) => void save({ deadline: dateToIso(e.target.value) })} />
          </label>
          {mode === 'study' ? (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">Module</span>
              <select className="field-boxed" value={p.module_id ?? ''} onChange={(e) => void save({ module_id: e.target.value || null })}>
                <option value="">—</option>
                {modules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code ? `${m.code} · ` : ''}
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          ) : mode === 'life' || mode === 'dev' ? null : (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">Client</span>
              <select className="field-boxed" value={p.client_id ?? ''} onChange={(e) => void save({ client_id: e.target.value || null })}>
                <option value="">—</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="mt-4 pl-9">
          <ProgressBar pct={prog.pct} color={p.color} />
          <div className="mt-1.5 flex gap-4 text-xs text-muted">
            <span>
              {prog.done}/{prog.total} tasks done{prog.pct != null && ` (${Math.round(prog.pct * 100)}%)`}
            </span>
            <span>
              {msDone}/{milestones.length} milestones
            </span>
          </div>
        </div>
      </div>

      {p.mode === 'dev' && <DevPanel project={p} />}

      <Milestones projectId={id} milestones={milestones} />

      <div className="flex gap-1 border-b border-line">
        {(
          [
            ['board', 'Board'],
            ['timeline', 'Timeline']
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${view === key ? 'border-accent font-medium' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {view === 'board' ? <Board filter={{ project_id: id }} /> : <Timeline project={p} milestones={milestones} tasks={tasks} />}
    </div>
  )
}

function Milestones({ projectId, milestones }: { projectId: string; milestones: Milestone[] }): React.JSX.Element {
  const add = (): void => void db.create('milestones', { project_id: projectId, title: 'New milestone', sort: milestones.length })
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center">
        <h2 className="flex-1 text-sm font-semibold">Milestones</h2>
        <button className="btn-ghost" onClick={add}>
          <Icon name="plus" /> Add
        </button>
      </div>
      {milestones.length === 0 && <div className="text-xs text-muted">Break the project into checkpoints, each with a date.</div>}
      {milestones.map((m) => (
        <div key={m.id} className="group flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!m.done_at}
            onChange={(e) => void db.update('milestones', m.id, { done_at: e.target.checked ? new Date().toISOString() : null })}
          />
          <span className="h-2 w-2 shrink-0 rotate-45 bg-accent" />
          <AutoText
            value={m.title}
            onSave={(v) => db.update('milestones', m.id, { title: v || 'Milestone' })}
            className={`field ${m.done_at ? 'text-muted line-through' : ''}`}
          />
          <input
            type="date"
            className="field w-auto text-xs text-muted"
            value={isoToDate(m.due_at)}
            onChange={(e) => void db.update('milestones', m.id, { due_at: dateToIso(e.target.value) })}
          />
          <button className="btn-ghost opacity-0 group-hover:opacity-100 hover:text-danger" onClick={() => void db.remove('milestones', m.id)}>
            <Icon name="trash" />
          </button>
        </div>
      ))}
    </div>
  )
}

/** Simple timeline: milestones (◆) and dated tasks (●) on a time axis, with today and the deadline. */
function Timeline({ project, milestones, tasks }: { project: Project; milestones: Milestone[]; tasks: Task[] }): React.JSX.Element {
  const items = [
    ...milestones
      .filter((m) => m.due_at)
      .map((m) => ({ id: m.id, kind: 'milestone' as const, title: m.title, at: Date.parse(m.due_at!), done: !!m.done_at })),
    ...tasks
      .filter((t) => t.due_at && !t.parent_task_id)
      .map((t) => ({ id: t.id, kind: 'task' as const, title: t.title, at: Date.parse(t.due_at!), done: t.status === 'done' }))
  ].sort((a, b) => a.at - b.at)
  const undated = tasks.filter((t) => !t.due_at && !t.parent_task_id).length
  const deadline = project.deadline ? Date.parse(project.deadline) : null
  const today = Date.now()

  const points = [Date.parse(project.created_at), today, ...items.map((i) => i.at), ...(deadline ? [deadline] : [])]
  let min = Math.min(...points)
  let max = Math.max(...points)
  const pad = Math.max((max - min) * 0.05, 864e5)
  min -= pad
  max += pad
  const pct = (ms: number): number => ((ms - min) / (max - min)) * 100

  // Axis ticks: weekly for short projects, monthly for long ones.
  const days = (max - min) / 864e5
  const ticks: number[] = []
  const t = new Date(min)
  t.setHours(0, 0, 0, 0)
  if (days <= 120) {
    t.setDate(t.getDate() + ((8 - t.getDay()) % 7)) // next Monday
    for (; t.getTime() <= max; t.setDate(t.getDate() + 7)) ticks.push(t.getTime())
  } else {
    t.setDate(1)
    t.setMonth(t.getMonth() + 1)
    for (; t.getTime() <= max; t.setMonth(t.getMonth() + 1)) ticks.push(t.getTime())
  }
  const tickLabel = (ms: number): string =>
    new Date(ms).toLocaleDateString(undefined, days <= 120 ? { day: 'numeric', month: 'short' } : { month: 'short', year: '2-digit' })

  return (
    <div className="card p-4">
      {items.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted">Give milestones or tasks a date to see them on the timeline.</div>
      ) : (
        <div className="relative">
          {/* Today / deadline lines over the whole chart */}
          <div className="pointer-events-none absolute top-0 right-0 bottom-0 left-56">
            <div className="absolute top-0 bottom-0 w-px bg-accent" style={{ left: `${pct(today)}%` }}>
              <span className="absolute -top-0.5 left-1 text-[10px] text-accent">Today</span>
            </div>
            {deadline && (
              <div className="absolute top-0 bottom-0 w-px bg-danger" style={{ left: `${pct(deadline)}%` }}>
                <span className="absolute top-3 left-1 text-[10px] whitespace-nowrap text-danger">Deadline</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-[14rem_1fr]">
            <div />
            <div className="relative mb-2 h-8 border-b border-line">
              {ticks.map((tk) => (
                <span key={tk} className="absolute bottom-1 -translate-x-1/2 text-[10px] whitespace-nowrap text-muted" style={{ left: `${pct(tk)}%` }}>
                  {tickLabel(tk)}
                </span>
              ))}
            </div>
            {items.map((i) => (
              <div key={i.id} className="contents">
                <button
                  className={`truncate py-1.5 pr-3 text-left text-sm ${i.done ? 'text-muted line-through' : ''} ${i.kind === 'task' ? 'hover:text-accent' : ''}`}
                  onClick={() => i.kind === 'task' && openTask(i.id)}
                  title={i.title}
                >
                  {i.kind === 'milestone' ? '◆ ' : '● '}
                  {i.title}
                </button>
                <div className="relative border-b border-line/50">
                  <span
                    title={new Date(i.at).toLocaleString()}
                    className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 ${
                      i.kind === 'milestone' ? 'h-3 w-3 rotate-45' : 'h-2.5 w-2.5 rounded-full'
                    } ${i.done ? 'bg-ok' : i.at < today ? 'bg-danger' : 'bg-accent'}`}
                    style={{ left: `${pct(i.at)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {undated > 0 && <div className="mt-3 text-xs text-muted">{undated} task(s) without a due date aren't shown.</div>}
    </div>
  )
}
