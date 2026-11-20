// Bauer on the PC screen, outside Studyhall:
//  • the floating Bauer: a small glowing orb at the edge of the screen (click to talk)
//  • cards: explanations and answers pinned beside whatever you're working on
//  • circle-to-ask: freeze the screen, circle something, ask about it (Ctrl+Alt+B)
// All three are transparent, always-on-top windows that let clicks through except where they draw.

import { PenTrail, type PenEvent } from './penTrail'
import { app, BrowserWindow, desktopCapturer, globalShortcut, ipcMain, nativeImage, screen, shell } from 'electron'
import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import type { BauerCard, LiveOp, OrbState, WikiSummary } from '@shared/types'
import { getPrefs } from './prefs'
import { getSetting, setSetting } from './db'

let loadUrl: (hash: string) => string = (h) => h
let webPrefs: Electron.WebPreferences = {}
let orbWin: BrowserWindow | null = null
// A tutor lesson being recorded: Nova's drawings show in the recording (they're the lesson), but still never in Nova's
// own screenshots, which hide it for the moment they take.
let inRecordings = false
let hiding = 0
export function novaInRecordings(on: boolean): void {
  inRecordings = on
  if (orbWin && !orbWin.isDestroyed() && !hiding) orbWin.setContentProtection(!on)
}
export async function hiddenFromCaptures<T>(fn: () => Promise<T>): Promise<T> {
  if (!inRecordings || !orbWin || orbWin.isDestroyed()) return fn()
  if (!hiding++) {
    orbWin.setContentProtection(true)
    await new Promise((r) => setTimeout(r, 80)) // (the screen's compositor takes a frame to apply it)
  }
  try {
    return await fn()
  } finally {
    if (!--hiding && orbWin && !orbWin.isDestroyed()) orbWin.setContentProtection(!inRecordings)
  }
}
let cardsWin: BrowserWindow | null = null
let circleWin: BrowserWindow | null = null
let pointWin: BrowserWindow | null = null
let cards: BauerCard[] = []
let quitting = false
let startBrief: () => void = () => {}
let shot: { image: string; width: number; height: number } | null = null
let suspended = false // Studyhall is closed to the tray: Bauer stays off the screen
export const CIRCLE_SHORTCUT = 'CommandOrControl+Alt+B'
export const ORB_SHORTCUT = 'CommandOrControl+Alt+N' // show / hide Nova
export const TUTOR_SHORTCUT = 'CommandOrControl+Alt+T' // tutor mode on / off
export const CONVO_SHORTCUT = 'CommandOrControl+Alt+C' // conversation mode on / off
export const shortcutHooks = { tutor: (): void => {}, conversation: (): void => {} }
/** Automated tests: windows live far off-screen, nothing is captured, nothing takes focus. */
const OFFSCREEN = process.env.STUDYHALL_OFFSCREEN === '1'


export function configureBauer(opts: { url: (hash: string) => string; webPreferences: Electron.WebPreferences; startBrief: () => void }): void {
  loadUrl = opts.url
  webPrefs = opts.webPreferences
  startBrief = opts.startBrief
  ipcMain.on('bauer:window', (e, msg) => {
    if (!msg || typeof msg !== 'object') return
    const from = BrowserWindow.fromWebContents(e.sender)
    if (msg.type === 'ready' && from === cardsWin) {
      cardsWin?.webContents.send('bauer:cards', cards)
      // The page is listening now: the lesson steps that came while it loaded.
      cardsReady = true
      sendSubject()
      for (const op of liveQueue.splice(0)) cardsWin?.webContents.send('bauer:live', op)
    }
    // The cards window is only as tall as what's in it (never a full-height strip down your screen).
    else if (msg.type === 'mouse' && from && (from === orbWin || from === cardsWin)) {
      if (from === orbWin) setOrbHot(!!msg.over && !pen && !handsBusy)
      if (from === orbWin && (pen || handsBusy)) return void mouseTrace(`${winName(from)}: mouse ${msg.over ? 'over' : 'off'} Nova, but ${pen ? 'the pen is on' : 'Nova is working an app'}, so it stays as it is`)
      from.setIgnoreMouseEvents(!msg.over, { forward: true })
    }
    else if (msg.type === 'inkEvent' && from && msg.msg && typeof msg.msg === 'object' && (msg.msg as { type?: unknown }).type === 'mouse_trace') mouseTrace(`${winName(from)}: ${String((msg.msg as { line?: unknown }).line ?? '')}`)
    else if (msg.type === 'inkEvent' && from === orbWin && msg.msg && typeof msg.msg === 'object') inkHooks.event(msg.msg as Record<string, unknown>)
    // (right-click on the pen layer: the key helper reports it, and the last mark goes; nothing to do here)
    // A lesson is talking about one card: the globe floats over beside it (left of the cards).
    else if (msg.type === 'cardAt' && from === cardsWin && cardsWin && [msg.x, msg.y, msg.h].every((v) => Number.isFinite(Number(v)))) {
      const b = cardsWin.getBounds()
      orbTo({ x: b.x + Number(msg.x) - 58, y: b.y + Number(msg.y) + Math.min(90, Number(msg.h) / 2) })
    }
    else if (msg.type === 'pointReady' && from === pointWin && pointWin) pointWin.webContents.send('bauer:point', lastPoint)
    else if (msg.type === 'lookMark' && Number.isInteger(Number(msg.n))) lookAtMark(Number(msg.n))
    // Speech bubbles beside the globe: your words under it, Nova's above it.
    else if (msg.type === 'bubble' && (msg.who === 'you' || msg.who === 'nova')) {
      orbWin?.webContents.send('bauer:bubble', { who: msg.who, text: String(msg.text ?? '').slice(0, 2000), append: !!msg.append, done: !!msg.done })
      if (msg.who === 'you' && !msg.append && marksTimer) hidePointer() // talking again clears the marks from last time
    }
    else if (msg.type === 'orb') sendOrb(String(msg.state) as OrbState, typeof msg.text === 'string' ? msg.text : undefined)
    // Loudness for the orb's ripples: Nova's voice (a list, every 40 ms) or your microphone (one number).
    else if (msg.type === 'voice' && Array.isArray(msg.env)) orbWin?.webContents.send('bauer:levels', { kind: 'voice', env: msg.env.slice(0, 3000).map((v: unknown) => Math.max(0, Math.min(1, Number(v) || 0))) })
    else if (msg.type === 'mic') orbWin?.webContents.send('bauer:levels', { kind: 'mic', v: Math.max(0, Math.min(1, Number(msg.v) || 0)) })
    else if (msg.type === 'closeCircle' && from === circleWin) closeCircle()
    else if (msg.type === 'listen' && from === orbWin) startBrief()
    else if (msg.type === 'hideOrb' && from === orbWin) orbWin?.hide()
    else if (msg.type === 'ready' && from === orbWin) sendOrbConfig()
    else if (msg.type === 'orbHome' && from === orbWin && orbWin && Number.isFinite(Number(msg.x)) && Number.isFinite(Number(msg.y))) {
      // Dropped somewhere new: remembered (screen coordinates) for next time.
      const b = orbWin.getBounds()
      setSetting('nova_orb_home', { x: Math.round(b.x + Number(msg.x)), y: Math.round(b.y + Number(msg.y)) })
    }
  })
  setShortcut(true)
  syncOrb()
}

