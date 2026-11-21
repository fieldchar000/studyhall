// Nova's floating JARVIS globe, as Roamies' sidekick: the drawing, the LED pixel dither, the movement AND the character
// layer (agent.js: its speech, listening and thinking bubbles, the task tag with a little performance for each tool,
// the step trail, and the pen it turns into to draw and point while it explains) are Roamies' own code (./roamies,
// AGPL-3.0, by Ken Kai). This file is Studyhall's part: Nova's colours, and the host (Roamies' host.js, ported) that
// turns what Nova is doing into what the character does.
//
// The window is one see-through layer over the whole screen. It lets every click through except on the globe itself
// (its bubbles, cards and little menu), the way Roamies does: each mouse move asks "is this you?" and the answer decides.

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

type InkOp = {
  play?: unknown
  clear?: Record<string, unknown>
  /** pictures of the cards on screen, asked for under this id (saving an explanation as a note) */
  snapshot?: string
  marksAsk?: string
  boardPic?: { part: string; page: number; src: string }
  reminders?: Record<string, unknown>
  stale?: boolean
  click?: { x: number; y: number }
  agents?: unknown
  pen?: unknown
  agent?: Record<string, unknown>
  panel?: { op: 'open' | 'status' | 'append' | 'end' | 'fail' | 'close'; text?: string }
}

