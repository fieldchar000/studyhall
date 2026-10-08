// "Pixel Quest": a gacha + idle RPG fuelled by studying. Shared by the main process
// (the only place game state changes) and the UI (which replays the same maths for
// smooth animation between saves).
//
// Loop: study → 💎 gems → summon heroes → party auto-battles stages → 🪙 gold →
// level heroes → beat the boss every 10 stages → new zone (with a new weakness).

export type Element = 'fire' | 'water' | 'leaf' | 'light' | 'dark'
export type HeroClass = 'knight' | 'archer' | 'mage' | 'rogue' | 'cleric'
export type Rarity = 1 | 2 | 3 | 4

export interface HeroDef {
  id: string
  name: string
  title: string
  cls: HeroClass
  el: Element
  rarity: Rarity
  /** Sprite colours: hair/hat, outfit, outfit shade, accent, skin */
  pal: { h: string; o: string; O: string; a: string; s: string }
}

export const RARITY: Record<Rarity, { name: string; stars: string; color: string; dps: number; cost: number; rate: number }> = {
  1: { name: 'Common', stars: '★', color: '#a3a3a3', dps: 4, cost: 15, rate: 0.6 },
  2: { name: 'Rare', stars: '★★', color: '#38bdf8', dps: 10, cost: 30, rate: 0.3 },
  3: { name: 'Epic', stars: '★★★', color: '#c084fc', dps: 26, cost: 60, rate: 0.085 },
  4: { name: 'Legendary', stars: '★★★★', color: '#fbbf24', dps: 70, cost: 120, rate: 0.015 }
}

export const ELEMENTS: Record<Element, { name: string; color: string; dark: string; icon: string; beats: Element }> = {
  fire: { name: 'Fire', color: '#fb923c', dark: '#c2410c', icon: '🔥', beats: 'leaf' },
  leaf: { name: 'Leaf', color: '#4ade80', dark: '#15803d', icon: '🍃', beats: 'water' },
  water: { name: 'Water', color: '#38bdf8', dark: '#1d4ed8', icon: '💧', beats: 'fire' },
  light: { name: 'Light', color: '#fde68a', dark: '#ca8a04', icon: '✨', beats: 'dark' },
  dark: { name: 'Dark', color: '#c4b5fd', dark: '#6d28d9', icon: '🌙', beats: 'light' }
}

/** Each class in the party adds its buff once (so mixing classes pays off). */
export const CLASSES: Record<HeroClass, { name: string; buff: string }> = {
  knight: { name: 'Knight', buff: 'Guard: boss timer +5s' },
  archer: { name: 'Archer', buff: 'Volley: +25% damage on normal stages' },
  mage: { name: 'Mage', buff: 'Arcane: +50% damage vs bosses' },
  rogue: { name: 'Rogue', buff: 'Plunder: +30% gold' },
  cleric: { name: 'Cleric', buff: 'Bless: +15% party damage' }
}

const p = (h: string, o: string, O: string, a: string, s = '#f5c9a0'): HeroDef['pal'] => ({ h, o, O, a, s })

