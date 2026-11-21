// Tutor mode's record of each lesson (one file per lesson taken, in userData/lessons): the deck, every check question
// and how they answered, what was shaky, what was said, and (for Replay) what was shown and drawn when. Nova's page
// (Lessons, Map) is built from these; nothing here uses Claude.
import { app } from 'electron'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Lesson } from './lessonReader'

export type LessonCheck = {
  at: number
  stop: number | null
  topic: string
  question: string
  kind: 'choice' | 'say'
  options?: string[]
  answer: string
  wrongIdea?: string
  given?: string
  correct?: boolean
  /** a second check on the same idea, after it was explained again */
  retry?: boolean
  /** what they missed (a spoken answer, as Nova judged it) */
  missed?: string
}
export type LessonEvent =
  | { t: number; type: 'slide'; page: number; beside: number | null }
  | { t: number; type: 'draw'; e: unknown }
  | { t: number; type: 'line'; id: number; text: string; audio?: string }
  | { t: number; type: 'say'; text: string }
  | { t: number; type: 'you'; text: string }
  | { t: number; type: 'check'; check: number }
  | { t: number; type: 'clear' }
export type LessonRun = {
  id: string
  lessonId: string
  title: string
  kind: 'slides' | 'pdf'
  source: string
  count: number
  module?: string
  started: number
  ended?: number
  /** the stops of its lesson plan (number, topic, idea, slides) */
  stops: { n: number; topic: string; idea: string; slides: number[] }[]
  /** the stops taught (by number) and the slides shown */
  taught: number[]
  seen: number[]
  checks: LessonCheck[]
  shaky: { topic: string; idea: string; fix: string; at: number; fixed?: boolean }[]
  transcript: { who: 'nova' | 'you'; text: string; at: number }[]
  events: LessonEvent[]
  /** what was made at the end (step 3): the test, the mind map, the flashcards deck, the notes */
  pack?: Record<string, unknown>
}

const dir = (): string => join(app.getPath('userData'), 'lessons')
let run: LessonRun | null = null
let saveTimer: NodeJS.Timeout | null = null

function save(now = false): void {
  if (!run) return
  const r = run
  const write = (): void => {
    saveTimer = null
    void mkdir(dir(), { recursive: true })
      .then(() => writeFile(join(dir(), `${r.id}.json`), JSON.stringify(r)))
      .catch((e) => console.warn('lesson record not saved:', e))
  }
  if (saveTimer) clearTimeout(saveTimer)
  if (now) write()
  else saveTimer = setTimeout(write, 1500)
}

/** The lesson being taught now (null between lessons). */
export const currentRun = (): LessonRun | null => run

/** A lesson starts on this deck (or carries on, if it's the one already being taught). */
export function startRun(l: Lesson, stops: LessonRun['stops'], module?: string): LessonRun {
  if (run && run.lessonId === l.id && !run.ended) {
    if (stops.length && !run.stops.length) run.stops = stops
    return run
  }
  endRun()
  run = {
    id: `${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`,
    lessonId: l.id,
    title: l.title,
    kind: l.kind,
    source: l.source,
    count: l.count,
    module,
    started: Date.now(),
    stops,
    taught: [],
    seen: [],
    checks: [],
    shaky: [],
    transcript: [],
    events: []
  }
  save(true)
  return run
}

/** The lesson is over (tutor mode off, or another deck). Lessons with nothing in them aren't kept. */
export function endRun(): LessonRun | null {
  const r = run
  if (!r) return null
  run = null
  r.ended = Date.now()
  if (saveTimer) clearTimeout(saveTimer)
  if (!r.transcript.length && !r.checks.length && r.events.length < 2) {
    void unlink(join(dir(), `${r.id}.json`)).catch(() => {})
    return null
  }
  void mkdir(dir(), { recursive: true }).then(() => writeFile(join(dir(), `${r.id}.json`), JSON.stringify(r)))
  return r
}

const t = (): number => (run ? Date.now() - run.started : 0)

