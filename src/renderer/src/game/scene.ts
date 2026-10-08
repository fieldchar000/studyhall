// The Pixel Quest battle scene: a 200×96 pixel canvas, scaled up crisply.
// It replays the shared game rules locally every frame (so HP bars move smoothly);
// the main process stays the source of truth and the page re-syncs every few seconds.

import {
  advance,
  bossHp,
  bossSeconds,
  enemyHp,
  enemyKind,
  ELEMENTS,
  HERO,
  heroDps,
  partyDps,
  RESPAWN_SECONDS,
  tapDamage,
  zoneOf,
  fmtNum,
  MAX_TAPS_PER_SEC,
  type GameData,
  type HeroClass
} from '@shared/game'
import { CROWN, drawSprite, ENEMY_SPRITES, enemyPalette, HERO_SPRITES, heroPalette, ZONE_ART } from './sprites'
import { sfx } from './sound'

export const W = 200
export const H = 96
const GROUND = 72
const ENEMY_X = 132
export const FONT = '"Press Start 2P", ui-monospace, monospace'

const ATTACK_EVERY: Record<HeroClass, number> = { knight: 1.0, archer: 0.85, mage: 1.3, rogue: 0.55, cleric: 1.15 }
const MELEE: Record<HeroClass, boolean> = { knight: true, rogue: true, archer: false, mage: false, cleric: false }

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  color: string
  size: number
  gravity: number
}
interface FloatText {
  x: number
  y: number
  text: string
  color: string
  life: number
}
interface Projectile {
  x: number
  y: number
  tx: number
  ty: number
  t: number
  dur: number
  kind: 'arrow' | 'orb' | 'spark'
  color: string
}

export interface BossFight {
  stage: number
  hp: number
  max: number
  time: number
  total: number
  elapsed: number
  taps: number
  done: boolean
}

export interface SceneEvents {
  onBossEnd(win: boolean, taps: number, elapsed: number): void
  onChange?(): void // stage/kill changes (for the page header)
}

export class Battle {
  private buf = document.createElement('canvas')
  private b = this.buf.getContext('2d')!
  private ctx: CanvasRenderingContext2D
  private raf = 0
  private last = performance.now()
  private time = 0
  private scroll = 0
  private walk = 0 // seconds of "walking" scroll left (stage change)
  private parts: Particle[] = []
  private texts: FloatText[] = []
  private shots: Projectile[] = []
  private attackAt: number[] = [0.2, 0.45, 0.7, 0.95]
  private lunge: number[] = [0, 0, 0, 0]
  private hitFlash = 0
  private shake = 0
  private banner: { text: string; color: string; life: number } | null = null
  private tapTimes: number[] = []
  d: GameData
  pendingTaps = 0
  boss: BossFight | null = null

  constructor(
    private canvas: HTMLCanvasElement,
    data: GameData,
    private ev: SceneEvents
  ) {
    this.buf.width = W
    this.buf.height = H
    this.ctx = canvas.getContext('2d')!
    this.d = structuredClone(data)
    this.raf = requestAnimationFrame(this.frame)
  }

  destroy(): void {
    cancelAnimationFrame(this.raf)
  }

  /** New authoritative state from the main process. */
  setData(data: GameData): void {
    const prevStage = this.d.stage
    this.d = structuredClone(data)
    // Catch up the few ms since the main process computed it.
    advance(this.d, Math.max(0, Math.min(5, (Date.now() - Date.parse(data.lastTick)) / 1000)))
    if (this.d.stage !== prevStage) this.stageChanged(prevStage)
  }

  private stageChanged(prev: number): void {
    const z = zoneOf(this.d.stage)
    if (zoneOf(prev) !== z || this.d.stage < prev) this.showBanner(z.name.toUpperCase(), ELEMENTS[z.el].color)
    else this.showBanner(`STAGE ${((this.d.stage - 1) % 10) + 1}`, '#ffffff')
    this.walk = 0.8
    sfx.stage()
    this.ev.onChange?.()
  }

