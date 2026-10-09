import type { GameData, SummonResult } from './game'

// Types shared by the main process, preload and the React UI.

import type { CloudApi } from './cloud'

export type UpdateState =
  | { status: 'idle' | 'checking' | 'none' | 'dev' }
  | { status: 'downloading'; version: string; percent: number }
  | { status: 'ready'; version: string }
  | { status: 'error'; message: string }

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

export type Mode = 'study' | 'work' | 'life' | 'dev'

export interface Profile extends BaseRow {
  username: string | null
  display_name: string
  mode: Mode
  enabled_modes: string // JSON Mode[]: the categories shown in the sidebar
  currency: string // e.g. "GBP" ('' = from the system locale)
  devkit: number // 1 once the DevKit category has been unlocked
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
  // DevKit projects
  kind: string // 'game' | 'ai' | 'tool' | 'web' | 'other'
  stage: string // 'idea' | 'prototype' | 'building' | 'polish' | 'shipped' | 'paused'
  repo_url: string
  links: string // JSON {title,url}[]
  tech: string // comma-separated
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
  language_id: string | null
}

export type LanguageSkill = 'listening' | 'speaking' | 'reading' | 'writing' | 'vocab' | 'grammar'

export interface LanguageResource {
  title: string
  url: string
}

export interface Language extends BaseRow {
  name: string
  native_name: string
  code: string // ISO 639-1, e.g. 'ja'
  flag: string
  color: string
  level: string // 'A0' (just starting) … 'C2'
  target_level: string
  target_date: string | null // YYYY-MM-DD, e.g. an exam date
  daily_goal_min: number
  deck_id: string | null // the language's vocabulary flashcard deck
  resources: string // JSON LanguageResource[]
  why: string
  active: number
  sort: number
}

export interface LanguageLog extends BaseRow {
  language_id: string
  date: string // YYYY-MM-DD (local)
  minutes: number
  skill: LanguageSkill
  activity: string
}

export interface Habit extends BaseRow {
  name: string
  emoji: string
  color: string
  days_per_week: number
  archived: number
  sort: number
}

export interface HabitCheck extends BaseRow {
  habit_id: string
  date: string // YYYY-MM-DD (local)
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
  sources: string // JSON: what a generated map was made from
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
  kind: '' | 'center' | 'branch' | 'leaf' | 'source' | 'theme' | 'group'
  detail: string // longer text (e.g. the sentence a point came from)
  url: string // web source (articles)
  source: string // which document it came from
  collapsed: number // children hidden
}

