// Database schema, as an ordered list of migrations.
// NEVER edit a migration that has shipped — add a new one at the end instead.
// Each runs once, inside a transaction, and is recorded in schema_migrations.

// Columns every syncable table gets (sync-ready from day one).
const base = `
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  owner_id TEXT NOT NULL`

export const migrations: string[] = [
  // 1 — Phase 1: profile, modules/weeks/materials/assessments, calendar
  `
  -- Local-only key/value settings (window position, local profile id, ...)
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  -- Rows changed locally that still need pushing to the cloud (Phase 5)
  CREATE TABLE sync_outbox (
    table_name TEXT NOT NULL,
    row_id TEXT NOT NULL,
    queued_at TEXT NOT NULL,
    PRIMARY KEY (table_name, row_id)
  );

  CREATE TABLE profiles (${base},
    username TEXT,
    display_name TEXT NOT NULL DEFAULT 'Me',
    mode TEXT NOT NULL DEFAULT 'study' CHECK (mode IN ('study','work')),
    grade_scale TEXT,
    target_gpa REAL,
    leaderboard_opt_in INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE modules (${base},
    code TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT 'Untitled module',
    color TEXT NOT NULL DEFAULT '#6366f1',
    term TEXT NOT NULL DEFAULT '',
    credits REAL,
    target_grade REAL,
    archived INTEGER NOT NULL DEFAULT 0,
    sort REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE weeks (${base},
    module_id TEXT NOT NULL REFERENCES modules(id),
    number INTEGER NOT NULL DEFAULT 1,
    title TEXT NOT NULL DEFAULT '',
    start_date TEXT
  );
  CREATE INDEX idx_weeks_module ON weeks(module_id);

  CREATE TABLE materials (${base},
    module_id TEXT NOT NULL REFERENCES modules(id),
    week_id TEXT NOT NULL REFERENCES weeks(id),
    title TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('pdf','html','slides','other')),
    file_name TEXT NOT NULL,
    local_path TEXT,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    sha256 TEXT,
    sync_file INTEGER NOT NULL DEFAULT 0,
    storage_path TEXT,
    sort REAL NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_materials_week ON materials(week_id);

  CREATE TABLE assessments (${base},
    module_id TEXT NOT NULL REFERENCES modules(id),
    title TEXT NOT NULL DEFAULT 'New assessment',
    kind TEXT NOT NULL DEFAULT 'assignment'
      CHECK (kind IN ('exam','assignment','quiz','presentation','lab','other')),
    due_at TEXT,
    weight_pct REAL,
    score_pct REAL,
    is_final INTEGER NOT NULL DEFAULT 0,
    auto_revision INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_assessments_module ON assessments(module_id);
  CREATE INDEX idx_assessments_due ON assessments(due_at);

  CREATE TABLE events (${base},
    title TEXT NOT NULL DEFAULT 'New event',
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    all_day INTEGER NOT NULL DEFAULT 0,
    color TEXT,
    notes TEXT NOT NULL DEFAULT '',
    task_id TEXT,                                 -- tasks table arrives in Phase 2
    module_id TEXT REFERENCES modules(id),
    assessment_id TEXT REFERENCES assessments(id)
  );
  CREATE INDEX idx_events_start ON events(start_at);

  CREATE TABLE calendar_subscriptions (${base},
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#0ea5e9',
    enabled INTEGER NOT NULL DEFAULT 1,
    last_fetched_at TEXT,
    last_error TEXT
  );

  -- Local-only cache of ICS feed occurrences (never synced, rebuilt on refresh)
  CREATE TABLE subscription_events (
    id TEXT PRIMARY KEY,
    subscription_id TEXT NOT NULL,
    uid TEXT NOT NULL,
    title TEXT NOT NULL,
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    all_day INTEGER NOT NULL DEFAULT 0,
    location TEXT
  );
  CREATE INDEX idx_subevents_sub ON subscription_events(subscription_id);
  CREATE INDEX idx_subevents_start ON subscription_events(start_at);
  `,

  // 2 — Phase 2: tasks & projects engine, clients, focus sessions, reminders
  `
  CREATE TABLE clients (${base},
    name TEXT NOT NULL DEFAULT 'New client',
    color TEXT NOT NULL DEFAULT '#0ea5e9',
    notes TEXT NOT NULL DEFAULT '',
    archived INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE projects (${base},
    title TEXT NOT NULL DEFAULT 'New project',
    description TEXT NOT NULL DEFAULT '',
    mode TEXT NOT NULL DEFAULT 'study' CHECK (mode IN ('study','work')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','on_hold','done')),
    deadline TEXT,
    color TEXT NOT NULL DEFAULT '#5b5bd6',
    module_id TEXT REFERENCES modules(id),
    client_id TEXT REFERENCES clients(id),
    sort REAL NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_projects_mode ON projects(mode);

  CREATE TABLE milestones (${base},
    project_id TEXT NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL DEFAULT 'Milestone',
    due_at TEXT,
    done_at TEXT,
    sort REAL NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_milestones_project ON milestones(project_id);

  CREATE TABLE tasks (${base},
    title TEXT NOT NULL DEFAULT 'New task',
    notes TEXT NOT NULL DEFAULT '',
    mode TEXT NOT NULL DEFAULT 'study' CHECK (mode IN ('study','work')),
    status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('inbox','todo','doing','done')),
    priority INTEGER NOT NULL DEFAULT 0,
    due_at TEXT,
    labels TEXT NOT NULL DEFAULT '[]',
    parent_task_id TEXT REFERENCES tasks(id),
    project_id TEXT REFERENCES projects(id),
    milestone_id TEXT REFERENCES milestones(id),
    module_id TEXT REFERENCES modules(id),
    assessment_id TEXT REFERENCES assessments(id),
    client_id TEXT REFERENCES clients(id),
    today_date TEXT,
    today_rank INTEGER,
    sort REAL NOT NULL DEFAULT 0,
    completed_at TEXT
  );
  CREATE INDEX idx_tasks_mode_status ON tasks(mode, status);
  CREATE INDEX idx_tasks_parent ON tasks(parent_task_id);
  CREATE INDEX idx_tasks_project ON tasks(project_id);
  CREATE INDEX idx_tasks_due ON tasks(due_at);

  CREATE TABLE focus_sessions (${base},
    kind TEXT NOT NULL DEFAULT 'focus',
    started_at TEXT NOT NULL,
    ended_at TEXT,
    planned_minutes INTEGER NOT NULL,
    focused_seconds INTEGER NOT NULL DEFAULT 0,
    completed INTEGER NOT NULL DEFAULT 0,
    mode TEXT,
    task_id TEXT REFERENCES tasks(id),
    module_id TEXT REFERENCES modules(id),
    project_id TEXT REFERENCES projects(id),
    shared_timer_id TEXT
  );
  CREATE INDEX idx_focus_started ON focus_sessions(started_at);

  -- Local-only: which reminders were already shown (so each fires once)
  CREATE TABLE notifications_sent (key TEXT PRIMARY KEY, sent_at TEXT NOT NULL);
  `,

  // 3 — Phase 3: timetable, notes, mindmaps, flashcards, final grades
  `
  ALTER TABLE modules ADD COLUMN final_grade REAL;

  CREATE TABLE timetable_slots (${base},
    module_id TEXT NOT NULL REFERENCES modules(id),
    kind TEXT NOT NULL DEFAULT 'lecture' CHECK (kind IN ('lecture','tutorial','lab','seminar','other')),
    weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
    start_time TEXT NOT NULL DEFAULT '09:00',
    end_time TEXT NOT NULL DEFAULT '10:00',
    location TEXT NOT NULL DEFAULT '',
    valid_from TEXT,
    valid_to TEXT
  );
  CREATE INDEX idx_slots_module ON timetable_slots(module_id);

  CREATE TABLE notes (${base},
    title TEXT NOT NULL DEFAULT 'Untitled note',
    content TEXT NOT NULL DEFAULT '',
    plain_text TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT 'note' CHECK (kind IN ('note','meeting')),
    mode TEXT NOT NULL DEFAULT 'study' CHECK (mode IN ('study','work')),
    module_id TEXT REFERENCES modules(id),
    week_id TEXT REFERENCES weeks(id),
    project_id TEXT REFERENCES projects(id),
    client_id TEXT REFERENCES clients(id),
    meeting_at TEXT,
    pinned INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_notes_module ON notes(module_id);
  CREATE INDEX idx_notes_mode ON notes(mode);

  CREATE TABLE mindmaps (${base},
    title TEXT NOT NULL DEFAULT 'Untitled mindmap',
    mode TEXT NOT NULL DEFAULT 'study' CHECK (mode IN ('study','work')),
    module_id TEXT REFERENCES modules(id)
  );

  CREATE TABLE mindmap_nodes (${base},
    mindmap_id TEXT NOT NULL REFERENCES mindmaps(id),
    label TEXT NOT NULL DEFAULT 'Idea',
    x REAL NOT NULL DEFAULT 0,
    y REAL NOT NULL DEFAULT 0,
    color TEXT,
    link_type TEXT CHECK (link_type IN ('module','note','task')),
    link_id TEXT
  );
  CREATE INDEX idx_mmnodes_map ON mindmap_nodes(mindmap_id);

  CREATE TABLE mindmap_edges (${base},
    mindmap_id TEXT NOT NULL REFERENCES mindmaps(id),
    source_node_id TEXT NOT NULL REFERENCES mindmap_nodes(id),
    target_node_id TEXT NOT NULL REFERENCES mindmap_nodes(id),
    label TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX idx_mmedges_map ON mindmap_edges(mindmap_id);

  CREATE TABLE flashcard_decks (${base},
    name TEXT NOT NULL DEFAULT 'New deck',
    module_id TEXT REFERENCES modules(id)
  );

  CREATE TABLE flashcards (${base},
    deck_id TEXT NOT NULL REFERENCES flashcard_decks(id),
    front TEXT NOT NULL DEFAULT '',
    back TEXT NOT NULL DEFAULT '',
    ease REAL NOT NULL DEFAULT 2.5,
    interval_days INTEGER NOT NULL DEFAULT 0,
    repetitions INTEGER NOT NULL DEFAULT 0,
    due_at TEXT,
    last_reviewed_at TEXT
  );
  CREATE INDEX idx_cards_deck ON flashcards(deck_id);
  CREATE INDEX idx_cards_due ON flashcards(due_at);
  `
]
