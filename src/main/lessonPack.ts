// The lesson pack: made once when a tutor lesson ends (one Sonnet call, a few cents). From the lesson's plan, what was
// said and how they answered: notes for every stop (saved to Notes, under the module), a test (10 multiple-choice and
// 3 short-answer questions, weighted to what was shaky), a mind map (saved to Mindmaps), and flashcards for what they
// missed or found shaky (saved to Flashcards). Kept with the lesson on Nova's Lessons tab.
import { claudeChat } from './claude'
import { create, list } from './db'
import { getRun, saveRun, type LessonRun } from './lessonRecord'
import { saveNote } from './notes'
import { getPrefs } from './prefs'
import { saveFlashcards } from './study'

export type PackMcq = { q: string; options: string[]; answer: number; why: string; topic: string }
export type PackSaq = { q: string; points: string[]; model: string; topic: string }
export type LessonPack = {
  made: number
  module: { id: string; name: string } | null
  notes: { topic: string; title: string; idea: string; analogy: string; realUse: string; why: string; points: string[] }[]
  test: { mcq: PackMcq[]; saq: PackSaq[] }
  mindmap: { root: string; topics: { name: string; ideas: string[] }[] }
  noteId?: string
  mindmapId?: string
  deck?: string
  /** the test as taken: answers, marks, when */
  taken?: { at: number; mcq: (number | null)[]; saq: { answer: string; hit: boolean[]; feedback: string }[]; score: number; outOf: number }
}

const SCHEMA = {
  type: 'object',
  properties: {
    module: { type: 'string' },
    notes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          topic: { type: 'string' },
          title: { type: 'string' },
          idea: { type: 'string' },
          analogy: { type: 'string' },
          real_use: { type: 'string' },
          why: { type: 'string' },
          points: { type: 'array', items: { type: 'string' } }
        },
        required: ['topic', 'title', 'idea', 'points']
      }
    },
    mcq: {
      type: 'array',
      items: {
        type: 'object',
        properties: { q: { type: 'string' }, options: { type: 'array', items: { type: 'string' } }, answer: { type: 'integer' }, why: { type: 'string' }, topic: { type: 'string' } },
        required: ['q', 'options', 'answer', 'why', 'topic']
      }
    },
    saq: {
      type: 'array',
      items: {
        type: 'object',
        properties: { q: { type: 'string' }, points: { type: 'array', items: { type: 'string' } }, model: { type: 'string' }, topic: { type: 'string' } },
        required: ['q', 'points', 'model', 'topic']
      }
    },
    mindmap_root: { type: 'string' },
    mindmap: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, ideas: { type: 'array', items: { type: 'string' } } }, required: ['name', 'ideas'] } },
    flashcards: { type: 'array', items: { type: 'object', properties: { front: { type: 'string' }, back: { type: 'string' } }, required: ['front', 'back'] } }
  },
  required: ['module', 'notes', 'mcq', 'saq', 'mindmap_root', 'mindmap', 'flashcards']
}

const PROMPT = `A tutor lesson just ended. From its plan, what was said and how the student answered, make the lesson pack (plain text in every field, no markdown):
- module: which of their modules this lesson belongs to, copied exactly from the list given; "" if none clearly fits.
- notes: one note per stop that was taught, in order: title, the one idea in a plain sentence, the analogy used (or a good one), where it's used in real life, why it matters, and 2 to 4 short points.
- mcq: exactly 10 multiple-choice questions on what was taught, 4 options each, answer = the index (0-3) of the right one, why = one line explaining it, topic = the stop's topic. New questions, not the ones already asked in the lesson. More of them on what the student found shaky.
- saq: exactly 3 short-answer questions (explain, compare, apply to a case): points = the 2 to 4 key points a full answer has, model = a model answer in 2 or 3 sentences, topic.
- mindmap_root (the lesson's subject) and mindmap: its topics, each with 2 to 5 short ideas (a few words each).
- flashcards: one for each question the student got wrong or was shaky on (front: a question, back: the answer in a line), plus a few for the key ideas: 6 to 14 in all.
Use what was taught; don't add facts the lesson and the subject don't support.`

/** Make the pack for a lesson that ended (nothing if too little was taught). Notes, mind map and flashcards go into
 *  Studyhall; the rest stays with the lesson. */