export type NovaGlobe = {
  /** cursor: where your mouse is (CSS px in this window), when you start talking */
  setState(s: NovaState, cursor?: { x: number; y: number }, text?: string): void
  setConfig(c: { size: NovaSize; roam: boolean; home: { x: number; y: number } | null; sounds?: boolean; hideIdle?: boolean }): void
  /** Disappear (Roamies' materialize / CRT / drop, in turn); it comes back when it has something to do. */
  hide(): void
  voice(env: number[]): void
  mic(v: number): void
  /** Words for a bubble: yours while you talk (empty: listening), Nova's as they're said. */
  bubble(b: { who: 'you' | 'nova'; text: string; append?: boolean; done?: boolean }): void
  /** Fly over to a point (CSS px in this window); null: back to what it was doing. */
  goTo(p: { x: number; y: number } | null): void
  /** A drawing (Roamies' ink), the research card, the agents corner, the pen, the character's acts. */
  ink(op: InkOp): void
  /** Where the mouse is (CSS px in this window), from Studyhall's own watch: the same as a mouse move. */
  cursor(x: number, y: number): void
  /** The left button went down here (heard by the key helper): pressed for real when Windows didn't hand the press over. */
  press(x: number, y: number): void
  /** Where this layer is on the screen (DIP), so screen places land in the right spot. */
  setOrigin(x: number, y: number): void
  /** Messages from the drawing (a card closed, a quiz answered…). */
  onInk(cb: (msg: Record<string, unknown>) => void): void
  emote(e: Emote): void
  /** The globe's centre and radius (CSS px), for placing a menu beside it. */
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
  /** A line for the mouse recorder (nova-mouse.log). */
  trace?: (line: string) => void
  /** Dropped somewhere new: that's its home now (CSS px in this window). */
  onHome: (x: number, y: number) => void
  /** Is the point over something else of Nova's on this layer (the menu)? */
  extraHit: (x: number, y: number) => boolean
  home: { x: number; y: number } | null
}): Promise<NovaGlobe> {
  const W = window as Any
  // Roamies' little chiptune sounds (on the Nova page you can switch them off); they may play without a click first.
  W.ROAMIE_AUTOSOUND = true
  // Roamies' scripts set up window.Roamie as they load, in this order.
  await import('./roamies/core.js')
  await import('./roamies/jarvis.js')
  const R = W.Roamie

  // Roamies' character reads the voice's loudness from Roamie.voiceOut while it plays (its mouth moves with it).
  const voice = { env: [] as number[], at: 0 }
  const talking = (): boolean => {
    const i = Math.floor((performance.now() - voice.at) / 40)
    return i >= 0 && i < voice.env.length
  }
  R.voiceOut = {
    playing: talking,
    level: () => {
      const i = Math.floor((performance.now() - voice.at) / 40)
      return i >= 0 && i < voice.env.length ? voice.env[i] : 0
    }
  }

  await import('./roamies/sfx.js')
  await import('./roamies/glass.js')
  await import('./roamies/markdown.js')
  await import('./roamies/agent-tools.js')
  await import('./roamies/agent.js')
  await import('./roamies/agent-cards.js')
  await import('./roamies/10-dither.js')

  // The character layer (agent.js) is the globe's plugin, as in Roamies (12-sidekick.js). Dropping it somewhere new
  // makes that its home (kept by Studyhall between runs).
  let kit: Any = null
  let agent: Any = null
  let hat = false // tutor mode
  let live = false // conversation mode
  let freshAnswer = false // a new request: its first drawing clears the last answer's cards
  let deeper = false // a deeper chat (Sonnet)
  const c0 = (): Any => R.tiles?.[0]?.creature
  /** The cap: a flat board (dark blue with a light-blue edge), its band, and a gold tassel, in pixels like the globe. */
  function drawHat(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    const P = Math.max(2, Math.round(r / 9))
    const top = y - r * 1.02
    const px = (gx: number, gy: number, w: number, h: number, colour: string): void => {
      ctx.fillStyle = colour
      ctx.fillRect(Math.round(x + gx * P), Math.round(top + gy * P), w * P, h * P)
    }
    ctx.save()
    // the band (sits on the globe)
    px(-5, 2, 10, 3, '#0b1a3d')
    px(-5, 2, 10, 1, '#4f86f0')
    // the board: a flattened diamond
    const rows = [3, 9, 15, 21, 15, 9, 3]
    rows.forEach((w, i) => {
      const half = Math.floor(w / 2)
      px(-half, -4 + i * 0.5, w, 1, i === 0 || i === rows.length - 1 ? '#7aaaff' : '#13285c')
      px(-half, -4 + i * 0.5, 1, 1, '#7aaaff')
      px(half, -4 + i * 0.5, 1, 1, '#7aaaff')
    })
    px(0, -2.5, 1, 1, '#f2c14e') // the button
    // the tassel: along the board to its edge, then down
    for (let i = 1; i <= 7; i++) px(i, -2.5 + i * 0.12, 1, 1, '#f2c14e')
    for (let i = 0; i <= 4; i++) px(8, -1.5 + i, 1, 1, '#f2c14e')
    px(7.5, 3.5, 2, 2, '#e0a92e')
    ctx.restore()
  }
  const plugin = (k: Any): Any => {
    kit = k
    const p = R.agentPlugin(k)
    agent = p?.api ?? null
    const update = p.update
    let held = false
    let from: [number, number] | null = null
    // Tutor mode: a pixel scholar's cap on the globe (drawn over it, with the bubbles and tags).
    const over = p.over
    p.over = (ctx: CanvasRenderingContext2D, env: Any) => {
      over?.(ctx, env)
      if (hat && k.presence === 'shown' && c0()?.form !== 'cursor') drawHat(ctx, k.m.x, k.m.y, k.R)
      // A deeper chat: a faint warm glow behind the globe.
      if (deeper && k.presence === 'shown') {
        const g = ctx.createRadialGradient(k.m.x, k.m.y, k.R * 0.6, k.m.x, k.m.y, k.R * 1.6)
        g.addColorStop(0, 'rgba(168,200,255,0.18)')
        g.addColorStop(1, 'rgba(168,200,255,0)')
        ctx.save()
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(k.m.x, k.m.y, k.R * 1.6, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
      // Conversation mode: a soft ring round the globe that breathes, so you know it's listening hands-free.
      if (live && k.presence === 'shown') {
        const t = performance.now() / 1000
        ctx.save()
        ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 2.2)
        ctx.strokeStyle = '#7aaaff'
        ctx.lineWidth = 2
        ctx.setLineDash([4, 6])
        ctx.beginPath()
        ctx.arc(k.m.x, k.m.y, k.R * 1.25 + 2 * Math.sin(t * 2.2), 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }
    }
    const extent = p.extent
    p.extent = () => {
      const e = extent?.() ?? null
      if (!hat || k.presence !== 'shown') return e
      const R = k.R
      const box = [k.m.x - R * 1.3, k.m.y - R * 1.9, k.m.x + R * 1.5, k.m.y - R * 0.4]
      return e ? [Math.min(e[0], box[0]), Math.min(e[1], box[1]), Math.max(e[2], box[2]), Math.max(e[3], box[3])] : box
    }
    const quiet = p.quiet
    p.quiet = () => !hat && !live && (quiet ? quiet() : true)
    p.update = (dt: number, env: Any) => {
      update?.(dt, env)
      const m = k.m
      const h = !!(m.dragging || m.flung)
      if (h && !held) from = [m.x, m.y]
      if (held && !h && from && Math.hypot(m.x - from[0], m.y - from[1]) > k.R * 0.5) {
        home = { x: m.x, y: m.y }
        opts.onHome(m.x, m.y)
      }
      held = h
    }
    return p
  }
  R.register(R.ditherKit({ id: 'nova', label: 'Nova', matrix: true, pixel: 1.3, glow: 0.55, speed: 80, pal: PAL, plugin }))
  // Its size comes from this "unit" (Roamies' default). Only Nova on this layer (10-dither.js also registers its
  // own green demo blob).
  W.ROAMIE_UNIT = 340
  W.ROAMIE_ONLY = ['nova']
  R.panelHit = (x: number, y: number) => opts.extraHit(x, y)
  R.bootDesktop(opts.canvas)
  const c = R.tiles[0].creature
  c.setLook('jarvis') // the globe of LED points with a lit heart

  // Roamies' drawings (maps, flowcharts, moving models, bars, tables, maths, rings and labels on your screen), drawn by
  // the character itself as the pen. Then the agents corner, the Windows pen trail and the research card.
  await import('./roamies/world.js')
  await import('./roamies/ink3d.js')
  await import('./roamies/ink.js')
  await import('./roamies/minis.js')
  await import('./roamies/agent-home.js')
  await import('./roamies/pen.js')
  await import('./roamies/agent-panel.js')
  const cardHit = R.panelHit
  R.panelHit = (x: number, y: number) => opts.extraHit(x, y) || !!cardHit?.(x, y)

  let home: { x: number; y: number } | null = opts.home
  if (opts.home) agent?.place?.(opts.home.x, opts.home.y)
  agent?.show({})

  // A plain click on the globe talks to Nova (Roamies' "boop" is a click without a drag).
  const boop = c.boop.bind(c)
  c.boop = (x: number, y: number) => {
    boop(x, y)
    opts.onClick()
  }

  // ---------- the host: what Nova does → what the character does (Roamies' host.js) ----------
  let speech: Any = null
  // A drawing's lines when captions are off (ink.js): in Nova's speech bubble, one line at a time; '' ends it.
  let capSpeech: Any = null
  R.capBubble = (text: string): void => {
    if (!agent) return
    capSpeech?.end()
    capSpeech = null
    if (!text) return
    capSpeech = agent.say('', { stream: true })
    capSpeech.append(text)
  }
  let thought: Any = null
  let listen: Any = null
  let heard: Any = null
  let responding = false
  let mouse: [number, number] | null = null
  const endTalk = (): void => {
    speech?.end()
    thought?.end()
    speech = thought = null
  }
  // Tool performances play one at a time, in order (quick parallel calls that already finished are skipped).
  type Job = { id: string; anim: Any; result?: boolean; h?: Any }
  const jobs: Job[] = []
  let current: Job | null = null
  async function playTools(): Promise<void> {
    if (current) return
    while (jobs.length) {
      while (jobs.length > 2 && jobs[0].result !== undefined) jobs.shift()
      const job = jobs.shift()!
      if (!agent) break
      current = job
      try {
        job.h = agent.tool(job.anim.tool, { variant: job.anim.variant, label: job.anim.label, detail: job.anim.detail, live: true })
      } catch {
        current = null
        continue
      }
      if (job.result !== undefined) job.h.done(!job.result)
      await job.h.closed
      current = null
    }
    // Every tool has finished but the request is still going: a quiet thinking tag until the next thing.
    if (responding && !speech && !thought && !listen?.open && !R.ink?.playing) thought = agent?.think('', { stream: true, quiet: true }) ?? null
  }
  const settleTool = (id: string, isError: boolean): void => {
    const job = current?.id === id ? current : jobs.find((j) => j.id === id)
    if (!job) return
    job.result = isError
    job.h?.done(!isError)
  }
  // While a drawing plays, its lines show as the drawing's caption and the pen is busy drawing: no speech bubble rides
  // along on the drawing cursor (Roamies holds the reply's bubble back the same way).
  const drawing = (): boolean => !!(R.ink?.playing || agent?.pen?.held)
  function agentEvent(e: Any): void {
    if (!agent) return
    switch (e.type) {
      case 'start':
        freshAnswer = true
        R.ink?.halt?.()
        for (const j of [current, ...jobs]) if (j && j.result === undefined) {
          j.result = false
          j.h?.done(true)
        }
        agent.hand?.end?.()
        responding = true
        agent.working?.(true)
        if (!listen?.open && !speech) {
          heard?.close()
          heard = null
          if (!thought) thought = agent.think('', { stream: true })
        }
        break
      case 'tool':
        if (listen?.open || !e.anim) break
        endTalk()
        jobs.push({ id: String(e.id), anim: e.anim })
        void playTools()
        break
      case 'tool_end':
        settleTool(String(e.id), !!e.isError)
        break
      case 'trail':
        agent.cards?.trail(e)
        break
      case 'deeper':
        deeper = !!e.on
        R.wake?.()
        break
      case 'live':
        live = !!e.on
        R.sfx?.play(live ? 'expand' : 'poof')
        R.wake?.()
        break
      case 'lesson':
        lessonOn = !!e.on
        ;(R.ink as { lessonMode?: (on: boolean) => void } | undefined)?.lessonMode?.(lessonOn)
        if (!lessonOn) R.speakerNear(null, [])
        break
      case 'lessonArea': {
        // (the lesson window laid out: the globe moves off the slide if it's on it, or beside the new check card)
        if (!lessonOn || !Array.isArray(e.focus) || !Array.isArray(e.avoid)) break
        const ox = R.origin?.x ?? 0
        const oy = R.origin?.y ?? 0
        const loc = (r: number[]): number[] => [r[0] - ox, r[1] - oy, r[2], r[3]]
        const avoid = (e.avoid as number[][]).map(loc)
        const mv = c.mover
        const onIt = avoid.some((q) => mv.x > q[0] - 60 && mv.x < q[0] + q[2] + 60 && mv.y > q[1] - 60 && mv.y < q[1] + q[3] + 60)
        if (onIt || !aside || e.check !== undefined) R.speakerNear(loc(e.focus as number[]), avoid)
        break
      }
      case 'lineSaid':
        ;(R.ink as { lineSaid?: (id: number) => void } | undefined)?.lineSaid?.(Number(e.id))
        break
      case 'hat':
        hat = !!e.on
        R.sfx?.play(hat ? 'expand' : 'poof')
        // (tutor mode over: the lesson window's two Novas go back to one)
        if (!hat && lessonOn) {
          lessonOn = false
          ;(R.ink as { lessonMode?: (on: boolean) => void } | undefined)?.lessonMode?.(false)
          R.speakerNear(null, [])
        }
        R.wake?.()
        break
      case 'done':
        responding = false
        agent.working?.(false)
        thought?.end()
        thought = null
        break
    }
  }

  // Hot zones: ask on every mouse move whether the cursor is on the globe (or its bubble, cards or menu).
  let hot = false
  const trace = (line: string): void => opts.trace?.(line)
  const where = (x: number, y: number): string => {
    const mv = c.mover
    const onGlobe = Math.hypot(x - mv.x, y - mv.y) < mv.radius * 1.2
    return `at ${Math.round(x)},${Math.round(y)}; globe at ${Math.round(mv.x)},${Math.round(mv.y)} r${Math.round(mv.radius)}${onGlobe ? ' (ON the globe)' : ''}; Nova's part here: ${R.inkHitKind?.(x, y) ?? (R.hitTest?.(x, y) ? 'globe/bubble/panel' : 'none')}; following cursor: ${agent?.following?.() ? 'yes' : 'no'}`
  }
  const setHot = (h: boolean): void => {
    if (h === hot) return
    hot = h
    if (mouse) trace(`mouse ${h ? 'OVER' : 'off'} Nova ${where(mouse[0], mouse[1])}`)
    opts.onHot(h)
  }
  // Presses and releases (first, before anything else on the page handles them).
  let realDown = -1e9
  addEventListener('pointerdown', (e) => void (e.isTrusted && (realDown = performance.now())), true)
  addEventListener('pointerdown', (e) => trace(`press (button ${e.button}) on <${(e.target as Element | null)?.tagName?.toLowerCase() ?? '?'}> ${where(e.clientX, e.clientY)}`), true)
  addEventListener('pointerup', (e) => trace(`release ${where(e.clientX, e.clientY)}; dragging: ${c.mover.dragging ? 'yes' : 'no'}`), true)
  // Popped up beside your cursor to talk (Roamies' way): once it's all done and quiet for a few seconds, it glides
  // back to its spot and stays there, instead of following your mouse for ever.
  let busyAt = performance.now()
  let returning: { x: number; y: number } | null = null
  // A study board is up where the globe sits: it waits beside the board instead (ink.js asks), and goes back after.
  let aside: { x: number; y: number; part: string } | null = null
  R.awayFrom = (r: number[] | null, part: string): void => {
    if (!r) {
      if (aside?.part !== part) return
      aside = null
      if (home) returning = { x: home.x, y: home.y }
      return
    }
    const W = innerWidth
    const H = innerHeight
    const free = (x: number, y: number): boolean => !(x > r[0] - 70 && x < r[0] + r[2] + 70 && y > r[1] - 70 && y < r[1] + r[3] + 70)
    const spot = [
      [r[0] + r[2] + 80, Math.min(H - 90, r[1] + r[3] - 40)],
      [r[0] - 80, Math.min(H - 90, r[1] + r[3] - 40)],
      [Math.min(W - 80, r[0] + r[2] - 40), r[1] + r[3] + 80],
      [W - 80, H - 90]
    ].find(([x, y]) => x > 50 && x < W - 50 && y > 50 && y < H - 50 && free(x, y)) ?? [W - 80, H - 90]
    aside = { x: spot[0], y: spot[1], part }
    trace(`study board up: globe waits beside it at ${Math.round(spot[0])},${Math.round(spot[1])} (globe at ${Math.round(c.mover.x)},${Math.round(c.mover.y)}; mode ${c.mover.mode})`)
    returning = { x: spot[0], y: spot[1] }
  }
  // Tutor mode's lesson window: the globe is the Nova that talks (a small pen draws). It glides, slowly, to a free spot
  // beside what's being taught (ink.js says where), never over a card, an arrow, a ring or the words, with room for its
  // speech bubble above it. null: the lesson is over.
  let lessonOn = false
  R.speakerNear = (f: number[] | null, avoid: number[][]): void => {
    if (!f) {
      if (aside?.part === 'lesson') {
        aside = null
        if (home) returning = { x: home.x, y: home.y }
      }
      return
    }
    const W = innerWidth
    const H = innerHeight
    const RR = 70 // the globe's room (it's about 64 across the middle)
    const hits = (r: number[]): boolean => avoid.some((q) => r[0] < q[0] + q[2] && r[0] + r[2] > q[0] && r[1] < q[1] + q[3] && r[1] + r[3] > q[1])
    const free = (x: number, y: number): boolean => {
      const globe = [x - RR, y - RR, RR * 2, RR * 2]
      const bubble = [x - 170, y - RR - 110, 340, 110]
      return x - RR >= 8 && x + RR <= W - 8 && y - RR - 110 >= 8 && y + RR <= H - 8 && !hits(globe) && !hits(bubble)
    }
    const cx = f[0] + f[2] / 2
    const cy = f[1] + f[3] / 2
    const spots: number[][] = []
    for (const d of [24, 60, 120, 200])
      for (const [x, y] of [
        [f[0] + f[2] + d + RR, cy],
        [f[0] - d - RR, cy],
        [cx, f[1] + f[3] + d + RR],
        [cx, f[1] - d - RR],
        [f[0] + f[2] + d + RR, f[1] + RR],
        [f[0] + f[2] + d + RR, f[1] + f[3] - RR],
        [f[0] - d - RR, f[1] + RR],
        [f[0] - d - RR, f[1] + f[3] - RR]
      ])
        spots.push([x, y])
    const near = spots.filter(([x, y]) => free(x, y)).sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy))[0]
    // Nowhere free near it: the nearest free spot along the screen's edges, else where it is.
    let to = near
    if (!to) {
      const rim: number[][] = []
      for (let x = RR + 12; x < W - RR - 12; x += 60) rim.push([x, H - RR - 16], [x, RR + 126])
      for (let y = RR + 126; y < H - RR - 16; y += 60) rim.push([RR + 12, y], [W - RR - 12, y])
      to = rim.filter(([x, y]) => free(x, y)).sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy))[0]
    }
    if (!to) return
    if (aside && Math.hypot(aside.x - to[0], aside.y - to[1]) < 30) return
    aside = { x: to[0], y: to[1], part: 'lesson' }
    returning = { x: to[0], y: to[1] }
    agent?.settle?.(to[0], to[1]) // (settled there: no longer beside the cursor)
    trace(`lesson: the talking globe heads beside what's taught, to ${Math.round(to[0])},${Math.round(to[1])}`)
    R.wake?.()
  }
  let wasFollowing = false
  setInterval(() => {
    const now = performance.now()
    const following = !!agent?.following?.()
    if (following !== wasFollowing) trace(`globe ${following ? 'STARTS' : 'stops'} following the cursor`)
    wasFollowing = following
    // (a lesson: the talking globe stays beside what's taught, not by the cursor, while a request is answered)
    if (lessonOn && aside && following && !c.mover.dragging) agent?.settle?.(aside.x, aside.y)
    if (responding || listen?.open || drawing() || now - voice.at < 1500 || c.mover.dragging) busyAt = now
    // On its way back: a little idle act can pause the glide part-way, so it's sent on again until it's there.
    if (aside && c.mover.dragging) aside = null // (they put it somewhere themselves: it stays there)
    // (it goes once the drawing is done: settled at the spot beside the board, and kept there)
    if (aside && !returning && (!drawing() || lessonOn) && !following && Math.hypot(c.mover.x - aside.x, c.mover.y - aside.y) > 40) {
      trace(`globe steps aside to ${Math.round(aside.x)},${Math.round(aside.y)}`)
      agent?.settle?.(aside.x, aside.y)
      returning = { x: aside.x, y: aside.y }
      R.wake?.()
    }
    if (returning && (!drawing() || lessonOn)) {
      const mv = c.mover
      if (following || mv.dragging || mv.flung) returning = null
      else if (Math.hypot(mv.x - returning.x, mv.y - returning.y) < 12) returning = null
      else if (mv.mode === 'rest') {
        mv.goTo(returning.x, returning.y)
        R.wake?.()
      }
    }
    if (!following || now - busyAt < 5000) return
    const spot = aside ?? home ?? { x: c.mover.x, y: c.mover.y }
    trace(`done and quiet: globe goes back to ${Math.round(spot.x)},${Math.round(spot.y)}${home ? ' (its spot)' : ' (stays here)'}`)
    agent?.settle?.(spot.x, spot.y)
    returning = home ? { x: spot.x, y: spot.y } : null
    R.wake?.()
  }, 500)
  // While it follows your cursor (answering), the globe and its bubble trail right beside the pointer: passing over
  // them mustn't swallow your clicks in the app you're using. They only catch clicks once the pointer has rested on them
  // for a moment (you meant them); its cards and buttons work at once as always.
  let overSince = 0
  let overCheck: ReturnType<typeof setTimeout> | null = null
  const onMove = (e: MouseEvent): void => {
    mouse = [e.clientX, e.clientY]
    const over = !!R.ptr(e.clientX, e.clientY)
    const onInk = !!R.inkHitKind?.(e.clientX, e.clientY)
    if (over && !onInk && agent?.following?.() && !c.mover.dragging) {
      if (!overSince) overSince = performance.now()
      if (performance.now() - overSince < 600) {
        setHot(false)
        if (overCheck) clearTimeout(overCheck)
        const [x, y] = mouse
        overCheck = setTimeout(() => {
          if (overSince && mouse && Math.hypot(mouse[0] - x, mouse[1] - y) < 8 && R.ptr(x, y)) setHot(true)
        }, 620)
      } else setHot(true)
    } else {
      if (!over) overSince = 0
      setHot(over)
    }
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
    setState(s, cursor, text) {
      if (cursor) {
        R.ptr(cursor.x, cursor.y)
        mouse = [cursor.x, cursor.y]
      }
      if (s === 'listening') {
        endTalk()
        R.panel?.close()
        agent?.show({ summoned: true })
      } else if (s === 'thinking') {
        if (!thought && !speech && !listen?.open) thought = agent?.think('', { stream: true })
      } else if (s === 'done' || s === 'error') {
        thought?.end()
        thought = null
        // Nothing was spoken (the voice is off) or something went wrong: the words still show in a bubble.
        if (text && !speech) agent?.say(text, { mood: s === 'error' ? 'concerned' : undefined })
      }
      R.wake?.()
    },
    setConfig(n) {
      if (n.home) home = n.home
      if (R.sfx && n.sounds !== undefined) R.sfx.enabled = n.sounds
      c.setForm(n.size)
      // Hide when idle (a setting, off unless you turn it on): gone soon after it's done, back for anything it does.
      agent?.setAuto(n.hideIdle === true)
      if (!n.hideIdle) agent?.show({})
      R.wake?.()
    },
    hide() {
      agent?.hide({})
    },
    voice(env) {
      voice.env = env
      voice.at = performance.now()
      R.wake?.()
    },
    mic(v) {
      listen?.level(Math.min(1, v * 1.6))
    },
    bubble(b) {
      if (!agent) return
      if (b.who === 'you') {
        if (!b.text && !b.done) {
          // You're talking: the listening bubble beside your cursor, with the level of your voice.
          endTalk()
          heard?.close()
          heard = null
          listen?.close()
          listen = agent.listen({ placeholder: 'Listening…' })
        } else if (b.text) {
          // What was heard stays up until Nova starts thinking or answering.
          if (!listen) listen = agent.listen({ placeholder: '' })
          listen.set(`“${b.text}”`).processing()
          heard = listen
          listen = null
          R.sfx?.play('heard')
        } else {
          // Done with what you said (nothing more is coming: it was too short to act on, or nothing was heard): both
          // bubbles go, or "what was heard" stayed up for good.
          listen?.close()
          listen = null
          heard?.close()
          heard = null
        }
        return
      }
      // Nova's words, as they're said.
      if (b.done) {
        speech?.end()
        speech = null
        return
      }
      if (drawing()) return
      if (!b.append && speech) {
        speech.end()
        speech = null
      }
      if (!speech) {
        thought?.end()
        thought = null
        heard?.close()
        heard = null
        speech = agent.say('', { stream: true })
      }
      speech.append(b.append ? ` ${b.text}` : b.text)
    },
    goTo(p) {
      if (p) agent?.place?.(p.x, p.y)
      R.wake?.()
    },
    emote(e) {
      agent?.act(e)
    },
    ink(op) {
      if (op.agent) agentEvent(op.agent)
      else if (op.play) {
        endTalk()
        // The first drawing of a new answer: the last answer's cards make way.
        const addsToBoard = !!(op.play as { beats?: { marks?: { add?: boolean }[] }[] }).beats?.[0]?.marks?.[0]?.add
        if (freshAnswer) {
          freshAnswer = false
          if (!addsToBoard) R.ink?.clearOld?.()
        }
        R.ink?.play(op.play)
      } else if (op.clear) R.ink?.clear(op.clear)
      else if (op.snapshot) R.ink?.snapshot?.(op.snapshot)
      else if (op.marksAsk) R.ink?.screenMarks?.(op.marksAsk)
      else if (op.boardPic) R.ink?.boardPic?.(op.boardPic)
      else if (op.reminders) R.ink?.reminders(op.reminders)
      else if (op.stale) R.ink?.stale()
      else if (op.click) R.ink?.click(op.click.x, op.click.y)
      else if (op.pen) R.pen?.(op.pen)
      else if (op.panel && R.panel) {
        const p = op.panel
        if (p.op === 'open') {
          endTalk()
          const pos = agent?.pos ?? { x: c.mover.x, y: c.mover.y, r: kit?.R ?? 40 }
          R.panel.open({ status: p.text ?? 'Writing it up', near: { cursor: mouse ?? [pos.x, pos.y], buddy: pos } })
        } else if (p.op === 'status') R.panel.status(p.text ?? '')
        else if (p.op === 'append') R.panel.append(p.text ?? '')
        else if (p.op === 'end') R.panel.end(p.text)
        else if (p.op === 'fail') R.panel.fail(p.text ?? '')
        else if (p.op === 'close') R.panel.close()
      } else if (op.agents && (op.agents as { type?: string }).type === 'hatch') {
        const pos = agent?.pos ?? { x: c.mover.x, y: c.mover.y, r: 40 }
        R.agentHome?.hatch([pos.x, pos.y - pos.r - 28])
      } else if (op.agents) R.agentHome?.event(op.agents, { from: [c.mover.x, c.mover.y] })
      R.wake?.()
    },
    press(x, y) {
      // The real press arrives first when Windows hands it over; then this one is nothing to do.
      setTimeout(() => {
        if (performance.now() - realDown < 250) return
        const el = document.elementFromPoint(x, y) ?? document.body
        trace(`press relayed by the key helper on <${el.tagName.toLowerCase()}> ${where(x, y)}`)
        el.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1 }))
        el.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: 1 }))
      }, 60)
    },
    cursor(x, y) {
      mouse = [x, y]
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
      // A link clicked on the research card opens in your browser (web links only; checked again in Studyhall).
      if (R.panel) {
        R.panel.onLink = (url: string) => cb({ type: 'open_link', url })
        R.panel.onCopy = (text: string) => cb({ type: 'copy_text', text })
      }
      // The agents corner's buttons (Stop, Allow, open a file…) go the same way; it asks for the agents on screen now.
      if (R.agentHome) {
        R.agentHome.send = cb
        cb({ type: 'agents_ready' })
      }
    },
    where() {
      const p = agent?.pos ?? { x: c.mover.x, y: c.mover.y, r: kit?.R ?? 40 }
      return { x: p.x, y: p.y, r: p.r }
    }
  }
  return globe
}
