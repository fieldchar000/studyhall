// Spotify player window: the real Spotify web player (open.spotify.com) inside Studyhall.
// Full tracks need Widevine copy protection, which this app's Electron build (castlabs
// "Electron for Content Security") includes. Sign in once inside the window — it's
// remembered in a separate, private browser session that the rest of the app can't touch.

import { BrowserWindow, components, session, shell, type Session } from 'electron'

const PARTITION = 'persist:spotify'
// Spotify and the sign-in options it offers (Google / Apple / Facebook).
const HOSTS = [/(^|\.)spotify\.com$/, /(^|\.)scdn\.co$/, /(^|\.)spotifycdn\.com$/, /^accounts\.google\.com$/, /^appleid\.apple\.com$/, /(^|\.)facebook\.com$/]
const allowedUrl = (url: string): boolean => {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && HOSTS.some((h) => h.test(u.hostname))
  } catch {
    return false
  }
}

let prepared = false
function spotifySession(): Session {
  const s = session.fromPartition(PARTITION)
  if (prepared) return s
  prepared = true
  // A plain Chrome user agent, so Spotify doesn't call the browser unsupported.
  s.setUserAgent(s.getUserAgent().replace(/\s?(Electron|studyhall)\/\S+/gi, ''))
  // Only what playback needs: protected media (DRM), autoplay-ish media, fullscreen, clipboard.
  const ok = new Set(['mediaKeySystem', 'media', 'fullscreen', 'clipboard-sanitized-write'])
  s.setPermissionRequestHandler((wc, permission, cb) => cb(ok.has(permission) && allowedUrl(wc.getURL())))
  s.setPermissionCheckHandler((_wc, permission, origin) => ok.has(permission) && allowedUrl(origin))
  return s
}

export const isSpotifyContents = (s: Session): boolean => s === session.fromPartition(PARTITION)

let win: BrowserWindow | null = null

/** Open (or focus) the player, optionally at a playlist/album/track link. */
export async function openSpotifyPlayer(url?: string): Promise<{ widevine: boolean }> {
  // Wait until the Widevine module is installed (first run downloads it, a few seconds).
  let widevine = true
  try {
    await components.whenReady()
  } catch {
    widevine = false
  }
  const target = url && allowedUrl(url) ? url : 'https://open.spotify.com/'
  if (win && !win.isDestroyed()) {
    if (url) void win.loadURL(target)
    win.show()
    win.focus()
    return { widevine }
  }
  const ses = spotifySession()
  win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 800,
    minHeight: 520,
    title: 'Spotify — Studyhall',
    autoHideMenuBar: true,
    backgroundColor: '#121212',
    webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  })
  win.webContents.setWindowOpenHandler(({ url: u }) => {
    if (allowedUrl(u)) {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 720, autoHideMenuBar: true, webPreferences: { session: ses, sandbox: true } } }
    }
    if (/^https?:\/\//i.test(u)) void shell.openExternal(u)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, u) => {
    if (!allowedUrl(u)) e.preventDefault()
  })
  win.on('closed', () => (win = null))
  void win.loadURL(target)
  return { widevine }
}

export function closeSpotifyPlayer(): void {
  if (win && !win.isDestroyed()) win.destroy()
}
