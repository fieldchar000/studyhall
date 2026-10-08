// Types shared by the main process, preload and the React UI.

/** Columns every syncable table has (see docs/SCHEMA.md). */
export interface BaseRow {
  id: string // UUID
  created_at: string // ISO-8601 UTC
  updated_at: string // ISO-8601 UTC, used for last-write-wins sync
  deleted_at: string | null // soft delete: set instead of removing the row
  owner_id: string // profile that owns the row
}

export interface Module extends BaseRow {
  code: string
  name: string
  color: string
  term: string
  credits: number | null
  target_grade: number | null // percent, e.g. 70
  archived: number // 0 | 1
  sort: number
  final_grade: number | null // optional override, e.g. from a transcript (percent)
}

export interface Week extends BaseRow {
  module_id: string
  number: number
  title: string
  start_date: string | null // YYYY-MM-DD
}

export type MaterialKind = 'pdf' | 'html' | 'slides' | 'other'

export interface Material extends BaseRow {
  module_id: string
  week_id: string
  title: string
  kind: MaterialKind
  file_name: string // original file name
  local_path: string | null // path relative to the app data folder
  size_bytes: number
  sha256: string | null
  sync_file: number // 0 | 1 — opt-in cloud upload (Phase 5)
  storage_path: string | null // cloud storage key (Phase 5)
  sort: number
}

export type AssessmentKind = 'exam' | 'assignment' | 'quiz' | 'presentation' | 'lab' | 'other'

export interface Assessment extends BaseRow {
  module_id: string
  title: string
  kind: AssessmentKind
  due_at: string | null // ISO UTC
  weight_pct: number | null
  score_pct: number | null
  is_final: number // 0 | 1
  auto_revision: number // 0 | 1 (Phase 3)
}

export interface CalEvent extends BaseRow {
  title: string
  start_at: string // ISO UTC, or YYYY-MM-DD when all_day
  end_at: string // exclusive end; same format rules as start_at
  all_day: number
  color: string | null
  notes: string
  task_id: string | null
  module_id: string | null
  assessment_id: string | null
}

export interface CalendarSubscription extends BaseRow {
  name: string
  url: string
  color: string
  enabled: number
  last_fetched_at: string | null
  last_error: string | null
}

/** Cached occurrence from an ICS feed. Local-only, rebuilt on every refresh. */
export interface SubscriptionEvent {
  id: string
  subscription_id: string
  uid: string
  title: string
  start_at: string
  end_at: string
  all_day: number
  location: string | null
}

export type Mode = 'study' | 'work'

export interface Profile extends BaseRow {
  username: string | null
  display_name: string
  mode: Mode
  grade_scale: string | null
  target_gpa: number | null
  leaderboard_opt_in: number
}

export interface Client extends BaseRow {
  name: string
  color: string
  notes: string
  archived: number
}

export type ProjectStatus = 'active' | 'on_hold' | 'done'

export interface Project extends BaseRow {
  title: string
  description: string
  mode: Mode
  status: ProjectStatus
  deadline: string | null // ISO UTC
  color: string
  module_id: string | null
  client_id: string | null
  sort: number
}

export interface Milestone extends BaseRow {
  project_id: string
  title: string
  due_at: string | null
  done_at: string | null
  sort: number
}

export type TaskStatus = 'inbox' | 'todo' | 'doing' | 'done'

export interface Task extends BaseRow {
  title: string
  notes: string
  mode: Mode
  status: TaskStatus
  priority: number // 0 none, 1 low, 2 medium, 3 high
  due_at: string | null // ISO UTC
  labels: string // JSON array of strings
  parent_task_id: string | null // set = this is a subtask
  project_id: string | null
  milestone_id: string | null
  module_id: string | null
  assessment_id: string | null
  client_id: string | null
  today_date: string | null // YYYY-MM-DD when in that day's Top 3
  today_rank: number | null // 1..3
  sort: number
  completed_at: string | null
}

export interface FocusSession extends BaseRow {
  kind: 'focus'
  started_at: string
  ended_at: string | null
  planned_minutes: number
  focused_seconds: number
  completed: number
  mode: Mode | null
  task_id: string | null
  module_id: string | null
  project_id: string | null
  shared_timer_id: string | null
}

export type SlotKind = 'lecture' | 'tutorial' | 'lab' | 'seminar' | 'other'

