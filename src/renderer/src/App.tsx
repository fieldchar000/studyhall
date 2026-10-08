import { Sidebar } from './components/Sidebar'
import { TaskDrawer } from './components/TaskDrawer'
import { useRoute } from './lib/nav'
import { ClientDetailPage, ClientsPage } from './pages/Clients'
import { FocusPage } from './pages/Focus'
import { HomePage } from './pages/Home'
import { ModuleDetailPage } from './pages/ModuleDetail'
import { ModulesPage } from './pages/Modules'
import { ProjectDetailPage } from './pages/ProjectDetail'
import { ProjectsPage } from './pages/Projects'
import { SettingsPage } from './pages/Settings'
import { TasksPage } from './pages/Tasks'

export function App(): React.JSX.Element {
  const route = useRoute()
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-auto">
        {route.name === 'home' && <HomePage />}
        {route.name === 'tasks' && <TasksPage />}
        {route.name === 'projects' && <ProjectsPage />}
        {route.name === 'project' && <ProjectDetailPage key={route.id} id={route.id} />}
        {route.name === 'modules' && <ModulesPage />}
        {route.name === 'module' && <ModuleDetailPage key={route.id} id={route.id} tab={route.tab} />}
        {route.name === 'clients' && <ClientsPage />}
        {route.name === 'client' && <ClientDetailPage key={route.id} id={route.id} />}
        {route.name === 'focus' && <FocusPage />}
        {route.name === 'settings' && <SettingsPage />}
      </main>
      <TaskDrawer />
    </div>
  )
}
