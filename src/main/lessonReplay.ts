// Replay: a lesson played back live in the lesson window, from its record (no video, no Claude). Its slides come up
// as they did, each step's rings, arrows and cards are drawn by the small pen as Nova's voice says that step's line,
// the check cards come back (with how they answered), and the stops are chapters to jump between. Free to watch:
// Nova's voice is made on this PC.
import { inkPlay } from './bauer'
import { getRun, type LessonEvent, type LessonRun } from './lessonRecord'
import { closeLessonWindow, lessonArea, markCheck, openLessonWindow, setLessonMode, setReplayState, showCheck, showLessonSlide, replayHooks } from './lessonWindow'
import type { Lesson } from './lessonReader'
import { clearLessonInk } from './roamiesTools'
import { voiceHush, voiceSayAndWait } from './voice'

type Rect = [number, number, number, number]
let run: LessonRun | null = null
let at = 0
let gen = 0
let paused = false
let chapters: { title: string; at: number }[] = []
/** The lesson being replayed (for "ask Nova about this"), and where it is. */
export const replaying = (): { title: string; page: number } | null => (run ? { title: run.title, page } : null)
let page = 1
/** Something to say when a replay starts or stops (the orb's two-Nova mode). */
export const replayOrb = { lesson: (_on: boolean): void => {} }

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Where each drawing's places were, moved to where the slide is now (the window may be another size). */
function moved(e: unknown, from: number[] | null | undefined, to: Rect | null): unknown {
  if (!from || !to || from.length !== 4) return e
  const kx = to[2] / from[2]
  const ky = to[3] / from[3]
  const pt = (x: number, y: number): [number, number] => [to[0] + (x - from[0]) * kx, to[1] + (y - from[1]) * ky]
  const inside = (r: number[]): boolean => r[0] + r[2] / 2 >= from[0] && r[0] + r[2] / 2 <= from[0] + from[2] && r[1] + r[3] / 2 >= from[1] && r[1] + r[3] / 2 <= from[1] + from[3]
  const walk = (v: unknown, key = ''): unknown => {
    if (Array.isArray(v)) {
      if (key === 'rect' && v.length === 4 && v.every((n) => typeof n === 'number') && inside(v as number[])) {
        const [x, y] = pt(v[0], v[1])
        return [x, y, v[2] * kx, v[3] * ky].map(Math.round)
      }
      if (key === 'points') return v.map((p) => (Array.isArray(p) && p.length === 2 ? pt(Number(p[0]), Number(p[1])).map(Math.round) : p))
      return v.map((x) => walk(x))
    }
    if (v && typeof v === 'object') {
      const o: Record<string, unknown> = {}
      for (const [k, x] of Object.entries(v)) o[k] = k === 'win' || k === 'busy' || k === 'prefer' || k === 'avoid' ? x : walk(x, k)
      return o
    }
    return v
  }
  return walk(e)
}

async function play(g: number): Promise<void> {
  const r = run
  if (!r) return
  while (g === gen && at < r.events.length) {
    while (paused && g === gen) await wait(200)
    if (g !== gen) return
    const ev = r.events[at] as LessonEvent & Record<string, unknown>
    at++
    chapterNow()
    if (ev.type === 'slide') {
      clearLessonInk()
      page = ev.page
      await showLessonSlide(ev.page, ev.beside && ev.beside !== ev.page ? ev.beside : null)
      await wait(400)
    } else if (ev.type === 'clear') clearLessonInk()
    else if (ev.type === 'draw') {
      // Each step on its own, as its line is said (the next one waits for the voice), like the lesson itself.
      const area = lessonArea()
      const e = moved(ev.e, ev.slide, (area?.busy[0] as Rect | undefined) ?? null) as Record<string, unknown>
      const beats = (Array.isArray(e.beats) ? e.beats : []) as Record<string, unknown>[]
      for (const [k, b] of beats.entries()) {
        if (g !== gen) return
        while (paused && g === gen) await wait(200)
        const beat = { ...b }
        delete beat.line
        beat.voiced = false
        inkPlay(
          {
            ...e,
            id: `replay-${at}-${k}`,
            seg: k,
            beats: [beat],
            last: k === beats.length - 1,
            ...(area ? { win: area.win, busy: area.busy, prefer: area.column, avoid: area.busy, lesson: true } : {})
          },
          null
        )
        const line = String(beat.caption ?? beat.say ?? '').trim()
        if (line) await voiceSayAndWait(line).catch(() => {})
        else await wait(1200)
        await wait(500)
      }
    } else if (ev.type === 'say') {
      const text = String(ev.text ?? '').trim()
      if (text) await voiceSayAndWait(text).catch(() => {})
    } else if (ev.type === 'you') {
      setReplayState({ you: String(ev.text ?? '') })
      await wait(1800)
      setReplayState({ you: null })
    } else if (ev.type === 'check') {
      const c = r.checks[ev.check]
      if (!c) continue
      showCheck({ question: c.question, kind: c.kind, options: c.options })
      await wait(2500)
      if (c.kind === 'choice' && c.options) {
        const norm = (s: string): string =>
          s
            .toLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, ' ')
            .trim()
        const picked = c.given != null ? c.options.findIndex((o) => norm(o) === norm(c.given!)) : -1
        const right = c.options.findIndex((o) => norm(o) === norm(c.answer))
        markCheck(picked >= 0 ? picked : null, right >= 0 ? right : null)
      } else if (c.given) setReplayState({ you: c.given })
      await wait(1500)
    }
  }
  if (g === gen) setReplayState({ done: true })
}

