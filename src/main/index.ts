// Main process: creates the window, owns the database, enforces security rules.

import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeTheme, Notification, protocol, screen, session, shell } from 'electron'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { closeDb, getSetting, onDbChange, openDb, setSetting, setWriteGuard } from './db'
import { cloudStatus, currentUserId, onAccountChange, restoreSession } from './cloud/account'
import { describeMessage, guardWrite, publishPresence, startLive, stopLive } from './cloud/social'
import { configureSync, requestSync } from './cloud/sync'
import { closeAllVideoRooms, isVideoContents } from './video'
import { closeSpotifyPlayer, isSpotifyContents, openSpotifyPlayer } from './spotify'
import { initUpdater } from './updater'
import { initOculus, isOculusContents, stopOculus } from './oculus'
import { applyLanShare, stopLanShare } from './lanshare'
import { startFeedRefresh } from './feeds'
import { SYNC_TABLES } from '@shared/sync'
import type { DeepLink } from '@shared/cloud'
import { serveMaterial } from './files'
import { refreshSubscriptions } from './ics'
import { currentSenderId, registerIpc } from './ipc'
import { applyLoginItem, getPrefs, watchShortcut } from './prefs'
import { checkDeadlines, checkDueNow } from './reminders'
import { buddyHooks, focusState, lastOffered, startBuddy } from './buddy'
import { checkLifeReminders } from './lifeReminders'
import * as timer from './timer'
import { createTray, updateTray } from './tray'
import { loadWindowState, trackWindowState } from './windowState'
import { aiChat, aiStatus, configureAi, downloadAi, downloadEyes, removeAi, removeEyes, stopAi, warmAi } from './ai'
import { configureMouth, installMouth, mouthStatus, removeMouth, speakMouth, warmMouth } from './mouth'
import { configureEars, earsStatus, feedEars, installEars, removeEars, transcribeEars } from './ears'
import { claudeBlocked, claudeChat, claudeStatus, draftWithConnectors, installClaude, listConnectors, refreshClaudeUsage, removeClaude, setClaudeWarm, signInClaude, signOutClaude } from './claude'
import type { AiMessage, AiPurpose } from '@shared/types'

/** Nova's brain: Claude when it's connected and allowed, otherwise the model on this PC (if you allow that). */
/** The answer shape each kind of request last used, so a session can be started for the next one in advance. */
const lastSchema = new Map<AiPurpose, object | undefined>()
async function brainChat(messages: AiMessage[], schema: object | undefined, maxTokens: number | undefined, purpose: AiPurpose): Promise<string> {
  const prefs = getPrefs()
  lastSchema.set(purpose, schema)
  const why = claudeBlocked(prefs)
  if (!why) {
    try {
      return await claudeChat(messages, schema, prefs, purpose)
    } catch (e) {
      console.warn('Nova: Claude couldn’t answer', e)
      if (prefs.novaOffline === false) throw e
    }
  } else if (why !== 'not connected' && prefs.novaOffline === false) throw new Error(`Nova is paused because ${why}.`)
  return aiChat(messages, schema, maxTokens)
}
import { clearCards, closeBauerWindows, configureBauer, openApp, sendOrb, setBauerSuspended, showCards, startCircle, syncOrb, takeShot, wikiSummary , showPointer, hidePointer , liveCards, showHighlight, wikiIntro, orbAgent, orbEmote, emoteHooks, hiddenFromCaptures, novaInRecordings, orbPress, orbPressHooks, penButton, penHooks, shortcutHooks, penMode, penUndo, setPen } from './bauer'
import { hidePoliteView, politeAction, politeBack, politeGo, politePageData, showPoliteView, type PoliteRect } from './politePage'
import { isPoliteContents, openPoliteMall, politeHooks, schoolStatus, signOutSchool, startSchool, syncSchool } from './politemall'
import { conversationLine, convHooks, setConversation, toggleConversation } from './conversation'
import { restoreAfterLesson } from './windowSplit'
import { picture, warmLesson } from './lessonReader'
import { configureLessonWindow } from './lessonWindow'
import { registerLessonsIpc } from './lessonsIpc'
import { replayOrb } from './lessonReplay'
import { setTutor, tutorOn, lessonRecording, listLessons, openLesson, serveLesson, showLessonsFolder, toggleTutor, tutorHooks } from './tutor'
import { reportClicks, voiceAsk, voiceConversation, voiceRecord } from './voice'
import { askBeside, reportPen, startKeys, stopKeys, talkKeyHooks, voiceHush, voiceAnswer, voiceConfirm, voiceSaid, voiceSay, voiceSayAndWait } from './voice'
import { stopTeach, teach, teachHooks } from './teach'
import { doOnScreen, handsHooks, stopHands } from './hands'
import { eyes, eyesHooks, helpOnScreen, pointerHooks, see, stopEyes, stopWalkthrough } from './eyes'
import { forgetNovaFactById, listNovaFacts } from './novaMemory'
import { addPromise, changePromise, listPromises, roamies, roamiesAbort, roamiesClick, roamiesEsc, testWindowShot, clearLessonInk } from './roamiesTools'
import { factsBlock, frontWindow, noteCircle, novaToolResult, novaTurn, noteReminder, resetNova, setNovaAllowed, warmNova, teachingNow, calmVoice } from './novaBrain'
import { closeVoice, configureVoice, downloadVoice, isVoiceContents, serveVoiceModel, setVoiceSuspended, startBrief, syncVoiceWindow, voiceFromWindow, voiceStatus } from './voice'

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
  // recorded tutor lessons, played in Studyhall
  "media-src 'self' material: blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')
