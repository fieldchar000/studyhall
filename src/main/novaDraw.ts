// Nova draws, the Roamies way (a port of Roamies' draw tool, tools.mjs, by Ken Kai, AGPL-3.0): one call holds a whole
// explanation. Each beat has a spoken line and the marks that draw while it's said: rings, labels, arrows and
// underlines on your real screen, and cards on calm space beside your window (flowcharts, maps, moving 3D models, bar
// charts, graphs, tables, timelines, worked maths, geometry, molecules, labelled photos, mind maps, quizzes).
// Roamies' own code does the hard parts, copied unchanged: draw.mjs checks and lays out each drawing (main), and
// ink.js draws it on the globe's layer (renderer), recoloured to your blue.
// What's different here: places on screen are found by their words through Nova's eyes (UI Automation), not
// screenshots; there are no click-by-click waits (walkthroughs are help_on_screen); typing, buttons and hand-offs
// aren't drawn (Nova has its own tools for those).

import { clipboard, shell, type WebContents } from 'electron'
import { z } from 'zod'
import { CARDS, DrawArgs, DrawShape, LIMITS, checkDraw, createParts, createPhotos, describeParts, faviconFor, resolveTargets } from './roamies/draw.mjs'
import { checkUrl } from './roamies/safety.mjs'
import { inkClear, inkHooks, inkPlay, orbBesideDrawing, orbEmote } from './bauer'
import { see, type Seen, type SeenControl } from './eyes'

type Tool = typeof import('@anthropic-ai/claude-agent-sdk').tool
type Any = any // eslint-disable-line @typescript-eslint/no-explicit-any

const parts = createParts()
const photos = createPhotos()
const quizzes = new Map<string, Any>()
const pinned = new Set<string>()
let inkTurn = -1
let drawSeq = 0
const waits = new Map<string, (v: string) => void>()
let quizNews: string[] = []
const deepIds = new Set<string>() // in-depth drawings playing (the globe waits beside them)
let chain: Promise<unknown> = Promise.resolve()
function serial<T>(f: () => Promise<T>): Promise<T> {
  const run = chain.then(f)
  chain = run.catch((e) => console.warn('Nova draw failed:', e))
  return run
}

/** News from the overlay: a drawing started, a card closed or pinned, a quiz answered, everything cleared. */
inkHooks.event = (msg) => {
  const t = String(msg.type ?? '')
  if (t === 'draw_started') waits.get(`${msg.id}:start`)?.('started')
  else if (t === 'draw_done' && deepIds.delete(String(msg.id))) orbBesideDrawing(false)
  else if (t === 'ink_closed') {
    parts.remove(String(msg.part))
    pinned.delete(String(msg.part))
  } else if (t === 'ink_pinned') {
    if (msg.on) pinned.add(String(msg.part))
    else pinned.delete(String(msg.part))
  } else if (t === 'ink_cleared') parts.clear((id: string) => pinned.has(id))
  else if (t === 'quiz_done') {
    const q = quizzes.get(String(msg.part))
    const picks = Array.isArray(msg.picks) ? (msg.picks as number[]) : []
    if (q?.questions) {
      const right = q.questions.filter((x: Any, i: number) => picks[i] === x.right).length
      quizNews.push(`They answered the quiz on screen: ${right} of ${q.questions.length} right${q.questions.map((x: Any, i: number) => (picks[i] === x.right ? '' : `; missed "${String(x.text).slice(0, 60)}" (answer: ${x.options?.[x.right]})`)).join('')}.`)
    }
  }
}
/** For <live-state>: how a quiz they answered on screen went (once). */
export function drawNews(): string {
  const n = quizNews.join(' ')
  quizNews = []
  return n
}

let turnNo = 0
/** A new request: a drawing from now on replaces the old one (unless it edits it). */
export function newDrawTurn(): void {
  turnNo++
}

