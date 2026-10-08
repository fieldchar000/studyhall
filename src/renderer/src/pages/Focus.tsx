// Focus room: Pomodoro timer (runs in the main process), what you're working on,
// timer settings and today's sessions.

import { useState } from 'react'
import type { TimerPhase, TimerSettings } from '@shared/types'
import { AutoNumber } from '@/components/AutoField'
import { Icon } from '@/components/ui'
import { SpotifyPanel } from '@/components/SpotifyPanel'
import { QuestMini } from '@/game/QuestMini'
import { api, db, notifyChanged, track, useLive } from '@/lib/data'
import { NoteView } from './Notes'
import { formatTime, localDate } from '@/lib/dates'
import { useMode } from '@/lib/profile'
import { openTask, setDone } from '@/lib/tasks'
import { fmtClock, PHASE_LABEL, useRemaining, useTimerState } from '@/lib/timer'

const PHASE_COLOR: Record<TimerPhase, string> = {
  focus: 'var(--color-danger)',
  short_break: 'var(--color-ok)',
  long_break: 'var(--color-ok)'
}

export function FocusPage(): React.JSX.Element {
  return (
    <div className="mx-auto grid max-w-5xl grid-cols-[1fr_320px] gap-5 p-8">
      <div className="flex flex-col gap-5">
        <TimerCard />
        <WorkingOn />
        <FocusNotes />
      </div>
      <div className="flex flex-col gap-5">
        <QuestMini />
        <TodayCard />
        <SpotifyPanel tall />
        <SettingsCard />
      </div>
    </div>
  )
}

function TimerCard(): React.JSX.Element {
  const s = useTimerState()
  const remaining = useRemaining(s)
  const { data: settings } = useLive(['timer'], () => api.timer.settings(), [])
  if (!s) return <div className="card h-96" />

  const progress = s.durationMs ? 1 - remaining / s.durationMs : 0
  const started = s.running || remaining < s.durationMs
  const R = 120
  const C = 2 * Math.PI * R
  const longEvery = settings?.longEvery ?? 4

  return (
    <div className="card flex flex-col items-center gap-5 p-8">
      <div className="flex gap-1 rounded-lg bg-line/50 p-0.5 text-sm">
        {(Object.keys(PHASE_LABEL) as TimerPhase[]).map((p) => (
          <span key={p} className={`rounded-md px-3 py-1 ${s.phase === p ? 'bg-panel font-medium shadow-sm' : 'text-muted'}`}>
            {PHASE_LABEL[p]}
          </span>
        ))}
      </div>

      <div className="relative">
        <svg width="280" height="280" viewBox="0 0 280 280" className="-rotate-90">
          <circle cx="140" cy="140" r={R} fill="none" stroke="var(--color-line)" strokeWidth="10" />
          <circle
            cx="140"
            cy="140"
            r={R}
            fill="none"
            stroke={PHASE_COLOR[s.phase]}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - progress)}
            style={{ transition: 'stroke-dashoffset 0.25s linear' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-6xl font-semibold tabular-nums tracking-tight">{fmtClock(remaining)}</div>
          <div className="mt-1 text-sm text-muted">
            {s.phase === 'focus' ? `Round ${(s.roundsDone % longEvery) + 1} of ${longEvery}` : 'Take a breather'}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button className="btn h-11 w-11 justify-center rounded-full p-0" title="Reset" onClick={() => void api.timer.reset()} disabled={!started}>
          <Icon name="reset" />
        </button>
        <button
          className="btn-primary h-14 min-w-36 justify-center rounded-full text-base"
          onClick={() => void (s.running ? api.timer.pause() : api.timer.start())}
        >
          <Icon name={s.running ? 'pause' : 'play'} size={18} />
          {s.running ? 'Pause' : started ? 'Resume' : `Start ${PHASE_LABEL[s.phase].toLowerCase()}`}
        </button>
        <button className="btn h-11 w-11 justify-center rounded-full p-0" title="Skip to next phase" onClick={() => void api.timer.skip()}>
          <Icon name="skip" />
        </button>
      </div>
      <p className="text-xs text-muted">Keeps running in the tray when you close the window.</p>
    </div>
  )
}

