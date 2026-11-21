// Practice after lessons (Nova's Map tab): new real-life situations where Nova doesn't say which idea applies, marked
// with feedback on the reasoning; next-day checks on what was shaky (further apart while they keep getting them
// right); and exam practice for a module, mixed from its lessons' tests and weighted to what's shaky. Results colour
// the map: a shaky topic goes solid once they get it right in practice.
import { app } from 'electron'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { claudeChat } from './claude'
import { list } from './db'
import { listRuns, saveRun, type LessonRun } from './lessonRecord'
import type { LessonPack } from './lessonPack'
import { getPrefs } from './prefs'

export type PracticeQ = { q: string; topic: string; idea: string; points: string[]; model: string; lessonId: string }
export type PracticeLog = { topic: string; module: string; lessonId: string; correct: boolean; at: number }

const DAY = 24 * 3600_000
const logFile = (): string => join(app.getPath('userData'), 'lesson-practice.json')
let log: PracticeLog[] | null = null
async function practiceLog(): Promise<PracticeLog[]> {
  if (log) return log
  try {
    log = existsSync(logFile()) ? (JSON.parse(await readFile(logFile(), 'utf8')) as PracticeLog[]) : []
  } catch {
    log = []
  }
  return log
}
export async function practiceHistory(): Promise<PracticeLog[]> {
  return practiceLog()
}

type Shaky = LessonRun['shaky'][number] & { next?: number; streak?: number }
const packOf = (r: LessonRun): LessonPack | null => (r.pack?.made ? (r.pack as unknown as LessonPack) : null)
const moduleOf = (r: LessonRun): string => packOf(r)?.module?.name ?? r.module ?? 'Other'
/** When a shaky idea is next checked: the day after it was found, then further apart while it keeps going right. */
const nextOf = (s: Shaky, r: LessonRun): number => s.next ?? Math.max(s.at, r.ended ?? s.at) + DAY - 3 * 3600_000

/** The shaky ideas due for a check now (oldest first), with their lesson. */
export async function dueChecks(): Promise<{ lessonId: string; title: string; module: string; topic: string; idea: string; fix: string }[]> {
  const now = Date.now()
  const out: { lessonId: string; title: string; module: string; topic: string; idea: string; fix: string; at: number }[] = []
  for (const r of await listRuns()) {
    if (!r.ended) continue
    for (const s of r.shaky as Shaky[])
      if (!s.fixed && nextOf(s, r) <= now) out.push({ lessonId: r.id, title: r.title, module: moduleOf(r), topic: s.topic, idea: s.idea, fix: s.fix, at: nextOf(s, r) })
  }
  return out.sort((a, b) => a.at - b.at).slice(0, 12)
}

