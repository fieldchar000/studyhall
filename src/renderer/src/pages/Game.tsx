// "Pixel Quest": an 8-bit gacha + idle RPG fuelled by studying.
// Study → 💎 gems → summon heroes → your party fights on its own → 🪙 gold → level up →
// beat the boss every 10 stages → new zone. Rebirth for permanent relics when you stall.

import '@fontsource/press-start-2p/latin-400.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  advantage,
  bossReady,
  bossSeconds,
  canAutoBeat,
  CLASSES,
  collectionBonus,
  ELEMENTS,
  fmtNum,
  goldMult,
  HERO,
  heroDps,
  HEROES,
  KILLS_PER_STAGE,
  levelCost,
  localDay,
  MAX_STARS,
  partyDps,
  PITY_EPIC,
  PITY_LEGEND,
  RARITY,
  REBIRTH_MIN_STAGE,
  relicsFor,
  REWARDS,
  stageInZone,
  stageName,
  starCost,
  SUMMON10_COST,
  SUMMON_COST,
  zoneOf,
  type Element,
  type GameData,
  type HeroClass,
  type RewardKind,
  type SummonResult
} from '@shared/game'
import type { GameAction, GameResult } from '@shared/types'
import { api } from '@/lib/data'
import { navigate } from '@/lib/nav'
import { Battle, FONT } from '@/game/scene'
import { heroCanvas } from '@/game/sprites'
import { isMuted, setMuted, sfx } from '@/game/sound'

type Tab = 'party' | 'summon' | 'heroes' | 'rebirth' | 'earn'

/** Total gold for the next `n` levels of a hero. */
function costFor(id: string, level: number, n: number): number {
  let sum = 0
  for (let i = 0; i < n; i++) sum += levelCost(id, level + i)
  return sum
}

/** How many levels the gold on hand buys (for the MAX button). */
function affordable(id: string, level: number, gold: number): number {
  let n = 0
  let spent = 0
  while (n < 1000) {
    const c = levelCost(id, level + n)
    if (spent + c > gold) break
    spent += c
    n++
  }
  return n
}

const strongAgainst = (el: Element): Element => (Object.keys(ELEMENTS) as Element[]).find((e) => ELEMENTS[e].beats === el)!

