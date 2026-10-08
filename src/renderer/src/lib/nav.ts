// Minimal in-app navigation (no router library needed for a desktop app).

import { useSyncExternalStore } from 'react'

export type Route =
  | { name: 'home' }
  | { name: 'modules' }
  | { name: 'module'; id: string; tab?: 'weeks' | 'assessments' }
  | { name: 'settings' }

let current: Route = { name: 'home' }
const listeners = new Set<() => void>()

export function navigate(route: Route): void {
  current = route
  listeners.forEach((l) => l())
}

export function useRoute(): Route {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current
  )
}