export const HEROES: HeroDef[] = [
  { id: 'pip', name: 'Pip', title: 'Squire with big dreams', cls: 'knight', el: 'leaf', rarity: 1, pal: p('#a16207', '#65a30d', '#3f6212', '#facc15') },
  { id: 'moss', name: 'Moss', title: 'Forest scout', cls: 'archer', el: 'leaf', rarity: 1, pal: p('#166534', '#4d7c0f', '#365314', '#a3e635') },
  { id: 'ember', name: 'Ember', title: 'Apprentice pyromancer', cls: 'mage', el: 'fire', rarity: 1, pal: p('#b91c1c', '#ea580c', '#9a3412', '#fde047') },
  { id: 'drip', name: 'Drip', title: 'Canal pickpocket', cls: 'rogue', el: 'water', rarity: 1, pal: p('#1e3a8a', '#0e7490', '#164e63', '#67e8f9', '#e0b090') },
  { id: 'tilly', name: 'Tilly', title: 'Village healer', cls: 'cleric', el: 'light', rarity: 1, pal: p('#fbbf24', '#f5f5f4', '#d6d3d1', '#facc15') },
  { id: 'grim', name: 'Grimble', title: 'Gloomy lockpick', cls: 'rogue', el: 'dark', rarity: 1, pal: p('#3f3f46', '#52525b', '#27272a', '#a78bfa', '#d4b896') },
  { id: 'sol', name: 'Sol', title: 'Ember guard', cls: 'knight', el: 'fire', rarity: 2, pal: p('#dc2626', '#b45309', '#78350f', '#fbbf24') },
  { id: 'nami', name: 'Nami', title: 'Tide weaver', cls: 'mage', el: 'water', rarity: 2, pal: p('#0284c7', '#2563eb', '#1e3a8a', '#7dd3fc', '#f1d0b0') },
  { id: 'briar', name: 'Briar', title: 'Thorn sniper', cls: 'archer', el: 'fire', rarity: 2, pal: p('#7c2d12', '#c2410c', '#7c2d12', '#fdba74', '#c8946a') },
  { id: 'luma', name: 'Luma', title: 'Lantern priestess', cls: 'cleric', el: 'light', rarity: 2, pal: p('#fde68a', '#fef3c7', '#fcd34d', '#f59e0b') },
  { id: 'vex', name: 'Vex', title: 'Hex scholar', cls: 'mage', el: 'dark', rarity: 2, pal: p('#581c87', '#6b21a8', '#3b0764', '#e879f9', '#e8c4a8') },
  { id: 'aria', name: 'Aria', title: 'Stormcaller', cls: 'archer', el: 'water', rarity: 3, pal: p('#e0f2fe', '#0369a1', '#0c4a6e', '#bae6fd', '#f1d0b0') },
  { id: 'kael', name: 'Kael', title: 'Oathbreaker', cls: 'knight', el: 'dark', rarity: 3, pal: p('#18181b', '#3f3f46', '#18181b', '#a855f7', '#c8a080') },
  { id: 'fern', name: 'Fernwyn', title: 'Grove keeper', cls: 'cleric', el: 'leaf', rarity: 3, pal: p('#65a30d', '#15803d', '#14532d', '#fbcfe8', '#f1d0b0') },
  { id: 'pyra', name: 'Pyra', title: 'Phoenix sorceress', cls: 'mage', el: 'fire', rarity: 4, pal: p('#f97316', '#dc2626', '#7f1d1d', '#fde047', '#f5c9a0') },
  { id: 'aurelia', name: 'Aurelia', title: 'Sun paladin', cls: 'knight', el: 'light', rarity: 4, pal: p('#fde047', '#fef9c3', '#eab308', '#f97316', '#f5d0b0') },
  { id: 'nyx', name: 'Nyx', title: 'Moonlit shadow', cls: 'rogue', el: 'dark', rarity: 4, pal: p('#e9d5ff', '#1e1b4b', '#0f0a2e', '#c084fc', '#d8c0e0') }
]
export const HERO = Object.fromEntries(HEROES.map((h) => [h.id, h])) as Record<string, HeroDef>

export type EnemyKind = 'slime' | 'shroom' | 'crab' | 'bat' | 'imp' | 'golem' | 'wisp' | 'skeleton' | 'ghost'

export interface Zone {
  name: string
  el: Element
  enemies: EnemyKind[]
  boss: string
  bossKind: EnemyKind
}

export const ZONES: Zone[] = [
  { name: 'Mossy Meadow', el: 'leaf', enemies: ['slime', 'shroom'], boss: 'King Slime', bossKind: 'slime' },
  { name: 'Tide Caves', el: 'water', enemies: ['crab', 'bat'], boss: 'Kraken Crab', bossKind: 'crab' },
  { name: 'Ember Peaks', el: 'fire', enemies: ['imp', 'golem'], boss: 'Magma Golem', bossKind: 'golem' },
  { name: 'Crystal Spire', el: 'light', enemies: ['wisp', 'golem'], boss: 'Prism Warden', bossKind: 'wisp' },
  { name: 'Shadow Keep', el: 'dark', enemies: ['skeleton', 'ghost'], boss: 'Lich King', bossKind: 'skeleton' }
]

