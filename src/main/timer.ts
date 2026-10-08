// Pomodoro timer. It lives in the main process so it keeps running (and the
// tray keeps counting down) while the window is hidden. State is saved on every
// change, so a timer survives the app being closed and reopened.

import { create, get, getProfileId, getSetting, setSetting, softDelete, update } from './db'
import { reward } from './game'
import type { FocusSession, Profile, TimerContext, TimerPhase, TimerSettings, TimerState } from '@shared/types'

const DEFAULT_SETTINGS: TimerSettings = {
  focusMin: 25,
  shortMin: 5,
  longMin: 15,
  longEvery: 4,
  autoStartBreaks: true,
  autoStartFocus: false
}

/** Extra bookkeeping on top of the public state (focused time of the current session). */
interface InternalState extends TimerState {
  focusedMs: number
  segmentStart: number | null
  creditedMin?: number // whole focused minutes already saved to the session + game
}

type Listener = (state: TimerState, remainingMs: number, changed: boolean) => void
type Notifier = (title: string, body: string) => void

let settings: TimerSettings = DEFAULT_SETTINGS
let state: InternalState
let listener: Listener = () => {}
let notify: Notifier = () => {}

const iso = (ms: number): string => new Date(ms).toISOString()

function durationFor(phase: TimerPhase): number {
  const min = phase === 'focus' ? settings.focusMin : phase === 'short_break' ? settings.shortMin : settings.longMin
  return Math.max(1, min) * 60_000
}

/** A fresh, not-running timer for `phase`, keeping the chosen task/module/project. */
function idle(phase: TimerPhase): InternalState {
  const d = durationFor(phase)
  return {
    phase,
    running: false,
    endsAt: null,
    remainingMs: d,
    durationMs: d,
    roundsDone: state?.roundsDone ?? 0,
    sessionId: null,
    taskId: state?.taskId ?? null,
    moduleId: state?.moduleId ?? null,
    projectId: state?.projectId ?? null,
    languageId: state?.languageId ?? null,
    focusedMs: 0,
    segmentStart: null,
    creditedMin: 0
  }
}

/** Focused time of the current session so far, including the running segment. */
function focusedNow(t = Date.now()): number {
  return state.focusedMs + (state.phase === 'focus' && state.running && state.segmentStart ? t - state.segmentStart : 0)
}

/** Save the session's focused time so far (every minute, on pause) so Stats and the
 *  game see it straight away, not only when the session ends. */
function checkpoint(t = Date.now()): void {
  if (!state.sessionId) return
  const ms = focusedNow(t)
  update('focus_sessions', state.sessionId, { focused_seconds: Math.round(ms / 1000) })
  const whole = Math.floor(ms / 60_000)
  const credited = state.creditedMin ?? 0
  if (whole > credited) {
    reward('focus', whole - credited) // game gems
    state.creditedMin = whole
    setSetting('timer_state', state)
  }
}

export function remainingMs(): number {
  return state.running && state.endsAt ? Math.max(0, state.endsAt - Date.now()) : state.remainingMs
}

function changed(): void {
  setSetting('timer_state', state)
  listener(state, remainingMs(), true)
}

export function initTimer(onUpdate: Listener, onNotify: Notifier): void {
  listener = onUpdate
  notify = onNotify
  settings = { ...DEFAULT_SETTINGS, ...(getSetting<Partial<TimerSettings>>('timer_settings') ?? {}) }
  state = getSetting<InternalState>('timer_state') ?? idle('focus')
  // The phase ended while the app was closed: record it, don't pop a stale notification.
  if (state.running && state.endsAt && state.endsAt <= Date.now()) complete(true)
  else if (state.sessionId && state.focusedMs > 0) checkpoint() // older versions only saved at the end

  setInterval(() => {
    if (!state.running) return
    if (state.endsAt! <= Date.now()) complete(false)
    else {
      if (state.phase === 'focus' && Math.floor(focusedNow() / 60_000) > (state.creditedMin ?? 0)) checkpoint()
      listener(state, remainingMs(), false) // per-second tick for the tray
    }
  }, 1000)
}

export const getState = (): TimerState => state
export const getSettings = (): TimerSettings => settings

