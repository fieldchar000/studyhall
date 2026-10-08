// System tray icon. While the timer runs, the icon shows the minutes left
// (drawn pixel by pixel, no image library needed) and the tooltip shows mm:ss.

import { Menu, nativeImage, Tray, type NativeImage } from 'electron'
import type { TimerState } from '@shared/types'

export interface TrayActions {
  show: () => void
  openFocus: () => void
  openSpotify: () => void
  toggleTimer: () => void
  skip: () => void
  quit: () => void
}

let tray: Tray | null = null
let idleIcon: NativeImage
let actions: TrayActions
let lastKey = ''

// 3x5 pixel digits, one string per row
const DIGITS: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '001', '001', '001'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111']
}

/** Raw BGRA bitmap: a rounded square in `color` with two white digits. */
function drawBadge(size: number, scale: number, text: string, color: [number, number, number]): Buffer {
  const buf = Buffer.alloc(size * size * 4) // transparent
  const r = Math.round(size / 5)
  const set = (x: number, y: number, [R, G, B]: [number, number, number]): void => {
    const i = (y * size + x) * 4
    buf[i] = B
    buf[i + 1] = G
    buf[i + 2] = R
    buf[i + 3] = 255
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // skip pixels outside the rounded corners
      const cx = x < r ? r - x : x >= size - r ? x - (size - r - 1) : 0
      const cy = y < r ? r - y : y >= size - r ? y - (size - r - 1) : 0
      if (cx * cx + cy * cy <= r * r) set(x, y, color)
    }
  }
  const digitW = 3 * scale
  const gap = Math.max(1, Math.round(scale / 2))
  const totalW = text.length * digitW + (text.length - 1) * gap
  const left = Math.floor((size - totalW) / 2)
  const top = Math.floor((size - 5 * scale) / 2)
  ;[...text].forEach((ch, n) => {
    DIGITS[ch]?.forEach((row, ry) => {
      ;[...row].forEach((bit, rx) => {
        if (bit !== '1') return
        for (let dy = 0; dy < scale; dy++)
          for (let dx = 0; dx < scale; dx++)
            set(left + n * (digitW + gap) + rx * scale + dx, top + ry * scale + dy, [255, 255, 255])
      })
    })
  })
  return buf
}

/** Icon with sharp versions for 100%, 150% and 200% Windows display scaling. */
function badgeIcon(text: string, color: [number, number, number]): NativeImage {
  const img = nativeImage.createEmpty()
  for (const [size, scale, factor] of [
    [16, 2, 1],
    [24, 3, 1.5],
    [32, 4, 2]
  ]) {
    img.addRepresentation({ scaleFactor: factor, width: size, height: size, buffer: drawBadge(size, scale, text, color) })
  }
  return img
}

const PHASE_LABEL = { focus: 'Focus', short_break: 'Short break', long_break: 'Long break' }

export function createTray(iconPath: string, a: TrayActions): void {
  actions = a
  idleIcon = nativeImage.createFromPath(iconPath).resize({ width: 32, height: 32 })
  tray = new Tray(idleIcon)
  tray.setToolTip('Studyhall')
  tray.on('click', () => actions.show())
}

const fmt = (ms: number): string => {
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Called on every timer change and every second while running. */
export function updateTray(state: TimerState, remainingMs: number): void {
  if (!tray) return
  const active = state.running || remainingMs < state.durationMs
  const label = active ? `${PHASE_LABEL[state.phase]} ${fmt(remainingMs)}${state.running ? '' : ' (paused)'}` : 'Timer ready'
  tray.setToolTip(`Studyhall — ${label}`)

  // Only rebuild the icon/menu when the minute or state changes.
  const minutes = Math.min(99, Math.ceil(remainingMs / 60_000))
  const key = `${state.phase}|${state.running}|${active}|${minutes}`
  if (key === lastKey) return
  lastKey = key

  if (state.running) {
    const color: [number, number, number] = state.phase === 'focus' ? [220, 60, 70] : [40, 160, 95]
    tray.setImage(badgeIcon(String(minutes), color))
  } else {
    tray.setImage(idleIcon)
  }

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Studyhall', click: actions.show },
      { label: 'Focus room', click: actions.openFocus },
      { label: 'Spotify player', click: actions.openSpotify },
      { type: 'separator' },
      { label, enabled: false },
      { label: state.running ? 'Pause timer' : active ? 'Resume timer' : 'Start focus', click: actions.toggleTimer },
      { label: 'Skip to next phase', click: actions.skip, enabled: active || state.phase !== 'focus' },
      { type: 'separator' },
      { label: 'Quit Studyhall', click: actions.quit }
    ])
  )
}
