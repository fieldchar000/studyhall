// PoliteMall (Brightspace at nplms.polite.edu.sg), read-only.
// You sign in yourself, in a Studyhall window, with your school Microsoft account (Studyhall never sees or types your
// password). That window keeps its own signed-in session (partition persist:politemall). Studyhall then reads your
// courses, each course's content by week, announcements, assignments (and whether you've submitted), quizzes and
// grades through Brightspace's own data API, as you, from a hidden page on the same site. Nothing is ever posted,
// submitted or changed. What it read is kept in userData/politemall.json so Nova can answer offline.

import { BrowserWindow, app, session, type Session } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PoliteStatus } from '@shared/types'

export const LMS = 'https://nplms.polite.edu.sg'
const PART = 'persist:politemall'
const OFFSCREEN = process.env.STUDYHALL_OFFSCREEN === '1'
const HOUR = 3_600_000

export type SchoolTopic = {
  id: number
  title: string
  kind: string
  url: string | null
  due: string | null
}
export type SchoolModule = {
  id: number
  title: string
  start: string | null
  topics: SchoolTopic[]
  modules: SchoolModule[]
}
export type SchoolCourse = {
  id: number
  name: string
  code: string
  modules: SchoolModule[]
  news: { title: string; at: string | null; text: string }[]
  assignments: {
    id: number
    name: string
    due: string | null
    submitted: string | null
  }[]
  quizzes: {
    id: number
    name: string
    due: string | null
    attempts: number | null
    allowed: number | null
  }[]
  grades: { name: string; grade: string }[]
}
export type SchoolData = { at: string; courses: SchoolCourse[] }
export type SchoolStatus = PoliteStatus

export const politeHooks = { changed: (): void => {} }

const file = (): string => join(app.getPath('userData'), 'politemall.json')
let data: SchoolData | null = null
let status: SchoolStatus = { state: 'off', at: null, courses: 0, error: null }

export function schoolData(): SchoolData | null {
  if (data) return data
  try {
    if (existsSync(file())) data = JSON.parse(readFileSync(file(), 'utf8')) as SchoolData
  } catch {
    data = null
  }
  if (data && status.state === 'off')
    status = {
      state: 'signed-in',
      at: data.at,
      courses: data.courses.length,
      error: null
    }
  return data
}
export const schoolStatus = (): SchoolStatus => (schoolData(), status)
function setStatus(s: Partial<SchoolStatus>): void {
  status = { ...status, ...s }
  politeHooks.changed()
}

// ---------- The sign-in window (yours) ----------

/** Its windows browse the school's sites and Microsoft's sign-in freely (index.ts locks every other window to the
 *  app), but get no camera, microphone, location or notifications, and no webviews. */
export const isPoliteContents = (s: Session): boolean => s === session.fromPartition(PART)
let locked = false
function lockDown(): void {
  if (locked) return
  locked = true
  const s = session.fromPartition(PART)
  s.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'fullscreen' || permission === 'clipboard-sanitized-write'))
  s.setPermissionCheckHandler((_wc, permission) => permission === 'fullscreen' || permission === 'clipboard-sanitized-write')
  app.on('web-contents-created', (_e, c) => {
    if (c.session !== s) return
    c.on('will-attach-webview', (e) => e.preventDefault())
    c.on('will-navigate', (e, url) => {
      if (!url.toLowerCase().startsWith('https://')) e.preventDefault()
    })
  })
}

let signWin: BrowserWindow | null = null
/** Opens PoliteMall in a Studyhall window, signed in if you were before. Sign in there yourself; once you're in,
 *  Studyhall reads your courses. `at` opens a page on the site instead of the home page. */