export function setSettings(patch: Partial<TimerSettings>): TimerSettings {
  settings = { ...settings, ...patch }
  setSetting('timer_settings', settings)
  // If the timer hasn't been started yet, show the new length straight away.
  if (!state.running && state.remainingMs === state.durationMs) state = { ...idle(state.phase), roundsDone: state.roundsDone }
  changed()
  return settings
}

export function setContext(ctx: Partial<TimerContext>): void {
  state = { ...state, ...ctx }
  if (state.sessionId) {
    update('focus_sessions', state.sessionId, {
      task_id: state.taskId,
      module_id: state.moduleId,
      project_id: state.projectId,
      language_id: state.languageId ?? null
    })
  }
  changed()
}

export function start(): void {
  if (state.running) return
  const t = Date.now()
  if (state.phase === 'focus' && !state.sessionId) {
    const mode = get<Profile>('profiles', getProfileId())?.mode ?? 'study'
    const session = create<FocusSession>('focus_sessions', {
      started_at: iso(t),
      planned_minutes: Math.round(state.durationMs / 60_000),
      mode,
      task_id: state.taskId,
      module_id: state.moduleId,
      project_id: state.projectId,
      language_id: state.languageId ?? null
    })
    state.sessionId = session.id
  }
  state.running = true
  state.endsAt = t + state.remainingMs
  state.segmentStart = t
  changed()
}

/** Add the time since the last start to the session's focused time. */
function accumulate(t: number): void {
  if (state.phase === 'focus' && state.segmentStart) state.focusedMs += t - state.segmentStart
  state.segmentStart = null
}

export function pause(): void {
  if (!state.running) return
  const t = Date.now()
  state.remainingMs = Math.max(0, state.endsAt! - t)
  accumulate(t)
  state.running = false
  state.endsAt = null
  checkpoint(t)
  changed()
}

/** Close the focus_sessions row. Abandoned sessions under a minute are discarded. */
function finishSession(completed: boolean, endT: number): void {
  if (!state.sessionId) return
  if (!completed && state.focusedMs < 60_000) {
    softDelete('focus_sessions', state.sessionId)
  } else {
    update('focus_sessions', state.sessionId, {
      ended_at: iso(endT),
      focused_seconds: Math.round(state.focusedMs / 1000),
      completed: completed ? 1 : 0
    })
    const left = Math.floor(state.focusedMs / 60_000) - (state.creditedMin ?? 0)
    if (left > 0) reward('focus', left) // game gems for minutes not yet credited
  }
  state.sessionId = null
  state.focusedMs = 0
  state.creditedMin = 0
}

/** Stop and rewind the current phase. */
export function reset(): void {
  const t = Date.now()
  if (state.running) accumulate(t)
  if (state.phase === 'focus') finishSession(false, t)
  state = idle(state.phase)
  changed()
}

/** Jump to the next phase without finishing this one. */
export function skip(): void {
  const t = Date.now()
  if (state.running) accumulate(t)
  if (state.phase === 'focus') finishSession(false, t)
  state = idle(state.phase === 'focus' ? 'short_break' : 'focus')
  changed()
}

function complete(silent: boolean): void {
  const endT = state.endsAt ?? Date.now()
  const wasFocus = state.phase === 'focus'
  if (wasFocus) {
    accumulate(endT)
    finishSession(true, endT)
    state.roundsDone += 1
  }
  const next: TimerPhase = wasFocus
    ? state.roundsDone % settings.longEvery === 0
      ? 'long_break'
      : 'short_break'
    : 'focus'
  state = idle(next)

  const autoStart = wasFocus ? settings.autoStartBreaks : settings.autoStartFocus
  if (!silent) {
    const mins = Math.round(durationFor(next) / 60_000)
    if (wasFocus) {
      notify('Focus session done 🎉', `${next === 'long_break' ? 'Long' : 'Short'} break: ${mins} min${autoStart ? ' — started' : ''}.`)
    } else {
      notify("Break's over", autoStart ? `Focus started: ${mins} min.` : 'Ready for the next focus session?')
    }
  }
  if (autoStart && !silent) start()
  else changed()
}
