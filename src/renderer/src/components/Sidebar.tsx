import { useEffect } from 'react'
import type { Mode } from '@shared/types'
import { api, useLive } from '@/lib/data'
import { navigate, useRoute, type Route } from '@/lib/nav'
import { setMode, useEnabledModes, useMode } from '@/lib/profile'
import { fmtClock, PHASE_LABEL, useRemaining, useTimerState } from '@/lib/timer'
import { setModeAccent } from '@/lib/appearance'
import { openSearch } from './SearchPalette'
import { useCloud } from '@/lib/cloud'
import { UpdateBanner } from './UpdateBanner'
import { Icon, SaveIndicator } from './ui'

interface NavItem {
  label: string
  icon: string
  route: Route
  match: Route['name'][]
  modes: Mode[]
}

const ALL: Mode[] = ['study', 'work', 'life', 'dev']
export const MODES: { mode: Mode; label: string; icon: string }[] = [
  { mode: 'study', label: 'Study', icon: 'modules' },
  { mode: 'work', label: 'Work', icon: 'clients' },
  { mode: 'life', label: 'Life', icon: 'flame' },
  { mode: 'dev', label: 'DevKit', icon: 'code' }
]

// The category switch at the top changes which pages appear here.
const projects = (label: string, modes: Mode[]): NavItem => ({ label, icon: 'projects', route: { name: 'projects' }, match: ['projects', 'project'], modes })
const groups: { title?: string; items: NavItem[] }[] = [
  {
    items: [
      { label: 'Briefing', icon: 'spark', route: { name: 'briefing' }, match: ['briefing'], modes: ['dev'] },
      { label: 'Home', icon: 'home', route: { name: 'home' }, match: ['home'], modes: ['study', 'work', 'life'] },
      { label: 'Inbox', icon: 'upload', route: { name: 'inbox' }, match: ['inbox'], modes: ALL },
      { label: 'Tasks', icon: 'tasks', route: { name: 'tasks' }, match: ['tasks'], modes: ALL },
      { label: 'Focus', icon: 'focus', route: { name: 'focus' }, match: ['focus'], modes: ALL }
    ]
  },
  {
    title: 'category',
    items: [
      // Study
      { label: 'Modules', icon: 'modules', route: { name: 'modules' }, match: ['modules', 'module'], modes: ['study'] },
      projects('Projects', ['study']),
      { label: 'Exam Prep', icon: 'target', route: { name: 'exams' }, match: ['exams', 'paper', 'quiz'], modes: ['study'] },
      { label: 'Timetable', icon: 'calendar', route: { name: 'timetable' }, match: ['timetable'], modes: ['study'] },
      // Work
      { label: 'Clients', icon: 'clients', route: { name: 'clients' }, match: ['clients', 'client'], modes: ['work'] },
      projects('Projects', ['work']),
      { label: 'Meeting notes', icon: 'note', route: { name: 'notes' }, match: ['notes'], modes: ['work'] },
      // Life
      { label: 'Languages', icon: 'globe', route: { name: 'languages' }, match: ['languages', 'language'], modes: ['life'] },
      { label: 'Habits', icon: 'flame', route: { name: 'habits' }, match: ['habits'], modes: ['life'] },
      { label: 'Journal', icon: 'pencil', route: { name: 'journal' }, match: ['journal'], modes: ['life'] },
      { label: 'Library', icon: 'book', route: { name: 'library' }, match: ['library'], modes: ['life'] },
      { label: 'Money', icon: 'wallet', route: { name: 'money' }, match: ['money'], modes: ['life'] },
      projects('Goals', ['life']),
      // DevKit
      { label: 'Feeds', icon: 'rss', route: { name: 'feeds' }, match: ['feeds'], modes: ['dev'] },
      { label: 'Reading list', icon: 'bookmark', route: { name: 'reading' }, match: ['reading'], modes: ['dev'] },
      { label: 'Codex', icon: 'book', route: { name: 'codex' }, match: ['codex'], modes: ['dev'] },
      { label: 'Forecasts', icon: 'gauge', route: { name: 'forecasts' }, match: ['forecasts'], modes: ['dev'] },
      projects('Projects', ['dev']),
      // Shared tools
      { label: 'Notes', icon: 'note', route: { name: 'notes' }, match: ['notes'], modes: ['study', 'life', 'dev'] },
      { label: 'Mindmaps', icon: 'mindmap', route: { name: 'mindmaps' }, match: ['mindmaps', 'mindmap'], modes: ALL },
      { label: 'Flashcards', icon: 'cards', route: { name: 'flashcards' }, match: ['flashcards', 'deck'], modes: ['study', 'life'] },
      { label: 'Videos', icon: 'play', route: { name: 'videos' }, match: ['videos', 'video'], modes: ALL },
      { label: 'Grades', icon: 'grades', route: { name: 'grades' }, match: ['grades'], modes: ['study'] }
    ]
  },
  {
    title: 'Together',
    items: [
      { label: 'Friends', icon: 'users', route: { name: 'friends' }, match: ['friends'], modes: ALL },
      { label: 'Servers', icon: 'chat', route: { name: 'servers' }, match: ['servers'], modes: ALL }
    ]
  },
  {
    title: 'You',
    items: [
      { label: 'Stats', icon: 'grades', route: { name: 'stats' }, match: ['stats'], modes: ALL },
      { label: 'Pixel Quest', icon: 'game', route: { name: 'game' }, match: ['game'], modes: ALL },
      { label: 'Settings', icon: 'settings', route: { name: 'settings' }, match: ['settings'], modes: ALL }
    ]
  }
]

