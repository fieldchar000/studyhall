// Nova's floating JARVIS globe. The drawing, the LED pixel dither and the movement are Roamies' own code
// (./roamies, copied unchanged, AGPL-3.0, by Ken Kai); this file is Studyhall's part: Nova's colours, and a small
// "plugin" in the shape Roamies' agent layer uses, which tells the globe what Nova is doing (listening, thinking,
// talking), where to go (beside your cursor when you talk, over to something it points at, home again) and when to
// float around your screen.
//
// The window is one see-through layer over the whole screen. It lets every click through except on the globe itself
// (and its little menu), the way Roamies does: each mouse move asks the globe "is this you?" and the answer decides.


/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any

export type NovaState = 'idle' | 'listening' | 'thinking' | 'done' | 'error'
export type NovaSize = 'default' | 'small' | 'cursor'
export type Emote = 'wave' | 'hype' | 'remind' | 'upset' | 'motivate'

/** Your dark blue with light-blue highlights, darkest (the LED gaps) to brightest (the lit heart). */
const PAL = [
  [3, 8, 24],
  [12, 34, 92],
  [38, 92, 212],
  [122, 170, 255],
  [228, 238, 255]
]

export type NovaGlobe = {
  /** cursor: where your mouse is (CSS px in this window), when you start talking */
  setState(s: NovaState, cursor?: { x: number; y: number }): void
  setConfig(c: { size: NovaSize; roam: boolean; home: { x: number; y: number } | null; sounds?: boolean; hideIdle?: boolean }): void
  /** Disappear (Roamies' materialize / CRT / drop, in turn); show it again with setConfig or by talking to it. */
  hide(): void
  voice(env: number[]): void
  mic(v: number): void
  /** Fly over to a point (CSS px in this window); null: back to what it was doing. */
  goTo(p: { x: number; y: number } | null): void
  /** A drawing (Roamies' ink): play a segment, or clear. */
  ink(op: { play?: unknown; clear?: Record<string, unknown>; reminders?: Record<string, unknown>; stale?: boolean; click?: { x: number; y: number }; agents?: unknown; pen?: unknown; panel?: { op: 'open' | 'status' | 'append' | 'end' | 'fail' | 'close'; text?: string } }): void
  /** Where the mouse is (CSS px in this window), from Studyhall's own watch: the same as a mouse move. */
  cursor(x: number, y: number): void
  /** Where this layer is on the screen (DIP), so screen places land in the right spot. */
  setOrigin(x: number, y: number): void
  /** Messages from the drawing (a card closed, a quiz answered…). */
  onInk(cb: (msg: Record<string, unknown>) => void): void
  emote(e: Emote): void
  /** The globe's centre and radius (CSS px), for placing a bubble or menu beside it. */
  where(): { x: number; y: number; r: number }
}

let booting: Promise<NovaGlobe> | null = null

/** Starts the globe once (later calls get the same one). */
export function startGlobe(opts: Parameters<typeof boot>[0]): Promise<NovaGlobe> {
  booting ??= boot(opts)
  return booting
}

