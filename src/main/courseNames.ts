// What you call your PoliteMall courses. PoliteMall names them "26S2-1HBS12_013050" and "HUMAN BIOSCIENCES
// 1.2(1HBS12_013050)"; you call it Bio. Each course is keyed by the letters of its subject code (HBS, NSL, GCN), so
// last semester's HBS 1.1 and its eTest copy go by the same name. A course you haven't named gets a short name made
// from its full one ("NURSING SKILLS LABORATORY 1.2" → "Nursing Skills Lab"). Kept in userData/course-names.json.
import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type CourseName = { say: string; also: string[] }
type Named = { code: string; name: string }

const file = (): string => join(app.getPath('userData'), 'course-names.json')
let names: Record<string, CourseName> | null = null
function all(): Record<string, CourseName> {
  if (names) return names
  try {
    names = existsSync(file()) ? (JSON.parse(readFileSync(file(), 'utf8')) as Record<string, CourseName>) : {}
  } catch {
    names = {}
  }
  return names
}

/** The subject letters of a course code: "26S2-1HBS12_013050-ET" → "HBS", "26S2-VOICE_014404" → "VOICE". */
export function stemOf(c: Named): string {
  const code = c.code || /\(([^()]*_\d+)\)\s*$/.exec(c.name)?.[1] || ''
  const part = code
    .replace(/^\d+S\d-/i, '')
    .replace(/-ET$/i, '')
    .split('_')[0]
  return (/[A-Za-z]+/.exec(part)?.[0] ?? '').toUpperCase() || c.name.toUpperCase()
}

const SMALL = new Set(['and', 'of', 'to', 'the', 'in', 'for', 'on', 'a', 'an'])
/** A short name from the full one: no semester or archive marks, no code, no version, "Lab" for "Laboratory". */
export function autoName(c: Named): string {
  let n = c.name
    .replace(/^z_\[[^\]]*\]\s*/i, '')
    .replace(/\(e-?test\)\s*/i, '')
    .replace(/\s*\([^()]*\)\s*$/, '')
    .replace(/\s+\d+(\.\d+)*\s*$/, '')
    .replace(/&/g, ' and ')
    .replace(/\blaboratory\b/i, 'Lab')
  if (n.includes(':')) n = n.split(':').pop() ?? n
  n = n
    .replace(/^\s*introduction to\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  const words = n.split(' ').map((w, i) => (i && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
  return words.join(' ') || c.code || c.name
}

/** What Nova calls the course (yours if you named it). */
export function courseName(c: Named): string {
  return all()[stemOf(c)]?.say?.trim() || autoName(c)
}
/** Every name the course answers to: yours, the other names you gave, its subject letters, the short and full names. */
export function courseAliases(c: Named): string[] {
  const own = all()[stemOf(c)]
  return [...new Set([courseName(c), ...(own?.also ?? []), stemOf(c), autoName(c)].map((s) => s.trim()).filter(Boolean))]
}
/** Last semester's courses (PoliteMall marks them archived). */
export const isArchived = (c: Named): boolean => /^z_\[archived/i.test(c.name)

/** The names for the PoliteMall page's list: one row per subject (current courses first). */
export function nameList(courses: Named[]): { stem: string; say: string; also: string[]; auto: string; full: string; archived: boolean }[] {
  const out = new Map<string, { stem: string; say: string; also: string[]; auto: string; full: string; archived: boolean }>()
  for (const c of [...courses].sort((a, b) => Number(isArchived(a)) - Number(isArchived(b)) || Number(/\(e-?test\)/i.test(a.name)) - Number(/\(e-?test\)/i.test(b.name)))) {
    const stem = stemOf(c)
    if (out.has(stem)) continue
    const own = all()[stem]
    out.set(stem, { stem, say: own?.say ?? '', also: own?.also ?? [], auto: autoName(c), full: c.name.replace(/^z_\[[^\]]*\]\s*/i, ''), archived: isArchived(c) })
  }
  return [...out.values()]
}
export function setCourseName(stem: string, say: string, also: string[]): void {
  const m = all()
  const s = say.trim()
  const a = also.map((x) => x.trim()).filter(Boolean)
  if (!s && !a.length) delete m[stem]
  else m[stem] = { say: s, also: a }
  writeFileSync(file(), JSON.stringify(m, null, 1))
}

/** Text with PoliteMall's course codes and full names swapped for yours (calendar items from the PoliteMall feed). */
export function withCourseNames(text: string, courses: Named[]): string {
  if (!text) return text
  let out = text
  const pairs = courses.flatMap((c) => {
    const say = courseName(c)
    const bare = /\(([^()]*_\d+)\)\s*$/.exec(c.name)?.[1]
    return [c.name, c.code, bare ?? ''].filter((x) => x && x.length > 3).map((from) => [from, say] as const)
  })
  for (const [from, to] of pairs.sort((a, b) => b[0].length - a[0].length)) out = out.split(from).join(to)
  return out
}
