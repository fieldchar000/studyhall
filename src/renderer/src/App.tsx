import { MobileBar, Sidebar } from './components/Sidebar'
import { useEffect } from 'react'
import { goBack, navigate } from './lib/nav'
import { setDrawer } from './lib/platform'
import { TaskDrawer } from './components/TaskDrawer'
import { useRoute } from './lib/nav'
import { ClientDetailPage, ClientsPage } from './pages/Clients'
import { FocusPage } from './pages/Focus'
import { HomePage } from './pages/Home'
import { BrainPage } from './pages/Brain'
import { OculusPage } from './pages/Oculus'
import { ModuleDetailPage } from './pages/ModuleDetail'
import { ModulesPage } from './pages/Modules'
import { MaterialsPage } from './pages/Materials'
import { RecallPage } from './pages/Recall'
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
import { LanguageDetailPage, LanguagesPage } from './pages/Languages'
import { HabitsPage } from './pages/Habits'
import { ExamsPage, PaperPage, QuizPage } from './pages/Exams'
import { JournalPage } from './pages/Journal'
import { PeoplePage } from './pages/People'
import { PartnerPage } from './pages/Partner'
import { LibraryPage } from './pages/Library'
import { MoneyPage } from './pages/Money'
import { BriefingPage } from './pages/dev/Briefing'
import { FeedsPage } from './pages/dev/Feeds'
import { ReadingPage } from './pages/dev/Reading'
import { CodexPage } from './pages/dev/Codex'
import { ForecastsPage } from './pages/dev/Forecasts'
import { DevKitUnlock } from './components/DevKitUnlock'
import { SearchPalette } from './components/SearchPalette'
import { FriendsPage } from './pages/Friends'
import { ServersPage } from './pages/Servers'
import { InviteLinkHandler } from './components/InviteLinkHandler'

export function App(): React.JSX.Element {
  const route = useRoute()
  // The phone's back button: close the menu, else go back a page, else home, else leave the app.
  useEffect(() => {
    const onBack = (e: Event): void => {
      if (document.documentElement.classList.contains('drawer-open')) setDrawer(false)
      else if (document.querySelector('[data-modal]')) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      else if (!goBack()) {
        if (route.name !== 'home') navigate({ name: 'home' })
        else return
      }
      e.preventDefault()
    }
    window.addEventListener('studyhall:back', onBack)
    return () => window.removeEventListener('studyhall:back', onBack)
  }, [route.name])
  return (
    <div className="app-shell flex h-full">
      <MobileBar />
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-auto">
        {route.name === 'home' && <HomePage />}
        {route.name === 'brain' && <BrainPage key={route.q ?? ''} q={route.q} />}
        {route.name === 'oculus' && <OculusPage />}
        {route.name === 'tasks' && <TasksPage />}
        {route.name === 'projects' && <ProjectsPage />}
        {route.name === 'project' && <ProjectDetailPage key={route.id} id={route.id} />}
        {route.name === 'modules' && <ModulesPage />}
        {route.name === 'materials' && <MaterialsPage />}
        {route.name === 'recall' && <RecallPage />}
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
        {route.name === 'languages' && <LanguagesPage />}
        {route.name === 'language' && <LanguageDetailPage key={route.id} id={route.id} />}
        {route.name === 'habits' && <HabitsPage />}
        {route.name === 'exams' && <ExamsPage />}
        {route.name === 'journal' && <JournalPage key={route.date ?? 'today'} date={route.date} />}
        {route.name === 'people' && <PeoplePage key={route.id ?? 'list'} id={route.id} />}
        {route.name === 'partner' && <PartnerPage />}
        {route.name === 'library' && <LibraryPage />}
        {route.name === 'money' && <MoneyPage />}
        {route.name === 'briefing' && <BriefingPage />}
        {route.name === 'feeds' && <FeedsPage />}
        {route.name === 'reading' && <ReadingPage />}
        {route.name === 'codex' && <CodexPage />}
        {route.name === 'forecasts' && <ForecastsPage />}
        {route.name === 'paper' && <PaperPage key={route.id + String(route.timed)} id={route.id} timed={route.timed} tab={route.tab} />}
        {route.name === 'quiz' && <QuizPage key={JSON.stringify(route)} paperId={route.paperId} moduleId={route.moduleId} review={route.review} />}
        {route.name === 'friends' && <FriendsPage />}
        {route.name === 'servers' && <ServersPage key={route.serverId ?? ''} serverId={route.serverId} channelId={route.channelId} />}
        {route.name === 'focus' && <FocusPage />}
        {route.name === 'settings' && <SettingsPage />}
      </main>
      <TaskDrawer />
      <SearchPalette />
      <InviteLinkHandler />
      <DevKitUnlock />
    </div>
  )
}