export async function makePack(run: LessonRun): Promise<LessonPack | null> {
  if (run.pack?.made) return run.pack as unknown as LessonPack
  const said = run.transcript.filter((t) => t.who === 'nova').length
  if (!run.taught.length && said < 4) return null
  const modules = list<{ id: string; name: string; code: string }>('modules', { archived: 0 })
  const taught = run.stops.filter((s) => run.taught.includes(s.n))
  const input = [
    `Lesson: "${run.title}" (${run.count} ${run.kind === 'slides' ? 'slides' : 'pages'}).`,
    `Their modules: ${modules.map((m) => `${m.code ? `${m.code} ` : ''}${m.name}`).join('; ') || 'none'}.`,
    `Stops taught: ${(taught.length ? taught : run.stops.slice(0, 4)).map((s) => `${s.n}. ${s.topic}: ${s.idea}`).join(' | ')}`,
    `Checks: ${run.checks.map((c) => `"${c.question}" → ${c.given ?? '(no answer)'} (${c.correct == null ? 'not answered' : c.correct ? 'right' : `wrong${c.missed ? `: ${c.missed}` : ''}`})`).join(' | ') || 'none'}`,
    `Shaky: ${run.shaky.map((s) => `${s.topic}: ${s.idea}${s.fixed ? ' (fixed later)' : ''}`).join(' | ') || 'nothing'}`,
    `What was said (the tutor and the student):\n${run.transcript
      .map((t) => `${t.who === 'nova' ? 'Tutor' : 'Student'}: ${t.text}`)
      .join('\n')
      .slice(-24_000)}`
  ].join('\n')
  const raw = await claudeChat(
    [
      { role: 'system', content: PROMPT },
      { role: 'user', content: input }
    ],
    SCHEMA,
    { ...getPrefs(), novaBrain: 'sonnet', novaEffort: 'low' },
    'explain'
  ).catch((e) => {
    console.warn('lesson pack failed:', e instanceof Error ? e.message : e)
    return ''
  })
  let j: Record<string, unknown>
  try {
    j = JSON.parse(raw)
  } catch {
    return null
  }
  const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : [])
  const str = (v: unknown): string => String(v ?? '').trim()
  const modName = str(j.module).toLowerCase()
  const mod = modName ? modules.find((m) => m.name.toLowerCase() === modName || `${m.code} ${m.name}`.toLowerCase() === modName || (m.code && modName.startsWith(m.code.toLowerCase()))) : undefined
  const pack: LessonPack = {
    made: Date.now(),
    module: mod ? { id: mod.id, name: mod.name } : null,
    notes: arr(j.notes).map((n) => ({
      topic: str(n.topic),
      title: str(n.title),
      idea: str(n.idea),
      analogy: str(n.analogy),
      realUse: str(n.real_use),
      why: str(n.why),
      points: (Array.isArray(n.points) ? n.points : []).map(str).filter(Boolean).slice(0, 5)
    })),
    test: {
      mcq: arr(j.mcq)
        .map((q) => ({ q: str(q.q), options: (Array.isArray(q.options) ? q.options : []).map(str).slice(0, 4), answer: Number(q.answer), why: str(q.why), topic: str(q.topic) }))
        .filter((q) => q.q && q.options.length >= 2 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length)
        .slice(0, 10),
      saq: arr(j.saq)
        .map((q) => ({ q: str(q.q), points: (Array.isArray(q.points) ? q.points : []).map(str).filter(Boolean).slice(0, 5), model: str(q.model), topic: str(q.topic) }))
        .filter((q) => q.q && q.points.length)
        .slice(0, 3)
    },
    mindmap: {
      root: str(j.mindmap_root) || run.title,
      topics: arr(j.mindmap)
        .map((t) => ({ name: str(t.name), ideas: (Array.isArray(t.ideas) ? t.ideas : []).map(str).filter(Boolean).slice(0, 6) }))
        .filter((t) => t.name)
    }
  }
  const date = new Date(run.started).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  // Notes: one note for the lesson, a section per stop.
  try {
    const md = [
      `Lesson with Nova on ${date}${pack.module ? ` · ${pack.module.name}` : ''}.`,
      '',
      ...pack.notes.flatMap((n) => [
        `## ${n.title || n.topic}`,
        '',
        n.idea,
        '',
        ...n.points.map((p) => `- ${p}`),
        ...(n.analogy ? ['', `**Think of it as:** ${n.analogy}`] : []),
        ...(n.realUse ? [`**In real life:** ${n.realUse}`] : []),
        ...(n.why ? [`**Why it matters:** ${n.why}`] : []),
        ''
      ]),
      ...(run.shaky.length ? ['## Still shaky', '', ...run.shaky.map((s) => `- ${s.topic ? `${s.topic}: ` : ''}${s.fix}${s.fixed ? ' (got it on the second try)' : ''}`)] : [])
    ].join('\n')
    pack.noteId = saveNote(`${run.title}: lesson notes (${date})`, md, pack.module?.id ?? null).id
  } catch (e) {
    console.warn('lesson notes not saved:', e)
  }
  // The mind map: the subject in the middle, its topics round it, each topic's ideas beyond it.
  try {
    const m = create<{ id: string }>('mindmaps', { title: `${run.title} (lesson)`, mode: 'study', module_id: pack.module?.id ?? null })
    const root = create<{ id: string }>('mindmap_nodes', { mindmap_id: m.id, label: pack.mindmap.root.slice(0, 80), x: 0, y: 0, kind: 'root' })
    const n = Math.max(1, pack.mindmap.topics.length)
    pack.mindmap.topics.forEach((t, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2
      const tx = Math.cos(a) * 340
      const ty = Math.sin(a) * 240
      const tn = create<{ id: string }>('mindmap_nodes', { mindmap_id: m.id, label: t.name.slice(0, 80), x: Math.round(tx), y: Math.round(ty) })
      create('mindmap_edges', { mindmap_id: m.id, source_node_id: root.id, target_node_id: tn.id })
      t.ideas.forEach((idea, k) => {
        const b = a + (k - (t.ideas.length - 1) / 2) * 0.32
        const id = create<{ id: string }>('mindmap_nodes', { mindmap_id: m.id, label: idea.slice(0, 80), x: Math.round(tx + Math.cos(b) * 230), y: Math.round(ty + Math.sin(b) * 170) })
        create('mindmap_edges', { mindmap_id: m.id, source_node_id: tn.id, target_node_id: id.id })
      })
    })
    pack.mindmapId = m.id
  } catch (e) {
    console.warn('lesson mind map not saved:', e)
  }
  // Flashcards: what they missed and found shaky, plus the key ideas.
  try {
    const cards = arr(j.flashcards)
      .map((c) => ({ front: str(c.front), back: str(c.back) }))
      .filter((c) => c.front && c.back)
    if (cards.length) pack.deck = saveFlashcards(`${run.title} (lesson)`, cards, pack.module?.id ?? null).deck
  } catch (e) {
    console.warn('lesson flashcards not saved:', e)
  }
  if (pack.module) run.module = pack.module.name
  run.pack = pack as unknown as Record<string, unknown>
  await saveRun(run)
  return pack
}