// The Bauer panel runs the offline speech engines (WebAssembly in workers), so its page
// may also compile WebAssembly and start workers from blobs. It's cross-origin isolated
// (COOP/COEP) so speech recognition can use several CPU threads.
const VOICE_CSP = CSP.replace("script-src 'self'", "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' blob:")
  .replace("connect-src 'self'", "connect-src 'self' data: blob:; worker-src 'self' blob:; media-src 'self' blob:")
const VOICE_HEADERS = { 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' }
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
  const url = new URL(request.url)
  let path = decodeURIComponent(url.pathname)
  if (path.startsWith('/voice-models/')) return serveVoiceModel(url.pathname.slice('/voice-models/'.length))
  if (path === '/' || path === '') path = '/index.html'
  const file = normalize(join(RENDERER_DIR, path))
  if (!file.startsWith(RENDERER_DIR)) return new Response('Forbidden', { status: 403 })
  try {
    const body = await readFile(file)
    const headers: Record<string, string> = { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }
    if (file.endsWith('.html')) {
      if (url.searchParams.has('voice')) Object.assign(headers, VOICE_HEADERS, { 'content-security-policy': VOICE_CSP })
      else headers['content-security-policy'] = CSP
    } else Object.assign(headers, { 'cross-origin-resource-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' }) // (workers started from these files need it too)
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
  if (!Notification.isSupported() || process.env.STUDYHALL_OFFSCREEN === '1') return // (tests stay silent)
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

/** "Bauer only while Studyhall is open": when the window is closed to the tray, Bauer stops
 *  listening, leaves the screen and the AI shuts down; opening Studyhall brings him back. */
let novaAway = false // Nova is off the screen (Studyhall closed to the tray)
function bauerAway(away: boolean): void {
  const off = away && getPrefs().bauerOnlyWhenOpen !== false
  novaAway = off
  setVoiceSuspended(off)
  setBauerSuspended(off)
  setClaudeWarm(!off) // no Claude sessions waiting while Studyhall is closed
  setNovaAllowed(!off)
  if (off) {
    stopTeach()
    stopHands()
    stopEyes()
  }
  if (off) stopAi()
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
  win.on('hide', () => bauerAway(true))
  win.on('show', () => bauerAway(false))
  win.once('ready-to-show', () => {
    if (START_HIDDEN && !forceShow) return // stay in the tray when started with Windows
    // Automated tests: render far off-screen without taking focus, so nothing appears for the user.
    if (process.env.STUDYHALL_OFFSCREEN === '1') {
      win.setPosition(-30000, -30000)
      win.setSkipTaskbar(true)
      win.showInactive()
      return
    }
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
    closeVoice()
    closeBauerWindows()
  })
  // Windows is shutting down / logging off: really quit instead of hiding to the tray.
  win.on('session-end', () => (quitting = true))

  win.webContents.on('did-finish-load', deliverDeepLink)
  win.loadURL(appUrl())
}

/** Lock down every window/frame: no navigation away, no popups, no webviews. */
function hardenContents(): void {
  app.on('web-contents-created', (_e, contents) => {
    if (isVideoContents(contents.session) || isSpotifyContents(contents.session) || isOculusContents(contents.session) || isPoliteContents(contents.session)) return // own rules
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
// Automated tests keep windows far off-screen; stop Windows counting them as hidden (or the live sky pauses).
if (process.env.STUDYHALL_OFFSCREEN === '1') app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')

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
    protocol.handle('material', (r) => {
      const host = new URL(r.url).host
      if (host === 'lesson') return serveLesson(r)
      // A slide or page of the deck being taught (tutor mode's lesson window): material://slide/<lesson>/<n>.jpg
      if (host === 'slide') {
        const m = /^\/([0-9a-f]{12})\/(\d+)\.jpg$/.exec(new URL(r.url).pathname)
        return (m ? picture(m[1], Number(m[2])).catch(() => null) : Promise.resolve(null)).then((buf) => (buf ? new Response(new Uint8Array(buf), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'max-age=3600' } }) : new Response('not found', { status: 404 })))
      }
      return serveMaterial(r)
    })

    // Deny camera/mic/location/etc. by default (video calls get their own window later).
    const allowed = new Set(['clipboard-sanitized-write', 'fullscreen'])
    // The one exception: the Bauer panel may use the microphone (sound only).
    session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) => {
      if (permission === 'media' && wc && isVoiceContents(wc)) {
        const types = (details as { mediaTypes?: string[] }).mediaTypes ?? []
        // Sound only, except while a tutor lesson is being recorded (the screen, see tutor.ts).
        return cb(types.length > 0 && types.every((t) => t === 'audio' || (t === 'video' && lessonRecording())))
      }
      cb(allowed.has(permission))
    })
    session.defaultSession.setPermissionCheckHandler((wc, permission) => allowed.has(permission) || (permission === 'media' && !!wc && isVoiceContents(wc)))

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
        const voice = details.url.includes('?voice')
        const csp = voice ? VOICE_CSP.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'").replace("connect-src 'self'", "connect-src 'self' ws://localhost:*") : DEV_CSP
        cb({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp], ...(voice ? Object.fromEntries(Object.entries(VOICE_HEADERS).map(([k, v]) => [k, [v]])) : {}) } })
      })
    }

    const notifyCalendar = (): void => mainWindow?.webContents.send('calendar:updated')
    registerIpc([APP_ORIGIN, ...(DEV_URL ? [DEV_URL] : [])], {
      onCalendarUpdated: notifyCalendar,
      hideCapture: () => captureWindow?.hide(),
      shortcutStatus: () => shortcut,
      extra: (handle) => {
        handle('voice:status', () => voiceStatus())
        handle('voice:download', () => downloadVoice())
        handle('voice:brief', () => startBrief())
        handle('ai:status', () => aiStatus())
        handle('ai:download', () => downloadAi())
        handle('ai:remove', () => removeAi())
        // Nova started listening: get its brain ready while you talk.
        handle('ai:warm', async (e) => {
          const p = getPrefs()
          // With Claude: Nova's conversation gets ready while you talk (one call answers everything).
          if (!claudeBlocked(p)) warmNova(e.sender)
          else await warmAi()
        })
        // Nova's conversation: one request, its speech streamed back to the window that asked.
        // Claude paused: the eyes on this PC (a small vision model) look at the window in front and talk you through it.
        handle('nova:offlineExplain', async (_e, said: string) => {
          if (!(await aiStatus()).eyes) return null
          const test = process.env.STUDYHALL_OFFSCREEN === '1' ? await testWindowShot() : null
          const seen = test ? { image: `data:image/jpeg;base64,${test.data}` } : await see({ screenshot: true }).catch(() => null)
          if (!seen?.image) return null
          const answer = await aiChat(
            [
              { role: 'system', content: 'You are Nova, a friendly study tutor talking out loud. You can see the window the student has in front of them (a lecture slide, a page, a diagram). Explain what it shows like a tutor sitting next to them: 3 to 6 short spoken sentences, plain words, the main idea first, then what each part means and how they connect, then one tip to remember it. Only use what you can see; if something is unreadable, say so. No markdown, no lists, no preamble like "This image shows".' },
              { role: 'user', content: [{ type: 'image_url', image_url: { url: seen.image } }, { type: 'text', text: `They asked: "${String(said).slice(0, 300)}"` }] }
            ],
            undefined,
            700
          ).catch(() => '')
          return answer.trim() || null
        })
        // A reminder said plainly ("remind me at 5 to call mum"), saved on Nova's own list without asking Claude.
        handle('nova:remember', async (_e, text: string, due: string) => {
          const r = await roamies()
          const t = r.tools.find((x: { name: string }) => x.name === 'remember_commitment')
          return t ? String(await t.execute({ text: String(text).slice(0, 200), due: String(due), kind: 'reminder' }, {})) : null
        })
        handle('nova:turn', async (e, said: string, studyhall: string) => {
          if (penMode() === 'marks') setPen(null) // (your marks go with this question)
          const p = getPrefs()
          const now = new Date()
          // The window in front and the memory part, read at the same time.
          const [front, facts] = await Promise.all([frontWindow(), factsBlock(String(said ?? ''))])
          const live = [
            '<live-state>',
            `Now: ${now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`,
            `Window in front: ${front}`,
            `Allowed: looking at the screen ${p.novaEyes === 'off' ? 'off' : 'on'}; working their apps ${p.novaHands ?? 'off'}; drafting with connectors ${p.novaConnectors ? 'on' : 'off'}`,
            String(studyhall ?? '').slice(0, 12_000),
            facts,
            focusState(),
            lastOffered(),
            conversationLine(),
            '</live-state>'
          ].join('\n')
          return novaTurn(e.sender, String(said ?? '').slice(0, 4000), live)
        })
        handle('nova:warm', (e) => warmNova(e.sender))
        handle('nova:reset', () => resetNova())
        handle('nova:facts', () => listNovaFacts())
        handle('nova:lessons', () => listLessons())
        // PoliteMall (politemall.ts): you sign in yourself in its window; Studyhall reads it, never posts.
        handle('polite:status', () => schoolStatus())
        handle('polite:open', () => openPoliteMall())
        handle('polite:sync', () => syncSchool())
        handle('polite:signOut', () => signOutSchool())
        // The PoliteMall page (politePage.ts): Brightspace shown inside it, and what Studyhall read beside it.
        handle('polite:page', () => politePageData())
        handle('polite:show', (e, rect: PoliteRect) => {
          const w = BrowserWindow.fromWebContents(e.sender)
          if (w && rect && [rect.x, rect.y, rect.width, rect.height].every((v) => Number.isFinite(Number(v)))) showPoliteView(w, rect)
        })
        handle('polite:hide', () => hidePoliteView())
        handle('polite:go', (_e, url: string) => politeGo(String(url)))
        handle('polite:back', () => politeBack())
        handle('polite:action', (_e, a: { kind: string; courseId: number; topicId?: number; id?: number; name?: string; due?: string }) => politeAction(a))
        politeHooks.changed = () => mainWindow?.webContents.send('polite:changed', schoolStatus())
        handle('nova:openLesson', (_e, path: string) => openLesson(String(path)))
        handle('nova:lessonsFolder', () => showLessonsFolder())
        handle('nova:tutor', (_e, on: boolean) => setTutor(!!on))
        handle('nova:conversation', (_e, on: boolean) => setConversation(!!on))
        handle('nova:promises', () => listPromises())
        handle('nova:promise', (_e, id: string, op: string, value: unknown) => (['done', 'open', 'drop', 'snooze', 'due', 'text'].includes(op) ? changePromise(String(id), op as 'done', value as string) : false))
        handle('nova:addPromise', (_e, text: string, due: string | null) => addPromise(String(text ?? ''), due ? String(due) : null))
        handle('nova:forgetFact', (_e, id: string) => forgetNovaFactById(String(id)))
        handle('ai:chat', (_e, messages, schema, maxTokens, purpose) =>
          brainChat(messages, schema, typeof maxTokens === 'number' ? maxTokens : undefined, ['act', 'chat', 'explain', 'look'].includes(purpose) ? purpose : 'act')
        )
        handle('ears:status', () => earsStatus())
        handle('ears:install', async () => {
          const s = await installEars()
          syncVoiceWindow()
          return s
        })
        handle('ears:remove', async () => {
          const s = await removeEars()
          syncVoiceWindow()
          return s
        })
        handle('ears:transcribe', (e, samples) => {
          if (!isVoiceContents(e.sender) || !(samples instanceof Float32Array)) throw new Error('Not allowed')
          return transcribeEars(samples)
        })
        handle('eyes:help', async (_e, text: string, act: boolean) => {
          const p = getPrefs()
          if (p.novaEyes === 'off' && !(act && p.novaHands !== 'off')) return null
          if (claudeBlocked(p)) return 'To look at your screen I need Claude. Connect it on my page in Studyhall.'
          // "Click export" with hands on: do it. Otherwise: show where, and walk you through.
          if (act && p.novaHands && p.novaHands !== 'off') return doOnScreen(String(text).slice(0, 500))
          return helpOnScreen(String(text).slice(0, 500))
        })
        handle('eyes:stop', () => {
          stopWalkthrough()
          stopHands()
          stopTeach()
        })
        handle('eyes:window', async () => {
          if (process.env.STUDYHALL_OFFSCREEN === '1') return null // tests never read your real windows
          const r = await eyes({ cmd: 'window', exclude: [process.pid] }).catch(() => null)
          const w = r?.ok ? (r.window as { title: string; app: string }) : null
          return w ? { title: String(w.title ?? ''), app: String(w.app ?? '') } : null
        })
        // A live lesson. Resolves once Nova starts talking (the rest carries on); null without Claude.
        handle('eyes:teach', async (_e, topic: string, onScreen: boolean, wiki: string) => {
          const p = getPrefs()
          if (claudeBlocked(p)) return null
          const r = await teach(String(topic).slice(0, 200), !!onScreen && p.novaEyes !== 'off', String(wiki ?? '').slice(0, 120))
          return r.started ? r.first || 'Here you go.' : null
        })
        handle('mouth:status', () => mouthStatus())
        handle('mouth:install', () => installMouth())
        handle('mouth:remove', () => removeMouth())
        handle('mouth:warm', () => warmMouth())
        handle('mouth:speak', (_e, text, voice, speed) => {
          const p = getPrefs()
          // (explaining or teaching: the teaching speed, a little slower, unless a speed was asked for)
          return speakMouth(String(text ?? ''), typeof voice === 'string' ? voice : (p.novaVoice ?? 'af_heart'), typeof speed === 'number' ? speed : calmVoice() ? (p.novaTeachSpeed ?? 0.85) : (p.novaSpeed ?? 1.05))
        })
        handle('claude:status', () => claudeStatus())
        handle('claude:install', () => installClaude())
        handle('claude:signIn', () => signInClaude())
        handle('claude:signOut', () => signOutClaude())
        handle('claude:remove', () => removeClaude())
        handle('claude:refreshUsage', () => refreshClaudeUsage(getPrefs()))
        handle('claude:connectors', () => listConnectors().catch(() => []))
        handle('claude:draft', async (_e, text: string) => {
          const p = getPrefs()
          if (!p.novaConnectors) return 'To draft that in your apps, switch on “Let Nova use my Claude connectors” on my page first.'
          if (claudeBlocked(p)) return 'I need Claude connected for that. Connect it on my page in Studyhall.'
          return draftWithConnectors(String(text).slice(0, 2000), p, voiceConfirm)
        })
        handle('ai:downloadEyes', () => downloadEyes())
        handle('ai:removeEyes', () => removeEyes())
        handle('bauer:cards', (_e, cards) => showCards(Array.isArray(cards) ? cards : []))
        handle('bauer:clearCards', () => clearCards())
        handle('bauer:wiki', (_e, topic: string) => wikiSummary(String(topic)).catch(() => null))
        handle('bauer:circle', () => startCircle())
        handle('bauer:marks', () => setPen('marks'))
        handle('bauer:openApp', (_e, name: string) => openApp(String(name)))
        handle('bauer:shot', () => takeShot())
        handle('app:goto', (_e, page: string) => showWindow(String(page)))
        handle('app:openUrl', (_e, url: string) => (/^https?:\/\//i.test(String(url)) ? shell.openExternal(String(url)) : undefined))
      },
      onPrefs: (patch) => {
        if ('voiceWake' in patch || 'voiceSensitivity' in patch || 'novaName' in patch) syncVoiceWindow()
        if ('bauerOrb' in patch || 'novaOrbSize' in patch || 'novaDrift' in patch || 'novaSounds' in patch || 'novaHideIdle' in patch) syncOrb()
        if ('bauerOnlyWhenOpen' in patch) bauerAway(!mainWindow?.isVisible())
      }
    })
    // Messages from the Bauer panel window (show / hide / what it's doing).
    ipcMain.on('nova:toolResult', (_e, id, result) => novaToolResult(Number(id), String(result ?? '')))
    ipcMain.on('voice:window', (e, msg) => {
      if (!isVoiceContents(e.sender) || !msg || typeof msg !== 'object') return
      if (msg.type === 'said') {
        voiceSaid(Number(msg.id))
        return
      }
      if (msg.type === 'confirm') {
        voiceAnswer(Number(msg.id), !!msg.ok)
        return
      }
      if (msg.type === 'feed') {
        if (msg.samples instanceof Float32Array) {
          const p = getPrefs()
          void feedEars(e.sender, msg.samples, p.novaName ?? 'Nova', typeof p.voiceSensitivity === 'number' ? p.voiceSensitivity : 50).catch((err) => console.warn('Nova ears:', err))
        }
        return
      }
      voiceFromWindow(msg)
    })
    configureEars((st) => broadcast('ears:status', st))
    configureMouth((st) => broadcast('mouth:status', st))
    pointerHooks.show = showPointer
    pointerHooks.hide = hidePointer
    pointerHooks.say = voiceSay
    pointerHooks.prefs = getPrefs
    pointerHooks.ask = (messages, schema) => claudeChat(messages, schema, getPrefs(), 'look')
    handsHooks.ask = (messages, schema) => claudeChat(messages, schema, getPrefs(), 'look')
    handsHooks.prefs = getPrefs
    handsHooks.say = voiceSay
    handsHooks.show = showPointer
    handsHooks.hide = hidePointer
    handsHooks.confirm = voiceConfirm
    // The pen: hold the talk keys (or press Ctrl+Alt+B) and draw with the left button held to mark what you mean.
    talkKeyHooks.down = () => {
      roamiesAbort() // talking to Nova again stops what it was doing
      setPen('talk') // (marks made with Ctrl+Alt+B are kept: now they go with what you say)
    }
    talkKeyHooks.lmb = (down) => penButton(down)
    talkKeyHooks.rmb = () => penUndo()
    penHooks.buttons = (on) => reportPen(on)
    penHooks.marked = (rect) => askBeside(rect)
    // Esc in any app: Nova stops talking and drawing, as Roamies does. Clicks: for a drawn walkthrough waiting on one.
    talkKeyHooks.esc = () => {
      setConversation(false) // (Esc ends conversation mode too)
      if (penMode()) setPen(null, true) // (the marks are cancelled)
      roamiesEsc()
      roamiesAbort()
      voiceHush()
    }
    talkKeyHooks.click = () => {
      roamiesClick()
      orbPress()
    }
    orbPressHooks.hot = (on) => reportClicks(on, 'nova layer')
    talkKeyHooks.up = () => {
      if (penMode() === 'talk') setPen(null)
    }
    penHooks.circled = (rect, strokes) => noteCircle(rect, strokes)
    // Tutor mode (tutor.ts): Ctrl+Alt+T, the scholar's cap on the globe, its opening question, the lesson's recording.
    shortcutHooks.tutor = () => toggleTutor()
    // Conversation mode (conversation.ts): Ctrl+Alt+C, the globe's live ring, the voice window listening hands-free.
    shortcutHooks.conversation = () => toggleConversation()
    convHooks.send = (on) => voiceConversation(on)
    convHooks.ring = (on) => orbAgent({ type: 'live', on })
    tutorHooks.hat = (on) => orbAgent({ type: 'hat', on })
    tutorHooks.ask = (t) => voiceAsk(t)
    tutorHooks.record = (on, sourceId) => {
      voiceRecord(on, sourceId)
      novaInRecordings(on)
    }
    eyesHooks.hide = hiddenFromCaptures
    tutorHooks.failed = (text) => notify('Tutor mode', text)
    tutorHooks.warm = () => warmLesson()
    tutorHooks.ended = () => clearLessonInk()
    emoteHooks.quiet = () => calmVoice() || tutorOn()
    teachHooks.ask = (messages, onText) => claudeChat(messages, undefined, getPrefs(), 'explain', onText)
    teachHooks.prefs = getPrefs
    teachHooks.live = liveCards
    teachHooks.highlight = showHighlight
    teachHooks.hideHighlight = hidePointer
    teachHooks.sayAndWait = voiceSayAndWait
    teachHooks.source = wikiIntro
    configureAi((st) => broadcast('ai:status', st))
    configureVoice({
      url: appUrl,
      webPreferences: SECURE_PREFS,
      onStatus: (st) => {
        broadcast('voice:status', st)
        // The floating Bauer mirrors what the voice panel is doing.
        if (st.state === 'listening') sendOrb('listening')
        else if (st.state === 'thinking' || st.state === 'loading') sendOrb('thinking')
        else if (st.state === 'error') sendOrb('error')
        else if (st.state === 'armed' || st.state === 'off') sendOrb('idle')
      }
    })
    configureBauer({ url: appUrl, webPreferences: SECURE_PREFS, startBrief: () => void startBrief() })
    configureLessonWindow({ url: appUrl, webPreferences: SECURE_PREFS })
    // Nova's Lessons and Map tabs; a lesson's pack when it ends; Replay's two Novas.
    registerLessonsIpc((title, body) => notify(title, body, 'nova'))
    replayOrb.lesson = (on) => orbAgent({ type: 'lesson', on })
    // Started hidden in the tray (with Windows)? Bauer waits until Studyhall is opened.
    bauerAway(!mainWindow?.isVisible())
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
    startFeedRefresh(() => broadcast('feeds:changed'))
    void initOculus((s) => broadcast('oculus:state', s))
    void applyLanShare().catch((e) => console.error('Wi-Fi sharing could not start', e))
    initUpdater((s) => {
      broadcast('app:update', s)
      if (s.status === 'ready') notify('Studyhall update ready', `Version ${s.version} will install when you restart Studyhall.`)
    })

    // studyhall:// links open the app (registered per-user; the installer registers it too).
    // (Only the installed app registers, so test builds never take over your links.)
    if (app.isPackaged) app.setAsDefaultProtocolClient('studyhall')
    handleDeepLink(process.argv)

    createWindow()
    syncVoiceWindow() // "Hey Nova" keeps listening while Studyhall is in the tray
    startKeys() // hold Ctrl + Alt to talk, tap Ctrl + Shift to type
    applyShortcut(getPrefs().quickCaptureShortcut)
    watchShortcut(applyShortcut)

    // Tray + focus timer. The timer pushes its state to the UI and the tray.
    createTray(ICON_PATH, {
      show: () => showWindow(),
      openFocus: () => showWindow('focus'),
      openSpotify: () => void openSpotifyPlayer(),
      brief: () => void voiceStatus().then((st) => (st.installed ? startBrief() : showWindow('settings'))),
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
    const remind = (): void => {
      checkDeadlines((title, body) => notify(title, body, 'home'))
      checkLifeReminders(notify)
      // A promise with a time has come due: Nova nudges you out loud (and the globe does its "remind" move).
      // "Snooze it for ten minutes" works afterwards: Nova knows which one it just reminded you about.
      if (getPrefs().bauerOrb !== false && process.env.STUDYHALL_OFFSCREEN !== '1')
        checkDueNow((title, dueAt) => {
          noteReminder(title, dueAt)
          orbEmote('remind')
          voiceSay(`Reminder: ${title}.`)
        })
    }
    setTimeout(remind, 10_000)
    setInterval(remind, 60_000)

    // Nova the study buddy: focus sessions, the morning brief, a quiz offer after a long read.
    buddyHooks.say = (t) => voiceSay(t)
    buddyHooks.sayThenListen = async (t) => {
      await voiceSayAndWait(t)
      startBrief() // listening for your answer
    }
    buddyHooks.emote = (e) => orbEmote(e)
    buddyHooks.cards = (c) => showCards(c)
    buddyHooks.away = () => novaAway
    startBuddy()
    startSchool()
  })

  app.on('before-quit', () => void restoreAfterLesson(true))
app.on('before-quit', () => (quitting = true))
  app.on('window-all-closed', () => app.quit())
  app.on('will-quit', () => {
    setClaudeWarm(false) // close waiting Claude Code sessions
    setNovaAllowed(false)
    stopEyes()
    closeAllVideoRooms()
    stopOculus()
    stopLanShare()
    closeSpotifyPlayer()
    closeVoice()
    closeBauerWindows()
    globalShortcut.unregisterAll()
    closeDb()
  })
}
