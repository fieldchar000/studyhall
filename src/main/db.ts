// Local SQLite database (Node's built-in node:sqlite — no native build step).
// Only the main process touches the database; the UI goes through IPC (ipc.ts).

import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { app } from 'electron'
import { migrations } from './migrations'
import type { TableName, Where } from '@shared/types'

let db: DatabaseSync
let profileId: string

export const now = (): string => new Date().toISOString()

/** Tables the UI may access through the generic list/get/create/update/remove API. */
const TABLES: readonly TableName[] = [
  'modules',
  'weeks',
  'materials',
  'assessments',
  'events',
  'calendar_subscriptions'
]

/** When a parent is soft-deleted, these children are soft-deleted too. */
const CHILDREN: Partial<Record<TableName, { table: TableName; fk: string }[]>> = {
  modules: [
    { table: 'weeks', fk: 'module_id' },
    { table: 'materials', fk: 'module_id' },
    { table: 'assessments', fk: 'module_id' }
  ],
  weeks: [{ table: 'materials', fk: 'week_id' }]
}

/** Columns the UI is never allowed to set directly. */
const PROTECTED = new Set(['id', 'created_at', 'updated_at', 'deleted_at', 'owner_id'])

export function openDb(): void {
  db = new DatabaseSync(join(app.getPath('userData'), 'studyhall.db'))
  // WAL = fast, crash-safe writes. busy_timeout avoids "database is locked" errors.
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;')
  migrate()
  profileId = ensureLocalProfile()
}

export function closeDb(): void {
  db?.close()
}

export function getDb(): DatabaseSync {
  return db
}

/** Run fn inside a transaction: all of it is saved, or none of it. */
export function tx<T>(fn: () => T): T {
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

function migrate(): void {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)'
  )
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number | null }
  const current = row.v ?? 0
  migrations.forEach((sql, i) => {
    const version = i + 1
    if (version <= current) return
    tx(() => {
      db.exec(sql)
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(version, now())
    })
  })
}

export function getSetting<T>(key: string): T | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row ? (JSON.parse(row.value) as T) : null
}

export function setSetting(key: string, value: unknown): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, JSON.stringify(value))
}

/** The app works without an account: a local profile is created on first launch.
 *  When the user signs up (Phase 5) its id is swapped for the cloud account id. */
function ensureLocalProfile(): string {
  const existing = getSetting<string>('local_profile_id')
  if (existing) return existing
  const id = randomUUID()
  const t = now()
  db.prepare(
    'INSERT INTO profiles (id, created_at, updated_at, owner_id) VALUES (?, ?, ?, ?)'
  ).run(id, t, t, id)
  setSetting('local_profile_id', id)
  queueSync('profiles', id)
  return id
}

/** Remember that a row changed so the Phase 5 sync engine pushes it. */
function queueSync(table: string, id: string): void {
  db.prepare(
    `INSERT INTO sync_outbox (table_name, row_id, queued_at) VALUES (?, ?, ?)
     ON CONFLICT(table_name, row_id) DO UPDATE SET queued_at = excluded.queued_at`
  ).run(table, id, now())
}

// ---------- Generic, validated CRUD used by the UI ----------

const columnCache = new Map<string, Set<string>>()

function columnsOf(table: string): Set<string> {
  let cols = columnCache.get(table)
  if (!cols) {
    const info = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
    cols = new Set(info.map((c) => c.name))
    columnCache.set(table, cols)
  }
  return cols
}

/** Table and column names can't be SQL parameters, so check them against a whitelist. */
function assertTable(table: string): asserts table is TableName {
  if (!TABLES.includes(table as TableName)) throw new Error(`Unknown table: ${table}`)
}
function assertColumn(table: string, col: string): void {
  if (!columnsOf(table).has(col)) throw new Error(`Unknown column ${table}.${col}`)
}

/** node:sqlite accepts only null/number/bigint/string/bytes. */
function toSql(v: unknown): SQLInputValue {
  if (v === undefined || v === null) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'bigint') return v
  return JSON.stringify(v)
}

/** node:sqlite returns null-prototype objects; turn them into plain ones for IPC. */
const plain = <T>(row: unknown): T => ({ ...(row as object) }) as T

export function list<T>(table: string, where: Where = {}, orderBy?: string): T[] {
  assertTable(table)
  const clauses = ['deleted_at IS NULL']
  const params: SQLInputValue[] = []
  for (const [col, value] of Object.entries(where)) {
    assertColumn(table, col)
    if (value === null) clauses.push(`${col} IS NULL`)
    else {
      clauses.push(`${col} = ?`)
      params.push(toSql(value))
    }
  }
  const order = orderBy && columnsOf(table).has(orderBy) ? orderBy : 'created_at'
  return db
    .prepare(`SELECT * FROM ${table} WHERE ${clauses.join(' AND ')} ORDER BY ${order}, created_at`)
    .all(...params)
    .map((r) => plain<T>(r))
}

export function get<T>(table: string, id: string): T | null {
  assertTable(table)
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ? AND deleted_at IS NULL`).get(id)
  return row ? plain<T>(row) : null
}

export function create<T>(table: string, values: Record<string, unknown>): T {
  assertTable(table)
  const cols = columnsOf(table)
  const t = now()
  const row: Record<string, SQLInputValue> = {}
  for (const [k, v] of Object.entries(values)) {
    if (cols.has(k) && !PROTECTED.has(k)) row[k] = toSql(v)
  }
  const id = randomUUID()
  Object.assign(row, { id, created_at: t, updated_at: t, deleted_at: null, owner_id: profileId })
  const keys = Object.keys(row)
  db.prepare(
    `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  ).run(...keys.map((k) => row[k]))
  queueSync(table, id)
  return get<T>(table, id)!
}

export function update<T>(table: string, id: string, patch: Record<string, unknown>): T {
  assertTable(table)
  const cols = columnsOf(table)
  const keys = Object.keys(patch).filter((k) => cols.has(k) && !PROTECTED.has(k))
  const sets = [...keys.map((k) => `${k} = ?`), 'updated_at = ?']
  db.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`).run(
    ...keys.map((k) => toSql(patch[k])),
    now(),
    id
  )
  queueSync(table, id)
  return get<T>(table, id)!
}

/** Soft delete: mark deleted (so the deletion can sync), cascading to children. */
export function softDelete(table: string, id: string): void {
  assertTable(table)
  tx(() => softDeleteInner(table, id, now()))
}

function softDeleteInner(table: TableName, id: string, t: string): void {
  db.prepare(`UPDATE ${table} SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`).run(t, t, id)
  queueSync(table, id)
  for (const child of CHILDREN[table] ?? []) {
    const rows = db
      .prepare(`SELECT id FROM ${child.table} WHERE ${child.fk} = ? AND deleted_at IS NULL`)
      .all(id) as { id: string }[]
    for (const r of rows) softDeleteInner(child.table, r.id, t)
  }
  // Cached ICS occurrences are local-only and can simply be removed.
  if (table === 'calendar_subscriptions') {
    db.prepare('DELETE FROM subscription_events WHERE subscription_id = ?').run(id)
  }
}
