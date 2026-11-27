// Nova's "hologram" look: a sphere of light built from broken rings, circuit traces wrapped round it, little data
// panels, soft out-of-focus sparks and spokes running in to a lens-like core, all in warm gold (or Studyhall's blue).
// It turns slowly at rest; while it listens the sparks shimmer with your voice; while it thinks it turns faster and
// signals race along the traces; while it speaks the core and rings pulse with its voice. Studyhall's own drawing
// (canvas 2D, additive light and a soft bloom), used on Nova's main screen and by the floating Nova.

export type HoloMode = 'idle' | 'listen' | 'think' | 'talk'
export type HoloColor = 'gold' | 'blue'
type V3 = [number, number, number]

const PALETTES: Record<HoloColor, { base: string; hot: string; deep: string; rgb: [number, number, number] }> = {
  gold: { base: '255,178,64', hot: '255,232,170', deep: '214,120,28', rgb: [255, 190, 90] },
  blue: { base: '122,170,255', hot: '228,238,255', deep: '38,92,212', rgb: [140, 185, 255] }
}

// A small fixed random sequence, so the sphere is the same every time it's drawn.
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}
const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const fromLatLon = (lat: number, lon: number, r = 1): V3 => [Math.cos(lat) * Math.cos(lon) * r, Math.sin(lat) * r, Math.cos(lat) * Math.sin(lon) * r]

type Ring = { u: V3; v: V3; r: number; arcs: [number, number][]; w: number; a: number; spin: number }
type Trace = { pts: V3[]; w: number; a: number }
type Panel = { lat: number; lon: number; w: number; h: number; rows: number; a: number }
type Spark = { p: V3; s: number; a: number; tw: number }
type Spoke = { d: V3; a: number }

/** The sphere's parts, made once (seeded). */
function build(seed = 7): { rings: Ring[]; traces: Trace[]; panels: Panel[]; sparks: Spark[]; spokes: Spoke[] } {
  const r = rng(seed)
  const rings: Ring[] = []
  // Shell rings at many tilts, broken into arcs; a few inner rings (the bands round the core).
  for (let i = 0; i < 34; i++) {
    const n = norm([r() * 2 - 1, r() * 2 - 1, r() * 2 - 1])
    const u = norm(cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]))
    const v = cross(n, u)
    const inner = i >= 24
    const arcs: [number, number][] = []
    let a = r() * Math.PI * 2
    const end = a + Math.PI * 2
    while (a < end - 0.2) {
      const len = 0.25 + r() * (inner ? 1.6 : 1.1)
      arcs.push([a, Math.min(end, a + len)])
      a += len + 0.06 + r() * 0.5
    }
    rings.push({
      u,
      v,
      r: inner ? 0.38 + r() * 0.3 : 0.9 + r() * 0.12,
      arcs,
      w: inner ? 1.4 + r() * 1.6 : 0.6 + r() * 1.1,
      a: inner ? 0.7 : 0.4 + r() * 0.5,
      spin: (r() - 0.5) * (inner ? 0.6 : 0.15)
    })
  }
  // Circuit traces: steps along latitude and longitude in turn (right-angle bends, like a circuit board), on the shell.
  const traces: Trace[] = []
  for (let i = 0; i < 210; i++) {
    let lat = (r() - 0.5) * 2.6
    let lon = r() * Math.PI * 2
    const rad = 0.93 + r() * 0.09
    const pts: V3[] = [fromLatLon(lat, lon, rad)]
    const segs = 3 + Math.floor(r() * 6)
    for (let s = 0; s < segs; s++) {
      const along = s % 2 === 0
      const step = (r() < 0.5 ? -1 : 1) * (0.02 + r() * 0.08)
      const n = 2
      for (let k = 1; k <= n; k++) pts.push(fromLatLon(along ? lat : lat + (step * k) / n, along ? lon + (step * k) / n : lon, rad))
      if (along) lon += step
      else lat += step
    }
    traces.push({ pts, w: 0.5 + r() * 0.8, a: 0.5 + r() * 0.5 })
  }
  // Data panels: small grids of lines on the shell.
  const panels: Panel[] = Array.from({ length: 44 }, () => ({
    lat: (r() - 0.5) * 2.2,
    lon: r() * Math.PI * 2,
    w: 0.08 + r() * 0.16,
    h: 0.05 + r() * 0.12,
    rows: 2 + Math.floor(r() * 4),
    a: 0.35 + r() * 0.45
  }))
  // Sparks: soft points of light through the volume, most near the shell.
  const sparks: Spark[] = Array.from({ length: 320 }, () => {
    const d = norm([r() * 2 - 1, r() * 2 - 1, r() * 2 - 1])
    const rr = r() < 0.7 ? 0.8 + r() * 0.3 : 0.15 + r() * 0.65
    return { p: [d[0] * rr, d[1] * rr, d[2] * rr], s: 0.6 + r() * r() * r() * 7, a: 0.4 + r() * 0.6, tw: r() * 10 }
  })
  const spokes: Spoke[] = Array.from({ length: 20 }, () => ({ d: norm([r() * 2 - 1, (r() * 2 - 1) * 0.8, r() * 2 - 1]), a: 0.2 + r() * 0.35 }))
  return { rings, traces, panels, sparks, spokes }
}

