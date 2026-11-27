// Recall questions, made in the background so a quiz is always ready (PC only: it needs Claude). For each file in
// your recall modules' weeks (filed from PoliteMall, or added yourself):
//  • a worksheet (a WS, a Kahoot quiz, practice questions): its own questions, with the answers from its answer
//    sheet when there is one; otherwise Nova works the answers out and marks them "Nova's answer";
//  • slides and notes: Nova's own questions on them, multiple choice and short answer, a number to suit its length.
// Once per file. Paced so it never eats your Claude plan: one file every few minutes, only while the 5-hour window
// is under half used and the week's well under your cap, this week's files first.
import { claudeChat, claudeReady, claudeStatus, claudeBlocked } from './claude'
import { create, get, getSetting, list, setSetting } from './db'
import { docText } from './docText'
import { absolutePath } from './files'
import { isAnswers, isWorksheet, recallCourses } from './politeFiling'
import { getPrefs } from './prefs'
import type { RecallMeta } from './recallQuiz'

type Mat = { id: string; module_id: string; week_id: string; title: string; file_name: string; local_path: string | null; category: string }
type Made = Record<string, { at: number; n: number; paper?: string; skip?: string }>
const made = (): Made => getSetting<Made>('recall_made') ?? {}
const NOVA = "(Nova's answer) "

/** The files that still need questions, this week's first (worksheets before slides). */
function pending(): (Mat & { week: number })[] {
  const done = made()
  const want = recallCourses().file
  const mods = list<{ id: string; code: string; name: string }>('modules', { archived: 0 })
  const ours = new Set(mods.filter((m) => want.some((s) => m.code.toUpperCase().includes(s) || m.name.toUpperCase().includes(s)) || filedModules().has(m.id)).map((m) => m.id))
  const weeks = new Map(list<{ id: string; number: number }>('weeks').map((w) => [w.id, w.number]))
  return list<Mat>('materials')
    .filter((m) => ours.has(m.module_id) && !done[m.id] && /\.(pdf|pptx|docx)$/i.test(m.file_name) && !isAnswers(m.title) && weeks.has(m.week_id))
    .map((m) => ({ ...m, week: weeks.get(m.week_id)! }))
    .sort((a, b) => b.week - a.week || Number(isWorksheet(b.title)) - Number(isWorksheet(a.title)))
}
/** Modules PoliteMall filed into (whatever they're called). */
function filedModules(): Set<string> {
  const ids = Object.values(getSetting<Record<string, string>>('polite_filed') ?? {})
  return new Set(ids.map((id) => get<Mat>('materials', id)?.module_id).filter((x): x is string => !!x))
}

const SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['mcq', 'saq'] },
          prompt: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          answer: { type: 'string' },
          topic: { type: 'string' },
          by_nova: { type: 'boolean' }
        },
        required: ['kind', 'prompt', 'answer', 'topic']
      }
    }
  },
  required: ['questions']
}
const WORKSHEET = `You turn a student's worksheet into active-recall questions. Take the worksheet's own questions, as written (lightly reworded only so each stands alone, without "the diagram above" or "Q3").
- kind "mcq" for a question with options (options: each option's text; answer: the right option's text exactly), "saq" for the rest (answer: the key points of a good answer, in 1 to 3 sentences).
- The answers: from the ANSWER SHEET when one is given (by_nova false). With no answer sheet, or a question it doesn't cover, work the answer out yourself from standard knowledge of the subject and set by_nova true.
- Leave out what can't be asked in words: questions that need a picture you can't see, labelling a diagram, filling a table, or admin.
- topic: a few words (what it tests). At most 25 questions. If it has no real questions, return none.`
const CONTENT = (
  mcq: number,
  saq: number
): string => `You write active-recall questions on a lecture's slides or notes for a nursing/health-science student: ${mcq} multiple-choice and ${saq} short-answer.
- Cover the whole file: the key facts, mechanisms, definitions and clinical points, not trivia or slide titles. Each question stands alone (never "according to slide 3").
- mcq: 4 options, one clearly right, the others plausible (common misconceptions); answer: the right option's text exactly.
- saq: answer: the key points of a good answer in 1 to 3 sentences.
- topic: a few words (what it tests). by_nova: false. Use only what the file and standard knowledge of the subject support.`

