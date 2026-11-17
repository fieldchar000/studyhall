// Bauer on the PC screen, outside Studyhall:
//  • the floating Bauer: a small glowing orb at the edge of the screen (click to talk)
//  • cards: explanations and answers pinned beside whatever you're working on
//  • circle-to-ask: freeze the screen, circle something, ask about it (Ctrl+Alt+B)
// All three are transparent, always-on-top windows that let clicks through except where they draw.

import { BrowserWindow, desktopCapturer, globalShortcut, ipcMain, nativeImage, screen, shell } from 'electron'
import { spawn } from 'node:child_process'
import type { BauerCard, OrbState, WikiSummary } from '@shared/types'
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

const ORB_W = 380
const ORB_H = 300
const CARDS_W = 400

export function configureBauer(opts: { url: (hash: string) => string; webPreferences: Electron.WebPreferences; startBrief: () => void }): void {
  loadUrl = opts.url
  webPrefs = opts.webPreferences
  startBrief = opts.startBrief
  ipcMain.on('bauer:window', (e, msg) => {
    if (!msg || typeof msg !== 'object') return
    const from = BrowserWindow.fromWebContents(e.sender)
    if (msg.type === 'ready' && from === cardsWin) cardsWin?.webContents.send('bauer:cards', cards)
    else if (msg.type === 'mouse' && from && (from === orbWin || from === cardsWin)) from.setIgnoreMouseEvents(!msg.over, { forward: true })
    else if (msg.type === 'orb') sendOrb(String(msg.state) as OrbState, typeof msg.text === 'string' ? msg.text : undefined)
    // Loudness for the orb's ripples: Nova's voice (a list, every 40 ms) or your microphone (one number).
    else if (msg.type === 'voice' && Array.isArray(msg.env)) orbWin?.webContents.send('bauer:levels', { kind: 'voice', env: msg.env.slice(0, 3000).map((v: unknown) => Math.max(0, Math.min(1, Number(v) || 0))) })
    else if (msg.type === 'mic') orbWin?.webContents.send('bauer:levels', { kind: 'mic', v: Math.max(0, Math.min(1, Number(msg.v) || 0)) })
    else if (msg.type === 'closeCircle' && from === circleWin) closeCircle()
    else if (msg.type === 'listen' && from === orbWin) startBrief()
    else if (msg.type === 'hideOrb' && from === orbWin) orbWin?.hide()
    else if (msg.type === 'ready' && from === orbWin) sendOrbConfig()
    else if (from === orbWin && orbWin && (msg.type === 'dragStart' || msg.type === 'dragMove' || msg.type === 'dragEnd')) dragOrb(msg.type, Number(msg.x), Number(msg.y))
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
  followCursor()
}

// ---------- Size, drift, following the cursor ----------

type OrbSize = 'small' | 'default' | 'cursor'
const orbSize = (): OrbSize => (['small', 'default', 'cursor'].includes(String(getPrefs().novaOrbSize)) ? (getPrefs().novaOrbSize as OrbSize) : 'default')
const ORB_PX: Record<OrbSize, number> = { small: 52, default: 76, cursor: 40 }
function sendOrbConfig(): void {
  const size = orbSize()
  orbWin?.webContents.send('bauer:orbConfig', { px: ORB_PX[size], follow: size === 'cursor', drift: getPrefs().novaDrift !== false })
  if (orbWin && !orbWin.isDestroyed()) orbWin.setIgnoreMouseEvents(true, { forward: size !== 'cursor' })
  followCursor()
}
let followTimer: NodeJS.Timeout | null = null
/** In "follows my cursor" mode Nova rides just below-right of the mouse (and never catches clicks). */
function followCursor(): void {
  const on = orbSize() === 'cursor' && !!orbWin && !orbWin.isDestroyed() && orbWin.isVisible() && !suspended && !OFFSCREEN
  if (!on) {
    if (followTimer) {
      clearInterval(followTimer)
      followTimer = null
      // Back to where you left Nova.
      const saved = getSetting<{ x: number; y: number }>('bauer_orb_pos')
      if (orbWin && !orbWin.isDestroyed()) {
        const wa = screen.getPrimaryDisplay().workArea
        const pos = saved && onSomeScreen(saved.x, saved.y) ? saved : { x: wa.x + wa.width - ORB_W - 8, y: wa.y + wa.height - ORB_H - 8 }
        orbWin.setPosition(pos.x, pos.y)
      }
    }
    return
  }
  if (followTimer) return
  let last = ''
  followTimer = setInterval(() => {
    if (!orbWin || orbWin.isDestroyed() || !orbWin.isVisible()) return followCursor()
    const p = screen.getCursorScreenPoint()
    const px = ORB_PX.cursor
    // The orb sits at the window's bottom-right corner (12 px padding).
    const x = Math.round(p.x + 22 + px / 2 + 12 - ORB_W + px / 2)
    const y = Math.round(p.y + 22 + px / 2 + 12 - ORB_H + px / 2)
    const key = `${x},${y}`
    if (key !== last) orbWin.setPosition(x, y)
    last = key
  }, 30)
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

// ---------- The floating Bauer ----------

/** Show or hide the orb to match Settings. */
export function syncOrb(force = false): void {
  const on = (force || getPrefs().bauerOrb !== false) && !suspended
  if (!on) {
    orbWin?.hide()
    followCursor()
    return
  }
  if (!orbWin || orbWin.isDestroyed()) {
    const wa = screen.getPrimaryDisplay().workArea
    const saved = getSetting<{ x: number; y: number }>('bauer_orb_pos')
    const pos = saved && onSomeScreen(saved.x, saved.y) ? saved : { x: wa.x + wa.width - ORB_W - 8, y: wa.y + wa.height - ORB_H - 8 }
    orbWin = overlayWindow({ ...pos, width: ORB_W, height: ORB_H }, '#orb')
    orbWin.setIgnoreMouseEvents(true, { forward: true })
    orbWin.on('closed', () => (orbWin = null))
    orbWin.once('ready-to-show', () => {
      orbWin?.showInactive()
      followCursor()
    })
  } else {
    if (!orbWin.isVisible()) orbWin.showInactive()
    sendOrbConfig()
  }
}

/** Is the orb (bottom-right of its window) on a screen if the window sits at x, y? */
function onSomeScreen(x: number, y: number): boolean {
  const orb = { x: x + ORB_W - 40, y: y + ORB_H - 40 }
  return screen.getAllDisplays().some((d) => orb.x >= d.workArea.x - 10 && orb.x <= d.workArea.x + d.workArea.width - 30 && orb.y >= d.workArea.y - 10 && orb.y <= d.workArea.y + d.workArea.height - 30)
}

// Dragging the orb: the window follows the mouse, then stays where you leave it (remembered).
let drag: { wx: number; wy: number; sx: number; sy: number } | null = null
function dragOrb(type: string, x: number, y: number): void {
  if (!orbWin || !Number.isFinite(x) || !Number.isFinite(y)) return
  if (type === 'dragStart') {
    const [wx, wy] = orbWin.getPosition()
    drag = { wx, wy, sx: x, sy: y }
  } else if (type === 'dragMove' && drag) {
    orbWin.setPosition(Math.round(drag.wx + x - drag.sx), Math.round(drag.wy + y - drag.sy))
  } else if (type === 'dragEnd' && drag) {
    drag = null
    let [wx, wy] = orbWin.getPosition()
    if (!onSomeScreen(wx, wy)) {
      // Dropped off the edge: bring him back inside the nearest screen.
      const wa = screen.getDisplayNearestPoint({ x: wx + ORB_W - 30, y: wy + ORB_H - 30 }).workArea
      wx = Math.min(Math.max(wx, wa.x - ORB_W + 60), wa.x + wa.width - ORB_W - 8)
      wy = Math.min(Math.max(wy, wa.y - ORB_H + 60), wa.y + wa.height - ORB_H - 8)
      orbWin.setPosition(wx, wy)
    }
    setSetting('bauer_orb_pos', { x: wx, y: wy })
  }
}

/** What Bauer is doing, for the orb (listening, thinking, a short line of what he did). */
export function sendOrb(state: OrbState, text?: string): void {
  orbWin?.webContents.send('bauer:orb', { state, text })
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

/** Show the pointer around a screen area (DIP). It never catches clicks and never shows in screenshots. */
export function showPointer(rect: Electron.Rectangle, label: string, step: string): void {
  if (suspended) return
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
  if (!pointWin || pointWin.isDestroyed()) return
  pointWin.webContents.send('bauer:point', null)
  pointWin.hide()
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
