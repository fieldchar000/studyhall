// Tutor mode's lesson window: their deck, big, with a column beside it for Nova's cards, and the lesson's controls
// (Next, Back, Pause, the slides seen so far, End). Studyhall shows the slides itself, from the file Nova read, so it
// turns pages at once and knows where every word is: nothing in their browser or PowerPoint is touched.
// The drawing (rings, arrows, cards) and the two Novas are on Nova's see-through layer over this window (ink.js).
import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { findOnPage, type Lesson } from './lessonReader'

type Rect = [number, number, number, number]
const OFFSCREEN = process.env.STUDYHALL_OFFSCREEN === '1'

let url: (hash: string) => string = () => ''
let prefs: Electron.WebPreferences = {}
let win: BrowserWindow | null = null
let lesson: Lesson | null = null
let page = 1
let beside: number | null = null
let paused = false
// The check question on the lesson window's answer card (tap an option, or say the answer), and how it went.
let check: { question: string; kind: 'choice' | 'say'; options: string[]; picked: number | null; right: number | null } | null = null
const seen = new Set<number>()
// Tutor mode teaches in this window; a Replay plays a lesson back in it (its buttons go to the replay then).
let mode: 'tutor' | 'replay' = 'tutor'
let replay: { title?: string; chapters?: string[]; chapter?: number; done?: boolean; you?: string | null; paused?: boolean } | null = null
// Where the slides are on the screen (DIP), as the window last laid them out; null while it lays them out again.
let layout: { page: number; slide: Rect | null; side: Rect | null; column: Rect | null; bars: Rect[]; win: Rect } | null = null
const layoutWaiters: ((ok: boolean) => void)[] = []

/** What the buttons do during a Replay (lessonReplay.ts). */
export const replayHooks = {
  next: (): void => {},
  back: (): void => {},
  pause: (_on: boolean): void => {},
  end: (): void => {},
  chapter: (_k: number): void => {}
}
export function setLessonMode(m: 'tutor' | 'replay'): void {
  mode = m
  replay = m === 'replay' ? {} : null
  paused = false
}
/** The replay's chapters, where it is, a line they said, done. */
export function setReplayState(p: NonNullable<typeof replay>): void {
  if (mode !== 'replay') return
  replay = { ...(replay ?? {}), ...p }
  send()
}

/** What the lesson's buttons do (novaBrain and tutor.ts fill these in). */
export const lessonHooks = {
  next: (): void => {},
  back: (): void => {},
  pause: (_on: boolean): void => {},
  end: (): void => {},
  /** They tapped an option on the answer card (its number). */
  answer: (_i: number): void => {},
  /** They clicked a slide they've seen before (in the strip): it's showing now. */
  went: (_n: number): void => {},
  /** Laid out (a slide shown, a check card up, the window resized): where the talking globe can wait (screen DIP). */
  laidOut: (_a: { column: Rect | null; check: Rect | null; avoid: Rect[] }): void => {},
  /** The window moved or changed size: what's drawn over it no longer lines up. */
  moved: (): void => {}
}

