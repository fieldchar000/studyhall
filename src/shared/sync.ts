// Tables that sync between this PC and the cloud, parents before children
// (so a pull never inserts a week before its module).
// Local-only tables (settings, sync_outbox, subscription_events, notifications_sent,
// schema_migrations) are deliberately not listed.

export const SYNC_TABLES = [
  'profiles',
  'modules',
  'weeks',
  'materials',
  'assessments',
  'clients',
  'projects',
  'milestones',
  'tasks',
  'events',
  'calendar_subscriptions',
  'focus_sessions',
  'timetable_slots',
  'notes',
  'mindmaps',
  'mindmap_nodes',
  'mindmap_edges',
  'flashcard_decks',
  'flashcards',
  'videos',
  'inbox_items',
  'game_state'
] as const

export type SyncTable = (typeof SYNC_TABLES)[number]

/** Tables whose rows other people can see when you share them (read via Row Level Security). */
export const SHAREABLE = { module: 'modules', note: 'notes' } as const
