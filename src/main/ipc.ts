// IPC handlers: the only way the UI can reach the database, files and network.

import { app, BrowserWindow, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { create, get, getDb, list, softDelete, update } from './db'
import { importPaths, openExternal, pickAndImport, showInFolder } from './files'
import { refreshSubscriptions } from './ics'
import type { AssessmentWithModule, CalendarRange, CalEvent, SubscriptionEvent, Where } from '@shared/types'

/** Only accept calls from our own UI (never from material iframes or anything else). */
function isTrusted(e: IpcMainInvokeEvent | Electron.IpcMainEvent, origins: string[]): boolean {
  const url = e.senderFrame?.url ?? ''
  return e.senderFrame?.parent === null && origins.some((o) => url.startsWith(o))
}

export function registerIpc(trustedOrigins: string[], onCalendarUpdated: () => void): void {
  const handle = (channel: string, fn: (e: IpcMainInvokeEvent, ...args: any[]) => unknown): void => {
    ipcMain.handle(channel, (e, ...args) => {
      if (!isTrusted(e, trustedOrigins)) throw new Error('Untrusted sender')
      return fn(e, ...args)
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
  handle('calendar:range', (_e, startIso: string, endIso: string): CalendarRange => {
    const db = getDb()
    // Pad by a day: all-day rows use local dates, the range uses UTC instants.
    const start = new Date(Date.parse(startIso) - 864e5).toISOString()
    const end = new Date(Date.parse(endIso) + 864e5).toISOString()
    const events = db
      .prepare('SELECT * FROM events WHERE deleted_at IS NULL AND start_at < ? AND end_at > ?')
      .all(end, start) as unknown as CalEvent[]
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
         WHERE a.deleted_at IS NULL AND m.deleted_at IS NULL AND a.due_at >= ? AND a.due_at < ?`
      )
      .all(start, end) as unknown as AssessmentWithModule[]
    return {
      events: events.map((r) => ({ ...r })),
      external: external.map((r) => ({ ...r })) as (SubscriptionEvent & {
        color: string
        subscription_name: string
      })[],
      assessments: assessments.map((r) => ({ ...r }))
    }
  })
  handle('calendar:refresh', async (_e, id?: string) => {
    await refreshSubscriptions(id)
    onCalendarUpdated()
  })
  handle('calendar:deadlines', (_e, limit: number) =>
    getDb()
      .prepare(
        `SELECT a.*, m.code AS module_code, m.name AS module_name, m.color AS module_color
         FROM assessments a JOIN modules m ON m.id = a.module_id
         WHERE a.deleted_at IS NULL AND m.deleted_at IS NULL AND m.archived = 0
           AND a.score_pct IS NULL AND a.due_at >= ?
         ORDER BY a.due_at LIMIT ?`
      )
      .all(new Date().toISOString(), Math.min(Number(limit) || 10, 50))
      .map((r) => ({ ...r }))
  )

  // App
  handle('app:dataPath', () => app.getPath('userData'))
  handle('app:openDataFolder', () => shell.openPath(app.getPath('userData')))
  handle('app:version', () => app.getVersion())
}
