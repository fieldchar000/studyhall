// The evening diary (PC: it needs Nova). At 10 pm Nova asks how the day went and you talk freely; Nova writes the
// entry in your own words (lightly tidied), with your mood and energy (checked with you in a line), a "the day" part
// it already knows (classes, what you finished, focus time, your recall score, what you spent), and the people you
// mentioned. It keeps a few threads to follow up ("the NSL practical on Thursday: how did it go?"), and on Sundays
// it looks back on the week, with patterns once there's enough to see them (sleep and recall, your best focus hours).
// The diary is your Journal: kept on this PC and your own synced account; Nova only reads it to talk with you.
import { claudeChat } from './claude'
import { create, getDb, getProfileId, getSetting, list, setSetting, update } from './db'
import { formatMoney } from './lifeReminders'
import { getPrefs } from './prefs'
import { tickHabit } from './habitsAuto'

const pad = (n: number): string => String(n).padStart(2, '0')
const ymd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
type Entry = { id: string; date: string; mood: number | null; energy: number | null; sleep_hours: number | null; gratitude: string; content: string; tags: string; title: string; details: string }
export type Thread = { about: string; ask: string; on: string }

/** What Studyhall already knows about a day: what was on, done, focused, recalled and spent. */
export function dayFacts(day = new Date()): string[] {
  const start = new Date(day)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start.getTime() + 864e5)
  const a = start.toISOString()
  const b = end.toISOString()
  const db = getDb()
  const out: string[] = []
  const evs = db.prepare('SELECT title FROM events WHERE deleted_at IS NULL AND start_at >= ? AND start_at < ? ORDER BY start_at').all(a, b) as { title: string }[]
  if (evs.length)
    out.push(
      `On: ${evs
        .map((e) => e.title)
        .slice(0, 6)
        .join(', ')}`
    )
  const done = db.prepare(`SELECT title FROM tasks WHERE deleted_at IS NULL AND status = 'done' AND updated_at >= ? AND updated_at < ?`).all(a, b) as { title: string }[]
  if (done.length)
    out.push(
      `Finished: ${done
        .map((t) => t.title)
        .slice(0, 6)
        .join(', ')}`
    )
  const focus = (db.prepare('SELECT SUM(focused_seconds) AS s FROM focus_sessions WHERE deleted_at IS NULL AND started_at >= ? AND started_at < ?').get(a, b) as { s: number | null }).s ?? 0
  if (focus >= 600) out.push(`Focused: ${Math.round(focus / 60)} minutes`)
  const quiz = (
    db.prepare(`SELECT score, max_score FROM paper_attempts WHERE deleted_at IS NULL AND kind = 'quiz' AND date = ? AND notes LIKE '%"recall":1%' AND max_score > 0`).all(ymd(start)) as {
      score: number
      max_score: number
    }[]
  )[0]
  if (quiz) out.push(`Recall: ${quiz.score}/${quiz.max_score}`)
  const spent = db.prepare(`SELECT category, SUM(amount) AS s FROM money_entries WHERE deleted_at IS NULL AND kind = 'expense' AND date = ? GROUP BY category ORDER BY s DESC`).all(ymd(start)) as {
    category: string
    s: number
  }[]
  if (spent.length)
    out.push(
      `Spent: ${formatMoney(spent.reduce((n, x) => n + x.s, 0))} (${spent
        .map((x) => x.category.toLowerCase())
        .slice(0, 3)
        .join(', ')})`
    )
  return out
}
const entryOn = (day: string): Entry | undefined => list<Entry>('journal_entries', { date: day }).find((e) => (e as unknown as { owner_id: string }).owner_id === getProfileId())
/** Whether today's diary is written. */
export const diaryDoneToday = (): boolean => !!entryOn(ymd(new Date()))?.content.trim()

/** Writes (or adds to) today's diary from what they said; returns a line for Nova. */
export async function writeDiary(o: { said: string; mood?: number | null; energy?: number | null; gratitude?: string | null; highlight?: string | null; people?: string[] }): Promise<string> {
  const day = ymd(new Date())
  const facts = dayFacts()
  // Their words, tidied a little (first person, their voice), and what to follow up later.
  const raw = await claudeChat(
    [
      {
        role: 'system',
        content: `Turn what someone told you about their day into their diary entry: first person, in their own words and voice, lightly tidied (no new facts, no advice, nothing they didn't say), a few short paragraphs. title: a few words for the day. tags: up to 4 one-word themes. threads: things worth asking about later (an upcoming test, a worry, a plan with someone), each with ask (one short friendly question) and on (YYYY-MM-DD, the day to ask: after the event, or in 2 to 3 days). Today is ${day}.`
      },
      { role: 'user', content: o.said.slice(0, 6000) }
    ],
    {
      type: 'object',
      properties: {
        entry: { type: 'string' },
        title: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        threads: { type: 'array', items: { type: 'object', properties: { about: { type: 'string' }, ask: { type: 'string' }, on: { type: 'string' } }, required: ['about', 'ask', 'on'] } }
      },
      required: ['entry', 'title', 'tags', 'threads']
    },
    { ...getPrefs(), novaBrain: 'haiku', novaEffort: 'low' },
    'chat'
  ).catch(() => '')
  let j: { entry?: string; title?: string; tags?: string[]; threads?: Thread[] } = {}
  try {
    j = JSON.parse(raw)
  } catch {
    j = { entry: o.said }
  }
  const text = `${(j.entry || o.said).trim()}${facts.length ? `\n\nThe day: ${facts.join(' · ')}` : ''}`
  const was = entryOn(day)
  let details: Record<string, unknown> = {}
  try {
    details = JSON.parse(was?.details || '{}')
  } catch {
    /* fresh */
  }
  if (o.highlight) details.highlight = o.highlight
  if (o.people?.length) details.with = o.people.join(', ')
  const clamp = (v: number | null | undefined): number | null => (v == null ? null : Math.max(1, Math.min(5, Math.round(v))))
  const patch = {
    content: was?.content.trim() ? `${was.content.trim()}\n\n${text}` : text,
    title: was?.title || (j.title ?? '').slice(0, 60),
    mood: clamp(o.mood) ?? was?.mood ?? null,
    energy: clamp(o.energy) ?? was?.energy ?? null,
    gratitude: o.gratitude?.trim() || was?.gratitude || '',
    tags: JSON.stringify([...new Set([...JSON.parse(was?.tags || '[]'), ...(j.tags ?? []).map((t) => String(t).toLowerCase())])].slice(0, 8)),
    details: JSON.stringify(details)
  }
  if (was) update('journal_entries', was.id, patch)
  else create('journal_entries', { date: day, ...patch })
  const threads = [...(getSetting<Thread[]>('diary_threads') ?? []), ...(j.threads ?? []).filter((t) => t.ask && /^\d{4}-\d\d-\d\d$/.test(t.on))].slice(-20)
  setSetting('diary_threads', threads)
  tickHabit('diary')
  return `Saved today's diary${j.title ? ` ("${j.title}")` : ''}${patch.mood ? `, mood ${patch.mood}/5` : ''}. ${threads.length ? 'You’ll check back on what they mentioned later.' : ''}`.trim()
}

