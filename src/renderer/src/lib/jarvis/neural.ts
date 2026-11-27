// Nova's "neural" look: a hollow globe of LED nodes joined by links, like a small brain or a constellation. Signals
// fire along the links: a few at rest, more while it listens (with your voice), a storm while it thinks, and in time
// with its voice while it speaks; a node lights up when a signal reaches it and sometimes passes it on.
// It's pure drawing in LED cells, the same way Roamies' JARVIS globe is drawn (roamies/jarvis.js), so the floating
// Nova can wear it (as a look beside "jarvis") and Nova's main screen draws it big with its own cells (NovaNeural.tsx).
// k.put(x, y, level) writes a cell (the brightest write wins); k.th(x, y) is the dither threshold there; k.L the top level.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Kit = { put: (x: number, y: number, level: number) => void; th: (x: number, y: number) => number; L: number }
type Net = { nodes: number[][]; links: [number, number][]; long: [number, number][]; near: number[][]; pulses: { a: number; b: number; u: number; hops: number }[]; flash: Float32Array; spawn: number }

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v)
/** Points spread evenly over a sphere (golden spiral). */
const sphere = (n: number): number[][] =>
  Array.from({ length: n }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / n
    const r = Math.sqrt(1 - y * y)
    const a = i * 2.39996
    return [Math.cos(a) * r, y, Math.sin(a) * r]
  })
