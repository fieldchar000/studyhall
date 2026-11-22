// Nova's page, Lessons and Map tabs: the lessons taken (from lessonRecord), their packs (lessonPack), the test, Replay,
// carrying a lesson on, and the map of what's been learned (solid, shaky, taught, not yet) by module and topic.
import { app, ipcMain } from 'electron'
import { existsSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { deleteRun, getRun, listRuns, type LessonRun } from './lessonRecord'
import { makePack, markSaq, saveTest, type LessonPack } from './lessonPack'
import { startReplay } from './lessonReplay'
import { dueChecks, examSet, examsSoon, makePractice, markPractice, practiceHistory, savePractice, startPracticeNudges, type PracticeQ } from './lessonPractice'
import { setTutor, tutorOn, tutorHooks } from './tutor'
import { clearClaudeActivity } from './claude'
import {
  createManualQuiz,
  deleteSavedQuiz,
  getSavedQuiz,
  listSavedQuizzes,
  reviewQuizQuestion,
  updateQuizQuestionNote
} from './politeQuizStore'

export type LessonSummary = {
  id: string
  title: string
  module: string | null
  started: number
  ended: number | null
  kind: 'slides' | 'pdf'
  source: string
  stops: number
  taught: number
  checks: { right: number; total: number }
  shaky: number
  pack: { made: boolean; noteId?: string; mindmapId?: string; deck?: string; score?: number; outOf?: number; testAt?: number } | null
  replay: boolean
}
export type MapTopic = { topic: string; status: 'solid' | 'shaky' | 'taught' | 'new'; lessons: { id: string; title: string }[]; noteId?: string; mindmapId?: string; deck?: string }
export type LessonMap = {
  modules: { name: string; topics: MapTopic[]; examIn?: number }[]
  due: { tests: { id: string; title: string }[]; shaky: { id: string; title: string; topic: string; idea: string }[]; later: number }
}

const packOf = (r: LessonRun): LessonPack | null => (r.pack?.made ? (r.pack as unknown as LessonPack) : null)

function summary(r: LessonRun): LessonSummary {
  const p = packOf(r)
  const answered = r.checks.filter((c) => c.correct != null)
  return {
    id: r.id,
    title: r.title,
    module: p?.module?.name ?? r.module ?? null,
    started: r.started,
    ended: r.ended ?? null,
    kind: r.kind,
    source: r.source,
    stops: r.stops.length,
    taught: r.taught.length,
    checks: { right: answered.filter((c) => c.correct).length, total: answered.length },
    shaky: r.shaky.filter((s) => !s.fixed).length,
    pack: p ? { made: true, noteId: p.noteId, mindmapId: p.mindmapId, deck: p.deck, score: p.taken?.score, outOf: p.taken?.outOf, testAt: p.taken?.at } : null,
    replay: r.events.some((e) => e.type === 'slide')
  }
}

const same = (a: string, b: string): boolean => {
  const x = a.toLowerCase().trim()
  const y = b.toLowerCase().trim()
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x))
}

/** What's been learned, by module and topic: solid (right in the lesson and the test), shaky (missed, not put right),
 *  taught (no test taken yet), or not yet taught (a stop of the plan not reached). */
