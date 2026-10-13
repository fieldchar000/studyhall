// node:sqlite on the phone: the same SQLite engine compiled to WebAssembly (sql.js), wrapped in
// Node's synchronous DatabaseSync API so db.ts, migrations and sync run unchanged.
// The database lives in memory and is saved to private storage a moment after each change
// (and straight away when the app goes to the background).

import initSqlJs, { type Database, type SqlJsStatic, type Statement, type SqlValue } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { exists, readBytes, remove, rename, writeBytes } from '../storage'

export type SQLInputValue = null | number | bigint | string | Uint8Array

let SQL: SqlJsStatic | null = null
const preloaded = new Map<string, Uint8Array | null>()

/** Load the engine and the saved database before any shared code runs. */
export async function initSqlite(path: string): Promise<void> {
  SQL = await initSqlJs({ locateFile: () => wasmUrl })
  // A crash between "delete old" and "rename new" leaves only the .tmp copy: use it.
  const src = exists(path) ? path : exists(`${path}.tmp`) ? `${path}.tmp` : null
  preloaded.set(path, src ? await readBytes(src) : null)
}

const READ_ONLY = /^\s*(SELECT|PRAGMA\s+\w+\s*(\(|$|;)|WITH\s[\s\S]*\bSELECT\b(?![\s\S]*\b(INSERT|UPDATE|DELETE)\b))/i

function toValue(v: unknown): SqlValue {
  if (v === undefined || v === null) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'bigint') return Number(v)
  if (v instanceof Uint8Array) return v
  if (typeof v === 'number' || typeof v === 'string') return v
  throw new TypeError('Provided value cannot be bound to SQLite parameter')
}

function bindArgs(args: unknown[]): SqlValue[] | Record<string, SqlValue> {
  if (args.length === 1 && args[0] && typeof args[0] === 'object' && !(args[0] instanceof Uint8Array)) {
    const named: Record<string, SqlValue> = {}
    for (const [k, v] of Object.entries(args[0] as Record<string, unknown>)) {
      const val = toValue(v)
      if (/^[:@$]/.test(k)) named[k] = val
      else {
        named[`:${k}`] = val
        named[`@${k}`] = val
        named[`$${k}`] = val
      }
    }
    return named
  }
  return args.map(toValue)
}

export class StatementSync {
  constructor(
    private owner: DatabaseSync,
    private sql: string
  ) {}
  private use<T>(args: unknown[], fn: (s: Statement) => T): T {
    const s = this.owner._statement(this.sql)
    try {
      s.bind(bindArgs(args) as SqlValue[])
      return fn(s)
    } finally {
      s.reset()
    }
  }
  run(...args: unknown[]): { changes: number; lastInsertRowid: number } {
    const r = this.use(args, (s) => {
      while (s.step()) {
        /* drain */
      }
      return { changes: this.owner._db().getRowsModified(), lastInsertRowid: 0 }
    })
    this.owner._touched(this.sql)
    return r
  }
  all(...args: unknown[]): Record<string, SqlValue>[] {
    const rows = this.use(args, (s) => {
      const out: Record<string, SqlValue>[] = []
      while (s.step()) out.push(s.getAsObject())
      return out
    })
    this.owner._touched(this.sql)
    return rows
  }
  get(...args: unknown[]): Record<string, SqlValue> | undefined {
    const row = this.use(args, (s) => (s.step() ? s.getAsObject() : undefined))
    this.owner._touched(this.sql)
    return row
  }
  iterate(...args: unknown[]): IterableIterator<Record<string, SqlValue>> {
    return this.all(...args)[Symbol.iterator]()
  }
}

const savers = new Set<DatabaseSync>()

/** Save every open database now (used when the app goes to the background). */
export async function flushAll(): Promise<void> {
  await Promise.all([...savers].map((d) => d.flush()))
}

export class DatabaseSync {
  private db: Database
  private cache = new Map<string, Statement>()
  private dirty = false
  private inTx = false
  private timer: ReturnType<typeof setTimeout> | undefined
  private saving: Promise<void> | null = null
  private pragmas: string[] = []

  constructor(private path: string) {
    if (!SQL) throw new Error('SQLite is not loaded yet')
    const bytes = preloaded.get(path)
    this.db = bytes ? new SQL.Database(bytes) : new SQL.Database()
    savers.add(this)
  }

  _db(): Database {
    return this.db
  }

  _statement(sql: string): Statement {
    let s = this.cache.get(sql)
    if (!s) {
      s = this.db.prepare(sql)
      if (this.cache.size > 300) {
        const [k, old] = this.cache.entries().next().value as [string, Statement]
        old.free()
        this.cache.delete(k)
      }
      this.cache.set(sql, s)
    }
    return s
  }

  _touched(sql: string): void {
    const t = sql.trim()
    if (/^BEGIN/i.test(t)) this.inTx = true
    else if (/^(COMMIT|END|ROLLBACK)\b/i.test(t)) this.inTx = false
    if (READ_ONLY.test(t)) return
    this.dirty = true
    clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.flush(), 1200)
  }

  prepare(sql: string): StatementSync {
    return new StatementSync(this, sql)
  }

  exec(sql: string): void {
    // Settings like foreign_keys are lost when the database is saved (sql.js reopens it), so keep them.
    for (const m of sql.matchAll(/PRAGMA\s+(foreign_keys|busy_timeout)\s*=\s*\w+/gi)) if (!this.pragmas.includes(m[0])) this.pragmas.push(m[0])
    this.db.exec(sql.replace(/PRAGMA\s+journal_mode\s*=\s*WAL\s*;?/i, ''))
    for (const part of sql.split(';')) if (part.trim()) this._touched(part)
  }

  /** Write the database to storage: new copy first, then swap, so a crash never loses it. */
  async flush(): Promise<void> {
    if (this.saving) await this.saving
    if (!this.dirty) return
    if (this.inTx) {
      this.timer = setTimeout(() => void this.flush(), 300)
      return
    }
    this.dirty = false
    for (const s of this.cache.values()) s.free()
    this.cache.clear()
    const bytes = this.db.export() // (reopens the database internally)
    if (this.pragmas.length) this.db.exec(this.pragmas.join('; '))
    this.saving = (async () => {
      try {
        await writeBytes(`${this.path}.tmp`, bytes)
        await remove(this.path)
        await rename(`${this.path}.tmp`, this.path)
      } catch (e) {
        console.error('Saving the database failed', e)
        this.dirty = true
      } finally {
        this.saving = null
      }
    })()
    await this.saving
  }

  close(): void {
    void this.flush()
  }
}

export default { DatabaseSync, StatementSync }