export function openPoliteMall(at?: string): void {
  lockDown()
  const url = at && at.startsWith(LMS) ? at : `${LMS}/d2l/home`
  if (signWin && !signWin.isDestroyed()) {
    void signWin.loadURL(url)
    if (!OFFSCREEN) signWin.show()
    signWin.focus()
    return
  }
  const w = new BrowserWindow({
    width: 1200,
    height: 860,
    show: false,
    title: 'PoliteMall',
    autoHideMenuBar: true,
    ...(OFFSCREEN ? { x: -4000, y: -4000 } : {}),
    webPreferences: {
      partition: PART,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })
  signWin = w
  w.once('ready-to-show', () => (OFFSCREEN ? w.showInactive() : w.show()))
  // Links that open new windows (files, Teams, YouTube) go to your normal browser.
  w.webContents.setWindowOpenHandler(({ url: u }) => {
    if (u.startsWith(LMS))
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          webPreferences: { partition: PART }
        }
      }
    if (!OFFSCREEN && /^https?:/i.test(u)) void import('electron').then(({ shell }) => shell.openExternal(u))
    return { action: 'deny' }
  })
  // Back on Brightspace's home page after signing in: read everything (once per sign-in).
  // (Brightspace's home page also shows for a moment before it sends you to sign in, so wait until you stay there.)
  let read = false
  w.webContents.on('did-navigate', (_e, u) => {
    if (read || !u.startsWith(`${LMS}/d2l/home`)) return
    setTimeout(() => {
      if (read || w.isDestroyed() || !w.webContents.getURL().startsWith(`${LMS}/d2l/home`)) return
      read = true
      void syncSchool()
    }, 4000)
  })
  w.on('closed', () => {
    if (signWin === w) signWin = null
  })
  void w.loadURL(url)
}

/** Forgets the PoliteMall sign-in and everything read from it. */
export async function signOutSchool(): Promise<void> {
  signWin?.destroy()
  signWin = null
  reader?.destroy()
  reader = null
  await session.fromPartition(PART).clearStorageData()
  data = null
  try {
    writeFileSync(file(), '')
  } catch {
    /* fine */
  }
  setStatus({ state: 'off', at: null, courses: 0, error: null })
}

// ---------- Reading (a hidden page on the site, so its requests carry your session) ----------

let reader: BrowserWindow | null = null
async function readerWin(): Promise<BrowserWindow> {
  if (reader && !reader.isDestroyed()) return reader
  lockDown()
  const w = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: {
      partition: PART,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  w.webContents.setAudioMuted(true)
  // A small public page on the site (the API's version list): requests from it are same-site, with your cookies.
  await w.loadURL(`${LMS}/d2l/api/versions/`)
  reader = w
  return w
}

type Got = {
  ok: boolean
  status: number
  json?: unknown
  b64?: string
  type?: string
}
async function get(path: string, binary = false): Promise<Got> {
  const w = await readerWin()
  const js = `(async () => {
    const h = { Accept: ${binary ? "'*/*'" : "'application/json'"} }
    try { const t = localStorage.getItem('XSRF.Token'); if (t) h['X-Csrf-Token'] = t } catch {}
    const r = await fetch(${JSON.stringify(path)}, { credentials: 'include', headers: h })
    if (!r.ok) return { ok: false, status: r.status }
    if (!${binary}) return { ok: true, status: r.status, json: await r.json() }
    const b = new Uint8Array(await r.arrayBuffer())
    if (b.length > 80e6) return { ok: false, status: 413 }
    let s = ''
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000))
    return { ok: true, status: r.status, b64: btoa(s), type: r.headers.get('content-type') || '' }
  })()`
  return (await w.webContents.executeJavaScript(js, true)) as Got
}
/** Your session ran out: let the site sign you back in by itself (your Microsoft sign-in is remembered) without
 *  ever typing anything. True if it worked. */
async function resume(lp: string): Promise<boolean> {
  const w = await readerWin()
  await w.loadURL(`${LMS}/d2l/home`).catch(() => {})
  // Brightspace's home page loads first, then sends you on to Microsoft if you're signed out; Microsoft sends you back
  // by itself when it remembers you. Wait for the address to settle: back on Brightspace (then check), or stuck on
  // Microsoft's sign-in page (it wants you to sign in yourself).
  const until = Date.now() + 30_000
  let last = ''
  let since = Date.now()
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 1000))
    const u = w.webContents.getURL()
    if (u !== last) {
      last = u
      since = Date.now()
    }
    if (u.startsWith(LMS) ? Date.now() - since > 3000 : Date.now() - since > 8000) break
  }
  await w.loadURL(`${LMS}/d2l/api/versions/`).catch(() => {})
  return (await get(`/d2l/api/lp/${lp}/users/whoami`)).ok
}