export function configureLessonWindow(o: { url: (hash: string) => string; webPreferences: Electron.WebPreferences }): void {
  url = o.url
  prefs = o.webPreferences
  ipcMain.on('lesson:layout', (e, m) => {
    if (!win || e.sender !== win.webContents || !m || typeof m !== 'object') return
    const b = win.getContentBounds()
    // (the hidden test copy keeps the window off screen, but lays it out as if it were at the top left of the screen,
    // where Nova's layer is: the drawing lines up with it in the test pictures)
    const o = OFFSCREEN ? screen.getPrimaryDisplay().workArea : b
    const at = (r: unknown): Rect | null =>
      Array.isArray(r) && r.length === 4 && r.every((v) => Number.isFinite(Number(v))) ? [o.x + Number(r[0]), o.y + Number(r[1]), Number(r[2]), Number(r[3])] : null
    layout = {
      page: Number(m.page) || page,
      slide: at(m.slide),
      side: at(m.side),
      column: at(m.column),
      bars: (Array.isArray(m.bars) ? m.bars : []).map(at).filter((r: Rect | null): r is Rect => !!r),
      win: [o.x, o.y, b.width, b.height]
    }
    for (const w of layoutWaiters.splice(0)) w(true)
    const l = layout
    lessonHooks.laidOut({ column: l.column, check: at(m.check), avoid: [l.slide, l.side, ...l.bars].filter((r): r is Rect => !!r) })
  })
  // The page is listening: what's showing now (the first state can arrive before it is).
  ipcMain.on('lesson:hello', (e) => {
    if (win && e.sender === win.webContents) send()
  })
  ipcMain.on('lesson:cmd', (e, m) => {
    if (!win || e.sender !== win.webContents || !m || typeof m !== 'object') return
    const d = String(m.do ?? '')
    if (mode === 'replay') {
      if (d === 'next') replayHooks.next()
      else if (d === 'back') replayHooks.back()
      else if (d === 'pause') {
        paused = !paused
        replay = { ...(replay ?? {}), paused }
        send()
        replayHooks.pause(paused)
      } else if (d === 'end') replayHooks.end()
      else if (d === 'chapter' && Number.isInteger(Number(m.n))) replayHooks.chapter(Number(m.n))
      return
    }
    if (d === 'next') lessonHooks.next()
    else if (d === 'back') lessonHooks.back()
    else if (d === 'pause') {
      paused = !paused
      send()
      lessonHooks.pause(paused)
    } else if (d === 'end') lessonHooks.end()
    else if (d === 'answer' && check && check.picked == null && Number.isInteger(Number(m.n)) && Number(m.n) >= 0 && Number(m.n) < check.options.length) lessonHooks.answer(Number(m.n))
    else if (d === 'goto' && seen.has(Number(m.n))) {
      page = Number(m.n)
      beside = null
      layout = null
      send()
      lessonHooks.went(page)
    }
  })
}

const state = (): Record<string, unknown> | null =>
  lesson ? { id: lesson.id, title: lesson.title, kind: lesson.kind, count: lesson.count, page, beside, seen: [...seen].sort((a, b) => a - b), paused, check, replay } : null
function send(): void {
  if (win && !win.isDestroyed()) win.webContents.send('lesson:state', state())
}

export const lessonWindowOpen = (): boolean => !!win && !win.isDestroyed()
export const lessonPage = (): number => page
export const lessonSeen = (): number[] => [...seen].sort((a, b) => a - b)
export const lessonShown = (): Lesson | null => (lessonWindowOpen() ? lesson : null)

/** Open the lesson window on this deck (or bring it to this deck), at a slide. */
export function openLessonWindow(l: Lesson, start = 1): void {
  const fresh = lesson?.id !== l.id
  lesson = l
  if (fresh) {
    seen.clear()
    paused = false
  }
  page = Math.min(Math.max(1, start), l.count)
  seen.add(page)
  beside = null
  layout = null
  if (win && !win.isDestroyed()) {
    send()
    if (!OFFSCREEN) toFront(win)
    return
  }
  const wa = screen.getPrimaryDisplay().workArea
  win = new BrowserWindow({
    ...(OFFSCREEN ? { x: -30000, y: -30000, width: wa.width, height: wa.height } : { x: wa.x, y: wa.y, width: wa.width, height: wa.height }),
    show: false,
    title: `Lesson · ${l.title}`,
    backgroundColor: '#060d22',
    autoHideMenuBar: true,
    ...(OFFSCREEN ? { focusable: false, skipTaskbar: true } : {}),
    webPreferences: prefs
  })
  win.on('page-title-updated', (e) => e.preventDefault())
  void win.loadURL(url('#lesson'))
  win.webContents.on('did-finish-load', send)
  win.once('ready-to-show', () => {
    if (!win) return
    if (OFFSCREEN) win.showInactive()
    else {
      win.maximize()
      toFront(win)
    }
  })
  const moved = (): void => {
    layout = null
    lessonHooks.moved()
  }
  win.on('move', moved)
  win.on('resize', moved)
  win.on('closed', () => {
    win = null
    layout = null
    for (const w of layoutWaiters.splice(0)) w(false)
    if (mode === 'replay') replayHooks.end()
    else lessonHooks.end()
  })
}

/** In front of the window they were in (their browser or PowerPoint): Windows keeps a background app from jumping
 *  in front, so it's on top for a moment, given the keyboard, then an ordinary window again. */