function setShortcut(on: boolean): void {
  if (OFFSCREEN) return
  // Ctrl+Alt+B: draw one circle on your live screen (no frozen picture, no full-screen window), then ask.
  if (on && !globalShortcut.isRegistered(CIRCLE_SHORTCUT)) globalShortcut.register(CIRCLE_SHORTCUT, () => setPen('marks'))
  else if (!on && globalShortcut.isRegistered(CIRCLE_SHORTCUT)) globalShortcut.unregister(CIRCLE_SHORTCUT)
  if (on && !globalShortcut.isRegistered(ORB_SHORTCUT)) globalShortcut.register(ORB_SHORTCUT, toggleOrb)
  else if (!on && globalShortcut.isRegistered(ORB_SHORTCUT)) globalShortcut.unregister(ORB_SHORTCUT)
  // Ctrl+Alt+T: tutor mode on / off.
  if (on && !globalShortcut.isRegistered(TUTOR_SHORTCUT)) globalShortcut.register(TUTOR_SHORTCUT, () => shortcutHooks.tutor())
  else if (!on && globalShortcut.isRegistered(TUTOR_SHORTCUT)) globalShortcut.unregister(TUTOR_SHORTCUT)
  if (on && !globalShortcut.isRegistered(CONVO_SHORTCUT)) globalShortcut.register(CONVO_SHORTCUT, () => shortcutHooks.conversation())
  else if (!on && globalShortcut.isRegistered(CONVO_SHORTCUT)) globalShortcut.unregister(CONVO_SHORTCUT)
}

/** Ctrl + Alt + N: show or hide Nova for now (the Nova page's switch decides at start-up). */
function toggleOrb(): void {
  if (suspended) return
  if (orbWin && !orbWin.isDestroyed() && orbWin.isVisible()) orbWin.hide()
  else {
    if (!orbWin || orbWin.isDestroyed()) syncOrb(true)
    else orbWin.showInactive()
  }
  watchCursor()
}

// ---------- The floating Nova: Roamies' JARVIS globe on one see-through layer over your screen ----------
// The layer covers one screen's work area and lets every click through except on the globe (the page decides, on
// every mouse move). The globe floats around inside it, comes over beside your cursor when you talk, and flies to
// whatever it points at; the layer hops to another screen when the globe needs to be there.

type OrbSize = 'small' | 'default' | 'cursor'
const orbSize = (): OrbSize => (['small', 'default', 'cursor'].includes(String(getPrefs().novaOrbSize)) ? (getPrefs().novaOrbSize as OrbSize) : 'default')
let orbDisplay: number | null = null
type Spot = { x: number; y: number }

/** Is a screen point inside some screen's work area? */
function onSomeScreen(x: number, y: number): boolean {
  return screen.getAllDisplays().some((d) => x >= d.workArea.x + 20 && x <= d.workArea.x + d.workArea.width - 20 && y >= d.workArea.y + 20 && y <= d.workArea.y + d.workArea.height - 20)
}
/** Where you last left it resting (screen coordinates), if that's still on a screen. */
function savedHome(): Spot | null {
  const s = getSetting<Spot>('nova_orb_home')
  return s && Number.isFinite(s.x) && Number.isFinite(s.y) && onSomeScreen(s.x, s.y) ? s : null
}
function layerOn(d: Electron.Display): void {
  if (!orbWin || orbWin.isDestroyed()) return
  if (orbDisplay === d.id) return
  orbDisplay = d.id
  if (!OFFSCREEN) orbWin.setBounds(d.workArea)
  sendLayer()
}
/** Tell the globe's page where its layer is, so drawings on screen places land in the right spot. */
function sendLayer(): void {
  if (!orbWin || orbWin.isDestroyed()) return
  const b = OFFSCREEN ? screen.getPrimaryDisplay().workArea : orbWin.getBounds()
  orbWin.webContents.send('bauer:layer', { x: b.x, y: b.y })
}

