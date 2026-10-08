// IPC handlers: the only way the UI can reach the database, files and network.

import { app, BrowserWindow, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { create, get, getDb, getProfileId, list, softDelete, update } from './db'
import { importPaths, openExternal, pickAndImport, showInFolder } from './files'
import { refreshSubscriptions } from './ics'
import { getPrefs, setPrefs, SHORTCUTS } from './prefs'
import { lookup, openSpotify } from './embeds'
import { search } from './search'
import { getGame } from './game'
import { registerCloudIpc } from './cloud/ipc'
import { spotifyParts } from '@shared/links'
import * as timer from './timer'
import type {
  AssessmentWithModule,
  CalendarRange,
  ClassOccurrence,
  TimetableSlot,
  Deadline,
  Mode,
  Prefs,
  Profile,
  Task,
  TimerContext,
  TimerSettings,
  Where
} from '@shared/types'

const asMode = (m: unknown): Mode => (m === 'work' ? 'work' : 'study')

const SLOT_LABEL: Record<string, string> = {
  lecture: 'Lecture',
  tutorial: 'Tutorial',
  lab: 'Lab',
  seminar: 'Seminar',
  other: 'Class'
}

/** Turn weekly timetable slots into concrete classes for each day in the range. */
function expandTimetable(startIso: string, endIso: string): ClassOccurrence[] {
  const slots = getDb()
    .prepare(
      `SELECT s.*, m.code AS module_code, m.name AS module_name, m.color AS module_color
       FROM timetable_slots s JOIN modules m ON m.id = s.module_id
       WHERE s.deleted_at IS NULL AND m.deleted_at IS NULL AND m.archived = 0`
    )
    .all() as unknown as (TimetableSlot & { module_code: string; module_name: string; module_color: string })[]
  if (!slots.length) return []

  const pad = (n: number): string => String(n).padStart(2, '0')
  const out: ClassOccurrence[] = []
  const day = new Date(startIso)
  day.setHours(0, 0, 0, 0)
  const end = new Date(endIso)
  for (; day < end; day.setDate(day.getDate() + 1)) {
    const weekday = ((day.getDay() + 6) % 7) + 1 // Mon=1 … Sun=7
    const date = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
    for (const s of slots) {
      if (s.weekday !== weekday) continue
      if (s.valid_from && date < s.valid_from) continue
      if (s.valid_to && date > s.valid_to) continue
      out.push({
        id: `${s.id}:${date}`,
        slot_id: s.id,
        module_id: s.module_id,
        title: `${s.module_code || s.module_name} ${SLOT_LABEL[s.kind] ?? 'Class'}`,
        start_at: new Date(`${date}T${s.start_time}`).toISOString(),
        end_at: new Date(`${date}T${s.end_time}`).toISOString(),
        location: s.location,
        color: s.module_color
      })
    }
  }
  return out
}

/** Only accept calls from our own UI (never from material iframes or anything else). */
function isTrusted(e: IpcMainInvokeEvent | Electron.IpcMainEvent, origins: string[]): boolean {
  const url = e.senderFrame?.url ?? ''
  return e.senderFrame?.parent === null && origins.some((o) => url.startsWith(o))
}

/** Which window's request is being handled right now (so change broadcasts can skip it). */
export let currentSenderId: number | null = null

export interface IpcDeps {
  onCalendarUpdated: () => void
  hideCapture: () => void
  shortcutStatus: () => { accelerator: string; registered: boolean }
}

export function registerIpc(trustedOrigins: string[], deps: IpcDeps): void {
  const { onCalendarUpdated } = deps
  const handle = (channel: string, fn: (e: IpcMainInvokeEvent, ...args: any[]) => unknown): void => {
    ipcMain.handle(channel, (e, ...args) => {
      if (!isTrusted(e, trustedOrigins)) throw new Error('Untrusted sender')
      currentSenderId = e.sender.id
      try {
        return fn(e, ...args)
      } finally {
        currentSenderId = null
      }
    })
  }

  // Generic data access (tables/columns are whitelisted in db.ts)
  handle('db:list', (_e, table: string, where?: Where, orderBy?: string) => list(table, where, orderBy))
  handle('db:get', (_e, table: string, id: string) => get(table, id))
  handle('db:create', (_e, table: string, values: Record<string, unknown>) => create(table, values))
  handle('db:update', (_e, table: string, id: string, patch: Record<string, unknown>) =>
    update(table, id, patch)
  )
  handle('db:remove', (_e, table: string, id: string) => softDelete(table, id))

  // Materials
  handle('materials:pick', (e, weekId: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    return pickAndImport(win, weekId)
  })
  handle('materials:import', (_e, weekId: string, paths: string[]) => importPaths(weekId, paths))
  handle('materials:open', (_e, id: string) => openExternal(id))
  handle('materials:reveal', (_e, id: string) => showInFolder(id))

  // Calendar
  handle('calendar:range', (_e, startIso: string, endIso: string, mode: Mode): CalendarRange => {
    const db = getDb()
    // Pad by a day: all-day rows use local dates, the range uses UTC instants.
    const start = new Date(Date.parse(startIso) - 864e5).toISOString()
    const end = new Date(Date.parse(endIso) + 864e5).toISOString()
    const events = db
      .prepare(
        `SELECT e.*, t.status AS task_status FROM events e
         LEFT JOIN tasks t ON t.id = e.task_id AND t.deleted_at IS NULL
         WHERE e.deleted_at IS NULL AND e.start_at < ? AND e.end_at > ?`
      )
      .all(end, start) as unknown as CalendarRange['events']
    const tasks = db
      .prepare(
        `SELECT * FROM tasks WHERE deleted_at IS NULL AND mode = ? AND status != 'done'
         AND due_at >= ? AND due_at < ?`
      )
      .all(asMode(mode), start, end) as unknown as Task[]
    const external = db
      .prepare(
        `SELECT e.*, s.color AS color, s.name AS subscription_name
         FROM subscription_events e JOIN calendar_subscriptions s ON s.id = e.subscription_id
         WHERE s.deleted_at IS NULL AND s.enabled = 1 AND e.start_at < ? AND e.end_at > ?`
      )
      .all(end, start) as unknown as CalendarRange['external']
    const assessments = db
      .prepare(
        `SELECT a.*, m.code AS module_code, m.name AS module_name, m.color AS module_color
         FROM assessments a JOIN modules m ON m.id = a.module_id
         WHERE a.deleted_at IS NULL AND m.deleted_at IS NULL AND m.owner_id = ? AND a.due_at >= ? AND a.due_at < ?`
      )
      .all(getProfileId(), start, end) as unknown as AssessmentWithModule[]
    const plain = <T>(rows: T[]): T[] => rows.map((r) => ({ ...r }))
    const study = asMode(mode) === 'study'
    return {
      events: plain(events),
      external: plain(external),
      // Assessments and classes are a study thing; work mode doesn't show them.
      assessments: study ? plain(assessments) : [],
      tasks: plain(tasks),
      classes: study ? expandTimetable(startIso, endIso) : []
    }
  })
  handle('calendar:refresh', async (_e, id?: string) => {
    await refreshSubscriptions(id)
    onCalendarUpdated()
  })
  handle('calendar:deadlines', (_e, limit: number, mode: Mode): Deadline[] => {
    const db = getDb()
    const n = Math.min(Number(limit) || 10, 50)
    const from = new Date().toISOString()
    const overdueFrom = new Date(Date.now() - 7 * 864e5).toISOString() // still show tasks up to a week overdue
    const tasks = db
      .prepare(
        `SELECT 'task' AS kind, t.id, t.title, t.due_at, t.module_id, NULL AS weight_pct,
                COALESCE(p.color, m.color, c.color, '#64748b') AS color,
                COALESCE(p.title, NULLIF(m.code, ''), m.name, c.name, 'Task') AS subtitle
         FROM tasks t
         LEFT JOIN projects p ON p.id = t.project_id AND p.deleted_at IS NULL
         LEFT JOIN modules m ON m.id = t.module_id AND m.deleted_at IS NULL
         LEFT JOIN clients c ON c.id = t.client_id AND c.deleted_at IS NULL
         WHERE t.deleted_at IS NULL AND t.mode = ? AND t.status != 'done' AND t.due_at >= ?
         ORDER BY t.due_at LIMIT ?`
      )
      .all(asMode(mode), overdueFrom, n) as unknown as Deadline[]
    const assessments =
      asMode(mode) === 'study'
        ? (db
            .prepare(
              `SELECT 'assessment' AS kind, a.id, a.title, a.due_at, a.module_id, a.weight_pct,
                      m.color AS color, COALESCE(NULLIF(m.code, ''), m.name) AS subtitle
               FROM assessments a JOIN modules m ON m.id = a.module_id
               WHERE a.deleted_at IS NULL AND m.deleted_at IS NULL AND m.archived = 0 AND m.owner_id = ?
                 AND a.score_pct IS NULL AND a.due_at >= ?
               ORDER BY a.due_at LIMIT ?`
            )
            .all(getProfileId(), from, n) as unknown as Deadline[])
        : []
    return [...tasks, ...assessments]
      .map((r) => ({ ...r }))
      .sort((a, b) => a.due_at.localeCompare(b.due_at))
      .slice(0, n)
  })

  // Profile (Study/Work mode etc.)
  handle('profile:get', () => get<Profile>('profiles', getProfileId()))
  handle('profile:update', (_e, patch: Partial<Profile>) => {
    const safe: Partial<Profile> = {}
    if (patch.mode) safe.mode = asMode(patch.mode)
    if (typeof patch.display_name === 'string') safe.display_name = patch.display_name
    if ('leaderboard_opt_in' in patch) safe.leaderboard_opt_in = patch.leaderboard_opt_in ? 1 : 0
    if ('target_gpa' in patch) {
      const n = Number(patch.target_gpa)
      safe.target_gpa = patch.target_gpa == null || !Number.isFinite(n) ? null : n
    }
    if (typeof patch.grade_scale === 'string') {
      try {
        if (Array.isArray(JSON.parse(patch.grade_scale))) safe.grade_scale = patch.grade_scale
      } catch {
        /* ignore invalid JSON */
      }
    }
    return update<Profile>('profiles', getProfileId(), safe)
  })

  // Focus timer
  handle('timer:state', () => timer.getState())
  handle('timer:start', () => timer.start())
  handle('timer:pause', () => timer.pause())
  handle('timer:reset', () => timer.reset())
  handle('timer:skip', () => timer.skip())
  handle('timer:context', (_e, ctx: Record<string, unknown>) => {
    const clean: Partial<TimerContext> = {}
    for (const k of ['taskId', 'moduleId', 'projectId'] as const) {
      if (k in ctx) clean[k] = typeof ctx[k] === 'string' ? (ctx[k] as string) : null
    }
    timer.setContext(clean)
  })
  handle('timer:settings', () => timer.getSettings())
  handle('timer:setSettings', (_e, patch: Record<string, unknown>) => {
    const clean: Partial<TimerSettings> = {}
    for (const k of ['focusMin', 'shortMin', 'longMin', 'longEvery'] as const) {
      const n = Number(patch[k])
      if (k in patch && Number.isFinite(n)) clean[k] = Math.min(180, Math.max(1, Math.round(n)))
    }
    for (const k of ['autoStartBreaks', 'autoStartFocus'] as const) {
      if (k in patch) clean[k] = !!patch[k]
    }
    return timer.setSettings(clean)
  })

  // Device preferences
  handle('prefs:get', () => getPrefs())
  handle('prefs:set', (_e, patch: Record<string, unknown>) => {
    const clean: Partial<Prefs> = {}
    for (const k of ['closeToTray', 'launchAtLogin', 'notifyDeadlines', 'notifyTimer'] as const) {
      if (k in patch) clean[k] = !!patch[k]
    }
    if (typeof patch.quickCaptureShortcut === 'string' && SHORTCUTS.includes(patch.quickCaptureShortcut)) {
      clean.quickCaptureShortcut = patch.quickCaptureShortcut
    }
    if (Array.isArray(patch.spotifyLinks)) {
      clean.spotifyLinks = (patch.spotifyLinks as Record<string, unknown>[])
        .filter((l) => typeof l?.url === 'string' && spotifyParts(l.url))
        .slice(0, 50)
        .map((l) => ({
          url: String(l.url),
          title: String(l.title ?? '').slice(0, 200),
          thumbnail_url: typeof l.thumbnail_url === 'string' && l.thumbnail_url.startsWith('https://') ? l.thumbnail_url : null
        }))
    }
    return setPrefs(clean)
  })

  // Phase 4: links, search, quick capture, idle game
  handle('embed:lookup', (_e, url: string) => lookup(String(url)))
  handle('embed:openSpotify', (_e, url: string) => openSpotify(String(url)))
  handle('search', (_e, q: string) => search(String(q)))
  handle('capture:hide', () => deps.hideCapture())
  handle('capture:status', () => deps.shortcutStatus())
  handle('game:get', () => getGame())

  // Phase 5: account, sync, friends, servers, video rooms
  registerCloudIpc(handle)

  // App
  handle('app:dataPath', () => app.getPath('userData'))
  handle('app:openDataFolder', () => shell.openPath(app.getPath('userData')))
  handle('app:version', () => app.getVersion())
}