export function noteSlide(page: number, beside: number | null): void {
  if (!run) return
  if (!run.seen.includes(page)) run.seen.push(page)
  const stop = run.stops.find((s) => s.slides[0] === page || s.slides.includes(page))
  if (stop && !run.taught.includes(stop.n)) run.taught.push(stop.n)
  run.events.push({ t: t(), type: 'slide', page, beside })
  save()
}
export function noteDraw(e: unknown): void {
  if (!run) return
  run.events.push({ t: t(), type: 'draw', e })
  save()
}
export function noteClear(): void {
  if (!run) return
  run.events.push({ t: t(), type: 'clear' })
}
export function noteLine(id: number, text: string): void {
  if (!run || !text.trim()) return
  run.events.push({ t: t(), type: 'line', id, text })
  run.transcript.push({ who: 'nova', text: text.trim(), at: Date.now() })
  save()
}
export function noteSaid(text: string): void {
  if (!run || !text.trim()) return
  run.events.push({ t: t(), type: 'say', text })
  const last = run.transcript.at(-1)
  if (last?.who === 'nova' && Date.now() - last.at < 4000) last.text = `${last.text} ${text.trim()}`.replace(/\s+/g, ' ')
  else run.transcript.push({ who: 'nova', text: text.trim(), at: Date.now() })
  save()
}
export function noteYou(text: string): void {
  if (!run || !text.trim() || text.trim().startsWith('(')) return
  run.events.push({ t: t(), type: 'you', text })
  run.transcript.push({ who: 'you', text: text.trim(), at: Date.now() })
  save()
}

/** A check question is up: its number in the run. */
export function noteCheck(c: Omit<LessonCheck, 'at' | 'retry'>): number {
  if (!run) return -1
  const retry = run.checks.some((q) => q.topic === c.topic && q.correct === false && (q.stop === c.stop || !c.stop))
  run.checks.push({ ...c, at: Date.now(), retry })
  run.events.push({ t: t(), type: 'check', check: run.checks.length - 1 })
  save()
  return run.checks.length - 1
}
/** How they answered the latest check. Wrong: the idea goes on the shaky list; right on a retry: it's fixed there. */
export function noteAnswer(given: string, correct: boolean, missed?: string): LessonCheck | null {
  if (!run) return null
  const c = [...run.checks].reverse().find((q) => q.correct == null)
  if (!c) return null
  c.given = given
  c.correct = correct
  if (missed) c.missed = missed
  const idea = c.wrongIdea || c.question
  if (!correct) {
    if (!run.shaky.some((s) => s.topic === c.topic && s.idea === idea && !s.fixed)) run.shaky.push({ topic: c.topic, idea, fix: c.answer, at: Date.now() })
  } else if (c.retry) for (const s of run.shaky) if (s.topic === c.topic) s.fixed = true
  save(true)
  return c
}
/** The latest check still waiting for an answer. */
export const openCheck = (): LessonCheck | null => [...(run?.checks ?? [])].reverse().find((q) => q.correct == null) ?? null

/** Every lesson kept, newest first (Nova's page). */
export async function listRuns(): Promise<LessonRun[]> {
  if (!existsSync(dir())) return []
  const out: LessonRun[] = []
  for (const f of await readdir(dir()).catch(() => [] as string[])) {
    if (!f.endsWith('.json')) continue
    try {
      out.push(JSON.parse(await readFile(join(dir(), f), 'utf8')) as LessonRun)
    } catch {
      /* a broken file is skipped */
    }
  }
  if (run && !out.some((r) => r.id === run!.id)) out.push(run)
  return out.sort((a, b) => b.started - a.started)
}
export async function getRun(id: string): Promise<LessonRun | null> {
  if (run?.id === id) return run
  if (!/^[\w-]+$/.test(id)) return null
  try {
    return JSON.parse(await readFile(join(dir(), `${id}.json`), 'utf8')) as LessonRun
  } catch {
    return null
  }
}
export async function saveRun(r: LessonRun): Promise<void> {
  if (run?.id === r.id) run = r
  await mkdir(dir(), { recursive: true })
  await writeFile(join(dir(), `${r.id}.json`), JSON.stringify(r))
}
export async function deleteRun(id: string): Promise<void> {
  if (!/^[\w-]+$/.test(id)) return
  if (run?.id === id) run = null
  await unlink(join(dir(), `${id}.json`)).catch(() => {})
}
