// Side panel for editing one task. Opened from anywhere with openTask(id).

import { useEffect, useState } from 'react'
import type { Task, TaskStatus } from '@shared/types'
import { api, db, useLive } from '@/lib/data'
import { isoToLocalInput, localDate, localInputToIso } from '@/lib/dates'
import { navigate } from '@/lib/nav'
import { useMode } from '@/lib/profile'
import { addToTop3, createTask, isTop3Today, openTask, parseLabels, PRIORITIES, removeFromTop3, setDone, useOpenTaskId } from '@/lib/tasks'
import { AutoText } from './AutoField'
import { Icon } from './ui'

/** End of a local day (23:59) as ISO, n days from today. */
function endOfDay(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  d.setHours(23, 59, 0, 0)
  return d.toISOString()
}

export function TaskDrawer(): React.JSX.Element | null {
  const id = useOpenTaskId()
  useEffect(() => {
    if (!id) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') openTask(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id])
  if (!id) return null
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/25" onMouseDown={() => openTask(null)}>
      <aside
        className="flex h-full w-[440px] max-w-full flex-col border-l border-line bg-panel shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <DrawerBody key={id} id={id} />
      </aside>
    </div>
  )
}

function DrawerBody({ id }: { id: string }): React.JSX.Element | null {
  const mode = useMode()
  const { data } = useLive(
    ['tasks', 'projects', 'milestones', 'modules', 'assessments', 'clients'],
    async () => {
      const task = await api.get('tasks', id)
      if (!task) return null
      const [subtasks, projects, milestones, modules, assessments, clients, allTasks] = await Promise.all([
        api.list('tasks', { parent_task_id: id }, 'sort'),
        api.list('projects', { mode: task.mode }),
        task.project_id ? api.list('milestones', { project_id: task.project_id }, 'sort') : Promise.resolve([]),
        api.list('modules', { archived: 0 }, 'sort'),
        task.module_id ? api.list('assessments', { module_id: task.module_id }, 'due_at') : Promise.resolve([]),
        api.list('clients', { archived: 0 }),
        api.list('tasks', { mode: task.mode })
      ])
      const knownLabels = [...new Set(allTasks.flatMap(parseLabels))].sort()
      return { task, subtasks, projects, milestones, modules, assessments, clients, knownLabels }
    },
    [id]
  )
  if (data === undefined) return <div />
  if (data === null) {
    return <div className="p-6 text-muted">This task was deleted.</div>
  }
  const { task: t, subtasks, projects, milestones, modules, assessments, clients, knownLabels } = data
  const save = (patch: Partial<Task>): Promise<unknown> => db.update('tasks', t.id, patch)
  const top3 = isTop3Today(t)

  const focusOnIt = async (): Promise<void> => {
    await api.timer.setContext({ taskId: t.id, moduleId: t.module_id, projectId: t.project_id })
    openTask(null)
    navigate({ name: 'focus' })
  }

  return (
    <>
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="flex-1 text-xs text-muted">{t.parent_task_id ? 'Subtask' : 'Task'}</span>
        <button
          className={`btn-ghost ${top3 ? 'text-amber-500' : ''}`}
          onClick={() =>
            top3 ? void removeFromTop3(t) : void addToTop3(t).then((ok) => !ok && alert('Your Top 3 for today is full.'))
          }
        >
          <Icon name="star" className={top3 ? 'fill-current' : ''} /> {top3 ? 'In Top 3' : 'Top 3 today'}
        </button>
        <button
          className="btn-ghost hover:text-danger"
          title="Delete task"
          onClick={() => {
            if (subtasks.length && !confirm(`Delete this task and its ${subtasks.length} subtask(s)?`)) return
            void db.remove('tasks', t.id)
            openTask(t.parent_task_id)
          }}
        >
          <Icon name="trash" />
        </button>
        <button className="btn-ghost" onClick={() => openTask(null)} title="Close (Esc)">
          <Icon name="x" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
        {t.parent_task_id && (
          <button className="btn-ghost -mt-2 -ml-2 self-start" onClick={() => openTask(t.parent_task_id)}>
            <Icon name="back" /> Parent task
          </button>
        )}
        <div className="flex items-start gap-2">
          <input type="checkbox" className="mt-2.5" checked={t.status === 'done'} onChange={(e) => void setDone(t, e.target.checked)} />
          <AutoText
            multiline
            rows={2}
            value={t.title}
            onSave={(v) => save({ title: v.trim() || 'Untitled task' })}
            className="field resize-none text-lg font-semibold"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Status">
            <select
              className="field-boxed"
              value={t.status}
              onChange={(e) => {
                const status = e.target.value as TaskStatus
                void save({ status, completed_at: status === 'done' ? new Date().toISOString() : null })
              }}
            >
              <option value="todo">To do</option>
              <option value="doing">Doing</option>
              <option value="done">Done</option>
            </select>
          </Field>
          <Field label="Priority">
            <select className="field-boxed" value={t.priority} onChange={(e) => void save({ priority: Number(e.target.value) })}>
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Due" wide>
            <div className="flex flex-wrap items-center gap-1.5">
              <input
                type="datetime-local"
                className="field-boxed w-auto"
                value={isoToLocalInput(t.due_at)}
                onChange={(e) => void save({ due_at: localInputToIso(e.target.value) })}
              />
              <button className="btn-ghost" onClick={() => void save({ due_at: endOfDay(0) })}>
                Today
              </button>
              <button className="btn-ghost" onClick={() => void save({ due_at: endOfDay(1) })}>
                Tomorrow
              </button>
              <button className="btn-ghost" onClick={() => void save({ due_at: endOfDay(7) })}>
                +1 week
              </button>
              {t.due_at && (
                <button className="btn-ghost" onClick={() => void save({ due_at: null })}>
                  Clear
                </button>
              )}
            </div>
          </Field>

          <Field label="Project">
            <select
              className="field-boxed"
              value={t.project_id ?? ''}
              onChange={(e) => void save({ project_id: e.target.value || null, milestone_id: null })}
            >
              <option value="">—</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Milestone">
            <select
              className="field-boxed"
              value={t.milestone_id ?? ''}
              disabled={!t.project_id}
              onChange={(e) => void save({ milestone_id: e.target.value || null })}
            >
              <option value="">—</option>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </Field>

          {mode === 'study' ? (
            <>
              <Field label="Module">
                <select
                  className="field-boxed"
                  value={t.module_id ?? ''}
                  onChange={(e) => void save({ module_id: e.target.value || null, assessment_id: null })}
                >
                  <option value="">—</option>
                  {modules.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.code ? `${m.code} · ` : ''}
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Assessment">
                <select
                  className="field-boxed"
                  value={t.assessment_id ?? ''}
                  disabled={!t.module_id}
                  onChange={(e) => void save({ assessment_id: e.target.value || null })}
                >
                  <option value="">—</option>
                  {assessments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          ) : (
            <Field label="Client" wide>
              <select className="field-boxed" value={t.client_id ?? ''} onChange={(e) => void save({ client_id: e.target.value || null })}>
                <option value="">—</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Labels" wide>
            <LabelInput labels={parseLabels(t)} known={knownLabels} onChange={(l) => void save({ labels: JSON.stringify(l) })} />
          </Field>
        </div>

        <Field label="Notes">
          <AutoText multiline rows={4} value={t.notes} onSave={(v) => save({ notes: v })} className="field-boxed" placeholder="Details, links…" />
        </Field>

        {!t.parent_task_id && <Subtasks parent={t} subtasks={subtasks} />}

        <div className="mt-auto flex items-center gap-2 border-t border-line pt-3">
          <button className="btn" onClick={() => void focusOnIt()}>
            <Icon name="focus" /> Focus on this
          </button>
          <span className="ml-auto text-[11px] text-muted">Created {localDate(new Date(t.created_at))}</span>
        </div>
      </div>
    </>
  )
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }): React.JSX.Element {
  return (
    <label className={`flex flex-col gap-1 ${wide ? 'col-span-2' : ''}`}>
      <span className="text-xs text-muted">{label}</span>
      {children}
    </label>
  )
}

function Subtasks({ parent, subtasks }: { parent: Task; subtasks: Task[] }): React.JSX.Element {
  const [text, setText] = useState('')
  const done = subtasks.filter((s) => s.status === 'done').length
  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs text-muted">
        Subtasks {subtasks.length > 0 && `· ${done}/${subtasks.length}`}
      </div>
      {subtasks.map((s) => (
        <div key={s.id} className="group flex items-center gap-2">
          <input type="checkbox" checked={s.status === 'done'} onChange={(e) => void setDone(s, e.target.checked)} />
          <AutoText
            value={s.title}
            onSave={(v) => db.update('tasks', s.id, { title: v || 'Untitled' })}
            className={`field py-0.5 ${s.status === 'done' ? 'text-muted line-through' : ''}`}
          />
          <button className="btn-ghost opacity-0 group-hover:opacity-100 hover:text-danger" onClick={() => void db.remove('tasks', s.id)}>
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
      <input
        className="field text-sm"
        placeholder="+ Add a subtask"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && text.trim()) {
            void createTask(parent.mode, {
              title: text.trim(),
              parent_task_id: parent.id,
              project_id: parent.project_id,
              module_id: parent.module_id,
              client_id: parent.client_id
            })
            setText('')
          }
        }}
      />
    </div>
  )
}

/** Chips + text box. Enter or comma adds a label, Backspace on empty removes the last. */
function LabelInput({ labels, known, onChange }: { labels: string[]; known: string[]; onChange: (l: string[]) => void }): React.JSX.Element {
  const [text, setText] = useState('')
  const commit = (raw: string): void => {
    const v = raw.trim()
    if (v && !labels.includes(v)) onChange([...labels, v])
    setText('')
  }
  const add = (): void => commit(text)
  return (
    <div className="field-boxed flex flex-wrap items-center gap-1.5">
      {labels.map((l) => (
        <span key={l} className="flex items-center gap-1 rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent">
          {l}
          <button onClick={() => onChange(labels.filter((x) => x !== l))} title="Remove">
            <Icon name="x" size={11} />
          </button>
        </span>
      ))}
      <input
        list="known-labels"
        className="min-w-24 flex-1 bg-transparent outline-none"
        placeholder={labels.length ? '' : 'Add label…'}
        value={text}
        onChange={(e) => {
          const v = e.target.value
          if (v.endsWith(',')) commit(v.slice(0, -1))
          else setText(v)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add()
          }
          if (e.key === 'Backspace' && !text && labels.length) onChange(labels.slice(0, -1))
        }}
        onBlur={add}
      />
      <datalist id="known-labels">
        {known.filter((k) => !labels.includes(k)).map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>
    </div>
  )
}
