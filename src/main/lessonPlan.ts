// Tutor mode's lesson plan: Sonnet reads the whole deck once, like a teacher preparing, and maps it: how it's built (in
// order, grouped by topic, or jumping about), the stops, what each builds on, the words to ring, an analogy, a real
// use, why it matters and a check question. The tutor teaches from this map in its own words (it's the map, not a
// script). Kept on this PC per deck, so the same deck taught again needs no second read.
import { app } from 'electron'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { claudeChat } from './claude'
import { lessonText, type Lesson } from './lessonReader'
import { getPrefs } from './prefs'

export type LessonStop = {
  n: number
  slides: number[]
  topic: string
  idea: string
  builds_on: number[]
  circle: string[]
  analogy: string
  real_use: string
  why: string
  check: { question: string; kind: 'choice' | 'say'; options?: string[]; answer: string; wrong_idea: string } | null
  light: boolean
}
export type LessonPlan = { structure: 'ordered' | 'grouped' | 'scattered'; summary: string; ask_order: boolean; topics: { name: string; slides: number[] }[]; stops: LessonStop[] }

const SCHEMA = {
  type: 'object',
  properties: {
    structure: { type: 'string', enum: ['ordered', 'grouped', 'scattered'] },
    summary: { type: 'string' },
    ask_order: { type: 'boolean' },
    topics: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, slides: { type: 'array', items: { type: 'integer' } } }, required: ['name', 'slides'] } },
    stops: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          slides: { type: 'array', items: { type: 'integer' } },
          topic: { type: 'string' },
          idea: { type: 'string' },
          builds_on: { type: 'array', items: { type: 'integer' } },
          circle: { type: 'array', items: { type: 'string' } },
          analogy: { type: 'string' },
          real_use: { type: 'string' },
          why: { type: 'string' },
          light: { type: 'boolean' },
          check_question: { type: 'string' },
          check_kind: { type: 'string', enum: ['choice', 'say', 'none'] },
          check_options: { type: 'array', items: { type: 'string' } },
          check_answer: { type: 'string' },
          check_wrong_idea: { type: 'string' }
        },
        required: ['slides', 'topic', 'idea', 'builds_on', 'circle', 'analogy', 'real_use', 'why', 'light', 'check_kind']
      }
    }
  },
  required: ['structure', 'summary', 'ask_order', 'topics', 'stops']
}

const PROMPT = `You are preparing to teach a student this deck, the way a good teacher prepares a lesson: read all of it, then map how to teach it. Your map is used by the tutor (who speaks to the student, rings words on the slides and draws small cards), so make it concrete and short.

- structure: "ordered" (the slides tell one story in order), "grouped" (clear topics, in blocks), or "scattered" (topics jump about and come back: heart, then brain, then heart). ask_order: true only for scattered decks (the tutor will ask: slide by slide, or topic by topic).
- summary: what you'll say first, 1 or 2 spoken sentences ("24 slides on transducers, in three parts: the LDR, the thermistor and the moisture sensor. It's well laid out, so we'll go in order.").
- topics: the deck's topics and their slides.
- stops: the lesson, in teaching order. One stop is one idea (it may cover 1 to 3 slides that belong together). Title slides, outlines and references are not stops (fold an overview slide into the first stop, as a light one). For a long deck, at most 18 stops: group what goes together.
  For each stop:
  - slides: the slide numbers it teaches (its main slide first).
  - idea: the one idea, in a plain sentence.
  - builds_on: earlier slides (lower numbers, already taught in an earlier stop) this idea needs; [] if none.
  - circle: 1 to 3 short phrases to ring on its main slide, copied EXACTLY as written there (a few words from one line).
  - analogy: an everyday comparison that carries the idea (short).
  - real_use: where this is found or used in real life, a case, a job (short and specific).
  - why: why it matters, or how an exam would ask about it (short).
  - light: true for an overview or a slide that only lists terms (taught briefly).
  - check_kind: "choice" (a quick multiple-choice check), "say" (they explain in a sentence), or "none" (light stops).
  - check_question, check_options (3 or 4, for choice), check_answer, check_wrong_idea (the likely misunderstanding behind a wrong answer).
Use the slides' own facts; don't invent content that isn't supported by the deck or standard knowledge of the subject.`

const mem = new Map<string, Promise<LessonPlan | null>>()
const fileOf = (id: string): string => join(app.getPath('userData'), 'lesson-plans', `${id}.json`)