// ---------- Drawings (Roamies' ink) on the globe's layer ----------
export const inkHooks = { event: (_msg: Record<string, unknown>): void => {} }
/** Play a drawing segment (screen places in DIP), on the screen the drawing is about. */
// The pause after each step while teaching (the voice waits that long after each step's line: the drawing keeps time).
let inkPause = 0
export function setInkPause(s: number): void {
  inkPause = s
}
export function inkPlay(seg: unknown, near?: { x: number; y: number } | null): void {
  if (suspended || !orbWin || orbWin.isDestroyed()) return
  if (near && !OFFSCREEN) layerOn(screen.getDisplayNearestPoint(near))
  if (!orbWin.isVisible()) orbWin.showInactive()
  // (captions at the bottom only when they're switched on; else its lines show in Nova's speech bubble)
  orbWin.webContents.send('bauer:ink', { play: { ...(seg as Record<string, unknown>), captions: getPrefs().novaCaptions === true, pause: inkPause } })
}
/** Roamies' reminders card (today / later), on the globe's layer. */
export function inkReminders(msg: Record<string, unknown>): void {
  if (suspended || !orbWin || orbWin.isDestroyed()) return
  if (!orbWin.isVisible()) orbWin.showInactive()
  orbWin.webContents.send('bauer:ink', { reminders: msg })
}
/** The globe acts out what Nova is doing (Roamies' agent layer): a tool's performance and task tag, the step trail,
 *  the start and end of a request (see novaStage.ts). */
export function orbAgent(e: Record<string, unknown>): void {
  if (suspended || !orbWin || orbWin.isDestroyed()) return
  orbWin.webContents.send('bauer:ink', { agent: e })
}
/** The research card (Roamies' agent-panel.js): open it, say what's being checked, stream the answer, finish. */
export function orbPanel(op: 'open' | 'status' | 'append' | 'end' | 'fail' | 'close', text?: string): void {
  if (suspended || !orbWin || orbWin.isDestroyed()) return
  if (op === 'open' && !orbWin.isVisible()) orbWin.showInactive()
  orbWin.webContents.send('bauer:ink', { panel: { op, ...(text !== undefined ? { text } : {}) } })
}
/** News for the agents' corner (Roamies' agent-home.js): an agent started, moved on, waits for a yes, finished… */
export function agentsUi(e: unknown): void {
  if (suspended || !orbWin || orbWin.isDestroyed()) return
  if (!orbWin.isVisible()) orbWin.showInactive()
  orbWin.webContents.send('bauer:ink', { agents: e })
}
/** The window a drawing was about changed or closed: the drawing fades. */
export function inkStale(): void {
  orbWin?.webContents.send('bauer:ink', { stale: true })
}
/** A click (screen point) for a drawing waiting on one (a walkthrough step). */
export function inkClick(p: Spot): void {
  if (!orbWin || orbWin.isDestroyed()) return
  orbWin.webContents.send('bauer:ink', { click: local(p) })
}
/** While Nova works an app for you (the helper moves the real cursor), the layer lets every click through, even on
 *  the globe; the globe hops to where each step lands. */
let handsBusy = false
export function setHandsActive(on: boolean): void {
  handsBusy = on
  if (!orbWin || orbWin.isDestroyed()) return
  if (on) orbWin.setIgnoreMouseEvents(true, { forward: true })
}
export function lookAtRect(r: Electron.Rectangle): void {
  orbTo(besideRect(r))
}
/** Asks the overlay for pictures of the cards on screen (they come back as an ink event, card_images). */
export function inkSnapshot(id: string): void {
  orbWin?.webContents.send('bauer:ink', { snapshot: id })
}
export function inkClear(e: Record<string, unknown> = {}): void {
  orbWin?.webContents.send('bauer:ink', { clear: e })
}
/** Ask the overlay where what it marked on the screen is (rings, underlines, labels): it answers with a
 *  'screen_marks' event (see roamiesTools.ts). Also where its layer is on screen (DIP). */
/** A slide's picture for the study board that's up (it opened before the picture was made). */
export function inkBoardPic(part: string, page: number, src: string): void {
  orbWin?.webContents.send('bauer:ink', { boardPic: { part, page, src } })
}
export function inkAskMarks(id: string): void {
  orbWin?.webContents.send('bauer:ink', { marksAsk: id })
}
export function inkLayer(): Electron.Rectangle | null {
  if (!orbWin || orbWin.isDestroyed()) return null
  return OFFSCREEN ? screen.getPrimaryDisplay().workArea : orbWin.getBounds()
}
/** A screen point in the layer's own coordinates. */
function local(p: Spot): Spot {
  const b = orbWin && !orbWin.isDestroyed() && !OFFSCREEN ? orbWin.getBounds() : screen.getPrimaryDisplay().workArea
  return { x: Math.round(p.x - b.x), y: Math.round(p.y - b.y) }
}
function sendOrbConfig(): void {
  if (!orbWin || orbWin.isDestroyed()) return
  const h = savedHome()
  const b = OFFSCREEN ? screen.getPrimaryDisplay().workArea : orbWin.getBounds()
  const homeHere = h && h.x >= b.x && h.x <= b.x + b.width && h.y >= b.y && h.y <= b.y + b.height ? local(h) : null
  orbWin.webContents.send('bauer:orbConfig', { size: orbSize(), roam: getPrefs().novaDrift !== false, home: homeHere, sounds: getPrefs().novaSounds !== false, hideIdle: getPrefs().novaHideIdle === true })
  sendLayer()
  orbWin.setIgnoreMouseEvents(true, { forward: true })
  watchCursor()
}

