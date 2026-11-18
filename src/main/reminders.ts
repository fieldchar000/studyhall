// Deadline reminders: a native notification ~24h and ~1h before an open task
// or ungraded assessment is due. Each reminder fires once (tracked locally).

import { getDb, getProfileId, now } from './db'
import { getPrefs } from './prefs'

const HOUR = 3_600_000

interface Due {
  kind: 'task' | 'assessment'
  id: string
  title: string
  due_at: string
  context: string | null
}

export function checkDeadlines(notify: (title: string, body: string) => void): void {
  if (!getPrefs().notifyDeadlines) return
  const db = getDb()
  const from = now()
  const to = new Date(Date.now() + 24 * HOUR).toISOString()

  const due = [
    ...(db
      .prepare(
        `SELECT 'task' AS kind, id, title, due_at, NULL AS context FROM tasks
         WHERE deleted_at IS NULL AND status != 'done' AND due_at > ? AND due_at <= ?`
      )
      .all(from, to) as unknown as Due[]),
    ...(db
      .prepare(
        `SELECT 'assessment' AS kind, a.id, a.title, a.due_at, COALESCE(NULLIF(m.code, ''), m.name) AS context
         FROM assessments a JOIN modules m ON m.id = a.module_id
         WHERE a.deleted_at IS NULL AND m.deleted_at IS NULL AND m.owner_id = ? AND a.score_pct IS NULL AND a.due_at > ? AND a.due_at <= ?`
      )
      .all(getProfileId(), from, to) as unknown as Due[])
  ]

  const seen = db.prepare('SELECT 1 FROM notifications_sent WHERE key = ?')
  const mark = db.prepare('INSERT OR IGNORE INTO notifications_sent (key, sent_at) VALUES (?, ?)')
  for (const d of due) {
    const hoursLeft = (Date.parse(d.due_at) - Date.now()) / HOUR
    const tier = hoursLeft <= 1 ? '1h' : '24h'
    // due_at is part of the key, so moving a deadline re-arms its reminders
    const key = `${d.kind}:${d.id}:${d.due_at}:${tier}`
    if (seen.get(key)) continue
    mark.run(key, now())
    const when = new Date(d.due_at).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })
    const title = tier === '1h' ? `Due within the hour: ${d.title}` : `Due soon: ${d.title}`
    notify(title, `${d.context ? `${d.context} · ` : ''}${when}`)
  }
}

/** Promises coming due now (a task with a time, in the last 10 minutes): Nova says it out loud, once.
 *  Tasks without a time (saved as 23:59) only get the usual notifications. */
export function checkDueNow(onDue: (title: string, dueAt: string) => void): void {
  const db = getDb()
  const from = new Date(Date.now() - 10 * 60_000).toISOString()
  const rows = db
    .prepare(`SELECT id, title, due_at FROM tasks WHERE deleted_at IS NULL AND status != 'done' AND due_at > ? AND due_at <= ?`)
    .all(from, now()) as unknown as { id: string; title: string; due_at: string }[]
  const seen = db.prepare('SELECT 1 FROM notifications_sent WHERE key = ?')
  const mark = db.prepare('INSERT OR IGNORE INTO notifications_sent (key, sent_at) VALUES (?, ?)')
  for (const r of rows) {
    const d = new Date(r.due_at)
    if (d.getHours() === 23 && d.getMinutes() === 59) continue
    const key = `task:${r.id}:${r.due_at}:now`
    if (seen.get(key)) continue
    mark.run(key, now())
    onDue(r.title, r.due_at)
  }
}
