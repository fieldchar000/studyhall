// Main process: creates the window, owns the database, enforces security rules.

import { app, BrowserWindow, Menu, nativeTheme, protocol, session, shell } from 'electron'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { closeDb, openDb } from './db'
import { serveMaterial } from './files'
import { refreshSubscriptions } from './ics'
import { registerIpc } from './ipc'
import { loadWindowState, trackWindowState } from './windowState'

const DEV_URL = process.env['ELECTRON_RENDERER_URL'] // set by `npm run dev`

// Developer/testing aid: point the app at a throwaway data folder.
if (process.env['STUDYHALL_DATA_DIR']) app.setPath('userData', process.env['STUDYHALL_DATA_DIR'])
const APP_ORIGIN = 'app://studyhall'
const RENDERER_DIR = join(__dirname, '../renderer')
const ICS_REFRESH_MS = 30 * 60 * 1000

// Strict Content Security Policy for our own UI. Scripts only from the app itself;
// inline styles are needed by the calendar library; frames only for material previews.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: material:",
  "font-src 'self' data:",
  "connect-src 'self'",
  'frame-src material:',
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

function createWindow(): void {
  const state = loadWindowState()
  const win = new BrowserWindow({
    ...state.bounds,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Studyhall',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f1115' : '#f7f7f8',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, // UI can't touch preload/Electron internals
      nodeIntegration: false, // UI has no Node.js
      sandbox: true, // UI runs in Chromium's OS-level sandbox
      webSecurity: true,
      spellcheck: true
    }
  })
  mainWindow = win
  trackWindowState(win)
  win.once('ready-to-show', () => {
    if (state.maximized) win.maximize()
    win.show()
  })

  // Before closing, ask the UI to write any edits still waiting in a debounce timer,
  // then destroy the window (everything is saved, so no second close round-trip needed).
  let closing = false
  win.on('close', (e) => {
    e.preventDefault()
    if (closing) return
    closing = true
    const finish = (): void => {
      if (!win.isDestroyed()) win.destroy()
    }
    win.webContents.ipc.once('app:flushed', finish)
    win.webContents.send('app:flush-request')
    setTimeout(finish, 2000) // never hang if the UI doesn't answer
  })
  win.on('closed', () => (mainWindow = null))

  if (DEV_URL) win.loadURL(DEV_URL)
  else win.loadURL(`${APP_ORIGIN}/index.html`)
}

/** Lock down every window/frame: no navigation away, no popups, no webviews. */
function hardenContents(): void {
  app.on('web-contents-created', (_e, contents) => {
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
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    openDb()
    Menu.setApplicationMenu(null)
    hardenContents()

    protocol.handle('app', serveApp)
    protocol.handle('material', serveMaterial)

    // Deny camera/mic/location/etc. by default (video calls get their own window later).
    const allowed = new Set(['clipboard-sanitized-write', 'fullscreen'])
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)))
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission))

    // In dev the UI comes from Vite's server, so attach the CSP header there too.
    if (DEV_URL) {
      session.defaultSession.webRequest.onHeadersReceived({ urls: [`${DEV_URL}*`] }, (details, cb) => {
        cb({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [DEV_CSP] } })
      })
    }

    const notifyCalendar = (): void => mainWindow?.webContents.send('calendar:updated')
    registerIpc([APP_ORIGIN, ...(DEV_URL ? [DEV_URL] : [])], notifyCalendar)
    createWindow()

    // Refresh ICS feeds now and every 30 minutes (silently keeps cached data when offline).
    const refresh = (): void => void refreshSubscriptions().then(notifyCalendar)
    setTimeout(refresh, 3000)
    setInterval(refresh, ICS_REFRESH_MS)
  })

  app.on('window-all-closed', () => app.quit())
  app.on('will-quit', () => closeDb())
}
