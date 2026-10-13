import { useEffect } from 'react'
import type { Mode } from '@shared/types'
import { api, useLive } from '@/lib/data'
import { navigate, useRoute, type Route } from '@/lib/nav'
import { setMode, useEnabledModes, useMode, useProfile } from '@/lib/profile'
import { fmtClock, PHASE_LABEL, useRemaining, useTimerState } from '@/lib/timer'
import { setModeAccent } from '@/lib/appearance'
import { openSearch } from './SearchPalette'
import { useCloud } from '@/lib/cloud'
import { UpdateBanner } from './UpdateBanner'
import { Icon, SaveIndicator } from './ui'
import { setDrawer, useDrawer } from '@/lib/platform'

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
      { label: 'Brain', icon: 'brain', route: { name: 'brain' }, match: ['brain'], modes: ALL },
      { label: 'Briefing', icon: 'news', route: { name: 'briefing' }, match: ['briefing'], modes: ['dev'] },
      { label: 'Home', icon: 'home', route: { name: 'home' }, match: ['home'], modes: ['study', 'work', 'life'] },
      { label: 'Inbox', icon: 'inbox', route: { name: 'inbox' }, match: ['inbox'], modes: ALL },
      { label: 'Tasks', icon: 'tasks', route: { name: 'tasks' }, match: ['tasks'], modes: ALL },
      { label: 'Focus', icon: 'focus', route: { name: 'focus' }, match: ['focus'], modes: ALL }
    ]
  },
  {
    title: 'category',
    items: [
      // Study
      { label: 'Modules', icon: 'modules', route: { name: 'modules' }, match: ['modules', 'module'], modes: ['study'] },
      { label: 'Materials', icon: 'materials', route: { name: 'materials' }, match: ['materials'], modes: ['study'] },
      { label: 'Active recall', icon: 'recall', route: { name: 'recall' }, match: ['recall'], modes: ['study'] },
      projects('Projects', ['study']),
      { label: 'Exam Prep', icon: 'exam', route: { name: 'exams' }, match: ['exams', 'paper', 'quiz'], modes: ['study'] },
      { label: 'Timetable', icon: 'calendar', route: { name: 'timetable' }, match: ['timetable'], modes: ['study'] },
      // Work
      { label: 'Clients', icon: 'clients', route: { name: 'clients' }, match: ['clients', 'client'], modes: ['work'] },
      projects('Projects', ['work']),
      { label: 'Meeting notes', icon: 'pen', route: { name: 'notes' }, match: ['notes'], modes: ['work'] },
      // Life
      { label: 'Languages', icon: 'globe', route: { name: 'languages' }, match: ['languages', 'language'], modes: ['life'] },
      { label: 'Habits', icon: 'flame', route: { name: 'habits' }, match: ['habits'], modes: ['life'] },
      { label: 'Daily journal', icon: 'quill', route: { name: 'journal' }, match: ['journal'], modes: ['life'] },
      { label: 'People', icon: 'users', route: { name: 'people' }, match: ['people'], modes: ['life'] },
      { label: 'Partner', icon: 'heart', route: { name: 'partner' }, match: ['partner'], modes: ['life'] },
      { label: 'Library', icon: 'book', route: { name: 'library' }, match: ['library'], modes: ['life'] },
      { label: 'Money', icon: 'wallet', route: { name: 'money' }, match: ['money'], modes: ['life'] },
      projects('Goals', ['life']),
      // DevKit
      { label: 'Feeds', icon: 'rss', route: { name: 'feeds' }, match: ['feeds'], modes: ['dev'] },
      { label: 'Reading list', icon: 'bookmark', route: { name: 'reading' }, match: ['reading'], modes: ['dev'] },
      { label: 'Codex', icon: 'scroll', route: { name: 'codex' }, match: ['codex'], modes: ['dev'] },
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
  materials: ['study'],
  recall: ['study'],
  people: ['life'],
  partner: ['life'],
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
  const partnerLabel = useProfile()?.partner_label || 'Partner'
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
    <aside className="spine on-dark relative flex w-56 shrink-0 flex-col border-r" aria-label="Menu">
      <div className="flex items-center gap-3 px-4 pt-5 pb-4">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-[20px] leading-none text-on-accent"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600, boxShadow: '0 0 0 2px var(--color-sidebar), 0 0 0 3px var(--color-brass)' }}
          aria-hidden
        >
          S
        </span>
        <div className="leading-tight">
          <div className="text-[19px] font-semibold tracking-[-0.01em]" style={{ fontFamily: 'var(--font-display)' }}>
            Studyhall
          </div>
          <div className="label-caps mt-0.5" style={{ fontSize: 9.5 }}>
            {MODES.find((m) => m.mode === mode)?.label}
          </div>
        </div>
      </div>

      {shown.length > 1 && (
        <div
          className="relative mx-3 mb-3 grid rounded-lg border border-line p-0.5"
          style={{ gridTemplateColumns: `repeat(${shown.length}, 1fr)`, background: 'color-mix(in srgb, var(--color-line) 35%, transparent)' }}
          role="tablist"
          aria-label="Category"
        >
          <span
            className="absolute top-0.5 bottom-0.5 left-0.5 rounded-md border border-line bg-panel shadow-sm transition-transform duration-300"
            style={{ width: `calc((100% - 0.25rem) / ${shown.length})`, transform: `translateX(${index * 100}%)` }}
          />
          {shown.map((m) => (
            <button
              key={m.mode}
              role="tab"
              aria-selected={mode === m.mode}
              onClick={() => switchTo(m.mode)}
              className={`relative z-10 rounded-md py-1 text-xs font-semibold tracking-wide transition-colors ${mode === m.mode ? 'text-accent' : 'text-muted hover:text-ink'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      <button
        onClick={() => openSearch()}
        className="mx-3 mb-4 flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-1.5 text-left text-sm text-muted transition-colors hover:text-ink"
      >
        <Icon name="search" size={15} />
        <span className="flex-1">Search</span>
        <kbd className="rounded-sm border border-line px-1 font-sans text-[10px] max-md:hidden">Ctrl K</kbd>
      </button>

      <nav className="flex min-h-0 flex-col gap-4 overflow-auto px-3 pb-2">
        {groups.map((group, gi) => {
          const items = group.items.filter((item) => item.modes.includes(mode))
          if (!items.length) return null
          const title = group.title === 'category' ? MODES.find((m) => m.mode === mode)?.label : group.title
          return (
            <div key={gi} className="flex flex-col gap-0.5">
              {title && <div className="label-caps px-2.5 pb-1.5 !text-brass">{title}</div>}
              {items.map((item) => {
                const active = item.match.includes(route.name)
                return (
                  <button
                    key={item.label}
                    onClick={() => navigate(item.route)}
                    className={`group relative flex h-[30px] shrink-0 items-center gap-2.5 rounded-md px-2.5 text-left text-[13.5px] transition-colors ${
                      active ? 'bg-panel font-semibold text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:bg-line/45 hover:text-ink'
                    }`}
                  >
                    {active && (
                      <span className="absolute top-2 bottom-2 left-0 w-[2px] rounded-full bg-brass" />
                    )}
                    <Icon name={item.icon} size={17} weight={active ? 'regular' : 'light'} className={active ? 'text-accent' : 'opacity-90 group-hover:opacity-100'} />
                    <span className="flex-1">{item.label === 'Partner' ? partnerLabel : item.label}</span>
                    {badge(item.label) > 0 && (
                      <span className="rounded-full bg-accent px-1.5 text-[10px] font-bold text-on-accent">
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

/** The phone's top bar: menu button, the page you're on, search and the Brain. */
export function MobileBar(): React.JSX.Element {
  const route = useRoute()
  const mode = useMode()
  const open = useDrawer()
  const partnerLabel = useProfile()?.partner_label || 'Partner'
  const item = groups.flatMap((g) => g.items).find((i) => i.match.includes(route.name) && i.modes.includes(mode)) ?? groups.flatMap((g) => g.items).find((i) => i.match.includes(route.name))
  const title = item ? (item.label === 'Partner' ? partnerLabel : item.label) : 'Studyhall'
  return (
    <>
      <header className="mobile-bar spine on-dark flex items-center gap-1 px-2 md:hidden">
        <button className="flex h-11 w-11 items-center justify-center rounded-lg text-ink" onClick={() => setDrawer(!open)} aria-label="Menu">
          <Icon name="menu" size={22} />
        </button>
        <div className="min-w-0 flex-1 truncate text-[19px] font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
          {title}
        </div>
        <button className="flex h-11 w-11 items-center justify-center rounded-lg text-ink" onClick={() => openSearch()} aria-label="Search">
          <Icon name="search" size={20} />
        </button>
        <button className="flex h-11 w-11 items-center justify-center rounded-lg text-ink" onClick={() => navigate({ name: 'brain' })} aria-label="Brain">
          <Icon name="brain" size={20} />
        </button>
      </header>
      <div className="drawer-backdrop md:hidden" onClick={() => setDrawer(false)} />
    </>
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
