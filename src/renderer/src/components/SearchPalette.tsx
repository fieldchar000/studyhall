// Global search (Ctrl+K): find anything and jump to it. Also works as a page switcher.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { SearchResult } from '@shared/types'
import { api } from '@/lib/data'
import { navigate, type Route } from '@/lib/nav'
import { openTask } from '@/lib/tasks'
import { Icon } from './ui'

// ---------- open/close from anywhere ----------
let isOpen = false
const listeners = new Set<() => void>()
export function openSearch(open = true): void {
  isOpen = open
  listeners.forEach((l) => l())
}
function useSearchOpen(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => isOpen
  )
}

const TYPE_META: Record<SearchResult['type'], { label: string; icon: string }> = {
  task: { label: 'Task', icon: 'tasks' },
  note: { label: 'Note', icon: 'note' },
  module: { label: 'Module', icon: 'modules' },
  project: { label: 'Project', icon: 'projects' },
  client: { label: 'Client', icon: 'clients' },
  assessment: { label: 'Assessment', icon: 'grades' },
  material: { label: 'File', icon: 'file' },
  flashcard: { label: 'Flashcard', icon: 'cards' },
  deck: { label: 'Deck', icon: 'cards' },
  video: { label: 'Video', icon: 'play' },
  event: { label: 'Event', icon: 'calendar' },
  inbox: { label: 'Inbox', icon: 'upload' },
  mindmap: { label: 'Mindmap', icon: 'mindmap' }
}

const PAGES: { label: string; route: Route }[] = [
  { label: 'Home', route: { name: 'home' } },
  { label: 'Tasks', route: { name: 'tasks' } },
  { label: 'Projects', route: { name: 'projects' } },
  { label: 'Modules', route: { name: 'modules' } },
  { label: 'Timetable', route: { name: 'timetable' } },
  { label: 'Notes', route: { name: 'notes' } },
  { label: 'Mindmaps', route: { name: 'mindmaps' } },
  { label: 'Flashcards', route: { name: 'flashcards' } },
  { label: 'Grades', route: { name: 'grades' } },
  { label: 'Videos', route: { name: 'videos' } },
  { label: 'Inbox', route: { name: 'inbox' } },
  { label: 'Stats', route: { name: 'stats' } },
  { label: 'Study Garden', route: { name: 'game' } },
  { label: 'Focus', route: { name: 'focus' } },
  { label: 'Clients', route: { name: 'clients' } },
  { label: 'Settings', route: { name: 'settings' } }
]

function openResult(r: SearchResult): void {
  switch (r.type) {
    case 'task':
      return openTask(r.id)
    case 'note':
      return navigate({ name: 'notes', id: r.id })
    case 'module':
      return navigate({ name: 'module', id: r.id })
    case 'project':
      return navigate({ name: 'project', id: r.id })
    case 'client':
      return navigate({ name: 'client', id: r.id })
    case 'assessment':
      return navigate({ name: 'module', id: r.parent_id!, tab: 'assessments' })
    case 'material':
      return navigate(r.parent_id ? { name: 'module', id: r.parent_id } : { name: 'materials' })
    case 'flashcard':
      return navigate({ name: 'deck', id: r.parent_id! })
    case 'deck':
      return navigate({ name: 'deck', id: r.id })
    case 'video':
      return navigate({ name: 'video', id: r.id })
    case 'mindmap':
      return navigate({ name: 'mindmap', id: r.id })
    case 'inbox':
      return navigate({ name: 'inbox' })
    case 'event':
      return navigate({ name: 'home' })
  }
}

type Item = { key: string; icon: string; title: string; sub: string; tag: string; go: () => void }

export function SearchPalette(): React.JSX.Element | null {
  const open = useSearchOpen()

  // Ctrl+K (or Ctrl+F) anywhere opens search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        openSearch(!isOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return open ? <Palette /> : null
}

function Palette(): React.JSX.Element {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      if (!q.trim()) return setResults([])
      void api.search(q).then((r) => {
        setResults(r)
        setActive(0)
      })
    }, 120)
    return () => clearTimeout(t)
  }, [q])

  const lq = q.trim().toLowerCase()
  const pages: Item[] = PAGES.filter((p) => lq && p.label.toLowerCase().includes(lq)).map((p) => ({
    key: `page:${p.label}`,
    icon: 'chevron',
    title: `Go to ${p.label}`,
    sub: '',
    tag: 'Page',
    go: () => navigate(p.route)
  }))
  const items: Item[] = [
    ...pages,
    ...results.map((r) => ({
      key: `${r.type}:${r.id}:${r.snippet}`,
      icon: TYPE_META[r.type].icon,
      title: r.title,
      sub: r.snippet,
      tag: TYPE_META[r.type].label,
      go: () => openResult(r)
    }))
  ]

  const choose = (item: Item | undefined): void => {
    if (!item) return
    openSearch(false)
    item.go()
  }

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  // Esc closes even when focus has left the search box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') openSearch(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/40 pt-[12vh]" onMouseDown={() => openSearch(false)}>
      <div className="card flex h-fit max-h-[65vh] w-full max-w-2xl flex-col overflow-hidden shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            autoFocus
            className="min-w-0 flex-1 bg-transparent py-3.5 text-base outline-none placeholder:text-muted"
            placeholder="Search tasks, notes, modules, flashcards… or type a page name"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') openSearch(false)
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => Math.min(items.length - 1, a + 1))
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => Math.max(0, a - 1))
              }
              if (e.key === 'Enter') choose(items[active])
            }}
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted">Esc</kbd>
        </div>
        <ul ref={listRef} className="min-h-0 overflow-auto py-1">
          {lq && items.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">No matches for “{q}”.</li>}
          {!lq && <li className="px-4 py-6 text-center text-sm text-muted">Type to search everything. ↑↓ to move, Enter to open.</li>}
          {items.map((item, i) => (
            <li key={item.key}>
              <button
                data-active={i === active}
                onMouseMove={() => setActive(i)}
                onClick={() => choose(item)}
                className={`flex w-full items-center gap-3 px-4 py-2 text-left ${i === active ? 'bg-accent-soft' : ''}`}
              >
                <Icon name={item.icon} className="text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{item.title}</span>
                  {item.sub && <span className="block truncate text-xs text-muted">{item.sub}</span>}
                </span>
                <span className="shrink-0 rounded bg-line/60 px-1.5 py-0.5 text-[10px] text-muted">{item.tag}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
