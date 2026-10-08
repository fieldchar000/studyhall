// Main process: creates the window, owns the database, enforces security rules.

import { app, BrowserWindow, globalShortcut, Menu, nativeTheme, Notification, protocol, screen, session, shell } from 'electron'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { closeDb, getSetting, onDbChange, openDb, setSetting, setWriteGuard } from './db'
import { cloudStatus, currentUserId, onAccountChange, restoreSession } from './cloud/account'
import { describeMessage, guardWrite, publishPresence, startLive, stopLive } from './cloud/social'
import { configureSync, requestSync } from './cloud/sync'
import { closeAllVideoRooms, isVideoContents } from './video'
import { closeSpotifyPlayer, isSpotifyContents, openSpotifyPlayer } from './spotify'
import { initUpdater } from './updater'
import { SYNC_TABLES } from '@shared/sync'
import type { DeepLink } from '@shared/cloud'
import { serveMaterial } from './files'
import { refreshSubscriptions } from './ics'
import { currentSenderId, registerIpc } from './ipc'
import { applyLoginItem, getPrefs, watchShortcut } from './prefs'
import { checkDeadlines } from './reminders'
import * as timer from './timer'
import { createTray, updateTray } from './tray'
import { loadWindowState, trackWindowState } from './windowState'

const DEV_URL = process.env['ELECTRON_RENDERER_URL'] // set by `npm run dev`

// Developer/testing aid: point the app at a throwaway data folder.
if (process.env['STUDYHALL_DATA_DIR']) app.setPath('userData', process.env['STUDYHALL_DATA_DIR'])
const APP_ORIGIN = 'app://studyhall'
const RENDERER_DIR = join(__dirname, '../renderer')
const ICS_REFRESH_MS = 30 * 60 * 1000
// A real file on disk (not inside app.asar), so Windows notifications can use it too.
const ICON_PATH = app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(__dirname, '../../build/icon.png')
const START_HIDDEN = process.argv.includes('--hidden') // launched at login

// Strict Content Security Policy for our own UI. Scripts only from the app itself;
// inline styles are needed by the calendar library; frames only for material previews.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  // thumbnails from YouTube/Spotify
  "img-src 'self' data: material: https://i.ytimg.com https://*.scdn.co https://*.spotifycdn.com",
  "font-src 'self' data:",
  "connect-src 'self'",
  // course-file previews + the two embedded players
  'frame-src material: https://open.spotify.com https://www.youtube-nocookie.com',
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')
// Vite's dev server needs inline scripts + a websocket for hot reload (dev only).
const DEV_CSP = CSP.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'").replace(
  "connect-src 'self'",
  "connect-src 'self' ws://localhost:*"
)

// app:// serves the UI, material:// serves uploaded course files. Must run before "ready".
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: 'material', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript', // e.g. the pdf.js worker
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.json': 'application/json'
}

/** Serve the built UI from inside the app package (app://studyhall/...). */
async function serveApp(request: Request): Promise<Response> {
  let path = decodeURIComponent(new URL(request.url).pathname)
  if (path === '/' || path === '') path = '/index.html'
  const file = normalize(join(RENDERER_DIR, path))
  if (!file.startsWith(RENDERER_DIR)) return new Response('Forbidden', { status: 403 })
  try {
    const body = await readFile(file)
    const headers: Record<string, string> = { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }
    if (file.endsWith('.html')) headers['content-security-policy'] = CSP
    return new Response(body, { headers })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}

let mainWindow: BrowserWindow | null = null
let captureWindow: BrowserWindow | null = null

/** Send to every window (main app + quick capture). */
function broadcast(channel: string, ...args: unknown[]): void {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed() && !isVideoContents(w.webContents.session) && !isSpotifyContents(w.webContents.session)) w.webContents.send(channel, ...args)
}

// ---------- studyhall:// links (invites) ----------
let pendingLink: DeepLink | null = null
function handleDeepLink(argv: string[]): void {
  const url = argv.find((a) => a.toLowerCase().startsWith('studyhall://'))
  const m = url && /^studyhall:\/\/invite\/([A-Za-z0-9]{4,20})/i.exec(url)
  if (!m) return
  pendingLink = { kind: 'invite', code: m[1].toUpperCase() }
  deliverDeepLink()
}
function deliverDeepLink(): void {
  if (!pendingLink || !mainWindow || mainWindow.webContents.isLoading()) return
  showWindow()
  mainWindow.webContents.send('app:deeplink', pendingLink)
  pendingLink = null
}
let quitting = false // true once the user really wants to exit (tray "Quit", Windows shutdown)

const SECURE_PREFS = {
  preload: join(__dirname, '../preload/index.js'),
  contextIsolation: true, // UI can't touch preload/Electron internals
  nodeIntegration: false, // UI has no Node.js
  sandbox: true, // UI runs in Chromium's OS-level sandbox
  webSecurity: true,
  spellcheck: true
}

const appUrl = (hash = ''): string => (DEV_URL ? `${DEV_URL}${hash}` : `${APP_ORIGIN}/index.html${hash}`)

