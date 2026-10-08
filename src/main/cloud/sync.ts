// Sync engine. The local SQLite database is the working copy:
//   push: rows listed in sync_outbox are uploaded (upsert), then removed from the outbox
//   pull: rows changed on the server since our cursor are downloaded and applied
// Conflicts: last write wins by updated_at, decided on the server (see supabase/personal.sql).
// A row with an unsent local edit is never overwritten by a pull.

import { app } from 'electron'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import type { SQLInputValue } from 'node:sqlite'
import { SYNC_TABLES } from '@shared/sync'
import type { SyncState } from '@shared/cloud'
import type { Material } from '@shared/types'
import { getDb, getSetting, now, setSetting, update } from '../db'
import { isNetworkError, supabase } from './client'

export const EPOCH = '1970-01-01T00:00:00.000Z'
const BATCH = 400
const STORAGE_SOFT_CAP = 950 * 1024 * 1024 // the free plan has 1 GB for the whole project
const MAX_FILE = 50 * 1024 * 1024 // per-file limit on the free plan

let uid: string | null = null
let state: SyncState = 'off'
let lastError: string | null = null
let lastSyncAt: string | null = null
let running = false
let rerun = false
let debounce: NodeJS.Timeout | undefined
let interval: NodeJS.Timeout | undefined
let onStatus: () => void = () => {}
let onApplied: (tables: string[]) => void = () => {}

export function configureSync(opts: { onStatus: () => void; onApplied: (tables: string[]) => void }): void {
  onStatus = opts.onStatus
  onApplied = opts.onApplied
  lastSyncAt = getSetting<string>('sync_last_at')
}

export function syncInfo(): { sync: SyncState; pending: number; lastSyncAt: string | null; error: string | null } {
  const pending = (getDb().prepare('SELECT COUNT(*) AS n FROM sync_outbox').get() as { n: number }).n
  return { sync: state, pending, lastSyncAt, error: lastError }
}

function setState(s: SyncState): void {
  state = s
  onStatus()
}

export function startSync(userId: string): void {
  uid = userId
  clearInterval(interval)
  interval = setInterval(() => void syncNow(), 30_000)
  void syncNow()
}

export function stopSync(): void {
  uid = null
  clearInterval(interval)
  clearTimeout(debounce)
  setState('off')
}

/** Called after local edits: sync shortly after typing stops. */
export function requestSync(): void {
  if (!uid) return
  clearTimeout(debounce)
  debounce = setTimeout(() => void syncNow(), 1500)
  onStatus() // pending count changed
}

export async function syncNow(): Promise<void> {
  if (!uid) return
  if (running) {
    rerun = true
    return
  }
  running = true
  setState('syncing')
  try {
    await push()
    await pull()
    await uploadFiles()
    lastSyncAt = now()
    setSetting('sync_last_at', lastSyncAt)
    if (state === 'syncing') lastError = null
    setState('synced')
  } catch (e) {
    if (isNetworkError(e)) setState('offline')
    else {
      lastError = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)
      setState('error')
    }
  } finally {
    running = false
    if (rerun) {
      rerun = false
      void syncNow()
    }
  }
}

const plain = (r: unknown): Record<string, SQLInputValue> => ({ ...(r as object) }) as Record<string, SQLInputValue>

// ---------- push ----------

