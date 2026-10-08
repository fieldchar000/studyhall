// Pixel Quest bookkeeping in the main process: the only place game state changes.
// One game_state row per profile (JSON in `state`), so it syncs like everything else.
// Rewards for studying are added here even while the game page is closed.

import {
  addReward,
  advance,
  bossReady,
  grantHero,
  HERO,
  HEROES,
  localDay,
  OFFLINE_CAP_HOURS,
  parseGame,
  rebirth,
  resolveBoss,
  rollRarity,
  starCost,
  SUMMON10_COST,
  SUMMON_COST,
  levelCost,
  tapDamage,
  type GameData,
  type RewardKind,
  type SummonResult
} from '@shared/game'
import type { GameAction, GameResult, GameRow } from '@shared/types'
import { create, getProfileId, list, update } from './db'

let lastSave = 0

function load(): { row: GameRow; data: GameData } {
  // Newest row wins if two PCs each started a game before syncing.
  const rows = list<GameRow>('game_state', { owner_id: getProfileId() }).sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  const row = rows[0] ?? create<GameRow>('game_state', { currency: 0, state: '{}' })
  return { row, data: parseGame(row.state, row.currency) }
}

function save(row: GameRow, data: GameData): void {
  update('game_state', row.id, { currency: Math.floor(data.gems), state: JSON.stringify(data) })
  lastSave = Date.now()
}

/** Fight up to now. Returns whether this was a long absence (worth saving + a summary). */
function catchUp(data: GameData): boolean {
  const now = Date.now()
  const secs = Math.min(OFFLINE_CAP_HOURS * 3600, Math.max(0, (now - Date.parse(data.lastTick)) / 1000))
  const from = data.stage
  const r = advance(data, secs)
  data.lastTick = new Date(now).toISOString()
  if (secs >= 300 && (r.gold > 0 || r.kills > 0)) {
    data.away = { seconds: Math.round(secs), gold: r.gold, kills: r.kills, bosses: r.bosses, fromStage: from, toStage: data.stage }
    return true
  }
  return false
}

/** Studying earned something: add gems (daily caps apply). */
export function reward(kind: RewardKind, units: number): void {
  if (units <= 0) return
  const { row, data } = load()
  catchUp(data)
  if (addReward(data, kind, units) > 0 || data.away) save(row, data)
}

export function getGame(): GameResult {
  const { row, data } = load()
  // An unsaved catch-up is fine: the same maths gives the same answer next time.
  if (catchUp(data) || Date.now() - lastSave > 60_000) save(row, data)
  return { data }
}

const int = (v: unknown, min: number, max: number): number => Math.min(max, Math.max(min, Math.floor(Number(v) || 0)))

export function gameAct(action: GameAction): GameResult {
  const { row, data } = load()
  const result: GameResult = { data }
  switch (action?.type) {
    case 'tick': {
      const taps = int(action.taps, 0, 600)
      const away = catchUp(data)
      if (taps > 0) advance(data, 0, taps * tapDamage(data))
      if (away || taps > 0 || Date.now() - lastSave > 60_000) save(row, data)
      return result
    }
    case 'summon': {
      catchUp(data)
      const free = action.free === true
      const ticket = action.ticket === true
      const count = free || ticket ? 1 : action.count === 10 ? 10 : 1
      if (free) {
        if (data.freeDay === localDay()) return { data, error: 'Free summon already used today.' }
        data.freeDay = localDay()
      } else if (ticket) {
        if (data.tickets < 1) return { data, error: 'No summon tickets — finish a focus session to earn one.' }
        data.tickets--
      } else {
        const cost = count === 10 ? SUMMON10_COST : SUMMON_COST
        if (data.gems < cost) return { data, error: 'Not enough gems.' }
        data.gems -= cost
      }
      const out: SummonResult[] = []
      let gotRare = false
      for (let i = 0; i < count; i++) {
        const rarity = rollRarity(data, Math.random, count === 10 && i === 9 && !gotRare)
        if (rarity >= 2) gotRare = true
        const pool = HEROES.filter((h) => h.rarity === rarity)
        out.push(grantHero(data, pool[Math.floor(Math.random() * pool.length)].id))
      }
      save(row, data)
      return { data, summon: out }
    }
    case 'level': {
      catchUp(data)
      const h = data.heroes[action.hero]
      if (!h || !HERO[action.hero]) return { data, error: 'Unknown hero.' }
      const n = int(action.n, 1, 1000)
      for (let i = 0; i < n; i++) {
        const cost = levelCost(action.hero, h.level)
        if (data.gold < cost) break
        data.gold -= cost
        h.level++
      }
      save(row, data)
      return result
    }
    case 'star': {
      catchUp(data)
      const h = data.heroes[action.hero]
      const cost = h ? starCost(h) : null
      if (!h || cost === null || h.shards < cost) return { data, error: 'Not enough shards.' }
      h.shards -= cost
      h.stars++
      save(row, data)
      return result
    }
    case 'party': {
      catchUp(data)
      const party = (Array.isArray(action.party) ? action.party : []).filter((id, i, a) => typeof id === 'string' && data.heroes[id] && HERO[id] && a.indexOf(id) === i)
      data.party = party.slice(0, 4)
      save(row, data)
      return result
    }
    case 'boss': {
      catchUp(data)
      if (!bossReady(data)) return { data, error: 'No boss to fight yet.' }
      const before = data.gems
      const win = resolveBoss(data, int(action.taps, 0, 10_000), Number(action.elapsed) || 0)
      save(row, data)
      return { data, boss: { win, gems: data.gems - before } }
    }
    case 'autoBoss': {
      catchUp(data)
      data.autoBoss = !!action.on
      save(row, data)
      return result
    }
    case 'rebirth': {
      catchUp(data)
      const relics = rebirth(data)
      if (!relics) return { data, error: 'Reach stage 40 first.' }
      save(row, data)
      return { data, relics }
    }
    case 'dismissAway': {
      data.away = null
      catchUp(data)
      data.away = null
      save(row, data)
      return result
    }
    default:
      return { data, error: 'Unknown action.' }
  }
}