/** New practice situations: on what's due, a topic, or a whole module (one Sonnet call). */
export async function makePractice(o: { due?: boolean; topic?: string; module?: string; lessonId?: string }): Promise<PracticeQ[]> {
  const runs = (await listRuns()).filter((r) => r.ended && (r.stops.length || packOf(r)))
  let pick = runs
  if (o.lessonId) pick = runs.filter((r) => r.id === o.lessonId)
  else if (o.module) pick = runs.filter((r) => moduleOf(r) === o.module)
  else if (o.topic) pick = runs.filter((r) => r.stops.some((s) => s.topic.toLowerCase() === o.topic!.toLowerCase()))
  const due = o.due ? await dueChecks() : []
  if (o.due) pick = runs.filter((r) => due.some((d) => d.lessonId === r.id))
  if (!pick.length) return []
  const material = pick
    .slice(0, 6)
    .map((r) => {
      const p = packOf(r)
      const ideas = (
        p?.notes.length ? p.notes.map((n) => `${n.topic}: ${n.idea}${n.realUse ? ` (used in: ${n.realUse})` : ''}`) : r.stops.filter((s) => r.taught.includes(s.n)).map((s) => `${s.topic}: ${s.idea}`)
      ).join(' | ')
      const shaky = (r.shaky as Shaky[]).filter((s) => !s.fixed).map((s) => `${s.topic}: ${s.fix}`)
      return `[lesson ${r.id}] "${r.title}". Ideas: ${ideas}${shaky.length ? `. Shaky: ${shaky.join(' | ')}` : ''}`
    })
    .join('\n')
  const focus = o.due
    ? `Focus on the shaky ideas due for a check: ${due.map((d) => `${d.topic}: ${d.fix}`).join(' | ')}.`
    : o.topic
      ? `Focus on the topic "${o.topic}".`
      : o.module
        ? `Mix the module's topics, more on what's shaky.`
        : ''
  const raw = await claudeChat(
    [
      {
        role: 'system',
        content:
          "Write practice for a student who was taught these lessons: 4 short real-life situations or cases (a patient, a device, a design problem, a lab result), each asking what's going on, what to do, or why. Never name the idea it tests: they must work out which idea applies. Each: q (2 or 3 sentences), topic and idea (what it tests), points (2 or 3 key points a good answer has), model (a model answer in 2 sentences), lesson (the lesson id in brackets it comes from). Use only what the lessons and the subject support."
      },
      { role: 'user', content: `${material}\n\n${focus}` }
    ],
    {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              q: { type: 'string' },
              topic: { type: 'string' },
              idea: { type: 'string' },
              points: { type: 'array', items: { type: 'string' } },
              model: { type: 'string' },
              lesson: { type: 'string' }
            },
            required: ['q', 'topic', 'idea', 'points', 'model', 'lesson']
          }
        }
      },
      required: ['items']
    },
    { ...getPrefs(), novaBrain: 'sonnet', novaEffort: 'low' },
    'explain'
  ).catch(() => '')
  try {
    const j = JSON.parse(raw) as { items?: Record<string, unknown>[] }
    return (j.items ?? [])
      .map((x) => ({
        q: String(x.q ?? ''),
        topic: String(x.topic ?? ''),
        idea: String(x.idea ?? ''),
        points: (Array.isArray(x.points) ? x.points : []).map(String).slice(0, 4),
        model: String(x.model ?? ''),
        lessonId: pick.find((r) => String(x.lesson ?? '').includes(r.id))?.id ?? pick[0].id
      }))
      .filter((x) => x.q && x.points.length)
      .slice(0, 5)
  } catch {
    return []
  }
}

/** Mark a practice answer: the reasoning against the key points (one small Claude call). */
export async function markPractice(q: PracticeQ, answer: string): Promise<{ correct: boolean; hit: boolean[]; feedback: string } | null> {
  if (!answer.trim()) return { correct: false, hit: q.points.map(() => false), feedback: 'No answer: have a look at the model answer.' }
  const raw = await claudeChat(
    [
      {
        role: 'system',
        content:
          "Mark a student's answer to a practice case. hit: one true/false per key point, in order (true if they got that idea, in any words). correct: true if they found the right idea and reasoned it through (most key points). feedback: 2 friendly sentences on their reasoning: what they got, and the step that was missing or wrong (if any)."
      },
      {
        role: 'user',
        content: `Case: ${q.q}\nIt tests: ${q.idea}\nKey points:\n${q.points.map((p, k) => `${k + 1}. ${p}`).join('\n')}\nModel answer: ${q.model}\n\nTheir answer: ${answer.slice(0, 2000)}`
      }
    ],
    { type: 'object', properties: { correct: { type: 'boolean' }, hit: { type: 'array', items: { type: 'boolean' } }, feedback: { type: 'string' } }, required: ['correct', 'hit', 'feedback'] },
    { ...getPrefs(), novaBrain: 'haiku', novaEffort: 'low' },
    'chat'
  ).catch(() => '')
  try {
    const j = JSON.parse(raw) as { correct?: boolean; hit?: unknown[]; feedback?: string }
    return { correct: !!j.correct, hit: q.points.map((_, k) => !!j.hit?.[k]), feedback: String(j.feedback ?? '') }
  } catch {
    return null
  }
}

/** Practice results: kept for the map; a shaky idea checked right is checked again later (3 days, then a week), and
 *  counts as fixed after it's been right twice; wrong, it comes back tomorrow. */
