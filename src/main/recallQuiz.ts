// Active recall, rebuilt: short quizzes from your modules' weeks, made of questions Nova prepared in the background
// (recallMake.ts) from each week's worksheets (their own questions) and its slides (Nova's questions). Each quiz is
// mostly recent weeks with older ones mixed in, and more of what you got wrong (spaced repetition, the SM-2 way, on
// the question itself). Shared by the PC and the phone: the questions, results and schedule are synced tables
// (exam_papers, quiz_questions, paper_attempts), so you can start on either.
import { create, get, getSetting, list, setSetting, update } from './db'
import { tickHabit } from './habitsAuto'

export type RecallSize = 'short' | 'medium' | 'long'
export type RecallSource = 'both' | 'worksheet' | 'content'
export type RecallQ = {
  id: string
  moduleId: string
  module: string
  week: number
  source: 'worksheet' | 'content'
  kind: 'mcq' | 'saq'
  prompt: string
  options: string[]
  answer: string
  /** the answer was written by Nova (the worksheet had none) */
  novaAnswer: boolean
  topic: string
  file: string
}
/** How many multiple-choice and short-answer questions each size has. */
export const SIZES: Record<RecallSize, { mcq: number; saq: number }> = { short: { mcq: 5, saq: 1 }, medium: { mcq: 10, saq: 3 }, long: { mcq: 20, saq: 4 } }
/** What's kept about a recall paper (one per file a week's questions came from), in its notes. */
export type RecallMeta = { recall: 1; week: number; source: 'worksheet' | 'content'; file: string; topicId?: number }

type Row = { id: string; module_id: string | null; notes: string; title: string; deleted_at?: string | null }
type QRow = {
  id: string
  paper_id: string | null
  module_id: string | null
  number: string
  prompt: string
  kind: 'mcq' | 'open'
  options: string
  answer: string
  topic: string
  times_seen: number
  times_right: number
  ease: number
  interval_days: number
  repetitions: number
  due_at: string | null
}
const NOVA = "(Nova's answer) "
const DAY = 864e5
const today = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const meta = (p: Row): RecallMeta | null => {
  try {
    const m = JSON.parse(p.notes || '{}') as RecallMeta
    return m.recall === 1 ? m : null
  } catch {
    return null
  }
}
/** Recall papers by id, with what they hold. */
function papers(): Map<string, { p: Row; m: RecallMeta }> {
  const out = new Map<string, { p: Row; m: RecallMeta }>()
  for (const p of list<Row>('exam_papers', { kind: 'practice' })) {
    const m = meta(p)
    if (m) out.set(p.id, { p, m })
  }
  return out
}
const modName = (id: string | null): string => (id ? (get<{ name: string }>('modules', id)?.name ?? 'Module') : 'Module')
function toQ(q: QRow, pm: { p: Row; m: RecallMeta }): RecallQ {
  let options: string[] = []
  try {
    options = JSON.parse(q.options || '[]') as string[]
  } catch {
    /* none */
  }
  const nova = q.answer.startsWith(NOVA)
  return {
    id: q.id,
    moduleId: q.module_id ?? pm.p.module_id ?? '',
    module: modName(q.module_id ?? pm.p.module_id),
    week: pm.m.week,
    source: pm.m.source,
    kind: q.kind === 'mcq' && options.length >= 2 ? 'mcq' : 'saq',
    prompt: q.prompt,
    options,
    answer: nova ? q.answer.slice(NOVA.length) : q.answer,
    novaAnswer: nova,
    topic: q.topic,
    file: pm.m.file
  }
}

// ---------- Settings ----------

export type RecallSettings = { size: RecallSize; source: RecallSource; modules: string[] | null }
export const recallSettings = (): RecallSettings => ({ size: 'medium', source: 'both', modules: null, ...(getSetting<Partial<RecallSettings>>('recall_settings') ?? {}) })
export function setRecallSettings(patch: Partial<RecallSettings>): RecallSettings {
  const next = { ...recallSettings(), ...patch }
  setSetting('recall_settings', next)
  return next
}