// ---------- Numbers ----------

export const KILLS_PER_STAGE = 10
export const BOSS_SECONDS = 30
export const BOSS_HP_MULT = 8
export const OFFLINE_CAP_HOURS = 12
export const SUMMON_COST = 100
export const SUMMON10_COST = 900
export const PITY_EPIC = 30 // at least Epic within this many pulls
export const PITY_LEGEND = 90 // a Legendary within this many pulls
export const STAR_MULT = [1, 1.5, 2.25, 3.25, 4.5]
export const SHARDS_FOR_STAR = [1, 2, 3, 5] // duplicates needed for 2★, 3★, 4★, 5★
export const MAX_STARS = 5
export const SPARE_DUPE_GEMS = 25 // duplicate of a 5★ hero
export const MAX_TAPS_PER_SEC = 15
export const RESPAWN_SECONDS = 1 // the next enemy walks in
export const REBIRTH_MIN_STAGE = 40

/** What studying earns: gems per unit, and how many units count per day. */
export const REWARDS = {
  focus: { gems: 5, cap: 600, label: 'focused minute' },
  task: { gems: 15, cap: 12, label: 'task completed' },
  card: { gems: 1, cap: 150, label: 'flashcard reviewed' },
  habit: { gems: 10, cap: 10, label: 'habit checked off' },
  language: { gems: 3, cap: 90, label: 'minute of language practice logged' }
} as const
export type RewardKind = keyof typeof REWARDS

export const zoneOf = (stage: number): Zone => ZONES[Math.floor((stage - 1) / 10) % ZONES.length]
export const isBoss = (stage: number): boolean => stage % 10 === 0
// Steep for the first two zones (so the start isn't over in minutes), gentler after.
export const enemyHp = (stage: number): number =>
  Math.round(stage <= 20 ? 10 * 1.5 ** (stage - 1) : 10 * 1.5 ** 19 * 1.12 ** (stage - 20))
export const bossHp = (stage: number): number => enemyHp(stage) * BOSS_HP_MULT
// Gold grows slower than HP, so every hero level costs a bit more effort than the last.
export const goldPerKill = (stage: number): number => Math.ceil(0.1 * enemyHp(stage) ** 0.75)
export const bossGold = (stage: number): number => goldPerKill(stage) * 25
export const bossGems = (stage: number): number => (stage % 50 === 0 ? 150 : 40)

