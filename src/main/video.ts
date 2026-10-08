// Video room: the free public Jitsi server (meet.jit.si) in its own app window.
// - Separate, persistent browser session ("persist:jitsi"): Jitsi's sign-in stays remembered
//   and none of it can touch the main app's data.
// - Camera/microphone are allowed only for meet.jit.si; everything else is denied.
// - Signing in (Jitsi requires the person who STARTS a call to sign in with Google/GitHub/
//   Facebook) happens in a popup inside the app, as requested — not in the web browser.
// - The 6-person cap is enforced by the app via room_join() before the window opens.

import { BrowserWindow, session, shell, type Session } from 'electron'

const PARTITION = 'persist:jitsi'
// Sign-in popups Jitsi may open; anything else opens in the normal browser.
const AUTH_HOSTS = [/(^|\.)jit\.si$/, /(^|\.)jitsi\.net$/, /^accounts\.google\.com$/, /(^|\.)github\.com$/, /(^|\.)facebook\.com$/, /^accounts\.youtube\.com$/]
const allowed = (url: string): boolean => {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && AUTH_HOSTS.some((h) => h.test(u.hostname))
  } catch {
    return false
  }
}

let prepared = false
export function jitsiSession(): Session {
  const s = session.fromPartition(PARTITION)
  if (prepared) return s
  prepared = true
  // A plain Chrome user agent: Jitsi and Google sign-in don't like "Electron" in it.
  s.setUserAgent(s.getUserAgent().replace(/\s?(Electron|studyhall)\/\S+/gi, ''))
  const ok = new Set(['media', 'fullscreen', 'clipboard-sanitized-write', 'speaker-selection'])
  s.setPermissionRequestHandler((wc, permission, cb) => cb(ok.has(permission) && wc.getURL().startsWith('https://meet.jit.si/')))
  s.setPermissionCheckHandler((_wc, permission, origin) => ok.has(permission) && origin.startsWith('https://meet.jit.si'))
  s.setDisplayMediaRequestHandler((_req, cb) => cb({})) // no screen sharing
  return s
}

/** Is this web page part of the video room (so the main app's lock-down rules don't apply)? */
export const isVideoContents = (s: Session): boolean => s === session.fromPartition(PARTITION)

const open = new Map<string, BrowserWindow>()

export function openVideoRoom(opts: { channelId: string; roomKey: string; title: string; displayName: string; onClosed: () => void; heartbeat: () => void }): void {
  const existing = open.get(opts.channelId)
  if (existing && !existing.isDestroyed()) {
    existing.show()
    existing.focus()
    return
  }
  const ses = jitsiSession()
  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    title: `${opts.title} — video room`,
    autoHideMenuBar: true,
    webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  open.set(opts.channelId, win)

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (allowed(url)) {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 560, height: 720, autoHideMenuBar: true, webPreferences: { session: ses, sandbox: true } } }
    }
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!allowed(url)) e.preventDefault()
  })

  // Keep our seat in the room (for the 6-person cap) while the window is open.
  const beat = setInterval(opts.heartbeat, 30_000)
  win.on('closed', () => {
    clearInterval(beat)
    open.delete(opts.channelId)
    opts.onClosed()
  })

  const name = encodeURIComponent(JSON.stringify(opts.displayName))
  const hash = [
    `userInfo.displayName=${name}`,
    'config.prejoinConfig.enabled=true',
    'config.disableDeepLinking=true',
    // Join with mic and camera off; switch them on yourself when ready.
    'config.startWithAudioMuted=true',
    'config.startWithVideoMuted=true',
    `config.subject=${encodeURIComponent(JSON.stringify(opts.title))}`
  ].join('&')
  void win.loadURL(`https://meet.jit.si/Studyhall-${opts.roomKey}#${hash}`)
}

export function closeAllVideoRooms(): void {
  for (const w of open.values()) if (!w.isDestroyed()) w.destroy()
}