/** Pages that only exist in some modes: switching away from them goes Home. */
const MODE_PAGES: Partial<Record<Route['name'], Mode[]>> = {
  modules: ['study'],
  module: ['study'],
  timetable: ['study'],
  grades: ['study'],
  exams: ['study'],
  paper: ['study'],
  quiz: ['study'],
  clients: ['work'],
  client: ['work'],
  languages: ['life'],
  language: ['life'],
  habits: ['life'],
  journal: ['life'],
  library: ['life'],
  money: ['life'],
  briefing: ['dev'],
  feeds: ['dev'],
  reading: ['dev'],
  codex: ['dev'],
  forecasts: ['dev'],
  home: ['study', 'work', 'life']
}

export function Sidebar(): React.JSX.Element {
  const route = useRoute()
  const mode = useMode()
  const enabled = useEnabledModes()
  const inboxCount = useLive(['inbox_items'], async () => (await api.list('inbox_items', { processed_at: null })).length, []).data ?? 0
  const cloud = useCloud()
  const serverUnread =
    useLive(['cloud:messages', 'cloud:server_members'], async () => (cloud?.signedIn ? (await api.cloud.servers().catch(() => [])).reduce((n, s) => n + s.unread, 0) : 0), [cloud?.signedIn]).data ?? 0
  const badge = (label: string): number => (label === 'Inbox' ? inboxCount : label === 'Servers' ? serverUnread : 0)
  const shown = MODES.filter((m) => enabled.includes(m.mode))
  const index = Math.max(0, shown.findIndex((m) => m.mode === mode))

  // Each category tints the whole app with its own accent.
  useEffect(() => setModeAccent(mode), [mode])
  // DevKit has no Home: its Briefing is the start page.
  useEffect(() => {
    const only = MODE_PAGES[route.name]
    if (only && !only.includes(mode)) navigate(mode === 'dev' ? { name: 'briefing' } : { name: 'home' })
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  const switchTo = (m: Mode): void => {
    if (m === mode) return
    void setMode(m)
    const only = MODE_PAGES[route.name]
    if (only && !only.includes(m)) navigate(m === 'dev' ? { name: 'briefing' } : { name: 'home' })
    else if (route.name === 'project') navigate({ name: 'projects' })
  }

  return (
    <aside
      className="relative flex w-56 shrink-0 flex-col border-r border-line/80"
      style={{ background: 'color-mix(in srgb, var(--color-sidebar) 78%, transparent)', backdropFilter: 'blur(20px)' }}
    >
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-xl text-[15px] font-extrabold text-white shadow-md"
          style={{ background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-2))', fontFamily: 'var(--font-display)' }}
        >
          S
        </span>
        <div className="leading-tight">
          <div className="text-[15px] font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Studyhall
          </div>
          <div className="text-[11px] text-muted">{MODES.find((m) => m.mode === mode)?.label}</div>
        </div>
      </div>

      {shown.length > 1 && (
        <div className="relative mx-3 mb-3 grid rounded-xl bg-line/50 p-1" style={{ gridTemplateColumns: `repeat(${shown.length}, 1fr)` }} role="tablist" aria-label="Category">
          <span
            className="absolute top-1 bottom-1 left-1 rounded-lg shadow-sm transition-transform duration-300"
            style={{
              width: `calc((100% - 0.5rem) / ${shown.length})`,
              transform: `translateX(${index * 100}%)`,
              background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-2))'
            }}
          />
          {shown.map((m) => (
            <button
              key={m.mode}
              role="tab"
              aria-selected={mode === m.mode}
              onClick={() => switchTo(m.mode)}
              className={`relative z-10 rounded-lg py-1 text-xs font-semibold transition-colors ${mode === m.mode ? 'text-white' : 'text-muted hover:text-ink'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      <button
        onClick={() => openSearch()}
        className="mx-3 mb-3 flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-left text-sm text-muted transition-colors hover:border-accent/40 hover:text-ink"
        style={{ background: 'color-mix(in srgb, var(--color-panel) 70%, transparent)' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span className="flex-1">Search</span>
        <kbd className="rounded border border-line px-1 text-[10px]">Ctrl K</kbd>
      </button>

      <nav className="flex min-h-0 flex-col gap-2.5 overflow-auto px-3 pb-2">
        {groups.map((group, gi) => {
          const items = group.items.filter((item) => item.modes.includes(mode))
          if (!items.length) return null
          const title = group.title === 'category' ? MODES.find((m) => m.mode === mode)?.label : group.title
          return (
            <div key={gi} className="flex flex-col gap-0.5">
              {title && <div className="px-2.5 pb-1 text-[10px] font-semibold tracking-[0.08em] text-muted/80 uppercase">{title}</div>}
              {items.map((item) => {
                const active = item.match.includes(route.name)
                return (
                  <button
                    key={item.label}
                    onClick={() => navigate(item.route)}
                    className={`group relative flex h-[30px] shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] transition-colors ${
                      active ? 'bg-accent-soft font-semibold text-ink' : 'text-muted hover:bg-line/50 hover:text-ink'
                    }`}
                  >
                    {active && (
                      <span className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full" style={{ background: 'linear-gradient(var(--color-accent), var(--color-accent-2))' }} />
                    )}
                    <Icon name={item.icon} className={active ? 'text-accent' : 'opacity-80 group-hover:opacity-100'} />
                    <span className="flex-1">{item.label}</span>
                    {badge(item.label) > 0 && (
                      <span className="rounded-full px-1.5 text-[10px] font-bold text-white" style={{ background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-2))' }}>
                        {badge(item.label)}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}
      </nav>
      <div className="mt-auto flex flex-col gap-3 px-4 py-3">
        <UpdateBanner />
        <MiniTimer />
        <SaveIndicator />
      </div>
    </aside>
  )
}

/** Shows the running/paused timer from any page; click to open the Focus room. */
function MiniTimer(): React.JSX.Element | null {
  const s = useTimerState()
  const remaining = useRemaining(s)
  if (!s || (!s.running && remaining >= s.durationMs)) return null
  return (
    <button
      onClick={() => navigate({ name: 'focus' })}
      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm ${s.phase === 'focus' ? 'bg-danger/10 text-danger' : 'bg-ok/10 text-ok'}`}
    >
      <Icon name={s.running ? 'focus' : 'pause'} size={15} />
      <span className="flex-1">{PHASE_LABEL[s.phase]}</span>
      <span className="font-semibold tabular-nums">{fmtClock(remaining)}</span>
    </button>
  )
}