let busy = false
let last = 0
export const makeHooks = { changed: (): void => {} }
export type MakeStatus = { pending: number; made: number; working: string | null; paused: string | null }
let status: MakeStatus = { pending: 0, made: 0, working: null, paused: null }
export const makeStatus = (): MakeStatus => ({ ...status, pending: pending().length, made: Object.values(made()).filter((m) => m.n > 0).length })

/** Makes one file's questions now (when the plan has room). */
async function makeOne(): Promise<boolean> {
  const next = pending()[0]
  if (!next) return false
  const why = await room()
  if (why) {
    status = { ...status, paused: why }
    return false
  }
  status = { ...status, paused: null, working: next.title }
  makeHooks.changed()
  try {
    const path = next.local_path ? absolutePath(next as never) : ''
    const text = path ? await docText(path, 45_000) : ''
    const record = (r: Made[string]): void => setSetting('recall_made', { ...made(), [next.id]: r })
    if (text.replace(/\s+/g, '').length < 200) return (record({ at: Date.now(), n: 0, skip: 'no text' }), true)
    const sheet = isWorksheet(next.title)
    // The worksheet's answer sheet, if PoliteMall had one in the same week (its name without "ANS" matches).
    let key = ''
    if (sheet) {
      const base = (t: string): string[] =>
        t
          .toLowerCase()
          .replace(/\b(ans|answers?|key|ws|worksheet)\b|[_\-().]/g, ' ')
          .split(/\s+/)
          .filter((w) => w.length > 2)
      const mine = base(next.title)
      const ans = list<Mat>('materials', { week_id: next.week_id }).find((m) => isAnswers(m.title) && base(m.title).filter((w) => mine.includes(w)).length >= Math.min(2, mine.length))
      const ap = ans?.local_path ? absolutePath(ans as never) : ''
      if (ap) key = await docText(ap, 25_000)
    }
    const mcq = Math.max(6, Math.min(20, Math.round(text.length / 900)))
    const saq = Math.max(2, Math.min(6, Math.round(mcq / 3)))
    const raw = await claudeChat(
      [
        { role: 'system', content: sheet ? WORKSHEET : CONTENT(mcq, saq) },
        { role: 'user', content: `${sheet ? 'WORKSHEET' : 'FILE'}: "${next.title}" (week ${next.week})\n\n${text}${key ? `\n\nANSWER SHEET:\n${key}` : ''}` }
      ],
      SCHEMA,
      { ...getPrefs(), novaBrain: 'sonnet', novaEffort: 'low' },
      'explain'
    ).catch(() => '')
    let qs: { kind: string; prompt: string; options?: string[]; answer: string; topic: string; by_nova?: boolean }[] = []
    try {
      qs = (JSON.parse(raw) as { questions?: typeof qs }).questions ?? []
    } catch {
      return false // (tried again later)
    }
    qs = qs.filter((q) => q.prompt?.trim() && q.answer?.trim() && (q.kind !== 'mcq' || (q.options?.length ?? 0) >= 2)).slice(0, 25)
    // A worksheet with no real questions: its slides-style questions instead.
    const source: RecallMeta['source'] = sheet && qs.length ? 'worksheet' : 'content'
    if (!qs.length) return (record({ at: Date.now(), n: 0, skip: 'no questions' }), true)
    const meta: RecallMeta = { recall: 1, week: next.week, source, file: next.title }
    const paper = create<{ id: string }>('exam_papers', { module_id: next.module_id, title: `Recall · Week ${next.week} · ${next.title}`.slice(0, 120), kind: 'practice', notes: JSON.stringify(meta) })
    qs.forEach((q, i) =>
      create('quiz_questions', {
        paper_id: paper.id,
        module_id: next.module_id,
        number: String(i + 1),
        prompt: q.prompt.trim().slice(0, 1200),
        kind: q.kind === 'mcq' ? 'mcq' : 'open',
        options: JSON.stringify(q.kind === 'mcq' ? (q.options ?? []).map(String).slice(0, 6) : []),
        answer: `${source === 'worksheet' && q.by_nova ? NOVA : ''}${q.answer.trim().slice(0, 1200)}`,
        topic: String(q.topic ?? '').slice(0, 80),
        sort: i
      })
    )
    record({ at: Date.now(), n: qs.length, paper: paper.id })
    console.info(`Recall: ${qs.length} questions from "${next.title}" (week ${next.week}, ${source})`)
    return true
  } finally {
    status = { ...status, working: null }
    makeHooks.changed()
  }
}