async function lessonMap(): Promise<LessonMap> {
  const runs = await listRuns()
  const mods = new Map<string, Map<string, MapTopic>>()
  const rank = { new: 0, taught: 1, solid: 2, shaky: 3 }
  const tests: LessonMap['due']['tests'] = []
  // Oldest first, so a later lesson's result on a topic wins (except shaky, which stays until it's put right).
  for (const r of [...runs].reverse()) {
    const p = packOf(r)
    const mod = p?.module?.name ?? r.module ?? 'Other'
    if (!mods.has(mod)) mods.set(mod, new Map())
    const topics = mods.get(mod)!
    for (const s of r.stops) {
      const name = s.topic || s.idea.slice(0, 60)
      if (!name) continue
      const key = name.toLowerCase()
      const taught = r.taught.includes(s.n)
      const missed =
        r.shaky.some((x) => !x.fixed && same(x.topic, name)) ||
        r.checks.some((c) => c.correct === false && same(c.topic, name) && !r.checks.some((d) => d.at > c.at && d.correct && same(d.topic, name)))
      let status: MapTopic['status'] = !taught ? 'new' : missed ? 'shaky' : 'taught'
      if (taught && !missed && p?.taken) {
        const wrong = p.test.mcq.some((q, k) => same(q.topic, name) && p.taken!.mcq[k] !== q.answer) || p.test.saq.some((q, k) => same(q.topic, name) && (p.taken!.saq[k]?.hit ?? []).some((h) => !h))
        status = wrong ? 'shaky' : 'solid'
      }
      const was = topics.get(key)
      const lessons = [...(was?.lessons ?? []).filter((x) => x.id !== r.id), { id: r.id, title: r.title }]
      // (a topic already taught keeps that over "not yet" from another deck; shaky stays until a later lesson's solid)
      const next = !was ? status : status === 'new' ? was.status : was.status === 'shaky' && status !== 'solid' ? 'shaky' : rank[status] >= rank[was.status] || status === 'solid' ? status : was.status
      topics.set(key, { topic: was?.topic ?? name, status: next, lessons, noteId: p?.noteId ?? was?.noteId, mindmapId: p?.mindmapId ?? was?.mindmapId, deck: p?.deck ?? was?.deck })
    }
    if (p && !p.taken && p.test.mcq.length) tests.push({ id: r.id, title: r.title })
  }
  // Practice: the latest result on a topic decides it (right: solid, unless a shaky idea on it is still open; wrong: shaky).
  for (const p of await practiceHistory()) {
    const t = mods.get(p.module)?.get(p.topic.toLowerCase()) ?? [...(mods.get(p.module)?.values() ?? [])].find((x) => same(x.topic, p.topic))
    if (!t) continue
    const open = runs.some((r) => r.shaky.some((x) => !x.fixed && same(x.topic, t.topic)))
    t.status = p.correct ? (open ? 'shaky' : 'solid') : 'shaky'
  }
  const soon = examsSoon()
  const dueNow = await dueChecks().catch(() => [])
  const open = runs.flatMap((r) => r.shaky.filter((x) => !x.fixed)).length
  return {
    modules: [...mods.entries()]
      .map(([name, t]) => ({ name, topics: [...t.values()], ...(soon[name] != null ? { examIn: soon[name] } : {}) }))
      .filter((m) => m.topics.length)
      .sort((a, b) => (a.name === 'Other' ? 1 : b.name === 'Other' ? -1 : a.name.localeCompare(b.name))),
    due: { tests: tests.reverse().slice(0, 6), shaky: dueNow.map((d) => ({ id: d.lessonId, title: d.title, topic: d.topic, idea: d.fix })), later: Math.max(0, open - dueNow.length) }
  }
}