/** A weekly recurring class. Shown on the calendar for every matching week. */
export interface TimetableSlot extends BaseRow {
  module_id: string
  kind: SlotKind
  weekday: number // 1 = Monday … 7 = Sunday
  start_time: string // HH:MM local
  end_time: string
  location: string
  valid_from: string | null // YYYY-MM-DD (term start)
  valid_to: string | null // YYYY-MM-DD (term end)
}

export interface Note extends BaseRow {
  title: string
  content: string // TipTap JSON document
  plain_text: string // for search
  kind: 'note' | 'meeting'
  mode: Mode
  module_id: string | null
  week_id: string | null
  project_id: string | null
  client_id: string | null
  meeting_at: string | null // ISO, meeting notes only
  pinned: number
}

export interface Mindmap extends BaseRow {
  title: string
  mode: Mode
  module_id: string | null
}

export type NodeLinkType = 'module' | 'note' | 'task'

export interface MindmapNode extends BaseRow {
  mindmap_id: string
  label: string
  x: number
  y: number
  color: string | null
  link_type: NodeLinkType | null
  link_id: string | null
}

export interface MindmapEdge extends BaseRow {
  mindmap_id: string
  source_node_id: string
  target_node_id: string
  label: string
}

export interface FlashcardDeck extends BaseRow {
  name: string
  module_id: string | null
}

export interface Flashcard extends BaseRow {
  deck_id: string
  front: string
  back: string
  ease: number // SM-2 ease factor (starts at 2.5)
  interval_days: number
  repetitions: number
  due_at: string | null // null = new card, due now
  last_reviewed_at: string | null
}

export interface Video extends BaseRow {
  url: string
  youtube_id: string
  title: string
  author: string
  thumbnail_url: string | null
  start_seconds: number
  tags: string // JSON array
  notes: string
  mode: Mode
  module_id: string | null
}

export interface InboxItem extends BaseRow {
  text: string
  processed_at: string | null
  converted_to_type: 'task' | 'note' | null
  converted_to_id: string | null
}

export interface GameRow extends BaseRow {
  currency: number
  state: string // JSON GameData
}

/** What the idle game remembers (inside game_state.state). */
export interface GameData {
  owned: Record<string, number> // building id -> count
  focusLevel: number // upgrade: coins per focus minute
  lastTick: string // ISO: passive income is counted from here
  totalEarned: number
  focusMinutesCredited: number
}

/** Result of oEmbed lookups (title/thumbnail) for YouTube or Spotify links. */
export interface EmbedInfo {
  title: string
  author: string
  thumbnail_url: string | null
}

export interface SearchResult {
  type: 'task' | 'note' | 'module' | 'project' | 'client' | 'assessment' | 'material' | 'flashcard' | 'video' | 'event' | 'inbox' | 'mindmap' | 'deck'
  id: string
  title: string
  snippet: string
  parent_id: string | null // module for assessment/material, deck for flashcard, mindmap for node
}

export interface SpotifyLink {
  url: string
  title: string
  thumbnail_url: string | null
}

/** One row of a grade scale: at or above `min` percent you get `label` / `points`. */
export interface GradeBand {
  min: number
  label: string
  points: number
}

/** Maps each table the UI may read/write through the generic API to its row type. */
export interface TableMap {
  profiles: Profile
  modules: Module
  weeks: Week
  materials: Material
  assessments: Assessment
  events: CalEvent
  calendar_subscriptions: CalendarSubscription
  clients: Client
  projects: Project
  milestones: Milestone
  tasks: Task
  focus_sessions: FocusSession
  timetable_slots: TimetableSlot
  notes: Note
  mindmaps: Mindmap
  mindmap_nodes: MindmapNode
  mindmap_edges: MindmapEdge
  flashcard_decks: FlashcardDeck
  flashcards: Flashcard
  videos: Video
  inbox_items: InboxItem
  game_state: GameRow
}
export type TableName = keyof TableMap

export type Where = Record<string, string | number | null>

export interface AssessmentWithModule extends Assessment {
  module_code: string
  module_name: string
  module_color: string
}

export interface CalendarRange {
  events: (CalEvent & { task_status: TaskStatus | null })[]
  external: (SubscriptionEvent & { color: string; subscription_name: string })[]
  assessments: AssessmentWithModule[]
  tasks: Task[] // open tasks with a due date in range (current mode)
  classes: ClassOccurrence[] // timetable slots expanded into this range (study mode)
}

export interface ClassOccurrence {
  id: string // slot id + date
  slot_id: string
  module_id: string
  title: string
  start_at: string // ISO
  end_at: string
  location: string
  color: string
}

