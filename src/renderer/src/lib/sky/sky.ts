// The live sky behind every page (not Home and the Brain, which have the 3D galaxy).
//  • nebula: thousands of fine glowing strands flowing through one big nebula shape (hollow, never a fill)
//  • blackhole: fine rings of light streaming round a black centre, bending the starlight
//  • galaxy: spiral galaxies of sharp star points, slowly turning
// It reacts: your mouse stirs it, finishing things sends a wave through it, and it glows blue while Bauer listens.

export type SkyKind = 'nebula' | 'blackhole' | 'galaxy' | 'off'
export type SkyMode = 'study' | 'life' | 'work' | 'dev'

const PAL: Record<SkyMode, [number, number, number][]> = {
  study: [[.08, .44, .56], [.16, .24, .70], [.44, .26, .70]],
  life: [[.62, .16, .42], [.38, .20, .70], [.70, .30, .45]],
  work: [[.10, .30, .62], [.22, .40, .70], [.30, .50, .66]],
  dev: [[.08, .50, .56], [.24, .26, .72], [.14, .56, .44]]
}

// ---------- tiny value noise ----------
/** The galaxies: centre (fraction of the window), size, tilt, squash (how edge-on) and turning direction. */
const GALS = [
  { x: 0.66, y: 0.44, r: 0.5, tilt: -0.38, sq: 0.42, spin: 1 },
  { x: 0.32, y: 0.84, r: 0.17, tilt: 0.55, sq: 0.5, spin: -1.4 }
]
const WIND = 5.6 // how tightly the arms wind
const PERM = new Uint8Array(512)
;(() => {
  const p = [...Array(256).keys()]
  let sd = 3
  for (let i = 255; i > 0; i--) {
    sd = (sd * 16807) % 2147483647
    const j = sd % (i + 1)
    ;[p[i], p[j]] = [p[j], p[i]]
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255]
})()
const vn = (x: number, y: number): number => {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
  const H = (a: number, b: number): number => PERM[(PERM[a & 255] + b) & 511] / 255
  const a = H(xi, yi), b = H(xi + 1, yi), c = H(xi, yi + 1), d = H(xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
const fbm2 = (x: number, y: number): number => vn(x, y) * 0.55 + vn(x * 2.1 + 5, y * 2.1) * 0.3 + vn(x * 4.3 + 9, y * 4.3) * 0.15

const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'
const BLACKHOLE = `#extension GL_OES_standard_derivatives : enable
precision highp float;uniform vec2 R;uniform float T;uniform vec3 M;uniform vec3 C2;uniform float L;uniform vec4 P0;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec3 starL(vec2 p,float sc,float th,float flare){vec2 g=floor(p*sc),f=fract(p*sc)-.5;float s=h(g);if(s<th)return vec3(0.);
  vec2 o=(vec2(h(g+3.1),h(g+7.7))-.5)*.6;vec2 d=f-o;float b=pow(fract(s*37.),4.)*.9+.1;float r=length(d);
  float core=smoothstep(.06,0.,r)+smoothstep(.22,0.,r)*.18*b;
  float sp=flare*step(.62,b)*(b-.6)*2.4*(exp(-abs(d.x)*70.)*exp(-abs(d.y)*5.)+exp(-abs(d.y)*70.)*exp(-abs(d.x)*5.));
  vec3 tint=mix(vec3(1.,.83,.66),vec3(.72,.84,1.),h(g+1.3));return tint*(core*b+sp)*(.78+.22*sin(T*1.4+s*90.));}
float iso(float v,float w){return 1.-clamp(abs(fract(v)-.5)/max(fwidth(v)*w,1e-4),0.,1.);}
void main(){vec2 uv=gl_FragCoord.xy/R.y;vec2 bh=vec2(R.x/R.y*.72,.62)+.01*vec2(sin(T*.07),cos(T*.05));
  vec2 d=uv-bh;float r=length(d);float rs=.08;
  vec2 su=uv-normalize(d)*(rs*rs*1.6)/max(r,.02);
  vec2 dm=uv-M.xy/R.y;su-=normalize(dm)*(.0009*M.z)/max(length(dm),.03);
  vec3 c=starL(su,60.,.972,1.)*1.2+starL(su+3.7,130.,.965,0.)*.7+starL(su+9.1,250.,.955,0.)*.4;
  float ang=-.28;vec2 e=mat2(cos(ang),-sin(ang),sin(ang),cos(ang))*d;vec2 dd=vec2(e.x,e.y*3.4);float rr=length(dd);float a=atan(dd.y,dd.x);
  float band=smoothstep(rs*1.45,rs*1.7,rr)*smoothstep(rs*5.6,rs*4.2,rr);
  float ring=iso(rr/rs*5.,1.1);
  float ph=a*5.-T*1.6*pow(rs/rr,1.5);float dash=.25+.75*smoothstep(.1,.35,fract(ph))*smoothstep(.95,.6,fract(ph));
  float dop=.5+.5*cos(a+.4);vec3 hot=mix(vec3(1.,.86,.66),C2+.4,.3);float front=e.y<0.?1.:.45;
  float w=0.;if(P0.w>.5){float pd=distance(uv,P0.xy);w=exp(-pow((pd-P0.z*.75)*16.,2.))*(1.-P0.z/1.6);}
  c+=hot*band*ring*dash*(.35+.9*dop)*front*(1.+w*2.);
  c+=hot*.45*iso(r/rs*7.,1.1)*step(1.35*rs,r)*step(r,1.95*rs)*step(0.,e.y);
  c+=hot*((1.-clamp(abs(r-rs*1.3)/max(fwidth(r)*1.3,1e-4),0.,1.))*1.1+exp(-pow((r-rs*1.3)*70.,2.))*.25);
  c*=smoothstep(rs*.98,rs*1.03,r);
  c+=vec3(.15,.35,.9)*L*.4*exp(-distance(uv,vec2(R.x/R.y-.06,.06))*3.);
  gl_FragColor=vec4(c,1.);}`

interface Strand {
  x: number
  y: number
  life: number
  c: number
}

export class Sky {
  private ctx: CanvasRenderingContext2D
  private gl: WebGLRenderingContext | null = null
  private prog: { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> } | null = null
  private trail = document.createElement('canvas')
  private fadeN = 0 // (frames, for the trails' stronger fade now and then)
  private tctx = this.trail.getContext('2d')!
  private stars = document.createElement('canvas')
  private sctx = this.stars.getContext('2d')!
  private W = 0
  private H = 0
  private dpr: number
  private raf = 0
  private flow: Strand[] = []
  private gal: { k: number; r: number; arm: number; j: number; s: number; tw: number }[] = []
  private arms: Path2D[][] = []
  private seeded = false
  private mouse = { x: 0, y: 0, on: 0, tx: 0 }
  private pulses: { x: number; y: number; t0: number }[] = []
  private lastDown = { x: 0, y: 0 }
  private listening = 0
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  private off: (() => void)[] = []
  kind: SkyKind = 'nebula'
  mode: SkyMode = 'study'
  listen = 0

  constructor(
    private c2: HTMLCanvasElement,
    private glc: HTMLCanvasElement,
    private opts: { lowPower: boolean }
  ) {
    this.ctx = c2.getContext('2d')!
    this.dpr = Math.min(devicePixelRatio || 1, opts.lowPower ? 1 : 1.5)
    const move = (e: PointerEvent): void => {
      const r = this.c2.getBoundingClientRect()
      this.mouse.x = e.clientX - r.left
      this.mouse.y = e.clientY - r.top
      this.mouse.on = 1
    }
    const down = (e: PointerEvent): void => {
      const r = this.c2.getBoundingClientRect()
      this.lastDown = { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const leave = (): void => {
      this.mouse.on = 0
    }
    const pulse = (e: Event): void => {
      const d = (e as CustomEvent<{ x?: number; y?: number } | undefined>).detail
      this.pulses.push({ x: d?.x ?? this.lastDown.x, y: d?.y ?? this.lastDown.y, t0: performance.now() })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerdown', down, true)
    document.addEventListener('pointerleave', leave)
    window.addEventListener('studyhall:pulse', pulse)
    this.off.push(() => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerdown', down, true)
      document.removeEventListener('pointerleave', leave)
      window.removeEventListener('studyhall:pulse', pulse)
    })
    this.raf = requestAnimationFrame(this.loop)
  }

  dispose(): void {
    cancelAnimationFrame(this.raf)
    this.off.forEach((f) => f())
  }

  private resize(): boolean {
    const w = this.c2.clientWidth || this.glc.clientWidth, h = this.c2.clientHeight || this.glc.clientHeight
    if (!w || !h) return false
    if (w === this.W && h === this.H) return true
    this.W = w
    this.H = h
    for (const c of [this.c2, this.glc, this.trail, this.stars]) {
      c.width = Math.round(w * this.dpr)
      c.height = Math.round(h * this.dpr)
    }
    for (const x of [this.ctx, this.tctx, this.sctx]) x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    this.gl?.viewport(0, 0, this.glc.width, this.glc.height)
    this.seeded = false
    return true
  }

  private seed(t: number): void {
    const { W, H } = this
    let sd = 41
    const r = (): number => (sd = (sd * 16807) % 2147483647) / 2147483647
    const s = this.sctx
    s.fillStyle = '#02030a'
    s.fillRect(0, 0, W, H)
    const n = Math.round((W * H) / 1600)
    for (let i = 0; i < n; i++) {
      const x = r() * W, y = r() * H, big = r() < 0.04, s0 = big ? 1.1 + r() : 0.25 + r() * 0.7, warm = r() < 0.3
      s.fillStyle = warm ? `rgba(255,224,196,${0.4 + r() * 0.5})` : `rgba(214,228,255,${0.4 + r() * 0.5})`
      s.beginPath()
      s.arc(x, y, s0, 0, 6.283)
      s.fill()
      if (big) {
        s.strokeStyle = 'rgba(230,238,255,.35)'
        s.lineWidth = 0.6
        s.beginPath()
        s.moveTo(x - 7, y)
        s.lineTo(x + 7, y)
        s.moveTo(x, y - 7)
        s.lineTo(x, y + 7)
        s.stroke()
      }
    }
    this.tctx.clearRect(0, 0, W, H)
    const count = this.opts.lowPower ? 900 : 2200
    this.flow = Array.from({ length: count }, () => {
      const p = { x: 0, y: 0, life: 0, c: 0 }
      this.spawn(p, t)
      p.life = Math.random() * 300
      return p
    })
    let gs = 7
    const gr = (): number => (gs = (gs * 16807) % 2147483647) / 2147483647
    this.gal = Array.from({ length: this.opts.lowPower ? 700 : 1300 }, (_, i) => ({ k: i % 5 === 0 ? 1 : 0, r: 0.05 + Math.pow(gr(), 1.3) * 0.95, arm: gr() < 0.5 ? 0 : Math.PI, j: (gr() - 0.5) * 0.6, s: gr() * 1.2 + 0.3, tw: gr() * 6.28 }))
    // each galaxy's arms as bundles of fine hollow strands (built once per size, turned while drawing)
    this.arms = GALS.map((g) => {
      const R = this.galR(g), out: Path2D[] = []
      const n = this.opts.lowPower ? 14 : 24
      for (const arm of [0, Math.PI])
        for (let i = 0; i < n; i++) {
          const o = (i / (n - 1) - 0.5) * 0.6, ph = gr() * 6.28, end = 0.8 + gr() * 0.2, p = new Path2D()
          for (let u = 0.04; u <= end; u += 0.01) {
            const a = arm + o + u * WIND + Math.sin(u * 9 + ph) * 0.04, rr = u * R * (1 + (gr() - 0.5) * 0.012)
            if (u === 0.04) p.moveTo(Math.cos(a) * rr, Math.sin(a) * rr)
            else p.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
          }
          out.push(p)
        }
      for (const f of [0.05, 0.08, 0.11]) {
        const p = new Path2D()
        p.arc(0, 0, f * R, 0, 6.283)
        out.push(p)
      }
      return out
    })
    this.seeded = true
  }

  // ---------- nebula ----------
  private dens(x: number, y: number, t: number): number {
    const nx = x / this.W, ny = y / this.H
    const shape = Math.exp(-(((nx - 0.72) / 0.34) ** 2 + ((ny - 0.38) / 0.3) ** 2)) * 1.2 + Math.exp(-(((nx - 0.4) / 0.2) ** 2 + ((ny - 0.15) / 0.14) ** 2)) * 0.6
    return Math.max(0, shape * (0.35 + fbm2(nx * 3 + t * 0.00004, ny * 3 - t * 0.00003)) - 0.18)
  }
  private spawn(p: Strand, t: number): void {
    for (let k = 0; k < 20; k++) {
      const x = Math.random() * this.W, y = Math.random() * this.H
      if (Math.random() < this.dens(x, y, t) * 1.4) {
        p.x = x
        p.y = y
        p.life = 80 + Math.random() * 220
        p.c = Math.random()
        return
      }
    }
    p.x = this.W * 0.72
    p.y = this.H * 0.38
    p.life = 60
    p.c = Math.random()
  }
  private nebula(t: number): void {
    const { W, H, tctx } = this
    tctx.globalCompositeOperation = 'destination-out'
    tctx.fillStyle = 'rgba(0,0,0,.028)'
    tctx.fillRect(0, 0, W, H)
    // A faint trail never quite went: 2.8 % of a very faint pixel rounds to nothing, so it stayed as a grey line for
    // good. Every third of a second a stronger fade clears what's left (bright trails still fade as smoothly as before).
    if (++this.fadeN % 20 === 0) {
      tctx.fillStyle = 'rgba(0,0,0,.1)'
      tctx.fillRect(0, 0, W, H)
    }
    tctx.globalCompositeOperation = 'lighter'
    const pal = PAL[this.mode].map((c) => c.map((v) => Math.round(Math.min(255, v * 255 + 70))))
    const gold = [255, 214, 160]
    const ts = t * (this.reduced ? 0.2 : 1)
    tctx.lineWidth = 0.7
    for (const p of this.flow) {
      const a = fbm2((p.x / W) * 2.2 + ts * 0.00003, (p.y / H) * 2.2 - ts * 0.00002) * Math.PI * 4
      let vx = Math.cos(a), vy = Math.sin(a)
      if (this.mouse.on) {
        const dx = p.x - this.mouse.x, dy = p.y - this.mouse.y, d2 = dx * dx + dy * dy, k = Math.exp(-d2 / 6000) * 2.2 * this.mouse.tx, l = Math.sqrt(d2 + 1)
        vx += (-dy / l) * k
        vy += (dx / l) * k
      }
      for (const q of this.pulses) {
        const age = (t - q.t0) / 1000, dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy), w = age * 380
        const k = Math.exp(-((d - w) ** 2) / 900) * Math.max(0, 1 - age / 1.6) * 4
        if (d > 1) {
          vx += (dx / d) * k
          vy += (dy / d) * k
        }
      }
      const sp = 0.9 + this.listening * 0.5
      const nx = p.x + vx * sp, ny = p.y + vy * sp
      const de = this.dens(p.x, p.y, ts)
      p.life--
      if (p.life <= 0 || de < 0.02 || nx < 0 || ny < 0 || nx > W || ny > H) {
        this.spawn(p, ts)
        continue
      }
      const c = p.c < 0.5 ? pal[0] : p.c < 0.85 ? pal[1] : gold
      tctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${Math.min(0.85, de * 1.1)})`
      tctx.beginPath()
      tctx.moveTo(p.x, p.y)
      tctx.lineTo(nx, ny)
      tctx.stroke()
      p.x = nx
      p.y = ny
    }
    this.ctx.drawImage(this.stars, 0, 0, W, H)
    this.ctx.drawImage(this.trail, 0, 0, W, H)
  }

  // ---------- galaxy ----------
  private galR(g: (typeof GALS)[number]): number {
    return g.r * Math.hypot(this.W, this.H) * 0.5
  }
  private galaxy(t: number): void {
    const { W, H, ctx } = this
    ctx.drawImage(this.stars, 0, 0, W, H)
    const pal = PAL[this.mode].map((c) => c.map((v) => Math.round(Math.min(255, v * 255 + 70))))
    const ts = t * (this.reduced ? 0.2 : 1)
    const rgba = (c: number[], a: number): string => `rgba(${c[0]},${c[1]},${c[2]},${a})`
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    GALS.forEach((g, gi) => {
      const R = this.galR(g), spin = ts * 0.000018 * g.spin
      // a finished task's wave makes the galaxy breathe out a little
      let swell = 1
      for (const p of this.pulses) swell += Math.max(0, 1 - (t - p.t0) / 1600) * 0.025
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
      ctx.translate(g.x * W, g.y * H)
      ctx.rotate(g.tilt)
      ctx.scale(swell, g.sq * swell)
      ctx.rotate(spin)
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, R)
      grad.addColorStop(0, 'rgba(255,236,214,.5)')
      grad.addColorStop(0.3, rgba(pal[0], 0.34))
      grad.addColorStop(0.7, rgba(pal[1], 0.2))
      grad.addColorStop(1, rgba(pal[1], 0))
      ctx.strokeStyle = grad
      ctx.lineWidth = 0.7
      for (const p of this.arms[gi] ?? []) ctx.stroke(p)
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
      // stars strung along the arms
      for (const s of this.gal) {
        if (s.k !== gi) continue
        const a = s.arm + s.j + s.r * WIND + spin, rr = s.r * R * swell
        const lx = Math.cos(a) * rr, ly = Math.sin(a) * rr * g.sq
        const x = g.x * W + lx * Math.cos(g.tilt) - ly * Math.sin(g.tilt), y = g.y * H + lx * Math.sin(g.tilt) + ly * Math.cos(g.tilt)
        const b = this.mouse.on ? Math.max(0, 1 - Math.hypot(x - this.mouse.x, y - this.mouse.y) / 140) * this.mouse.tx : 0
        const c = s.r < 0.25 ? [255, 236, 214] : pal[s.tw > 4 ? 1 : 0]
        ctx.fillStyle = rgba(c, Math.min(1, (0.5 + 0.3 * Math.sin(t * 0.0015 + s.tw)) * (1 - s.r * 0.5) + b * 0.6))
        ctx.beginPath()
        ctx.arc(x, y, s.s * 0.7 * (1 + b), 0, 6.283)
        ctx.fill()
      }
    })
    ctx.restore()
  }

  // ---------- black hole (WebGL) ----------
  private setupGl(): boolean {
    if (this.prog) return true
    const gl = (this.gl ??= this.glc.getContext('webgl', { antialias: false }))
    if (!gl) return false
    gl.getExtension('OES_standard_derivatives')
    const mk = (type: number, src: string): WebGLShader => {
      const sh = gl.createShader(type)!
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(sh))
      return sh
    }
    const p = gl.createProgram()!
    gl.attachShader(p, mk(gl.VERTEX_SHADER, VS))
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, BLACKHOLE))
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return false
    const b = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, b)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const u: Record<string, WebGLUniformLocation | null> = {}
    for (const k of ['R', 'T', 'M', 'C2', 'L', 'P0']) u[k] = gl.getUniformLocation(p, k)
    this.prog = { p, u }
    gl.viewport(0, 0, this.glc.width, this.glc.height)
    return true
  }
  private blackhole(t: number): void {
    const gl = this.gl!, { p, u } = this.prog!
    gl.useProgram(p)
    const pos = gl.getAttribLocation(p, 'p')
    gl.enableVertexAttribArray(pos)
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)
    gl.uniform2f(u.R, this.glc.width, this.glc.height)
    gl.uniform1f(u.T, (t / 1000) * (this.reduced ? 0.2 : 1))
    gl.uniform3f(u.M, this.mouse.x * this.dpr, (this.H - this.mouse.y) * this.dpr, this.mouse.tx)
    gl.uniform3fv(u.C2, PAL[this.mode][1])
    gl.uniform1f(u.L, this.listening)
    const q = this.pulses[this.pulses.length - 1]
    if (q) gl.uniform4f(u.P0, q.x / this.H, (this.H - q.y) / this.H, (t - q.t0) / 1000, 1)
    else gl.uniform4f(u.P0, 0, 0, 0, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  private overlays(t: number): void {
    const { ctx, W, H } = this
    for (const p of this.pulses) {
      const age = (t - p.t0) / 1600
      ctx.strokeStyle = `rgba(190,210,255,${0.45 * (1 - age)})`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(p.x, p.y, 6 + age * 360, 0, 6.283)
      ctx.stroke()
    }
    if (this.listening > 0.02) {
      const g = ctx.createRadialGradient(W - 40, H - 40, 0, W - 40, H - 40, 380)
      g.addColorStop(0, `rgba(59,130,246,${0.3 * this.listening})`)
      g.addColorStop(1, 'rgba(59,130,246,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
    }
  }

  private loop = (t: number): void => {
    this.raf = requestAnimationFrame(this.loop)
    if (document.hidden || this.kind === 'off') return
    if (!this.resize()) return
    if (!this.seeded) this.seed(t)
    this.listening += (this.listen - this.listening) * 0.05
    this.mouse.tx += ((this.mouse.on ? 1 : 0) - this.mouse.tx) * 0.06
    this.pulses = this.pulses.filter((p) => t - p.t0 < 1600)
    const gl = this.kind === 'blackhole' && this.setupGl()
    this.glc.hidden = !gl
    this.c2.hidden = !!gl
    if (gl) return this.blackhole(t)
    this.ctx.fillStyle = '#02030a'
    this.ctx.fillRect(0, 0, this.W, this.H)
    if (this.kind === 'galaxy') this.galaxy(t)
    else this.nebula(t)
    this.overlays(t)
  }
}

/** Something got done (a task ticked, a session finished): send a wave through the sky. */
export function skyPulse(x?: number, y?: number): void {
  window.dispatchEvent(new CustomEvent('studyhall:pulse', { detail: x == null ? undefined : { x, y } }))
}