const ROMAN = ['', '', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X']
export function stageName(stage: number): string {
  const tier = Math.floor((stage - 1) / 50) + 1
  return `${zoneOf(stage).name}${ROMAN[tier] ?? ` ${tier}`}`
}
export const stageInZone = (stage: number): number => ((stage - 1) % 10) + 1

/** Which enemy is on screen (varies with kills so the parade looks alive). */
export function enemyKind(stage: number, kills: number): EnemyKind {
  const z = zoneOf(stage)
  return z.enemies[(stage + kills) % z.enemies.length]
}

// ---------- State ----------

export interface OwnedHero {
  level: number
  stars: number
  shards: number
}

export interface AwaySummary {
  seconds: number
  gold: number
  kills: number
  bosses: number
  fromStage: number
  toStage: number
}

export interface GameData {
  v: 2
  gold: number
  gems: number
  stage: number // current (never a boss stage: bosses are fought from the stage before)
  kills: number // on the current stage; ≥ KILLS_PER_STAGE before a boss = boss ready
  enemyHp: number // remaining HP of the enemy on screen
  spawn: number // seconds until the next enemy has walked in
  runBest: number // furthest stage since the last rebirth
  relics: number // permanent: +10% damage and +5% gold each
  rebirths: number
  bestBoss: number // highest boss stage beaten (first clears give gems)
  heroes: Record<string, OwnedHero>
  party: string[]
  pulls: number
  pityEpic: number
  pityLegend: number
  freeDay: string | null // local date of the last free daily summon
  autoBoss: boolean // the party fights bosses by itself when it can win without help
  lastTick: string
  day: string // local date the counters below belong to
  today: Partial<Record<RewardKind, number>>
  gemsToday: number
  stats: { gemsEarned: number; goldEarned: number; kills: number; bosses: number; focusMin: number }
  away: AwaySummary | null // shown once as "welcome back"
}

export const localDay = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function newGame(): GameData {
  return {
    v: 2,
    gold: 0,
    gems: 300, // enough for three summons straight away
    stage: 1,
    kills: 0,
    enemyHp: enemyHp(1),
    spawn: 0,
    runBest: 1,
    relics: 0,
    rebirths: 0,
    bestBoss: 0,
    heroes: { pip: { level: 1, stars: 1, shards: 0 } },
    party: ['pip'],
    pulls: 0,
    pityEpic: 0,
    pityLegend: 0,
    freeDay: null,
    autoBoss: true,
    lastTick: new Date().toISOString(),
    day: localDay(),
    today: {},
    gemsToday: 0,
    stats: { gemsEarned: 0, goldEarned: 0, kills: 0, bosses: 0, focusMin: 0 },
    away: null
  }
}

/** Reads the saved JSON. Saves from the old "Study Garden" become a head start. */
export function parseGame(raw: string, legacyCoins = 0): GameData {
  let j: Record<string, unknown> = {}
  try {
    j = JSON.parse(raw) as Record<string, unknown>
  } catch {
    /* corrupt → new game */
  }
  if (j.v === 2) {
    const base = newGame()
    const d = { ...base, ...(j as Partial<GameData>) } as GameData
    d.stats = { ...base.stats, ...d.stats }
    d.party = d.party.filter((id) => HERO[id] && d.heroes[id]).slice(0, 4)
    return d
  }
  const d = newGame()
  const minutes = Number(j.focusMinutesCredited) || 0
  if (minutes > 0 || legacyCoins > 0) {
    d.gems += Math.min(3000, minutes * REWARDS.focus.gems)
    d.gold = Math.min(5000, legacyCoins)
    d.stats.focusMin = minutes
  }
  return d
}

// ---------- Power ----------

export const heroDps = (id: string, h: OwnedHero): number =>
  RARITY[HERO[id].rarity].dps * h.level * 2 ** Math.floor(h.level / 25) * STAR_MULT[h.stars - 1]

export const levelCost = (id: string, level: number): number => Math.ceil(RARITY[HERO[id].rarity].cost * 1.07 ** (level - 1))

export function advantage(attacker: Element, defender: Element): number {
  if (ELEMENTS[attacker].beats === defender) return 1.5
  if (ELEMENTS[defender].beats === attacker) return 0.7
  return 1
}

const has = (d: GameData, cls: HeroClass): boolean => d.party.some((id) => HERO[id]?.cls === cls)
export const collectionBonus = (d: GameData): number => 1 + 0.03 * Object.keys(d.heroes).length
export const relicDamage = (d: GameData): number => 1 + 0.1 * d.relics
export const relicGold = (d: GameData): number => 1 + 0.05 * d.relics
export const goldMult = (d: GameData): number => (has(d, 'rogue') ? 1.3 : 1) * relicGold(d)
export const bossSeconds = (d: GameData): number => BOSS_SECONDS + (has(d, 'knight') ? 5 : 0)

/** Party damage per second against an enemy of element `el`. */
export function partyDps(d: GameData, el: Element, boss: boolean): number {
  let sum = 0
  for (const id of d.party) {
    const h = d.heroes[id]
    if (h && HERO[id]) sum += heroDps(id, h) * advantage(HERO[id].el, el)
  }
  let mult = collectionBonus(d) * relicDamage(d)
  if (has(d, 'cleric')) mult *= 1.15
  if (!boss && has(d, 'archer')) mult *= 1.25
  if (boss && has(d, 'mage')) mult *= 1.5
  return sum * mult
}

/** One click on the enemy: 12% of a second of party damage (at least 1). */
export const tapDamage = (d: GameData, boss = false): number => Math.max(1, partyDps(d, zoneOf(boss ? d.stage + 1 : d.stage).el, boss) * 0.12)

export const bossReady = (d: GameData): boolean => d.kills >= KILLS_PER_STAGE && isBoss(d.stage + 1)
export const canAutoBeat = (d: GameData, bossStage: number): boolean =>
  partyDps(d, zoneOf(bossStage).el, true) * bossSeconds(d) >= bossHp(bossStage)

// ---------- Simulation ----------

export interface Progress {
  gold: number
  kills: number
  bosses: number
  gems: number
}

function beatBoss(d: GameData, stage: number, r: Progress): void {
  const g = bossGold(stage) * goldMult(d)
  d.gold += g
  r.gold += g
  r.bosses++
  d.stats.bosses++
  if (stage > d.bestBoss) {
    d.bestBoss = stage
    d.gems += bossGems(stage)
    d.stats.gemsEarned += bossGems(stage)
    r.gems += bossGems(stage)
  }
  d.stage = stage + 1
  d.runBest = Math.max(d.runBest, d.stage)
  d.kills = 0
  d.enemyHp = enemyHp(d.stage)
  d.spawn = RESPAWN_SECONDS
}

function killOne(d: GameData, r: Progress): void {
  const g = goldPerKill(d.stage) * goldMult(d)
  d.gold += g
  r.gold += g
  r.kills++
  d.kills++
  d.stats.kills++
  d.enemyHp = enemyHp(d.stage)
  d.spawn = RESPAWN_SECONDS
  if (d.kills >= KILLS_PER_STAGE) {
    const next = d.stage + 1
    if (!isBoss(next)) {
      d.stage = next
      d.runBest = Math.max(d.runBest, next)
      d.kills = 0
      d.enemyHp = enemyHp(next)
    } else if (d.autoBoss && canAutoBeat(d, next)) beatBoss(d, next, r)
  }
}

/** Fight for `seconds` (plus extra click damage). Deterministic, so the UI can replay it. */
export function advance(d: GameData, seconds: number, extraDamage = 0): Progress {
  const r: Progress = { gold: 0, kills: 0, bosses: 0, gems: 0 }
  let t = Math.max(0, seconds)
  let extra = Math.max(0, extraDamage)
  if (!(d.enemyHp > 0)) d.enemyHp = enemyHp(d.stage)
  // Click damage = extra seconds of party damage (keeps it to one fast code path).
  const dps0 = partyDps(d, zoneOf(d.stage).el, false)
  if (dps0 > 0) {
    t += extra / dps0
    extra = 0
  }
  for (let guard = 0; guard < 20_000; guard++) {
    if (extra > 0) {
      if (extra >= d.enemyHp) {
        extra -= d.enemyHp
        killOne(d, r)
        continue
      }
      d.enemyHp -= extra
      extra = 0
    }
    if (t <= 0) break
    if (d.spawn > 0) {
      // the next enemy is still walking in
      const w = Math.min(d.spawn, t)
      d.spawn -= w
      t -= w
      continue
    }
    const dps = partyDps(d, zoneOf(d.stage).el, false)
    if (dps <= 0) break
    const need = d.enemyHp / dps
    if (need > t) {
      d.enemyHp -= dps * t
      break
    }
    t -= need
    killOne(d, r)
    // Waiting at a boss we can't beat: farm the rest in one go.
    if (bossReady(d) && !(d.autoBoss && canAutoBeat(d, d.stage + 1))) {
      const per = enemyHp(d.stage) / dps + RESPAWN_SECONDS
      const n = Math.floor(t / per)
      if (n > 0) {
        const g = n * goldPerKill(d.stage) * goldMult(d)
        d.gold += g
        r.gold += g
        r.kills += n
        d.kills += n
        d.stats.kills += n
        t -= n * per
      }
    }
  }
  d.stats.goldEarned += r.gold
  return r
}

/** A boss fight the player watched (and clicked in). Checked against what was possible. */
export function resolveBoss(d: GameData, taps: number, elapsed: number): boolean {
  if (!bossReady(d)) return false
  const stage = d.stage + 1
  const secs = Math.min(Math.max(0, elapsed), bossSeconds(d))
  const clicks = Math.min(Math.max(0, Math.floor(taps)), Math.ceil(secs * MAX_TAPS_PER_SEC))
  const dmg = partyDps(d, zoneOf(stage).el, true) * secs + clicks * tapDamage(d, true)
  if (dmg < bossHp(stage) * 0.999) return false
  beatBoss(d, stage, { gold: 0, kills: 0, bosses: 0, gems: 0 })
  return true
}

/** Roll one summon. `forceRare` = the 10th pull of a ten-summon with nothing Rare+ yet. */
export function rollRarity(d: GameData, rnd: () => number, forceRare = false): Rarity {
  let rarity: Rarity
  if (d.pityLegend >= PITY_LEGEND - 1) rarity = 4
  else if (d.pityEpic >= PITY_EPIC - 1) rarity = rnd() < 0.15 ? 4 : 3
  else {
    const r = rnd()
    rarity = r < RARITY[4].rate ? 4 : r < RARITY[4].rate + RARITY[3].rate ? 3 : r < RARITY[4].rate + RARITY[3].rate + RARITY[2].rate ? 2 : 1
    if (forceRare && rarity === 1) rarity = 2
  }
  d.pulls++
  d.pityLegend = rarity === 4 ? 0 : d.pityLegend + 1
  d.pityEpic = rarity >= 3 ? 0 : d.pityEpic + 1
  return rarity
}

export interface SummonResult {
  id: string
  isNew: boolean
  shard: boolean // duplicate → +1 shard toward the next ★
  gems: number // duplicate of a maxed hero → gems back
}

export function grantHero(d: GameData, id: string): SummonResult {
  const h = d.heroes[id]
  if (!h) {
    d.heroes[id] = { level: 1, stars: 1, shards: 0 }
    if (d.party.length < 4) d.party.push(id)
    return { id, isNew: true, shard: false, gems: 0 }
  }
  const needed = SHARDS_FOR_STAR.slice(h.stars - 1).reduce((a, b) => a + b, 0)
  if (h.shards < needed) {
    h.shards++
    return { id, isNew: false, shard: true, gems: 0 }
  }
  d.gems += SPARE_DUPE_GEMS
  return { id, isNew: false, shard: false, gems: SPARE_DUPE_GEMS }
}

/** Relics a rebirth would give now (from the furthest stage this run). */
export const relicsFor = (runBest: number): number => (runBest < REBIRTH_MIN_STAGE ? 0 : Math.floor(((runBest - 30) / 4) ** 1.3))

/** Start again from stage 1 with every hero back at level 1, for permanent relics. */
export function rebirth(d: GameData): number {
  const r = relicsFor(d.runBest)
  if (!r) return 0
  d.relics += r
  d.rebirths++
  d.stage = 1
  d.kills = 0
  d.enemyHp = enemyHp(1)
  d.spawn = 0
  d.gold = 0
  d.runBest = 1
  for (const h of Object.values(d.heroes)) h.level = 1
  return r
}

export const starCost = (h: OwnedHero): number | null => (h.stars >= MAX_STARS ? null : SHARDS_FOR_STAR[h.stars - 1])

/** Gems for something studied today, respecting the daily caps. Returns gems added. */
export function addReward(d: GameData, kind: RewardKind, units: number): number {
  const day = localDay()
  if (d.day !== day) {
    d.day = day
    d.today = {}
    d.gemsToday = 0
  }
  const used = d.today[kind] ?? 0
  const n = Math.max(0, Math.min(Math.floor(units), REWARDS[kind].cap - used))
  if (!n) return 0
  d.today[kind] = used + n
  const gems = n * REWARDS[kind].gems
  d.gems += gems
  d.gemsToday += gems
  d.stats.gemsEarned += gems
  if (kind === 'focus') d.stats.focusMin += n
  return gems
}

export const fmtNum = (n: number): string => {
  if (n < 1000) return String(Math.floor(n))
  const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc']
  let i = -1
  while (n >= 1000 && i < units.length - 1) {
    n /= 1000
    i++
  }
  return `${n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : Math.floor(n)}${units[i]}`
}