const asRect = (c: SeenControl): number[] => [c.rect.x, c.rect.y, c.rect.width, c.rect.height]

/** Finding places on screen by their words (or an id from read_screen), for Roamies' resolveTargets. */
function lookups(findControl: (pool: SeenControl[], find: string, seen: Seen | null) => SeenControl | null, last: () => Seen | null): Any {
  let seenP: Promise<Seen | null> | null = null
  const get = (): Promise<Seen | null> => (seenP ??= see({ screenshot: false }).catch(() => null))
  return {
    seen: get,
    async text(find: string) {
      const s = await get()
      const c = s && findControl(s.controls, String(find), s)
      if (!c) throw new Error(`"${find}" isn't on screen (use the exact words shown, from read_screen).`)
      return { bounds: asRect(c), role: c.role, text: c.name }
    },
    async textAll(find: string) {
      const s = await get()
      const q = String(find).toLowerCase()
      return (s?.controls ?? []).filter((c) => c.name.toLowerCase().includes(q) && c.rect.width > 1).map((c) => ({ bounds: asRect(c), text: c.name }))
    },
    async id(id: number) {
      const s = last() ?? (await get())
      const c = s?.controls.find((x) => x.id === Number(id))
      if (!c) throw new Error(`There's no control ${id} from read_screen now. Use its words instead.`)
      return { bounds: asRect(c), role: c.role, label: c.name, id: c.id }
    },
    async pixel(): Promise<number[]> {
      throw new Error('Mark things by the words shown on them (at: {text}) or an id from read_screen: Nova doesn’t take screenshots, so there are no pixel places.')
    }
  }
}

