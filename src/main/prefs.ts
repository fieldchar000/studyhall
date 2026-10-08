// Device-local app preferences (stored in the settings table, never synced).

import { app } from 'electron'
import { getSetting, setSetting } from './db'
import type { Prefs } from '@shared/types'

const DEFAULTS: Prefs = {
  closeToTray: true,
  launchAtLogin: false,
  notifyDeadlines: true,
  notifyTimer: true
}

export function getPrefs(): Prefs {
  return { ...DEFAULTS, ...(getSetting<Partial<Prefs>>('prefs') ?? {}) }
}

export function setPrefs(patch: Partial<Prefs>): Prefs {
  const next = { ...getPrefs(), ...patch }
  setSetting('prefs', next)
  if ('launchAtLogin' in patch) applyLoginItem(next.launchAtLogin)
  return next
}

/** Start with Windows (hidden in the tray) when enabled. Only meaningful for the installed app. */
export function applyLoginItem(enabled: boolean): void {
  if (!app.isPackaged) return
  app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] })
}
