// The PoliteMall page: the real Brightspace (signed in, in Studyhall's own PoliteMall session) shown inside the page,
// and beside it what Studyhall read from it: what's due (quizzes first), what's new since last time, each course's
// weeks with buttons (teach me, summarise, flashcards, save to Materials), grades, search, and how ready you are for
// each quiz (from your flashcards). Read-only, like everything PoliteMall: nothing is ever submitted or posted.

import { app, BrowserWindow, Notification, session, shell, WebContentsView } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { create, getDb, getSetting, setSetting, update } from './db'
import { importMaterials } from './files'
import { getPrefs } from './prefs'
import { downloadTopic, flat, LMS, lockDown, PART, politeHooks, schoolData, schoolStatus, type SchoolCourse, type SchoolData } from './politemall'
import { voiceAsk } from './voice'

const OFFSCREEN = process.env.STUDYHALL_OFFSCREEN === '1'
const DAY = 24 * 3_600_000

// ---------- Brightspace inside the page ----------

let view: WebContentsView | null = null
let attachedTo: BrowserWindow | null = null
let viewVisible = false
export type PoliteRect = { x: number; y: number; width: number; height: number }

function makeView(): WebContentsView {
  lockDown() // (no camera, microphone or location; no webviews: like the sign-in window)
  const v = new WebContentsView({ webPreferences: { session: session.fromPartition(PART), sandbox: true, contextIsolation: true, nodeIntegration: false } })
  v.setBackgroundColor('#0b1530')
  // Links to other sites (Teams, YouTube, files hosted elsewhere) open in your normal browser.
  v.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(LMS)) void v.webContents.loadURL(url)
    else if (/^https?:\/\//i.test(url) && !OFFSCREEN) void shell.openExternal(url)
    return { action: 'deny' }
  })
  void v.webContents.loadURL(`${LMS}/d2l/home`)
  return v
}
export function showPoliteView(win: BrowserWindow, rect: PoliteRect): void {
  view ??= makeView()
  if (attachedTo !== win) {
    attachedTo?.contentView.removeChildView(view)
    win.contentView.addChildView(view)
    attachedTo = win
  }
  view.setBounds({ x: Math.round(rect.x), y: Math.round(rect.y), width: Math.max(0, Math.round(rect.width)), height: Math.max(0, Math.round(rect.height)) })
  view.setVisible(true)
  viewVisible = true
}
export function hidePoliteView(): void {
  view?.setVisible(false)
  viewVisible = false
}
/** Shows a page of the site in the view (a topic, a quiz, a course's content). */
export function politeGo(url: string): void {
  if (!url.startsWith(LMS)) return
  view ??= makeView()
  void view.webContents.loadURL(url)
}
export function politeBack(): void {
  if (view?.webContents.navigationHistory.canGoBack()) view.webContents.navigationHistory.goBack()
}
export const politeView = (): WebContentsView | null => view
export const politeViewVisible = (): boolean => viewVisible

// ---------- What's new since last time ----------

export type PoliteNew = { at: string; kind: 'file' | 'news' | 'grade' | 'assignment' | 'quiz'; courseId: number; course: string; text: string; topicId?: number }
const newFile = (): string => join(app.getPath('userData'), 'politemall-new.json')
function readNew(): PoliteNew[] {
  try {
    return existsSync(newFile()) ? (JSON.parse(readFileSync(newFile(), 'utf8')) as PoliteNew[]) : []
  } catch {
    return []
  }
}
function whatChanged(before: SchoolData, after: SchoolData): PoliteNew[] {
  const at = new Date().toISOString()
  const out: PoliteNew[] = []
  for (const c of after.courses) {
    const old = before.courses.find((x) => x.id === c.id)
    const name = c.code || c.name
    if (!old) continue // a course seen for the first time: everything in it would count as new
    const oldTopics = new Set(flat(old.modules).flatMap((x) => x.m.topics.map((t) => t.id)))
    for (const x of flat(c.modules))
      for (const t of x.m.topics) if (!oldTopics.has(t.id)) out.push({ at, kind: 'file', courseId: c.id, course: name, text: `${t.title} (${x.m.title})`, topicId: t.id })
    const oldNews = new Set(old.news.map((n) => n.title))
    for (const n of c.news) if (!oldNews.has(n.title)) out.push({ at, kind: 'news', courseId: c.id, course: name, text: n.title })
    const oldGrades = new Map(old.grades.map((g) => [g.name, g.grade]))
    for (const g of c.grades) if (oldGrades.get(g.name) !== g.grade) out.push({ at, kind: 'grade', courseId: c.id, course: name, text: `${g.name}: ${g.grade}` })
    const oldA = new Set(old.assignments.map((a) => a.id))
    for (const a of c.assignments) if (!oldA.has(a.id)) out.push({ at, kind: 'assignment', courseId: c.id, course: name, text: a.name })
    const oldQ = new Set(old.quizzes.map((q) => q.id))
    for (const q of c.quizzes) if (!oldQ.has(q.id)) out.push({ at, kind: 'quiz', courseId: c.id, course: name, text: q.name })
  }
  return out
}

