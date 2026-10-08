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

/** Maps each table the UI may read/write through the generic API to its row type. */
export interface TableMap {
  modules: Module
  weeks: Week
  materials: Material
  assessments: Assessment
  events: CalEvent
  calendar_subscriptions: CalendarSubscription
}
export type TableName = keyof TableMap

export type Where = Record<string, string | number | null>

export interface AssessmentWithModule extends Assessment {
  module_code: string
  module_name: string
  module_color: string
}

export interface CalendarRange {
  events: CalEvent[]
  external: (SubscriptionEvent & { color: string; subscription_name: string })[]
  assessments: AssessmentWithModule[]
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
    range(startIso: string, endIso: string): Promise<CalendarRange>
    refreshSubscriptions(id?: string): Promise<void>
    upcomingDeadlines(limit: number): Promise<AssessmentWithModule[]>
  }
  app: {
    dataPath(): Promise<string>
    openDataFolder(): Promise<void>
    version(): Promise<string>
    /** Main asks the UI to write any pending (debounced) edits before closing. */
    onFlushRequest(cb: () => void): () => void
    flushed(): void
    /** Fired when ICS feeds have been re-downloaded. */
    onCalendarUpdated(cb: () => void): () => void
  }
}