// ---------- What's there ----------

export type RecallOverview = {
  modules: { id: string; name: string; weeks: { week: number; worksheet: number; content: number }[]; due: number; total: number }[]
  doneToday: boolean
  lastScore: { score: number; max: number; date: string } | null
  streak: number
  settings: RecallSettings
}
export function recallOverview(): RecallOverview {
  const ps = papers()
  const now = Date.now()
  const byMod = new Map<string, RecallOverview['modules'][number]>()
  for (const q of list<QRow>('quiz_questions')) {
    const pm = q.paper_id ? ps.get(q.paper_id) : undefined
    if (!pm) continue
    const mid = q.module_id ?? pm.p.module_id ?? ''
    let m = byMod.get(mid)
    if (!m) byMod.set(mid, (m = { id: mid, name: modName(mid), weeks: [], due: 0, total: 0 }))
    let w = m.weeks.find((x) => x.week === pm.m.week)
    if (!w) m.weeks.push((w = { week: pm.m.week, worksheet: 0, content: 0 }))
    w[pm.m.source]++
    m.total++
    if (q.due_at && Date.parse(q.due_at) <= now) m.due++
  }
  for (const m of byMod.values()) m.weeks.sort((a, b) => a.week - b.week)
  const attempts = list<{ date: string; score: number | null; max_score: number | null; notes: string }>('paper_attempts', { kind: 'quiz' })
    .filter((a) => a.notes.includes('"recall":1'))
    .sort((a, b) => b.date.localeCompare(a.date))
  // (days in a row with a quiz done, up to today or yesterday)
  const days = new Set(attempts.map((a) => a.date.slice(0, 10)))
  let streak = 0
  for (let d = new Date(); ; d = new Date(d.getTime() - DAY)) {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (days.has(k)) streak++
    else if (k !== today()) break
    if (streak > 365) break
  }
  const last = attempts[0]
  return {
    modules: [...byMod.values()].sort((a, b) => a.name.localeCompare(b.name)),
    doneToday: days.has(today()),
    lastScore: last && last.score != null && last.max_score != null ? { score: last.score, max: last.max_score, date: last.date } : null,
    streak,
    settings: recallSettings()
  }
}
export const recallDoneToday = (): boolean => recallOverview().doneToday

// ---------- Making a quiz ----------

export type QuizAsk = { size?: RecallSize; source?: RecallSource; modules?: string[] | null; fromWeek?: number | null; toWeek?: number | null; weeks?: number[] | null; latest?: boolean }
/** A short quiz: the size's multiple-choice and short-answer questions, from the weeks and modules asked for. Due
 *  and missed questions first, then mostly the latest weeks (the newest week, the one before, then older ones). */