const DESCRIPTION = `Draw while you talk: one call holds a whole explanation. Your globe floats over and the marks draw paced to each beat's spoken line.
beats: [{say, marks}]. say: one short line, under 20 words, spoken while that beat's marks draw, so your reply after draw never repeats or rephrases it. Keep 1 to 4 marks per beat, in the order you mention them.
Places on their screen (at, to, tie): {text: the exact words shown on screen} (from read_screen or what they said; add every: true to mark every place it appears), or {id} from read_screen. No pixel places.
Which mark on the screen: one thing to notice: ring; a small spot or icon: point; a region or panel: frame; key words: underline (outdated ones: strike); right or wrong: check, cross; order of steps: num; a name beside something: label (text) or label on any mark; how two things relate: connect (at → to; flow: true runs moving dots along it); one thing above all else: spotlight (sparingly); big words: write (text, size).
Explanations that a picture makes clearer go on cards beside their window (tie connects a card to what it explains; every card can take a title, and card_size: small, large or full): card (heading, text, items, sources), note (text, tone), list (title, items), mindmap (title: the topic; branches [{text, items: up to 6 short points, tone}], 2 to 8) for a topic and its parts at a glance, clip (title, text), sources ([{name, url}]), legend (keys [{tone, text}]).
photo (query: a thing with a Wikipedia page, or url; text = caption). To name its parts add labels [{text, x, y}], x and y as fractions of the picture from its top left (0 to 1): only after see_photo has shown you that same picture.
Numbers: bars (bars [{label, value, tone}], unit) compares amounts; graph (x_range, y_range, plots [{points, tone, label}], dots [{x, y, label}]) is for curves and change over time; timeline (events [{when, text}]) for dates. table (columns [headings], rows [[one cell per column]], up to ${LIMITS.columns} by ${LIMITS.rows}) compares things side by side: the first column names each row, cells stay short, and a cell of exactly "yes" or "no" is drawn as a tick or a cross.
flow (nodes [{id, text, shape: box|round|diamond, tone}], links [{from, to, label, flow}] by node id, dir: down|right) for a process, cause and effect or a decision: round for a start or an end, diamond for a question, flow: true runs moving dots along a link (what travels: blood, current, signals), animate: true runs them along every link. Up to ${LIMITS.nodes} nodes, a few words each; it lays itself out.
map (region: world, a continent, or country names with commas between; shade [{name, tone}] colours countries in; pins [{name, lat, lon}]; routes [{from, to}] between pins by name). Country outlines only: cities and states get pins.
math (steps [{tex, note}]) writes worked maths one step at a time. tex: one line of LaTeX per step (\\frac{a}{b}, \\sqrt{x}, x^{2}, x_{1}, \\left( \\right), \\text{words}, Greek, \\times \\cdot \\pm \\le \\ne \\approx \\pi \\infty; no \\begin, & or \\\\ line breaks); note: a few plain words on what changed. geometry (vertices [{id, x, y}] in your own units with y up, lines [{from, to, label, dash}], angles [{at, from, to, label}], circles [{at, r, label}]).
molecule (smiles, label) for chemistry. model (parts [{shape: box|sphere|cylinder|cone|torus, at [x,y,z], size [x,y,z], rot [deg x,y,z], tone, label, motion}] within about -1 to 1, title) for objects, organs and machines. motion {do: spin|orbit|slide|pulse, axis: x|y|z, around [x,y,z], to [x,y,z], secs} makes a part move to show how it works: slide goes from at to "to" and back (a piston, a valve), orbit circles the point "around", spin turns it in place, pulse swells and shrinks (a heart).
quiz (questions [{text, options: 2 to 4, answer: the right option word for word, explain}], up to ${LIMITS.questions}) for a quick clickable check: they answer by clicking and see right or wrong at once; how they did reaches you with their next message, so say a line and stop.
Deep explanations ("explain X in depth", "walk me through photosynthesis", a process with several stages): set deep: true. Each card then opens big in the middle of the screen and replaces the one before, so plan 4 to 10 beats with one card each that build on each other: the big picture first, then one stage or idea per card, then a short summary card. Each say line tells that part of the story like a teacher (why, an everyday comparison, what to notice), never reading the card out.
Also: emote (name: hype, wave, upset, remind, motivate), copy (text to the clipboard), open (url). tone: accent, teal, amber, coral, lilac, sky, lime, red, white.
A drawing stays until they clear it; your next drawing replaces it. At most ${LIMITS.cardsShown} cards show at once, so make a point with the fewest cards. Every drawn piece gets an id (p1, p2 …) in the result. To change what's drawn ("make that red", "move it left", "never mind"): edit [{do: recolor|move|erase|clear, part, tone, dx, dy}] with no beats. Up to 12 beats, 40 marks each.`

const DROPPED = new Set(['type', 'handoff', 'button', 'target', 'hover', 'scroll', 'ticket', 'medal'])