/** One spark of light (a soft dot), made once per colour and scaled as it's drawn. */
function sparkSprite(rgb: string, hot: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const x = c.getContext('2d')!
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, `rgba(${hot},1)`)
  g.addColorStop(0.25, `rgba(${rgb},0.85)`)
  g.addColorStop(0.6, `rgba(${rgb},0.22)`)
  g.addColorStop(1, `rgba(${rgb},0)`)
  x.fillStyle = g
  x.fillRect(0, 0, 64, 64)
  return c
}

export type HoloState = { t: number; dt: number; mode: HoloMode; level: number; color: HoloColor }

/** A hologram that draws itself onto a square canvas of `size` px (its own canvas, with its glow). */
export function makeHologram(seed = 7): { draw(size: number, st: HoloState): HTMLCanvasElement } {
  const parts = build(seed)
  const out = document.createElement('canvas')
  const sharp = document.createElement('canvas')
  let sprites: { color: HoloColor; s: HTMLCanvasElement; h: HTMLCanvasElement } | null = null
  let yaw = 0
  let inner = 0
  let energy = 0
  let pulse = 0 // (signals along the traces while it thinks)
  return {
    draw(size, st) {
      if (out.width !== size) out.width = out.height = sharp.width = sharp.height = size
      const pal = PALETTES[st.color] ?? PALETTES.gold
      if (!sprites || sprites.color !== st.color) sprites = { color: st.color, s: sparkSprite(pal.base, pal.hot), h: sparkSprite(pal.hot, pal.hot) }
      const x = sharp.getContext('2d')!
      const o = out.getContext('2d')!
      const dt = Math.min(0.05, st.dt)
      const lv = Math.max(0, Math.min(1, st.level))
      energy += ((st.mode === 'talk' ? 0.55 + lv * 0.6 : st.mode === 'listen' ? 0.35 + lv * 0.5 : st.mode === 'think' ? 0.85 : 0.45) - energy) * Math.min(1, dt * 6)
      yaw += dt * (st.mode === 'think' ? 0.55 : 0.12)
      inner -= dt * (st.mode === 'think' ? 1.4 : 0.35)
      pulse += dt * (st.mode === 'think' ? 1.6 : 0.45)
      const cx = size / 2
      const cy = size / 2
      const R = size * 0.4 * (1 + (st.mode === 'talk' ? lv * 0.035 : 0))
      const cyw = Math.cos(yaw)
      const syw = Math.sin(yaw)
      const tilt = -0.32 + Math.sin(st.t * 0.21) * 0.06
      const ct = Math.cos(tilt)
      const sn = Math.sin(tilt)
      // 3D → screen: turn about the vertical, tip toward you; z is 1 nearest you, -1 farthest.
      const P = (v: V3, spin = 0): [number, number, number] => {
        let px = v[0]
        let pz = v[2]
        if (spin) {
          const c = Math.cos(spin)
          const s = Math.sin(spin)
          ;[px, pz] = [px * c + pz * s, -px * s + pz * c]
        }
        const X = px * cyw + pz * syw
        const Z0 = -px * syw + pz * cyw
        const Y = v[1] * ct - Z0 * sn
        const Z = v[1] * sn + Z0 * ct
        return [cx + X * R, cy + Y * R, Z]
      }
      const depthA = (z: number): number => 0.18 + 0.82 * ((Math.max(-1, Math.min(1, z)) + 1) / 2) ** 1.4
      x.clearRect(0, 0, size, size)
      x.globalCompositeOperation = 'lighter'
      x.lineCap = 'round'
      const px1 = Math.max(0.6, size / 520) // (line widths scale with the size)

      // Spokes: from the core out to the shell, faint, brighter while it thinks.
      for (const s of parts.spokes) {
        const a = P([s.d[0] * 0.16, s.d[1] * 0.16, s.d[2] * 0.16])
        const b = P([s.d[0] * 1.22, s.d[1] * 1.22, s.d[2] * 1.22])
        const g = x.createLinearGradient(a[0], a[1], b[0], b[1])
        const al = s.a * depthA(b[2]) * (0.6 + energy * 0.8)
        g.addColorStop(0, `rgba(${pal.hot},${al})`)
        g.addColorStop(1, `rgba(${pal.base},${al * 0.25})`)
        x.strokeStyle = g
        x.lineWidth = 0.7 * px1
        x.beginPath()
        x.moveTo(a[0], a[1])
        x.lineTo(b[0], b[1])
        x.stroke()
      }
      // Rings: arcs drawn in short runs so the far side is dimmer than the near side.
      for (const rg of parts.rings) {
        const spin = rg.spin * st.t + (rg.r < 0.8 ? inner * 0.4 : 0)
        const rr = rg.r * (1 + (rg.r < 0.8 ? energy * 0.06 : 0))
        for (const [a0, a1] of rg.arcs) {
          const steps = Math.max(3, Math.ceil((a1 - a0) * 18))
          let prev: [number, number, number] | null = null
          for (let i = 0; i <= steps; i++) {
            const a = a0 + ((a1 - a0) * i) / steps + spin
            const c = Math.cos(a)
            const s = Math.sin(a)
            const p = P([(rg.u[0] * c + rg.v[0] * s) * rr, (rg.u[1] * c + rg.v[1] * s) * rr, (rg.u[2] * c + rg.v[2] * s) * rr])
            if (prev) {
              x.strokeStyle = `rgba(${pal.base},${rg.a * depthA((p[2] + prev[2]) / 2) * (0.55 + energy * 0.7)})`
              x.lineWidth = rg.w * px1 * (0.6 + 0.6 * ((p[2] + 1) / 2))
              x.beginPath()
              x.moveTo(prev[0], prev[1])
              x.lineTo(p[0], p[1])
              x.stroke()
            }
            prev = p
          }
        }
      }
      // Circuit traces, each ending in a small pad; while it thinks a signal runs along them.
      parts.traces.forEach((tr, k) => {
        const pts = tr.pts.map((v) => P(v))
        const z = pts.reduce((s, p) => s + p[2], 0) / pts.length
        const al = tr.a * depthA(z) * (0.5 + energy * 0.7)
        x.strokeStyle = `rgba(${pal.base},${al})`
        x.lineWidth = tr.w * px1
        x.beginPath()
        pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])))
        x.stroke()
        const end = pts[pts.length - 1]
        x.fillStyle = `rgba(${pal.hot},${al})`
        x.fillRect(end[0] - 1.2 * px1, end[1] - 1.2 * px1, 2.4 * px1, 2.4 * px1)
        if (st.mode === 'think' || st.mode === 'talk') {
          const u = (pulse * (0.6 + (k % 5) * 0.15) + k * 0.37) % 1.6
          if (u < 1) {
            const p = pts[Math.min(pts.length - 1, Math.floor(u * (pts.length - 1)))]
            const sz = (6 + energy * 6) * px1
            x.globalAlpha = depthA(p[2])
            x.drawImage(sprites!.h, p[0] - sz / 2, p[1] - sz / 2, sz, sz)
            x.globalAlpha = 1
          }
        }
      })
      // Data panels: little grids of light on the shell.
      for (const pn of parts.panels) {
        const lonNow = pn.lon
        const c = P(fromLatLon(pn.lat, lonNow, 0.97))
        if (c[2] < -0.35) continue
        const a = P(fromLatLon(pn.lat - pn.h / 2, lonNow - pn.w / 2, 0.97))
        const b = P(fromLatLon(pn.lat - pn.h / 2, lonNow + pn.w / 2, 0.97))
        const d = P(fromLatLon(pn.lat + pn.h / 2, lonNow - pn.w / 2, 0.97))
        const al = pn.a * depthA(c[2]) * (0.5 + energy * 0.6)
        x.strokeStyle = `rgba(${pal.base},${al})`
        x.lineWidth = 0.6 * px1
        for (let i = 0; i <= pn.rows; i++) {
          const f = i / pn.rows
          const sx = a[0] + (d[0] - a[0]) * f
          const sy = a[1] + (d[1] - a[1]) * f
          const len = 0.4 + ((i * 37) % 10) / 16
          x.beginPath()
          x.moveTo(sx, sy)
          x.lineTo(sx + (b[0] - a[0]) * len, sy + (b[1] - a[1]) * len)
          x.stroke()
        }
      }
      // Sparks: out of focus away from the middle depth, twinkling; they shimmer with your voice while it listens.
      for (const sp of parts.sparks) {
        const p = P(sp.p, yaw * 0.2)
        const blur = Math.abs(p[2] - 0.2)
        const tw = 0.6 + 0.4 * Math.sin(st.t * (1.5 + sp.tw * 0.3) + sp.tw)
        const sz = (sp.s * (1 + blur * 2.6) + (st.mode === 'listen' ? lv * 2 : 0)) * px1 * 4.2
        x.globalAlpha = Math.min(1, sp.a * depthA(p[2]) * tw * (0.45 + energy * 0.8) * (1 / (1 + blur * 1.2)))
        x.drawImage(sprites.s, p[0] - sz / 2, p[1] - sz / 2, sz, sz)
      }
      x.globalAlpha = 1
      // The core: a tunnel of rings, the brightest ring at its mouth and a dim middle, swelling with the voice. Each ring
      // sits a little off centre, toward the way it's turning, so it reads as depth.
      const coreR = R * (0.12 + energy * 0.03 + (st.mode === 'talk' ? lv * 0.05 : 0))
      const glow = coreR * (3 + energy * 1.6)
      x.globalAlpha = 0.25 + energy * 0.3
      x.drawImage(sprites.s, cx - glow / 2, cy - glow / 2, glow, glow)
      x.globalAlpha = 1
      for (let i = 0; i < 10; i++) {
        const f = i / 9
        const rr = coreR * (0.3 + f * 0.95)
        const ox = Math.sin(yaw * 2) * coreR * 0.25 * (1 - f)
        const oy = -coreR * 0.12 * (1 - f)
        const start = inner * (i % 2 ? -1 : 1) * (0.6 + i * 0.2) + i
        const mouth = i >= 7
        x.strokeStyle = `rgba(${mouth ? pal.hot : pal.base},${(mouth ? 0.95 : 0.25 + f * 0.5) * (0.6 + energy * 0.6)})`
        x.lineWidth = (mouth ? 2.4 : 1) * px1
        x.beginPath()
        x.ellipse(cx + ox, cy + oy, rr, rr * 0.9, 0, start, start + Math.PI * (mouth ? 1.7 : 1.2 + (i % 3) * 0.3))
        x.stroke()
      }
      // A swirl band round the core, tipped, turning.
      for (let k = 0; k < 3; k++) {
        x.strokeStyle = `rgba(${pal.base},${0.5 - k * 0.12 + energy * 0.35})`
        x.lineWidth = (3.2 - k) * px1
        x.beginPath()
        x.ellipse(cx, cy, R * (0.44 + k * 0.05), R * (0.18 + k * 0.02), -0.5 + Math.sin(st.t * 0.3) * 0.08 + k * 0.05, inner * 0.8 - k * 0.3, inner * 0.8 + Math.PI * (1.2 - k * 0.2))
        x.stroke()
      }

      // The glow: a blurred copy of it all under the sharp one.
      o.clearRect(0, 0, size, size)
      o.globalCompositeOperation = 'lighter'
      // (a wide haze, then a tight glow)
      o.filter = `blur(${Math.max(4, Math.round(size / 22))}px)`
      o.globalAlpha = 0.55
      o.drawImage(sharp, 0, 0)
      o.filter = `blur(${Math.max(2, Math.round(size / 75))}px)`
      o.globalAlpha = 1
      o.drawImage(sharp, 0, 0)
      o.filter = 'none'
      o.globalAlpha = 1
      o.drawImage(sharp, 0, 0)
      o.globalCompositeOperation = 'source-over'
      return out
    }
  }
}