async function push(): Promise<void> {
  const db = getDb()
  const del = db.prepare('DELETE FROM sync_outbox WHERE table_name = ? AND row_id = ? AND queued_at = ?')
  for (let round = 0; round < 50; round++) {
    const batch = db.prepare('SELECT table_name, row_id, queued_at FROM sync_outbox ORDER BY queued_at LIMIT ?').all(BATCH) as {
      table_name: string
      row_id: string
      queued_at: string
    }[]
    if (!batch.length) return
    for (const table of [...new Set(batch.map((b) => b.table_name))].sort((a, b) => order(a) - order(b))) {
      const entries = batch.filter((b) => b.table_name === table)
      if (order(table) === Infinity) {
        entries.forEach((e) => del.run(e.table_name, e.row_id, e.queued_at)) // not a synced table
        continue
      }
      const ids = entries.map((e) => e.row_id)
      const rows = db.prepare(`SELECT * FROM ${table} WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids).map(plain)
      const mine = rows.filter((r) => r.owner_id === uid)
      if (mine.length) {
        const { error } = await supabase().from(table).upsert(mine, { onConflict: 'id' })
        if (error) handlePushError(error, table)
      }
      // Rows owned by someone else: only notes shared with edit rights can be written.
      for (const r of rows.filter((x) => x.owner_id !== uid && table === 'notes')) {
        const { id, owner_id: _owner, ...rest } = r // eslint-disable-line @typescript-eslint/no-unused-vars
        const { error } = await supabase().from(table).update(rest).eq('id', id as string)
        if (error) handlePushError(error, table)
      }
      // Remove what was sent — unless the row was edited again meanwhile (queued_at changed).
      entries.forEach((e) => del.run(e.table_name, e.row_id, e.queued_at))
    }
  }
}

function handlePushError(error: { message: string; code?: string }, table: string): void {
  if (isNetworkError(error)) throw error
  // Permission/constraint problems will never succeed by retrying: record and move on.
  lastError = `Couldn't upload some ${table}: ${error.message}`
}

const order = (table: string): number => {
  const i = (SYNC_TABLES as readonly string[]).indexOf(table)
  return i < 0 ? Infinity : i
}

// ---------- pull ----------

interface Cursor {
  ts: string
  id: string
}

export function resetCursors(tables: readonly string[] = SYNC_TABLES): void {
  for (const t of tables) setSetting(`sync_cursor:${t}`, { ts: EPOCH, id: '' })
}

async function pull(): Promise<void> {
  const changed: string[] = []
  for (const table of SYNC_TABLES) {
    let cur = getSetting<Cursor>(`sync_cursor:${table}`) ?? { ts: EPOCH, id: '' }
    for (;;) {
      const { data, error } = await supabase()
        .from(table)
        .select('*')
        .or(`server_updated_at.gt."${cur.ts}",and(server_updated_at.eq."${cur.ts}",id.gt."${cur.id}")`)
        .order('server_updated_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(500)
      if (error) throw error
      if (!data?.length) break
      if (applyRemote(table, data)) changed.push(table)
      const last = data[data.length - 1]
      cur = { ts: last.server_updated_at, id: last.id }
      setSetting(`sync_cursor:${table}`, cur)
      if (data.length < 500) break
    }
  }
  if (adoptProfileIfNew()) rerun = true // upload it straight away
  if (changed.length) onApplied([...new Set(changed)])
}

const columnCache = new Map<string, string[]>()
function localColumns(table: string): string[] {
  let cols = columnCache.get(table)
  if (!cols) {
    cols = (getDb().prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name)
    columnCache.set(table, cols)
  }
  return cols
}

/** Write server rows locally (without queueing them for upload). Returns true if anything changed. */
function applyRemote(table: string, rows: Record<string, unknown>[]): boolean {
  const db = getDb()
  const cols = localColumns(table)
  const pending = db.prepare('SELECT 1 FROM sync_outbox WHERE table_name = ? AND row_id = ?')
  const upsert = db.prepare(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
     ON CONFLICT(id) DO UPDATE SET ${cols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ')}`
  )
  let changed = false
  db.exec('PRAGMA foreign_keys = OFF') // rows can arrive before their parents; integrity comes from the source
  try {
    db.exec('BEGIN')
    for (const r of rows) {
      if (pending.get(table, r.id as string)) continue // our unsent edit wins until it's pushed
      upsert.run(...cols.map((c) => toSql(r[c])))
      changed = true
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  } finally {
    db.exec('PRAGMA foreign_keys = ON')
  }
  return changed
}

function toSql(v: unknown): SQLInputValue {
  if (v === undefined || v === null) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'bigint') return v
  return JSON.stringify(v)
}

/** A brand-new device's default profile shouldn't overwrite your real settings:
 *  it starts at EPOCH (oldest possible). If the cloud had no profile yet, upload ours. */
function adoptProfileIfNew(): boolean {
  if (!uid) return false
  const db = getDb()
  const p = db.prepare('SELECT updated_at FROM profiles WHERE id = ?').get(uid) as { updated_at: string } | undefined
  if (p?.updated_at === EPOCH) {
    db.prepare('UPDATE profiles SET updated_at = ? WHERE id = ?').run(now(), uid)
    db.prepare(
      `INSERT INTO sync_outbox (table_name, row_id, queued_at) VALUES ('profiles', ?, ?)
       ON CONFLICT(table_name, row_id) DO UPDATE SET queued_at = excluded.queued_at`
    ).run(uid, now())
    return true
  }
  return false
}

/** Remove local copies of other people's rows that are no longer shared with us. */
export function pruneUnshared(moduleIds: Set<string>, noteIds: Set<string>): void {
  if (!uid) return
  const db = getDb()
  const mods = [...moduleIds]
  const inMods = mods.length ? `module_id IN (${mods.map(() => '?').join(',')})` : '0'
  const notes = [...noteIds]
  const inNotes = notes.length ? `id IN (${notes.map(() => '?').join(',')})` : '0'
  db.exec('PRAGMA foreign_keys = OFF')
  try {
    db.prepare(`DELETE FROM modules WHERE owner_id != ? AND NOT (${mods.length ? `id IN (${mods.map(() => '?').join(',')})` : '0'})`).run(uid, ...mods)
    for (const t of ['weeks', 'materials', 'assessments']) db.prepare(`DELETE FROM ${t} WHERE owner_id != ? AND NOT (${inMods})`).run(uid, ...mods)
    db.prepare(`DELETE FROM notes WHERE owner_id != ? AND NOT (${inNotes} OR ${inMods})`).run(uid, ...notes, ...mods)
    // Anything else not ours shouldn't be here at all.
    for (const t of SYNC_TABLES) {
      if (!['modules', 'weeks', 'materials', 'assessments', 'notes'].includes(t)) db.prepare(`DELETE FROM ${t} WHERE owner_id != ?`).run(uid)
    }
  } finally {
    db.exec('PRAGMA foreign_keys = ON')
  }
}

// ---------- files (opt-in per material) ----------

const dataDir = (): string => app.getPath('userData')

async function uploadFiles(): Promise<void> {
  const db = getDb()
  const todo = db
    .prepare(`SELECT * FROM materials WHERE owner_id = ? AND deleted_at IS NULL AND sync_file = 1 AND storage_path IS NULL`)
    .all(uid)
    .map((r) => ({ ...(r as object) }) as Material)
  if (!todo.length) return
  const { data: used, error } = await supabase().rpc('storage_used')
  if (error) throw error
  if (Number(used) > STORAGE_SOFT_CAP) {
    lastError = 'Cloud file storage is almost full (1 GB free limit). New files stay on this PC only.'
    return
  }
  for (const m of todo) {
    const abs = join(dataDir(), m.local_path ?? '')
    if (!m.local_path || !existsSync(abs)) continue
    const buf = await readFile(abs)
    if (buf.length > MAX_FILE) {
      lastError = `“${m.title}” is over 50 MB, the free plan's per-file limit — it stays on this PC.`
      continue
    }
    const path = `${uid}/${m.id}${extname(m.local_path)}`
    const up = await supabase().storage.from('materials').upload(path, buf, { upsert: true, contentType: 'application/octet-stream' })
    if (up.error) throw up.error
    update('materials', m.id, { storage_path: path })
  }
}

/** Make sure a material's file is on this PC, downloading it if it was synced from elsewhere. */
export async function ensureLocalFile(m: Material): Promise<boolean> {
  const abs = join(dataDir(), m.local_path ?? '')
  if (m.local_path && existsSync(abs)) return true
  if (!uid || !m.storage_path || !m.local_path) return false
  const { data, error } = await supabase().storage.from('materials').download(m.storage_path)
  if (error || !data) return false
  await mkdir(dirname(abs), { recursive: true })
  await writeFile(abs, Buffer.from(await data.arrayBuffer()))
  return true
}

export async function storageUsed(): Promise<number> {
  const { data, error } = await supabase().rpc('storage_used')
  if (error) throw error
  return Number(data)
}
