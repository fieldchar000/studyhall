// The galaxy sky behind Home and the Brain. Everything you've saved is a star in one of four
// galaxies (study, life, projects & other, deadlines). Scrolling up from Home folds the galaxies
// into a see-through brain, each lobe holding one kind of thing. Pure three.js, no React.

import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

export type Cat = 'study' | 'life' | 'proj' | 'due'
export type Lobe = 'prefrontal' | 'frontal' | 'motor' | 'parietal' | 'temporal' | 'occipital' | 'cerebellum'

export interface GStar {
  id: string
  label: string
  sub: string
  cat: Cat
  lobe: Lobe
  big?: boolean // modules, people: brighter anchors
  born: number // 0..1 across the time-lapse
  ring?: boolean // a missing topic: drawn as a dark ring
}

export const CAT_INFO: Record<Cat, { label: string; hex: string }> = {
  study: { label: 'Study', hex: '#39ff88' },
  life: { label: 'Life & people', hex: '#ff3ea5' },
  proj: { label: 'Projects & more', hex: '#9b7bff' },
  due: { label: 'Deadlines', hex: '#ff3b3b' }
}
export const LOBE_INFO: Record<Lobe, { name: string; holds: string }> = {
  prefrontal: { name: 'Prefrontal', holds: 'deadlines & exams' },
  frontal: { name: 'Frontal lobe', holds: 'people & plans' },
  motor: { name: 'Motor strip', holds: 'projects & tasks' },
  parietal: { name: 'Parietal lobe', holds: 'modules & weeks' },
  temporal: { name: 'Temporal lobe', holds: 'notes & ideas' },
  occipital: { name: 'Occipital lobe', holds: 'files & papers' },
  cerebellum: { name: 'Cerebellum', holds: 'habits & hobbies' }
}

const CK: Cat[] = ['study', 'life', 'proj', 'due']
const CL: Record<Cat, { center: [number, number, number]; R: number; tilt: [number, number, number]; arms: number; spin: number }> = {
  study: { center: [-3.4, 0.7, 0], R: 2.4, tilt: [0.95, 0.2, 0.25], arms: 2, spin: 0.1 },
  life: { center: [3.5, -0.6, -0.6], R: 2.0, tilt: [1.15, -0.5, -0.2], arms: 3, spin: -0.09 },
  proj: { center: [0.2, -2.7, -1.9], R: 1.15, tilt: [0.5, 0.8, 0.4], arms: 2, spin: 0.14 },
  due: { center: [5.9, 3.3, -6.5], R: 0.9, tilt: [1.3, 0.3, 0.6], arms: 2, spin: 0.18 }
}
const CI: Record<Cat, number> = { study: 0, life: 1, proj: 2, due: 3 }

export interface SkyState {
  /** 0 = Home (calendar), 1 = Brain view. */
  b: number
  /** Whether the stars should fold into the brain when you're in the Brain view. */
  brain: boolean
  /** Lit-up stars (search results, answers…); null = none. */
  hi: Set<string> | null
  focus: string | null
  /** 0..1, only below 1 during the time-lapse. */
  timeT: number
  /** Where the galaxies sit on Home, as a fraction of the height from the top. */
  band: number
  /** Extra links to draw dashed and bright (suggested links). */
  dashed: [string, string][]
}