// In "follows my cursor" size, the layer goes wherever the mouse goes, screen to screen.
let cursorTimer: NodeJS.Timeout | null = null
function watchCursor(): void {
  const on = orbSize() === 'cursor' && !!orbWin && !orbWin.isDestroyed() && orbWin.isVisible() && !suspended && !OFFSCREEN
  if (!on) {
    if (cursorTimer) clearInterval(cursorTimer)
    cursorTimer = null
    return
  }
  if (cursorTimer) return
  cursorTimer = setInterval(() => {
    if (!orbWin || orbWin.isDestroyed() || !orbWin.isVisible()) return watchCursor()
    layerOn(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()))
  }, 250)
}

// ---------- Grabbing the globe ----------
// The layer lets clicks through to your apps, and only catches them while the mouse is over the globe (or a card,
// a bubble…). Windows is supposed to keep telling the layer where the mouse is, but with Nova's other see-through
// layers on top that news didn't always arrive, so the globe couldn't be grabbed. Studyhall watches the mouse itself
// (only while it's over this layer, and only when it moves) and tells the layer.
let hotTimer: ReturnType<typeof setInterval> | null = null
let lastCursor = ''
function watchHot(): void {
  if (hotTimer || OFFSCREEN) return
  hotTimer = setInterval(() => {
    if (!orbWin || orbWin.isDestroyed() || !orbWin.isVisible() || suspended) return
    const p = screen.getCursorScreenPoint()
    const b = orbWin.getBounds()
    if (p.x < b.x || p.y < b.y || p.x >= b.x + b.width || p.y >= b.y + b.height) return
    const key = `${p.x},${p.y}`
    if (key === lastCursor) return
    lastCursor = key
    orbWin.webContents.send('bauer:cursor', { x: p.x - b.x, y: p.y - b.y })
  }, 40)
  hotTimer.unref?.()
}

/** Show or hide the globe to match Settings. */
export function syncOrb(force = false): void {
  const on = (force || getPrefs().bauerOrb !== false) && !suspended
  if (!on) {
    orbWin?.hide()
    watchCursor()
    return
  }
  if (!orbWin || orbWin.isDestroyed()) {
    const h = savedHome()
    const d = h ? screen.getDisplayNearestPoint(h) : screen.getPrimaryDisplay()
    orbDisplay = d.id
    orbWin = overlayWindow(d.workArea, '#orb')
    orbWin.setIgnoreMouseEvents(true, { forward: true })
    watchHot()
    orbWin.on('closed', () => {
      orbWin = null
      orbDisplay = null
    })
    orbWin.once('ready-to-show', () => {
      orbWin?.showInactive()
      watchCursor()
    })
  } else {
    if (!orbWin.isVisible()) orbWin.showInactive()
    sendOrbConfig()
  }
}

/** What Nova is doing, for the globe (listening, thinking, a short line of what it did). When you start talking it
 *  comes over beside your cursor, on whichever screen that is. */
export function sendOrb(state: OrbState, text?: string): void {
  if (!orbWin || orbWin.isDestroyed()) return
  let cursor: Spot | undefined
  if (state === 'listening' && !OFFSCREEN) {
    const p = screen.getCursorScreenPoint()
    layerOn(screen.getDisplayNearestPoint(p))
    cursor = local(p)
  }
  orbWin.webContents.send('bauer:orb', { state, text, cursor })
}

// ---------- The pen: mark what you mean, on your live screen ----------
// Roamies' Windows pen: Studyhall follows your cursor itself and draws its trail on the globe's layer (penTrail.ts),
// so it never depends on the layer receiving mouse events and works over any window. A mark is drawn while the left
// mouse button is held (move without drawing in between); right-click takes the last mark back; Esc cancels.
//  • 'talk': while you hold the talk keys. Let go and the marks go with what you said.
//  • 'marks': Ctrl+Alt+B (or the pen button in the typing box). Mark as much as you like; after your first mark the
//    typing box opens beside them; your question (typed or said) goes with all of them.
// Nova gets a close-up of the area with your marks drawn on it, and what each mark is (Roamies' marks.mjs). It can't
// get stuck: it ends when the marks are sent, on Esc, or by itself after a while.

