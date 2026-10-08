// Kanban board (To do / Doing / Done) shared by the Tasks page, projects,
// modules and clients. Cards are dragged with native HTML drag-and-drop.

import { useState } from 'react'
import type { Task, TaskStatus } from '@shared/types'
import { api, useLive } from '@/lib/data'
import { relativeDue } from '@/lib/dates'
import { useMode } from '@/lib/profile'
import {
  addToTop3,
  createTask,
  isOverdue,
  isTop3Today,
  moveTask,
  openTask,
  parseLabels,
  PRIORITIES,
  removeFromTop3,
  setDone,
  STATUSES
} from '@/lib/tasks'
import { Icon } from './ui'

type Filter = Partial<Pick<Task, 'project_id' | 'module_id' | 'client_id'>>

export interface BoardLookups {
  tasks: Task[]
  names: Map<string, { label: string; color: string }> // project/module/client id -> chip
}

/** All tasks of the current mode plus names for project/module/client chips. */
export function useBoardData(): BoardLookups | undefined {
  const mode = useMode()
  return useLive(
    ['tasks', 'projects', 'modules', 'clients'],
    async () => {
      const [tasks, projects, modules, clients] = await Promise.all([
        api.list('tasks', { mode }, 'sort'),
        api.list('projects', { mode }),
        api.list('modules'),
        api.list('clients')
      ])
      const names = new Map<string, { label: string; color: string }>()
      projects.forEach((p) => names.set(p.id, { label: p.title, color: p.color }))
      modules.forEach((m) => names.set(m.id, { label: m.code || m.name, color: m.color }))
      clients.forEach((c) => names.set(c.id, { label: c.name, color: c.color }))
      return { tasks, names }
    },
    [mode]
  ).data
}

export function Board({ filter = {}, match }: { filter?: Filter; match?: (t: Task) => boolean }): React.JSX.Element {
  const mode = useMode()
  const data = useBoardData()
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<TaskStatus | null>(null)
  if (!data) return <div />

  const subtasks = new Map<string, Task[]>()
  data.tasks.forEach((t) => {
    if (t.parent_task_id) subtasks.set(t.parent_task_id, [...(subtasks.get(t.parent_task_id) ?? []), t])
  })
  const visible = data.tasks.filter(
    (t) =>
      !t.parent_task_id &&
      t.status !== 'inbox' &&
      Object.entries(filter).every(([k, v]) => !v || t[k as keyof Filter] === v) &&
      (!match || match(t))
  )
  const dragged = data.tasks.find((t) => t.id === dragId) ?? null

  const drop = (status: TaskStatus, before: Task | null): void => {
    setOverCol(null)
    setDragId(null)
    if (!dragged || dragged.id === before?.id) return
    void moveTask(
      dragged,
      status,
      before,
      visible.filter((t) => t.status === status)
    )
  }

  return (
    <div className="grid min-h-0 grid-cols-3 gap-4">
      {STATUSES.map((col) => {
        const cards = visible.filter((t) => t.status === col.key)
        return (
          <div
            key={col.key}
            className={`flex min-h-40 flex-col rounded-xl border p-2 transition-colors ${
              overCol === col.key ? 'border-accent bg-accent-soft' : 'border-line bg-canvas'
            }`}
            onDragOver={(e) => {
              e.preventDefault()
              setOverCol(col.key)
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(null)
            }}
            onDrop={(e) => {
              e.preventDefault()
              drop(col.key, null)
            }}
          >
            <div className="flex items-center gap-2 px-1.5 pt-1 pb-2 text-xs font-semibold tracking-wide text-muted uppercase">
              {col.label}
              <span className="rounded-full bg-line px-1.5 text-[10px]">{cards.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {cards.map((t) => (
                <Card
                  key={t.id}
                  task={t}
                  subs={subtasks.get(t.id) ?? []}
                  names={data.names}
                  dragging={dragId === t.id}
                  onDragStart={() => setDragId(t.id)}
                  onDragEnd={() => {
                    setDragId(null)
                    setOverCol(null)
                  }}
                  onDropBefore={() => drop(col.key, t)}
                />
              ))}
            </div>
            <QuickAdd onAdd={(title) => void createTask(mode, { ...filter, title, status: col.key })} />
          </div>
        )
      })}
    </div>
  )
}

function Card({
  task: t,
  subs,
  names,
  dragging,
  onDragStart,
  onDragEnd,
  onDropBefore
}: {
  task: Task
  subs: Task[]
  names: BoardLookups['names']
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onDropBefore: () => void
}): React.JSX.Element {
  const labels = parseLabels(t)
  const link = names.get(t.project_id ?? '') ?? names.get(t.module_id ?? '') ?? names.get(t.client_id ?? '')
  const done = t.status === 'done'
  const subsDone = subs.filter((s) => s.status === 'done').length
  const top3 = isTop3Today(t)
  const prio = PRIORITIES[t.priority] ?? PRIORITIES[0]

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', t.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onDropBefore()
      }}
      onClick={() => openTask(t.id)}
      className={`group card cursor-pointer border-l-4 p-2.5 shadow-sm hover:shadow-md ${dragging ? 'opacity-40' : ''}`}
      style={{ borderLeftColor: prio.color === 'transparent' ? 'var(--color-line)' : prio.color }}
    >
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={done}
          title={done ? 'Mark not done' : 'Mark done'}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => void setDone(t, e.target.checked)}
        />
        <div className={`min-w-0 flex-1 text-sm leading-snug ${done ? 'text-muted line-through' : ''}`}>{t.title}</div>
        <button
          className={`shrink-0 ${top3 ? 'text-amber-500' : 'text-muted opacity-0 group-hover:opacity-100'}`}
          title={top3 ? 'Remove from Top 3 today' : 'Add to Top 3 today'}
          onClick={(e) => {
            e.stopPropagation()
            if (top3) void removeFromTop3(t)
            else void addToTop3(t).then((ok) => !ok && alert('Your Top 3 for today is full.'))
          }}
        >
          <Icon name="star" size={14} className={top3 ? 'fill-current' : ''} />
        </button>
      </div>
      {(t.due_at || labels.length > 0 || link || subs.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-5 text-[11px]">
          {t.due_at && (
            <span className={`rounded px-1.5 py-0.5 ${isOverdue(t) ? 'bg-danger/15 text-danger' : 'bg-line/60 text-muted'}`}>
              {isOverdue(t) ? 'Overdue' : relativeDue(t.due_at)}
            </span>
          )}
          {link && (
            <span className="flex items-center gap-1 rounded bg-line/60 px-1.5 py-0.5 text-muted">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: link.color }} />
              {link.label}
            </span>
          )}
          {subs.length > 0 && (
            <span className="rounded bg-line/60 px-1.5 py-0.5 text-muted">
              ☑ {subsDone}/{subs.length}
            </span>
          )}
          {labels.map((l) => (
            <span key={l} className="rounded bg-accent-soft px-1.5 py-0.5 text-accent">
              {l}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function QuickAdd({ onAdd }: { onAdd: (title: string) => void }): React.JSX.Element {
  const [text, setText] = useState('')
  return (
    <input
      className="field mt-2 text-sm placeholder:text-muted"
      placeholder="+ Add a task"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && text.trim()) {
          onAdd(text.trim())
          setText('')
        }
        if (e.key === 'Escape') setText('')
      }}
    />
  )
}