/** The deck's lesson plan: kept from before, or made now (about half a minute for a big deck). null if it couldn't be made. */
export function lessonPlan(l: Lesson): Promise<LessonPlan | null> {
  const hit = mem.get(l.id)
  if (hit) return hit
  const p = (async (): Promise<LessonPlan | null> => {
    if (existsSync(fileOf(l.id))) {
      try {
        return JSON.parse(await readFile(fileOf(l.id), 'utf8')) as LessonPlan
      } catch {
        /* made again below */
      }
    }
    const t0 = Date.now()
    const raw = await claudeChat(
      [
        { role: 'system', content: PROMPT },
        { role: 'user', content: lessonText(l, 1, l.count, 60_000) }
      ],
      SCHEMA,
      { ...getPrefs(), novaBrain: 'sonnet', novaEffort: 'low' },
      'explain'
    ).catch((e) => {
      console.warn('lesson plan failed:', e instanceof Error ? e.message : e)
      return ''
    })
    let j: Record<string, unknown>
    try {
      j = JSON.parse(raw)
    } catch {
      return null
    }
    const stops = (Array.isArray(j.stops) ? j.stops : []) as Record<string, unknown>[]
    const ints = (v: unknown): number[] => (Array.isArray(v) ? v.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= l.count) : [])
    const plan: LessonPlan = {
      structure: (['ordered', 'grouped', 'scattered'].includes(String(j.structure)) ? j.structure : 'ordered') as LessonPlan['structure'],
      summary: String(j.summary ?? ''),
      ask_order: !!j.ask_order,
      topics: ((Array.isArray(j.topics) ? j.topics : []) as Record<string, unknown>[]).map((t) => ({ name: String(t.name ?? ''), slides: ints(t.slides) })),
      stops: stops
        .map((s, i) => ({
          n: i + 1,
          slides: ints(s.slides),
          topic: String(s.topic ?? ''),
          idea: String(s.idea ?? ''),
          builds_on: ints(s.builds_on),
          circle: (Array.isArray(s.circle) ? s.circle : []).map(String).slice(0, 3),
          analogy: String(s.analogy ?? ''),
          real_use: String(s.real_use ?? ''),
          why: String(s.why ?? ''),
          light: !!s.light,
          check:
            s.check_kind === 'none' || !s.check_question
              ? null
              : {
                  question: String(s.check_question),
                  kind: s.check_kind === 'say' ? ('say' as const) : ('choice' as const),
                  options: Array.isArray(s.check_options) ? s.check_options.map(String) : undefined,
                  answer: String(s.check_answer ?? ''),
                  wrong_idea: String(s.check_wrong_idea ?? '')
                }
        }))
        .filter((s) => s.slides.length)
    }
    if (!plan.stops.length) return null
    console.info(`lesson plan for "${l.title}": ${plan.stops.length} stops (${plan.structure}) in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
    await mkdir(join(app.getPath('userData'), 'lesson-plans'), { recursive: true }).catch(() => {})
    await writeFile(fileOf(l.id), JSON.stringify(plan)).catch(() => {})
    return plan
  })()
  mem.set(l.id, p)
  void p.then((r) => {
    if (!r) mem.delete(l.id)
  })
  return p
}

/** The plan as the tutor reads it: compact, one stop to a few lines. */
export function planText(p: LessonPlan, word: string): string {
  const out = [
    `LESSON PLAN (your map, not a script). The deck is ${p.structure}${p.ask_order ? ' (ask once: slide by slide, or topic by topic)' : ''}. Say first: ${p.summary}`,
    `Topics: ${p.topics.map((t) => `${t.name} (${word}s ${t.slides.join(', ')})`).join('; ')}`
  ]
  for (const s of p.stops) {
    out.push(
      `Stop ${s.n}${s.light ? ' (light)' : ''}: ${word}${s.slides.length > 1 ? 's' : ''} ${s.slides.join(', ')} · ${s.topic}: ${s.idea}` +
        `${s.builds_on.length ? ` | builds on ${word}s ${s.builds_on.join(', ')}` : ''}` +
        `${s.circle.length ? ` | ring: ${s.circle.map((c) => `"${c}"`).join(', ')}` : ''}` +
        `${s.analogy ? ` | analogy: ${s.analogy}` : ''}${s.real_use ? ` | real use: ${s.real_use}` : ''}${s.why ? ` | why: ${s.why}` : ''}` +
        `${s.check ? ` | check (${s.check.kind}): ${s.check.question}${s.check.options?.length ? ` [${s.check.options.join(' / ')}]` : ''} → ${s.check.answer}${s.check.wrong_idea ? ` (wrong idea: ${s.check.wrong_idea})` : ''}` : ''}`
    )
  }
  return out.join('\n')
}