// ---------- Due items as Studyhall tasks ----------

type DueItem = {
  key: string
  kind: 'quiz' | 'assignment'
  courseId: number
  course: string
  courseName: string
  id: number
  name: string
  due: string
  done: boolean
  doneAt: string | null
  attempts: number | null
  allowed: number | null
}
export function dueItems(d: SchoolData | null = schoolData(), days = 7): DueItem[] {
  if (!d) return []
  const now = Date.now()
  const out: DueItem[] = []
  for (const c of d.courses) {
    for (const q of c.quizzes)
      if (q.due && Date.parse(q.due) > now - DAY && Date.parse(q.due) < now + days * DAY)
        out.push({
          key: `quiz:${c.id}:${q.id}`,
          kind: 'quiz',
          courseId: c.id,
          course: c.code || c.name,
          courseName: c.name,
          id: q.id,
          name: q.name,
          due: q.due,
          done: !!q.attempts,
          doneAt: null,
          attempts: q.attempts,
          allowed: q.allowed
        })
    for (const a of c.assignments)
      if (a.due && Date.parse(a.due) > now - DAY && Date.parse(a.due) < now + days * DAY)
        out.push({
          key: `assignment:${c.id}:${a.id}`,
          kind: 'assignment',
          courseId: c.id,
          course: c.code || c.name,
          courseName: c.name,
          id: a.id,
          name: a.name,
          due: a.due,
          done: !!a.submitted,
          doneAt: a.submitted,
          attempts: null,
          allowed: null
        })
  }
  return out.sort((x, y) => (x.kind === y.kind ? 0 : x.kind === 'quiz' ? -1 : 1) || Date.parse(x.due) - Date.parse(y.due))
}
/** Quizzes and assignments due in the next 30 days become Studyhall tasks (once each; ticked off when done). */
function syncTasks(d: SchoolData): void {
  if (getPrefs().politeTasks === false) return
  const keys = getSetting<Record<string, string>>('polite_tasks') ?? {}
  for (const it of dueItems(d, 30)) {
    const title = `${it.course}: ${it.name}${it.kind === 'quiz' ? ' (quiz)' : ''}`
    const id = keys[it.key]
    const row = id
      ? (getDb().prepare('SELECT id, title, due_at, status FROM tasks WHERE id = ? AND deleted_at IS NULL').get(id) as { id: string; title: string; due_at: string; status: string } | undefined)
      : undefined
    if (!row) {
      if (it.done) continue
      const t = create<{ id: string }>('tasks', {
        title,
        due_at: it.due,
        notes: 'From PoliteMall (Studyhall keeps it up to date).',
        labels: JSON.stringify(['PoliteMall']),
        status: 'todo',
        mode: 'study'
      })
      keys[it.key] = t.id
    } else {
      const patch: Record<string, unknown> = {}
      if (row.title !== title) patch.title = title
      if (row.due_at !== it.due) patch.due_at = it.due
      if (it.done && row.status !== 'done') patch.status = 'done'
      if (Object.keys(patch).length) update('tasks', row.id, patch)
    }
  }
  setSetting('polite_tasks', keys)
}

// After each read: what's new (kept two weeks, with a Windows notification), and the tasks.
politeHooks.synced = (before, after) => {
  if (before) {
    const fresh = whatChanged(before, after)
    if (fresh.length) {
      const keep = [...fresh, ...readNew()].filter((n) => Date.now() - Date.parse(n.at) < 14 * DAY).slice(0, 150)
      writeFileSync(newFile(), JSON.stringify(keep))
      if (getPrefs().politeNotify !== false && !OFFSCREEN && Notification.isSupported()) {
        const count = (k: PoliteNew['kind'], one: string, many: string): string | null => {
          const n = fresh.filter((x) => x.kind === k).length
          return n ? `${n} ${n === 1 ? one : many}` : null
        }
        const body = [
          count('news', 'new announcement', 'new announcements'),
          count('file', 'new file', 'new files'),
          count('grade', 'new grade', 'new grades'),
          count('quiz', 'new quiz', 'new quizzes'),
          count('assignment', 'new assignment', 'new assignments')
        ]
          .filter(Boolean)
          .join(', ')
        new Notification({ title: 'PoliteMall', body }).show()
      }
    }
  }
  syncTasks(after)
}

// ---------- How ready you are for a quiz (from your flashcards) ----------

/** The share of your flashcards for this course's module that you know right now (reviewed and not yet due again), or
 *  null when you have no flashcards for it. The module is matched by its code (or name) in the course's. */