export type PenMode = 'talk' | 'marks'
let pen: PenMode | null = null
let penTimer: NodeJS.Timeout | null = null
let trail: PenTrail | null = null
let trailTimer: ReturnType<typeof setInterval> | null = null
export const penMode = (): PenMode | null => pen
export const penHooks = {
  /** The marks are done: the area they're about (screen rect, DIP) and each stroke (screen points). */
  circled: (_rect: Electron.Rectangle, _strokes: Spot[][], _mode: PenMode): void => {},
  /** Ctrl+Alt+B: the first mark is down, so the typing box opens beside the marks (screen rect, DIP). */
  marked: (_rect: Electron.Rectangle): void => {},
  /** The key helper should (or no longer) report the mouse buttons. */
  buttons: (_on: boolean): void => {}
}
const penSend = (events: PenEvent[]): void => {
  if (!events.length || !orbWin || orbWin.isDestroyed()) return
  for (const e of events) orbWin.webContents.send('bauer:ink', { pen: e })
}
const round = (r: { x: number; y: number; width: number; height: number }): Electron.Rectangle => ({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) })
let askedBeside = false
/** One step of the trail (exported for automated tests, which can't move your mouse). */
export function penFeed(p: Spot): void {
  if (!trail) return
  const events = trail.feed(p)
  penSend(events)
  if (events.some((e) => e.ev === 'snap')) markDone()
}
/** The left button: down starts a mark, up ends it (exported for tests). */
export function penButton(down: boolean, p: Spot = screen.getCursorScreenPoint()): void {
  if (!trail) return
  penSend(trail.button(down, p))
  if (!down) markDone()
}
/** Right-click: the last mark goes. */
export function penUndo(): void {
  if (!trail) return
  penSend(trail.undo())
}
// A mark finished: in 'marks' mode, the typing box opens beside them (once).
function markDone(): void {
  // Each mark gives you more time (Ctrl+Alt+B mode ends by itself 10 minutes after your last mark).
  if (pen === 'marks') {
    if (penTimer) clearTimeout(penTimer)
    penTimer = setTimeout(() => setPen(null, true), 600_000)
  }
  if (pen !== 'marks' || askedBeside || !trail) return
  const area = trail.area()
  if (!area) return
  askedBeside = true
  penHooks.marked(round(area))
}
export function setPen(mode: PenMode | null, cancel = false): void {
  if (suspended || (OFFSCREEN && !process.env.STUDYHALL_PEN_TEST)) mode = null
  if (penTimer) clearTimeout(penTimer)
  penTimer = null
  if (!orbWin || orbWin.isDestroyed()) mode = null
  const was = pen
  pen = mode
  if (!orbWin || orbWin.isDestroyed()) return
  if (mode) {
    if (was) return void (penTimer = setTimeout(() => setPen(null), mode === 'marks' ? 600_000 : 120_000))
    if (!orbWin.isVisible()) orbWin.showInactive()
    if (!OFFSCREEN) layerOn(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()))
    // Clicks while you draw don't reach the app underneath (Ctrl+Alt+click isn't something you meant).
    orbWin.setIgnoreMouseEvents(false)
    orbWin.webContents.send('bauer:pen', { on: true, once: mode === 'marks' })
    trail = new PenTrail()
    askedBeside = false
    penHooks.buttons(true)
    if (!OFFSCREEN) trailTimer = setInterval(() => penFeed(screen.getCursorScreenPoint()), 16)
    penTimer = setTimeout(() => setPen(null, mode === 'marks'), mode === 'marks' ? 600_000 : 120_000)
  } else if (was) {
    if (trailTimer) clearInterval(trailTimer)
    trailTimer = null
    penHooks.buttons(false)
    const t = trail
    trail = null
    orbWin.webContents.send('bauer:pen', { on: false, once: false })
    orbWin.setIgnoreMouseEvents(true, { forward: true })
    if (!t) return
    const { events, area, strokes } = t.end()
    penSend(events)
    if (cancel || !area || area.width < 4 || area.height < 4) return
    penHooks.circled(round(area), strokes, was)
  }
}

/** A little performance from the globe (Nova's emote tags): wave, hype, remind, upset, motivate. */
// The globe acts out a feeling only now and then, so each one means something: at most one every 3 minutes, and none
// while it explains or teaches (it was dancing so often nobody could tell why). A reminder going off always gets its own.
export const emoteHooks = { quiet: (): boolean => false }
let lastEmote = 0
export function orbEmote(e: string, always = false): void {
  if (!['wave', 'hype', 'remind', 'upset', 'motivate'].includes(e)) return
  if (!always && (emoteHooks.quiet() || Date.now() - lastEmote < 180_000)) return
  lastEmote = Date.now()
  orbWin?.webContents.send('bauer:emote', e)
}

/** Studyhall closed to the tray: hide the orb, cards and circling layer, and free Ctrl+Alt+B. Opened again: bring them back. */
export function setBauerSuspended(on: boolean): void {
  suspended = on
  if (on) {
    for (const w of [orbWin, cardsWin, circleWin, pointWin]) if (w && !w.isDestroyed()) w.hide()
    shot = null
  }
  setShortcut(!on)
  if (!on) syncOrb()
}

export function closeBauerWindows(): void {
  quitting = true
  for (const w of [orbWin, cardsWin, circleWin, pointWin]) w?.destroy()
  orbWin = cardsWin = circleWin = pointWin = null
}

// ---------- Presses on Nova's layer ----------
// Windows doesn't always hand a press to Nova's see-through layer (it can't take focus): the release arrives but the
// press doesn't, so cards' buttons did nothing and the globe couldn't be grabbed. While the mouse is over a part of
// Nova, the key helper (which reads the mouse button itself) reports presses, and the layer gets them from here; it
// only acts on one when the real press didn't arrive.
export const orbPressHooks = { hot: (_on: boolean): void => {} }
let orbHot = false
function setOrbHot(on: boolean): void {
  if (on === orbHot) return
  orbHot = on
  orbPressHooks.hot(on)
}
/** The left button went down somewhere (the key helper heard it). */
export function orbPress(): void {
  if (!orbHot || pen || handsBusy || !orbWin || orbWin.isDestroyed()) return
  const p = local(screen.getCursorScreenPoint())
  orbWin.webContents.send('bauer:press', p)
}

// ---------- The mouse recorder ----------
// Only Nova's own see-through windows: when each one starts or stops catching clicks, and (from the pages) where a
// press landed and what of Nova's was there. Positions and yes/no only, never what's on your screen or what you say.
// The last few hundred lines are kept in nova-mouse.log in Studyhall's data folder, for fixing grabbing and clicking.
const traceLines: string[] = []
let traceTimer: ReturnType<typeof setTimeout> | null = null
export function mouseTrace(line: string): void {
  const d = new Date()
  traceLines.push(`${d.toTimeString().slice(0, 8)}.${String(d.getMilliseconds()).padStart(3, '0')} ${line.slice(0, 400)}`)
  if (traceLines.length > 600) traceLines.splice(0, traceLines.length - 600)
  traceTimer ??= setTimeout(() => {
    traceTimer = null
    void writeFile(join(app.getPath('userData'), 'nova-mouse.log'), traceLines.join('\n') + '\n').catch(() => {})
  }, 1500)
}
const winName = (w: BrowserWindow | null): string => (w === orbWin ? 'globe layer' : w === cardsWin ? 'cards layer' : w === pointWin ? 'rings layer' : w === circleWin ? 'circle layer' : 'other')