// ---------- tiny seeded random ----------
function makeRng(seed: number): () => number {
  let s = seed
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const clamp = (x: number, a = 0, b = 1): number => Math.min(b, Math.max(a, x))
const hashStr = (s: string): number => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

// ---------- procedural hollow brain ----------
interface BrainPt {
  p: [number, number, number]
  lobe: Lobe
  gy: number
}
function makeBrainPools(rng: () => number, n: number): Record<Lobe, BrainPt[]> {
  const gauss = (): number => {
    let u = 0
    while (!u) u = rng()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng())
  }
  void gauss
  const unit = (): [number, number, number] => {
    const z = rng() * 2 - 1
    const a = rng() * Math.PI * 2
    const r = Math.sqrt(1 - z * z)
    return [r * Math.cos(a), z, r * Math.sin(a)]
  }
  const hash3 = (x: number, y: number, z: number): number => {
    const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453
    return h - Math.floor(h)
  }
  const vnoise = (x: number, y: number, z: number): number => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
    const xf = x - xi, yf = y - yi, zf = z - zi
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf)
    const L = (a: number, b: number, t: number): number => a + (b - a) * t
    const c = (i: number, j: number, k: number): number => hash3(xi + i, yi + j, zi + k)
    return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w)
  }
  const ridged = (x: number, y: number, z: number): number => {
    const nn = vnoise(x * 6.2, y * 6.2, z * 6.2) * 0.7 + vnoise(x * 12.5 + 11, y * 12.5, z * 12.5) * 0.3
    return 1 - Math.abs(2 * nn - 1)
  }
  const SC = 2.15
  const point = (): BrainPt => {
    for (;;) {
      const d = unit()
      if (rng() < 0.1) {
        const f = 1 + 0.06 * Math.sin(d[1] * 30 + d[2] * 3)
        return { p: [d[0] * 0.6 * f * SC, (d[1] * 0.3 * f - 0.5) * SC, (d[2] * 0.42 * f - 0.8) * SC], lobe: 'cerebellum', gy: 0.5 + 0.5 * Math.sin(d[1] * 30 + d[2] * 3) }
      }
      const s = rng() < 0.5 ? -1 : 1
      let x = d[0]
      const y = d[1], z = d[2]
      if (x * s < 0) x *= 0.74
      let ry = 0.72
      if (y < 0) ry *= 0.62
      if (z > 0) ry *= 1 - 0.1 * z
      let px = x * 0.6, py = y * ry, pz = z * 1.05
      const lat = Math.max(0, x * s)
      const tl = Math.exp(-((y + 0.6) ** 2 / 0.09 + (z - 0.1) ** 2 / 0.22)) * lat
      py -= tl * 0.2
      px += s * tl * 0.05
      if (pz < -0.55) {
        px *= 1 + (pz + 0.55) * 0.45
        py *= 1 + (pz + 0.55) * 0.2
      }
      const gy = ridged(px + s * 2, py, pz)
      if (gy < 0.45 && rng() < 0.85) continue
      if (y > -0.15 && Math.abs(z - (0.06 - 0.32 * y)) < 0.05 && rng() < 0.92) continue // central sulcus
      if (lat > 0.35 && z > -0.45 && z < 0.55 && Math.abs(y - (-0.12 + 0.28 * z)) < 0.05 && rng() < 0.92) continue // lateral fissure
      const g = 1 + 0.09 * (gy - 0.5)
      px *= g
      py *= g
      pz *= g
      let lobe: Lobe
      if (z > 0.72) lobe = 'prefrontal'
      else if (y < -0.2 && z > -0.55 && lat > 0.3) lobe = 'temporal'
      else if (z > 0.2) lobe = 'frontal'
      else if (z > -0.05) lobe = 'motor'
      else if (z > -0.6) lobe = 'parietal'
      else lobe = 'occipital'
      return { p: [(px + s * 0.5) * SC, (py + 0.12) * SC, pz * SC], lobe, gy }
    }
  }
  const pools = { prefrontal: [], frontal: [], motor: [], parietal: [], temporal: [], occipital: [], cerebellum: [] } as Record<Lobe, BrainPt[]>
  for (let i = 0; i < n; i++) {
    const b = point()
    pools[b.lobe].push(b)
  }
  return pools
}

type Node3 = GStar & { local: [number, number, number]; brain: THREE.Vector3; col: [number, number, number]; seed: number; ci: number }