export function GamePage(): React.JSX.Element {
  const [data, setData] = useState<GameData | null>(null)
  const [tab, setTab] = useState<Tab>('party')
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null)
  const [reveal, setReveal] = useState<SummonResult[] | null>(null)
  const [muted, setMutedState] = useState(isMuted())
  const [, tick] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const battle = useRef<Battle | null>(null)
  const busy = useRef(false)

  const flash = useCallback((text: string, ok = true) => {
    setToast({ text, ok })
    if (!ok) sfx.error()
    setTimeout(() => setToast((t) => (t?.text === text ? null : t)), 2600)
  }, [])

  const apply = useCallback((r: GameResult) => {
    setData(r.data)
    battle.current?.setData(r.data)
  }, [])

  const act = useCallback(
    async (a: GameAction): Promise<GameResult | null> => {
      const r = await api.game.act(a)
      apply(r)
      if (r.error) {
        flash(r.error, false)
        return null
      }
      return r
    },
    [apply, flash]
  )

  // Load the save first; the canvas only exists once it has rendered.
  useEffect(() => {
    void document.fonts.load(`8px ${FONT}`)
    void api.game.get().then((r) => setData(r.data))
  }, [])

  const loaded = data !== null
  // Start the scene, then re-sync with the main process every few seconds.
  useEffect(() => {
    if (!loaded || !canvasRef.current) return
    void api.game.get().then((r) => {
      if (canvasRef.current && !battle.current) {
        battle.current = new Battle(canvasRef.current, r.data, {
          onBossEnd: (win, taps, elapsed) => {
            void api.game.act({ type: 'boss', taps, elapsed }).then((res) => {
              setTimeout(() => {
                if (battle.current) battle.current.boss = null
                apply(res)
              }, 1400)
              if (res.boss?.win) flash(`Boss defeated!${res.boss.gems ? ` +${res.boss.gems} 💎` : ''}`)
              else if (win) flash('So close — the boss got away. Level up and try again!', false)
              else flash('Out of time! Level up, swap in heroes strong against this zone, and click faster.', false)
            })
          }
        })
      }
    })
    const sync = setInterval(() => {
      const b = battle.current
      if (!b || b.boss || busy.current) return
      const taps = b.pendingTaps
      b.pendingTaps = 0
      void api.game.act({ type: 'tick', taps }).then(apply)
    }, 3000)
    const ui = setInterval(() => tick((n) => n + 1), 250)
    return () => {
      clearInterval(sync)
      clearInterval(ui)
      const b = battle.current
      if (b?.pendingTaps) void api.game.act({ type: 'tick', taps: b.pendingTaps })
      b?.destroy()
      battle.current = null
    }
  }, [loaded, apply, flash])

  // The live numbers come from the scene's local copy (it ticks every frame).
  const live = battle.current?.d ?? data
  if (!data || !live) return <div className="h-full bg-[#120e1f]" />

  const zone = zoneOf(live.stage)
  const bossStage = Math.ceil(live.stage / 10) * 10
  const bossZone = zoneOf(bossStage)
  const fighting = !!battle.current?.boss
  const ready = bossReady(live)

  const doAct = async (a: GameAction): Promise<GameResult | null> => {
    busy.current = true
    try {
      // Send any clicks first so the main process counts them.
      const b = battle.current
      if (b?.pendingTaps) {
        const taps = b.pendingTaps
        b.pendingTaps = 0
        await api.game.act({ type: 'tick', taps })
      }
      return await act(a)
    } finally {
      busy.current = false
    }
  }

  const summon = async (count: 1 | 10, free = false): Promise<void> => {
    sfx.summon()
    const r = await doAct({ type: 'summon', count, free })
    if (r?.summon) setReveal(r.summon)
  }

  return (
    <div className="min-h-full bg-[#120e1f] text-[#ede9fe]">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 p-6">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="px text-lg tracking-wider text-[#fde047]" style={{ textShadow: '3px 3px 0 #b45309' }}>
            PIXEL QUEST
          </h1>
          <div className="flex-1" />
          <Stat icon="🪙" value={fmtNum(live.gold)} label="gold" />
          <Stat icon="💎" value={fmtNum(live.gems)} label="gems" />
          {live.relics > 0 && <Stat icon="🏺" value={fmtNum(live.relics)} label="relics" />}
          <button
            className="px-btn !bg-[#3a3158] !px-2.5"
            title={muted ? 'Sound off' : 'Sound on'}
            onClick={() => {
              setMuted(!muted)
              setMutedState(!muted)
            }}
          >
            {muted ? '🔇' : '🔊'}
          </button>
        </div>

        {/* Battle */}
        <div className="px-box relative p-[3px]">
          <canvas
            ref={canvasRef}
            className="block aspect-[200/96] w-full cursor-crosshair select-none"
            style={{ imageRendering: 'pixelated' }}
            onMouseDown={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              battle.current?.tap(e.clientX - r.left, e.clientY - r.top)
            }}
          />
          <div className="pointer-events-none absolute top-3 left-4 flex flex-col gap-1.5">
            <div className="px text-[10px]" style={{ color: ELEMENTS[zone.el].color, textShadow: '2px 2px 0 #0b0712' }}>
              {ELEMENTS[zone.el].icon} {stageName(live.stage).toUpperCase()}
            </div>
            <div className="px text-[9px] text-white" style={{ textShadow: '2px 2px 0 #0b0712' }}>
              STAGE {fighting ? 10 : stageInZone(live.stage)}/10 · #{fighting ? bossStage : live.stage}
            </div>
            {!fighting && (
              <div className="flex gap-[3px]">
                {Array.from({ length: KILLS_PER_STAGE }, (_, i) => (
                  <span key={i} className="h-2 w-2" style={{ background: i < Math.min(live.kills, KILLS_PER_STAGE) ? '#fde047' : '#0b0712aa' }} />
                ))}
              </div>
            )}
          </div>
          <div className="pointer-events-none absolute bottom-3 left-4 px text-[9px] text-white" style={{ textShadow: '2px 2px 0 #0b0712' }}>
            ⚔ {fmtNum(partyDps(live, zone.el, false))} DPS · CLICK THE ENEMY!
          </div>
          {!fighting && ready && (
            <button
              className="px-btn absolute right-4 bottom-4 !bg-[#dc2626] !text-[12px]"
              style={{ animation: 'px-pulse 0.9s ease-in-out infinite' }}
              onClick={() => battle.current?.startBoss()}
            >
              ⚔ FIGHT BOSS
            </button>
          )}
        </div>

        {toast && (
          <div className={`px -mt-2 text-center text-[10px] ${toast.ok ? 'text-[#86efac]' : 'text-[#fca5a5]'}`} style={{ textShadow: '2px 2px 0 #0b0712' }}>
            {toast.text}
          </div>
        )}

        {/* Tabs */}
        <div className="px-box flex flex-col p-[3px]">
          <div className="flex flex-wrap border-b-[3px] border-[#0b0712]">
            {(
              [
                ['party', 'PARTY'],
                ['summon', 'SUMMON'],
                ['heroes', `HEROES ${Object.keys(live.heroes).length}/${HEROES.length}`],
                ['rebirth', 'REBIRTH'],
                ['earn', 'EARN 💎']
              ] as [Tab, string][]
            ).map(([k, label]) => (
              <button key={k} className="px-tab" data-active={tab === k} onClick={() => setTab(k)}>
                {label}
                {k === 'summon' && live.freeDay !== localDay() && <span className="ml-1.5 text-[#fde047]">!</span>}
              </button>
            ))}
          </div>
          <div className="p-4">
            {tab === 'party' && <PartyTab d={live} bossZone={bossZone} bossStage={bossStage} act={doAct} />}
            {tab === 'summon' && <SummonTab d={live} summon={summon} />}
            {tab === 'heroes' && <HeroesTab d={live} act={doAct} />}
            {tab === 'rebirth' && <RebirthTab d={live} act={doAct} flash={flash} />}
            {tab === 'earn' && <EarnTab d={live} />}
          </div>
        </div>

        <div className="px text-center text-[8px] leading-relaxed text-[#7c739c]">
          {fmtNum(live.stats.kills)} ENEMIES · {live.stats.bosses} BOSSES · {fmtNum(live.stats.focusMin)} FOCUS MIN · {fmtNum(live.stats.gemsEarned)} 💎 EARNED
          {live.rebirths > 0 && ` · ${live.rebirths} REBIRTHS`}
        </div>
      </div>

      {reveal && <SummonReveal results={reveal} onClose={() => setReveal(null)} />}
      {data.away && !reveal && <AwayModal d={data} onClose={() => void act({ type: 'dismissAway' })} />}
    </div>
  )
}