/** Pick the module/project and task the session counts towards. */
function WorkingOn(): React.JSX.Element {
  const mode = useMode()
  const s = useTimerState()
  const { data } = useLive(
    ['tasks', 'modules', 'projects', 'languages'],
    async () => {
      const [tasks, modules, projects, languages] = await Promise.all([
        api.list('tasks', { mode }, 'sort'),
        api.list('modules', { archived: 0 }, 'sort'),
        api.list('projects', { mode, status: 'active' }, 'sort'),
        api.list('languages', { active: 1 }, 'sort')
      ])
      return { tasks: tasks.filter((t) => t.status !== 'done' || t.id === s?.taskId), modules, projects, languages }
    },
    [mode, s?.taskId]
  )
  if (!s || !data) return <div className="card h-40" />

  const groupId = mode === 'study' ? s.moduleId : s.projectId
  const tasks = data.tasks.filter((t) => !groupId || (mode === 'study' ? t.module_id : t.project_id) === groupId)
  const task = data.tasks.find((t) => t.id === s.taskId)

  return (
    <div className="card flex flex-col gap-3 p-5">
      <h2 className="text-sm font-semibold">Working on</h2>
      {mode === 'life' && (
        <select
          className="field-boxed text-sm"
          value={s.languageId ?? ''}
          onChange={(e) => void api.timer.setContext({ languageId: e.target.value || null })}
          title="Focus time on a language counts towards its daily goal"
        >
          <option value="">Not language practice</option>
          {data.languages.map((l) => (
            <option key={l.id} value={l.id}>
              Practising {l.name}
            </option>
          ))}
        </select>
      )}
      <div className="grid grid-cols-2 gap-3 text-sm">
        {mode === 'study' ? (
          <select className="field-boxed" value={s.moduleId ?? ''} onChange={(e) => void api.timer.setContext({ moduleId: e.target.value || null, taskId: null })}>
            <option value="">Any module</option>
            {data.modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code ? `${m.code} · ` : ''}
                {m.name}
              </option>
            ))}
          </select>
        ) : (
          <select className="field-boxed" value={s.projectId ?? ''} onChange={(e) => void api.timer.setContext({ projectId: e.target.value || null, taskId: null })}>
            <option value="">{mode === 'life' ? 'Any goal' : 'Any project'}</option>
            {data.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        )}
        <select
          className="field-boxed"
          value={s.taskId ?? ''}
          onChange={(e) => {
            const t = data.tasks.find((x) => x.id === e.target.value)
            void api.timer.setContext({
              taskId: t?.id ?? null,
              moduleId: t?.module_id ?? s.moduleId,
              projectId: t?.project_id ?? s.projectId
            })
          }}
        >
          <option value="">No specific task</option>
          {tasks
            .filter((t) => !t.parent_task_id)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
        </select>
      </div>
      {task && (
        <div className="flex items-center gap-2 rounded-lg bg-canvas px-3 py-2 text-sm">
          <input type="checkbox" checked={task.status === 'done'} onChange={(e) => void setDone(task, e.target.checked)} />
          <button className={`flex-1 text-left ${task.status === 'done' ? 'text-muted line-through' : ''}`} onClick={() => openTask(task.id)}>
            {task.title}
          </button>
        </div>
      )}
    </div>
  )
}

/** Notes for the module (study) or project (work) you're focusing on, editable in place. */
function FocusNotes(): React.JSX.Element | null {
  const mode = useMode()
  const s = useTimerState()
  const groupId = mode === 'study' ? s?.moduleId : s?.projectId
  const [noteId, setNoteId] = useState<string | null>(null)
  const { data: notes } = useLive(
    ['notes'],
    async () => (groupId ? (await api.list('notes', mode === 'study' ? { module_id: groupId } : { project_id: groupId }, 'updated_at')).reverse() : []),
    [groupId, mode]
  )
  if (!groupId) {
    return (
      <div className="card p-5 text-sm text-muted">
        Pick a {mode === 'study' ? 'module' : 'project'} under “Working on” to see its notes here while you focus.
      </div>
    )
  }
  const current = notes?.find((n) => n.id === noteId) ?? notes?.[0]
  const create = async (): Promise<void> => {
    const n = await db.create('notes', mode === 'study' ? { mode, module_id: groupId, title: 'Focus notes' } : { mode, project_id: groupId, title: 'Focus notes' })
    setNoteId(n.id)
  }
  return (
    <div className="card flex h-[28rem] flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Icon name="note" className="text-muted" />
        <select className="field min-w-0 flex-1 text-sm" value={current?.id ?? ''} onChange={(e) => setNoteId(e.target.value)}>
          {!notes?.length && <option value="">No notes yet</option>}
          {notes?.map((n) => (
            <option key={n.id} value={n.id}>
              {n.title}
            </option>
          ))}
        </select>
        <button className="btn-ghost px-1" title="New note" onClick={() => void create()}>
          <Icon name="plus" />
        </button>
      </div>
      {current ? (
        <NoteView key={current.id} id={current.id} compact />
      ) : (
        <button className="m-auto text-sm text-accent" onClick={() => void create()}>
          + Start a note
        </button>
      )}
    </div>
  )
}

