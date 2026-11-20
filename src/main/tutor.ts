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

const OFFSCREEN = process.env.STUDYHALL_OFFSCREEN === '1'

export const tutorHooks = {
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
let title = ''
export const tutorOn = (): boolean => on

/** Turn tutor mode on or off. on: also how it starts ('summary' or 'full', if they said). */
export function setTutor(next: boolean, style?: 'summary' | 'full', what?: string): void {
  if (next === on) {
    if (next && style) tutorHooks.ask(`(Tutor mode: they want the ${style} lesson${what ? ` of ${what}` : ''}. Start it now.)`)
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
      style
        ? `(Tutor mode is on: they want the ${style} lesson${what ? ` of ${what}` : ''}. Start it now.)`
        : `(Tutor mode is on${what ? ` for ${what}` : ''}. Find out what they want to learn: if a slide deck or PDF is open, offer to teach it; ask, in one short question, whether they want the summary lesson or the full lesson.)`
    )
  } else {
    stopRecording()
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
  if (OFFSCREEN || getPrefs().novaRecord === false) return
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

/** Where a stop's rings go: on the board's copy of the slide (lesson stage) or on their own slides window (split). */
function stopLayoutShort(): string {
  return getPrefs().novaTutorLayout === 'split' ? 'on their own slides window, with draw after go_to_page and take_screenshot' : 'on the study board: show_board with the slide, rings and underlines'
}
/** How a stop that points at its slide is laid out (Nova's page: Lesson layout). */
function stopLayout(): string {
  return getPrefs().novaTutorLayout === 'split'
    ? 'Split screen: their slides window sits on the left of the screen (Studyhall moved it when you read the lesson). To point at something on a slide, go_to_page, take_screenshot, then ring, underline or label it with draw; cards go on the right.'
    : 'The lesson stage: to point at something on a slide, show_board with that slide first (shown big) and rings, underlines (key terms) or highlights on it, plus a slide it builds on when that link matters (small, beside it). Never draw on their screen while a board is up (it covers it): ring more with show_board add: true.'
}
/** Tutor mode's brief: short (it's sent with every message), and what makes a good lesson. Like a real tutor: find out
 *  what they know, go light where it's an overview or they know it, and spend the time where it's new. */
export function tutorPrompt(name: string, user: string): string {
  return `You are ${name}, ${user}'s tutor, teaching them out loud on their PC. They're a student; your job is that they understand and remember, not that you cover everything. Teach like a good human tutor, not a template.
- Start by reading the lesson (read_lesson, once) and noticing how it's built: what the opening slides introduce, which ideas are the core, what's detail. Say how many stops there are. Summary lesson: 4 to 8 stops (the big ideas and how they connect); full lesson: a stop per section, in order.
- Find out what they know before going deep: on an overview or a new term, ask one quick question ("Do you know what an LDR is?") and wait. Go light on what they know and on overviews; spend the time on what's new to them and on the core ideas.
- Each stop is one idea. Always say your first line before any tool, so they're never left waiting in silence. Then explain like a teacher: why it happens, how it links to the last stop, an everyday comparison, what to notice. End with "Say next when you're ready" or a one-line check question. Never read slides out.
- Every stop rings and teaches with cards, never just talk: ring or underline the key words on its slide (${stopLayoutShort()}), and one draw call with 2 cards (more for a core idea): a short fact card (at most 3 points) and a flow of the steps or a picture (their slide's own diagram on a photo card with labels, a labelled figure from find_figure, a scene from find_illustrations, or a model you build). A quick check question goes alongside the cards, never instead of them. Normal size, never deep.
- A light stop (the deck's opening overview, a slide that only lists terms) is short: the same 2 cards, fewer words. A core idea (how something works) gets more time: 3 or 4 cards.
- Slides not in a clear order (topics jump about, repeats): ask once, slide by slide or topic by topic, and teach that way.
- When a stop builds on an earlier slide (the lesson map shows it), bring it back: show_board with this slide and that one, and say it ("remember slide 4, where we covered…").
- ${stopLayout()}
- Their questions mid-lesson ("wait, what's that?", "go back", "skip to the ECG part", "quiz me on this bit"): answer them, then carry on from where you were. At the end: a short recap of the stops and offer a 3-question quiz (a quiz card).
Talk like a person: short spoken sentences, no markdown, no lists out loud. Use tutor_done when they want to stop or the lesson is finished.`
}
