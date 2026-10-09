// Look and feel (this PC only): light/dark, accent colour and the background glow.
// Applied as attributes on <html> so the CSS tokens in index.css switch instantly.

import { useSyncExternalStore } from 'react'

export type Theme = 'system' | 'light' | 'dark'
export type Accent = 'mode' | 'violet' | 'blue' | 'emerald' | 'cyan' | 'rose' | 'amber'

export interface Appearance {
  theme: Theme
  accent: Accent // 'mode' = each category has its own colour
  glow: boolean
}

const KEY = 'sh-appearance'
const DEFAULTS: Appearance = { theme: 'system', accent: 'mode', glow: true }

let current: Appearance = (() => {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Appearance>) }
  } catch {
    return DEFAULTS
  }
})()
const listeners = new Set<() => void>()
const dark = window.matchMedia('(prefers-color-scheme: dark)')

function apply(): void {
  const root = document.documentElement
  root.dataset.theme = current.theme === 'system' ? (dark.matches ? 'dark' : 'light') : current.theme
  if (current.accent === 'mode') delete root.dataset.accent
  else root.dataset.accent = current.accent
  root.dataset.glow = current.glow ? 'on' : 'off'
}
apply()
dark.addEventListener('change', apply)

export function setAppearance(patch: Partial<Appearance>): void {
  current = { ...current, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    /* private mode */
  }
  apply()
  listeners.forEach((l) => l())
}

export function useAppearance(): Appearance {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current
  )
}

/** The category colours the accent (unless a fixed accent is chosen). */
export function setModeAccent(mode: string): void {
  document.documentElement.dataset.mode = mode
}
