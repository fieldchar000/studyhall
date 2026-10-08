// "Study Garden": an idle game fuelled by focus sessions. Every focused minute earns
// coins; buildings bought with coins trickle in a little extra over time.

import { useEffect, useState } from 'react'
import {
  BUILDINGS,
  buildingCost,
  coinsPerFocusMinute,
  focusUpgradeCost,
  OFFLINE_CAP_HOURS,
  parseGame,
  passivePerHour,
  passiveSince
} from '@shared/game'
import { api, db, useLive } from '@/lib/data'
import { navigate } from '@/lib/nav'

const fmt = (n: number): string => Math.floor(n).toLocaleString()

export function GamePage(): React.JSX.Element {
  // game.get() also banks passive income since the last visit.
  const { data: row } = useLive(['game_state'], () => api.game.get(), [])
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])
  if (!row) return <div />

  const data = parseGame(row.state)
  const coins = row.currency + passiveSince(data) // live counter between saves
  const rate = passivePerHour(data)

  /** Re-read (banking passive income), check the price, then pay. */
  const spend = async (cost: number, change: (d: typeof data) => void): Promise<void> => {
    const fresh = await api.game.get()
    const d = parseGame(fresh.state)
    if (fresh.currency < cost) return
    change(d)
    await db.update('game_state', fresh.id, { currency: fresh.currency - cost, state: JSON.stringify(d) })
  }

  const garden = BUILDINGS.flatMap((b) => Array.from({ length: Math.min(data.owned[b.id] ?? 0, 40) }, () => b.emoji))
  const focusCost = focusUpgradeCost(data.focusLevel)

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-8">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Study Garden</h1>
          <p className="text-sm text-muted">
            Earn {coinsPerFocusMinute(data.focusLevel)} coins for every minute in the Focus room. Buildings add income on top (up to {OFFLINE_CAP_HOURS}h while
            you're away).
          </p>
        </div>
        <button className="btn" onClick={() => navigate({ name: 'focus' })}>
          Start focusing →
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4">
          <div className="text-xs text-muted">Coins</div>
          <div className="mt-1 text-3xl font-semibold tabular-nums">🪙 {fmt(coins)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-muted">Garden income</div>
          <div className="mt-1 text-xl font-semibold">{fmt(rate)} / hour</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-muted">From focus so far</div>
          <div className="mt-1 text-xl font-semibold">
            {fmt(data.focusMinutesCredited)} minute{data.focusMinutesCredited === 1 ? '' : 's'}
          </div>
          <div className="text-[11px] text-muted">{fmt(data.totalEarned)} coins earned in total</div>
        </div>
      </div>

      <div className="card min-h-32 p-5">
        {garden.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted">Your garden is empty. Focus to earn coins, then plant your first sprout below.</div>
        ) : (
          <div className="flex flex-wrap gap-1.5 text-3xl leading-none">
            {garden.map((e, i) => (
              <span key={i}>{e}</span>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {BUILDINGS.map((b) => {
          const owned = data.owned[b.id] ?? 0
          const cost = buildingCost(b, owned)
          return (
            <div key={b.id} className="card flex items-center gap-4 p-4">
              <span className="text-4xl">{b.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">
                  {b.name} <span className="text-sm font-normal text-muted">× {owned}</span>
                </div>
                <div className="text-xs text-muted">
                  +{b.perHour}/hour · {b.blurb}
                </div>
              </div>
              <button
                className="btn-primary min-w-24 justify-center"
                disabled={coins < cost}
                onClick={() => void spend(cost, (d) => (d.owned[b.id] = (d.owned[b.id] ?? 0) + 1))}
              >
                🪙 {fmt(cost)}
              </button>
            </div>
          )
        })}
        <div className="card flex items-center gap-4 border-accent/40 p-4">
          <span className="text-4xl">🧠</span>
          <div className="min-w-0 flex-1">
            <div className="font-semibold">
              Sharper focus <span className="text-sm font-normal text-muted">level {data.focusLevel}</span>
            </div>
            <div className="text-xs text-muted">
              +1 coin per focused minute (now {coinsPerFocusMinute(data.focusLevel)}/min)
            </div>
          </div>
          <button className="btn-primary min-w-24 justify-center" disabled={coins < focusCost} onClick={() => void spend(focusCost, (d) => (d.focusLevel += 1))}>
            🪙 {fmt(focusCost)}
          </button>
        </div>
      </div>
    </div>
  )
}