async function boot(opts: {
  canvas: HTMLCanvasElement
  onClick: () => void
  onMenu: (x: number, y: number) => void
  onHot: (hot: boolean) => void
  /** Dropped somewhere new while it stays put: that's its home now (CSS px in this window). */
  onHome: (x: number, y: number) => void
  /** Is the point over something else of Nova's on this layer (the menu, a bubble)? */
  extraHit: (x: number, y: number) => boolean
  home: { x: number; y: number } | null
}): Promise<NovaGlobe> {
  const W = window as Any
  // Roamies' scripts set up window.Roamie as they load, in this order.
  // Roamies' little chiptune sounds (on the Nova page you can switch them off); they may play without a click first.
  W.ROAMIE_AUTOSOUND = true
  await import('./roamies/core.js')
  await import('./roamies/jarvis.js')
  const R = W.Roamie

  // ---- What Nova is doing ----
  let state: NovaState = 'idle'
  let cfg: { size: NovaSize; roam: boolean; hideIdle: boolean } = { size: 'default', roam: true, hideIdle: false }
  const voice = { env: [] as number[], at: 0 }
  const micv = { v: 0, at: 0 }
  const talking = (): boolean => {
    const i = Math.floor((performance.now() - voice.at) / 40)
    return i >= 0 && i < voice.env.length
  }
  // Roamies' globe reads the voice's loudness from Roamie.voiceOut while it plays.
  R.voiceOut = {
    playing: talking,
    level: () => {
      const i = Math.floor((performance.now() - voice.at) / 40)
      return i >= 0 && i < voice.env.length ? voice.env[i] : 0
    }
  }

  let kit: Any = null
  let m: Any = null
  let home: { x: number; y: number } | null = opts.home // where it rests when it isn't floating around
  let target: { x: number; y: number } | null = null // pointing at something
  let byCursor = false // came over beside your cursor for a request
  let rush = false
  let flee = 0
  let quietUntil = 0
  let now = 0
  let idleSince = 0
  let mouse = { x: -1e4, y: -1e4, active: false }
  let wasHeld = false
  let heldFrom: [number, number] | null = null
  let restUntil = 0 // dropped by you: it stays right there until then (no wandering, no hopping aside)
  let lastD = 1e9 // how far the mouse was last frame (coming closer = reaching for it)

  const engaged = (): boolean => state === 'listening' || state === 'thinking' || talking()
  const anchorAt = (x: number, y: number, r = 0.35): void => {
    if (!m || !kit) return
    m.anchor = { x, y, r: kit.R * r }
  }
  const go = (x: number, y: number, fast: boolean): void => {
    if (!m || !kit) return
    const pad = kit.R * 1.4
    x = Math.min(Math.max(x, pad), innerWidth - pad)
    y = Math.min(Math.max(y, pad), innerHeight - pad)
    anchorAt(x, y)
    m.goTo(x, y)
    rush = fast
  }
  /** Just right of the cursor (left if there's no room), a little above it. */
  const besideCursor = (): [number, number] => {
    const off = kit.R * 2.3
    const right = mouse.x + off < innerWidth - kit.R * 1.4
    return [mouse.x + (right ? off : -off), mouse.y - kit.R * 0.4]
  }
  /** A free spot away from the cursor (when you come near it while it's in the way). */
  const awayFrom = (cx: number, cy: number): [number, number] => {
    let best: [number, number] = [m.x, m.y]
    let bestScore = -1
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2
      const d = kit.R * (3 + Math.random() * 3)
      const x = m.x + Math.cos(a) * d
      const y = m.y + Math.sin(a) * d
      if (x < kit.R * 1.5 || y < kit.R * 1.5 || x > innerWidth - kit.R * 1.5 || y > innerHeight - kit.R * 1.5) continue
      const s = Math.hypot(x - cx, y - cy)
      if (s > bestScore) {
        bestScore = s
        best = [x, y]
      }
    }
    return best
  }
  const settle = (): void => {
    // Back to what it does on its own: floating around the screen, or resting at its spot.
    byCursor = false
    target = null
    rush = false
    if (!m) return
    if (now < restUntil && home) anchorAt(home.x, home.y, 0.12) // you put it here a moment ago: it stays
    else if (cfg.roam) m.anchor = null
    else if (home) go(home.x, home.y, false)
    else m.anchor = { x: m.x, y: m.y, r: kit.R * 0.35 }
  }

  // ---- Appearing and disappearing (Roamies' entrances, in turn) ----
  const ORDER = ['materialize', 'crt', 'drop']
  let entranceN = 0
  let lastActive = 0
  const nextVariant = (): string => ORDER[entranceN++ % ORDER.length]
  const shownNow = (): boolean => !!kit && (kit.presence === 'shown' || kit.presence === 'in')
  /** Back on screen (beside your cursor when you're talking to it, else where it lives). */
  const showUp = (): void => {
    lastActive = now
    if (!kit || shownNow()) return
    let v = nextVariant()
    const near = mouse.active && (state === 'listening' || state === 'thinking')
    if (v === 'drop' && near) v = nextVariant() // beside the cursor it pops up in place, never drops in
    const [x, y] = near ? besideCursor() : home ? [home.x, home.y] : [m.x, m.y]
    kit.appear(v, x, y)
  }

  const plugin = (k: Any): Any => {
    kit = k
    m = k.m
    return {
      // Nova decides when to perform (an emote), so the globe never plays its moments at random.
      busy: () => true,
      calm: () => false,
      pose: () => {
        if (state === 'listening') {
          const lv = performance.now() - micv.at < 400 ? micv.v : 0.25
          return { mode: 'listen', heard: Math.min(1, 0.2 + lv * 1.6) }
        }
        if (talking()) return { mode: 'talk' }
        if (state === 'thinking') return { mode: 'think' }
        return null
      },
      update: (dt: number, env: Any) => {
        now += dt
        if (env.mouse?.active) mouse = { x: env.mouse.x, y: env.mouse.y, active: true }
        else mouse.active = false
        // Hide when idle (a setting, off unless you turn it on): gone a few seconds after it's done, back when needed.
        if (cfg.hideIdle) {
          const hover = mouse.active && Math.hypot(mouse.x - m.x, mouse.y - m.y) < k.R * 1.5
          if (engaged() || state !== 'idle' || target || m.dragging || m.flung || hover) lastActive = now
          if (k.presence === 'shown' && now - lastActive > 6) k.vanish(nextVariant())
        }
        if (k.presence !== 'shown') return
        const held = m.dragging || m.flung
        // Size "follows my cursor": it rides beside the mouse (and lets every click through).
        if (cfg.size === 'cursor') {
          if (!held && mouse.active) {
            m.drive = (d: number) => {
              const tx = target ? target.x : mouse.x + 30
              const ty = target ? target.y : mouse.y + 30
              const ox = m.x
              const oy = m.y
              const f = 1 - Math.exp(-(target ? 6 : 22) * d)
              m.x += (tx - m.x) * f
              m.y += (ty - m.y) * f
              m.vx = (m.x - ox) / Math.max(d, 1e-3)
              m.vy = (m.y - oy) / Math.max(d, 1e-3)
            }
          }
          return
        }
        m.drive = null
        // Dropped somewhere new: that's home now.
        if (held && !wasHeld) heldFrom = [m.x, m.y]
        if (wasHeld && !held && heldFrom && Math.hypot(m.x - heldFrom[0], m.y - heldFrom[1]) > k.R * 0.5) {
          home = { x: m.x, y: m.y }
          opts.onHome(m.x, m.y)
          // You put it here: it stays put (even when it normally floats around) for a few minutes.
          restUntil = now + 180
          quietUntil = now + 180
          anchorAt(m.x, m.y, 0.12)
        }
        wasHeld = held
        if (held) return
        if (target) {
          anchorAt(target.x, target.y, 0.08)
        } else if (byCursor && !engaged()) {
          // The request's done: stay a few seconds (so you can read it), then off again.
          if (now - idleSince > 6) settle()
        } else if (!byCursor && mouse.active && now > quietUntil) {
          // Your mouse has stayed close for a while (working right next to it), but isn't reaching for it: it hops aside.
          // Coming closer counts as reaching for it (to grab or click it), so it never runs from your hand.
          const d = Math.hypot(mouse.x - m.x, mouse.y - m.y)
          const near = d < k.R * 2.6
          const onIt = d < m.radius * 1.4
          const reaching = d < lastD - 0.3
          flee = near && !onIt && !reaching ? flee + dt : near ? 0 : Math.max(0, flee - dt * 2)
          if (flee > 2.5) {
            const [x, y] = awayFrom(mouse.x, mouse.y)
            k.sq.kick(4)
            if (cfg.roam) {
              m.goTo(x, y)
            } else {
              home = { x, y }
              go(x, y, false)
              opts.onHome(x, y)
            }
            flee = 0
          }
        }
        lastD = mouse.active ? Math.hypot(mouse.x - m.x, mouse.y - m.y) : 1e9
        // A few minutes after you put it down, it's free to float around again.
        if (restUntil && now > restUntil && !byCursor && !target) {
          restUntil = 0
          settle()
        }
        if (engaged()) idleSince = now
        // Called over: get there in well under a second, even from across the screen. Floating around: slowly.
        m.speedMul = rush ? 7 : target ? 3 : byCursor ? 1.6 : cfg.roam ? 0.55 : 1
        if (rush && Math.hypot(m.x - m.tx, m.y - m.ty) < k.R * 0.4) rush = false
      }
    }
  }

  await import('./roamies/sfx.js')
  await import('./roamies/10-dither.js')
  R.register(
    R.ditherKit({ id: 'nova', label: 'Nova', matrix: true, pixel: 1.3, glow: 0.55, speed: 80, pal: PAL, plugin })
  )
  // Its size comes from this "unit" (Roamies' default). Only Nova on this layer (10-dither.js also registers its
  // own green demo blob).
  W.ROAMIE_UNIT = 340
  W.ROAMIE_ONLY = ['nova']
  R.panelHit = (x: number, y: number) => opts.extraHit(x, y)
  R.bootDesktop(opts.canvas)
  const tile = R.tiles[0]
  const c = tile.creature
  c.setLook('jarvis') // the globe of LED points with a lit heart
  // Roamies' drawings (maps, flowcharts, moving models, bars, tables, maths, rings and labels on your screen): its own
  // canvas on this layer, driven by drawings from Nova's draw tool (R.ink.play), clicks on its cards through R.inkHit.
  await import('./roamies/world.js')
  await import('./roamies/ink3d.js')
  await import('./roamies/ink.js')
  // Roamies' agents corner (top right): a row per background agent, Allow / Don't allow, and what each one made.
  await import('./roamies/glass.js')
  await import('./roamies/minis.js')
  await import('./roamies/agent-home.js')
  // Roamies' Windows pen: the trail of your cursor while you hold the talk keys (Studyhall follows the cursor).
  await import('./roamies/pen.js')
  // Roamies' research card: an answer that turns into points or cites sources streams onto it, links and all.
  await import('./roamies/markdown.js')
  await import('./roamies/agent-panel.js')
  const cardHit = R.panelHit
  R.panelHit = (x: number, y: number) => opts.extraHit(x, y) || !!cardHit?.(x, y)
  // ink.js shows each spoken line as a caption at the bottom of the screen; Nova's bubble above the globe already
  // shows those words as they're said, so the caption stays hidden (it still paces the drawing).
  for (const el of Array.from(document.body.children))
    if (el instanceof HTMLDivElement && el.style.transform === 'translateX(-50%)' && el.style.pointerEvents === 'none') el.style.display = 'none'
  if (home) {
    c.mover.x = home.x
    c.mover.y = home.y
  }
  settle()
  // It arrives the way Roamies do (materialize first, then CRT, then dropping in, in turn).
  c.vanish(null, true)
  showUp()

  // A plain click on the globe talks to Nova (Roamies' "boop" is a click without a drag).
  const boop = c.boop.bind(c)
  c.boop = (x: number, y: number) => {
    boop(x, y)
    opts.onClick()
  }

  // Hot zones: ask the globe on every mouse move whether the cursor is on it (or on its menu or bubble).
  let hot = false
  const setHot = (h: boolean): void => {
    if (h === hot) return
    hot = h
    opts.onHot(h)
  }
  const onMove = (e: MouseEvent): void => {
    setHot(!!R.ptr(e.clientX, e.clientY))
    R.ink?.ptr(e.clientX, e.clientY) // (a drawn step waiting for you to hover over something)
  }
  addEventListener('mousemove', onMove, { passive: true })
  document.addEventListener('mouseleave', () => setHot(false))
  addEventListener('blur', () => setHot(false))
  addEventListener('contextmenu', (e) => {
    e.preventDefault()
    const mv = c.mover
    if (Math.hypot(e.clientX - mv.x, e.clientY - mv.y) < mv.radius * 1.2) opts.onMenu(e.clientX, e.clientY)
  })

  const globe: NovaGlobe = {
    setState(s, cursor) {
      const was = state
      state = s
      if (cursor) {
        R.ptr(cursor.x, cursor.y)
        mouse = { x: cursor.x, y: cursor.y, active: true }
      }
      if (s === 'listening' && was !== 'listening' && cfg.size !== 'cursor' && (mouse.active || cursor) && kit) {
        // You're talking to it: it comes over beside your cursor (unless it's already there).
        const [x, y] = besideCursor()
        if (!byCursor || Math.hypot(m.x - x, m.y - y) > kit.R * 2.5) go(x, y, true)
        byCursor = true
        quietUntil = now + 4
      }
      if (s === 'listening' || s === 'thinking') {
        idleSince = now
        showUp()
      }
      R.wake?.()
    },
    setConfig(n) {
      const sizeChanged = n.size !== cfg.size
      cfg = { size: n.size, roam: n.roam, hideIdle: n.hideIdle === true }
      if (R.sfx && n.sounds !== undefined) R.sfx.enabled = n.sounds
      // Shown again (its window came back): it reappears, unless it's set to stay hidden until needed.
      if (!cfg.hideIdle) showUp()
      if (n.home) home = n.home
      if (sizeChanged) {
        c.setForm(n.size)
        if (n.size !== 'cursor') c.mover.drive = null
      }
      if (n.size !== 'cursor' && !byCursor && !target) settle()
      R.wake?.()
    },
    voice(env) {
      voice.env = env
      voice.at = performance.now()
      if (env.length) {
        idleSince = now
        showUp()
      }
      R.wake?.()
    },
    mic(v) {
      micv.v = v
      micv.at = performance.now()
    },
    goTo(p) {
      if (p) {
        target = p
        if (cfg.size !== 'cursor') go(p.x, p.y, true)
      } else if (target) {
        target = null
        if (byCursor) idleSince = now
        else settle()
      }
      R.wake?.()
    },
    emote(e) {
      showUp()
      kit?.startAct?.(e)
    },
    ink(op) {
      if (op.play) {
        showUp()
        R.ink?.play(op.play)
      }
      else if (op.clear) R.ink?.clear(op.clear)
      else if (op.reminders) R.ink?.reminders(op.reminders)
      else if (op.stale) R.ink?.stale()
      else if (op.click) R.ink?.click(op.click.x, op.click.y)
      else if (op.pen) R.pen?.(op.pen)
      else if (op.panel && R.panel) {
        const p = op.panel
        if (p.op === 'open') {
          showUp()
          R.panel.open({ status: p.text ?? 'Writing it up', near: { cursor: [mouse.x > -1e3 ? mouse.x : c.mover.x, mouse.y > -1e3 ? mouse.y : c.mover.y], buddy: { x: c.mover.x, y: c.mover.y, r: kit?.R ?? 40 } } })
        } else if (p.op === 'status') R.panel.status(p.text ?? '')
        else if (p.op === 'append') R.panel.append(p.text ?? '')
        else if (p.op === 'end') R.panel.end(p.text)
        else if (p.op === 'fail') R.panel.fail(p.text ?? '')
        else if (p.op === 'close') R.panel.close()
      } else if (op.agents && (op.agents as { type?: string }).type === 'hatch') R.agentHome?.hatch([c.mover.x, c.mover.y])
      else if (op.agents) R.agentHome?.event(op.agents, { from: [c.mover.x, c.mover.y] })
      R.wake?.()
    },
    cursor(x, y) {
      const h = !!R.ptr(x, y)
      // Over the globe: said again on every move, so the layer can never stay stuck letting clicks through.
      if (h && h === hot) opts.onHot(true)
      else setHot(h)
      R.ink?.ptr(x, y)
    },
    setOrigin(x, y) {
      R.origin = { x, y } // (the pen's points are screen points)
      R.setSafe?.({ ...(R.safe ?? {}), ox: x, oy: y })
    },
    onInk(cb) {
      if (!R.ink) return
      R.ink.send = cb
      // ink.js asks its host for things too (e.g. "report clicks while a walkthrough waits"): passed on the same way.
      R.ink.invoke = (cmd: string, args: unknown) => cb({ type: 'invoke', cmd, args })
      // The agents corner's buttons (Stop, Allow, open a file…) go the same way; it asks for the agents on screen now.
      // A link clicked on the research card opens in your browser (web links only; checked again in Studyhall).
      if (R.panel) {
        R.panel.onLink = (url: string) => cb({ type: 'open_link', url })
        R.panel.onCopy = (text: string) => cb({ type: 'copy_text', text })
      }
      if (R.agentHome) {
        R.agentHome.send = cb
        cb({ type: 'agents_ready' })
      }
    },
    hide() {
      if (shownNow()) kit.vanish(nextVariant())
    },
    where() {
      return { x: c.mover.x, y: c.mover.y, r: kit?.R ?? 40 }
    }
  }
  return globe
}