export function drawTools(
  tool: Tool,
  ctx: {
    wc: WebContents
    slow: () => void
    /** Speak these lines now, in order (the voice reads them while the marks draw). */
    speak: (lines: string[]) => void
    findControl: (pool: SeenControl[], find: string, seen: Seen | null) => SeenControl | null
    lastSeen: () => Seen | null
  }
): Any[] {
  const OFFSCREEN = process.env.STUDYHALL_OFFSCREEN === '1'
  const text = (t: string): Any => {
    if (OFFSCREEN) console.info('draw>', t.slice(0, 600)) // (automated tests read what the tool said)
    // Anything but a finished drawing is an error, so the model fixes it and draws again (as Roamies' tool throws).
    const ok = /^(Drew|Edited|Done|This is the picture)/.test(t)
    return { content: [{ type: 'text', text: t }], ...(ok ? {} : { isError: true }) }
  }
  return [
    tool(
      'draw',
      DESCRIPTION,
      DrawShape, // Roamies' exact format, so the model writes marks the way Roamies' model does
      // One drawing at a time (parallel calls would race for the overlay), as Roamies runs draw sequentially.
      async (raw: Any) =>
        serial(async () => {
        let args: Any
        try {
          // Roamies' own check of the whole drawing (it also tidies small slips in how marks are written).
          const beats = (raw.beats ?? []).map((b: Any) => ({ ...b, wait: undefined, marks: (b.marks ?? []).filter((m: Any) => !DROPPED.has(String(m.kind))) }))
          args = DrawArgs.parse({ ...raw, beats })
        } catch (e) {
          const issues = (e as { issues?: { path: unknown[]; message: string }[] }).issues
          return text(`That drawing doesn't fit the format: ${issues ? issues.slice(0, 6).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') : String(e)}`)
        }
        const problems: string[] = checkDraw(args)
        if (problems.length) return text(problems.join('\n'))
        const unseen = photos.unseen(args.beats)
        if (unseen) return text(unseen)
        const edits: Any[] = args.edit ?? []
        for (const e of edits) if (e.do !== 'clear' && !parts.has(e.part)) return text(`There's no ${e.part} on screen now${parts.ids.length ? ` (there is: ${parts.describe()})` : ' (nothing is drawn)'}. Draw it again instead.`)
        // A new drawing in a later request replaces the old one (cards too), unless it edits what's there.
        if (inkTurn !== turnNo && !edits.length && parts.ids.length) {
          parts.clear((id: string) => pinned.has(id))
          inkClear()
        }
        inkTurn = turnNo
        for (const e of edits) if (e.do === 'erase') parts.remove(e.part)
        else if (e.do === 'clear') parts.clear()
        const beats: Any[] = args.beats ?? []
        const hasCards = beats.some((b) => b.marks.some((m: Any) => CARDS.includes(m.kind)))
        const look = lookups(ctx.findControl, ctx.lastSeen)
        const needsScreen = beats.some((b) => b.marks.some((m: Any) => m.at || m.to || m.tie))
        if (needsScreen || hasCards) ctx.slow()
        const notes: string[] = []
        // A mark whose place isn't on screen is left out (with a note), so one wrong place doesn't sink the drawing.
        let seg: Any[] | null = null
        for (let tries = 0; !seg && tries < 8; tries++) {
          try {
            seg = await resolveTargets(beats, look)
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            const at = /^beat (\d+) mark (\d+)/.exec(msg)
            const b = at ? beats[Number(at[1]) - 1] : null
            const total = beats.reduce((n, x) => n + x.marks.length, 0)
            if (!b || total <= 1) return text(msg)
            b.marks.splice(Number(at![2]) - 1, 1)
            notes.push(`Left out ${msg}`)
          }
        }
        if (!seg) return text(`Nothing could be placed: ${notes.join(' ')}`)
        // Pictures and site icons, fetched together (public web only).
        await Promise.all(
          seg.flatMap((b) => b.marks).map(async (m: Any) => {
            if (m.kind === 'photo') {
              try {
                Object.assign(m, await photos.get(m))
              } catch (e) {
                m.missing = true
                notes.push(`No photo for ${m.query ?? 'that link'} (${e instanceof Error ? e.message : e}); drew its frame and caption only.`)
              }
            } else if (m.kind === 'sources' || m.sources?.length) {
              m.sources = await Promise.all((m.sources ?? []).map(async (x: Any) => ({ ...x, icon: await faviconFor(x.url).catch(() => null) })))
            }
          })
        )
        // The few actions a drawing can carry here.
        for (const b of seg)
          for (const m of b.marks) {
            if (m.kind === 'emote' && m.name) orbEmote(String(m.name))
            else if (m.kind === 'copy' && m.text) clipboard.writeText(String(m.text))
            else if (m.kind === 'open' && m.url && checkUrl(m.url).level !== 'block') void shell.openExternal(String(m.url))
          }
        const ids: string[] = parts.assign(seg)
        // Described now, before the oldest cards are forgotten (a deep explanation keeps only its last card up).
        const drawn = ids.map((p) => [p, parts.get(p)])
        const shut: string[] = parts.trimCards(args.deep ? 1 : LIMITS.cardsShown, (q: string) => pinned.has(q))
        for (const b of seg) for (const m of b.marks) if (m.kind === 'quiz' && m.part) quizzes.set(m.part, m)
        const id = `d${++drawSeq}`
        const out = seg.map((b, j) => ({ ...b, n: j + 1, caption: String(b.say), voiced: true }))
        const s = await look.seen()
        // Cards go on calm space beside the window you're in. (Automated tests: that window is hidden far off-screen.)
        const win = hasCards && s && !OFFSCREEN ? [s.window.rect.x, s.window.rect.y, s.window.rect.width, s.window.rect.height] : null
        const busy = s ? s.controls.filter((c: SeenControl) => c.rect.width > 2).slice(0, 300).map(asRect) : []
        const first = out.flatMap((b) => b.marks).find((m: Any) => m.at?.rect)
        const near = first ? { x: first.at.rect[0] + first.at.rect[2] / 2, y: first.at.rect[1] + first.at.rect[3] / 2 } : win ? { x: win[0] + win[2] / 2, y: win[1] + win[3] / 2 } : null
        const started = new Promise<string>((res) => {
          const t = setTimeout(() => res('timeout'), 15_000)
          waits.set(`${id}:start`, (v) => {
            clearTimeout(t)
            res(v)
          })
        })
        // The lines are spoken in order while the drawing paces itself to the voice.
        ctx.speak(out.map((b) => b.caption))
        if (args.deep) {
          deepIds.add(id)
          orbBesideDrawing(true)
        }
        inkPlay({ id, seg: 0, beats: out, edits, last: true, win, busy, ...(args.deep ? { deep: true } : {}) }, near)
        const r = await started
        waits.delete(`${id}:start`)
        // Not started yet: it's queued behind a drawing still playing (a long one), and plays when that ends.
        if (r === 'timeout') notes.push('It plays after the drawing that is on screen now.')
        if (shut.length) notes.push(`Only ${args.deep ? 1 : LIMITS.cardsShown} card${args.deep ? '' : 's'} stay up at once, so the oldest closed (${shut.join(', ')}).`)
        const said = out.map((b) => `"${b.caption}"`).join(' ')
        return text(
          [
            drawn.length ? `Drew ${describeParts(drawn)}.` : edits.length ? 'Edited the drawing.' : 'Done.',
            ...notes,
            `On screen now: ${parts.describe() || 'nothing'}.`,
            `Already said out loud as it drew: ${said} Don't repeat or rephrase any of that: add nothing, or one short sentence they haven't heard yet (a question, or what comes next).`,
            beats.some((b) => b.marks.some((m: Any) => m.kind === 'quiz')) ? 'They answer the quiz by clicking; how they did reaches you with their next message, so don’t ask for their answers.' : ''
          ]
            .filter(Boolean)
            .join(' ')
        )
      })
    ),
    tool(
      'see_photo',
      "Look at a picture before naming its parts. Give the same query (a thing with a Wikipedia page) or url you will give draw's photo mark: you get that picture back, so you can see where each part is. Needed once before a photo with labels.",
      { query: z.string().optional(), url: z.string().optional() },
      async ({ query, url }: { query?: string; url?: string }) => {
        ctx.slow()
        try {
          const p = await photos.see({ query, url })
          return {
            content: [
              { type: 'text', text: `This is the picture a photo mark with ${url ? 'this url' : `query "${query}"`} shows${p.title ? ` (${p.title})` : ''}. To name its parts, draw that photo with labels [{text, x, y}]: x and y are fractions of this picture, x from 0 at its left edge to 1 at its right, y from 0 at its top to 1 at its bottom. Put each point on the middle of the part it names, and only name parts you can see here.` },
              { type: 'image', data: p.data, mimeType: p.mediaType }
            ]
          }
        } catch (e) {
          return text(e instanceof Error ? e.message : String(e))
        }
      }
    )
  ]
}