// ---------- Quick capture: a small always-on-top box opened by a global shortcut ----------

const CAPTURE_W = 620
const CAPTURE_H = 76

function showCapture(): void {
  const position = (): void => {
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
    captureWindow!.setPosition(Math.round(area.x + (area.width - CAPTURE_W) / 2), Math.round(area.y + area.height * 0.22))
    captureWindow!.show()
    captureWindow!.focus()
    captureWindow!.webContents.send('capture:show')
  }
  if (captureWindow && !captureWindow.isDestroyed()) return position()

  captureWindow = new BrowserWindow({
    width: CAPTURE_W,
    height: CAPTURE_H,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    title: 'Quick capture',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#171a20' : '#ffffff',
    webPreferences: SECURE_PREFS
  })
  captureWindow.on('blur', () => captureWindow?.hide()) // click elsewhere = dismiss
  captureWindow.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    captureWindow?.hide()
  })
  captureWindow.once('ready-to-show', position)
  captureWindow.loadURL(appUrl('#capture'))
}

let shortcut = { accelerator: '', registered: false }
function applyShortcut(accelerator: string): void {
  if (shortcut.accelerator) globalShortcut.unregister(shortcut.accelerator)
  let registered = false
  try {
    registered = accelerator ? globalShortcut.register(accelerator, showCapture) : false
  } catch {
    registered = false
  }
  shortcut = { accelerator, registered }
}

/** Bring the window back (from the tray, a notification, or a second launch). */
function showWindow(page?: string): void {
  if (!mainWindow) createWindow(true)
  const win = mainWindow!
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  if (page) win.webContents.send('app:navigate', page)
}

// Keep notification objects alive until they're dismissed, or click handlers get lost.
const liveNotifications = new Set<Notification>()
function notify(title: string, body: string, page?: string): void {
  if (!Notification.isSupported()) return
  const n = new Notification({ title, body, icon: ICON_PATH })
  liveNotifications.add(n)
  const forget = (): boolean => liveNotifications.delete(n)
  n.on('click', () => {
    forget()
    showWindow(page)
  })
  n.on('close', forget)
  n.show()
}

function createWindow(forceShow = false): void {
  const state = loadWindowState()
  const win = new BrowserWindow({
    ...state.bounds,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Studyhall',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f1115' : '#f7f7f8',
    webPreferences: SECURE_PREFS
  })
  mainWindow = win
  trackWindowState(win)
  win.once('ready-to-show', () => {
    if (START_HIDDEN && !forceShow) return // stay in the tray when started with Windows
    if (state.maximized) win.maximize()
    win.show()
  })

  // Closing the window normally just hides it to the tray (timer keeps running).
  // When really quitting: ask the UI to write any edits still waiting in a debounce
  // timer, then destroy the window (everything is saved, no second close round-trip).
  let closing = false
  win.on('close', (e) => {
    e.preventDefault()
    if (!quitting && getPrefs().closeToTray) {
      win.hide()
      if (!getSetting<boolean>('tray_hint_shown')) {
        setSetting('tray_hint_shown', true)
        notify('Studyhall is still running', 'It lives in the system tray (bottom-right). Right-click the icon to quit.')
      }
      return
    }
    if (closing) return
    closing = true
    const finish = (): void => {
      if (!win.isDestroyed()) win.destroy()
    }
    win.webContents.ipc.once('app:flushed', finish)
    win.webContents.send('app:flush-request')
    setTimeout(finish, 2000) // never hang if the UI doesn't answer
  })
  win.on('closed', () => {
    mainWindow = null
    captureWindow?.destroy() // so the app can exit once the main window is gone
  })
  // Windows is shutting down / logging off: really quit instead of hiding to the tray.
  win.on('session-end', () => (quitting = true))

  win.webContents.on('did-finish-load', deliverDeepLink)
  win.loadURL(appUrl())
}