let syncing: Promise<SchoolStatus> | null = null
/** Reads your courses and what's in them. Safe to call any time; it runs once at a time. */
export function syncSchool(): Promise<SchoolStatus> {
  syncing ??= doSync().finally(() => (syncing = null))
  return syncing
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const date = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
const plain = (html: string): string =>
  html
    .replace(/<(br|\/p|\/div|\/li)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&rsquo;/g, '’')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

async function doSync(): Promise<SchoolStatus> {
  setStatus({ state: 'checking', error: null })
  try {
    const vers = await get('/d2l/api/versions/')
    const list = (vers.ok ? (vers.json as { ProductCode: string; LatestVersion: string }[]) : []) ?? []
    const v = (p: string, d: string): string => list.find((x) => x.ProductCode === p)?.LatestVersion ?? d
    const lp = v('lp', '1.30')
    const le = v('le', '1.60')
    // Your courses (paged).
    let en = await get(`/d2l/api/lp/${lp}/enrollments/myenrollments/?orgUnitTypeId=3`)
    if (!en.ok && (en.status === 401 || en.status === 403)) {
      if (!(await resume(lp))) {
        setStatus({ state: 'signed-out', error: null })
        return status
      }
      en = await get(`/d2l/api/lp/${lp}/enrollments/myenrollments/?orgUnitTypeId=3`)
    }
    if (!en.ok) throw new Error(`Brightspace said ${en.status} for your course list`)
    type Enr = {
      OrgUnit: { Id: number; Name: string; Code: string | null }
      Access: {
        IsActive: boolean
        CanAccess: boolean
        EndDate: string | null
        LastAccessed: string | null
      }
      PinDate: string | null
    }
    const items: Enr[] = []
    let page = en.json as {
      Items: Enr[]
      PagingInfo?: { Bookmark: string; HasMoreItems: boolean }
    }
    for (let i = 0; i < 10; i++) {
      items.push(...(page.Items ?? []))
      if (!page.PagingInfo?.HasMoreItems) break
      const next = await get(`/d2l/api/lp/${lp}/enrollments/myenrollments/?orgUnitTypeId=3&bookmark=${encodeURIComponent(page.PagingInfo.Bookmark)}`)
      if (!next.ok) break
      page = next.json as typeof page
    }
    const now = Date.now()
    const active = items
      .filter((e) => e.Access?.CanAccess && e.Access?.IsActive && (!e.Access.EndDate || Date.parse(e.Access.EndDate) > now - 30 * 24 * HOUR))
      .sort((a, b) => Number(!!b.PinDate) - Number(!!a.PinDate) || Date.parse(b.Access.LastAccessed ?? '0') - Date.parse(a.Access.LastAccessed ?? '0'))
      .slice(0, 14)
    const courses: SchoolCourse[] = []
    for (const e of active) {
      const ou = e.OrgUnit.Id
      const c: SchoolCourse = {
        id: ou,
        name: e.OrgUnit.Name,
        code: e.OrgUnit.Code ?? '',
        modules: [],
        news: [],
        assignments: [],
        quizzes: [],
        grades: []
      }
      const toc = await get(`/d2l/api/le/${le}/${ou}/content/toc`)
      type M = {
        ModuleId: number
        Title: string
        StartDateTime?: string | null
        Modules?: M[]
        Topics?: {
          TopicId: number
          Title: string
          TypeIdentifier?: string
          Url?: string | null
          DueDateTime?: string | null
          IsHidden?: boolean
        }[]
        IsHidden?: boolean
      }
      const mod = (m: M): SchoolModule => ({
        id: m.ModuleId,
        title: str(m.Title),
        start: date(m.StartDateTime),
        topics: (m.Topics ?? [])
          .filter((t) => !t.IsHidden)
          .map((t) => ({
            id: t.TopicId,
            title: str(t.Title),
            kind: str(t.TypeIdentifier) || 'File',
            url: t.Url ?? null,
            due: date(t.DueDateTime)
          })),
        modules: (m.Modules ?? []).filter((x) => !x.IsHidden).map(mod)
      })
      if (toc.ok) c.modules = ((toc.json as { Modules?: M[] }).Modules ?? []).filter((m) => !m.IsHidden).map(mod)
      const news = await get(`/d2l/api/le/${le}/${ou}/news/`)
      if (news.ok)
        c.news = (
          (news.json as {
            Title: string
            StartDate?: string
            Body?: { Text?: string; Html?: string }
          }[]) ?? []
        )
          .map((n) => ({
            title: str(n.Title),
            at: date(n.StartDate),
            text: (str(n.Body?.Text) || plain(str(n.Body?.Html))).slice(0, 1200)
          }))
          .sort((a, b) => Date.parse(b.at ?? '0') - Date.parse(a.at ?? '0'))
          .slice(0, 12)
      const drop = await get(`/d2l/api/le/${le}/${ou}/dropbox/folders/`)
      if (drop.ok) {
        for (const f of (
          (drop.json as {
            Id: number
            Name: string
            DueDate?: string | null
            IsHidden?: boolean
          }[]) ?? []
        )
          .filter((f) => !f.IsHidden)
          .slice(0, 30)) {
          const mine = await get(`/d2l/api/le/${le}/${ou}/dropbox/folders/${f.Id}/submissions/mysubmissions/`)
          const subs = mine.ok
            ? (
                (mine.json as {
                  Submissions?: { SubmissionDate?: string }[]
                }[]) ?? []
              ).flatMap((x) => x.Submissions ?? [])
            : []
          const last =
            subs
              .map((s) => s.SubmissionDate ?? '')
              .sort()
              .pop() || null
          c.assignments.push({
            id: f.Id,
            name: str(f.Name),
            due: date(f.DueDate),
            submitted: last
          })
        }
      }
      const qz = await get(`/d2l/api/le/${le}/${ou}/quizzes/`)
      if (qz.ok) {
        type Q = {
          QuizId: number
          Name: string
          DueDate?: string | null
          EndDate?: string | null
          IsActive?: boolean
          AttemptsAllowed?: {
            IsUnlimited?: boolean
            NumberOfAttemptsAllowed?: number | null
          }
        }
        for (const q of (((qz.json as { Objects?: Q[] }).Objects ?? []) as Q[]).filter((q) => q.IsActive !== false).slice(0, 30)) {
          // Your attempts (some schools only let staff see this; then it's left unknown).
          const at = await get(`/d2l/api/le/${le}/${ou}/quizzes/${q.QuizId}/attempts/`)
          const n = at.ok ? (((at.json as { Objects?: unknown[] }).Objects ?? (Array.isArray(at.json) ? (at.json as unknown[]) : [])) as unknown[]).length : null
          c.quizzes.push({
            id: q.QuizId,
            name: str(q.Name),
            due: date(q.DueDate ?? q.EndDate),
            attempts: n,
            allowed: q.AttemptsAllowed?.IsUnlimited ? null : (q.AttemptsAllowed?.NumberOfAttemptsAllowed ?? null)
          })
        }
      }
      const gr = await get(`/d2l/api/le/${le}/${ou}/grades/values/myGradeValues/`)
      if (gr.ok)
        c.grades = (
          (gr.json as {
            GradeObjectName?: string
            DisplayedGrade?: string
          }[]) ?? []
        )
          .filter((g) => g.DisplayedGrade)
          .map((g) => ({
            name: str(g.GradeObjectName),
            grade: str(g.DisplayedGrade)
          }))
          .slice(0, 30)
      courses.push(c)
    }
    data = { at: new Date().toISOString(), courses }
    writeFileSync(file(), JSON.stringify(data))
    setStatus({
      state: 'signed-in',
      at: data.at,
      courses: courses.length,
      error: null
    })
  } catch (e) {
    setStatus({
      state: 'error',
      error: e instanceof Error ? e.message : String(e)
    })
  }
  return status
}

/** Checks PoliteMall every few hours while Studyhall is open (only once you've signed in). */
export function startSchool(): void {
  if (OFFSCREEN) return
  const tick = (): void => {
    const d = schoolData()
    if (d && Date.now() - Date.parse(d.at) > 3 * HOUR) void syncSchool()
  }
  setTimeout(tick, 60_000)
  setInterval(tick, 30 * 60_000)
}

// ---------- For Nova ----------

const when = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })
    : 'no date'
