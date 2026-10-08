import { navigate, useRoute, type Route } from '@/lib/nav'
import { Icon, SaveIndicator } from './ui'

const items: { label: string; icon: string; route: Route; match: Route['name'][] }[] = [
  { label: 'Home', icon: 'home', route: { name: 'home' }, match: ['home'] },
  { label: 'Modules', icon: 'modules', route: { name: 'modules' }, match: ['modules', 'module'] },
  { label: 'Settings', icon: 'settings', route: { name: 'settings' }, match: ['settings'] }
]

export function Sidebar(): React.JSX.Element {
  const route = useRoute()
  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-line bg-sidebar">
      <div className="px-4 pt-5 pb-4 text-base font-semibold tracking-tight">Studyhall</div>
      <nav className="flex flex-col gap-0.5 px-2">
        {items.map((item) => {
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
      <div className="mt-auto px-4 py-3">
        <SaveIndicator />
      </div>
    </aside>
  )
}
