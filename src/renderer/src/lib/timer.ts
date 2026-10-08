// Live view of the focus timer that runs in the main process.

import { useEffect, useState, useSyncExternalStore } from 'react'
import type { TimerState } from '@shared/types'
import { api, notifyChanged } from './data'

let state: TimerState | null = null
const listeners = new Set<() => void>()
function set(s: TimerState): void {
  state = s
  listeners.forEach((l) => l())
}
void api.timer.state().then(set)
api.timer.onState((s) => {
  set(s)
  notifyChanged('focus_sessions') // a session may have started/finished
  notifyChanged('timer') // settings may have changed
  notifyChanged('game_state') // focus minutes earn idle-game coins
})

export function useTimerState(): TimerState | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state
  )
}

/** Remaining milliseconds, re-rendered ~4x a second while running. */
export function useRemaining(s: TimerState | null): number {
  const [, force] = useState(0)
  useEffect(() => {
    if (!s?.running) return
    const id = setInterval(() => force((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [s?.running, s?.endsAt])
  if (!s) return 0
  return s.running && s.endsAt ? Math.max(0, s.endsAt - Date.now()) : s.remainingMs
}

export function fmtClock(ms: number): string {
  const total = Math.ceil(ms / 1000)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export const PHASE_LABEL = { focus: 'Focus', short_break: 'Short break', long_break: 'Long break' } as const