/** Decks to start a lesson on: the ones taught before, and the newest slides and PDFs in Downloads. */
async function suggestions(): Promise<{ path: string; name: string; at: number; taught: boolean }[]> {
  const out = new Map<string, { path: string; name: string; at: number; taught: boolean }>()
  // (the same file can be written with / or \ in its path: one entry each)
  const key = (p: string): string => p.replace(/\//g, '\\').toLowerCase()
  for (const r of (await listRuns()).slice(0, 12))
    if (r.source && existsSync(r.source) && !out.has(key(r.source))) out.set(key(r.source), { path: r.source, name: r.title, at: r.started, taught: true })
  const dl = app.getPath('downloads')
  for (const f of await readdir(dl).catch(() => [] as string[])) {
    if (!/\.(pdf|pptx?)$/i.test(f)) continue
    const p = join(dl, f)
    if (out.has(key(p))) continue
    const st = await stat(p).catch(() => null)
    if (st) out.set(key(p), { path: p, name: f.replace(/\.(pdf|pptx?)$/i, ''), at: st.mtimeMs, taught: false })
  }
  return [...out.values()].sort((a, b) => Number(b.taught) - Number(a.taught) || b.at - a.at).slice(0, 10)
}

export function registerLessonsIpc(notify: (title: string, body: string) => void): void {
  startPracticeNudges(notify)
  ipcMain.handle('claude:clearActivity', () => clearClaudeActivity())
  ipcMain.handle('quizzes:list', () => listSavedQuizzes())
  ipcMain.handle('quizzes:get', (_e, id: string) => getSavedQuiz(String(id ?? '')))
  ipcMain.handle('quizzes:review', (_e, qz: string, q: string, g: 1 | 3 | 4 | 5) =>
    reviewQuizQuestion(String(qz ?? ''), String(q ?? ''), g)
  )
  ipcMain.handle('quizzes:updateNote', (_e, qz: string, q: string, n: string) =>
    updateQuizQuestionNote(String(qz ?? ''), String(q ?? ''), String(n ?? ''))
  )
  ipcMain.handle('quizzes:remove', (_e, id: string) => deleteSavedQuiz(String(id ?? '')))
  ipcMain.handle('quizzes:addManual', (_e, input) => createManualQuiz(input))
  ipcMain.handle('lessons:list', async () => (await listRuns()).map(summary))
  ipcMain.handle('lessons:get', async (_e, id: string) => {
    const r = await getRun(String(id))
    return r ? { ...summary(r), stopsList: r.stops, checksList: r.checks, shakyList: r.shaky, transcript: r.transcript, pack: packOf(r) } : null
  })
  ipcMain.handle('lessons:map', () => lessonMap())
  // Practice (Map tab): new cases on what's due, a topic or a module; marked one by one; results kept.
  ipcMain.handle('practice:make', (_e, o: { due?: boolean; topic?: string; module?: string; lessonId?: string }) => makePractice(o ?? {}))
  ipcMain.handle('practice:mark', (_e, q: PracticeQ, answer: string) => markPractice(q, String(answer ?? '')))
  ipcMain.handle('practice:save', (_e, results: { q: PracticeQ; correct: boolean }[]) => savePractice(Array.isArray(results) ? results : []))
  ipcMain.handle('practice:exam', (_e, module: string) => examSet(String(module ?? '')))
  ipcMain.handle('lessons:suggest', () => suggestions())
  ipcMain.handle('lessons:markSaq', (_e, id: string, i: number, answer: string) => markSaq(String(id), Number(i), String(answer ?? '')))
  ipcMain.handle('lessons:saveTest', (_e, id: string, taken: { mcq: (number | null)[]; saq: { answer: string; hit: boolean[]; feedback: string }[] }) => saveTest(String(id), taken))
  ipcMain.handle('lessons:replay', (_e, id: string) => startReplay(String(id)))
  ipcMain.handle('lessons:remove', (_e, id: string) => deleteRun(String(id)))
  ipcMain.handle('lessons:makePack', async (_e, id: string) => {
    const r = await getRun(String(id))
    return r ? !!(await makePack(r)) : false
  })
  // A lesson on a deck: from the start, or carried on from where an earlier lesson on it stopped.
  ipcMain.handle('lessons:teach', async (_e, path: string, carryOn?: string) => {
    const file = String(path ?? '')
    if (!file || !existsSync(file)) return 'That file isn’t there any more.'
    let from = ''
    if (carryOn) {
      const r = await getRun(String(carryOn))
      const last = r ? Math.max(0, ...r.taught) : 0
      const next = r?.stops.find((s) => s.n > last)
      if (next) from = `, carrying on from stop ${next.n} (${next.topic}), where the last lesson on it stopped`
    }
    const what = `the deck at ${file}${from}`
    if (tutorOn()) tutorHooks.ask(`(Tutor mode: they want a lesson on ${what}. read_lesson with that source, then start.)`)
    else setTutor(true, 'full', what)
    return 'ok'
  })
  // A lesson just ended: its pack is made (notes, test, mind map, flashcards), and they hear when it's ready.
  tutorHooks.lessonOver = (r) => {
    if (!r) return
    void makePack(r).then((p) => {
      if (p) notify('Lesson pack ready', `${r.title}: notes, a ${p.test.mcq.length + p.test.saq.length}-question test, a mind map and flashcards are on Nova's Lessons tab.`)
    })
  }
}