function toFront(w: BrowserWindow): void {
  if (w.isMinimized()) w.restore()
  w.setAlwaysOnTop(true)
  w.show()
  w.moveTop()
  app.focus({ steal: true })
  w.focus()
  setTimeout(() => {
    if (!w.isDestroyed()) w.setAlwaysOnTop(false)
  }, 1500)
}
/** The lesson window is the one in front (if not, Nova tells them where it is). */
export const lessonInFront = (): boolean => !!win && !win.isDestroyed() && win.isVisible() && (OFFSCREEN || win.isFocused())

export function closeLessonWindow(): void {
  const w = win
  win = null
  layout = null
  if (w && !w.isDestroyed()) w.destroy()
}

/** Show a slide (and, beside it, an earlier one they've seen); resolves once it's laid out on the screen. */
export async function showLessonSlide(n: number, besideN?: number | null): Promise<string> {
  if (!lesson || !lessonWindowOpen()) return 'The lesson window isn’t open: read_lesson first.'
  const kind = lesson.kind === 'slides' ? 'slide' : 'page'
  if (!Number.isInteger(n) || n < 1 || n > lesson.count) return `Pick a ${kind} from 1 to ${lesson.count}.`
  // A teacher links back to what they've already seen, never ahead to something new.
  if (besideN != null && !seen.has(besideN))
    return `Not shown: they haven't seen ${kind} ${besideN} yet (seen so far: ${lessonSeen().join(', ') || 'none'}). Link back only to ${kind}s you've already taught.`
  page = n
  check = null
  seen.add(n)
  beside = besideN != null && besideN !== n ? besideN : null
  layout = null
  send()
  const ok = await new Promise<boolean>((res) => {
    layoutWaiters.push(res)
    setTimeout(() => res(false), 4000)
  })
  return ok ? `Showing ${kind} ${n}${beside ? `, with ${kind} ${beside} beside it` : ''}.` : `Showing ${kind} ${n} (it's still loading).`
}

/** Words on the slide showing (or the one beside it), where they are on the screen (DIP): for rings and arrows. */
export function wordsOnSlide(words: string): Rect | null {
  if (!lesson || !layout) return null
  const tries: [number | null, Rect | null][] = [
    [page, layout.slide],
    [beside, layout.side]
  ]
  for (const [n, r] of tries) {
    if (n == null || !r) continue
    const f = findOnPage(lesson.id, n, words)
    if (f) return [r[0] + f[0] * r[2], r[1] + f[1] * r[3], f[2] * r[2], f[3] * r[3]].map((v) => Math.round(v)) as Rect
  }
  return null
}

/** Where the words of the slides showing are on the screen (the talking globe keeps off them). */
function textOnScreen(): Rect[] {
  if (!lesson || !layout) return []
  const out: Rect[] = []
  for (const [n, r] of [
    [page, layout.slide],
    [beside, layout.side]
  ] as [number | null, Rect | null][]) {
    if (n == null || !r) continue
    for (const b of lesson.pages.find((p) => p.n === n)?.boxes ?? []) out.push([r[0] + b[0] * r[2], r[1] + b[1] * r[3], b[2] * r[2], b[3] * r[3]].map((v) => Math.round(v)) as Rect)
  }
  return out.slice(0, 80)
}
/** The window, and what cards must keep off (the slides), for the drawing; null when the lesson window isn't up. */
export function lessonArea(): { win: Rect; busy: Rect[]; column: Rect | null; text: Rect[] } | null {
  if (!layout || !lessonWindowOpen()) return null
  return { win: layout.win, busy: [layout.slide, layout.side, ...layout.bars].filter((r): r is Rect => !!r), column: layout.column, text: [...textOnScreen(), ...layout.bars] }
}

/** Put a check question on the lesson window's answer card (null: take it away). */
export function showCheck(c: { question: string; kind: 'choice' | 'say'; options?: string[] } | null): void {
  check = c ? { question: c.question, kind: c.kind, options: c.kind === 'choice' ? (c.options ?? []).slice(0, 4) : [], picked: null, right: null } : null
  layout = null
  send()
}
/** How the answer went: the option they picked, and the right one (shown on the card). */
export function markCheck(picked: number | null, right: number | null): void {
  if (!check) return
  check = { ...check, picked, right }
  send()
}
export const checkUp = (): typeof check => check