const overlayWindow = (bounds: Electron.Rectangle, hash: string, focusable = false): BrowserWindow => {
  const w = new BrowserWindow({
    ...bounds,
    ...(OFFSCREEN ? { x: -30000, y: -30000 } : {}),
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable,
    title: 'Bauer',
    backgroundColor: '#00000000',
    // (Roamies' little sounds play without a click first.)
    webPreferences: { ...webPrefs, backgroundThrottling: false, spellcheck: false, autoplayPolicy: 'no-user-gesture-required' }
  })
  // (every change to whether it catches clicks goes in the mouse recorder)
  const setIgnore = w.setIgnoreMouseEvents.bind(w)
  let ignoring: boolean | null = null
  w.setIgnoreMouseEvents = (ignore: boolean, o?: Electron.IgnoreMouseEventsOptions) => {
    if (ignore !== ignoring) {
      ignoring = ignore
      const p = screen.getCursorScreenPoint()
      mouseTrace(`${hash} window ${ignore ? 'lets clicks through' : 'CATCHES clicks'} (mouse at ${p.x},${p.y}; window at ${JSON.stringify(w.getBounds())})`)
    }
    setIgnore(ignore, o)
  }
  w.setAlwaysOnTop(true, 'screen-saver')
  w.setContentProtection(!inRecordings) // Nova never shows up in screenshots or recordings (or in its own circle-to-ask), except a tutor lesson's recording
  w.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    w.hide()
  })
  w.loadURL(loadUrl(hash))
  return w
}

// ---------- Cards ----------

/** The cards layer: see-through, over the whole screen the subject (or your mouse) is on; each card floats on it. */
function ensureCards(): BrowserWindow {
  const wa = screen.getDisplayNearestPoint(subject ? { x: subject.x + subject.width / 2, y: subject.y + subject.height / 2 } : screen.getCursorScreenPoint()).workArea
  if (cardsWin && !cardsWin.isDestroyed()) {
    if (!OFFSCREEN && JSON.stringify(cardsWin.getBounds()) !== JSON.stringify(wa)) {
      cardsWin.setBounds(wa)
      sendSubject()
    }
    return cardsWin
  }
  cardsWin = overlayWindow(wa, '#cards')
  cardsWin.setIgnoreMouseEvents(true, { forward: true })
  cardsReady = false
  cardsWin.on('closed', () => {
    cardsWin = null
    cardsReady = false
  })
  return cardsWin
}

// What the cards are arranged around (what Nova ringed or underlined, or what you circled), in screen coordinates.
let subject: Electron.Rectangle | null = null
function sendSubject(): void {
  if (!cardsWin || cardsWin.isDestroyed() || !cardsReady) return
  const b = OFFSCREEN ? screen.getPrimaryDisplay().workArea : cardsWin.getBounds()
  cardsWin.webContents.send('bauer:subject', subject ? { x: subject.x - b.x, y: subject.y - b.y, width: subject.width, height: subject.height } : null)
}
export function setSubject(r: Electron.Rectangle | null): void {
  subject = r
  sendSubject()
}

export function showCards(add: BauerCard[]): void {
  cards = [...add, ...cards].slice(0, 8)
  if (suspended) return
  const w = ensureCards()
  const send = (): void => {
    w.webContents.send('bauer:cards', cards)
    w.showInactive()
  }
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', send)
  else send()
}

export function clearCards(): void {
  cards = []
  cardsWin?.webContents.send('bauer:cards', cards)
  cardsWin?.hide()
}

// ---------- Circle to ask ----------

/** Freeze the screen under the mouse into a picture, then open the circling layer over it. */
export async function startCircle(): Promise<void> {
  if (suspended) return
  if (circleWin && !circleWin.isDestroyed() && circleWin.isVisible()) return
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const { width, height } = display.size
  const sf = display.scaleFactor
  orbWin?.hide()
  cardsWin?.hide()
  await new Promise((r) => setTimeout(r, 120)) // let them disappear before the picture
  if (OFFSCREEN) {
    // A blank stand-in instead of the real screen; tests draw their own pictures.
    shot = { image: nativeImage.createEmpty().resize({ width: 16, height: 9 }).toDataURL() || 'data:image/png;base64,', width: width, height: height }
  } else {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.round(width * sf), height: Math.round(height * sf) } })
    const src = sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
    if (getPrefs().bauerOrb !== false) orbWin?.showInactive()
    if (!src) return
    shot = { image: src.thumbnail.toDataURL(), width: src.thumbnail.getSize().width, height: src.thumbnail.getSize().height }
  }
  if (!circleWin || circleWin.isDestroyed()) {
    circleWin = overlayWindow(display.bounds, '#circle', !OFFSCREEN)
    circleWin.on('closed', () => (circleWin = null))
  } else if (!OFFSCREEN) circleWin.setBounds(display.bounds)
  const w = circleWin
  const show = (): void => {
    w.webContents.send('bauer:circle')
    if (OFFSCREEN) {
      w.showInactive()
      return
    }
    w.show()
    w.focus()
  }
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', show)
  else show()
}

export function takeShot(): { image: string; width: number; height: number } | null {
  const s = shot
  shot = null
  return s
}

