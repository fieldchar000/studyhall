// "Study Garden" idle game rules, shared by the main process and the UI.
// Coins come from focus time; buildings bought with coins add a small passive income.

import type { GameData } from './types'

export interface Building {
  id: string
  name: string
  emoji: string
  baseCost: number
  perHour: number
  blurb: string
}

export const BUILDINGS: Building[] = [
  { id: 'sprout', name: 'Sprout', emoji: '🌱', baseCost: 15, perHour: 1, blurb: 'A tiny start.' },
  { id: 'shelf', name: 'Bookshelf', emoji: '📚', baseCost: 100, perHour: 6, blurb: 'Knowledge compounds.' },
  { id: 'lamp', name: 'Desk lamp', emoji: '💡', baseCost: 600, perHour: 30, blurb: 'Late-night clarity.' },
  { id: 'library', name: 'Library', emoji: '🏛️', baseCost: 4000, perHour: 150, blurb: 'Quiet halls of focus.' },
  { id: 'observatory', name: 'Observatory', emoji: '🔭', baseCost: 25000, perHour: 800, blurb: 'Big-picture thinking.' }
]

export const COST_GROWTH = 1.15 // each extra copy costs 15% more
export const OFFLINE_CAP_HOURS = 12 // passive income stops piling up after this long away

export const buildingCost = (b: Building, owned: number): number => Math.round(b.baseCost * COST_GROWTH ** owned)

/** Coins per focused minute: 2 at level 0, +1 per "Sharper focus" upgrade. */
export const coinsPerFocusMinute = (level: number): number => 2 + level
export const focusUpgradeCost = (level: number): number => Math.round(50 * 2 ** level)

export function passivePerHour(data: GameData): number {
  return BUILDINGS.reduce((sum, b) => sum + b.perHour * (data.owned[b.id] ?? 0), 0)
}

export function emptyGame(): GameData {
  return { owned: {}, focusLevel: 0, lastTick: new Date().toISOString(), totalEarned: 0, focusMinutesCredited: 0 }
}

export function parseGame(raw: string): GameData {
  try {
    return { ...emptyGame(), ...(JSON.parse(raw) as Partial<GameData>) }
  } catch {
    return emptyGame()
  }
}

/** Passive coins earned between lastTick and now (capped). */
export function passiveSince(data: GameData, now = Date.now()): number {
  const hours = Math.min(OFFLINE_CAP_HOURS, Math.max(0, (now - Date.parse(data.lastTick)) / 3_600_000))
  return passivePerHour(data) * hours
}