  showBanner(text: string, color: string): void {
    this.banner = { text, color, life: 1.6 }
  }

  /** Click on the canvas (canvas pixel coordinates). */
  tap(px: number, py: number): void {
    const now = performance.now()
    this.tapTimes = this.tapTimes.filter((t) => now - t < 1000)
    if (this.tapTimes.length >= MAX_TAPS_PER_SEC) return
    this.tapTimes.push(now)
    const x = (px / this.canvas.clientWidth) * W
    const y = (py / this.canvas.clientHeight) * H
    if (this.boss && !this.boss.done) {
      const dmg = tapDamage(this.d, true)
      this.boss.hp -= dmg
      this.boss.taps++
      this.hit(x, y, dmg, '#fde047')
    } else {
      if (this.d.spawn > 0) return
      const dmg = tapDamage(this.d)
      this.pendingTaps++
      const before = { k: this.d.stats.kills, s: this.d.stage }
      advance(this.d, 0, dmg)
      this.afterSim(before)
      this.hit(x, y, dmg, '#fde047')
    }
    sfx.tap()
  }

  startBoss(): void {
    const stage = this.d.stage + 1
    this.boss = { stage, hp: bossHp(stage), max: bossHp(stage), time: bossSeconds(this.d), total: bossSeconds(this.d), elapsed: 0, taps: 0, done: false }
    this.showBanner('BOSS!', '#f87171')
    sfx.bossStart()
  }

  private hit(x: number, y: number, dmg: number, color: string): void {
    this.texts.push({ x: x + (Math.random() * 8 - 4), y: y - 4, text: fmtNum(dmg), color, life: 0.9 })
    for (let i = 0; i < 5; i++) this.spark(x, y, color)
    this.hitFlash = 0.08
    this.shake = 0.12
  }

  private spark(x: number, y: number, color: string, speed = 40): void {
    const a = Math.random() * Math.PI * 2
    this.parts.push({ x, y, vx: Math.cos(a) * speed * Math.random(), vy: Math.sin(a) * speed * Math.random() - 20, life: 0.4, max: 0.4, color, size: 1, gravity: 80 })
  }

  private afterSim(before: { k: number; s: number }): void {
    const kills = this.d.stats.kills - before.k
    if (kills > 0) this.killed(Math.min(kills, 3))
    if (this.d.stage !== before.s) this.stageChanged(before.s)
  }

