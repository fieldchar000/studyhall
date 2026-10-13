// Updates on the phone: Android apps can't replace themselves silently, so Studyhall checks
// GitHub for a newer release and, when there is one, offers to download the new app file.

import { app, net, openOutside } from '../shims/electron'
import type { UpdateState } from '@shared/types'
export type { UpdateState }

const REPO = 'fieldchar000/studyhall'
export const APK_URL = `https://github.com/${REPO}/releases/latest/download/Studyhall.apk`

let state: UpdateState = { status: 'idle' }
let listener: (s: UpdateState) => void = () => {}
const set = (s: UpdateState): void => {
  state = s
  listener(s)
}

const newer = (a: string, b: string): boolean => {
  const x = a.split('.').map(Number)
  const y = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0)
  return false
}

export const updateState = (): UpdateState => state

export function initUpdater(onChange: (s: UpdateState) => void): void {
  listener = onChange
  setTimeout(() => void checkForUpdates(), 20_000)
  setInterval(() => void checkForUpdates(), 6 * 60 * 60 * 1000)
}

export async function checkForUpdates(): Promise<UpdateState> {
  if (state.status === 'ready') return state
  set({ status: 'checking' })
  try {
    const res = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'Studyhall' } })
    if (!res.ok) throw new Error(`GitHub said ${res.status}`)
    const rel = (await res.json()) as { tag_name?: string; assets?: { name: string }[] }
    const latest = String(rel.tag_name ?? '').replace(/^v/, '')
    const hasApk = rel.assets?.some((a) => a.name === 'Studyhall.apk')
    set(latest && hasApk && newer(latest, app.getVersion()) ? { status: 'ready', version: latest } : { status: 'none' })
  } catch (e) {
    set({ status: 'error', message: e instanceof Error ? e.message.slice(0, 200) : String(e) })
  }
  return state
}

/** Download the new version in the browser; Android then asks to install it over this one. */
export function installUpdate(): void {
  openOutside(APK_URL)
}
