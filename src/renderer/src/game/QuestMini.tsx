// A small live Pixel Quest window for the Focus room: your party fights while you
// study, Focus Power charges up, and the gems / ticket you're earning are shown.

import '@fontsource/press-start-2p/latin-400.css'
import { useEffect, useRef, useState } from 'react'
import { fmtNum, powered, REWARDS, streakBonus, type GameData } from '@shared/game'
import { api } from '@/lib/data'
import { navigate } from '@/lib/nav'
import { useTimerState } from '@/lib/timer'
import { Battle } from './scene'

const mins = (s: number): string => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.ceil(s / 60)}m`)

export function QuestMini(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const battle = useRef<Battle | null>(null)
  const [data, setData] = useState<GameData | null>(null)
  const [, tick] = useState(0)
  const timer = useTimerState()
  const focusing = timer?.phase === 'focus' && timer.running

  useEffect(() => {
    void api.game.get().then((r) => setData(r.data))
  }, [])

  const loaded = data !== null
  useEffect(() => {
    if (!loaded || !canvasRef.current) return
    void api.game.get().then((r) => {
      if (canvasRef.current && !battle.current) battle.current = new Battle(canvasRef.current, r.data, { onBossEnd: () => {} })
    })
    const sync = setInterval(() => {
      const b = battle.current
      const taps = b?.pendingTaps ?? 0
      if (b) b.pendingTaps = 0
      void api.game.act({ type: 'tick', taps }).then((r) => {
        setData(r.data)
        battle.current?.setData(r.data)
      })
    }, 4000)
    const ui = setInterval(() => tick((n) => n + 1), 500)
    return () => {
      clearInterval(sync)
      clearInterval(ui)
      battle.current?.destroy()
      battle.current = null
    }
  }, [loaded])

  const d = battle.current?.d ?? data
  return (
    <div className="card overflow-hidden">
      <div className="relative bg-[#120e1f]">
        <canvas
          ref={canvasRef}
          className="block aspect-[200/96] w-full cursor-crosshair"
          style={{ imageRendering: 'pixelated' }}
          onMouseDown={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            battle.current?.tap(e.clientX - r.left, e.clientY - r.top)
          }}
        />
        {d && (
          <div className="px pointer-events-none absolute right-2 bottom-2 flex items-end gap-2 text-[8px] text-white" style={{ textShadow: '1px 1px 0 #0b0712' }}>
            <span>💎 {fmtNum(d.gems)}</span>
            {d.tickets > 0 && <span>🎟️ {d.tickets}</span>}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1.5 p-3 text-xs">
        {d && (
          <div className="flex items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 font-semibold ${powered(d) ? 'bg-amber-400/20 text-amber-600 dark:text-amber-300' : 'bg-line text-muted'}`}>
              ⚡ {powered(d) ? `Focus Power ×2 · ${mins(d.power)}` : 'No Focus Power'}
            </span>
            {d.focusStreak > 1 && <span title="Days in a row with focus: bonus gems">🔥 {d.focusStreak} days · +{Math.round((streakBonus(d) - 1) * 100)}%</span>}
          </div>
        )}
        <div className="text-muted">
          {focusing
            ? `Your party is fighting with you — every focused minute: 💎 ${REWARDS.focus.gems} + 3 min ⚡. Finish the session for a 🎟️ summon ticket.`
            : 'Start focusing to charge your party with ⚡ Focus Power (double damage and gold) and earn gems and summon tickets.'}
        </div>
        <button className="self-start text-accent hover:underline" onClick={() => navigate({ name: 'game' })}>
          Open Pixel Quest →
        </button>
      </div>
    </div>
  )
}