/** Mark a short answer against its key points (one small Claude call). */
export async function markSaq(runId: string, i: number, answer: string): Promise<{ hit: boolean[]; feedback: string } | null> {
  const run = await getRun(runId)
  const q = (run?.pack as unknown as LessonPack | undefined)?.test.saq[i]
  if (!q || !answer.trim()) return null
  const raw = await claudeChat(
    [
      {
        role: 'system',
        content:
          "Mark a student's short answer against the key points. hit: one true/false per key point, in order (true if the answer gets the idea, in any words). feedback: one or two friendly sentences: what they got, and what was missing (if anything)."
      },
      { role: 'user', content: `Question: ${q.q}\nKey points:\n${q.points.map((p, k) => `${k + 1}. ${p}`).join('\n')}\nModel answer: ${q.model}\n\nTheir answer: ${answer.slice(0, 2000)}` }
    ],
    { type: 'object', properties: { hit: { type: 'array', items: { type: 'boolean' } }, feedback: { type: 'string' } }, required: ['hit', 'feedback'] },
    { ...getPrefs(), novaBrain: 'haiku', novaEffort: 'low' },
    'chat'
  ).catch(() => '')
  try {
    const j = JSON.parse(raw) as { hit?: unknown[]; feedback?: unknown }
    return { hit: q.points.map((_, k) => !!j.hit?.[k]), feedback: String(j.feedback ?? '') }
  } catch {
    return null
  }
}

/** The test as taken: its score kept with the lesson; what they missed goes to its flashcards and the shaky list. */
export async function saveTest(runId: string, taken: { mcq: (number | null)[]; saq: { answer: string; hit: boolean[]; feedback: string }[] }): Promise<{ score: number; outOf: number } | null> {
  const run = await getRun(runId)
  const pack = run?.pack as unknown as LessonPack | undefined
  if (!run || !pack) return null
  const mcqRight = pack.test.mcq.filter((q, k) => taken.mcq[k] === q.answer).length
  const saqMarks = taken.saq.reduce((a, s) => a + s.hit.filter(Boolean).length, 0)
  const saqOut = pack.test.saq.reduce((a, q) => a + q.points.length, 0)
  const outOf = pack.test.mcq.length + saqOut
  const score = mcqRight + saqMarks
  pack.taken = { at: Date.now(), mcq: taken.mcq, saq: taken.saq, score, outOf }
  // What they missed: a flashcard each, and on the shaky list (by topic).
  const missed: { front: string; back: string; topic: string }[] = []
  pack.test.mcq.forEach((q, k) => {
    if (taken.mcq[k] !== q.answer) missed.push({ front: q.q, back: `${q.options[q.answer]}. ${q.why}`, topic: q.topic })
  })
  pack.test.saq.forEach((q, k) => {
    const hit = taken.saq[k]?.hit ?? []
    if (hit.filter(Boolean).length < q.points.length) missed.push({ front: q.q, back: q.model, topic: q.topic })
  })
  if (missed.length) {
    try {
      pack.deck = saveFlashcards(pack.deck ?? `${run.title} (lesson)`, missed, pack.module?.id ?? null).deck
    } catch {
      /* flashcards not saved */
    }
    for (const m of missed) if (!run.shaky.some((s) => s.idea === m.front)) run.shaky.push({ topic: m.topic, idea: m.front, fix: m.back, at: Date.now() })
  }
  run.pack = pack as unknown as Record<string, unknown>
  await saveRun(run)
  return { score, outOf }
}