function TodayCard(): React.JSX.Element {
  const { data } = useLive(
    ['focus_sessions', 'tasks', 'modules', 'projects'],
    async () => {
      const [sessions, tasks, modules, projects] = await Promise.all([
        api.list('focus_sessions', {}, 'started_at'),
        api.list('tasks'),
        api.list('modules'),
        api.list('projects')
      ])
      const today = localDate(new Date())
      const todays = sessions.filter((s) => s.focused_seconds > 0 && localDate(new Date(s.started_at)) === today).reverse()
      const name = (id: string | null, rows: { id: string; title?: string; name?: string; code?: string }[]): string | null => {
        const r = rows.find((x) => x.id === id)
        return r ? (r.title ?? (r.code || r.name) ?? null) : null
      }
      return todays.map((s) => ({
        ...s,
        label: name(s.task_id, tasks) ?? name(s.module_id, modules) ?? name(s.project_id, projects) ?? 'Focus'
      }))
    },
    []
  )
  const minutes = Math.round((data ?? []).reduce((sum, s) => sum + s.focused_seconds, 0) / 60)
  const completed = (data ?? []).filter((s) => s.completed).length

  return (
    <div className="card p-5">
      <h2 className="mb-3 text-sm font-semibold">Today</h2>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <div className="text-2xl font-semibold">
            {Math.floor(minutes / 60) > 0 && `${Math.floor(minutes / 60)}h `}
            {minutes % 60}m
          </div>
          <div className="text-xs text-muted">focused</div>
        </div>
        <div>
          <div className="text-2xl font-semibold">{completed}</div>
          <div className="text-xs text-muted">sessions completed</div>
        </div>
      </div>
      <ul className="flex max-h-64 flex-col gap-1.5 overflow-auto text-sm">
        {data?.length === 0 && <li className="text-xs text-muted">No sessions yet today.</li>}
        {data?.map((s) => (
          <li key={s.id} className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${s.completed ? 'bg-ok' : 'bg-line'}`} />
            <span className="w-16 shrink-0 text-xs whitespace-nowrap text-muted tabular-nums">{formatTime(s.started_at)}</span>
            <span className="min-w-0 flex-1 truncate">{s.label}</span>
            <span className="text-xs text-muted">{Math.round(s.focused_seconds / 60)}m</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SettingsCard(): React.JSX.Element {
  const { data: settings } = useLive(['timer'], () => api.timer.settings(), [])
  if (!settings) return <div className="card h-48" />
  const save = (patch: Partial<TimerSettings>): void => void track(api.timer.setSettings(patch)).then(() => notifyChanged('timer'))

  const num = (key: 'focusMin' | 'shortMin' | 'longMin' | 'longEvery', label: string): React.JSX.Element => (
    <label className="flex items-center justify-between gap-2 text-sm">
      <span>{label}</span>
      <AutoNumber
        min={1}
        max={180}
        className="field-boxed w-20 text-right"
        value={settings[key]}
        onSave={(v) => {
          if (v != null) save({ [key]: v })
        }}
      />
    </label>
  )
  const toggle = (key: 'autoStartBreaks' | 'autoStartFocus', label: string): React.JSX.Element => (
    <label className="flex items-center justify-between gap-2 text-sm">
      <span>{label}</span>
      <input type="checkbox" checked={settings[key]} onChange={(e) => save({ [key]: e.target.checked })} />
    </label>
  )

  return (
    <div className="card flex flex-col gap-2.5 p-5">
      <h2 className="mb-1 text-sm font-semibold">Timer settings</h2>
      {num('focusMin', 'Focus (min)')}
      {num('shortMin', 'Short break (min)')}
      {num('longMin', 'Long break (min)')}
      {num('longEvery', 'Long break every … rounds')}
      {toggle('autoStartBreaks', 'Start breaks automatically')}
      {toggle('autoStartFocus', 'Start focus after breaks automatically')}
    </div>
  )
}