  private killed(n: number): void {
    const z = zoneOf(this.d.stage)
    const cx = ENEMY_X + 16
    const cy = GROUND - 16
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < 14; i++) this.spark(cx, cy, i % 2 ? ELEMENTS[z.el].color : '#ffffff', 70)
      for (let i = 0; i < 4; i++)
        this.parts.push({ x: cx, y: cy, vx: -60 - Math.random() * 60, vy: -70 - Math.random() * 40, life: 0.9, max: 0.9, color: '#fde047', size: 2, gravity: 120 })
    }
    sfx.kill()
    this.ev.onChange?.()
  }

  private frame = (now: number): void => {
    const dt = Math.min(0.1, (now - this.last) / 1000)
    this.last = now
    this.time += dt
    this.update(dt)
    this.draw()
    this.raf = requestAnimationFrame(this.frame)
  }

  private update(dt: number): void {
    const boss = this.boss
    if (boss && !boss.done) {
      boss.elapsed += dt
      boss.time -= dt
      boss.hp -= partyDps(this.d, zoneOf(boss.stage).el, true) * dt
      if (boss.hp <= 0 || boss.time <= 0) {
        boss.done = true
        const win = boss.hp <= 0
        if (win) {
          for (let i = 0; i < 40; i++) this.spark(ENEMY_X + 24, GROUND - 24, i % 3 ? '#fde047' : '#ffffff', 110)
          sfx.win()
        } else sfx.lose()
        this.showBanner(win ? 'VICTORY!' : 'TIME UP', win ? '#fde047' : '#f87171')
        this.ev.onBossEnd(win, boss.taps, boss.elapsed)
      }
    } else if (!boss) {
      const before = { k: this.d.stats.kills, s: this.d.stage }
      advance(this.d, dt)
      this.afterSim(before)
    }
    if (this.walk > 0) {
      this.walk -= dt
      this.scroll += dt * 60
    }
    // Hero attack animations (visual; the damage itself comes from the rules)
    const fighting = this.boss ? !this.boss.done : this.d.spawn <= 0
    this.d.party.forEach((id, i) => {
      const def = HERO[id]
      if (!def) return
      this.lunge[i] = Math.max(0, this.lunge[i] - dt)
      this.attackAt[i] -= dt
      if (this.attackAt[i] > 0 || !fighting) return
      this.attackAt[i] = ATTACK_EVERY[def.cls] * (0.9 + Math.random() * 0.2)
      const hx = this.heroX(i) + 12
      const hy = this.heroY(i) + 8
      const ex = ENEMY_X + 8 + Math.random() * 16
      const ey = GROUND - (this.boss ? 30 : 18) + Math.random() * 10
      const dmg = heroDps(id, this.d.heroes[id]) * ATTACK_EVERY[def.cls]
      const color = ELEMENTS[def.el].color
      if (MELEE[def.cls]) {
        this.lunge[i] = 0.18
        this.texts.push({ x: ex, y: ey - 6, text: fmtNum(dmg), color: '#ffffff', life: 0.7 })
        this.slash(ex, ey, color)
        this.hitFlash = 0.06
      } else {
        this.shots.push({ x: hx, y: hy, tx: ex, ty: ey, t: 0, dur: 0.25, kind: def.cls === 'archer' ? 'arrow' : def.cls === 'mage' ? 'orb' : 'spark', color })
        setTimeout(() => this.texts.push({ x: ex, y: ey - 6, text: fmtNum(dmg), color: '#ffffff', life: 0.7 }), 250)
      }
    })
    for (const p of this.parts) {
      p.life -= dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += p.gravity * dt
    }
    this.parts = this.parts.filter((p) => p.life > 0).slice(-300)
    for (const t of this.texts) {
      t.life -= dt
      t.y -= dt * 18
    }
    this.texts = this.texts.filter((t) => t.life > 0).slice(-40)
    for (const s of this.shots) s.t += dt
    for (const s of this.shots.filter((s) => s.t >= s.dur)) {
      for (let i = 0; i < 4; i++) this.spark(s.tx, s.ty, s.color)
      this.hitFlash = 0.06
    }
    this.shots = this.shots.filter((s) => s.t < s.dur)
    this.hitFlash = Math.max(0, this.hitFlash - dt)
    this.shake = Math.max(0, this.shake - dt)
    if (this.banner) {
      this.banner.life -= dt
      if (this.banner.life <= 0) this.banner = null
    }
  }

  private slash(x: number, y: number, color: string): void {
    for (let i = 0; i < 6; i++)
      this.parts.push({ x: x - 6 + i * 2, y: y - 6 + i * 2, vx: 0, vy: 0, life: 0.12, max: 0.12, color: i % 2 ? color : '#ffffff', size: 2, gravity: 0 })
  }

  private heroX(i: number): number {
    return 76 - i * 19 + (this.lunge[i] > 0 ? Math.round(Math.sin((this.lunge[i] / 0.18) * Math.PI) * 10) : 0)
  }
  private heroY(i: number): number {
    const bob = Math.sin(this.time * 5 + i * 1.7) > 0.6 ? -1 : 0
    return GROUND - 16 + (i % 2) * 2 + bob
  }

  // ---------- Drawing ----------

  private draw(): void {
    const b = this.b
    const stage = this.boss ? this.boss.stage : this.d.stage
    const zone = zoneOf(stage)
    const art = ZONE_ART[zone.el]
    b.imageSmoothingEnabled = false

    // Sky in three bands with a dithered seam
    const bands = [0, 26, 44, GROUND]
    for (let i = 0; i < 3; i++) {
      b.fillStyle = art.sky[i]
      b.fillRect(0, bands[i], W, bands[i + 1] - bands[i])
      if (i > 0) {
        b.fillStyle = art.sky[i - 1]
        for (let x = 0; x < W; x += 2) b.fillRect(x + ((bands[i] / 2) % 2), bands[i], 1, 1)
      }
    }
    if (art.stars) {
      b.fillStyle = '#e9d5ff'
      for (let i = 0; i < 26; i++) {
        const x = (i * 71 + 13) % W
        const y = (i * 37 + 5) % 40
        if (Math.sin(this.time * 2 + i) > -0.6) b.fillRect(x, y, 1, 1)
      }
      b.fillStyle = '#f5f3ff'
      b.fillRect(160, 10, 6, 6) // moon
      b.fillStyle = art.sky[0]
      b.fillRect(163, 9, 4, 5)
    } else if (zone.el === 'leaf' || zone.el === 'light') {
      b.fillStyle = '#fff7ae'
      b.fillRect(20, 10, 8, 8) // sun
      b.fillStyle = '#ffffff'
      for (const [cx, cy] of [[60, 14], [130, 8], [175, 20]]) {
        const x = Math.round((((cx - this.scroll * 0.1) % (W + 30)) + W + 30) % (W + 30)) - 15
        b.fillRect(x, cy, 14, 3)
        b.fillRect(x + 3, cy - 2, 7, 2)
      }
    }
    // Two layers of hills (parallax)
    this.hills(art.far, 50, 6, 0.05, 0.3)
    this.hills(art.near, 58, 5, 0.09, 0.6)
    this.decorations(art.deco, zone.el)
    // Ground: grass line + checkered dirt
    b.fillStyle = art.grass
    b.fillRect(0, GROUND, W, 2)
    b.fillStyle = art.dirt
    b.fillRect(0, GROUND + 2, W, H - GROUND - 2)
    b.fillStyle = art.dirtDark
    const off = Math.floor(this.scroll) % 16
    for (let y = GROUND + 4; y < H; y += 6)
      for (let x = -16; x < W + 16; x += 16) b.fillRect(x - off + ((y / 6) % 2 ? 8 : 0), y, 7, 2)

    // Heroes (front hero closest to the enemy)
    this.d.party.forEach((id, i) => {
      if (!HERO[id]) return
      const x = this.heroX(i)
      const y = this.heroY(i)
      b.fillStyle = 'rgba(0,0,0,0.25)'
      b.fillRect(x + 3, GROUND + 1 + (i % 2) * 2, 10, 2)
      drawSprite(b, HERO_SPRITES[HERO[id].cls], heroPalette(id), x, y, 1)
      if (HERO[id].rarity === 4 && Math.sin(this.time * 6 + i) > 0.7) {
        b.fillStyle = '#fde047'
        b.fillRect(x + ((this.time * 20 + i * 5) % 16), y + ((this.time * 13) % 14), 1, 1)
      }
    })

    // Enemy or boss
    const shakeX = this.shake > 0 ? Math.round(Math.sin(this.time * 90) * 2) : 0
    const pal = enemyPalette(zone.el)
    if (this.boss) {
      const sprite = ENEMY_SPRITES[zone.bossKind]
      const bob = Math.round(Math.sin(this.time * 3) * 1.5)
      if (!(this.boss.done && this.boss.hp <= 0)) {
        b.fillStyle = 'rgba(0,0,0,0.3)'
        b.fillRect(ENEMY_X - 2, GROUND, 52, 3)
        drawSprite(b, sprite, pal, ENEMY_X - 8 + shakeX, GROUND - 46 + bob, 3, { flip: true, flash: this.hitFlash > 0.03 })
        drawSprite(b, CROWN, { y: '#fde047', r: '#ef4444' }, ENEMY_X + 15 + shakeX, GROUND - 50 + bob, 2)
      }
      this.bar(ENEMY_X - 16, 6, 76, Math.max(0, this.boss.hp / this.boss.max), '#ef4444')
      this.bar(ENEMY_X - 16, 12, 76, Math.max(0, this.boss.time / this.boss.total), '#fde047', 2)
      this.text(zone.boss.toUpperCase(), ENEMY_X - 16, 22, '#fca5a5', 6)
    } else {
      const kind = enemyKind(this.d.stage, this.d.kills)
      const walkIn = this.d.spawn > 0 ? (this.d.spawn / RESPAWN_SECONDS) * 70 : 0
      const flying = kind === 'bat' || kind === 'wisp' || kind === 'ghost'
      const hover = flying ? Math.round(Math.sin(this.time * 4) * 2) - 8 : 0
      b.fillStyle = 'rgba(0,0,0,0.25)'
      b.fillRect(ENEMY_X + 6 + walkIn, GROUND + 1, 20, 2)
      drawSprite(b, ENEMY_SPRITES[kind], pal, ENEMY_X + walkIn + shakeX, GROUND - 31 + hover, 2, { flip: true, flash: this.hitFlash > 0.03 })
      this.bar(ENEMY_X - 4, 6, 60, this.d.spawn > 0 ? 1 : Math.max(0, this.d.enemyHp / enemyHp(this.d.stage)), '#ef4444')
    }

    // Projectiles
    for (const s of this.shots) {
      const k = s.t / s.dur
      const x = Math.round(s.x + (s.tx - s.x) * k)
      const y = Math.round(s.y + (s.ty - s.y) * k - Math.sin(k * Math.PI) * (s.kind === 'arrow' ? 6 : 3))
      if (s.kind === 'arrow') {
        b.fillStyle = '#8b5a2b'
        b.fillRect(x - 4, y, 4, 1)
        b.fillStyle = '#e5e7eb'
        b.fillRect(x, y, 2, 1)
      } else if (s.kind === 'orb') {
        b.fillStyle = s.color
        b.fillRect(x - 1, y - 1, 3, 3)
        b.fillStyle = '#ffffff'
        b.fillRect(x, y, 1, 1)
      } else {
        b.fillStyle = s.color
        b.fillRect(x - 1, y, 3, 1)
        b.fillRect(x, y - 1, 1, 3)
      }
    }
    for (const p of this.parts) {
      b.globalAlpha = Math.max(0, Math.min(1, (p.life / p.max) * 1.5))
      b.fillStyle = p.color
      b.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size)
    }
    b.globalAlpha = 1
    for (const t of this.texts) this.text(t.text, Math.round(t.x), Math.round(t.y), t.color, 6, Math.min(1, t.life * 2))
    if (this.banner) {
      const a = Math.min(1, this.banner.life * 2)
      b.font = `8px ${FONT}`
      const w = b.measureText(this.banner.text).width
      b.fillStyle = `rgba(0,0,0,${0.45 * a})`
      b.fillRect(0, 30, W, 16)
      this.text(this.banner.text, Math.round((W - w) / 2), 42, this.banner.color, 8, a)
    }

    // Scale up to the visible canvas, keeping hard pixel edges
    const cw = this.canvas.clientWidth
    const ch = this.canvas.clientHeight
    const dpr = window.devicePixelRatio || 1
    if (this.canvas.width !== Math.round(cw * dpr)) {
      this.canvas.width = Math.round(cw * dpr)
      this.canvas.height = Math.round(ch * dpr)
    }
    this.ctx.imageSmoothingEnabled = false
    this.ctx.drawImage(this.buf, 0, 0, this.canvas.width, this.canvas.height)
  }

  private hills(color: string, base: number, amp: number, freq: number, parallax: number): void {
    const b = this.b
    b.fillStyle = color
    const s = this.scroll * parallax
    for (let x = 0; x < W; x++) {
      const h = Math.round(base + Math.sin((x + s) * freq) * amp + Math.sin((x + s) * freq * 2.7) * (amp / 2))
      b.fillRect(x, h, 1, GROUND - h)
    }
  }

  private decorations(kind: string, el: string): void {
    const b = this.b
    for (let i = 0; i < 5; i++) {
      const x = Math.round((((i * 47 + 10 - this.scroll * 0.8) % (W + 40)) + W + 40) % (W + 40)) - 20
      if (x > 100 && x < 180) continue // keep the enemy area clear
      if (kind === 'tree') {
        b.fillStyle = '#6b4423'
        b.fillRect(x + 4, GROUND - 8, 3, 8)
        b.fillStyle = '#2f7a4a'
        b.fillRect(x, GROUND - 18, 11, 10)
        b.fillStyle = '#3f9a5c'
        b.fillRect(x + 2, GROUND - 20, 7, 4)
        b.fillRect(x + 1, GROUND - 17, 4, 3)
      } else if (kind === 'crystal') {
        b.fillStyle = '#a5b4fc'
        b.fillRect(x + 3, GROUND - 14, 4, 14)
        b.fillStyle = '#e0e7ff'
        b.fillRect(x + 4, GROUND - 16, 2, 4)
        b.fillStyle = '#c7d2fe'
        b.fillRect(x, GROUND - 7, 3, 7)
      } else if (kind === 'rock') {
        b.fillStyle = '#57534e'
        b.fillRect(x, GROUND - 6, 10, 6)
        b.fillStyle = '#78716c'
        b.fillRect(x + 2, GROUND - 8, 5, 3)
        if (Math.sin(this.time * 8 + i) > 0) {
          b.fillStyle = '#fb923c'
          b.fillRect(x + 4, GROUND - 11 - ((this.time * 10 + i * 3) % 6), 1, 1)
        }
      } else if (kind === 'torch') {
        b.fillStyle = '#44403c'
        b.fillRect(x + 4, GROUND - 12, 2, 12)
        b.fillStyle = Math.sin(this.time * 12 + i) > 0 ? '#c084fc' : '#a855f7'
        b.fillRect(x + 3, GROUND - 16, 4, 4)
        b.fillStyle = '#f5f3ff'
        b.fillRect(x + 4, GROUND - 15, 2, 2)
      } else if (kind === 'stalactite') {
        b.fillStyle = '#0f2a4a'
        b.fillRect(x + 2, 0, 6, 8)
        b.fillRect(x + 3, 8, 4, 5)
        b.fillRect(x + 4, 13, 2, 4)
        if (el === 'water' && (this.time * 0.7 + i) % 2 < 0.05) this.spark(x + 5, 18, '#7dd3fc', 5)
      }
    }
  }

  private bar(x: number, y: number, w: number, frac: number, color: string, h = 4): void {
    const b = this.b
    b.fillStyle = '#1b1424'
    b.fillRect(x - 1, y - 1, w + 2, h + 2)
    b.fillStyle = '#3f3f46'
    b.fillRect(x, y, w, h)
    b.fillStyle = color
    b.fillRect(x, y, Math.round(w * Math.min(1, frac)), h)
    b.fillStyle = 'rgba(255,255,255,0.35)'
    b.fillRect(x, y, Math.round(w * Math.min(1, frac)), 1)
  }

  private text(s: string, x: number, y: number, color: string, size = 6, alpha = 1): void {
    const b = this.b
    b.globalAlpha = alpha
    b.font = `${size}px ${FONT}`
    b.fillStyle = '#1b1424'
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) b.fillText(s, x + dx, y + dy)
    b.fillStyle = color
    b.fillText(s, x, y)
    b.globalAlpha = 1
  }
}