const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
export function findCourse(q: string): SchoolCourse | null {
  const cs = schoolData()?.courses ?? []
  const n = norm(q)
  if (!n) return null
  return (
    cs.find((c) => norm(c.code) === n || norm(c.name) === n) ??
    cs.find((c) => norm(`${c.code} ${c.name}`).includes(n)) ??
    cs.find((c) => n.split(' ').every((w) => norm(`${c.code} ${c.name}`).includes(w))) ??
    null
  )
}
function flat(ms: SchoolModule[], path: string[] = []): { m: SchoolModule; path: string[] }[] {
  return ms.flatMap((m) => [{ m, path: [...path, m.title] }, ...flat(m.modules, [...path, m.title])])
}
/** Modules matching "week 5", "5", "W5", or words of a title. */
export function findModules(c: SchoolCourse, q: string): { m: SchoolModule; path: string[] }[] {
  const all = flat(c.modules)
  const num = /^\s*(?:w(?:ee)?k?\s*)?(\d{1,2})\s*$/i.exec(q)?.[1]
  if (num) {
    const re = new RegExp(`\\b(?:week|wk|w)\\s*0?${num}\\b`, 'i')
    const hit = all.filter((x) => re.test(x.m.title))
    if (hit.length) return hit
  }
  const n = norm(q)
  return all.filter((x) => norm(x.m.title).includes(n) || n.split(' ').every((w) => norm(x.path.join(' ')).includes(w)))
}
const dueSoon = (c: SchoolCourse, days: number): { what: string; due: string; done: boolean }[] => {
  const now = Date.now()
  const end = now + days * 24 * HOUR
  return [
    ...c.assignments
      .filter((a) => a.due && Date.parse(a.due) > now - 24 * HOUR && Date.parse(a.due) < end)
      .map((a) => ({
        what: `${c.code || c.name}: ${a.name}`,
        due: a.due!,
        done: !!a.submitted
      })),
    ...c.quizzes
      .filter((q) => q.due && Date.parse(q.due) > now - 24 * HOUR && Date.parse(q.due) < end)
      .map((q) => ({
        what: `${c.code || c.name}: ${q.name} (quiz)`,
        due: q.due!,
        done: !!q.attempts
      }))
  ]
}

