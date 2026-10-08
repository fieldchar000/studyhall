import type { Mode } from '@shared/types'
import { navigate, useRoute, type Route } from '@/lib/nav'
import { useMode } from '@/lib/profile'
import { fmtClock, PHASE_LABEL, useRemaining, useTimerState } from '@/lib/timer'
import { Icon, SaveIndicator } from './ui'

interface NavItem {
  label: string
  icon: string
  route: Route
  match: Route['name'][]
  modes: Mode[]
}

// The Study/Work switch (Settings) changes which pages appear here.
const items: NavItem[] = [
  { label: 'Home', icon: 'home', route: { name: 'home' }, match: ['home'], modes: ['study', 'work'] },
  { label: 'Tasks', icon: 'tasks', route: { name: 'tasks' }, match: ['tasks'], modes: ['study', 'work'] },
  { label: 'Projects', icon: 'projects', route: { name: 'projects' }, match: ['projects', 'project'], modes: ['study', 'work'] },
  { label: 'Modules', icon: 'modules', route: { name: 'modules' }, match: ['modules', 'module'], modes: ['study'] },
  { label: 'Clients', icon: 'clients', route: { name: 'clients' }, match: ['clients', 'client'], modes: ['work'] },
  { label: 'Focus', icon: 'focus', route: { name: 'focus' }, match: ['focus'], modes: ['study', 'work'] },
  { label: 'Settings', icon: 'settings', route: { name: 'settings' }, match: ['settings'], modes: ['study', 'work'] }
]

export function Sidebar(): React.JSX.Element {
  const route = useRoute()
  const mode = useMode()
  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-line bg-sidebar">
      <div className="flex items-center gap-2 px-4 pt-5 pb-4">
        <span className="text-base font-semibold tracking-tight">Studyhall</span>
        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent uppercase">{mode}</span>
      </div>
      <nav className="flex flex-col gap-0.5 px-2">
        {items
          .filter((item) => item.modes.includes(mode))
          .map((item) => {
            const active = item.match.includes(route.name)
            return (
              <button
                key={item.label}
                onClick={() => navigate(item.route)}
                className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm ${
                  active ? 'bg-accent-soft font-medium text-accent' : 'text-muted hover:bg-line/50 hover:text-ink'
                }`}
              >
                <Icon name={item.icon} />
                {item.label}
              </button>
            )
          })}
      </nav>
      <div className="mt-auto flex flex-col gap-3 px-4 py-3">
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
