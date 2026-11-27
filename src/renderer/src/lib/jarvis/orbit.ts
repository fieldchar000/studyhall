// The floating Nova's look: the LED globe it always had (Roamies' JARVIS globe of points with a lit heart), made more
// 3D with a little of the main screen's hologram: two thin orbit rings that pass behind the globe (dim) and in front of
// it (bright), a small turning ring round the heart, and a few sparks drifting round it. It turns, sways and breathes
// more than the plain globe. Drawn in LED cells like the globe (the brightest write wins, so a ring in front lights
// over the globe and one behind it is hidden by it).

/* eslint-disable @typescript-eslint/no-explicit-any */
type Kit = { put: (x: number, y: number, level: number) => void; th: (x: number, y: number) => number; L: number }
type Look = { body: (k: Kit, cx: number, cy: number, rad: number, st: any) => void; level: (st: any) => number }

const TAU = Math.PI * 2
// Two rings, each tipped its own way and turning at its own speed.
const RINGS = [
  { tilt: 1.15, roll: 0.35, r: 1.32, speed: 0.55 },
  { tilt: 1.35, roll: -0.75, r: 1.48, speed: -0.38 }
]

/** The orbit look over a JARVIS globe look. */
export function orbitLook(globe: Look): Look {
  return {
    level: (st) => globe.level.call(globe, st),
    body(k, cx, cy, rad, st) {
      const { put, th, L } = k
      const t = st.t
      const dt = Math.min(0.05, st.dt ?? 0.016)
      const v = globe.level.call(globe, st)
      const mode = st.mode
      // More movement than the plain globe: it turns a little faster and sways and bobs gently.
      st.spin = (st.spin ?? 0) + (mode === 'think' ? 0.5 : 0.22) * dt
      const x0 = cx + Math.sin(t * 0.9) * rad * 0.05
      const y0 = cy + Math.cos(t * 0.7) * rad * 0.04
      globe.body.call(globe, k, x0, y0, rad, st)
      // The rings: dim and broken behind (the globe hides most of that), bright in front, brighter with the voice.
      st.orb = st.orb ?? RINGS.map(() => 0)
      RINGS.forEach((g, i) => {
        st.orb[i] += g.speed * (mode === 'think' ? 2.4 : 1) * dt
        const ct = Math.cos(g.tilt)
        const stl = Math.sin(g.tilt)
        const cr = Math.cos(g.roll)
        const sr = Math.sin(g.roll)
        const R = rad * g.r * (1 + (mode === 'talk' ? v * 0.05 : 0))
        const n = Math.max(40, Math.round(R * 4.5))
        for (let j = 0; j < n; j++) {
          const a = (j / n) * TAU + st.orb[i]
          // A circle, tipped toward you by tilt and turned on screen by roll; z > 0 is in front.
          const px = Math.cos(a)
          const py = Math.sin(a) * ct
          const z = Math.sin(a) * stl
          const x = x0 + (px * cr - py * sr) * R
          const y = y0 + (px * sr + py * cr) * R
          // (a gap now and then, so it reads as a ring of light, not a wire)
          if ((j + i * 7) % 23 < 2) continue
          if (z < 0) {
            if (th(Math.floor(x), Math.floor(y)) < 0.32) put(x, y, 1)
          } else put(x, y, z > 0.7 ? Math.min(L, 3 + (mode === 'talk' && v > 0.6 ? 1 : 0)) : z > 0.25 ? 3 : 2)
        }
        // A bright bead running round each ring.
        const a = st.orb[i] * 2.2 + i * 2
        const bz = Math.sin(a) * stl
        if (bz > -0.2) {
          const px = Math.cos(a)
          const py = Math.sin(a) * ct
          put(x0 + (px * cr - py * sr) * R, y0 + (px * sr + py * cr) * R, bz > 0.3 ? L : 2)
        }
      })
      // A small open ring turning round the heart (the hologram's core, in LEDs).
      const cr = rad * (0.32 + v * 0.06)
      const turn = t * (mode === 'think' ? 2.6 : 1.1)
      for (let j = 0; j < 28; j++) {
        const a = (j / 28) * TAU * 0.75 + turn
        put(x0 + Math.cos(a) * cr, y0 + Math.sin(a) * cr * 0.9, j % 7 === 0 ? 2 : 3)
      }
      // Sparks drifting round it, faster while it thinks.
      for (let j = 0; j < 7; j++) {
        const a = t * (mode === 'think' ? 1.3 : 0.45) * (j % 2 ? 1 : -1) + j * 0.9
        const r = rad * (1.6 + 0.15 * Math.sin(t * 0.8 + j))
        const tw = Math.sin(t * 3 + j * 1.7)
        if (tw > -0.2) put(x0 + Math.cos(a) * r, y0 + Math.sin(a) * r * 0.8, tw > 0.6 ? 3 : 2)
      }
    }
  }
}
