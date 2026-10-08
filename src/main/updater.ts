// Auto-update from GitHub Releases (github.com/fieldchar000/studyhall).
// Checks shortly after launch and every 6 hours, downloads in the background, and either
// installs when you click "Restart to update" or quietly the next time you quit.

import { app } from 'electron'
import { autoUpdater } from 'electron-updater'

import type { UpdateState } from '@shared/types'
export type { UpdateState }

let state: UpdateState = { status: app.isPackaged ? 'idle' : 'dev' }
let listener: (s: UpdateState) => void = () => {}
const set = (s: UpdateState): void => {
  state = s
  listener(s)
}

export const updateState = (): UpdateState => state

export function initUpdater(onChange: (s: UpdateState) => void): void {
  listener = onChange
  if (!app.isPackaged) return // only the installed app updates itself
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => set({ status: 'checking' }))
  autoUpdater.on('update-not-available', () => set({ status: 'none' }))
  autoUpdater.on('update-available', (info) => set({ status: 'downloading', version: info.version, percent: 0 }))
  autoUpdater.on('download-progress', (p) => {
    if (state.status === 'downloading') set({ ...state, percent: Math.round(p.percent) })
  })
  autoUpdater.on('update-downloaded', (info) => set({ status: 'ready', version: info.version }))
  autoUpdater.on('error', (e) => set({ status: 'error', message: String(e?.message ?? e).slice(0, 200) }))
  setTimeout(() => void checkForUpdates(), 15_000)
  setInterval(() => void checkForUpdates(), 6 * 60 * 60 * 1000)
}

export async function checkForUpdates(): Promise<UpdateState> {
  if (!app.isPackaged) return state
  if (state.status === 'ready' || state.status === 'downloading') return state
  try {
    await autoUpdater.checkForUpdates()
  } catch (e) {
    set({ status: 'error', message: e instanceof Error ? e.message.slice(0, 200) : String(e) })
  }
  return state
}

/** Quit (saving everything first via the normal close path) and install the downloaded update. */
export function installUpdate(): void {
  if (state.status === 'ready') autoUpdater.quitAndInstall(true, true) // silent install, relaunch after
}
