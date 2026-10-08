// Idle game bookkeeping in the main process: one game_state row per profile.
// Focus minutes are credited when a focus session is saved (even if the game page is closed).

import { coinsPerFocusMinute, emptyGame, parseGame, passiveSince } from '@shared/game'
import type { GameRow } from '@shared/types'
import { create, getProfileId, list, update } from './db'

function row(): GameRow {
  const existing = list<GameRow>('game_state', { owner_id: getProfileId() })[0]
  return existing ?? create<GameRow>('game_state', { currency: 0, state: JSON.stringify(emptyGame()) })
}

/** Apply passive income since the last visit and return the current row. */
export function getGame(): GameRow {
  const r = row()
  const data = parseGame(r.state)
  const earned = passiveSince(data)
  if (earned < 0.01) return r
  data.lastTick = new Date().toISOString()
  data.totalEarned += earned
  return update<GameRow>('game_state', r.id, { currency: r.currency + earned, state: JSON.stringify(data) })
}

export function creditFocusMinutes(minutes: number): void {
  if (minutes <= 0) return
  const r = getGame()
  const data = parseGame(r.state)
  const coins = minutes * coinsPerFocusMinute(data.focusLevel)
  data.totalEarned += coins
  data.focusMinutesCredited += minutes
  update('game_state', r.id, { currency: r.currency + coins, state: JSON.stringify(data) })
}