function Stat({ icon, value, label }: { icon: string; value: string; label: string }): React.JSX.Element {
  return (
    <div className="px-box flex items-center gap-2 px-3 py-2" title={label}>
      <span className="text-base leading-none">{icon}</span>
      <span className="px text-[11px] tabular-nums">{value}</span>
    </div>
  )
}

export function HeroSprite({ id, scale = 3, locked = false, className = '' }: { id: string; scale?: number; locked?: boolean; className?: string }): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (ref.current) heroCanvas(ref.current, id, scale, locked)
  }, [id, scale, locked])
  return <canvas ref={ref} className={className} style={{ imageRendering: 'pixelated', width: 16 * scale, height: 16 * scale }} />
}

function Stars({ n, max = MAX_STARS }: { n: number; max?: number }): React.JSX.Element {
  return (
    <span className="tracking-tight">
      {Array.from({ length: max }, (_, i) => (
        <span key={i} style={{ color: i < n ? '#fde047' : '#4b4560' }}>
          ★
        </span>
      ))}
    </span>
  )
}

function Chip({ children, color }: { children: React.ReactNode; color: string }): React.JSX.Element {
  return (
    <span className="px inline-block px-1.5 pt-[3px] pb-[2px] text-[7px] leading-none" style={{ background: color + '33', color, boxShadow: `inset 0 0 0 1px ${color}` }}>
      {children}
    </span>
  )
}