export async function savePractice(results: { q: PracticeQ; correct: boolean }[]): Promise<void> {
  const l = await practiceLog()
  const runs = await listRuns()
  const touched = new Set<LessonRun>()
  for (const { q, correct } of results) {
    const r = runs.find((x) => x.id === q.lessonId)
    l.push({ topic: q.topic, module: r ? moduleOf(r) : 'Other', lessonId: q.lessonId, correct, at: Date.now() })
    if (!r) continue
    const low = (s: string): string => s.toLowerCase()
    for (const s of r.shaky as Shaky[]) {
      if (s.fixed || !(low(s.topic) && (low(s.topic).includes(low(q.topic)) || low(q.topic).includes(low(s.topic))))) continue
      if (correct) {
        s.streak = (s.streak ?? 0) + 1
        if (s.streak >= 2) s.fixed = true
        else s.next = Date.now() + (s.streak === 1 ? 3 : 7) * DAY
      } else {
        s.streak = 0
        s.next = Date.now() + DAY
      }
      touched.add(r)
    }
  }
  log = l.slice(-2000)
  await writeFile(logFile(), JSON.stringify(log)).catch(() => {})
  for (const r of touched) await saveRun(r)
}

/** Exam practice for a module: from its lessons' tests (no Claude), more questions on its shaky topics. */
export async function examSet(module: string): Promise<{ mcq: (LessonPack['test']['mcq'][number] & { lessonId: string })[]; saq: (LessonPack['test']['saq'][number] & { lessonId: string })[] }> {
  const runs = (await listRuns()).filter((r) => moduleOf(r) === module && packOf(r))
  const shakyTopics = new Set(runs.flatMap((r) => (r.shaky as Shaky[]).filter((s) => !s.fixed).map((s) => s.topic.toLowerCase())))
  const weight = (t: string): number => (shakyTopics.has(t.toLowerCase()) ? 0 : 1) + Math.random()
  const mcq = runs.flatMap((r) => packOf(r)!.test.mcq.map((q) => ({ ...q, lessonId: r.id }))).sort((a, b) => weight(a.topic) - weight(b.topic))
  const saq = runs.flatMap((r) => packOf(r)!.test.saq.map((q) => ({ ...q, lessonId: r.id }))).sort((a, b) => weight(a.topic) - weight(b.topic))
  return { mcq: mcq.slice(0, 10), saq: saq.slice(0, 2) }
}

/** Modules with an exam in the next two weeks (for the map), by module name. */
export function examsSoon(): Record<string, number> {
  const out: Record<string, number> = {}
  try {
    const mods = list<{ id: string; name: string }>('modules', { archived: 0 })
    for (const a of list<{ module_id: string; kind: string; due_at: string | null }>('assessments')) {
      if (a.kind !== 'exam' || !a.due_at) continue
      const days = Math.ceil((Date.parse(a.due_at) - Date.now()) / DAY)
      const m = mods.find((x) => x.id === a.module_id)
      if (m && days >= 0 && days <= 14 && (out[m.name] == null || days < out[m.name])) out[m.name] = days
    }
  } catch {
    /* no exams */
  }
  return out
}

/** Next-day checks: once a day (at most), when shaky ideas are due, a nudge (it opens the map). */
export function startPracticeNudges(notify: (title: string, body: string) => void): void {
  let lastDay = ''
  const tick = async (): Promise<void> => {
    const day = new Date().toDateString()
    if (day === lastDay || new Date().getHours() < 9) return
    const due = await dueChecks().catch(() => [])
    if (!due.length) return
    lastDay = day
    const titles = [...new Set(due.map((d) => d.title))].slice(0, 2).join(' and ')
    notify('Two-minute check', `${due.length} shaky idea${due.length > 1 ? 's' : ''} from ${titles} ${due.length > 1 ? 'are' : 'is'} due a quick check. It's on Nova's Map tab.`)
  }
  setTimeout(() => void tick(), 60_000)
  setInterval(() => void tick(), 30 * 60_000).unref?.()
}
