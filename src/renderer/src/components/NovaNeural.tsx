// Nova drawn big on its main screen: the "hologram" look (a sphere of light, hologram.ts), or in LED pixels like the
// floating globe: the "neural" look (a hollow globe of nodes and links with signals firing along them) or the "globe".
// In LEDs, each frame the look writes cells into a small grid; the grid is painted as square LEDs with a soft glow.
import { useEffect, useRef } from 'react'
import { makeHologram, type HoloColor } from '@/lib/jarvis/hologram'
import { neural } from '@/lib/jarvis/neural'

export type NeuralMode = 'idle' | 'listen' | 'think' | 'talk'

// Your dark blue with light-blue highlights (the same as the floating Nova), the gap colour first.
const PAL = [
  [3, 8, 24],
  [12, 34, 92],
  [38, 92, 212],
  [122, 170, 255],
  [228, 238, 255]
]
// A 4 × 4 ordered-dither pattern (the floating Nova's), for the faint parts.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16)

/** The classic look: a globe of LED points with a lit heart (a simple version of the floating Nova's). */
const globe = {
  body(
    k: { put: (x: number, y: number, l: number) => void; L: number },
    cx: number,
    cy: number,
    rad: number,
    st: { t: number; mode: string; voice?: number; heard?: number; spin?: number; dt?: number }
  ): void {
    const dots = 620
    st.spin = (st.spin ?? 0) + (st.mode === 'think' ? 1.6 : 0.3) * (st.dt ?? 0.016)
    const v = st.mode === 'talk' ? 0.3 + (st.voice ?? 0.4) * 0.9 : st.mode === 'listen' ? 0.2 + (st.heard ?? 0.3) * 0.8 : 0.1
    for (let i = 0; i < dots; i++) {
      const y0 = 1 - (2 * (i + 0.5)) / dots
      const r0 = Math.sqrt(1 - y0 * y0)
      const a = i * 2.39996 + st.spin
      let x = Math.cos(a) * r0
      let z = Math.sin(a) * r0
      const y = y0 * 0.94 - z * 0.34
      z = y0 * 0.34 + z * 0.94
      const band = Math.sin(y0 * 7 - st.t * (st.mode === 'talk' ? 9 : 3)) * 0.5 + 0.5
      const rr = rad * (1 + v * 0.12 * band)
      x = cx + x * rr
      if (z < -0.15) continue
      k.put(x, cy + y * rr, Math.min(k.L - 1, 1 + Math.round(z * 1.6 + band * v * 1.4)))
    }
    const hr = Math.max(1, Math.round(rad * (0.16 + v * 0.07)))
    for (let y = -hr - 1; y <= hr + 1; y++)
      for (let x = -hr - 1; x <= hr + 1; x++) {
        const d = Math.hypot(x, y) / (hr + 0.5)
        if (d <= 1.3) k.put(cx + x, cy + y, d < 0.55 ? k.L : d < 1 ? k.L - 1 : 2)
      }
  }
}

export function NovaNeural({
  size = 460,
  mode = 'idle',
  level,
  look = 'neural',
  color = 'gold',
  cell = 4
}: {
  size?: number
  mode?: NeuralMode
  /** 0..1, read every frame: your voice while it listens, its voice while it speaks */
  level?: { current: number }
  look?: 'neural' | 'globe' | 'hologram'
  /** the hologram's colour */
  color?: HoloColor
  /** how big each LED is, in CSS px */
  cell?: number
}): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const live = useRef({ mode, look, color })
  live.current = { mode, look, color }
  const lv = useRef(level)
  lv.current = level
  useEffect(() => {
    const c = ref.current!
    const ctx = c.getContext('2d')!
    const dpr = Math.min(devicePixelRatio || 1, 2)
    c.width = size * dpr
    c.height = size * dpr
    const n = Math.floor(size / cell)
    const grid = new Uint8Array(n * n)
    // The LEDs are painted on their own canvas, then drawn twice: blurred for the glow, then sharp.
    const leds = document.createElement('canvas')
    leds.width = c.width
    leds.height = c.height
    const lx = leds.getContext('2d')!
    const fills = PAL.map((p) => `rgb(${p.join(',')})`)
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const st: Record<string, unknown> & { t: number; dt: number } = { t: 0, dt: 0.016, look: [0, 0], open: 1, sq: 0 }
    const kit = {
      L: PAL.length - 1,
      th: (x: number, y: number) => BAYER[(((y % 4) + 4) % 4) * 4 + (((x % 4) + 4) % 4)],
      put: (x: number, y: number, l: number) => {
        const gx = Math.round(x)
        const gy = Math.round(y)
        if (gx < 0 || gy < 0 || gx >= n || gy >= n) return
        const i = gy * n + gx
        if (l > grid[i]) grid[i] = l
      }
    }
    let raf = 0
    let last = performance.now()
    let shown = 0
    const holo = makeHologram()
    const frame = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const { mode: m, look: lk, color: col } = live.current
      const input = Math.max(0, Math.min(1, lv.current?.current ?? 0))
      // (eased, so the voice drives it smoothly)
      shown += (input - shown) * 0.35
      // The hologram: smooth light, drawn by hologram.ts at the canvas's full size.
      if (lk === 'hologram') {
        ctx.clearRect(0, 0, c.width, c.height)
        ctx.drawImage(holo.draw(c.width, { t: now / 1000, dt: reduce ? dt * 0.3 : dt, mode: m, level: shown, color: col }), 0, 0)
        raf = requestAnimationFrame(frame)
        return
      }
      Object.assign(st, { t: now / 1000, dt: reduce ? dt * 0.3 : dt, mode: m === 'idle' ? null : m, voice: m === 'talk' ? shown : undefined, heard: m === 'listen' ? 0.2 + shown * 0.8 : undefined })
      grid.fill(0)
      const look = lk === 'globe' ? globe : neural
      look.body(kit, n / 2, n / 2, n * 0.36, st as never)
      lx.clearRect(0, 0, leds.width, leds.height)
      const px = cell * dpr
      const gap = Math.max(1, Math.round(px * 0.22))
      for (let i = 0; i < grid.length; i++) {
        const l = grid[i]
        if (!l) continue
        lx.fillStyle = fills[l]
        lx.fillRect((i % n) * px, Math.floor(i / n) * px, px - gap, px - gap)
      }
      ctx.clearRect(0, 0, c.width, c.height)
      ctx.globalAlpha = 0.55
      ctx.filter = `blur(${Math.round(7 * dpr)}px)`
      ctx.drawImage(leds, 0, 0)
      ctx.filter = 'none'
      ctx.globalAlpha = 1
      ctx.drawImage(leds, 0, 0)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [size, cell])
  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden="true" />
}