/** A network on the sphere: each node linked to its three nearest neighbours. */
function makeNet(n: number): Net {
  const nodes = sphere(n)
  const links: [number, number][] = []
  const seen = new Set<string>()
  const near: number[][] = nodes.map(() => [])
  nodes.forEach((p, i) => {
    const by = nodes
      .map((q, j) => [j, (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2] as const)
      .filter(([j]) => j !== i)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 3)
    for (const [j] of by) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`
      if (seen.has(key)) continue
      seen.add(key)
      links.push([i, j])
      near[i].push(j)
      near[j].push(i)
    }
  })
  // A few long links across the inside, between nodes far apart (a brain more than a net)
  const long: [number, number][] = []
  for (let i = 0; long.length < Math.round(n / 7) && i < n * 20; i++) {
    const a = (i * 37) % n
    const b = (i * 59 + 11) % n
    const d = (nodes[a][0] - nodes[b][0]) ** 2 + (nodes[a][1] - nodes[b][1]) ** 2 + (nodes[a][2] - nodes[b][2]) ** 2
    if (d > 1.2 && d < 2.6 && !long.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) {
      long.push([a, b])
      near[a].push(b)
      near[b].push(a)
    }
  }
  return { nodes, links, long, near, pulses: [], flash: new Float32Array(n), spawn: 0 }
}

export const neural = {
  // How lively it is: the real voice while it talks, your voice while it listens, a slow breath otherwise.
  level(st: any): number {
    const t = st.t
    if (st.mode === 'talk' && st.voice != null) return clamp(0.3 + st.voice * 0.9, 0, 1)
    if (st.mode === 'talk') return clamp(0.45 + 0.35 * Math.abs(Math.sin(t * 11.3)) * Math.abs(Math.sin(t * 2.9 + 1)), 0, 1)
    if (st.mode === 'listen') return clamp(st.heard ?? 0.35 + 0.3 * Math.abs(Math.sin(t * 4.1)), 0, 1)
    if (st.mode === 'think') return 0.3
    return 0.12 + 0.05 * Math.sin(t * 1.4)
  },

  // The globe. cx, cy: its centre in cells; rad: its radius in cells.
  body(k: Kit, cx: number, cy: number, rad: number, st: any): void {
    const { put, th, L } = k
    const t = st.t
    const dt = Math.min(0.05, st.dt ?? 0.016)
    const n = rad < 9 ? 34 : rad < 18 ? 56 : 80
    if (!st.net || st.net.nodes.length !== n) st.net = makeNet(n)
    const net: Net = st.net
    const v = this.level(st)
    const mode = st.mode
    const A = st.act
    // Turning: slow at rest, faster while it thinks.
    const spinRate = mode === 'think' ? 0.9 : A === 'hype' ? 2.4 : st.sleepy > 0.5 ? 0.06 : 0.22
    st.spin = (st.spin ?? 0) + spinRate * dt
    const look = st.look ?? [0, 0]
    const yaw = st.spin + look[0] * 0.5
    const pitch = -0.35 + look[1] * 0.25
    const cyw = Math.cos(yaw)
    const syw = Math.sin(yaw)
    const cp = Math.cos(pitch)
    const sp = Math.sin(pitch)
    const breath = 1 + (st.sleepy > 0.5 ? 0.03 : 0.018) * Math.sin(t * 1.3)
    const wavy = mode === 'talk' || mode === 'listen' ? v : 0.1
    // Where each node lands on screen (x, y in cells) and how near it is (z: 1 toward you, -1 behind).
    const P = net.nodes.map((p) => {
      const band = Math.sin(p[1] * 6 - t * (mode === 'talk' ? 8 : 2.5)) * 0.5 + 0.5
      const r = rad * breath * (1 + wavy * 0.1 * band)
      let x = p[0] * cyw + p[2] * syw
      let z = -p[0] * syw + p[2] * cyw
      const y = p[1] * cp - z * sp
      z = p[1] * sp + z * cp
      x = cx + x * r
      return [x, cy + y * r, z, band]
    })
    // The links: faint dotted lines behind, steadier in front, brighter with the voice.
    for (const [a, b] of net.links) {
      const pa = P[a]
      const pb = P[b]
      const z = (pa[2] + pb[2]) / 2
      const len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1])
      const steps = Math.max(2, Math.ceil(len * 1.4))
      for (let s = 1; s < steps; s++) {
        const u = s / steps
        const x = pa[0] + (pb[0] - pa[0]) * u
        const y = pa[1] + (pb[1] - pa[1]) * u
        const d = th(Math.floor(x), Math.floor(y))
        if (z < -0.1) {
          if (d < 0.2) put(x, y, 1)
        } else if (z < 0.45) {
          if (d < 0.6 + wavy * 0.3) put(x, y, 1)
        } else put(x, y, wavy > 0.5 && (pa[3] + pb[3]) / 2 > 0.6 ? 2 : 1)
      }
    }
    // The long links: faint, dotted, through the middle.
    for (const [a, b] of net.long) {
      const pa = P[a]
      const pb = P[b]
      const len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1])
      const steps = Math.max(2, Math.ceil(len * 1.2))
      for (let s = 1; s < steps; s++) {
        const u = s / steps
        const x = pa[0] + (pb[0] - pa[0]) * u
        const y = pa[1] + (pb[1] - pa[1]) * u
        if (th(Math.floor(x), Math.floor(y)) < 0.28 + wavy * 0.2) put(x, y, 1)
      }
    }
    // Signals: how many start each second, by what it's doing.
    const rate = mode === 'think' ? 9 : mode === 'talk' ? 2 + v * 12 : mode === 'listen' ? 1.5 + v * 7 : A ? 5 : 1.3
    net.spawn += rate * dt
    while (net.spawn >= 1 && net.pulses.length < 60) {
      net.spawn -= 1
      const all = net.long.length && Math.random() < 0.2 ? net.long : net.links
      const [a, b] = all[Math.floor(Math.random() * all.length)]
      net.pulses.push(Math.random() < 0.5 ? { a, b, u: 0, hops: 0 } : { a: b, b: a, u: 0, hops: 0 })
    }
    net.spawn = Math.min(net.spawn, 3)
    const speed = mode === 'think' ? 2.6 : mode === 'talk' ? 1.8 + v * 1.5 : 1.2
    const next: Net['pulses'] = []
    for (const q of net.pulses) {
      q.u += speed * dt
      const pa = P[q.a]
      const pb = P[q.b]
      if (q.u >= 1) {
        // It arrives: the node lights, and often passes the signal on to a neighbour (a little cascade).
        net.flash[q.b] = 1
        if (q.hops < 4 && Math.random() < (mode === 'think' ? 0.7 : 0.45)) {
          const nb = net.near[q.b].filter((j) => j !== q.a)
          if (nb.length) next.push({ a: q.b, b: nb[Math.floor(Math.random() * nb.length)], u: 0, hops: q.hops + 1 })
        }
        continue
      }
      next.push(q)
      const z = pa[2] + (pb[2] - pa[2]) * q.u
      const lv = z < -0.2 ? 2 : L
      for (let s = 0; s < 3; s++) {
        const u = q.u - s * 0.06
        if (u < 0) break
        put(pa[0] + (pb[0] - pa[0]) * u, pa[1] + (pb[1] - pa[1]) * u, Math.max(1, lv - s))
      }
    }
    net.pulses = next
    // The nodes: small and dim behind, a bright point in front, a cross where a signal just arrived.
    P.forEach(([x, y, z], i) => {
      const f = net.flash[i]
      net.flash[i] = Math.max(0, f - dt * 2.5)
      if (z < -0.15 && f < 0.3) {
        if (th(Math.floor(x), Math.floor(y)) < 0.6) put(x, y, 1)
        return
      }
      const lv = f > 0.3 ? L : z > 0.25 ? 3 : 2
      put(x, y, lv)
      if (f > 0.45 || (z > 0.2 && rad >= 22)) {
        const arm = f > 0.45 ? L - 1 : z > 0.55 ? 3 : 2
        put(x + 1, y, arm)
        put(x - 1, y, arm)
        put(x, y + 1, arm)
        put(x, y - 1, arm)
      }
    })
    // Thinking: a short arc of light sweeping round the globe, as the JARVIS look does.
    if (mode === 'think')
      for (let i = 0; i < 12; i++) {
        const a = t * 3 - i * 0.06
        put(cx + Math.cos(a) * (rad + 2.5), cy + Math.sin(a) * (rad + 2.5), i < 3 ? L : i < 7 ? L - 1 : 2)
      }
  }
}
