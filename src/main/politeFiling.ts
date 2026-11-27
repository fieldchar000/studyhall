// PoliteMall into your modules, by itself: each course you study (recall-courses.json; all but Health and Wellness
// to start) gets a Studyhall module, its weeks ("WEEK 4", "Week 2: Wound Care", "Lesson 3") become the module's
// weeks, and each week's slides, PDFs and worksheets are downloaded into it (an answer sheet is kept as a worksheet
// too, and goes with its worksheet when questions are made). Once each: a file already filed isn't fetched again.
// Runs after each PoliteMall check, on the PC. Nothing on PoliteMall is changed.
import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { courseName, isArchived, stemOf } from './courseNames'
import { create, getSetting, list, setSetting } from './db'
import { importMaterials } from './files'
import { downloadTopic, flat, schoolData, type SchoolCourse, type SchoolModule, type SchoolTopic } from './politemall'

/** Which courses are filed, and which get Nova's after-class offer (by their subject letters). */
export type RecallCourses = { file: string[]; afterClass: string[] }
const coursesFile = (): string => join(app.getPath('userData'), 'recall-courses.json')
export function recallCourses(): RecallCourses {
  try {
    if (existsSync(coursesFile())) return { file: [], afterClass: [], ...(JSON.parse(readFileSync(coursesFile(), 'utf8')) as Partial<RecallCourses>) }
  } catch {
    /* the defaults */
  }
  // (none chosen yet: this semester's courses that have weeks)
  const now = (schoolData()?.courses ?? []).filter((c) => !isArchived(c) && !/\(e-?test\)/i.test(c.name) && flat(c.modules).some((x) => weekOf(x.path) != null))
  const stems = [...new Set(now.map(stemOf))]
  return { file: stems, afterClass: stems }
}
export function setRecallCourses(patch: Partial<RecallCourses>): RecallCourses {
  const next = { ...recallCourses(), ...patch }
  writeFileSync(coursesFile(), JSON.stringify(next, null, 1))
  return next
}

/** The week a part of a course is in, from its titles (the nearest "Week n" up the path, else "Lesson n"), or null. */
export function weekOf(path: string[]): number | null {
  for (const re of [/\b(?:week|wk)\s*0?(\d{1,2})\b/i, /\blesson[s]?\s*0?(\d{1,2})\b/i]) {
    for (let i = path.length - 1; i >= 0; i--) {
      const m = re.exec(path[i])
      if (m) return Number(m[1])
    }
  }
  return null
}
const extOf = (t: SchoolTopic): string => (/\.(\w{2,5})(?:\?|$)/.exec(t.url ?? '')?.[1] ?? '').toLowerCase()
const READABLE = new Set(['pdf', 'pptx', 'docx'])
// (not study material: forms, charts, sample paperwork, rubrics, templates, schedules, briefings)
const NOT_STUDY =
  /\b(templates?|rubrics?|attendance|declaration|qr code|briefing|teaching and assessment|t&a plan|instructions? to|reflection worksheet|sample lab form|forms?|charts?|checklist|schedules?|observation|record)\b|\[(documentation|sample documentation|blank copy|case notes|operation notes)\]/i
export const isWorksheet = (title: string): boolean =>
  /\b(ws|worksheets?|kahoot|quiz|practice|exercises?|tutorials?|activity|questions?|case stud(y|ies)|scenario|revision)\b/i.test(title.replace(/[_-]/g, ' '))
export const isAnswers = (title: string): boolean => /\b(ans|an+s+w+e*r+s?|answer key|solutions?|suggested answers?|marking scheme)\b/i.test(title.replace(/[_-]/g, ' '))

type Filed = Record<string, string> // PoliteMall topic id → material id
const filed = (): Filed => getSetting<Filed>('polite_filed') ?? {}

/** The Studyhall module for a course (made if there isn't one), matched by its code or its name. */
function moduleFor(c: SchoolCourse): string {
  const mods = list<{ id: string; code: string; name: string }>('modules', { archived: 0 })
  const stem = stemOf(c).toLowerCase()
  const bare = (
    c.code
      .replace(/^\d+S\d-/i, '')
      .replace(/-ET$/i, '')
      .split('_')[0] || stem
  ).toLowerCase()
  const name = courseName(c).toLowerCase()
  const hit =
    mods.find((m) => m.code && (m.code.toLowerCase() === bare || m.code.toLowerCase().includes(stem))) ??
    mods.find((m) => m.name.toLowerCase() === name || m.name.toLowerCase().includes(stem) || name.includes(m.name.toLowerCase()))
  if (hit) return hit.id
  return create<{ id: string }>('modules', { code: bare.toUpperCase(), name: courseName(c), term: c.code.match(/^\d+S\d/)?.[0] ?? '' }).id
}
/** The module's week n (made if missing, titled from PoliteMall). */
function weekFor(moduleId: string, n: number, title: string): string {
  const w = list<{ id: string; number: number }>('weeks', { module_id: moduleId }).find((x) => x.number === n)
  if (w) return w.id
  const t = title.replace(/^\s*(?:week|wk|lessons?)\s*\d+\s*[:.\-–]?\s*/i, '').trim()
  return create<{ id: string }>('weeks', { module_id: moduleId, number: n, title: t.slice(0, 80) }).id
}

let running = false
export const fileHooks = {
  /** New materials were filed (recallMake.ts makes their questions). */
  filed: (_ids: string[]): void => {}
}
/** Files what's new on PoliteMall into the modules (one file at a time). Returns how many were filed. */
export async function fileFromPoliteMall(): Promise<number> {
  if (running) return 0
  const d = schoolData()
  if (!d) return 0
  running = true
  let n = 0
  try {
    const want = new Set(recallCourses().file)
    const done = filed()
    const fresh: string[] = []
    for (const c of d.courses) {
      if (isArchived(c) || /\(e-?test\)/i.test(c.name) || !want.has(stemOf(c))) continue
      // Each week's files, newest week first (so this week's are ready soonest).
      const items: { m: SchoolModule; path: string[]; t: SchoolTopic; week: number }[] = []
      for (const x of flat(c.modules)) {
        const week = weekOf(x.path)
        if (week == null) continue
        for (const t of x.m.topics) if (READABLE.has(extOf(t)) && !NOT_STUDY.test(t.title) && !done[String(t.id)]) items.push({ ...x, t, week })
      }
      items.sort((a, b) => b.week - a.week)
      if (!items.length) continue
      const moduleId = moduleFor(c)
      for (const it of items) {
        const weekTitle = it.path.find((p) => weekOf([p]) === it.week) ?? `Week ${it.week}`
        const weekId = weekFor(moduleId, it.week, weekTitle)
        const got = await downloadTopic(c, it.t).catch(() => ({ error: 'failed' }))
        if ('error' in got) continue
        const [m] = await importMaterials({ moduleId, weekId, category: isWorksheet(it.t.title) || isAnswers(it.t.title) ? 'worksheet' : 'notes' }, [got.path])
        if (!m) continue
        done[String(it.t.id)] = m.id
        setSetting('polite_filed', done)
        fresh.push(m.id)
        n++
      }
    }
    if (fresh.length) fileHooks.filed(fresh)
  } finally {
    running = false
  }
  if (n) console.info(`PoliteMall: filed ${n} files into your modules`)
  return n
}