/** Lock down every window/frame: no navigation away, no popups, no webviews. */
function hardenContents(): void {
  app.on('web-contents-created', (_e, contents) => {
    if (isVideoContents(contents.session) || isSpotifyContents(contents.session)) return // own rules
    contents.on('will-navigate', (e, url) => {
      if (!url.startsWith(APP_ORIGIN) && !(DEV_URL && url.startsWith(DEV_URL))) e.preventDefault()
    })
    contents.setWindowOpenHandler(({ url }) => {
      // Links to websites open in the user's normal browser.
      if (/^https?:\/\//i.test(url)) shell.openExternal(url)
      return { action: 'deny' }
    })
    contents.on('will-attach-webview', (e) => e.preventDefault())
  })
}

// Only one copy of the app may run (two would fight over the database).
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    showWindow()
    handleDeepLink(argv)
  })

  // Windows needs an app id for notifications (must match appId in electron-builder.yml).
  app.setAppUserModelId(app.isPackaged ? 'com.studyhall.app' : process.execPath)

  app.whenReady().then(() => {
    openDb()
    Menu.setApplicationMenu(null)
    hardenContents()
    applyLoginItem(getPrefs().launchAtLogin)

    protocol.handle('app', serveApp)
    protocol.handle('material', serveMaterial)

    // Deny camera/mic/location/etc. by default (video calls get their own window later).
    const allowed = new Set(['clipboard-sanitized-write', 'fullscreen'])
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)))
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission))

    // YouTube refuses to play embeds that don't say which app embeds them ("Error 153").
    // Apps without a website identify themselves with their app id as the Referer.
    session.defaultSession.webRequest.onBeforeSendHeaders(
      { urls: ['https://www.youtube-nocookie.com/*', 'https://www.youtube.com/*'] },
      (details, cb) => {
        const ref = details.requestHeaders['Referer'] ?? ''
        if (!ref || ref.startsWith('app://') || (DEV_URL && ref.startsWith(DEV_URL))) {
          details.requestHeaders['Referer'] = 'https://com.studyhall.app/'
        }
        cb({ requestHeaders: details.requestHeaders })
      }
    )

    // In dev the UI comes from Vite's server, so attach the CSP header there too.
    if (DEV_URL) {
      session.defaultSession.webRequest.onHeadersReceived({ urls: [`${DEV_URL}*`] }, (details, cb) => {
        cb({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [DEV_CSP] } })
      })
    }

    const notifyCalendar = (): void => mainWindow?.webContents.send('calendar:updated')
    registerIpc([APP_ORIGIN, ...(DEV_URL ? [DEV_URL] : [])], {
      onCalendarUpdated: notifyCalendar,
      hideCapture: () => captureWindow?.hide(),
      shortcutStatus: () => shortcut
    })
    // Tell every other window when data changes (e.g. quick capture -> inbox badge).
    onDbChange((table) => {
      // Local edit to a synced table: upload it shortly (when signed in).
      if (currentUserId() && (table === '*' || (SYNC_TABLES as readonly string[]).includes(table))) requestSync()
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed() && w.webContents.id !== currentSenderId) w.webContents.send('db:changed', table)
      }
    })
    // Cloud: guard shared rows, sync status to the UI, live updates while signed in.
    setWriteGuard(guardWrite)
    configureSync({
      onStatus: () => broadcast('cloud:status', cloudStatus()),
      onApplied: (tables) => tables.forEach((t) => broadcast('db:changed', t))
    })
    onAccountChange(() => {
      broadcast('cloud:status', cloudStatus())
      broadcast('db:changed', '*')
      if (currentUserId())
        startLive((table, payload) => {
          broadcast('cloud:event', table)
          // New chat message while Studyhall isn't in front: desktop notification.
          if (table === 'messages' && payload.eventType === 'INSERT' && getPrefs().notifyMessages && !mainWindow?.isFocused()) {
            void describeMessage(payload.new).then((m) => m && notify(m.title, m.body, 'servers')).catch(() => {})
          }
        })
      else stopLive()
    })
    void restoreSession()

    // Auto-update (installed app only). Tell the UI so it can offer "Restart to update".
    initUpdater((s) => {
      broadcast('app:update', s)
      if (s.status === 'ready') notify('Studyhall update ready', `Version ${s.version} will install when you restart Studyhall.`)
    })

    // studyhall:// links open the app (registered per-user; the installer registers it too).
    // (Only the installed app registers, so test builds never take over your links.)
    if (app.isPackaged) app.setAsDefaultProtocolClient('studyhall')
    handleDeepLink(process.argv)

    createWindow()
    applyShortcut(getPrefs().quickCaptureShortcut)
    watchShortcut(applyShortcut)

    // Tray + focus timer. The timer pushes its state to the UI and the tray.
    createTray(ICON_PATH, {
      show: () => showWindow(),
      openFocus: () => showWindow('focus'),
      openSpotify: () => void openSpotifyPlayer(),
      toggleTimer: () => (timer.getState().running ? timer.pause() : timer.start()),
      skip: () => timer.skip(),
      quit: () => app.quit()
    })
    timer.initTimer(
      (state, remaining, changed) => {
        updateTray(state, remaining)
        if (changed) {
          mainWindow?.webContents.send('timer:state', state)
          void publishPresence() // friends see "focusing" straight away
        }
      },
      (title, body) => {
        if (getPrefs().notifyTimer) notify(title, body, 'focus')
      }
    )
    updateTray(timer.getState(), timer.remainingMs())

    // Refresh ICS feeds now and every 30 minutes (silently keeps cached data when offline).
    const refresh = (): void => void refreshSubscriptions().then(notifyCalendar)
    setTimeout(refresh, 3000)
    setInterval(refresh, ICS_REFRESH_MS)

    // Deadline reminders: shortly after start, then every minute.
    const remind = (): void => checkDeadlines((title, body) => notify(title, body, 'home'))
    setTimeout(remind, 10_000)
    setInterval(remind, 60_000)
  })

  app.on('before-quit', () => (quitting = true))
  app.on('window-all-closed', () => app.quit())
  app.on('will-quit', () => {
    closeAllVideoRooms()
    closeSpotifyPlayer()
    globalShortcut.unregisterAll()
    closeDb()
  })
}
