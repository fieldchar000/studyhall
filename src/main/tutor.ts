// Tutor mode: Nova teaches you a whole lesson (the deck or PDF you have open, or a topic), stop by stop, as a tutor
// would. Ctrl+Alt+T (or "tutor mode" / "teach me this whole deck") turns it on and off; the globe wears a scholar's
// cap while it's on.
//  • Cheaper than a normal chat on Sonnet: its own conversation, with a short tutor brief and only the tools a lesson
//    needs (drawing, looking at slides, reading the lesson, turning pages), so every message sends far less. The lesson
//    is read once, and each "next" is a tiny message.
//  • Recorded: while it's on, Studyhall records the lesson as a video (your screen and Nova's voice) into
//    Documents\Nova Lessons, to watch again any time without using your Claude plan. Switch it off on Nova's page.

import { app, desktopCapturer, ipcMain, screen, shell } from 'electron'
import { createReadStream, createWriteStream, existsSync, type WriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { mkdir, readdir, rename, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { getPrefs } from './prefs'
import { fixWebmDuration } from './webmDuration'
import { restoreAfterLesson } from './windowSplit'
import { closeLessonWindow } from './lessonWindow'
import { endRun, type LessonRun } from './lessonRecord'

const OFFSCREEN = process.env.STUDYHALL_OFFSCREEN === '1'

export const tutorHooks = {
  /** A lesson just ended (its record, or null if nothing happened in it): its pack is made (step 3). */
  lessonOver: (_r: LessonRun | null): void => {},
  /** The globe puts its cap on (or takes it off). */
  hat: (_on: boolean): void => {},
  /** A request to Nova, as if you'd said it (the tutor's opening question). */
  ask: (_text: string): void => {},
  /** The voice window starts (with a screen to record) or stops recording. */
  record: (_on: boolean, _sourceId?: string): void => {},
  /** The lesson couldn't be recorded: tell them (a notification). */
  failed: (_text: string): void => {},
  /** Tutor mode ended: the lesson's drawings go. */
  ended: (): void => {},
  /** Start reading the deck or PDF that's open, in the background, the moment tutor mode starts. */
  warm: (): void => {},
  /** The conversation for tutor mode starts fresh (or the normal one comes back). */
  reset: (): void => {}
}

let on = false
// The full lesson (every content slide) unless they asked for a summary.
let style: 'summary' | 'full' = 'full'
export const tutorStyle = (): 'summary' | 'full' => style
let title = ''
export const tutorOn = (): boolean => on

/** Turn tutor mode on or off. on: also how it starts ('summary' or 'full', if they said). */
export function setTutor(next: boolean, wanted?: 'summary' | 'full', what?: string): void {
  if (next && wanted) style = wanted
  if (next && !on && !wanted) style = 'full'
  if (next === on) {
    if (next && wanted) tutorHooks.ask(`(Tutor mode: they want the ${wanted} lesson${what ? ` of ${what}` : ''}. Start it now.)`)
    return
  }
  on = next
  tutorHooks.hat(on)
  tutorHooks.reset()
  if (on) {
    title = what ?? ''
    tutorHooks.warm()
    void startRecording()
    tutorHooks.ask(
      wanted
        ? `(Tutor mode is on: they want the ${wanted} lesson${what ? ` of ${what}` : ''}. Start it now.)`
        : `(Tutor mode is on${what ? ` for ${what}` : ''}. If a slide deck or PDF is open, read_lesson it and start the full lesson (every slide; a summary only if they ask for one); if nothing is open, ask in one short question what they'd like to learn.)`
    )
  } else {
    stopRecording()
    closeLessonWindow()
    tutorHooks.lessonOver(endRun())
    void restoreAfterLesson()
    tutorHooks.ended()
  }
}
export const toggleTutor = (): void => setTutor(!on)
/** The lesson's name, for the recording's file name (Nova says it once it has read the lesson). */
export function tutorTitle(t: string): void {
  title = t.slice(0, 80)
}

// ---------- Recording the lesson (screen and Nova's voice) ----------
const lessonsDir = (): string => join(app.getPath('documents'), 'Nova Lessons')
let out: WriteStream | null = null
let file = ''
let startedAt = 0
let written = 0
let asking = false // screen capture asked for, until the first piece arrives (the voice window may record then)
let checkTimer: NodeJS.Timeout | null = null
/** May the voice window capture the screen now? Only while a lesson's recording is starting or running. */
export const lessonRecording = (): boolean => asking || !!out

async function startRecording(): Promise<void> {
  if (OFFSCREEN || getPrefs().novaRecord !== true) return // (off unless switched on: Replay covers watching a lesson again)
  // The screen your mouse is on (where the lesson happens).
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } }).catch(() => [])
  const src = sources.find((s) => s.display_id === String(d.id)) ?? sources[0]
  if (!src || !on) return
  await mkdir(lessonsDir(), { recursive: true })
  // Your own clock's date and time ("Lesson 2026-11-20 09.49").
  const t = new Date()
  const p2 = (n: number): string => String(n).padStart(2, '0')
  const stamp = `${t.getFullYear()}-${p2(t.getMonth() + 1)}-${p2(t.getDate())} ${p2(t.getHours())}.${p2(t.getMinutes())}`
  file = join(lessonsDir(), `Lesson ${stamp}.webm`)
  out = createWriteStream(file)
  startedAt = Date.now()
  written = 0
  asking = true
  tutorHooks.record(true, src.id)
  // Nothing recorded after 15 s (the screen couldn't be captured): say so, and leave no empty file behind.
  if (checkTimer) clearTimeout(checkTimer)
  checkTimer = setTimeout(() => {
    checkTimer = null
    if (out && !written) recordingFailed()
  }, 15_000)
}
function recordingFailed(why = ''): void {
  const w = out
  const f = file
  out = null
  asking = false
  tutorHooks.record(false)
  w?.end(() => void unlink(f).catch(() => {}))
  tutorHooks.failed(`Couldn't record this lesson${why ? ` (${why})` : ''}. The lesson itself carries on.`)
}
function stopRecording(): void {
  if (!out) return
  tutorHooks.record(false)
  // The last piece arrives after "stop": the file is finished then (see 'tutor:recDone').
}
ipcMain.on('tutor:recChunk', (_e, chunk: Uint8Array) => {
  if (out && chunk?.byteLength) {
    asking = false
    written += chunk.byteLength
    out.write(Buffer.from(chunk))
  }
})
ipcMain.on('tutor:recFailed', (_e, why: string) => {
  if (out) recordingFailed(String(why ?? '').slice(0, 120))
})
ipcMain.on('tutor:recDone', () => {
  const w = out
  const f = file
  const ms = Date.now() - startedAt
  out = null
  asking = false
  if (!w) return
  w.end(async () => {
    if (!written) {
      await unlink(f).catch(() => {})
      return
    }
    // Its length written in, so players can skip around in it.
    await fixWebmDuration(f, ms).catch(() => false)
    // Named after the lesson once it's known ("Lesson 2026-11-19 14.05 Endocrine system.webm").
    const t = title.replace(/[\\/:*?"<>|]+/g, ' ').trim()
    if (t) await rename(f, f.replace(/\.webm$/, ` ${t}.webm`)).catch(() => {})
  })
})

/** The recorded lessons, newest first. */
export async function listLessons(): Promise<{ name: string; path: string; at: string; mb: number }[]> {
  const names = await readdir(lessonsDir()).catch(() => [] as string[])
  const out: { name: string; path: string; at: string; mb: number }[] = []
  for (const n of names.filter((x) => x.toLowerCase().endsWith('.webm'))) {
    const p = join(lessonsDir(), n)
    const s = await stat(p).catch(() => null)
    // (an empty one is a recording that never started: it goes)
    if (s && !s.size && p !== file && Date.now() - s.mtimeMs > 60_000) await unlink(p).catch(() => {})
    else if (s && s.size > 0) out.push({ name: n.replace(/\.webm$/i, ''), path: p, at: s.mtime.toISOString(), mb: Math.round((s.size / 1e6) * 10) / 10 })
  }
  return out.sort((a, b) => b.at.localeCompare(a.at))
}
export async function openLesson(path: string): Promise<void> {
  if (path.startsWith(lessonsDir()) && existsSync(path)) await shell.openPath(path)
}
/** A recorded lesson for Studyhall's own player (material://lesson/<file name>), with ranges so it can skip around. */
export async function serveLesson(request: Request): Promise<Response> {
  const name = decodeURIComponent(new URL(request.url).pathname.replace(/^\/+/, ''))
  if (!name.toLowerCase().endsWith('.webm') || /[\\/]|\.\./.test(name)) return new Response('Not found', { status: 404 })
  const p = join(lessonsDir(), name)
  const s = await stat(p).catch(() => null)
  if (!s) return new Response('Not found', { status: 404 })
  const m = /bytes=(\d*)-(\d*)/.exec(request.headers.get('range') ?? '')
  const start = m && m[1] ? Number(m[1]) : 0
  const end = m && m[2] ? Math.min(Number(m[2]), s.size - 1) : s.size - 1
  if (start > end || start >= s.size) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${s.size}` } })
  const body = Readable.toWeb(createReadStream(p, { start, end })) as unknown as ReadableStream
  const headers: Record<string, string> = { 'content-type': 'video/webm', 'accept-ranges': 'bytes', 'content-length': String(end - start + 1), 'x-content-type-options': 'nosniff' }
  if (m) headers['content-range'] = `bytes ${start}-${end}/${s.size}`
  return new Response(body, { status: m ? 206 : 200, headers })
}
export async function showLessonsFolder(): Promise<void> {
  await mkdir(lessonsDir(), { recursive: true })
  await shell.openPath(lessonsDir())
}

/** Tutor mode's brief: short (it's sent with every message). Like a good teacher: the deck is mapped once (the lesson
 *  plan), and each stop adds what the slide can't: connecting the dots, plain words, an analogy, where it's used,
 *  why it matters, and questions that check it landed. The slides are shown in Studyhall's lesson window. */
export function tutorPrompt(name: string, user: string): string {
  return `You are ${name}, ${user}'s tutor, teaching them out loud, like a good teacher sitting beside them. Your job is that they understand and remember it. Teach naturally in your own words, not by a template.
- Start: read_lesson once. It opens their deck in the lesson window (a Studyhall window: their slide big on the left, a column on the right for your cards) and gives you the whole deck plus your LESSON PLAN: how the deck is built, the stops, what each builds on, words to ring, an analogy, a real use, why it matters, a check question. It's your map, not a script: follow it, adapt to them.
- First: say the plan's opening line. If the deck is scattered, ask once whether they want it slide by slide or topic by topic, and wait.
- Find out what they know: at the start of each new topic, one quick check (check, kind say: "In a sentence, what do you think resistance is?", or a quick choice), and wait. Go light on what they know; spend the time on what's new and on the core ideas.
- The full lesson (the usual) covers EVERY slide in the plan: each one shown, and every point on it explained, in order (the plan lists them). Spend the most time on the core ideas; a detail gets a line, but none is skipped. A stop with more than one slide: show_slide each in turn and teach it (one draw call for each). Before the recap, any slide still not shown gets taught (Studyhall tells you which). A summary lesson (only if they asked) teaches the key ideas and skips details.
- Each stop: say your first line before any tool, so they're never left in silence. Then show_slide its slide, then ONE draw call that builds the stop up the way you'd explain it at their side: each beat is one thing appearing while you talk about it (its say line is what you say then). Ring or underline the words you're on (at: {text: the words exactly as written on the slide showing, a few words from one line}), and tie each card to those words (the card's tie: the same words) so a line runs from the slide to it; the next card comes in a later beat, when you move on to it. Ring or underline 2 to 4 places on the slide as you go. A core stop builds up to 3 or 4 cards over its beats: a short fact card (at most 3 points); a diagram (a flow for a process or pathway, or a model for a structure or mechanism); a picture (the slide's own figure on a photo card with labels: see_photo its picture address from read_lesson; else a labelled figure from find_figure); and the plan's practice card for this subject (where it's used, the nursing and clinical side, when it goes wrong, where it is, or the steps). Other stops: 2 or 3 cards. A light stop (an overview, a list of terms): 2 cards, fewer words. card_size small.
- What you add, as a teacher (the slide already says the facts; never read it out): connect the dots (how this follows from the last stop; "remember slide 4…", show_slide with beside: that slide, only slides they've already seen, never one ahead), plain words first and then the proper term, an everyday analogy, where it's found or used in real life, and why it matters (or how an exam asks it).
- Check it landed: about one check per topic, plus one after each core idea (not after every point), using the plan's check question or your own: choice (3 or 4 short options, tapped or said) or say (they explain in a sentence). Ask it in one short line and stop. A tapped answer comes back to you marked right or wrong. A spoken answer: judge it, then note_answer (correct, and what was missing). Right: why it's right in a line, and move on. Wrong or unsure: find the exact part that didn't land and explain only that, a different way (a new comparison), then a quick second check. Never build on an idea that didn't land. Light stops need no check.
- The lesson window has Next, Back, Pause and End buttons: "(Tutor mode: they pressed the Next button…)" means go straight on to the next stop; Back means go over the last stop again, briefly and differently.
- Their questions mid-lesson ("wait, what's that?", "go back", "skip to the ECG part"): answer, then carry on from where you were. At the end: a short recap of the stops, and offer a quick quiz.
Talk like a person: short spoken sentences, no markdown, no lists out loud. Use tutor_done when they want to stop or the lesson is finished.`
}