// ---------- Party ----------

function PartyTab({
  d,
  bossZone,
  bossStage,
  act
}: {
  d: GameData
  bossZone: ReturnType<typeof zoneOf>
  bossStage: number
  act: (a: GameAction) => Promise<GameResult | null>
}): React.JSX.Element {
  const strong = strongAgainst(bossZone.el)
  const classes = new Set(d.party.map((id) => HERO[id]?.cls))
  const willAuto = canAutoBeat(d, bossStage)

  const bestTeam = (): void => {
    const pick = Object.keys(d.heroes)
      .sort(
        (a, b) =>
          heroDps(b, d.heroes[b]) * advantage(HERO[b].el, bossZone.el) - heroDps(a, d.heroes[a]) * advantage(HERO[a].el, bossZone.el)
      )
      .slice(0, 4)
    void act({ type: 'party', party: pick })
    sfx.level()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 text-[13px] leading-relaxed text-[#c4bde0]">
        <div className="min-w-0 flex-1">
          Next boss: <b className="text-white">{bossZone.boss}</b> at stage {bossStage} ({ELEMENTS[bossZone.el].icon} {ELEMENTS[bossZone.el].name}) —{' '}
          <b style={{ color: ELEMENTS[strong].color }}>
            {ELEMENTS[strong].icon} {ELEMENTS[strong].name}
          </b>{' '}
          heroes deal 1.5×. {bossSeconds(d)}s on the clock.
          <span className="ml-1 text-[#7c739c]">{willAuto ? 'Your party can beat it on its own.' : 'You will need to level up or click to help.'}</span>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <input type="checkbox" checked={d.autoBoss} onChange={(e) => void act({ type: 'autoBoss', on: e.target.checked })} />
          Fight bosses automatically when we can win
        </label>
        <button className="px-btn !bg-[#0f766e]" onClick={bestTeam}>
          BEST TEAM
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => {
          const id = d.party[i]
          if (!id) {
            return (
              <div key={i} className="flex min-h-28 items-center justify-center p-4 text-center text-xs text-[#7c739c]" style={{ boxShadow: 'inset 0 0 0 2px #3a3158' }}>
                Empty slot — add a hero from the Heroes tab
              </div>
            )
          }
          return <PartyCard key={id} id={id} d={d} enemyEl={bossZone.el} act={act} />
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(CLASSES) as HeroClass[]).map((c) => (
          <span
            key={c}
            className="px-2 py-1 text-[11px]"
            style={{ boxShadow: `inset 0 0 0 2px ${classes.has(c) ? '#fde047' : '#3a3158'}`, color: classes.has(c) ? '#fef9c3' : '#6b6388' }}
            title={classes.has(c) ? 'Active' : `Add a ${CLASSES[c].name} to activate`}
          >
            <b>{CLASSES[c].name}</b> · {CLASSES[c].buff}
          </span>
        ))}
        <span className="px-2 py-1 text-[11px] text-[#c4bde0]" style={{ boxShadow: 'inset 0 0 0 2px #3a3158' }}>
          Collection: +{Math.round((collectionBonus(d) - 1) * 100)}% damage
          {d.relics > 0 && ` · Relics: +${d.relics * 10}% damage, +${d.relics * 5}% gold`}
          {goldMult(d) > 1 && ` · gold ×${goldMult(d).toFixed(2)}`}
        </span>
      </div>
    </div>
  )
}

