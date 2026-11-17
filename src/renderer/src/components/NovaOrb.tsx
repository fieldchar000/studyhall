// Nova's orb: a hollow sphere of fine blue strands with three orbits (an atom), drawn on a canvas.
//  • idle: turns slowly (and bobs gently when `drift` is on)
//  • listening: breathes with your microphone level
//  • thinking: the orbits speed up
//  • speaking: ripples with Nova's actual voice (the loudness of what's playing)
//  • error: a faint red tint
// `level` is read every frame, so it can change without re-rendering React.

import { useEffect, useRef } from 'react'

export type OrbMode = 'idle' | 'listening' | 'thinking' | 'speaking' | 'done' | 'error'

export function NovaOrb({
  size = 200,
  mode = 'idle',
  level,
  drift = false,
  solid = false
}: {
  size?: number
  mode?: OrbMode
  /** 0..1, read each frame (mic level while listening, voice loudness while speaking) */
  level?: { current: number }
  drift?: boolean
  /** a dark-blue glass body behind the strands, so it reads on any background (the floating orb) */
  solid?: boolean
}): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const live = useRef({ mode, drift, solid })
  live.current = { mode, drift, solid }
  const lv = useRef(level)
  lv.current = level
  useEffect(() => {
    const c = ref.current!
    const x = c.getContext('2d')!
    const d = Math.min(devicePixelRatio || 1, 2)
    c.width = size * d
    c.height = size * d
    x.setTransform(d, 0, 0, d, 0, 0)
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    let amp = 0
    let speed = 1
    let spinT = 0
    let last = performance.now()
    let raf = 0
    let timer = 0
    const draw = (t: number): void => {
      const dt = Math.min(64, t - last)
      last = t
      const { mode: m, drift: dr, solid: so } = live.current
      const input = Math.max(0, Math.min(1, lv.current?.current ?? 0))
      const target = m === 'speaking' ? 0.25 + input * 0.9 : m === 'listening' ? 0.15 + input * 0.8 : m === 'thinking' ? 0.3 : 0
      amp += (target - amp) * 0.25
      speed += ((m === 'thinking' ? 3.2 : m === 'listening' ? 1.6 : 1) - speed) * 0.05
      spinT += dt * speed
      const bob = dr && !reduce ? Math.sin(t / 1400) * size * 0.025 : 0
      const sway = dr && !reduce ? Math.cos(t / 2300) * size * 0.015 : 0
      const cx = size / 2 + sway
      const cy = size / 2 + bob
      const R = size * 0.3 * (1 + amp * 0.06)
      const red = m === 'error'
      x.clearRect(0, 0, size, size)
      if (so) {
        // dark-blue glass: deep navy in the middle, fading out at the rim
        const body = x.createRadialGradient(cx - R * 0.25, cy - R * 0.3, R * 0.1, cx, cy, R * 1.32)
        body.addColorStop(0, 'rgba(22,44,110,0.95)')
        body.addColorStop(0.55, 'rgba(8,18,52,0.93)')
        body.addColorStop(0.85, 'rgba(5,11,34,0.85)')
        body.addColorStop(1, 'rgba(5,11,34,0)')
        x.fillStyle = body
        x.beginPath()
        x.arc(cx, cy, R * 1.32, 0, 6.283)
        x.fill()
      }
      x.globalCompositeOperation = 'lighter'
      // a small bright core (a point of light, not a fog)
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, R * (0.3 + amp * 0.12))
      g.addColorStop(0, 'rgba(225,236,255,.95)')
      g.addColorStop(0.35, red ? 'rgba(255,140,140,.35)' : `rgba(110,160,255,${0.35 + amp * 0.25})`)
      g.addColorStop(1, 'rgba(60,110,240,0)')
      x.fillStyle = g
      x.beginPath()
      x.arc(cx, cy, R * 0.45, 0, 6.283)
      x.fill()
      // meridian strands: the hollow sphere
      x.lineWidth = size < 80 ? 0.7 : 0.8
      const spin = spinT * 0.00035
      for (let i = 0; i < 16; i++) {
        const a = spin + (i / 16) * Math.PI
        const wob = 1 + amp * 0.1 * Math.sin(t * 0.012 + i * 1.7)
        x.strokeStyle = red ? `rgba(255,${150 + i * 3},${170 + i * 3},${0.1 + 0.2 * Math.abs(Math.sin(a))})` : `rgba(${110 + i * 4},${150 + i * 3},255,${0.12 + 0.22 * Math.abs(Math.sin(a)) + amp * 0.1})`
        x.beginPath()
        x.ellipse(cx, cy, Math.max(0.5, Math.abs(Math.cos(a)) * R * wob), R * wob, 0, 0, 6.283)
        x.stroke()
      }
      // three orbits with an electron each
      for (let k = 0; k < 3; k++) {
        const a = spinT * 0.0012 * (k % 2 ? -1 : 1) + k
        x.save()
        x.translate(cx, cy)
        x.rotate(k * 2.094 + 0.4)
        x.strokeStyle = `rgba(168,200,255,${0.4 + amp * 0.25})`
        x.lineWidth = 1
        x.beginPath()
        x.ellipse(0, 0, R * 1.18, R * 0.38, 0, 0, 6.283)
        x.stroke()
        x.fillStyle = '#e6efff'
        x.beginPath()
        x.arc(Math.cos(a) * R * 1.18, Math.sin(a) * R * 0.38, Math.max(1.4, size * 0.011), 0, 6.283)
        x.fill()
        x.restore()
      }
      // ripples going out while it talks or listens
      if (amp > 0.03 && m !== 'thinking') {
        for (let j = 0; j < 3; j++) {
          const p = (t * 0.0011 + j / 3) % 1
          x.strokeStyle = `rgba(140,185,255,${(1 - p) * 0.6 * amp})`
          x.lineWidth = 1.2
          x.beginPath()
          x.arc(cx, cy, R * (1.05 + p * 0.45), 0, 6.283)
          x.stroke()
        }
      }
      x.globalCompositeOperation = 'source-over'
      if (reduce) return
      // Hidden window: check again in a moment instead of drawing every frame.
      if (document.hidden) timer = window.setTimeout(() => (raf = requestAnimationFrame(draw)), 500)
      else raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
    }
  }, [size])
  return <canvas ref={ref} style={{ width: size, height: size, display: 'block' }} aria-hidden="true" />
}
