import { Sidebar } from './components/Sidebar'
import { useRoute } from './lib/nav'
import { HomePage } from './pages/Home'
import { ModulesPage } from './pages/Modules'
import { ModuleDetailPage } from './pages/ModuleDetail'
import { SettingsPage } from './pages/Settings'

export function App(): React.JSX.Element {
  const route = useRoute()
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-auto">
        {route.name === 'home' && <HomePage />}
        {route.name === 'modules' && <ModulesPage />}
        {route.name === 'module' && <ModuleDetailPage key={route.id} id={route.id} tab={route.tab} />}
        {route.name === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}