/** Why not now ('' when there's room): Claude not ready, paused, or the plan's 5-hour or weekly use too high. */
async function room(): Promise<string> {
  if (!claudeReady()) return 'Claude isn’t connected'
  const blocked = claudeBlocked(getPrefs())
  if (blocked) return blocked
  const st = await claudeStatus().catch(() => null)
  const u = st?.usage
  if (u?.fiveHour != null && u.fiveHour >= 50) return 'waiting for your 5-hour Claude window to free up'
  if (u?.sevenDay != null && u.sevenDay >= (getPrefs().novaCap ?? 80) - 20) return 'saving your weekly Claude use'
  return ''
}

/** Makes questions now and then: one file every 4 minutes at most (15 an hour), while there's room. */
export function startRecallMaking(): void {
  if (process.env.STUDYHALL_OFFSCREEN === '1') return
  const tick = async (): Promise<void> => {
    if (busy || Date.now() - last < 4 * 60_000) return
    busy = true
    try {
      if (await makeOne()) last = Date.now()
    } catch (e) {
      console.warn('Recall questions:', e instanceof Error ? e.message : e)
    } finally {
      busy = false
    }
  }
  setTimeout(() => void tick(), 3 * 60_000)
  setInterval(() => void tick(), 60_000).unref?.()
}

/** Marks a short answer (a small Claude call): got it, partly, or missed, and a line on what was missing. */
export async function markSaq(q: { prompt: string; answer: string }, given: string): Promise<{ grade: 'got' | 'partly' | 'missed'; feedback: string }> {
  if (!given.trim()) return { grade: 'missed', feedback: 'No answer: have a look at the model answer.' }
  const raw = await claudeChat(
    [
      {
        role: 'system',
        content:
          "Mark a student's short answer against the model answer. grade: got (the key points are there, in any words), partly (some), missed. feedback: one friendly sentence: what they got, and the point that was missing or wrong (if any)."
      },
      { role: 'user', content: `Question: ${q.prompt}\nModel answer: ${q.answer}\n\nTheir answer: ${given.slice(0, 1500)}` }
    ],
    { type: 'object', properties: { grade: { type: 'string', enum: ['got', 'partly', 'missed'] }, feedback: { type: 'string' } }, required: ['grade', 'feedback'] },
    { ...getPrefs(), novaBrain: 'haiku', novaEffort: 'low' },
    'chat'
  ).catch(() => '')
  try {
    const j = JSON.parse(raw) as { grade?: string; feedback?: string }
    return { grade: j.grade === 'got' || j.grade === 'partly' ? j.grade : 'missed', feedback: String(j.feedback ?? '') }
  } catch {
    return { grade: 'partly', feedback: "Couldn't mark it just now: compare it with the model answer." }
  }
}

// Automated tests only: make one file's questions now, and see what's waiting.
if (process.env.STUDYHALL_OFFSCREEN === '1')
  (globalThis as unknown as { __recallTest: unknown }).__recallTest = { makeOne, pending: () => pending().map((m) => `${m.week} ${m.title}`), status: makeStatus }
