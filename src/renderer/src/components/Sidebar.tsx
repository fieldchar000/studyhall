import type { Mode } from '@shared/types'
import { api, useLive } from '@/lib/data'
import { navigate, useRoute, type Route } from '@/lib/nav'
import { setMode, useEnabledModes, useMode } from '@/lib/profile'
import { fmtClock, PHASE_LABEL, useRemaining, useTimerState } from '@/lib/timer'
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

const ALL: Mode[] = ['study', 'work', 'life']
const MODES: { mode: Mode; label: string }[] = [
  { mode: 'study', label: 'Study' },
  { mode: 'work', label: 'Work' },
  { mode: 'life', label: 'Life' }
]

// The Study / Work / Life switch at the top changes which pages appear here.
const projects = (label: string, modes: Mode[]): NavItem => ({ label, icon: 'projects', route: { name: 'projects' }, match: ['projects', 'project'], modes })
const groups: NavItem[][] = [
  [
    { label: 'Home', icon: 'home', route: { name: 'home' }, match: ['home'], modes: ALL },
    { label: 'Inbox', icon: 'upload', route: { name: 'inbox' }, match: ['inbox'], modes: ALL },
    { label: 'Tasks', icon: 'tasks', route: { name: 'tasks' }, match: ['tasks'], modes: ALL },
    { label: 'Focus', icon: 'focus', route: { name: 'focus' }, match: ['focus'], modes: ALL }
  ],
  [
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
    { label: 'Library', icon: 'cards', route: { name: 'library' }, match: ['library'], modes: ['life'] },
    { label: 'Money', icon: 'grades', route: { name: 'money' }, match: ['money'], modes: ['life'] },
    projects('Goals', ['life']),
    // Shared
    { label: 'Notes', icon: 'note', route: { name: 'notes' }, match: ['notes'], modes: ['study', 'life'] },
    { label: 'Mindmaps', icon: 'mindmap', route: { name: 'mindmaps' }, match: ['mindmaps', 'mindmap'], modes: ALL },
    { label: 'Flashcards', icon: 'cards', route: { name: 'flashcards' }, match: ['flashcards', 'deck'], modes: ['study', 'life'] },
    { label: 'Videos', icon: 'play', route: { name: 'videos' }, match: ['videos', 'video'], modes: ALL },
    { label: 'Grades', icon: 'grades', route: { name: 'grades' }, match: ['grades'], modes: ['study'] }
  ],
  [
    { label: 'Friends', icon: 'clients', route: { name: 'friends' }, match: ['friends'], modes: ALL },
    { label: 'Servers', icon: 'mindmap', route: { name: 'servers' }, match: ['servers'], modes: ALL }
  ],
  [
    { label: 'Stats', icon: 'grades', route: { name: 'stats' }, match: ['stats'], modes: ALL },
    { label: 'Pixel Quest', icon: 'game', route: { name: 'game' }, match: ['game'], modes: ALL },
    { label: 'Settings', icon: 'settings', route: { name: 'settings' }, match: ['settings'], modes: ALL }
  ]
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
  money: ['life']
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
  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-line bg-sidebar">
      <div className="px-4 pt-5 pb-2">
        <span className="text-base font-semibold tracking-tight">Studyhall</span>
      </div>
      {enabled.length > 1 && (
      <div className="mx-2 mb-2 grid gap-0.5 rounded-lg bg-line/60 p-0.5" style={{ gridTemplateColumns: `repeat(${enabled.length}, 1fr)` }} role="tablist" aria-label="Category">
        {MODES.filter((m) => enabled.includes(m.mode)).map((m) => (
          <button
            key={m.mode}
            role="tab"
            aria-selected={mode === m.mode}
            onClick={() => {
              if (m.mode === mode) return
              void setMode(m.mode)
              const only = MODE_PAGES[route.name]
              if (only && !only.includes(m.mode)) navigate({ name: 'home' })
              else if (route.name === 'project') navigate({ name: 'projects' })
            }}
            className={`rounded-md py-1 text-xs ${mode === m.mode ? 'bg-panel font-semibold text-accent shadow-sm' : 'text-muted hover:text-ink'}`}
          >
            {m.label}
          </button>
        ))}
      </div>
      )}
      <button
        onClick={() => openSearch()}
        className="mx-2 mb-2 flex items-center gap-2 rounded-md border border-line bg-panel px-2.5 py-1.5 text-left text-sm text-muted hover:text-ink"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span className="flex-1">Search</span>
        <kbd className="text-[10px]">Ctrl K</kbd>
      </button>
      <nav className="flex min-h-0 flex-col overflow-auto px-2">
        {groups.map((group, gi) => (
          <div key={gi} className={`flex flex-col gap-0.5 ${gi ? 'mt-1.5 border-t border-line pt-1.5' : ''}`}>
            {group
              .filter((item) => item.modes.includes(mode))
              .map((item) => {
                const active = item.match.includes(route.name)
                return (
                  <button
                    key={item.label}
                    onClick={() => navigate(item.route)}
                    className={`flex items-center gap-2.5 rounded-md px-2.5 py-1 text-left text-sm ${
                      active ? 'bg-accent-soft font-medium text-accent' : 'text-muted hover:bg-line/50 hover:text-ink'
                    }`}
                  >
                    <Icon name={item.icon} />
                    <span className="flex-1">{item.label}</span>
                    {badge(item.label) > 0 && (
                      <span className="rounded-full bg-accent px-1.5 text-[10px] font-semibold text-white">{badge(item.label)}</span>
                    )}
                  </button>
                )
              })}
          </div>
        ))}
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
      className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm ${
        s.phase === 'focus' ? 'bg-danger/10 text-danger' : 'bg-ok/10 text-ok'
      }`}
    >
      <Icon name={s.running ? 'focus' : 'pause'} size={15} />
      <span className="flex-1">{PHASE_LABEL[s.phase]}</span>
      <span className="font-semibold tabular-nums">{fmtClock(remaining)}</span>
    </button>
  )
}
