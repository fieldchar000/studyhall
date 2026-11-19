// Tutor mode: Nova teaches you a whole lesson (the deck or PDF you have open, or a topic), stop by stop, as a tutor
// would. Ctrl+Alt+T (or "tutor mode" / "teach me this whole deck") turns it on and off; the globe wears a scholar's
// cap while it's on.
//  • Cheaper than a normal chat on Sonnet: its own conversation, with a short tutor brief and only the tools a lesson
//    needs (drawing, looking at slides, reading the lesson, turning pages), so every message sends far less. The lesson
//    is read once, and each "next" is a tiny message.
//  • Recorded: while it's on, Studyhall records the lesson as a video (your screen and Nova's voice) into
//    Documents\Nova Lessons, to watch again any time without using your Claude plan. Switch it off on Nova's page.

import { app, desktopCapturer, ipcMain, screen, shell } from 'electron'
import { createWriteStream, existsSync, type WriteStream } from 'node:fs'
import { mkdir, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { getPrefs } from './prefs'

const OFFSCREEN = process.env.STUDYHALL_OFFSCREEN === '1'

export const tutorHooks = {
  /** The globe puts its cap on (or takes it off). */
  hat: (_on: boolean): void => {},
  /** A request to Nova, as if you'd said it (the tutor's opening question). */
  ask: (_text: string): void => {},
  /** The voice window starts (with a screen to record) or stops recording. */
  record: (_on: boolean, _sourceId?: string): void => {},
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
    void startRecording()
    tutorHooks.ask(
      style
        ? `(Tutor mode is on: they want the ${style} lesson${what ? ` of ${what}` : ''}. Start it now.)`
        : `(Tutor mode is on${what ? ` for ${what}` : ''}. Find out what they want to learn: if a slide deck or PDF is open, offer to teach it; ask, in one short question, whether they want the summary lesson or the full lesson.)`
    )
  } else stopRecording()
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

async function startRecording(): Promise<void> {
  if (OFFSCREEN || getPrefs().novaRecord === false) return
  // The screen your mouse is on (where the lesson happens).
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } }).catch(() => [])
  const src = sources.find((s) => s.display_id === String(d.id)) ?? sources[0]
  if (!src || !on) return
  await mkdir(lessonsDir(), { recursive: true })
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '.')
  file = join(lessonsDir(), `Lesson ${stamp}.webm`)
  out = createWriteStream(file)
  tutorHooks.record(true, src.id)
}
function stopRecording(): void {
  if (!out) return
  tutorHooks.record(false)
  // The last piece arrives after "stop": the file is finished then (see 'tutor:recDone').
}
ipcMain.on('tutor:recChunk', (_e, chunk: Uint8Array) => {
  if (out && chunk?.byteLength) out.write(Buffer.from(chunk))
})
ipcMain.on('tutor:recDone', () => {
  const w = out
  const f = file
  out = null
  if (!w) return
  w.end(async () => {
    // Named after the lesson once it's known ("Lesson 2026-11-19 14.05 Endocrine system.webm").
    const t = title.replace(/[\\/:*?"<>|]+/g, ' ').trim()
    if (t) {
      const { rename } = await import('node:fs/promises')
      const to = f.replace(/\.webm$/, ` ${t}.webm`)
      await rename(f, to).catch(() => {})
    }
  })
})

/** The recorded lessons, newest first. */
export async function listLessons(): Promise<{ name: string; path: string; at: string; mb: number }[]> {
  const names = await readdir(lessonsDir()).catch(() => [] as string[])
  const out: { name: string; path: string; at: string; mb: number }[] = []
  for (const n of names.filter((x) => x.toLowerCase().endsWith('.webm'))) {
    const p = join(lessonsDir(), n)
    const s = await stat(p).catch(() => null)
    if (s) out.push({ name: n.replace(/\.webm$/i, ''), path: p, at: s.mtime.toISOString(), mb: Math.round((s.size / 1e6) * 10) / 10 })
  }
  return out.sort((a, b) => b.at.localeCompare(a.at))
}
export async function openLesson(path: string): Promise<void> {
  if (path.startsWith(lessonsDir()) && existsSync(path)) await shell.openPath(path)
}
export async function showLessonsFolder(): Promise<void> {
  await mkdir(lessonsDir(), { recursive: true })
  await shell.openPath(lessonsDir())
}

/** Tutor mode's brief: short (it's sent with every message), and what makes a good lesson. */
export function tutorPrompt(name: string, user: string): string {
  return `You are ${name}, ${user}'s tutor, teaching them out loud on their PC. They're a student; your job is that they understand and remember, not that you cover everything.

You teach in stops. Each stop is one idea: say one short line, then one draw call with deep: true and 2 to 5 beats (draw it as you explain it: each beat's say line explains like a teacher what that beat shows: why it happens, how it links to the last stop, an everyday comparison when it helps, what to notice), then end with "Say next when you're ready" or a one-line check question. Never read slides out.
- The lesson: if they have a slide deck or PDF open (or name one), read_lesson once at the start and teach from it in its order. Summary lesson: the whole thing in 4 to 8 stops (the big ideas and how they connect). Full lesson: a stop per section (a few slides each), in order. Say how many stops there are at the start.
- Show their own slides: for a slide with a diagram, see_photo its picture address, then a photo card of it with labels on the parts you explain (that's how it can be watched again later). go_to_page and ring it on their screen only when it helps them follow along in their own app.
- Add what the slides don't have: a drawn diagram (flow, model, table, graph, molecule…) or a photo from the web (a photo card with a Wikipedia query and labels) when a picture makes it clearer.
- Their questions mid-lesson ("wait, what's that?", "go back", "skip to the ECG part", "quiz me on this bit"): answer them, then carry on from where you were. At the end: a short recap of the stops and offer a 3-question quiz (a quiz card).
Talk like a person: short spoken sentences, no markdown, no lists out loud. Use tutor_done when they want to stop or the lesson is finished.`
}
