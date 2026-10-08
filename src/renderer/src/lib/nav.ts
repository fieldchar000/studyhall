// Minimal in-app navigation (no router library needed for a desktop app).

import { useSyncExternalStore } from 'react'
import { api } from './data'

export type Route =
  | { name: 'home' }
  | { name: 'tasks' }
  | { name: 'projects' }
  | { name: 'project'; id: string }
  | { name: 'modules' }
  | { name: 'module'; id: string; tab?: 'weeks' | 'assessments' | 'tasks' | 'notes' }
  | { name: 'clients' }
  | { name: 'client'; id: string }
  | { name: 'timetable' }
  | { name: 'notes'; id?: string }
  | { name: 'mindmaps' }
  | { name: 'mindmap'; id: string }
  | { name: 'flashcards' }
  | { name: 'deck'; id: string; review?: boolean }
  | { name: 'grades' }
  | { name: 'inbox' }
  | { name: 'videos' }
  | { name: 'video'; id: string }
  | { name: 'stats' }
  | { name: 'game' }
  | { name: 'friends' }
  | { name: 'servers'; serverId?: string; channelId?: string }
  | { name: 'focus' }
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

// The tray menu and notifications can ask for a page.
api.app.onNavigate((page) => {
  if (page === 'focus' || page === 'home' || page === 'tasks' || page === 'inbox') navigate({ name: page })
})
