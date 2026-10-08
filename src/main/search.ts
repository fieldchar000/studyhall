// Global search (Ctrl+K) across everything, using simple LIKE queries.
// Fast enough for a personal database; no extra index or library needed.

import { getDb } from './db'
import type { SearchResult } from '@shared/types'

const PER_TYPE = 6

interface Source {
  type: SearchResult['type']
  sql: string // must select: id, title, body, parent_id
}

// Each source: which table/columns to look in. `?` is the LIKE pattern (repeated per column).
const SOURCES: Source[] = [
  { type: 'task', sql: `SELECT id, title, notes AS body, NULL AS parent_id FROM tasks WHERE deleted_at IS NULL AND (title LIKE ?1 OR notes LIKE ?1)` },
  { type: 'note', sql: `SELECT id, title, plain_text AS body, NULL AS parent_id FROM notes WHERE deleted_at IS NULL AND (title LIKE ?1 OR plain_text LIKE ?1)` },
  { type: 'module', sql: `SELECT id, CASE WHEN code != '' THEN code || ' · ' || name ELSE name END AS title, term AS body, NULL AS parent_id FROM modules WHERE deleted_at IS NULL AND (name LIKE ?1 OR code LIKE ?1)` },
  { type: 'project', sql: `SELECT id, title, description AS body, NULL AS parent_id FROM projects WHERE deleted_at IS NULL AND (title LIKE ?1 OR description LIKE ?1)` },
  { type: 'client', sql: `SELECT id, name AS title, notes AS body, NULL AS parent_id FROM clients WHERE deleted_at IS NULL AND (name LIKE ?1 OR notes LIKE ?1)` },
  { type: 'assessment', sql: `SELECT a.id, a.title, m.name AS body, a.module_id AS parent_id FROM assessments a JOIN modules m ON m.id = a.module_id WHERE a.deleted_at IS NULL AND m.deleted_at IS NULL AND a.title LIKE ?1` },
  { type: 'material', sql: `SELECT id, title, file_name AS body, module_id AS parent_id FROM materials WHERE deleted_at IS NULL AND (title LIKE ?1 OR file_name LIKE ?1)` },
  { type: 'flashcard', sql: `SELECT id, front AS title, back AS body, deck_id AS parent_id FROM flashcards WHERE deleted_at IS NULL AND (front LIKE ?1 OR back LIKE ?1)` },
  { type: 'deck', sql: `SELECT id, name AS title, '' AS body, NULL AS parent_id FROM flashcard_decks WHERE deleted_at IS NULL AND name LIKE ?1` },
  { type: 'video', sql: `SELECT id, title, author || CASE WHEN notes != '' THEN ' · ' || notes ELSE '' END AS body, NULL AS parent_id FROM videos WHERE deleted_at IS NULL AND (title LIKE ?1 OR author LIKE ?1 OR notes LIKE ?1 OR tags LIKE ?1)` },
  { type: 'event', sql: `SELECT id, title, notes AS body, NULL AS parent_id FROM events WHERE deleted_at IS NULL AND (title LIKE ?1 OR notes LIKE ?1)` },
  { type: 'mindmap', sql: `SELECT id, title, '' AS body, NULL AS parent_id FROM mindmaps WHERE deleted_at IS NULL AND title LIKE ?1
                          UNION SELECT n.mindmap_id AS id, mm.title, n.label AS body, NULL AS parent_id FROM mindmap_nodes n JOIN mindmaps mm ON mm.id = n.mindmap_id
                          WHERE n.deleted_at IS NULL AND mm.deleted_at IS NULL AND n.label LIKE ?1` },
  { type: 'inbox', sql: `SELECT id, text AS title, '' AS body, NULL AS parent_id FROM inbox_items WHERE deleted_at IS NULL AND processed_at IS NULL AND text LIKE ?1` }
]

/** A short piece of `text` around the first match. */
function snippet(text: string, q: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const i = flat.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return flat.slice(0, 90)
  const start = Math.max(0, i - 40)
  return (start > 0 ? '…' : '') + flat.slice(start, i + q.length + 50) + (i + q.length + 50 < flat.length ? '…' : '')
}

export function search(query: string): SearchResult[] {
  const q = String(query ?? '').trim().slice(0, 100)
  if (!q) return []
  // Escape LIKE wildcards so "100%" searches literally.
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
  const db = getDb()
  const out: SearchResult[] = []
  for (const src of SOURCES) {
    const sql = src.sql.replaceAll('LIKE ?1', "LIKE ?1 ESCAPE '\\'") + ` LIMIT ${PER_TYPE}`
    const rows = db.prepare(sql).all(pattern) as { id: string; title: string; body: string | null; parent_id: string | null }[]
    for (const r of rows) {
      out.push({ type: src.type, id: r.id, title: r.title || '(untitled)', snippet: snippet(r.body ?? '', q), parent_id: r.parent_id })
    }
  }
  // Title matches first
  const lq = q.toLowerCase()
  return out.sort((a, b) => Number(b.title.toLowerCase().includes(lq)) - Number(a.title.toLowerCase().includes(lq)))
}