function closeCircle(): void {
  circleWin?.hide()
  shot = null
}

// ---------- Pointing (eyes): a ring around one control on your screen ----------

// While Nova points, the globe flies over beside the ring (on that screen), then back to what it was doing.
function orbTo(p: Spot): void {
  if (!orbWin || orbWin.isDestroyed() || !orbWin.isVisible()) return
  if (!OFFSCREEN) layerOn(screen.getDisplayNearestPoint(p))
  orbWin.webContents.send('bauer:orbGo', local(p))
}
function orbHome(): void {
  orbWin?.webContents.send('bauer:orbGo', null)
}

/** Where the globe hovers to point at something: just right of it (or below it at the screen's edge). */
function besideRect(rect: Electron.Rectangle): Spot {
  const d = screen.getDisplayMatching(rect).workArea
  const right = rect.x + rect.width + 110 < d.x + d.width
  return right ? { x: rect.x + rect.width + 62, y: rect.y + rect.height / 2 } : { x: rect.x + rect.width / 2, y: Math.min(rect.y + rect.height + 70, d.y + d.height - 60) }
}

/** Show the pointer around a screen area (DIP). It never catches clicks and never shows in screenshots. */
export function showPointer(rect: Electron.Rectangle, label: string, step: string): void {
  if (suspended) return
  clearMarksSoon(0)
  // The globe comes over to just right of (or below) the control, like a cursor pointing at it.
  orbTo(besideRect(rect))
  const display = screen.getDisplayMatching(rect)
  const b = display.bounds
  if (!pointWin || pointWin.isDestroyed()) {
    pointWin = overlayWindow(b, '#point')
    pointWin.setIgnoreMouseEvents(true)
    pointWin.on('closed', () => (pointWin = null))
  } else if (!OFFSCREEN) pointWin.setBounds(b)
  const w = pointWin
  const send = (): void => {
    pointMsg(w, { rect: { x: rect.x - b.x, y: rect.y - b.y, width: rect.width, height: rect.height }, label, step })
    w.showInactive()
  }
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', send)
  else send()
}

let lastPoint: unknown = null
function pointMsg(w: BrowserWindow, msg: unknown): void {
  lastPoint = msg
  if (!w.isDestroyed()) w.webContents.send('bauer:point', msg)
}

// ---------- Marks: Nova shows you things on your screen while it talks ----------
// Rings with short labels (numbered when there are several) around controls or text on your screen; the globe floats
// over beside the first one. They clear by themselves after a while, or when you talk to Nova again.

let marksTimer: NodeJS.Timeout | null = null
function clearMarksSoon(ms: number): void {
  if (marksTimer) clearTimeout(marksTimer)
  marksTimer = ms ? setTimeout(hidePointer, ms) : null
}

let lastMarks: Electron.Rectangle[] = []
export function showMarks(marks: { rect: Electron.Rectangle; label: string }[]): void {
  if (suspended || !marks.length) return
  lastMarks = marks.map((m) => m.rect)
  const xs = marks.map((m) => m.rect)
  const x0 = Math.min(...xs.map((r) => r.x))
  const y0 = Math.min(...xs.map((r) => r.y))
  setSubject({ x: x0, y: y0, width: Math.max(...xs.map((r) => r.x + r.width)) - x0, height: Math.max(...xs.map((r) => r.y + r.height)) - y0 })
  const display = screen.getDisplayMatching(marks[0].rect)
  const b = display.bounds
  const here = marks.filter((m) => screen.getDisplayMatching(m.rect).id === display.id).slice(0, 6)
  orbTo(besideRect(here[0].rect))
  if (!pointWin || pointWin.isDestroyed()) {
    pointWin = overlayWindow(b, '#point')
    pointWin.setIgnoreMouseEvents(true)
    pointWin.on('closed', () => (pointWin = null))
  } else if (!OFFSCREEN) pointWin.setBounds(b)
  const w = pointWin
  const send = (): void => {
    pointMsg(w, {
      rect: { x: 0, y: 0, width: 0, height: 0 },
      label: '',
      step: '',
      marks: here.map((m) => ({ rect: { x: m.rect.x - b.x, y: m.rect.y - b.y, width: m.rect.width, height: m.rect.height }, label: m.label }))
    })
    w.showInactive()
  }
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', send)
  else send()
  clearMarksSoon(25_000)
}

/** Fly the globe beside mark n (1-based: the one Nova is talking about now). */
export function lookAtMark(n: number): void {
  const r = lastMarks[n - 1]
  if (r && marksTimer) {
    orbTo(besideRect(r))
    clearMarksSoon(25_000)
  }
}

export function hidePointer(): void {
  if (marksTimer) clearTimeout(marksTimer)
  marksTimer = null
  orbHome()
  if (!pointWin || pointWin.isDestroyed()) return
  pointMsg(pointWin, null)
  pointWin.hide()
}

// ---------- Live lessons: cards appear step by step (and a brief source page beside them) ----------

let lessonHome: NodeJS.Timeout | null = null
let cardsReady = false
const liveQueue: LiveOp[] = []

/** Send one step of a live lesson to the cards window (opening it, two columns wide when there's a source page). */
export function liveCards(op: LiveOp): void {
  if (suspended) return
  const w = ensureCards()
  if (op.op === 'start') cards = []
  // The lesson's over: the globe stays by the cards a little while (you're reading), then floats off again.
  if (lessonHome) clearTimeout(lessonHome)
  lessonHome = op.op === 'end' ? setTimeout(orbHome, 20_000) : null
  if (cardsReady) w.webContents.send('bauer:live', op)
  else liveQueue.push(op) // (sent once the page says it's ready)
  if (!w.isVisible()) w.showInactive()
}