export interface MindmapEdge extends BaseRow {
  mindmap_id: string
  source_node_id: string
  target_node_id: string
  label: string
  kind: '' | 'related' // '' = branch (parent → child); related = cross-link
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

/** Things the player can do in Pixel Quest (all checked in the main process). */
export type GameAction =
  | { type: 'tick'; taps: number }
  | { type: 'summon'; count: 1 | 10; free?: boolean; ticket?: boolean }
  | { type: 'level'; hero: string; n: number }
  | { type: 'star'; hero: string }
  | { type: 'party'; party: string[] }
  | { type: 'boss'; taps: number; elapsed: number }
  | { type: 'autoBoss'; on: boolean }
  | { type: 'rebirth' }
  | { type: 'dismissAway' }

export interface GameResult {
  data: GameData
  summon?: SummonResult[]
  boss?: { win: boolean; gems: number }
  relics?: number
  error?: string
}

/** A document picked for import (old .doc/.ppt already converted to .docx/.pptx). */
export interface PickedDoc {
  name: string
  ext: string // docx | pptx | pdf | html | md | txt | odt | odp
  data: Uint8Array
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
  languages: Language
  language_logs: LanguageLog
  habits: Habit
  habit_checks: HabitCheck
  exam_papers: ExamPaper
  quiz_questions: QuizQuestion
  paper_attempts: PaperAttempt
  journal_entries: JournalEntry
  media_items: MediaItem
  money_entries: MoneyEntry
  budgets: Budget
  savings_goals: SavingsGoal
  lang_items: LangItem
  feeds: Feed
  saved_items: SavedItem
  predictions: Prediction
  devlogs: Devlog
  experiments: Experiment
}

export type FeedTopic = 'ai' | 'geo' | 'politics' | 'philosophy' | 'tech' | 'games' | 'science' | 'other'

export interface Feed extends BaseRow {
  name: string
  url: string
  topic: FeedTopic
  lean: string // politics: 'left' | 'lean-left' | 'centre' | 'lean-right' | 'right' | 'libertarian' | 'mixed'
  enabled: number
  sort: number
}

/** A fetched article (kept on this PC only). */
export interface FeedItem {
  id: string
  feed_id: string
  guid: string
  title: string
  link: string
  author: string
  summary: string
  published_at: string
  fetched_at: string
  read_at: string | null
  // joined from the feed
  feed_name: string
  topic: FeedTopic
  lean: string
}

export interface SavedItem extends BaseRow {
  url: string
  title: string
  source: string
  topic: FeedTopic
  lean: string
  summary: string
  published_at: string | null
  notes: string
  status: 'later' | 'read' | 'archived'
}

export interface Prediction extends BaseRow {
  question: string
  probability: number // 1–99 (%)
  topic: FeedTopic
  resolve_by: string | null // YYYY-MM-DD
  outcome: 0 | 1 | null
  resolved_at: string | null
  reasoning: string
}

export interface Devlog extends BaseRow {
  project_id: string
  date: string
  kind: 'log' | 'win' | 'blocker' | 'idea'
  content: string
}

export interface Experiment extends BaseRow {
  project_id: string
  name: string
  date: string
  hypothesis: string
  config: string
  metric_name: string
  metric_value: number | null
  result: string
  status: 'planned' | 'running' | 'done' | 'failed'
}

export interface FeedStatus {
  refreshing: boolean
  lastRefresh: string | null
  errors: Record<string, string> // feed id → problem
}

export interface RepoInfo {
  full_name: string
  description: string
  stars: number
  forks: number
  open_issues: number
  language: string
  pushed_at: string
  html_url: string
  commits: { sha: string; message: string; date: string; url: string }[]
}

export type PaperKind = 'past_paper' | 'mark_scheme' | 'mock' | 'practice' | 'other'

export interface ExamPaper extends BaseRow {
  module_id: string | null
  title: string
  kind: PaperKind
  year: string
  paired_id: string | null // the mark scheme for a paper (or the paper for a mark scheme)
  duration_min: number | null
  total_marks: number | null
  file_name: string
  local_path: string | null
  size_bytes: number
  sha256: string | null
  sync_file: number
  storage_path: string | null
  notes: string
  sort: number
}

export interface QuizQuestion extends BaseRow {
  paper_id: string | null
  module_id: string | null
  number: string // "3(b)"
  prompt: string
  kind: 'mcq' | 'open'
  options: string // JSON string[]
  answer: string
  marks: number | null
  topic: string
  sort: number
  times_seen: number
  times_right: number
  ease: number
  interval_days: number
  repetitions: number
  due_at: string | null
}

export interface PaperAttempt extends BaseRow {
  paper_id: string | null
  module_id: string | null
  kind: 'timed' | 'quiz'
  date: string
  duration_sec: number
  score: number | null
  max_score: number | null
  notes: string
}

export interface JournalEntry extends BaseRow {
  date: string // YYYY-MM-DD, one per day
  mood: number | null // 1–5
  energy: number | null // 1–5
  sleep_hours: number | null
  gratitude: string // newline-separated
  content: string
  tags: string // JSON string[]
}

export type MediaKind = 'book' | 'film' | 'show' | 'anime' | 'game' | 'podcast'
export type MediaStatus = 'want' | 'doing' | 'done' | 'dropped'

export interface MediaItem extends BaseRow {
  kind: MediaKind
  title: string
  creator: string
  status: MediaStatus
  progress: number // pages / episodes / hours
  total: number | null
  rating: number | null
  notes: string
  started_at: string | null
  finished_at: string | null
  color: string
  sort: number
}

export interface MoneyEntry extends BaseRow {
  date: string
  amount: number // always positive; kind says which way
  kind: 'expense' | 'income'
  category: string
  note: string
}

export interface Budget extends BaseRow {
  category: string
  monthly: number
}

export interface SavingsGoal extends BaseRow {
  name: string
  target: number
  saved: number
  deadline: string | null
  color: string
  sort: number
}

export interface LangItem extends BaseRow {
  language_id: string
  kind: string // 'kana' | 'word' | 'phrase' | 'number' | 'tone'
  item_key: string
  seen: number
  correct: number
  streak: number
  last_at: string | null
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
  languageId?: string | null
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
  notifyMessages: boolean
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
    /** Open the full Spotify web player in a Studyhall window (sign in once; full tracks). */
    openPlayer(url?: string): Promise<{ widevine: boolean }>
  }
  search(query: string): Promise<SearchResult[]>
  capture: {
    hide(): void
    /** Whether the global shortcut could be registered (false = taken by another app). */
    shortcutStatus(): Promise<{ accelerator: string; registered: boolean }>
  }
  papers: {
    pick(moduleId: string | null): Promise<ExamPaper[]>
    importPaths(moduleId: string | null, paths: string[]): Promise<ExamPaper[]>
    /** The paper's contents (for finding questions). */
    doc(id: string): Promise<PickedDoc | null>
    openExternal(id: string): Promise<void>
  }
  feeds: {
    /** Articles from your feeds (newest first). */
    items(opts: { topic?: string; feedId?: string; unread?: boolean; limit?: number; q?: string }): Promise<FeedItem[]>
    unreadCounts(): Promise<Record<string, number>>
    markRead(ids: string[], read: boolean): Promise<void>
    refresh(): Promise<FeedStatus>
    status(): Promise<FeedStatus>
    /** Adds the built-in feed list (first unlock). */
    seedDefaults(): Promise<number>
    /** The web page of an article, for the reader view. */
    article(url: string): Promise<string>
    onChange(cb: () => void): () => void
  }
  github: {
    repo(url: string): Promise<RepoInfo>
  }
  docs: {
    /** File picker for documents to import; returns their bytes. */
    pick(title: string): Promise<PickedDoc[]>
    /** Read dropped files (paths from materials.pathForFile). */
    read(paths: string[]): Promise<PickedDoc[]>
    docxToHtml(data: Uint8Array): Promise<string>
    docxToText(data: Uint8Array): Promise<string>
  }
  game: {
    /** Current game state (fights up to now first). */
    get(): Promise<GameResult>
    act(action: GameAction): Promise<GameResult>
  }
  /** A row changed in another window (e.g. quick capture). */
  onDbChanged(cb: (table: string) => void): () => void
  /** Account, sync, friends, servers (Phase 5). */
  cloud: CloudApi
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
    /** Auto-update status (installed app only). */
    updateState(): Promise<UpdateState>
    checkUpdates(): Promise<UpdateState>
    installUpdate(): Promise<void>
    onUpdate(cb: (s: UpdateState) => void): () => void
    /** Main asks the UI to open a page (e.g. from the tray menu). */
    onNavigate(cb: (page: string) => void): () => void
  }
}
