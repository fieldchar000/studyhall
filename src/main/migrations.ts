// Database schema, as an ordered list of migrations.
// NEVER edit a migration that has shipped — add a new one at the end instead.
// Each runs once, inside a transaction, and is recorded in schema_migrations.
// A migration can also be a function, for changes SQL alone can't do in SQLite
// (like widening a CHECK constraint, which means rebuilding the table).

import type { DatabaseSync } from 'node:sqlite'

export type Migration = string | ((db: DatabaseSync) => void)

// Columns every syncable table gets (sync-ready from day one).
const base = `
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  owner_id TEXT NOT NULL`

export const migrations: Migration[] = [
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
  `,

  // 4 — Phase 4: YouTube videos, quick-capture inbox, idle game
  `
  CREATE TABLE videos (${base},
    url TEXT NOT NULL,
    youtube_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    author TEXT NOT NULL DEFAULT '',
    thumbnail_url TEXT,
    start_seconds INTEGER NOT NULL DEFAULT 0,
    tags TEXT NOT NULL DEFAULT '[]',
    notes TEXT NOT NULL DEFAULT '',
    mode TEXT NOT NULL DEFAULT 'study' CHECK (mode IN ('study','work')),
    module_id TEXT REFERENCES modules(id)
  );

  CREATE TABLE inbox_items (${base},
    text TEXT NOT NULL,
    processed_at TEXT,
    converted_to_type TEXT,
    converted_to_id TEXT
  );

  -- One row per profile. state = JSON (owned buildings, upgrades, timestamps)
  CREATE TABLE game_state (${base},
    currency REAL NOT NULL DEFAULT 0,
    state TEXT NOT NULL DEFAULT '{}'
  );
  `,

  // 5 — Life category (languages, habits); focus sessions can be about a language
  (db) => {
    // Rebuild the tables whose CHECK only allowed study/work (SQLite's documented way).
    for (const table of ['profiles', 'projects', 'tasks', 'notes', 'mindmaps', 'videos']) {
      const { sql } = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as { sql: string }
      const widened = sql.replaceAll("CHECK (mode IN ('study','work'))", "CHECK (mode IN ('study','work','life'))")
      if (widened === sql) throw new Error(`mode check not found on ${table}`)
      const indexes = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL").all(table) as { sql: string }[]
      db.exec(widened.replace(/^CREATE TABLE "?\w+"?/, `CREATE TABLE ${table}__new`))
      db.exec(`INSERT INTO ${table}__new SELECT * FROM ${table}`)
      db.exec(`DROP TABLE ${table}`)
      db.exec(`ALTER TABLE ${table}__new RENAME TO ${table}`)
      for (const i of indexes) db.exec(i.sql)
    }
    db.exec(`
    CREATE TABLE languages (${base},
      name TEXT NOT NULL DEFAULT 'New language',
      native_name TEXT NOT NULL DEFAULT '',
      code TEXT NOT NULL DEFAULT '',
      flag TEXT NOT NULL DEFAULT '🌐',
      color TEXT NOT NULL DEFAULT '#6366f1',
      level TEXT NOT NULL DEFAULT 'A0',
      target_level TEXT NOT NULL DEFAULT 'A2',
      target_date TEXT,
      daily_goal_min INTEGER NOT NULL DEFAULT 15,
      deck_id TEXT REFERENCES flashcard_decks(id),
      resources TEXT NOT NULL DEFAULT '[]',
      why TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      sort REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE language_logs (${base},
      language_id TEXT NOT NULL REFERENCES languages(id),
      date TEXT NOT NULL,
      minutes INTEGER NOT NULL DEFAULT 0,
      skill TEXT NOT NULL DEFAULT 'vocab'
        CHECK (skill IN ('listening','speaking','reading','writing','vocab','grammar')),
      activity TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX idx_langlogs_lang ON language_logs(language_id, date);

    CREATE TABLE habits (${base},
      name TEXT NOT NULL DEFAULT 'New habit',
      emoji TEXT NOT NULL DEFAULT '✅',
      color TEXT NOT NULL DEFAULT '#10b981',
      days_per_week INTEGER NOT NULL DEFAULT 7 CHECK (days_per_week BETWEEN 1 AND 7),
      archived INTEGER NOT NULL DEFAULT 0,
      sort REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE habit_checks (${base},
      habit_id TEXT NOT NULL REFERENCES habits(id),
      date TEXT NOT NULL
    );
    CREATE INDEX idx_habitchecks_habit ON habit_checks(habit_id, date);

    ALTER TABLE focus_sessions ADD COLUMN language_id TEXT REFERENCES languages(id);
    `)
  },

  // 6 — Exam prep (papers, quizzes, attempts), more Life (journal, library, money),
  //     language practice progress, and which categories (study/work/life) you use
  `
  ALTER TABLE profiles ADD COLUMN enabled_modes TEXT NOT NULL DEFAULT '["study","life"]';
  ALTER TABLE profiles ADD COLUMN currency TEXT NOT NULL DEFAULT '';

  CREATE TABLE exam_papers (${base},
    module_id TEXT REFERENCES modules(id),
    title TEXT NOT NULL DEFAULT 'Untitled paper',
    kind TEXT NOT NULL DEFAULT 'past_paper' CHECK (kind IN ('past_paper','mark_scheme','mock','practice','other')),
    year TEXT NOT NULL DEFAULT '',
    paired_id TEXT,
    duration_min INTEGER,
    total_marks REAL,
    file_name TEXT NOT NULL DEFAULT '',
    local_path TEXT,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    sha256 TEXT,
    sync_file INTEGER NOT NULL DEFAULT 0,
    storage_path TEXT,
    notes TEXT NOT NULL DEFAULT '',
    sort REAL NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_papers_module ON exam_papers(module_id);

  CREATE TABLE quiz_questions (${base},
    paper_id TEXT REFERENCES exam_papers(id),
    module_id TEXT REFERENCES modules(id),
    number TEXT NOT NULL DEFAULT '',
    prompt TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT 'open' CHECK (kind IN ('mcq','open')),
    options TEXT NOT NULL DEFAULT '[]',
    answer TEXT NOT NULL DEFAULT '',
    marks REAL,
    topic TEXT NOT NULL DEFAULT '',
    sort REAL NOT NULL DEFAULT 0,
    times_seen INTEGER NOT NULL DEFAULT 0,
    times_right INTEGER NOT NULL DEFAULT 0,
    ease REAL NOT NULL DEFAULT 2.5,
    interval_days INTEGER NOT NULL DEFAULT 0,
    repetitions INTEGER NOT NULL DEFAULT 0,
    due_at TEXT
  );
  CREATE INDEX idx_questions_paper ON quiz_questions(paper_id);
  CREATE INDEX idx_questions_module ON quiz_questions(module_id);

  CREATE TABLE paper_attempts (${base},
    paper_id TEXT REFERENCES exam_papers(id),
    module_id TEXT REFERENCES modules(id),
    kind TEXT NOT NULL DEFAULT 'timed' CHECK (kind IN ('timed','quiz')),
    date TEXT NOT NULL,
    duration_sec INTEGER NOT NULL DEFAULT 0,
    score REAL,
    max_score REAL,
    notes TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX idx_attempts_paper ON paper_attempts(paper_id);

  CREATE TABLE journal_entries (${base},
    date TEXT NOT NULL,
    mood INTEGER CHECK (mood BETWEEN 1 AND 5),
    energy INTEGER CHECK (energy BETWEEN 1 AND 5),
    sleep_hours REAL,
    gratitude TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]'
  );
  CREATE INDEX idx_journal_date ON journal_entries(date);

  CREATE TABLE media_items (${base},
    kind TEXT NOT NULL DEFAULT 'book' CHECK (kind IN ('book','film','show','anime','game','podcast')),
    title TEXT NOT NULL DEFAULT 'Untitled',
    creator TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'want' CHECK (status IN ('want','doing','done','dropped')),
    progress INTEGER NOT NULL DEFAULT 0,
    total INTEGER,
    rating INTEGER CHECK (rating BETWEEN 1 AND 5),
    notes TEXT NOT NULL DEFAULT '',
    started_at TEXT,
    finished_at TEXT,
    color TEXT NOT NULL DEFAULT '#6366f1',
    sort REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE money_entries (${base},
    date TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    kind TEXT NOT NULL DEFAULT 'expense' CHECK (kind IN ('expense','income')),
    category TEXT NOT NULL DEFAULT 'Other',
    note TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX idx_money_date ON money_entries(date);

  CREATE TABLE budgets (${base},
    category TEXT NOT NULL,
    monthly REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE savings_goals (${base},
    name TEXT NOT NULL DEFAULT 'New goal',
    target REAL NOT NULL DEFAULT 100,
    saved REAL NOT NULL DEFAULT 0,
    deadline TEXT,
    color TEXT NOT NULL DEFAULT '#10b981',
    sort REAL NOT NULL DEFAULT 0
  );

  -- Practice progress for built-in language content (kana, starter words, phrases…)
  CREATE TABLE lang_items (${base},
    language_id TEXT NOT NULL REFERENCES languages(id),
    kind TEXT NOT NULL,
    item_key TEXT NOT NULL,
    seen INTEGER NOT NULL DEFAULT 0,
    correct INTEGER NOT NULL DEFAULT 0,
    streak INTEGER NOT NULL DEFAULT 0,
    last_at TEXT
  );
  CREATE INDEX idx_langitems_lang ON lang_items(language_id, kind);
  `,

  // 7 — DevKit category (unlockable): feeds, reading list, forecasts, dev projects
  (db) => {
    for (const table of ['profiles', 'projects', 'tasks', 'notes', 'mindmaps', 'videos']) {
      const { sql } = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as { sql: string }
      const widened = sql.replaceAll("CHECK (mode IN ('study','work','life'))", "CHECK (mode IN ('study','work','life','dev'))")
      if (widened === sql) throw new Error(`mode check not found on ${table}`)
      const indexes = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL").all(table) as { sql: string }[]
      db.exec(widened.replace(/^CREATE TABLE "?\w+"?/, `CREATE TABLE ${table}__new`))
      db.exec(`INSERT INTO ${table}__new SELECT * FROM ${table}`)
      db.exec(`DROP TABLE ${table}`)
      db.exec(`ALTER TABLE ${table}__new RENAME TO ${table}`)
      for (const i of indexes) db.exec(i.sql)
    }
    db.exec(`
    ALTER TABLE profiles ADD COLUMN devkit INTEGER NOT NULL DEFAULT 0;

    ALTER TABLE projects ADD COLUMN kind TEXT NOT NULL DEFAULT '';
    ALTER TABLE projects ADD COLUMN stage TEXT NOT NULL DEFAULT '';
    ALTER TABLE projects ADD COLUMN repo_url TEXT NOT NULL DEFAULT '';
    ALTER TABLE projects ADD COLUMN links TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE projects ADD COLUMN tech TEXT NOT NULL DEFAULT '';

    CREATE TABLE feeds (${base},
      name TEXT NOT NULL DEFAULT 'Feed',
      url TEXT NOT NULL,
      topic TEXT NOT NULL DEFAULT 'other',
      lean TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      sort REAL NOT NULL DEFAULT 0
    );

    -- Local-only cache of fetched articles (never synced; refetched from the feeds)
    CREATE TABLE feed_items (
      id TEXT PRIMARY KEY,
      feed_id TEXT NOT NULL,
      guid TEXT NOT NULL,
      title TEXT NOT NULL,
      link TEXT NOT NULL DEFAULT '',
      author TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      published_at TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      read_at TEXT,
      UNIQUE (feed_id, guid)
    );
    CREATE INDEX idx_feeditems_pub ON feed_items(published_at);
    CREATE INDEX idx_feeditems_feed ON feed_items(feed_id);

    CREATE TABLE saved_items (${base},
      url TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      topic TEXT NOT NULL DEFAULT 'other',
      lean TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      published_at TEXT,
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'later' CHECK (status IN ('later','read','archived'))
    );

    CREATE TABLE predictions (${base},
      question TEXT NOT NULL DEFAULT '',
      probability REAL NOT NULL DEFAULT 50,
      topic TEXT NOT NULL DEFAULT 'other',
      resolve_by TEXT,
      outcome INTEGER CHECK (outcome IN (0, 1)),
      resolved_at TEXT,
      reasoning TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE devlogs (${base},
      project_id TEXT NOT NULL REFERENCES projects(id),
      date TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'log',
      content TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX idx_devlogs_project ON devlogs(project_id, date);

    CREATE TABLE experiments (${base},
      project_id TEXT NOT NULL REFERENCES projects(id),
      name TEXT NOT NULL DEFAULT 'Experiment',
      date TEXT NOT NULL,
      hypothesis TEXT NOT NULL DEFAULT '',
      config TEXT NOT NULL DEFAULT '',
      metric_name TEXT NOT NULL DEFAULT '',
      metric_value REAL,
      result TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','running','done','failed'))
    );
    CREATE INDEX idx_experiments_project ON experiments(project_id);
    `)
  }
]
