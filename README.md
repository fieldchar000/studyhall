# Studyhall

Local-first study & work planner for Windows. Everything autosaves; works fully offline.

## Install (for users)

Double-click `dist\Studyhall-Setup-<version>.exe`. Windows will say **"Windows protected your PC"**
(the app isn't code-signed — certificates cost money): click **More info → Run anyway**.
It installs for your user only (no admin prompt) and opens automatically.

Your data lives in `%APPDATA%\Studyhall` (database `studyhall.db` + `materials\` folder).
Uninstalling the app does **not** delete it. Back up by copying that folder while the app is closed.

## Develop

Requires Node.js 22+ (installed per-user at `%LOCALAPPDATA%\Programs\node-v24.19.0-win-x64`).

```
npm install        # also downloads Electron
npm run dev        # run with hot reload
npm run typecheck  # TypeScript check
npm run dist       # build the installer into dist\
```

Set `STUDYHALL_DATA_DIR` to a folder to run against throwaway test data.

## How it fits together

| Folder | What lives there |
|---|---|
| `src/main` | Electron main process: window, security, SQLite (`node:sqlite`, no native build), files, ICS feeds |
| `src/preload` | The typed bridge that exposes `window.api` to the UI (nothing else) |
| `src/renderer` | React + Tailwind UI |
| `src/shared` | Types shared by all three |
| `docs/SCHEMA.md` | The full data model, including future phases |

Security: `contextIsolation` on, `nodeIntegration` off, sandboxed renderer, strict CSP, IPC calls
only accepted from the app's own page, table/column names whitelisted, uploaded HTML runs in a
script-only sandbox with all network access blocked.

Sync-ready: every table has UUID `id`, `created_at`, `updated_at`, `deleted_at` (soft delete) and
`owner_id`; every local change is queued in `sync_outbox` for the Phase 5 cloud sync.

## Cloud (Supabase) — optional sign-in, sync, friends, servers

- `supabase/social.sql` — social tables, Row Level Security, sign-up trigger, RPC functions, storage
- `supabase/personal.sql` — generated from `src/main/migrations.ts` (cloud copies of synced tables)
- `node scripts/cloud-setup.cjs` — applies both to the project (safe to re-run after updates).
  Needs `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` in `.env` (never committed).
- `node scripts/rls-test.cjs` — security tests (run in a rolled-back transaction)
- `src/main/cloud/project.json` — project URL + publishable key (public by design)
- `.github/workflows/keepalive.yml` — pings Supabase every 3 days so the free project never pauses

All network access happens in the main process; the UI talks to it over IPC.
