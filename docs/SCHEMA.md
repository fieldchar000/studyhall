# Data model

Every **synced** table has: `id` (UUID), `created_at`, `updated_at`, `deleted_at` (soft delete),
`owner_id`. Times are ISO-8601 UTC; all-day dates are `YYYY-MM-DD`. Sync is last-write-wins on
`updated_at`. In Phase 5, Row Level Security policies key on `owner_id` plus membership/sharing.

Status: ✅ built (migration 1) · ⏳ planned phase

## Personal (local now, synced in Phase 5)

| Table | Fields → links | Status |
|---|---|---|
| profiles | username, display_name, mode (study/work), grade_scale (JSON), target_gpa, leaderboard_opt_in | ✅ |
| modules | code, name, color, term, credits, target_grade, archived, sort | ✅ |
| weeks | → module, number, title, start_date | ✅ |
| materials | → week, → module, title, kind (pdf/html/slides/other), file_name, local_path, size_bytes, sha256, sync_file, storage_path, sort | ✅ |
| assessments | → module, title, kind, due_at, weight_pct, score_pct, is_final, auto_revision | ✅ |
| events | title, start_at, end_at, all_day, color, notes, → task?, → module?, → assessment? | ✅ |
| calendar_subscriptions | name, url, color, enabled, last_fetched_at, last_error | ✅ |
| clients | name, color, notes | ⏳ 2 |
| projects | title, mode, deadline, status, color, → module?, → client? | ⏳ 2 |
| milestones | → project, title, due_at, done_at, sort | ⏳ 2 |
| tasks | title, notes, status (inbox/todo/doing/done), priority, due_at, labels (JSON), → parent_task, → project, → milestone, → module, → assessment, → client, today_rank, today_date, sort, completed_at | ⏳ 2 |
| focus_sessions | started_at, ended_at, planned_minutes, kind, completed, → module, → task, → project, → shared_timer | ⏳ 2 |
| timetable_slots | → module, kind, weekday, start/end time, location, valid_from/to (expanded virtually onto the calendar) | ⏳ 3 |
| notes | title, content (TipTap JSON), plain_text, kind (note/meeting), → module, → week, → project, → client | ⏳ 3 |
| mindmaps | title, → module? | ⏳ 3 |
| mindmap_nodes | → mindmap, label, x, y, color, link_type + link_id | ⏳ 3 |
| mindmap_edges | → mindmap, source_node, target_node, label | ⏳ 3 |
| flashcard_decks | name, → module? | ⏳ 3 |
| flashcards | → deck, front, back, ease, interval_days, repetitions, due_at, last_reviewed_at (SM-2) | ⏳ 3 |
| videos | url, youtube_id, title, thumbnail, author, tags (JSON), notes, → module? | ⏳ 4 |
| inbox_items | text, processed_at, converted_to_type + id | ⏳ 4 |
| game_state | currency, state (JSON) — one row per profile | ⏳ 4 |

## Social (cloud only, Phase 5)

| Table | Fields |
|---|---|
| friendships | requester, addressee, status (pending/accepted/blocked) |
| invites | code, kind (signup/friend/server), created_by, → server?, expires_at, max_uses, use_count |
| servers | name, icon, owner |
| server_members | → server, → user, role (owner/mod/member) |
| channels | → server, name, kind (text/study_room), sort |
| channel_states | → channel, → user, last_read_at, muted |
| messages | → channel, author, body, edited_at |
| shares | resource (module/note), shared_with, permission (view/edit) |
| shared_timers | → channel or creator, phase, started_at, duration, paused_remaining |

Presence ("who's studying now") uses Supabase Realtime presence, not a table.

## Local-only (never synced)

`settings` (key/value), `sync_outbox` (changed rows awaiting push), `subscription_events`
(ICS cache, rebuilt on refresh), `schema_migrations`.