/** What Nova's school tool answers: everything (no course), one course, or the modules matching `find`. */
export function schoolText(course?: string, find?: string): string {
  const d = schoolData()
  if (!d) return 'PoliteMall isn’t connected yet. They can sign in from Studyhall’s Settings → PoliteMall (their school Microsoft account; they sign in themselves).'
  const age = Math.round((Date.now() - Date.parse(d.at)) / 60_000)
  const fresh = `(Read from PoliteMall ${age < 90 ? `${age} min` : `${Math.round(age / 60)} h`} ago.${status.state === 'signed-out' ? ' Their sign-in has run out: they can sign in again in Settings → PoliteMall.' : ''})`
  if (!course) {
    const due = d.courses.flatMap((c) => dueSoon(c, 14)).sort((a, b) => Date.parse(a.due) - Date.parse(b.due))
    const news = d.courses
      .flatMap((c) => c.news.slice(0, 2).map((n) => ({ ...n, c })))
      .sort((a, b) => Date.parse(b.at ?? '0') - Date.parse(a.at ?? '0'))
      .slice(0, 6)
    return [
      `Their PoliteMall courses ${fresh}:`,
      ...d.courses.map((c) => `• ${c.code ? `${c.code} ` : ''}${c.name} (${flat(c.modules).length} modules)`),
      due.length ? `\nDue in the next 2 weeks:\n${due.map((x) => `• ${x.what}: ${when(x.due)}${x.done ? ' (submitted/attempted)' : ''}`).join('\n')}` : '\nNothing due in the next 2 weeks.',
      news.length ? `\nLatest announcements:\n${news.map((n) => `• ${n.c.code || n.c.name}: ${n.title} (${when(n.at)})`).join('\n')}` : ''
    ].join('\n')
  }
  const c = findCourse(course)
  if (!c) return `No course matching "${course}". Their courses: ${d.courses.map((x) => `${x.code} ${x.name}`.trim()).join('; ')}.`
  const head = `${c.code ? `${c.code} ` : ''}${c.name} ${fresh}`
  const topicLine = (t: SchoolTopic): string =>
    `    - ${t.title} [${t.kind === 'Link' ? 'link' : (/\.(\w{2,5})(?:\?|$)/.exec(t.url ?? '')?.[1] ?? t.kind).toLowerCase()}, topic ${t.id}]${t.due ? ` due ${when(t.due)}` : ''}`
  if (find) {
    const ms = findModules(c, find)
    if (!ms.length)
      return `${head}\nNo module matching "${find}". Modules: ${flat(c.modules)
        .map((x) => x.m.title)
        .join('; ')}.`
    return (
      [head, ...ms.slice(0, 4).map((x) => `• ${x.path.join(' › ')}${x.m.start ? ` (opens ${when(x.m.start)})` : ''}\n${x.m.topics.map(topicLine).join('\n') || '    (no files directly in it)'}`)].join(
        '\n'
      ) + '\n(school_file with the course and topic number downloads a file to teach from: read_lesson it.)'
    )
  }
  const tree = flat(c.modules)
    .slice(0, 60)
    .map((x) => `${'  '.repeat(x.path.length - 1)}• ${x.m.title} (${x.m.topics.length} items)`)
    .join('\n')
  return [
    head,
    `Content:\n${tree || '(none)'}`,
    c.assignments.length ? `Assignments:\n${c.assignments.map((a) => `• ${a.name}: due ${when(a.due)}${a.submitted ? `, submitted ${when(a.submitted)}` : ', not submitted'}`).join('\n')}` : '',
    c.quizzes.length
      ? `Quizzes:\n${c.quizzes.map((q) => `• ${q.name}: due ${when(q.due)}${q.attempts == null ? '' : `, ${q.attempts} attempt${q.attempts === 1 ? '' : 's'}${q.allowed ? ` of ${q.allowed}` : ''}`}`).join('\n')}`
      : '',
    c.grades.length ? `Grades so far:\n${c.grades.map((g) => `• ${g.name}: ${g.grade}`).join('\n')}` : '',
    c.news.length
      ? `Announcements:\n${c.news
          .slice(0, 5)
          .map((n) => `• ${n.title} (${when(n.at)}): ${n.text.slice(0, 300)}`)
          .join('\n')}`
      : ''
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** Downloads a topic's file (a week's slides, a PDF) to a temp folder and returns where it is, or opens the topic
 *  in the PoliteMall window (`open`). */
export async function schoolFile(course: string, topic: number, open = false): Promise<string> {
  const c = findCourse(course)
  if (!c) return `No course matching "${course}".`
  const t = flat(c.modules)
    .flatMap((x) => x.m.topics)
    .find((x) => x.id === topic)
  if (!t) return `No topic ${topic} in ${c.name}: look it up with school first.`
  const page = `${LMS}/d2l/le/content/${c.id}/viewContent/${t.id}/View`
  if (open || t.kind === 'Link') {
    if (OFFSCREEN) return `(Automated test: would open ${page}.)`
    openPoliteMall(page)
    return `Opened "${t.title}" in the PoliteMall window.`
  }
  const vers = await get('/d2l/api/versions/')
  const vl = (vers.ok ? (vers.json as { ProductCode: string; LatestVersion: string }[]) : []) ?? []
  const le = vl.find((x) => x.ProductCode === 'le')?.LatestVersion ?? '1.60'
  const lpOf = (_v: unknown): string => vl.find((x) => x.ProductCode === 'lp')?.LatestVersion ?? '1.30'
  let r = await get(`/d2l/api/le/${le}/${c.id}/content/topics/${t.id}/file`, true)
  if (!r.ok && (r.status === 401 || r.status === 403) && (await resume(lpOf(vers)))) r = await get(`/d2l/api/le/${le}/${c.id}/content/topics/${t.id}/file`, true)
  if (!r.ok || !r.b64)
    return r.status === 401 || r.status === 403 ? 'Their PoliteMall sign-in has run out: they can sign in again in Settings → PoliteMall.' : `Couldn't download it (Brightspace said ${r.status}).`
  const ext = /\.(\w{2,5})(?:\?|$)/.exec(t.url ?? '')?.[1] ?? (/pdf/i.test(r.type ?? '') ? 'pdf' : /presentation/i.test(r.type ?? '') ? 'pptx' : 'bin')
  const dir = join(tmpdir(), 'Studyhall PoliteMall', (c.code || String(c.id)).replace(/[\\/:*?"<>|]+/g, ' ').trim())
  mkdirSync(dir, { recursive: true })
  const name = `${
    t.title
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .trim()
      .slice(0, 80) || `topic ${t.id}`
  }${new RegExp(`\\.${ext}$`, 'i').test(t.title) ? '' : `.${ext}`}`
  const path = join(dir, name)
  writeFileSync(path, Buffer.from(r.b64, 'base64'))
  return /^(pdf|pptx?|ppsx?)$/i.test(ext)
    ? `Downloaded "${t.title}" to ${path}. Teach from it with read_lesson (source: that path).`
    : `Downloaded "${t.title}" (${ext}) to ${path}; it isn't a deck or PDF, so read_lesson can't read it. Offer to open it in PoliteMall instead.`
}

/** For the morning brief: what's due soon from PoliteMall, and announcements from the last day. */
export function schoolBrief(): {
  due: { what: string; due: string }[]
  news: { what: string; at: string }[]
} {
  const d = schoolData()
  if (!d) return { due: [], news: [] }
  const since = Date.now() - 26 * HOUR
  return {
    due: d.courses
      .flatMap((c) => dueSoon(c, 3))
      .filter((x) => !x.done)
      .sort((a, b) => Date.parse(a.due) - Date.parse(b.due)),
    news: d.courses.flatMap((c) => c.news.filter((n) => n.at && Date.parse(n.at) > since).map((n) => ({ what: `${c.code || c.name}: ${n.title}`, at: n.at! })))
  }
}

if (OFFSCREEN)
  (globalThis as unknown as { __politeTest: unknown }).__politeTest = {
    load: (d: SchoolData) => {
      data = d
      status = {
        state: 'signed-in',
        at: d.at,
        courses: d.courses.length,
        error: null
      }
    },
    text: schoolText,
    brief: schoolBrief
  }
