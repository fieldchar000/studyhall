// Your test marks, told to Nova ("I got 18 out of 25 for the pharm test"): put on the test in your module's
// assessments, so the Grades page updates. A test that isn't there yet is added (as a quiz, today).
import { create, list, update } from './db'

type A = { id: string; module_id: string; title: string; kind: string; due_at: string | null; score_pct: number | null }
const words = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1)

/** Records a mark; what was done, in a line for Nova to say. */
export function recordMark(o: { assessment: string; score: number; outOf?: number | null; module?: string | null }): string {
  const pct = o.outOf ? (o.score / o.outOf) * 100 : o.score
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return 'That mark doesn’t look right: ask them again (the score, and out of how much).'
  const mods = list<{ id: string; code: string; name: string }>('modules', { archived: 0 })
  const mw = words(o.module ?? '')
  // The module: the one they named; else the one whose files' names share words with the test ("pharmacokinetics"
  // test → the Pharmacology week with the Pharmacokinetics slides).
  const named = mw.length ? mods.find((m) => mw.some((w) => m.name.toLowerCase().includes(w) || m.code.toLowerCase().includes(w))) : undefined
  const tw = words(o.assessment).filter((w) => w.length > 3 && !['test', 'quiz', 'exam', 'midterm', 'final', 'practical'].includes(w))
  const byFiles = (): (typeof mods)[number] | undefined => {
    if (!tw.length) return undefined
    const counts = new Map<string, number>()
    for (const m of list<{ module_id: string; title: string }>('materials')) {
      const hits = words(m.title).filter((w) => tw.includes(w)).length
      if (hits) counts.set(m.module_id, (counts.get(m.module_id) ?? 0) + hits)
    }
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
    return best ? mods.find((m) => m.id === best[0]) : undefined
  }
  const mod = named ?? byFiles()
  // The test it's for: the one whose name shares the most words with what they said (in that module if named),
  // still without a mark first, the nearest date first.
  const want = words(o.assessment)
  const scored = list<A>('assessments')
    .filter((a) => !mod || a.module_id === mod.id)
    .map((a) => ({ a, hits: words(a.title).filter((w) => want.includes(w)).length }))
    .filter((x) => x.hits > 0)
    .sort(
      (x, y) =>
        y.hits - x.hits || Number(x.a.score_pct != null) - Number(y.a.score_pct != null) || Math.abs(Date.parse(x.a.due_at ?? '') - Date.now()) - Math.abs(Date.parse(y.a.due_at ?? '') - Date.now())
    )
  const hit = scored[0]?.a
  const shown = `${Math.round(pct * 10) / 10}%${o.outOf ? ` (${o.score}/${o.outOf})` : ''}`
  if (hit) {
    update('assessments', hit.id, { score_pct: Math.round(pct * 100) / 100 })
    return `Recorded ${shown} for "${hit.title}"${mod ? ` in ${mod.name}` : ''}: it's on their Grades page now.`
  }
  if (!mod) return `There's no test called "${o.assessment}" yet: ask which module it was for, then record it again with the module.`
  create('assessments', { module_id: mod.id, title: o.assessment.slice(0, 80), kind: 'quiz', due_at: new Date().toISOString(), score_pct: Math.round(pct * 100) / 100 })
  return `Added "${o.assessment}" to ${mod.name} with ${shown}: it's on their Grades page now.`
}