function PartyCard({ id, d, enemyEl, act }: { id: string; d: GameData; enemyEl: Element; act: (a: GameAction) => Promise<GameResult | null> }): React.JSX.Element {
  const def = HERO[id]
  const h = d.heroes[id]
  const adv = advantage(def.el, enemyEl)
  const c1 = levelCost(id, h.level)
  const c10 = costFor(id, h.level, 10)
  const max = affordable(id, h.level, d.gold)
  const level = (n: number): void => {
    void act({ type: 'level', hero: id, n })
    sfx.level()
  }
  return (
    <div className="flex gap-3 p-3" style={{ boxShadow: `inset 0 0 0 2px ${RARITY[def.rarity].color}66`, background: '#16122a' }}>
      <div className="flex flex-col items-center gap-1">
        <HeroSprite id={id} scale={4} />
        <Stars n={h.stars} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="px truncate text-[11px]" style={{ color: RARITY[def.rarity].color }}>
            {def.name.toUpperCase()}
          </span>
          <span className="px text-[9px] text-[#fde047]">LV {h.level}</span>
          <button className="ml-auto text-xs text-[#7c739c] hover:text-white" title="Remove from party" onClick={() => void act({ type: 'party', party: d.party.filter((p) => p !== id) })}>
            ✕
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          <Chip color={ELEMENTS[def.el].color}>
            {ELEMENTS[def.el].icon} {ELEMENTS[def.el].name}
          </Chip>
          <Chip color="#c4bde0">{CLASSES[def.cls].name}</Chip>
          {adv !== 1 && <Chip color={adv > 1 ? '#4ade80' : '#f87171'}>{adv > 1 ? '1.5× VS BOSS' : '0.7× VS BOSS'}</Chip>}
        </div>
        <div className="text-xs text-[#c4bde0]">⚔ {fmtNum(heroDps(id, h))} DPS</div>
        <div className="mt-auto flex flex-wrap gap-2">
          <button className="px-btn !px-2 !text-[9px]" disabled={d.gold < c1} onClick={() => level(1)}>
            +1 🪙{fmtNum(c1)}
          </button>
          <button className="px-btn !px-2 !text-[9px]" disabled={d.gold < c10} onClick={() => level(10)}>
            +10 🪙{fmtNum(c10)}
          </button>
          <button className="px-btn !bg-[#ca8a04] !px-2 !text-[9px]" disabled={max < 1} onClick={() => level(max)}>
            MAX{max > 0 ? ` +${max}` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------- Summon ----------

function SummonTab({ d, summon }: { d: GameData; summon: (count: 1 | 10, free?: boolean) => Promise<void> }): React.JSX.Element {
  const freeReady = d.freeDay !== localDay()
  return (
    <div className="grid items-center gap-6 md:grid-cols-[1fr_1.2fr]">
      <div className="relative mx-auto flex h-56 w-56 items-center justify-center">
        <div
          className="absolute inset-4 rounded-full"
          style={{ background: 'conic-gradient(#fde047, #c084fc, #38bdf8, #4ade80, #fb923c, #fde047)', animation: 'px-spin 6s linear infinite', filter: 'blur(1px)', opacity: 0.85 }}
        />
        <div className="absolute inset-9 rounded-full bg-[#120e1f]" style={{ boxShadow: 'inset 0 0 30px #c084fc' }} />
        <div className="px relative text-center text-[10px] leading-loose text-[#fde047]" style={{ textShadow: '2px 2px 0 #0b0712' }}>
          SUMMONING
          <br />
          SHRINE
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-3">
          <button className="px-btn" disabled={d.gems < SUMMON_COST} onClick={() => void summon(1)}>
            SUMMON ×1 · 💎{SUMMON_COST}
          </button>
          <button className="px-btn !bg-[#9333ea]" disabled={d.gems < SUMMON10_COST} onClick={() => void summon(10)}>
            SUMMON ×10 · 💎{SUMMON10_COST}
          </button>
          <button
            className="px-btn !bg-[#16a34a]"
            disabled={!freeReady}
            style={freeReady ? { animation: 'px-pulse 1.2s ease-in-out infinite' } : undefined}
            onClick={() => void summon(1, true)}
          >
            {freeReady ? 'FREE DAILY SUMMON' : 'FREE SUMMON: TOMORROW'}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[#c4bde0]">
          {([4, 3, 2, 1] as const).map((r) => (
            <div key={r} className="flex justify-between">
              <span style={{ color: RARITY[r].color }}>
                {RARITY[r].stars} {RARITY[r].name}
              </span>
              <span>{(RARITY[r].rate * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
        <div className="text-xs leading-relaxed text-[#a79fc7]">
          Guaranteed <b className="text-[#c084fc]">Epic or better</b> within {PITY_EPIC - d.pityEpic} summons and a{' '}
          <b className="text-[#fbbf24]">Legendary</b> within {PITY_LEGEND - d.pityLegend}. Every ten-summon includes at least one Rare. Duplicates become shards that
          raise a hero's ★ (up to {MAX_STARS}★, ×4.5 damage).
        </div>
        <div className="text-xs text-[#7c739c]">
          Out of gems?{' '}
          <button className="underline hover:text-white" onClick={() => navigate({ name: 'focus' })}>
            Focus for 20 minutes
          </button>{' '}
          = one summon.
        </div>
      </div>
    </div>
  )
}

function SummonReveal({ results, onClose }: { results: SummonResult[]; onClose: () => void }): React.JSX.Element {
  const [shown, setShown] = useState(0)
  const best = Math.max(...results.map((r) => HERO[r.id].rarity))
  useEffect(() => {
    if (shown >= results.length) return
    const t = setTimeout(
      () => {
        setShown((n) => n + 1)
        sfx.reveal(HERO[results[shown].id].rarity)
      },
      shown === 0 ? 650 : 260
    )
    return () => clearTimeout(t)
  }, [shown, results])
  const done = shown >= results.length
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b0712]/85 p-6" onMouseDown={() => (done ? onClose() : setShown(results.length))}>
      <div className="flex max-w-4xl flex-col items-center gap-6">
        <div
          className="px text-sm"
          style={{ color: RARITY[best as 1].color, textShadow: '3px 3px 0 #0b0712', animation: best >= 3 && done ? 'px-pulse 0.8s ease-in-out infinite' : undefined }}
        >
          {done ? (best === 4 ? '★ LEGENDARY! ★' : best === 3 ? 'EPIC PULL!' : 'SUMMONED!') : 'SUMMONING…'}
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          {results.slice(0, shown).map((r, i) => {
            const def = HERO[r.id]
            const color = RARITY[def.rarity].color
            return (
              <div
                key={i}
                className="flex w-28 flex-col items-center gap-1.5 bg-[#1d1830] p-2.5"
                style={
                  {
                    boxShadow: `0 0 0 3px #0b0712, inset 0 0 0 3px ${color}`,
                    animation: `px-pop 0.35s ease-out${def.rarity >= 3 ? ', px-shine 1.4s ease-in-out infinite' : ''}`,
                    '--glow': color
                  } as React.CSSProperties
                }
              >
                <span className="px text-[7px]" style={{ color }}>
                  {RARITY[def.rarity].name.toUpperCase()}
                </span>
                <HeroSprite id={r.id} scale={4} />
                <span className="px text-[9px] text-white">{def.name.toUpperCase()}</span>
                <span className="px text-[7px]" style={{ color: r.isNew ? '#4ade80' : '#fde047' }}>
                  {r.isNew ? 'NEW!' : r.shard ? '+1 SHARD' : `+${r.gems} 💎`}
                </span>
              </div>
            )
          })}
        </div>
        {done && <div className="px text-[9px] text-[#7c739c]">CLICK TO CONTINUE</div>}
      </div>
    </div>
  )
}

// ---------- Heroes ----------

function HeroesTab({ d, act }: { d: GameData; act: (a: GameAction) => Promise<GameResult | null> }): React.JSX.Element {
  const [sel, setSel] = useState<string>(d.party[0] ?? Object.keys(d.heroes)[0] ?? 'pip')
  const sorted = useMemo(() => [...HEROES].sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name)), [])
  const def = HERO[sel]
  const h = d.heroes[sel]
  const inParty = d.party.includes(sel)
  const sc = h ? starCost(h) : null
  return (
    <div className="grid gap-5 md:grid-cols-[1fr_17rem]">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
        {sorted.map((hd) => {
          const owned = d.heroes[hd.id]
          return (
            <button
              key={hd.id}
              disabled={!owned}
              onClick={() => setSel(hd.id)}
              className="flex flex-col items-center gap-1 p-2 disabled:cursor-default"
              style={{
                background: sel === hd.id ? '#2a2342' : '#16122a',
                boxShadow: `inset 0 0 0 2px ${owned ? RARITY[hd.rarity].color + (sel === hd.id ? '' : '66') : '#2a2342'}`
              }}
              title={owned ? hd.name : `${RARITY[hd.rarity].name} — not found yet`}
            >
              <HeroSprite id={hd.id} scale={3} locked={!owned} />
              <span className="px text-[7px]" style={{ color: owned ? RARITY[hd.rarity].color : '#4b4560' }}>
                {owned ? hd.name.toUpperCase() : '???'}
              </span>
              {owned ? <span className="text-[10px]"><Stars n={owned.stars} /></span> : <span className="text-[10px] text-[#4b4560]">{RARITY[hd.rarity].stars}</span>}
              {d.party.includes(hd.id) && <span className="px text-[6px] text-[#4ade80]">IN PARTY</span>}
            </button>
          )
        })}
      </div>
      {h && def && (
        <div className="flex flex-col items-center gap-2 p-4 text-center" style={{ background: '#16122a', boxShadow: `inset 0 0 0 2px ${RARITY[def.rarity].color}` }}>
          <span className="px text-[8px]" style={{ color: RARITY[def.rarity].color }}>
            {RARITY[def.rarity].name.toUpperCase()}
          </span>
          <HeroSprite id={sel} scale={7} />
          <div className="px text-[12px] text-white">{def.name.toUpperCase()}</div>
          <div className="text-xs text-[#a79fc7] italic">{def.title}</div>
          <div className="flex flex-wrap justify-center gap-1">
            <Chip color={ELEMENTS[def.el].color}>
              {ELEMENTS[def.el].icon} {ELEMENTS[def.el].name}
            </Chip>
            <Chip color="#c4bde0">{CLASSES[def.cls].name}</Chip>
          </div>
          <div className="text-xs text-[#c4bde0]">
            {CLASSES[def.cls].buff}
            <br />
            Strong vs {ELEMENTS[ELEMENTS[def.el].beats].icon} {ELEMENTS[ELEMENTS[def.el].beats].name}
          </div>
          <div className="text-xs text-[#c4bde0]">
            Level {h.level} · ⚔ {fmtNum(heroDps(sel, h))} DPS
          </div>
          <div className="text-sm">
            <Stars n={h.stars} />
          </div>
          {sc !== null ? (
            <>
              <div className="h-2 w-full bg-[#0b0712]">
                <div className="h-full bg-[#fde047]" style={{ width: `${Math.min(100, (h.shards / sc) * 100)}%` }} />
              </div>
              <div className="text-[11px] text-[#a79fc7]">
                {h.shards}/{sc} shards for {h.stars + 1}★
              </div>
              <button className="px-btn !bg-[#ca8a04] !text-[9px]" disabled={h.shards < sc} onClick={() => void act({ type: 'star', hero: sel }).then((r) => r && sfx.win())}>
                ★ STAR UP
              </button>
            </>
          ) : (
            <div className="px text-[8px] text-[#fde047]">MAX STARS</div>
          )}
          <button
            className="px-btn mt-1 !text-[9px]"
            disabled={!inParty && d.party.length >= 4}
            onClick={() => void act({ type: 'party', party: inParty ? d.party.filter((p) => p !== sel) : [...d.party, sel] })}
          >
            {inParty ? 'REMOVE FROM PARTY' : d.party.length >= 4 ? 'PARTY FULL' : 'ADD TO PARTY'}
          </button>
        </div>
      )}
    </div>
  )
}

// ---------- Rebirth ----------

function RebirthTab({ d, act, flash }: { d: GameData; act: (a: GameAction) => Promise<GameResult | null>; flash: (t: string, ok?: boolean) => void }): React.JSX.Element {
  const gain = relicsFor(d.runBest)
  return (
    <div className="flex flex-col items-center gap-4 py-2 text-center">
      <div className="text-5xl">🏺</div>
      <div className="max-w-xl text-sm leading-relaxed text-[#c4bde0]">
        Stuck? <b className="text-white">Rebirth</b> sends your party back to stage 1 and resets hero <b>levels</b> and gold — but you keep every hero and their ★, and earn{' '}
        <b className="text-[#fde047]">relics</b>: each one is a permanent <b>+10% damage</b> and <b>+5% gold</b>. You'll fly through the early stages and get further every
        time.
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat icon="🏺" value={String(d.relics)} label="relics now" />
        <Stat icon="🚩" value={String(d.runBest)} label="furthest stage this run" />
        <Stat icon="✨" value={`+${gain}`} label="relics from rebirthing now" />
      </div>
      <button
        className="px-btn !bg-[#b45309]"
        disabled={gain < 1}
        onClick={() => {
          if (!confirm(`Rebirth for ${gain} relics? Your party returns to stage 1 and hero levels reset (heroes and ★ stay).`)) return
          void act({ type: 'rebirth' }).then((r) => {
            if (r?.relics) {
              sfx.win()
              flash(`Reborn! +${r.relics} relics`)
            }
          })
        }}
      >
        {gain < 1 ? `REACH STAGE ${REBIRTH_MIN_STAGE}` : `REBIRTH · +${gain} 🏺`}
      </button>
      <div className="text-xs text-[#7c739c]">Tip: rebirth when progress slows to a crawl. Further stages give many more relics.</div>
    </div>
  )
}

// ---------- Earn ----------

function EarnTab({ d }: { d: GameData }): React.JSX.Element {
  const today = d.day === localDay() ? d.today : {}
  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm text-[#c4bde0]">
        Gems come from studying — added automatically, even while this page is closed. Today: <b className="text-white">💎 {d.day === localDay() ? d.gemsToday : 0}</b>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {(Object.keys(REWARDS) as RewardKind[]).map((k) => {
          const r = REWARDS[k]
          const used = today[k] ?? 0
          return (
            <div key={k} className="flex flex-col gap-1.5 p-3" style={{ background: '#16122a', boxShadow: 'inset 0 0 0 2px #3a3158' }}>
              <div className="flex justify-between text-xs">
                <span className="text-white">
                  💎 {r.gems} per {r.label}
                </span>
                <span className="text-[#a79fc7]">
                  {used}/{r.cap} today
                </span>
              </div>
              <div className="h-2 bg-[#0b0712]">
                <div className="h-full bg-[#38bdf8]" style={{ width: `${(used / r.cap) * 100}%` }} />
              </div>
            </div>
          )
        })}
        <div className="flex flex-col gap-1 p-3 text-xs" style={{ background: '#16122a', boxShadow: 'inset 0 0 0 2px #3a3158' }}>
          <span className="text-white">💎 40 per boss beaten for the first time (150 every 50 stages)</span>
          <span className="text-[#a79fc7]">Plus one free summon every day.</span>
        </div>
      </div>
    </div>
  )
}

function AwayModal({ d, onClose }: { d: GameData; onClose: () => void }): React.JSX.Element {
  const a = d.away!
  const h = Math.floor(a.seconds / 3600)
  const m = Math.floor((a.seconds % 3600) / 60)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b0712]/80 p-6" onMouseDown={onClose}>
      <div className="px-box flex max-w-md flex-col items-center gap-4 p-6 text-center" onMouseDown={(e) => e.stopPropagation()}>
        <div className="px text-[12px] text-[#fde047]">WELCOME BACK!</div>
        <div className="text-sm leading-relaxed text-[#c4bde0]">
          While you were away ({h ? `${h}h ` : ''}
          {m}m) your party defeated <b className="text-white">{fmtNum(a.kills)}</b> enemies
          {a.bosses > 0 && (
            <>
              {' '}
              and <b className="text-white">{a.bosses}</b> boss{a.bosses === 1 ? '' : 'es'}
            </>
          )}{' '}
          and found <b className="text-[#fde047]">🪙 {fmtNum(a.gold)}</b> gold.
          {a.toStage !== a.fromStage && (
            <>
              {' '}
              Stage {a.fromStage} → <b className="text-white">{a.toStage}</b>.
            </>
          )}
        </div>
        <button className="px-btn" onClick={onClose}>
          COLLECT
        </button>
      </div>
    </div>
  )
}