/** Where the cards window is (for the arrow from the key bit on your screen). */
export function cardsBounds(): Electron.Rectangle | null {
  return cardsWin && !cardsWin.isDestroyed() && cardsWin.isVisible() ? cardsWin.getBounds() : null
}

/** Underline the key bit on your screen, with a tag and an arrow towards Nova's cards. */
export function showHighlight(rect: Electron.Rectangle, tag: string): void {
  if (suspended) return
  const display = screen.getDisplayMatching(rect)
  const b = display.bounds
  if (!pointWin || pointWin.isDestroyed()) {
    pointWin = overlayWindow(b, '#point')
    pointWin.setIgnoreMouseEvents(true)
    pointWin.on('closed', () => (pointWin = null))
  } else if (!OFFSCREEN) pointWin.setBounds(b)
  const arrowTo = null // (the cards float around the line now, with their own arrow to it)
  setSubject(rect)
  orbTo(besideRect(rect)) // the globe floats over to the line it's talking about
  const w = pointWin
  const send = (): void => {
    pointMsg(w, { rect: { x: rect.x - b.x, y: rect.y - b.y, width: rect.width, height: rect.height }, label: tag, step: '', highlight: true, arrowTo })
    w.showInactive()
  }
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', send)
  else send()
}

/** The opening paragraphs of the best Wikipedia article for a topic (free; only the topic is sent). */
export async function wikiIntro(topic: string): Promise<{ title: string; url: string; image: string | null; text: string } | null> {
  const q = topic.trim().slice(0, 120)
  if (!q) return null
  const search = await fetch(`https://en.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(q)}&limit=1`, { headers: UA })
  if (!search.ok) return null
  const page = ((await search.json()) as { pages?: { key: string; title: string }[] }).pages?.[0]
  if (!page) return null
  const api = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts%7Cpageimages&exintro=1&explaintext=1&redirects=1&pithumbsize=480&format=json&formatversion=2&titles=${encodeURIComponent(page.title)}`
  const res = await fetch(api, { headers: UA })
  if (!res.ok) return null
  const p = ((await res.json()) as { query?: { pages?: { title: string; extract?: string; thumbnail?: { source: string } }[] } }).query?.pages?.[0]
  if (!p?.extract) return null
  let image: string | null = null
  if (p.thumbnail?.source && /^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(p.thumbnail.source)) {
    const img = await fetch(p.thumbnail.source, { headers: UA }).catch(() => null)
    if (img?.ok) {
      const type = img.headers.get('content-type') || 'image/jpeg'
      if (/^image\/(png|jpeg|gif|webp)/.test(type)) image = `data:${type};base64,${Buffer.from(await img.arrayBuffer()).toString('base64')}`
    }
  }
  return { title: p.title, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`, image, text: p.extract.slice(0, 2400) }
}

// ---------- Wikipedia (for "explain …") ----------

const UA = { 'User-Agent': 'Studyhall/1.0 (desktop study app)', 'Api-User-Agent': 'Studyhall/1.0 (desktop study app)' }

export async function wikiSummary(topic: string): Promise<WikiSummary | null> {
  const q = topic.trim().slice(0, 120)
  if (!q) return null
  const search = await fetch(`https://en.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(q)}&limit=1`, { headers: UA })
  if (!search.ok) return null
  const page = ((await search.json()) as { pages?: { key: string }[] }).pages?.[0]
  if (!page) return null
  const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.key)}`, { headers: UA })
  if (!res.ok) return null
  const s = (await res.json()) as { title: string; extract: string; thumbnail?: { source: string }; content_urls?: { desktop?: { page?: string } } }
  let image: string | null = null
  if (s.thumbnail?.source && /^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(s.thumbnail.source)) {
    const img = await fetch(s.thumbnail.source, { headers: UA }).catch(() => null)
    if (img?.ok) {
      const type = img.headers.get('content-type') || 'image/jpeg'
      if (/^image\/(png|jpeg|gif|webp)/.test(type)) image = `data:${type};base64,${Buffer.from(await img.arrayBuffer()).toString('base64')}`
    }
  }
  return { title: s.title, extract: s.extract, image, url: s.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(page.key)}` }
}

// ---------- Apps Bauer may open ----------

const APPS: Record<string, { uri?: string; exe?: string }> = {
  spotify: { uri: 'spotify:' },
  calculator: { uri: 'calculator:' },
  notepad: { exe: 'notepad.exe' },
  'file explorer': { exe: 'explorer.exe' },
  explorer: { exe: 'explorer.exe' },
  files: { exe: 'explorer.exe' },
  settings: { uri: 'ms-settings:' },
  camera: { uri: 'microsoft.windows.camera:' },
  clock: { uri: 'ms-clock:' },
  calendar: { uri: 'outlookcal:' },
  mail: { uri: 'outlookmail:' },
  photos: { uri: 'ms-photos:' },
  'snipping tool': { uri: 'ms-screenclip:' }
}
export const APP_NAMES = Object.keys(APPS)

export async function openApp(name: string): Promise<boolean> {
  const a = APPS[name.trim().toLowerCase()]
  if (!a) return false
  if (a.uri) await shell.openExternal(a.uri)
  else if (a.exe) spawn(a.exe, [], { detached: true, stdio: 'ignore' }).unref()
  return true
}

// Automated tests only (hidden test copies can't move your mouse): reach the pen and the grab check directly.
if (OFFSCREEN) (globalThis as unknown as { __novaTest: unknown }).__novaTest = { setPen, penFeed, penButton, penUndo, penHooks, orb: () => orbWin }
