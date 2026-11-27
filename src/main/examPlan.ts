// A revision plan for an exam: one study block a day until the exam (45 minutes in the evening, moved to fit round
// what's already in your calendar), each on what you're weakest at in that module (the recall questions you miss
// most, by week and topic), the weakest first and the last day a mixed run-through. Put in your calendar.
import { create, getDb, list } from './db'

type A = { id: string; module_id: string; title: string; kind: string; due_at: string | null; score_pct: number | null }
const pad = (n: number): string => String(n).padStart(2, '0')

/** The next exam (in that module, if named) in the next three weeks, or null. */
export function nextExam(moduleWords?: string | null): (A & { module: string; days: number }) | null {
  const mods = list<{ id: string; name: string; code: string }>('modules', { archived: 0 })
  const w = (moduleWords ?? '').toLowerCase().trim()
  const mod = w ? mods.find((m) => m.name.toLowerCase().includes(w) || w.includes(m.name.toLowerCase()) || m.code.toLowerCase().includes(w)) : undefined
  const now = Date.now()
  const ex = list<A>('assessments')
    .filter((a) => a.kind === 'exam' && a.due_at && Date.parse(a.due_at) > now && Date.parse(a.due_at) - now < 21 * 864e5 && (!mod || a.module_id === mod.id))
    .sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!))[0]
  if (!ex) return null
  return { ...ex, module: mods.find((m) => m.id === ex.module_id)?.name ?? 'the module', days: Math.ceil((Date.parse(ex.due_at!) - now) / 864e5) }
}

/** Puts the plan in the calendar; the line for Nova. */
export function planRevision(moduleWords?: string | null): string {
  const ex = nextExam(moduleWords)
  if (!ex) return moduleWords ? `No ${moduleWords} exam in the next three weeks in their assessments.` : 'No exam in the next three weeks in their assessments.'
  // What's weakest: the recall questions missed most (and those never right), by week and topic.
  type Q = { module_id: string | null; topic: string; times_seen: number; times_right: number; paper_id: string | null }
  const papers = new Map(list<{ id: string; notes: string }>('exam_papers').map((p) => [p.id, p.notes]))
  const weak = new Map<string, number>()
  for (const q of list<Q>('quiz_questions').filter((x) => x.module_id === ex.module_id)) {
    let week = 0
    try {
      week = (JSON.parse(papers.get(q.paper_id ?? '') ?? '{}') as { week?: number }).week ?? 0
    } catch {
      /* none */
    }
    const k = `${week ? `Week ${week}` : 'Revision'}${q.topic ? `: ${q.topic}` : ''}`
    const miss = q.times_seen ? (q.times_seen - q.times_right) / q.times_seen : 0.5 // (never seen: in between)
    weak.set(k, (weak.get(k) ?? 0) + miss)
  }
  // (no recall answers yet in this module: its weeks, the latest first)
  const weekTitles = list<{ module_id: string; number: number; title: string }>('weeks', { module_id: ex.module_id })
    .sort((a, b) => b.number - a.number)
    .map((w) => `Week ${w.number}${w.title ? `: ${w.title}` : ''}`)
  const topics = weak.size ? [...weak.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k) : weekTitles
  const days = Math.min(13, ex.days - 1)
  if (days < 1) return `The ${ex.module} exam is tomorrow: too soon for a plan. Offer a quick recall quiz instead.`
  const db = getDb()
  const made: string[] = []
  for (let d = 1; d <= days; d++) {
    const day = new Date()
    day.setDate(day.getDate() + d)
    // 45 minutes from 7 pm, later in half-hour steps if something's already on then (up to 10 pm).
    let start: Date | null = null
    for (let h = 19 * 60; h <= 21 * 60 + 15; h += 30) {
      const s = new Date(day)
      s.setHours(Math.floor(h / 60), h % 60, 0, 0)
      const e = new Date(s.getTime() + 45 * 60_000)
      const clash = db.prepare('SELECT 1 FROM events WHERE deleted_at IS NULL AND all_day = 0 AND start_at < ? AND end_at > ? LIMIT 1').get(e.toISOString(), s.toISOString())
      if (!clash) {
        start = s
        break
      }
    }
    if (!start) continue
    const topic = d === days ? 'mixed run-through of everything' : (topics[(d - 1) % Math.max(1, topics.length)] ?? 'revision session')
    create('events', {
      title: `Revise ${ex.module}: ${topic}`,
      start_at: start.toISOString(),
      end_at: new Date(start.getTime() + 45 * 60_000).toISOString(),
      all_day: 0,
      module_id: ex.module_id,
      assessment_id: ex.id,
      notes: `Revision plan for ${ex.title} (${new Date(ex.due_at!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}). Start with a recall quiz on it.`
    })
    made.push(`${start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })} ${pad(start.getHours())}:${pad(start.getMinutes())}`)
  }
  return made.length
    ? `Put ${made.length} revision blocks in their calendar for the ${ex.module} ${ex.title}, one each evening (${made[0]} to ${made[made.length - 1]}), weakest topics first${topics.length ? ` (starting with ${topics[0]})` : ''}, and a run-through the day before.`
    : 'Their evenings are full until the exam: suggest they pick times themselves.'
}
