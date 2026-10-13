// Minimal in-app navigation (no router library needed for a desktop app).

import { useSyncExternalStore } from 'react'
import { api } from './data'
import { setDrawer } from './platform'

export type Route =
  | { name: 'home' }
  | { name: 'brain'; q?: string }
  | { name: 'tasks' }
  | { name: 'projects' }
  | { name: 'project'; id: string }
  | { name: 'modules' }
  | { name: 'materials' }
  | { name: 'recall' }
  | { name: 'people'; id?: string }
  | { name: 'partner' }
  | { name: 'module'; id: string; tab?: 'weeks' | 'assessments' | 'tasks' | 'notes' | 'stats' }
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
  | { name: 'languages' }
  | { name: 'language'; id: string }
  | { name: 'habits' }
  | { name: 'exams' }
  | { name: 'briefing' }
  | { name: 'feeds' }
  | { name: 'reading' }
  | { name: 'codex' }
  | { name: 'forecasts' }
  | { name: 'journal'; date?: string }
  | { name: 'library' }
  | { name: 'money' }
  | { name: 'paper'; id: string; timed?: boolean; tab?: 'paper' | 'questions' | 'attempts' }
  | { name: 'quiz'; paperId?: string; moduleId?: string; review?: boolean }
  | { name: 'friends' }
  | { name: 'servers'; serverId?: string; channelId?: string }
  | { name: 'focus' }
  | { name: 'settings' }

let current: Route = { name: 'home' }
const listeners = new Set<() => void>()
const history: Route[] = [] // for the phone's back button

export function navigate(route: Route): void {
  if (JSON.stringify(route) !== JSON.stringify(current)) {
    history.push(current)
    if (history.length > 50) history.shift()
  }
  current = route
  setDrawer(false)
  listeners.forEach((l) => l())
}

/** Back to the previous page; false when there's nowhere to go back to. */
export function goBack(): boolean {
  const prev = history.pop()
  if (!prev) return false
  current = prev
  setDrawer(false)
  listeners.forEach((l) => l())
  return true
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
  if (page === 'focus' || page === 'home' || page === 'tasks' || page === 'inbox' || page === 'servers' || page === 'friends') navigate({ name: page })
})
