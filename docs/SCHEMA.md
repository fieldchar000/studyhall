# Data model

Every **synced** table has: `id` (UUID), `created_at`, `updated_at`, `deleted_at` (soft delete),
`owner_id`. Times are ISO-8601 UTC; all-day dates are `YYYY-MM-DD`. Sync is last-write-wins on
`updated_at`. In Phase 5, Row Level Security policies key on `owner_id` plus membership/sharing.

Status: ✅ built (migration 1) · ⏳ planned phase

## Personal (local, synced to the cloud when signed in)

| Table | Fields → links | Status |
|---|---|---|
| profiles | username, display_name, mode (study/work), grade_scale (JSON), target_gpa, leaderboard_opt_in | ✅ |
| modules | code, name, color, term, credits, target_grade, final_grade (transcript override), archived, sort | ✅ |
| weeks | → module, number, title, start_date | ✅ |
| materials | → week, → module, title, kind (pdf/html/slides/other), file_name, local_path, size_bytes, sha256, sync_file, storage_path, sort | ✅ |
| assessments | → module, title, kind, due_at, weight_pct, score_pct, is_final, auto_revision | ✅ |
| events | title, start_at, end_at, all_day, color, notes, → task?, → module?, → assessment? | ✅ |
| calendar_subscriptions | name, url, color, enabled, last_fetched_at, last_error | ✅ |
| clients | name, color, notes, archived | ✅ |
| projects | title, description, mode, deadline, status (active/on_hold/done), color, → module?, → client?, sort | ✅ |
| milestones | → project, title, due_at, done_at, sort | ✅ |
| tasks | title, notes, status (inbox/todo/doing/done), priority, due_at, labels (JSON), → parent_task, → project, → milestone, → module, → assessment, → client, today_rank, today_date, sort, completed_at | ✅ |
| focus_sessions | started_at, ended_at, planned_minutes, focused_seconds, kind, completed, mode, → module, → task, → project, → shared_timer | ✅ |
| timetable_slots | → module, kind (lecture/tutorial/lab/seminar/other), weekday (1=Mon…7=Sun), start/end time, location, valid_from/to (expanded virtually onto the calendar) | ✅ |
| notes | title, content (TipTap JSON), plain_text, kind (note/meeting), mode, pinned, meeting_at, → module, → week, → project, → client | ✅ |
| mindmaps | title, mode, → module? | ✅ |
| mindmap_nodes | → mindmap, label, x, y, color, link_type + link_id | ✅ |
| mindmap_edges | → mindmap, source_node, target_node, label | ✅ |
| flashcard_decks | name, → module? | ✅ |
| flashcards | → deck, front, back, ease, interval_days, repetitions, due_at, last_reviewed_at (SM-2) | ✅ |
| videos | url, youtube_id, title, author, thumbnail_url, start_seconds, tags (JSON), notes, mode, → module? | ✅ |
| inbox_items | text, processed_at, converted_to_type + converted_to_id | ✅ |
| game_state | currency, state (JSON: owned buildings, focus level, lastTick, totals) — one row per profile | ✅ |

## Social (cloud only, Phase 5) — see supabase/social.sql

All tables have Row Level Security; the rules are tested by `node scripts/rls-test.cjs`.

| Table | Fields | Who can see / change it |
|---|---|---|
| user_directory | id (= auth user), username, display_name, is_admin | you, your friends, people in your servers; only display_name is editable |
| friendships | user_a, user_b (symmetric pair) | the two people; created only by redeeming an invite |
| invites | code, kind (friend/server), created_by, → server?, max_uses, use_count, expires_at, revoked_at | creator (and server owner/mods); used via check_invite / redeem_invite / the sign-up trigger |
| servers | name, owner_id | members; owner/mods rename; owner deletes |
| server_members | → server, → user, role (owner/mod/member) | members; owner kicks and sets roles; members can leave |
| channels | → server, name, kind (text/study_room), sort, room_key (video room name) | members; owner/mods manage |
| messages | → channel, author_id, body, created_at, deleted_at | members read/post; authors, owner and mods delete |
| channel_states | → channel, → user, last_read_at (unread), muted | only you |
| shares | resource_type (module/note), resource_id, owner_id, shared_with, permission (view/edit) | owner and recipient; only with friends |
| presence | user_id, status (online/focusing/break), focus_ends_at, last_seen | you and your friends |
| shared_timers | → channel, phase, running, ends_at, remaining_ms, focus_min, break_min | server members |
| room_participants | → channel, → user, last_seen | server members; joining goes through room_join() which enforces the 6-person cap |

Sign-up is invite-only: a trigger on auth.users rejects any sign-up without a valid code
(and creates the user_directory row + friendship/server membership). Usernames map to
`<username>@users.studyhall.invalid` (a reserved domain — no email is ever sent).

Synced personal tables (above) exist in the cloud with the same columns plus
`server_updated_at` (pull cursor). A trigger (sync_guard) makes the newer `updated_at`
win, clamps PC clocks that are ahead, and stops rows changing owner.

## Local-only (never synced)

`settings` (key/value: prefs incl. quick-capture shortcut and Spotify links, window state, timer state), `notifications_sent` (reminders already shown), `sync_outbox` (changed rows awaiting push), `subscription_events`
(ICS cache, rebuilt on refresh), `schema_migrations`.