/** One row of the "Upcoming deadlines" panel: an assessment or a task. */
export interface Deadline {
  kind: 'assessment' | 'task'
  id: string
  title: string
  due_at: string
  color: string
  subtitle: string
  module_id: string | null
  weight_pct: number | null
}

// ---------- Focus timer (lives in the main process so it runs while hidden) ----------

export type TimerPhase = 'focus' | 'short_break' | 'long_break'

export interface TimerSettings {
  focusMin: number
  shortMin: number
  longMin: number
  longEvery: number // long break after this many focus rounds
  autoStartBreaks: boolean
  autoStartFocus: boolean
}

export interface TimerContext {
  taskId: string | null
  moduleId: string | null
  projectId: string | null
}

export interface TimerState extends TimerContext {
  phase: TimerPhase
  running: boolean
  endsAt: number | null // epoch ms while running
  remainingMs: number // while paused/idle
  durationMs: number
  roundsDone: number // focus rounds finished in the current cycle
  sessionId: string | null // focus_sessions row being recorded
}

export interface Prefs {
  closeToTray: boolean
  launchAtLogin: boolean
  notifyDeadlines: boolean
  notifyTimer: boolean
  quickCaptureShortcut: string // Electron accelerator, '' = off
  spotifyLinks: SpotifyLink[]
}

/** The API the preload script exposes to the UI as window.api. */
export interface Api {
  list<T extends TableName>(table: T, where?: Where, orderBy?: string): Promise<TableMap[T][]>
  get<T extends TableName>(table: T, id: string): Promise<TableMap[T] | null>
  create<T extends TableName>(table: T, values: Partial<TableMap[T]>): Promise<TableMap[T]>
  update<T extends TableName>(table: T, id: string, patch: Partial<TableMap[T]>): Promise<TableMap[T]>
  remove(table: TableName, id: string): Promise<void>

  materials: {
    pickAndImport(weekId: string): Promise<Material[]>
    importPaths(weekId: string, paths: string[]): Promise<Material[]>
    openExternal(id: string): Promise<void>
    showInFolder(id: string): Promise<void>
    /** Real file path of a file dropped onto the window. */
    pathForFile(file: File): string
  }
  calendar: {
    range(startIso: string, endIso: string, mode: Mode): Promise<CalendarRange>
    refreshSubscriptions(id?: string): Promise<void>
    upcomingDeadlines(limit: number, mode: Mode): Promise<Deadline[]>
  }
  profile: {
    get(): Promise<Profile>
    update(patch: Partial<Profile>): Promise<Profile>
  }
  timer: {
    state(): Promise<TimerState>
    start(): Promise<void>
    pause(): Promise<void>
    reset(): Promise<void>
    skip(): Promise<void>
    setContext(ctx: Partial<TimerContext>): Promise<void>
    settings(): Promise<TimerSettings>
    setSettings(patch: Partial<TimerSettings>): Promise<TimerSettings>
    onState(cb: (s: TimerState) => void): () => void
  }
  prefs: {
    get(): Promise<Prefs>
    set(patch: Partial<Prefs>): Promise<Prefs>
  }
  embed: {
    /** Title/author/thumbnail for a YouTube or Spotify link (needs internet). */
    lookup(url: string): Promise<EmbedInfo | null>
    /** Open a Spotify link in the Spotify desktop app (falls back to the browser). */
    openSpotify(url: string): Promise<void>
  }
  search(query: string): Promise<SearchResult[]>
  capture: {
    hide(): void
    /** Whether the global shortcut could be registered (false = taken by another app). */
    shortcutStatus(): Promise<{ accelerator: string; registered: boolean }>
  }
  game: {
    /** Coins earned from focus sessions since the last visit are added server-side; returns the row. */
    get(): Promise<GameRow>
  }
  /** A row changed in another window (e.g. quick capture). */
  onDbChanged(cb: (table: string) => void): () => void
  app: {
    dataPath(): Promise<string>
    openDataFolder(): Promise<void>
    version(): Promise<string>
    /** Main asks the UI to write any pending (debounced) edits before closing. */
    onFlushRequest(cb: () => void): () => void
    flushed(): void
    /** Fired when ICS feeds have been re-downloaded. */
    onCalendarUpdated(cb: () => void): () => void
    /** The quick-capture window was just shown (focus the input). */
    onCaptureShow(cb: () => void): () => void
    /** Main asks the UI to open a page (e.g. from the tray menu). */
    onNavigate(cb: (page: string) => void): () => void
  }
}
