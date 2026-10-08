// Remember the window's size, position and maximized state between launches.

import { screen, type BrowserWindow, type Rectangle } from 'electron'
import { getSetting, setSetting } from './db'

interface WindowState {
  bounds: Rectangle
  maximized: boolean
}

const KEY = 'window_state'
const DEFAULT = { width: 1280, height: 820 }

/** Saved bounds, if they're still visible on a connected monitor. */
export function loadWindowState(): { bounds: Partial<Rectangle>; maximized: boolean } {
  const saved = getSetting<WindowState>(KEY)
  if (!saved) return { bounds: DEFAULT, maximized: false }
  const visible = screen.getAllDisplays().some(({ workArea: a }) => {
    const b = saved.bounds
    return b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y + b.height > a.y
  })
  return { bounds: visible ? saved.bounds : DEFAULT, maximized: saved.maximized }
}

export function trackWindowState(win: BrowserWindow): void {
  let timer: NodeJS.Timeout | undefined
  const save = (): void => {
    if (win.isDestroyed() || win.isMinimized()) return
    // getNormalBounds = size before maximizing, so un-maximize restores nicely
    setSetting(KEY, { bounds: win.getNormalBounds(), maximized: win.isMaximized() })
  }
  const saveSoon = (): void => {
    clearTimeout(timer)
    timer = setTimeout(save, 500)
  }
  win.on('resize', saveSoon)
  win.on('move', saveSoon)
  win.on('maximize', save)
  win.on('unmaximize', save)
  win.on('close', save)
}