/** A thread due to be asked about (and takes it off the list), or null. */
export function threadDue(): Thread | null {
  const ts = getSetting<Thread[]>('diary_threads') ?? []
  const today = ymd(new Date())
  const t = ts.find((x) => x.on <= today)
  if (!t) return null
  setSetting(
    'diary_threads',
    ts.filter((x) => x !== t)
  )
  return t
}

/** Sunday's look back on the week: moods, what went well, and patterns once there's enough to see them. */
export function weekReflection(): string[] {
  const out: string[] = []
  const now = new Date()
  const days = Array.from({ length: 7 }, (_, i) => ymd(new Date(now.getTime() - i * 864e5)))
  const entries = days.map(entryOn).filter((e): e is Entry => !!e)
  const moods = entries.filter((e) => e.mood != null).map((e) => e.mood!)
  if (moods.length >= 3) {
    const avg = moods.reduce((a, b) => a + b, 0) / moods.length
    const best = entries.filter((e) => e.mood === Math.max(...moods))[0]
    out.push(`Your mood averaged ${avg.toFixed(1)} out of 5 this week${best?.title ? `, best on ${new Date(best.date).toLocaleDateString('en-GB', { weekday: 'long' })} ("${best.title}")` : ''}.`)
  }
  out.push(...patterns())
  return out
}

/** Patterns from the last month, once there's enough data: sleep and recall scores, the hours you focus best. */
export function patterns(): string[] {
  const out: string[] = []
  const db = getDb()
  const since = ymd(new Date(Date.now() - 30 * 864e5))
  const sleep = new Map(
    (db.prepare('SELECT date, sleep_hours FROM journal_entries WHERE deleted_at IS NULL AND date >= ? AND sleep_hours IS NOT NULL').all(since) as { date: string; sleep_hours: number }[]).map((r) => [
      r.date,
      r.sleep_hours
    ])
  )
  const quiz = db.prepare(`SELECT date, score, max_score FROM paper_attempts WHERE deleted_at IS NULL AND kind = 'quiz' AND date >= ? AND notes LIKE '%"recall":1%' AND max_score > 0`).all(since) as {
    date: string
    score: number
    max_score: number
  }[]
  const pairs = quiz.map((q) => ({ sleep: sleep.get(q.date), pct: q.score / q.max_score })).filter((p): p is { sleep: number; pct: number } => p.sleep != null)
  const well = pairs.filter((p) => p.sleep >= 7)
  const short = pairs.filter((p) => p.sleep < 7)
  if (well.length >= 3 && short.length >= 3) {
    const a = well.reduce((n, p) => n + p.pct, 0) / well.length
    const b = short.reduce((n, p) => n + p.pct, 0) / short.length
    if (Math.abs(a - b) >= 0.08) out.push(`You score ${Math.round(Math.abs(a - b) * 100)} points ${a > b ? 'better' : 'worse'} on recall after 7 or more hours of sleep.`)
  }
  const sessions = db
    .prepare('SELECT started_at, planned_minutes, focused_seconds, completed FROM focus_sessions WHERE deleted_at IS NULL AND started_at >= ?')
    .all(new Date(Date.now() - 30 * 864e5).toISOString()) as {
    started_at: string
    planned_minutes: number
    focused_seconds: number
    completed: number
  }[]
  if (sessions.length >= 6) {
    const part = (h: number): string => (h < 12 ? 'mornings' : h < 17 ? 'afternoons' : 'evenings')
    const by = new Map<string, { n: number; done: number }>()
    for (const s of sessions) {
      const k = part(new Date(s.started_at).getHours())
      const v = by.get(k) ?? { n: 0, done: 0 }
      v.n++
      v.done += s.completed ? 1 : 0
      by.set(k, v)
    }
    const best = [...by.entries()].filter(([, v]) => v.n >= 2).sort((x, y) => y[1].done / y[1].n - x[1].done / x[1].n)[0]
    if (best && best[1].done / best[1].n >= 0.6) out.push(`Your focus sessions go best in the ${best[0]}: ${Math.round((best[1].done / best[1].n) * 100)}% finished.`)
  }
  return out
}

/** For the diary: today's entry so far, if any (Nova reads it to talk with you). */
export function todayEntry(): string {
  const e = entryOn(ymd(new Date()))
  return e?.content ? e.content.slice(0, 2000) : ''
}