export class GalaxyScene {
  private renderer: THREE.WebGLRenderer
  private composer: EffectComposer
  private bloom: UnrealBloomPass
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300)
  private group = new THREE.Group()
  private rng = makeRng(20261117)
  private centers: THREE.Vector3[] = []
  private tilts: THREE.Matrix3[] = []
  private spins: number[] = []
  private pools: Record<Lobe, BrainPt[]>
  private U: Record<string, THREE.IUniform>
  private NU: Record<string, THREE.IUniform>
  private dpr: number
  private raf = 0
  private time = 0
  private morph = 0
  private last = performance.now()
  private dimSm = 1
  private rotY = 0
  private rotV = 0
  private first = true
  private camPos = new THREE.Vector3()
  private camLook = new THREE.Vector3()
  private sw = 0
  private sh = 0
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

  // stars you saved
  private nodes: Node3[] = []
  private byId = new Map<string, number>()
  private links: [number, number][] = []
  private items!: THREE.Points
  private iGeo = new THREE.BufferGeometry()
  private P: THREE.Vector3[] = []
  private scr: { x: number; y: number; on: boolean }[] = []
  // wispy links
  private lGeo = new THREE.BufferGeometry()
  private lineCap = 0
  private SEG = 18

  private state: SkyState = { b: 0, brain: true, hi: null, focus: null, timeT: 1, band: 0.13, dashed: [] }
  private hoverIdx: number | null = null
  private mouse: { x: number; y: number } | null = null
  private dragging: { x: number; moved: number; id: number } | null = null
  private overlay: HTMLElement
  private tip: HTMLDivElement
  private lobeEls: { el: HTMLDivElement; p: THREE.Vector3 }[] = []
  private clEls: { el: HTMLDivElement; p: THREE.Vector3; cat: Cat }[] = []
  private pointerEl: HTMLElement | null = null
  private off: (() => void)[] = []

  onSelect: (id: string) => void = () => {}
  onOpen: (id: string) => void = () => {}

  constructor(
    private canvas: HTMLCanvasElement,
    opts: { lowPower?: boolean; overlay: HTMLElement }
  ) {
    this.overlay = opts.overlay
    this.dpr = Math.min(devicePixelRatio || 1, opts.lowPower ? 1.25 : 1.75)
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(this.dpr)
    this.renderer.setClearColor(0x04050a, 1)
    this.scene.add(this.group)
    for (const k of CK) {
      const c = CL[k]
      this.centers.push(new THREE.Vector3(...c.center))
      this.tilts.push(new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...c.tilt))))
      this.spins.push(c.spin)
    }
    this.centers.push(new THREE.Vector3())
    this.tilts.push(new THREE.Matrix3())
    this.spins.push(0)
    this.pools = makeBrainPools(this.rng, opts.lowPower ? 30000 : 46000)
    this.U = {
      uTime: { value: 0 },
      uMorph: { value: 0 },
      uPix: { value: this.dpr },
      uDim: { value: 1 },
      uTimeT: { value: 1 },
      uCenter: { value: this.centers },
      uTilt: { value: this.tilts },
      uSpin: { value: this.spins }
    }
    this.NU = { uFade: { value: 1 }, uPix: { value: this.dpr } }
    this.buildDust(opts.lowPower ? 0.6 : 1)
    this.buildNebula()
    this.buildStars()
    this.buildItems()
    this.buildLinks(600)
    this.buildLabels()
    this.tip = document.createElement('div')
    this.tip.className = 'galaxy-tip'
    this.tip.hidden = true
    this.overlay.appendChild(this.tip)

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.32, 0.12)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
    this.raf = requestAnimationFrame(this.frame)
  }

  // ---------- public ----------

  set(s: Partial<SkyState>): void {
    Object.assign(this.state, s)
  }

  setStars(stars: GStar[], links: [string, string][]): void {
    const rng = makeRng(7)
    const g = this.gauss(rng)
    this.nodes = stars.map((s) => {
      const r0 = makeRng(hashStr(s.id))
      const c = CL[s.cat]
      const r = c.R * (s.big ? 0.1 + r0() * 0.22 : 0.2 + r0() * 0.7)
      const arm = Math.floor(r0() * c.arms)
      const a = (arm * 2 * Math.PI) / c.arms + (r / c.R) * 4.2 + (r0() - 0.5) * 0.5
      const pool = this.pools[s.lobe]
      const b = pool[Math.floor(r0() * pool.length)]
      const col = new THREE.Color(s.ring ? '#ff6b6b' : CAT_INFO[s.cat].hex)
      return {
        ...s,
        local: [Math.cos(a) * r, g() * 0.04 * c.R, Math.sin(a) * r] as [number, number, number],
        brain: new THREE.Vector3(...b.p).multiplyScalar(1.04),
        col: [col.r, col.g, col.b] as [number, number, number],
        seed: r0(),
        ci: CI[s.cat]
      }
    })
    void rng
    this.byId = new Map(this.nodes.map((n, i) => [n.id, i]))
    this.links = links.map(([a, b]) => [this.byId.get(a), this.byId.get(b)] as [number | undefined, number | undefined]).filter((l): l is [number, number] => l[0] != null && l[1] != null)
    this.P = this.nodes.map(() => new THREE.Vector3())
    this.scr = this.nodes.map(() => ({ x: 0, y: 0, on: false }))
    const n = this.nodes.length
    this.iGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
    const colA = new Float32Array(n * 3)
    const ring = new Float32Array(n)
    this.nodes.forEach((nd, i) => {
      colA.set(nd.col, i * 3)
      ring[i] = nd.ring ? 1 : 0
    })
    this.iGeo.setAttribute('color', new THREE.BufferAttribute(colA, 3))
    this.iGeo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(n), 1))
    this.iGeo.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(n), 1))
    this.iGeo.setAttribute('ring', new THREE.BufferAttribute(ring, 1))
    this.clEls.forEach((c) => {
      const count = this.nodes.filter((x) => x.cat === c.cat && !x.ring).length
      const span = c.el.querySelector('span')
      if (span) span.textContent = `${count} star${count === 1 ? '' : 's'}`
    })
  }

  /** Pointer events (drag to turn, hover, click) come from this element, e.g. the scroller. */
  bindPointer(el: HTMLElement): void {
    this.pointerEl = el
    const isUi = (t: EventTarget | null): boolean => !!(t as HTMLElement | null)?.closest?.('[data-ui]')
    const down = (e: PointerEvent): void => {
      if (isUi(e.target) || this.state.b < 0.6) return
      this.dragging = { x: e.clientX, moved: 0, id: e.pointerId }
    }
    const move = (e: PointerEvent): void => {
      const r = this.canvas.getBoundingClientRect()
      this.mouse = isUi(e.target) ? null : { x: e.clientX - r.left, y: e.clientY - r.top }
      const d = this.dragging
      if (d && e.pointerId === d.id) {
        const dx = e.clientX - d.x
        d.x = e.clientX
        d.moved += Math.abs(dx)
        if (d.moved > 4) {
          this.rotY += dx * 0.006
          this.rotV = dx * 0.006
          el.style.cursor = 'grabbing'
        }
      }
    }
    const up = (e: PointerEvent): void => {
      const d = this.dragging
      this.dragging = null
      el.style.cursor = ''
      if (d && d.moved < 5 && this.hoverIdx != null && !isUi(e.target)) this.onSelect(this.nodes[this.hoverIdx].id)
    }
    const dbl = (e: MouseEvent): void => {
      if (!isUi(e.target) && this.hoverIdx != null) this.onOpen(this.nodes[this.hoverIdx].id)
    }
    const leave = (): void => {
      this.mouse = null
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    el.addEventListener('dblclick', dbl)
    el.addEventListener('pointerleave', leave)
    this.off.push(() => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      el.removeEventListener('dblclick', dbl)
      el.removeEventListener('pointerleave', leave)
    })
  }

  dispose(): void {
    cancelAnimationFrame(this.raf)
    this.off.forEach((f) => f())
    this.overlay.replaceChildren()
    this.scene.traverse((o) => {
      const m = o as THREE.Points
      m.geometry?.dispose()
      const mat = m.material as THREE.Material | undefined
      mat?.dispose()
    })
    this.composer.dispose()
    this.renderer.dispose()
  }

  // ---------- building ----------

  private gauss(rng: () => number): () => number {
    return () => {
      let u = 0
      while (!u) u = rng()
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng())
    }
  }
  private unit(): [number, number, number] {
    const z = this.rng() * 2 - 1
    const a = this.rng() * Math.PI * 2
    const r = Math.sqrt(1 - z * z)
    return [r * Math.cos(a), z, r * Math.sin(a)]
  }
  private pick(lobe: Lobe): BrainPt {
    const a = this.pools[lobe]
    return a[Math.floor(this.rng() * a.length)]
  }
  private pickW(w: Partial<Record<Lobe, number>>): BrainPt {
    const r = this.rng()
    let acc = 0
    for (const [k, v] of Object.entries(w) as [Lobe, number][]) {
      acc += v
      if (r <= acc) return this.pick(k)
    }
    return this.pick(Object.keys(w)[0] as Lobe)
  }

  private buildDust(scale: number): void {
    const rng = this.rng
    const gauss = this.gauss(rng)
    const galaxyLocal = (R: number, arms: number): [number, number, number] => {
      if (rng() < 0.16) {
        const r = Math.abs(gauss()) * R * 0.15
        const d = this.unit()
        return [d[0] * r, d[1] * r * 0.55, d[2] * r]
      }
      let r = -Math.log(1 - rng() * 0.95) * R * 0.33
      if (r > R) r = R * rng()
      const arm = Math.floor(rng() * arms)
      const a = (arm * 2 * Math.PI) / arms + (r / R) * 4.2 + gauss() * 0.3 * (0.55 + 0.45 * (1 - r / R))
      return [Math.cos(a) * r + gauss() * 0.035 * R, gauss() * 0.045 * R * (1 + 1.6 * (1 - r / R)), Math.sin(a) * r + gauss() * 0.035 * R]
    }
    const COUNTS: Record<Cat, number> = { study: 6800, life: 5400, proj: 2100, due: 1400 }
    const CAT_LOBES: Record<Cat, Partial<Record<Lobe, number>>> = {
      study: { temporal: 0.45, parietal: 0.33, occipital: 0.22 },
      life: { frontal: 0.74, cerebellum: 0.26 },
      proj: { motor: 1 },
      due: { prefrontal: 1 }
    }
    const ALL: Partial<Record<Lobe, number>> = { temporal: 0.2, parietal: 0.2, occipital: 0.1, frontal: 0.25, motor: 0.1, prefrontal: 0.07, cerebellum: 0.08 }
    const FIL = Math.round(1900 * scale)
    const N = CK.reduce((s, k) => s + Math.round(COUNTS[k] * scale), 0) + FIL
    const aLocal = new Float32Array(N * 3), aBrain = new Float32Array(N * 3), aColor = new Float32Array(N * 3)
    const aSize = new Float32Array(N), aSeed = new Float32Array(N), aCluster = new Float32Array(N), aBorn = new Float32Array(N), aGy = new Float32Array(N)
    let n = 0
    const ice = new THREE.Color('#cfe3ff')
    for (const k of CK) {
      const c = CL[k]
      const base = new THREE.Color(CAT_INFO[k].hex)
      for (let i = 0; i < Math.round(COUNTS[k] * scale); i++, n++) {
        const l = galaxyLocal(c.R, c.arms)
        const r = Math.hypot(l[0], l[2])
        aLocal.set(l, n * 3)
        const b = this.pickW(CAT_LOBES[k])
        aBrain.set(b.p, n * 3)
        aGy[n] = b.gy
        const wmix = 0.6 * Math.exp(-r / (0.16 * c.R))
        const star = rng() < 0.05
        const tint = star ? ice : base
        const mix = star ? 0.3 : wmix
        aColor.set([tint.r + (1 - tint.r) * mix, tint.g + (1 - tint.g) * mix, tint.b + (1 - tint.b) * mix], n * 3)
        aSize[n] = star ? 2.6 + rng() * 2.2 : 1.3 + rng() * 2.0 + wmix * 2
        aSeed[n] = rng()
        aCluster[n] = CI[k]
        aBorn[n] = Math.pow(rng(), 0.8)
      }
    }
    // filaments: thin streams of dust between the galaxies
    const pairs: [Cat, Cat][] = [['study', 'life'], ['life', 'due'], ['study', 'proj'], ['proj', 'life'], ['study', 'due']]
    const fils = pairs.map(([a, b]) => {
      const A = this.centers[CI[a]], B = this.centers[CI[b]]
      const M = A.clone().add(B).multiplyScalar(0.5).add(new THREE.Vector3(gauss(), gauss(), gauss()).multiplyScalar(1.1))
      return { A, B, M, ca: new THREE.Color(CAT_INFO[a].hex), cb: new THREE.Color(CAT_INFO[b].hex) }
    })
    const tmp = new THREE.Vector3()
    for (let i = 0; i < FIL; i++, n++) {
      const f = fils[i % fils.length]
      const u = 0.1 + rng() * 0.8, iu = 1 - u
      tmp.set(0, 0, 0).addScaledVector(f.A, iu * iu).addScaledVector(f.M, 2 * iu * u).addScaledVector(f.B, u * u)
      tmp.add(new THREE.Vector3(gauss(), gauss(), gauss()).multiplyScalar(0.08 + 0.22 * Math.sin(Math.PI * u) * (0.5 + rng())))
      aLocal.set([tmp.x, tmp.y, tmp.z], n * 3)
      const b = this.pickW(ALL)
      aBrain.set(b.p, n * 3)
      aGy[n] = b.gy
      aColor.set([f.ca.r * iu + f.cb.r * u, f.ca.g * iu + f.cb.g * u, f.ca.b * iu + f.cb.b * u], n * 3)
      aSize[n] = 0.9 + rng() * 1.3
      aSeed[n] = rng()
      aCluster[n] = 4
      aBorn[n] = 0.3 + rng() * 0.7
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(aBrain, 3))
    const attrs: [string, Float32Array, number][] = [['aLocal', aLocal, 3], ['aBrain', aBrain, 3], ['aColor', aColor, 3], ['aSize', aSize, 1], ['aSeed', aSeed, 1], ['aCluster', aCluster, 1], ['aBorn', aBorn, 1], ['aGy', aGy, 1]]
    for (const [k, v, s] of attrs) geo.setAttribute(k, new THREE.BufferAttribute(v, s))
    const mat = new THREE.ShaderMaterial({
      uniforms: this.U,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec3 aLocal; attribute vec3 aBrain; attribute vec3 aColor; attribute float aSize; attribute float aSeed; attribute float aCluster; attribute float aBorn; attribute float aGy;
        uniform float uTime, uMorph, uPix, uDim, uTimeT; uniform vec3 uCenter[5]; uniform mat3 uTilt[5]; uniform float uSpin[5];
        varying vec3 vColor; varying float vA;
        void main(){
          int ci = int(aCluster + 0.5);
          vec3 l = aLocal; float r = length(l.xz); float ang = uTime * uSpin[ci] / (0.35 + r);
          float c = cos(ang), s = sin(ang); l = vec3(c*l.x - s*l.z, l.y, s*l.x + c*l.z);
          vec3 g = uTilt[ci] * l + uCenter[ci];
          float t = clamp(uMorph * 1.7 - aSeed * 0.7, 0.0, 1.0); float e = t*t*(3.0-2.0*t);
          vec3 b = aBrain + 0.012 * vec3(sin(uTime*1.3 + aSeed*40.0), cos(uTime*1.1 + aSeed*30.0), sin(uTime*0.9 + aSeed*20.0));
          vec3 p = mix(g, b, e) + normalize(g - b + 1e-4) * sin(e * 3.14159) * 0.45 * (0.4 + aSeed);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          float born = smoothstep(aBorn, aBorn + 0.04, uTimeT);
          gl_PointSize = aSize * uPix * (6.5 / -mv.z) * born * mix(1.0, 0.8, e);
          vColor = aColor;
          float tw = 0.75 + 0.25 * sin(uTime * 1.7 + aSeed * 60.0);
          vA = (0.2 + 0.3 * fract(aSeed * 7.31)) * tw * uDim * born * mix(1.0, 0.3 + aGy * 2.2, e);
        }`,
      fragmentShader: /* glsl */ `varying vec3 vColor; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vColor, a * a * vA); }`
    })
    const pts = new THREE.Points(geo, mat)
    pts.frustumCulled = false
    this.group.add(pts)
  }

  private buildNebula(): void {
    const gauss = this.gauss(this.rng)
    const NB = 64
    const pos = new Float32Array(NB * 3), col = new Float32Array(NB * 3), size = new Float32Array(NB)
    for (let i = 0; i < NB; i++) {
      const k = CK[i % 4]
      const c = CL[k]
      const p = this.centers[CI[k]].clone().add(new THREE.Vector3(gauss(), gauss() * 0.5, gauss()).multiplyScalar(c.R * 0.45))
      pos.set([p.x, p.y, p.z], i * 3)
      const cc = new THREE.Color(CAT_INFO[k].hex)
      col.set([cc.r, cc.g, cc.b], i * 3)
      size[i] = ((110 + this.rng() * 170) * c.R) / 2
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3))
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    const pts = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        uniforms: this.NU,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `attribute vec3 aColor; attribute float aSize; uniform float uPix; varying vec3 vC; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uPix * (8.0 / -mv.z); vC = aColor; }`,
        fragmentShader: `uniform float uFade; varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5); float a = exp(-d*d*14.0); gl_FragColor = vec4(vC, a * 0.018 * uFade); }`
      })
    )
    pts.frustumCulled = false
    this.group.add(pts)
  }

  private buildStars(): void {
    const SN = 2600
    const sp = new Float32Array(SN * 3), ss = new Float32Array(SN)
    for (let i = 0; i < SN; i++) {
      const d = this.unit()
      const r = 55 + this.rng() * 40
      sp.set([d[0] * r, d[1] * r, d[2] * r], i * 3)
      ss[i] = 0.6 + this.rng() * 1.6
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(sp, 3))
    geo.setAttribute('aSize', new THREE.BufferAttribute(ss, 1))
    this.scene.add(
      new THREE.Points(
        geo,
        new THREE.ShaderMaterial({
          uniforms: { uPix: { value: this.dpr } },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          vertexShader: `attribute float aSize; uniform float uPix; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uPix; }`,
          fragmentShader: `void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(0.85, 0.9, 1.0, smoothstep(0.5, 0.0, d) * 0.7); }`
        })
      )
    )
  }

  private buildItems(): void {
    this.items = new THREE.Points(
      this.iGeo,
      new THREE.ShaderMaterial({
        uniforms: { uPix: { value: this.dpr } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `attribute vec3 color; attribute float size; attribute float alpha; attribute float ring; uniform float uPix; varying vec3 vC; varying float vA; varying float vR;
          void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = size * uPix * (7.0 / -mv.z); vC = color; vA = alpha; vR = ring; }`,
        fragmentShader: `varying vec3 vC; varying float vA; varying float vR;
          void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
            if (vR > 0.5) { float r = smoothstep(0.07, 0.0, abs(d - 0.34)); gl_FragColor = vec4(vC, r * vA); return; }
            float core = smoothstep(0.16, 0.0, d); float halo = smoothstep(0.5, 0.0, d);
            gl_FragColor = vec4(mix(vC, vec3(1.0), core * 0.7), (core + halo * halo * 0.55) * vA); }`
      })
    )
    this.items.frustumCulled = false
    this.group.add(this.items)
  }

  private buildLinks(cap: number): void {
    this.lineCap = cap
    const v = cap * this.SEG * 2
    this.lGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v * 3), 3))
    this.lGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(v * 3), 3))
    this.lGeo.setAttribute('a', new THREE.BufferAttribute(new Float32Array(v), 1))
    const lines = new THREE.LineSegments(
      this.lGeo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `attribute vec3 color; attribute float a; varying vec3 vC; varying float vA; void main(){ vC = color; vA = a; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `varying vec3 vC; varying float vA; void main(){ gl_FragColor = vec4(vC, vA); }`
      })
    )
    lines.frustumCulled = false
    this.group.add(lines)
  }

  private buildLabels(): void {
    this.overlay.replaceChildren()
    for (const [k, l] of Object.entries(LOBE_INFO) as [Lobe, { name: string; holds: string }][]) {
      const side = this.pools[k].filter((b) => b.p[0] > 0.3 || k === 'cerebellum')
      const c = new THREE.Vector3()
      side.forEach((b) => c.add(new THREE.Vector3(...b.p)))
      c.divideScalar(Math.max(1, side.length))
      const dir = c.clone().sub(new THREE.Vector3(0, 0.25, 0)).normalize()
      const el = document.createElement('div')
      el.className = 'galaxy-lbl'
      el.innerHTML = `<b>${l.name}</b><span>${l.holds}</span>`
      this.overlay.appendChild(el)
      this.lobeEls.push({ el, p: c.add(dir.multiplyScalar(0.75)) })
    }
    for (const k of CK) {
      const el = document.createElement('div')
      el.className = 'galaxy-lbl cl'
      el.innerHTML = `<b style="color:${CAT_INFO[k].hex}">${CAT_INFO[k].label}</b><span></span>`
      this.overlay.appendChild(el)
      this.clEls.push({ el, cat: k, p: this.centers[CI[k]].clone().add(new THREE.Vector3(0, CL[k].R * 0.55, 0)) })
    }
  }

  // ---------- the loop ----------

  private resize(): void {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight
    if (!w || !h || (w === this.sw && h === this.sh)) return
    this.sw = w
    this.sh = h
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h)
    this.bloom.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private nodePos(nd: Node3, o: THREE.Vector3, v: THREE.Vector3, dir: THREE.Vector3): void {
    const l = nd.local
    const r = Math.hypot(l[0], l[2])
    const ang = (this.time * this.spins[nd.ci]) / (0.35 + r)
    const c = Math.cos(ang), s = Math.sin(ang)
    v.set(c * l[0] - s * l[2], l[1], s * l[0] + c * l[2]).applyMatrix3(this.tilts[nd.ci]).add(this.centers[nd.ci])
    const t = clamp(this.morph * 1.7 - nd.seed * 0.7)
    const e = t * t * (3 - 2 * t)
    o.copy(v).lerp(nd.brain, e)
    dir.copy(v).sub(nd.brain).normalize()
    o.addScaledVector(dir, Math.sin(e * Math.PI) * 0.45 * (0.4 + nd.seed))
  }

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame)
    if (document.hidden) return
    const dt = Math.min(0.05, (now - this.last) / 1000)
    this.last = now
    this.resize()
    if (!this.sw || !this.sh) return
    const st = this.state
    const B = st.b
    this.time += dt * (this.reduced ? 0.25 : 1)
    const target = st.brain ? clamp((B - 0.25) / 0.65) : 0
    this.morph += (target - this.morph) * Math.min(1, dt * 2.2)
    const morph = this.morph
    const anyHi = !!st.hi && st.hi.size > 0
    this.U.uTime.value = this.time
    this.U.uMorph.value = morph
    this.U.uTimeT.value = st.timeT
    this.NU.uFade.value = (1 - morph) * (0.6 + 0.4 * B)
    this.dimSm += ((anyHi ? 0.85 : 1) * (0.9 + 0.1 * B) - this.dimSm) * Math.min(1, dt * 3)
    this.U.uDim.value = this.dimSm

    if (!this.dragging) {
      this.rotV *= 0.94
      this.rotY += this.rotV
    }
    const g = this.group
    g.rotation.y = this.rotY * (0.25 + 0.75 * morph) - 1.45 * morph + Math.sin(this.time * 0.22) * 0.35 * morph * (this.reduced ? 0 : 1) + (1 - morph) * Math.sin(this.time * 0.05) * 0.08
    g.rotation.x = 0.12 * morph

    // camera: Home keeps the galaxies centred in the band above the calendar
    const asp = this.camera.aspect
    const far = Math.pow(Math.max(1, 1.3 / asp), 0.9)
    const calZ = 20 * Math.max(1, far * 0.8)
    const D = calZ + 1
    const ang = Math.atan((1 - 2 * st.band) * Math.tan((25 * Math.PI) / 180))
    const calPos = new THREE.Vector3(0.4, -0.3, calZ)
    const calLook = new THREE.Vector3(0.4, -0.3 - D * Math.tan(ang), -1)
    const galPos = new THREE.Vector3(0.6, 0.1, 10.2), galLook = new THREE.Vector3(0.6, -0.1, -1.2)
    const brPos = new THREE.Vector3(0, 0.6, 8.6), brLook = new THREE.Vector3(0, 0, 0)
    const tPos = galPos.clone().lerp(brPos, morph)
    const tLook = galLook.clone().lerp(brLook, morph)
    tPos.z *= far
    tPos.lerp(calPos, 1 - B)
    tLook.lerp(calLook, 1 - B)
    if (this.first) {
      this.camPos.copy(tPos)
      this.camLook.copy(tLook)
      this.first = false
    }
    this.camPos.lerp(tPos, Math.min(1, dt * 3))
    this.camLook.lerp(tLook, Math.min(1, dt * 3))
    this.camera.position.copy(this.camPos)
    this.camera.lookAt(this.camLook)
    g.updateMatrixWorld()
    this.camera.updateMatrixWorld()

    // your stars
    const n = this.nodes.length
    const pos = this.iGeo.getAttribute('position') as THREE.BufferAttribute | undefined
    const v = new THREE.Vector3(), dir = new THREE.Vector3(), out = new THREE.Vector3()
    if (pos && n) {
      const pa = pos.array as Float32Array
      const al = (this.iGeo.getAttribute('alpha') as THREE.BufferAttribute).array as Float32Array
      const sz = (this.iGeo.getAttribute('size') as THREE.BufferAttribute).array as Float32Array
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 4)
      for (let i = 0; i < n; i++) {
        const nd = this.nodes[i]
        this.nodePos(nd, this.P[i], v, dir)
        pa[i * 3] = this.P[i].x
        pa[i * 3 + 1] = this.P[i].y
        pa[i * 3 + 2] = this.P[i].z
        const born = st.timeT >= nd.born ? 1 : 0
        const hi = !!st.hi?.has(nd.id) || st.focus === nd.id
        let a = nd.ring ? (hi ? 0.9 + 0.1 * pulse : 0) : anyHi ? (hi ? 1 : 0.13) : 0.85
        if (this.hoverIdx === i) a = Math.max(a, 1)
        al[i] = a * born * (0.55 + 0.45 * B)
        sz[i] = (nd.big ? 11 : nd.ring ? 10 : 7) * (hi ? 2 + 0.4 * pulse : 1) * (this.hoverIdx === i ? 1.5 : 1) * born
        out.copy(this.P[i]).applyMatrix4(g.matrixWorld).project(this.camera)
        const sc = this.scr[i]
        sc.x = ((out.x + 1) / 2) * this.sw
        sc.y = ((1 - out.y) / 2) * this.sh
        sc.on = out.z < 1 && al[i] > 0.12
      }
      pos.needsUpdate = true
      this.iGeo.getAttribute('alpha').needsUpdate = true
      this.iGeo.getAttribute('size').needsUpdate = true
    }

    this.drawLinks(anyHi, morph, B)
    this.drawLabels(morph, B)
    this.doHover(B)
    this.composer.render()
  }

  private drawLinks(anyHi: boolean, morph: number, B: number): void {
    const st = this.state
    const pa = (this.lGeo.getAttribute('position') as THREE.BufferAttribute).array as Float32Array
    const ca = (this.lGeo.getAttribute('color') as THREE.BufferAttribute).array as Float32Array
    const aa = (this.lGeo.getAttribute('a') as THREE.BufferAttribute).array as Float32Array
    const SEG = this.SEG
    // When something is lit, draw its links; otherwise a calm sample of everything.
    let list: { a: number; b: number; dashed: boolean }[]
    const dashed = st.dashed.map(([x, y]) => ({ a: this.byId.get(x) ?? -1, b: this.byId.get(y) ?? -1, dashed: true })).filter((l) => l.a >= 0 && l.b >= 0)
    if (anyHi) {
      const lit = this.links.filter(([a, b]) => st.hi!.has(this.nodes[a].id) && st.hi!.has(this.nodes[b].id))
      const touch = this.links.filter(([a, b]) => st.hi!.has(this.nodes[a].id) !== st.hi!.has(this.nodes[b].id)).slice(0, 120)
      list = [...lit, ...touch].map(([a, b]) => ({ a, b, dashed: false }))
    } else {
      const step = Math.max(1, Math.ceil(this.links.length / (this.lineCap - 20)))
      list = this.links.filter((_, i) => i % step === 0).map(([a, b]) => ({ a, b, dashed: false }))
    }
    list = [...dashed, ...list].slice(0, this.lineCap)
    const M = new THREE.Vector3(), dir = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0)
    let k = 0
    for (let j = 0; j < list.length; j++) {
      const { a, b, dashed: dsh } = list[j]
      const A = this.P[a], Bp = this.P[b]
      if (!A || !Bp) continue
      const na = this.nodes[a], nb = this.nodes[b]
      const born = st.timeT >= Math.max(na.born, nb.born) ? 1 : 0
      const both = !!st.hi?.has(na.id) && !!st.hi?.has(nb.id)
      const base = dsh ? 0.75 : (anyHi ? (both ? 0.55 : 0.06) : 0.2 * (1 - morph * 0.6)) * born * (0.5 + 0.5 * B)
      const len = A.distanceTo(Bp)
      const ph = (na.seed * 7.13 + nb.seed * 3.7) % 1
      dir.copy(Bp).sub(A).cross(up).normalize().multiplyScalar(len * 0.22 * (ph - 0.5) * 2)
      M.copy(A).add(Bp).multiplyScalar(0.5).add(dir)
      M.y += len * 0.08
      const head = ((this.time * (0.12 + ph * 0.18) + ph) % 1.4) - 0.2
      for (let s = 0; s < SEG; s++) {
        for (let q = 0; q < 2; q++) {
          const u = (s + q) / SEG, iu = 1 - u
          const idx = k * 2 + q
          pa[idx * 3] = iu * iu * A.x + 2 * iu * u * M.x + u * u * Bp.x
          pa[idx * 3 + 1] = iu * iu * A.y + 2 * iu * u * M.y + u * u * Bp.y
          pa[idx * 3 + 2] = iu * iu * A.z + 2 * iu * u * M.z + u * u * Bp.z
          ca[idx * 3] = dsh ? 1 : na.col[0] * iu + nb.col[0] * u
          ca[idx * 3 + 1] = dsh ? 1 : na.col[1] * iu + nb.col[1] * u
          ca[idx * 3 + 2] = dsh ? 1 : na.col[2] * iu + nb.col[2] * u
          const taper = Math.pow(Math.sin(Math.PI * u), 1.6)
          const glow = 0.25 + 0.75 * Math.exp(-((u - head) ** 2) / 0.012)
          const dash = dsh ? ((((u * 10 - this.time * 1.5) % 1) + 1) % 1 < 0.55 ? 1 : 0) : 1
          aa[idx] = base * taper * glow * dash
        }
        k++
      }
    }
    for (let z = k * 2; z < aa.length; z++) aa[z] = 0
    this.lGeo.getAttribute('position').needsUpdate = true
    this.lGeo.getAttribute('color').needsUpdate = true
    this.lGeo.getAttribute('a').needsUpdate = true
  }

  private drawLabels(morph: number, B: number): void {
    const out = new THREE.Vector3()
    const g = this.group
    const showLobes = morph > 0.55 ? (morph - 0.55) / 0.45 : 0
    const showCl = (1 - morph) * (B > 0.4 ? 1 : 0)
    const place = (el: HTMLElement, p: THREE.Vector3, o: number): void => {
      out.copy(p).applyMatrix4(g.matrixWorld).project(this.camera)
      el.style.transform = `translate(${((out.x + 1) / 2) * this.sw}px,${((1 - out.y) / 2) * this.sh}px) translate(-50%,-50%)`
      el.style.opacity = String(out.z < 1 ? o : 0)
    }
    this.lobeEls.forEach((l) => place(l.el, l.p, showLobes * 0.95 * B))
    this.clEls.forEach((l) => place(l.el, l.p, showCl * B))
  }

  private doHover(B: number): void {
    this.hoverIdx = null
    const m = this.mouse
    if (m && B > 0.6 && !this.dragging) {
      let best = 22 * 22
      this.scr.forEach((p, i) => {
        if (!p.on) return
        const d = (p.x - m.x) ** 2 + (p.y - m.y) ** 2
        if (d < best) {
          best = d
          this.hoverIdx = i
        }
      })
    }
    if (this.hoverIdx != null && m) {
      const nd = this.nodes[this.hoverIdx]
      this.tip.hidden = false
      this.tip.replaceChildren()
      const b = document.createElement('b')
      b.textContent = nd.label
      const s = document.createElement('span')
      s.textContent = [nd.sub, LOBE_INFO[nd.lobe].name].filter(Boolean).join(' · ')
      this.tip.append(b, s)
      this.tip.style.transform = `translate(${m.x + 14}px,${m.y + 14}px)`
      if (this.pointerEl) this.pointerEl.style.cursor = 'pointer'
    } else {
      this.tip.hidden = true
      if (this.pointerEl && !this.dragging) this.pointerEl.style.cursor = ''
    }
  }
}