export function buildQuiz(ask: QuizAsk = {}): RecallQ[] {
  const s = { ...recallSettings(), ...Object.fromEntries(Object.entries(ask).filter(([, v]) => v !== undefined)) } as RecallSettings & QuizAsk
  const ps = papers()
  const now = Date.now()
  const pool: { q: QRow; r: RecallQ }[] = list<QRow>('quiz_questions')
    .filter((q) => q.paper_id && ps.has(q.paper_id))
    .map((q) => ({ q, r: toQ(q, ps.get(q.paper_id!)!) }))
    .filter(({ r }) => (s.source === 'both' || r.source === s.source) && (!s.modules?.length || s.modules.includes(r.moduleId)))
    .filter(({ r }) => (s.weeks?.length ? s.weeks.includes(r.week) : (s.fromWeek == null || r.week >= s.fromWeek) && (s.toWeek == null || r.week <= s.toWeek)))
  // The newest week per module, to weight by how recent each question's week is.
  const newest = new Map<string, number>()
  for (const { r } of pool) newest.set(r.moduleId, Math.max(newest.get(r.moduleId) ?? 0, r.week))
  // ("the latest week": each module's own newest week)
  if (s.latest) pool.splice(0, pool.length, ...pool.filter(({ r }) => r.week === newest.get(r.moduleId)))
  const score = ({ q, r }: (typeof pool)[number]): number => {
    const due = q.due_at ? (Date.parse(q.due_at) <= now ? 3 : -1) : 0.5 // (never seen: in between)
    const missed = q.times_seen > q.times_right ? 1.5 : 0
    const age = (newest.get(r.moduleId) ?? r.week) - r.week
    const recent = age === 0 ? 1.6 : age === 1 ? 1 : 0.4
    return due + missed + recent + Math.random() * 1.2
  }
  const { mcq, saq } = SIZES[s.size ?? 'medium']
  const pick = (kind: 'mcq' | 'saq', n: number): RecallQ[] => {
    const xs = pool
      .filter(({ r }) => r.kind === kind)
      .sort((a, b) => score(b) - score(a))
      .map(({ r }) => r)
    // (no more than half from one file, so a quiz mixes things)
    const out: RecallQ[] = []
    const per = new Map<string, number>()
    for (const r of xs) {
      if (out.length >= n) break
      const k = `${r.moduleId}|${r.file}`
      if ((per.get(k) ?? 0) >= Math.max(2, Math.ceil(n / 2))) continue
      per.set(k, (per.get(k) ?? 0) + 1)
      out.push(r)
    }
    for (const r of xs) if (out.length < n && !out.includes(r)) out.push(r)
    return out
  }
  const qs = [...pick('mcq', mcq), ...pick('saq', saq)]
  // (options shuffled, so the answer isn't always where the worksheet had it)
  return qs.map((q) => (q.kind === 'mcq' ? { ...q, options: [...q.options].sort(() => Math.random() - 0.5) } : q))
}

// ---------- After a quiz ----------

export type QuizResult = { id: string; grade: 'got' | 'partly' | 'missed' }
/** Saves a quiz: each question's next review (got it: further apart; missed: tomorrow), and the attempt. */
export function saveQuiz(results: QuizResult[], o: { size: RecallSize; source: RecallSource; seconds: number }): { score: number; max: number } {
  const now = Date.now()
  let score = 0
  for (const r of results) {
    const q = get<QRow>('quiz_questions', r.id)
    if (!q) continue
    const quality = r.grade === 'got' ? 5 : r.grade === 'partly' ? 3 : 1
    score += r.grade === 'got' ? 1 : r.grade === 'partly' ? 0.5 : 0
    let { ease, interval_days: interval, repetitions: reps } = q
    if (quality < 3) {
      reps = 0
      interval = 1
    } else {
      reps += 1
      interval = reps === 1 ? 1 : reps === 2 ? 3 : Math.round(interval * ease)
    }
    ease = Math.max(1.3, ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))
    update('quiz_questions', q.id, {
      ease,
      interval_days: interval,
      repetitions: reps,
      due_at: new Date(now + interval * DAY).toISOString(),
      times_seen: q.times_seen + 1,
      times_right: q.times_right + (r.grade === 'got' ? 1 : 0)
    })
  }
  const first = results.length ? get<QRow>('quiz_questions', results[0].id) : null
  create('paper_attempts', {
    paper_id: first?.paper_id ?? null,
    module_id: first?.module_id ?? null,
    kind: 'quiz',
    date: today(),
    duration_sec: Math.round(o.seconds),
    score,
    max_score: results.length,
    notes: JSON.stringify({ recall: 1, size: o.size, source: o.source })
  })
  tickHabit('recall') // (a study habit ticks itself)
  return { score, max: results.length }
}

// ---------- A quiz Nova starts ("yes, test me") ----------

let queued: QuizAsk | null = null
/** Nova asked for a quiz: the Recall page starts it when it opens (or at once, if it's open). */
export function queueQuiz(ask: QuizAsk): void {
  queued = ask
}
/** The quiz Nova asked for, once (null if none). */
export function takeQueuedQuiz(): QuizAsk | null {
  const q = queued
  queued = null
  return q
}
/** (PC) shows the Recall page and tells it a quiz is waiting (index.ts fills this in). */
export const recallHooks = { open: (): void => {} }
