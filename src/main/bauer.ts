// Bauer on the PC screen, outside Studyhall:
//  • the floating Bauer: a small glowing orb at the edge of the screen (click to talk)
//  • cards: explanations and answers pinned beside whatever you're working on
//  • circle-to-ask: freeze the screen, circle something, ask about it (Ctrl+Alt+B)
// All three are transparent, always-on-top windows that let clicks through except where they draw.

import { BrowserWindow, desktopCapturer, globalShortcut, ipcMain, nativeImage, screen, shell } from 'electron'
import { spawn } from 'node:child_process'
import type { BauerCard, LiveOp, OrbState, WikiSummary } from '@shared/types'
import { getPrefs } from './prefs'
import { getSetting, setSetting } from './db'

let loadUrl: (hash: string) => string = (h) => h
let webPrefs: Electron.WebPreferences = {}
let orbWin: BrowserWindow | null = null
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
/** Automated tests: windows live far off-screen, nothing is captured, nothing takes focus. */
const OFFSCREEN = process.env.STUDYHALL_OFFSCREEN === '1'

const CARDS_W = 320

export function configureBauer(opts: { url: (hash: string) => string; webPreferences: Electron.WebPreferences; startBrief: () => void }): void {
  loadUrl = opts.url
  webPrefs = opts.webPreferences
  startBrief = opts.startBrief
  ipcMain.on('bauer:window', (e, msg) => {
    if (!msg || typeof msg !== 'object') return
    const from = BrowserWindow.fromWebContents(e.sender)
    if (msg.type === 'ready' && from === cardsWin) cardsWin?.webContents.send('bauer:cards', cards)
    // The cards window is only as tall as what's in it (never a full-height strip down your screen).
    else if (msg.type === 'cardsHeight' && from === cardsWin && cardsWin && !OFFSCREEN) {
      const b = cardsWin.getBounds()
      const wa = screen.getDisplayMatching(b).workArea
      const h = Math.max(80, Math.min(wa.height - 24, Math.round(Number(msg.h) || 0) + 8))
      if (Math.abs(h - b.height) > 2) cardsWin.setBounds({ ...b, height: h })
    }
    else if (msg.type === 'mouse' && from && (from === orbWin || from === cardsWin)) from.setIgnoreMouseEvents(!msg.over, { forward: true })
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
  if (on && !globalShortcut.isRegistered(CIRCLE_SHORTCUT)) globalShortcut.register(CIRCLE_SHORTCUT, () => void startCircle())
  else if (!on && globalShortcut.isRegistered(CIRCLE_SHORTCUT)) globalShortcut.unregister(CIRCLE_SHORTCUT)
  if (on && !globalShortcut.isRegistered(ORB_SHORTCUT)) globalShortcut.register(ORB_SHORTCUT, toggleOrb)
  else if (!on && globalShortcut.isRegistered(ORB_SHORTCUT)) globalShortcut.unregister(ORB_SHORTCUT)
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
  orbWin.webContents.send('bauer:orbConfig', { size: orbSize(), roam: getPrefs().novaDrift !== false, home: homeHere })
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

/** A little performance from the globe (Nova's emote tags): wave, hype, remind, upset, motivate. */
export function orbEmote(e: string): void {
  if (['wave', 'hype', 'remind', 'upset', 'motivate'].includes(e)) orbWin?.webContents.send('bauer:emote', e)
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
    webPreferences: { ...webPrefs, backgroundThrottling: false, spellcheck: false }
  })
  w.setAlwaysOnTop(true, 'screen-saver')
  w.setContentProtection(true) // Nova never shows up in screenshots or recordings (or in its own circle-to-ask)
  w.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    w.hide()
  })
  w.loadURL(loadUrl(hash))
  return w
}

// ---------- Cards ----------

function ensureCards(): BrowserWindow {
  if (cardsWin && !cardsWin.isDestroyed()) return cardsWin
  const wa = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
  cardsWin = overlayWindow({ x: wa.x + wa.width - CARDS_W - 12, y: wa.y + 12, width: CARDS_W, height: wa.height - 24 }, '#cards')
  cardsWin.setIgnoreMouseEvents(true, { forward: true })
  cardsWin.on('closed', () => (cardsWin = null))
  return cardsWin
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

/** Show the pointer around a screen area (DIP). It never catches clicks and never shows in screenshots. */
export function showPointer(rect: Electron.Rectangle, label: string, step: string): void {
  if (suspended) return
  // The orb comes over to just right of (or below) the control, like a cursor pointing at it.
  const d = screen.getDisplayMatching(rect).workArea
  const right = rect.x + rect.width + 70 < d.x + d.width
  orbTo(right ? { x: rect.x + rect.width + 46, y: rect.y + rect.height / 2 + 20 } : { x: rect.x + rect.width / 2, y: rect.y + rect.height + 70 })
  const display = screen.getDisplayMatching(rect)
  const b = display.bounds
  if (!pointWin || pointWin.isDestroyed()) {
    pointWin = overlayWindow(b, '#point')
    pointWin.setIgnoreMouseEvents(true)
    pointWin.on('closed', () => (pointWin = null))
  } else if (!OFFSCREEN) pointWin.setBounds(b)
  const w = pointWin
  const send = (): void => {
    w.webContents.send('bauer:point', { rect: { x: rect.x - b.x, y: rect.y - b.y, width: rect.width, height: rect.height }, label, step })
    w.showInactive()
  }
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', send)
  else send()
}

export function hidePointer(): void {
  orbHome()
  if (!pointWin || pointWin.isDestroyed()) return
  pointWin.webContents.send('bauer:point', null)
  pointWin.hide()
}

// ---------- Live lessons: cards appear step by step (and a brief source page beside them) ----------

const LIVE_W = 610 // two columns: the source page and the cards

/** Send one step of a live lesson to the cards window (opening it, two columns wide when there's a source page). */
export function liveCards(op: LiveOp): void {
  if (suspended) return
  const w = ensureCards()
  if (op.op === 'start' && !OFFSCREEN) {
    const wa = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
    const width = op.source ? LIVE_W : CARDS_W
    w.setBounds({ x: wa.x + wa.width - width - 12, y: wa.y + 12, width, height: wa.height - 24 })
  }
  if (op.op === 'start') cards = []
  const send = (): void => {
    w.webContents.send('bauer:live', op)
    if (!w.isVisible()) w.showInactive()
  }
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', send)
  else send()
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
  const cb = cardsBounds()
  const arrowTo = cb ? { x: cb.x - b.x, y: Math.min(cb.y + 120, cb.y + cb.height / 2) - b.y } : null
  const w = pointWin
  const send = (): void => {
    w.webContents.send('bauer:point', { rect: { x: rect.x - b.x, y: rect.y - b.y, width: rect.width, height: rect.height }, label: tag, step: '', highlight: true, arrowTo })
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