function chapterNow(): void {
  let k = 0
  for (let i = 0; i < chapters.length; i++) if (chapters[i].at < at) k = i
  setReplayState({ chapter: k })
}

/** Play a lesson back in the lesson window. */
export async function startReplay(id: string): Promise<string> {
  const r = await getRun(id)
  if (!r) return 'That lesson isn’t there any more.'
  if (!r.events.some((e) => e.type === 'slide')) return 'That lesson has nothing to replay (it was taken before Replay existed).'
  stopReplay(false)
  run = r
  at = 0
  paused = false
  // Chapters: each stop taught, where its first slide comes up.
  chapters = []
  const seenStops = new Set<number>()
  r.events.forEach((e, i) => {
    if (e.type !== 'slide') return
    const stop = r.stops.find((s) => s.slides.includes(e.page))
    const key = stop?.n ?? -e.page
    if (seenStops.has(key)) return
    seenStops.add(key)
    chapters.push({ title: stop ? `${stop.topic || `Stop ${stop.n}`}` : `${r.kind === 'slides' ? 'Slide' : 'Page'} ${e.page}`, at: i })
  })
  const first = r.events.find((e) => e.type === 'slide') as { page: number } | undefined
  const l = { id: r.lessonId, kind: r.kind, title: r.title, source: r.source, count: r.count, current: first?.page ?? 1, pages: [], app: '', window: '' } as unknown as Lesson
  setLessonMode('replay')
  openLessonWindow(l, first?.page ?? 1)
  setReplayState({ chapters: chapters.map((c) => c.title), chapter: 0, done: false, you: null, title: r.title })
  replayOrb.lesson(true)
  const g = ++gen
  await wait(1200)
  void play(g)
  return 'ok'
}

/** Stop the replay (and close its window). */
export function stopReplay(close = true): void {
  if (!run) return
  gen++
  run = null
  voiceHush()
  clearLessonInk()
  replayOrb.lesson(false)
  setLessonMode('tutor')
  if (close) closeLessonWindow()
}

function jump(to: number): void {
  if (!run) return
  gen++
  voiceHush()
  clearLessonInk()
  // From the chapter's first slide (a drawing for it comes after that).
  at = Math.max(0, to)
  paused = false
  setReplayState({ paused: false, done: false })
  const g = gen
  void wait(300).then(() => play(g))
}

replayHooks.next = () => {
  if (!run) return
  const k = chapters.findIndex((c) => c.at >= at)
  if (k >= 0) jump(chapters[k].at)
}
replayHooks.back = () => {
  if (!run) return
  const done = chapters.filter((c) => c.at < at - 1)
  const target = done.length >= 2 ? done[done.length - 2] : chapters[0]
  jump(target?.at ?? 0)
}
replayHooks.chapter = (k) => {
  if (run && chapters[k]) jump(chapters[k].at)
}
replayHooks.pause = (on) => {
  paused = on
  if (on) voiceHush()
}
replayHooks.end = () => stopReplay()