function readiness(c: SchoolCourse): { pct: number; cards: number } | null {
  const mods = getDb().prepare('SELECT id, code, name FROM modules WHERE deleted_at IS NULL').all() as { id: string; code: string; name: string }[]
  const hay = `${c.code} ${c.name}`.toLowerCase()
  const m = mods.find((x) => x.code && hay.includes(x.code.toLowerCase())) ?? mods.find((x) => x.name.length > 3 && hay.includes(x.name.toLowerCase()))
  if (!m) return null
  const r = getDb()
    .prepare(
      `SELECT COUNT(*) AS n, SUM(CASE WHEN f.repetitions > 0 AND (f.due_at IS NULL OR f.due_at > ?) THEN 1 ELSE 0 END) AS known
       FROM flashcards f JOIN flashcard_decks d ON d.id = f.deck_id WHERE d.module_id = ? AND f.deleted_at IS NULL AND d.deleted_at IS NULL`
    )
    .get(new Date().toISOString(), m.id) as { n: number; known: number | null }
  return r.n ? { pct: Math.round(((r.known ?? 0) / r.n) * 100), cards: r.n } : null
}

// ---------- What the page shows ----------

export function politePageData(): unknown {
  const d = schoolData()
  return {
    status: schoolStatus(),
    due: dueItems(d, 7).map((it) => {
      const c = d?.courses.find((x) => x.id === it.courseId)
      return { ...it, ready: it.kind === 'quiz' && c ? readiness(c) : null }
    }),
    news: readNew(),
    courses: (d?.courses ?? []).map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      weeks: flat(c.modules).map((x) => ({
        id: x.m.id,
        title: x.path.join(' › '),
        topics: x.m.topics.map((t) => ({ id: t.id, title: t.title, kind: t.kind, ext: /\.(\w{2,5})(?:\?|$)/.exec(t.url ?? '')?.[1]?.toLowerCase() ?? null }))
      })),
      grades: c.grades,
      news: c.news.slice(0, 6)
    })),
    tasks: getPrefs().politeTasks !== false,
    notify: getPrefs().politeNotify !== false
  }
}

/** A button on the page. Teaching, summarising and flashcards hand the file to Nova; nothing is ever sent to PoliteMall. */
export async function politeAction(a: { kind: string; courseId: number; topicId?: number; id?: number; name?: string; due?: string; url?: string }): Promise<string> {
  const d = schoolData()
  const c = d?.courses.find((x) => x.id === Number(a.courseId))
  if (!c) return 'That course isn’t in what Studyhall read. Press Check now.'
  // A due quiz or assignment: its own page (the quiz's start page, the assignment's submission page).
  if (a.kind === 'quiz' && a.id) {
    politeGo(`${LMS}/d2l/lms/quizzing/user/quiz_summary.d2l?qi=${Number(a.id)}&ou=${c.id}`)
    return ''
  }
  if (a.kind === 'assignment' && a.id) {
    politeGo(`${LMS}/d2l/lms/dropbox/user/folder_submit_files.d2l?db=${Number(a.id)}&ou=${c.id}`)
    return ''
  }
  if (a.kind === 'course') {
    politeGo(`${LMS}/d2l/le/content/${c.id}/Home`)
    return ''
  }
  if (a.kind === 'study') {
    voiceAsk(
      `Help me study for "${a.name}" in ${c.code || c.name}${a.due ? `, due ${new Date(a.due).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}: use school to work out which weeks it covers, then give me a short practice quiz on them.`
    )
    return 'Nova is getting a practice quiz ready.'
  }
  const t = flat(c.modules)
    .flatMap((x) => x.m.topics)
    .find((x) => x.id === Number(a.topicId))
  if (!t) return 'That file isn’t in what Studyhall read. Press Check now.'
  if (a.kind === 'open') {
    politeGo(`${LMS}/d2l/le/content/${c.id}/viewContent/${t.id}/View`)
    return ''
  }
  if (OFFSCREEN) return `(Automated test: would ${a.kind} "${t.title}".)`
  const got = await downloadTopic(c, t)
  if ('error' in got) return got.error
  if (a.kind === 'save') {
    const saved = await importMaterials(null, [got.path])
    return saved.length ? `Saved “${t.title}” to Materials.` : 'Couldn’t save it to Materials.'
  }
  const readable = /^(pdf|pptx?|ppsx?)$/i.test(got.ext)
  const what = `"${t.title}" from ${c.code || c.name} on PoliteMall, saved at ${got.path}`
  if (a.kind === 'teach') voiceAsk(readable ? `Teach me ${what}: read_lesson it (source: that path) and teach it like a teacher, connecting the slides.` : `Teach me ${what}.`)
  else if (a.kind === 'summary') voiceAsk(readable ? `Summarise ${what}: read_lesson it (source: that path), then the big ideas on cards.` : `Summarise ${what}.`)
  else if (a.kind === 'flashcards') voiceAsk(readable ? `Make flashcards from ${what}: read_lesson it (source: that path), then save_flashcards with the key facts.` : `Make flashcards from ${what}.`)
  else return 'Unknown button.'
  return 'Handed to Nova.'
}
