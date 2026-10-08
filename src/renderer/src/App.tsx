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
import { TimetablePage } from './pages/Timetable'
import { NotesPage } from './pages/Notes'
import { MindmapEditorPage, MindmapsPage } from './pages/Mindmaps'
import { DeckPage, FlashcardsPage } from './pages/Flashcards'
import { GradesPage } from './pages/Grades'
import { InboxPage } from './pages/Inbox'
import { VideoPage, VideosPage } from './pages/Videos'
import { StatsPage } from './pages/Stats'
import { GamePage } from './pages/Game'
import { SearchPalette } from './components/SearchPalette'
import { FriendsPage } from './pages/Friends'
import { ServersPage } from './pages/Servers'
import { InviteLinkHandler } from './components/InviteLinkHandler'

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
        {route.name === 'timetable' && <TimetablePage />}
        {route.name === 'notes' && <NotesPage id={route.id} />}
        {route.name === 'mindmaps' && <MindmapsPage />}
        {route.name === 'mindmap' && <MindmapEditorPage key={route.id} id={route.id} />}
        {route.name === 'flashcards' && <FlashcardsPage />}
        {route.name === 'deck' && <DeckPage key={route.id} id={route.id} review={route.review} />}
        {route.name === 'grades' && <GradesPage />}
        {route.name === 'inbox' && <InboxPage />}
        {route.name === 'videos' && <VideosPage />}
        {route.name === 'video' && <VideoPage key={route.id} id={route.id} />}
        {route.name === 'stats' && <StatsPage />}
        {route.name === 'game' && <GamePage />}
        {route.name === 'friends' && <FriendsPage />}
        {route.name === 'servers' && <ServersPage key={route.serverId ?? ''} serverId={route.serverId} channelId={route.channelId} />}
        {route.name === 'focus' && <FocusPage />}
        {route.name === 'settings' && <SettingsPage />}
      </main>
      <TaskDrawer />
      <SearchPalette />
      <InviteLinkHandler />
    </div>
  )
}
