// Phone vs PC. The same UI runs in both; the Android app sets window.__studyhallMobile.

import { useSyncExternalStore } from 'react'

interface MobileBridge {
  platform: 'android'
  fileSrc: (id: string) => string
}

const bridge = (): MobileBridge | undefined => (window as unknown as { __studyhallMobile?: MobileBridge }).__studyhallMobile

export const isPhoneApp = (): boolean => !!bridge()

/** Where an <img>/<iframe> loads a stored file (material, exam paper or photo) from. */
export function fileSrc(id: string, name = 'file'): string {
  const b = bridge()
  return b ? b.fileSrc(id) : `material://local/${id}/${encodeURIComponent(name)}`
}

// ---------- Narrow screens (phones, or a very narrow PC window) ----------

const NARROW = '(max-width: 767px)'
const mq = typeof window !== 'undefined' ? window.matchMedia(NARROW) : null
export const isNarrow = (): boolean => !!mq?.matches
export function useNarrow(): boolean {
  return useSyncExternalStore(
    (l) => {
      mq?.addEventListener('change', l)
      return () => mq?.removeEventListener('change', l)
    },
    () => !!mq?.matches
  )
}

// ---------- The slide-out menu on narrow screens ----------

let drawerOpen = false
const drawerListeners = new Set<() => void>()
export function setDrawer(open: boolean): void {
  if (drawerOpen === open) return
  drawerOpen = open
  document.documentElement.classList.toggle('drawer-open', open)
  drawerListeners.forEach((l) => l())
}
export function useDrawer(): boolean {
  return useSyncExternalStore(
    (l) => {
      drawerListeners.add(l)
      return () => drawerListeners.delete(l)
    },
    () => drawerOpen
  )
}
