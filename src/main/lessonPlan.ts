// Tutor mode's lesson plan: Sonnet reads the whole deck once, like a teacher preparing, and maps it: how it's built (in
// order, grouped by topic, or jumping about), the stops, what each builds on, the words to ring, an analogy, a real
// use, why it matters and a check question. The tutor teaches from this map in its own words (it's the map, not a
// script). Kept on this PC per deck, so the same deck taught again needs no second read.
// A slide's text can't tell what its picture shows (an endocrine body map, a circuit): the slides with a diagram are
// looked at too, once, while planning, so the tutor knows each labelled part, what it does, the order to walk it in and
// where each part sits (to ring it). A big deck is planned in parts at the same time, so the lesson starts sooner.
import { app } from 'electron'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AiPart } from '@shared/types'
import { claudeChat } from './claude'
import { addPictureParts, lessonText, picture, type Lesson, type TextBox } from './lessonReader'
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
  core?: boolean
  points?: string[]
  repeats?: string[]
}
/** A diagram on a slide, as Nova saw it: what it shows, how to read it, its labelled parts (with where each sits, as
 *  fractions of the slide) and the order to teach them in. */
export type Diagram = { n: number; kind: string; shows: string; read: string; parts: { label: string; does: string; box: [number, number, number, number] }[]; walk: string[] }
export type Subject = 'engineering' | 'pharmacology' | 'biology' | 'anatomy' | 'procedure' | 'other'
export type LessonPlan = {
  structure: 'ordered' | 'grouped' | 'scattered'
  subject?: Subject
  summary: string
  ask_order: boolean
  topics: { name: string; slides: number[] }[]
  stops: LessonStop[]
  diagrams?: Diagram[]
}

const SCHEMA = {
  type: 'object',
  properties: {
    structure: { type: 'string', enum: ['ordered', 'grouped', 'scattered'] },
    subject: { type: 'string', enum: ['engineering', 'pharmacology', 'biology', 'anatomy', 'procedure', 'other'] },
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
          core: { type: 'boolean' },
          points: { type: 'array', items: { type: 'string' } },
          repeats: { type: 'array', items: { type: 'string' } },
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
  required: ['structure', 'subject', 'summary', 'ask_order', 'topics', 'stops']
}

const PROMPT = `You are preparing to teach a student this deck, the way a good teacher prepares a lesson: read all of it, then map how to teach it. Your map is used by the tutor (who speaks to the student, rings words on the slides and draws small cards), so make it concrete and short.

- structure: "ordered" (the slides tell one story in order), "grouped" (clear topics, in blocks), or "scattered" (topics jump about and come back: heart, then brain, then heart). ask_order: true only for scattered decks (the tutor will ask: slide by slide, or topic by topic).
- summary: what you'll say first, 1 or 2 spoken sentences ("24 slides on transducers, in three parts: the LDR, the thermistor and the moisture sensor. It's well laid out, so we'll go in order.").
- subject: engineering (or physics, electronics), pharmacology, biology (or physiology), anatomy, procedure (guidelines, how to do something), or other.
- topics: the deck's topics and their slides.
- stops: the lesson, in teaching order, covering EVERY content slide: each slide with content is in exactly one stop. One stop is one idea; it may cover 1 to 3 slides that belong together (each still taught, one after the other). Only title slides, outline/contents slides, references and blank slides are left out (fold an overview slide into the first stop, as a light one). At most 30 stops.
  For each stop:
  - slides: the slide numbers it teaches (its main slide first).
  - idea: the one idea, in a plain sentence.
  - points: every point its slides make that the student needs, in order, a few words each (so none is skipped).
  - core: true for the deck's core ideas (how something works, a key mechanism, a key drug class); false otherwise.
  - builds_on: earlier slides (lower numbers, already taught in an earlier stop) this idea needs; [] if none.
  - circle: 3 to 5 short phrases to ring on its slides (the key terms and the lines that carry the idea), each copied EXACTLY as written on the slide (a few words from one line).
  - repeats: where two lines on its slides say the same thing in different words (a definition and its example, a heading and its bullet), each pair as "phrase A = phrase B", both copied exactly: the tutor rings both and links them. [] if none.
  - analogy: an everyday comparison that carries the idea (short).
  - real_use: the card that shows why it matters in practice, by subject: engineering: where it's used ("street lights switch on at dusk with an LDR"); pharmacology: the nursing or clinical side (what to check, warning signs, a typical drug: "gentamicin: check trough levels, watch for ringing in the ears"); biology: when it goes wrong (the condition or symptom: "cochlea damage → sensorineural hearing loss"); anatomy: where it is (the parts to label); procedure: the steps in order, or a short case. Short and specific.
  - why: why it matters, or how an exam would ask about it (short).
  - light: true for an overview or a slide that only lists terms (taught briefly).
  - check_kind: "choice" (a quick multiple-choice check), "say" (they explain in a sentence), or "none" (light stops).
  - check_question, check_options (3 or 4, for choice), check_answer, check_wrong_idea (the likely misunderstanding behind a wrong answer).
Use the slides' own facts; don't invent content that isn't supported by the deck or standard knowledge of the subject.`

const mem = new Map<string, Promise<LessonPlan | null>>()
// (v3: diagrams looked at, 3 to 5 rings and repeats per stop; plans from before are made again)
const fileOf = (id: string): string => join(app.getPath('userData'), 'lesson-plans', `${id}.v3.json`)
const SONNET = (): ReturnType<typeof getPrefs> => ({ ...getPrefs(), novaBrain: 'sonnet', novaEffort: 'low' })

// ---------- Looking at the diagrams ----------

/** Slides that may carry a diagram: a picture, or several shapes or lines drawn (a circuit, a chart). */
const maybeDiagram = (l: Lesson): number[] =>
  l.pages
    .filter((p) => p.n > 1 && (p.pictures > 0 || p.shapes >= 4))
    .map((p) => p.n)
    .slice(0, 40)

const SEE_PROMPT = `You are preparing to teach a student a slide deck. Below are pictures of some of its slides, each after its slide number. For each one, say whether it carries a DIAGRAM worth teaching (a labelled figure, a body map, an organ or cell, a circuit, a pathway or flowchart, a cycle, a graph, a table of data, a labelled photo) or not (a decorative photo, clip art, a logo, a picture that only illustrates the title).
For a diagram:
- kind: a few words (body map, circuit, flowchart, cycle, graph, labelled diagram, table, photo).
- shows: what it shows, in a sentence.
- how_to_read: how to read it, in a sentence (where to start, what the arrows or axes mean).
- parts: every labelled part that matters (up to 14): label (exactly as written on it; a short name if it has none), does (what it is or does, a few words), and where it sits on the slide picture: x, y, w, h as fractions of the picture's width and height (0 to 1, from the top-left corner), a box around the part and its label.
- walk: the labels in the order to teach them (follow the flow: the hormone pathway, the current's path, top to bottom, cause to effect).
For a slide with no diagram: diagram false, and leave the rest empty.`
const SEE_SCHEMA = {
  type: 'object',
  properties: {
    slides: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          n: { type: 'integer' },
          diagram: { type: 'boolean' },
          kind: { type: 'string' },
          shows: { type: 'string' },
          how_to_read: { type: 'string' },
          parts: {
            type: 'array',
            items: {
              type: 'object',
              properties: { label: { type: 'string' }, does: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } },
              required: ['label', 'does', 'x', 'y', 'w', 'h']
            }
          },
          walk: { type: 'array', items: { type: 'string' } }
        },
        required: ['n', 'diagram']
      }
    }
  },
  required: ['slides']
}

/** Sonnet looks at the slides that may have a diagram, five at a time (four looks at once). */
async function seeDiagrams(l: Lesson): Promise<Diagram[]> {
  const want = maybeDiagram(l)
  const queue: number[][] = []
  for (let i = 0; i < want.length; i += 5) queue.push(want.slice(i, i + 5))
  const out: Diagram[] = []
  const one = async (ns: number[]): Promise<void> => {
    const parts: AiPart[] = []
    for (const n of ns) {
      const jpg = await picture(l.id, n).catch(() => null)
      if (jpg) parts.push({ type: 'text', text: `Slide ${n}:` }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${jpg.toString('base64')}` } })
    }
    if (!parts.length) return
    const raw = await claudeChat(
      [
        { role: 'system', content: SEE_PROMPT },
        { role: 'user', content: parts }
      ],
      SEE_SCHEMA,
      SONNET(),
      'explain'
    ).catch((e) => {
      console.warn('diagram look failed:', e instanceof Error ? e.message : e)
      return ''
    })
    try {
      const j = JSON.parse(raw) as { slides?: Record<string, unknown>[] }
      const f = (v: unknown): number => Math.min(1, Math.max(0, Number(v) || 0))
      for (const s of j.slides ?? []) {
        const n = Number(s.n)
        if (!s.diagram || !ns.includes(n)) continue
        const ps = ((Array.isArray(s.parts) ? s.parts : []) as Record<string, unknown>[])
          .map((p) => ({ label: String(p.label ?? '').trim(), does: String(p.does ?? ''), box: [f(p.x), f(p.y), f(p.w), f(p.h)] as [number, number, number, number] }))
          .filter((p) => p.label && p.box[2] > 0.005 && p.box[3] > 0.005)
          .slice(0, 14)
        out.push({ n, kind: String(s.kind ?? 'diagram'), shows: String(s.shows ?? ''), read: String(s.how_to_read ?? ''), parts: ps, walk: (Array.isArray(s.walk) ? s.walk : []).map(String).slice(0, 14) })
      }
    } catch {
      /* this batch is left out */
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(4, queue.length) }, async () => {
      for (let b = queue.shift(); b; b = queue.shift()) await one(b)
    })
  )
  return out.sort((a, b) => a.n - b.n)
}
/** A diagram's parts become ringable on its slide by their labels, like words. */
const ringable = (l: Lesson, ds: Diagram[]): void => {
  for (const d of ds) addPictureParts(l.id, d.n, d.parts.map((p) => [...p.box, p.label] as TextBox))
}

// ---------- Planning the stops ----------

const PART = 12 // slides planned in one go: a bigger deck is planned in parts, all at the same time
const STOPS_SCHEMA = { type: 'object', properties: { stops: SCHEMA.properties.stops }, required: ['stops'] }
/** The stops for one part of the deck (or all of it); the first part also says the deck's shape. */
async function planPart(l: Lesson, from: number, to: number, first: boolean): Promise<Record<string, unknown> | null> {
  const whole = from === 1 && to === l.count
  const word = l.kind === 'slides' ? 'SLIDES' : 'PAGES'
  const outline = whole ? '' : `The whole deck, one line per slide (for context):\n${l.pages.map((p) => `${p.n}: ${p.text.split('\n')[0].slice(0, 70) || '(picture)'}`).join('\n')}\n\n`
  const most = whole ? 30 : Math.max(4, Math.ceil((30 * (to - from + 1)) / l.count))
  const task = whole
    ? ''
    : `\n\nPLAN ONLY ${word} ${from} TO ${to} (the rest are planned separately): stops for those, at most ${most}.${first ? ' structure, subject, summary, ask_order and topics are for the WHOLE deck (from the outline).' : ''}`
  const raw = await claudeChat(
    [
      { role: 'system', content: PROMPT + task },
      { role: 'user', content: `${outline}${lessonText(l, from, to, whole ? 60_000 : 30_000)}` }
    ],
    first ? SCHEMA : STOPS_SCHEMA,
    SONNET(),
    'explain'
  ).catch((e) => {
    console.warn('lesson plan failed:', e instanceof Error ? e.message : e)
    return ''
  })
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null
  }
}
const made = new Map<string, LessonPlan>()
/** A deck's plan once it's made (the tutor's per-slide checks read it), or null. */
export const planNow = (id: string): LessonPlan | null => made.get(id) ?? null

/** The deck's lesson plan: kept from before, or made now (about half a minute for a big deck). null if it couldn't be made. */
export function lessonPlan(l: Lesson): Promise<LessonPlan | null> {
  const hit = mem.get(l.id)
  if (hit) return hit
  const p = (async (): Promise<LessonPlan | null> => {
    if (existsSync(fileOf(l.id))) {
      try {
        const kept = JSON.parse(await readFile(fileOf(l.id), 'utf8')) as LessonPlan
        ringable(l, kept.diagrams ?? [])
        made.set(l.id, kept)
        return kept
      } catch {
        /* made again below */
      }
    }
    const t0 = Date.now()
    // The diagrams are looked at while the deck is planned (a big one in parts of 12 slides, all at once).
    const ranges: [number, number][] = []
    if (l.count <= PART + 2) ranges.push([1, l.count])
    else for (let a = 1; a <= l.count; a += PART) ranges.push([a, Math.min(l.count, a + PART - 1)])
    const [seen, ...parts] = await Promise.all([seeDiagrams(l).catch((): Diagram[] => []), ...ranges.map(([a, b], i) => planPart(l, a, b, i === 0))])
    const j = parts[0]
    if (!j) return null
    const stops = parts.flatMap((x) => (Array.isArray(x?.stops) ? x.stops : [])) as Record<string, unknown>[]
    const ints = (v: unknown): number[] => (Array.isArray(v) ? v.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= l.count) : [])
    const plan: LessonPlan = {
      structure: (['ordered', 'grouped', 'scattered'].includes(String(j.structure)) ? j.structure : 'ordered') as LessonPlan['structure'],
      subject: (['engineering', 'pharmacology', 'biology', 'anatomy', 'procedure'].includes(String(j.subject)) ? j.subject : 'other') as Subject,
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
          circle: (Array.isArray(s.circle) ? s.circle : []).map(String).slice(0, 5),
          repeats: (Array.isArray(s.repeats) ? s.repeats : []).map(String).filter((x) => x.includes('=')).slice(0, 3),
          analogy: String(s.analogy ?? ''),
          real_use: String(s.real_use ?? ''),
          why: String(s.why ?? ''),
          light: !!s.light,
          core: !!s.core,
          points: (Array.isArray(s.points) ? s.points : []).map(String).slice(0, 12),
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
        .filter((s) => s.slides.length),
      diagrams: seen
    }
    if (!plan.stops.length) return null
    // A slide with a diagram is a core stop (the most time). One the plan left out (a picture under a title looked like
    // a title slide) gets a stop of its own, in its place.
    for (const d of seen) {
      const st = plan.stops.find((s) => s.slides.includes(d.n))
      if (st) Object.assign(st, { core: true, light: false })
      else {
        const at = plan.stops.findIndex((s) => Math.min(...s.slides) > d.n)
        const near = plan.stops[at < 0 ? plan.stops.length - 1 : Math.max(0, at - 1)]
        const stop: LessonStop = { n: 0, slides: [d.n], topic: near?.topic ?? '', idea: d.shows, builds_on: [], circle: d.walk.slice(0, 5), analogy: '', real_use: '', why: '', check: null, light: false, core: true, points: d.parts.map((p) => `${p.label}: ${p.does}`) }
        plan.stops.splice(at < 0 ? plan.stops.length : at, 0, stop)
      }
    }
    plan.stops.forEach((s, i) => (s.n = i + 1))
    ringable(l, seen)
    made.set(l.id, plan)
    console.info(`lesson plan for "${l.title}": ${plan.stops.length} stops (${plan.structure}), ${seen.length} diagrams, in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
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

// A core stop's fourth card, by subject: why it matters in practice.
const CARD4: Record<Subject, string> = {
  engineering: 'where you see it (a device, a circuit, a real use)',
  pharmacology: 'nursing and clinical: what the nurse checks, warning signs, a typical drug',
  biology: 'when it goes wrong: the condition or symptom that shows why it matters',
  anatomy: "where it is: a labelled picture (the slide's own figure, or a figure from the web) with the parts named",
  procedure: 'the steps in order, or a short case to work through',
  other: 'where it matters in real life'
}
/** One stop in full, as the tutor reads it when it gets there: its points, words to ring, analogy, practice card,
 *  check, and its slides' diagrams to walk part by part. */
export function stopText(p: LessonPlan, s: LessonStop, word: string): string {
  const out = [
    `Stop ${s.n}${s.light ? ' (light)' : s.core ? ' (core)' : ''}: ${word}${s.slides.length > 1 ? 's' : ''} ${s.slides.join(', ')} · ${s.topic}: ${s.idea}` +
      `${s.points?.length ? ` | points: ${s.points.join('; ')}` : ''}` +
      `${s.builds_on.length ? ` | builds on ${word}s ${s.builds_on.join(', ')}` : ''}` +
      `${s.circle.length ? ` | ring: ${s.circle.map((c) => `"${c}"`).join(', ')}` : ''}` +
      `${s.repeats?.length ? ` | same idea twice (ring both, tie them): ${s.repeats.join('; ')}` : ''}` +
      `${s.analogy ? ` | analogy: ${s.analogy}` : ''}${s.real_use ? ` | practice card: ${s.real_use}` : ''}${s.why ? ` | why: ${s.why}` : ''}` +
      `${s.check ? ` | check (${s.check.kind}): ${s.check.question}${s.check.options?.length ? ` [${s.check.options.join(' / ')}]` : ''} → ${s.check.answer}${s.check.wrong_idea ? ` (wrong idea: ${s.check.wrong_idea})` : ''}` : ''}`
  ]
  // Its slides' diagrams, as seen while planning: walk them part by part.
  for (const d of (p.diagrams ?? []).filter((x) => s.slides.includes(x.n)))
    out.push(
      `  DIAGRAM on ${word} ${d.n} (${d.kind}): ${d.shows}${d.read ? ` Read it: ${d.read}` : ''} Walk it part by part, in this order (ring each part by its label, say what it does, build the flow as you go): ` +
        (d.walk.length ? d.walk : d.parts.map((x) => x.label))
          .map((w) => {
            const part = d.parts.find((x) => x.label.toLowerCase() === w.toLowerCase())
            return part ? `${part.label} (${part.does})` : w
          })
          .join(' → ')
    )
  return out.join('\n')
}
/** The plan as the tutor reads it at the start: the deck's shape, every stop in a line, and the first few in full (the
 *  rest come in full as each one's slide is shown: all of it at once was too long to take in). */
export function planText(p: LessonPlan, word: string, full = 3): string {
  const diagramAt = new Set((p.diagrams ?? []).map((d) => d.n))
  return [
    `LESSON PLAN (your map, not a script). The deck is ${p.structure}${p.ask_order ? ' (ask once: slide by slide, or topic by topic)' : ''}; the subject: ${p.subject ?? 'other'}. Say first: ${p.summary}`,
    `Practice card (a core stop's 4th card), for ${p.subject ?? 'this subject'}: ${CARD4[p.subject ?? 'other']}`,
    `Topics: ${p.topics.map((t) => `${t.name} (${word}s ${t.slides.join(', ')})`).join('; ')}`,
    `The stops (each one's points, rings, analogy, check and diagram walk-through come with show_slide when you get there):`,
    ...p.stops.map((s) => `  ${s.n}. ${word}${s.slides.length > 1 ? 's' : ''} ${s.slides.join(', ')}${s.light ? ' (light)' : s.core ? ' (core)' : ''}${s.slides.some((n) => diagramAt.has(n)) ? ' (DIAGRAM)' : ''}: ${s.topic}`),
    `The first stops in full:`,
    ...p.stops.slice(0, full).map((s) => stopText(p, s, word))
  ].join('\n')
}

// Automated tests only: read a deck and plan it (with its diagrams), and where a diagram's parts would be ringed.
if (process.env.STUDYHALL_OFFSCREEN === '1')
  (globalThis as unknown as { __planTest: unknown }).__planTest = async (source: string) => {
    const { readLesson, findOnPage } = await import('./lessonReader')
    const l = await readLesson(source)
    if (typeof l === 'string') return l
    const t0 = Date.now()
    const p = await lessonPlan(l)
    if (!p) return 'no plan'
    const rings = (p.diagrams ?? []).flatMap((d) => d.parts.slice(0, 3).map((x) => ({ n: d.n, label: x.label, at: findOnPage(l.id, d.n, x.label) })))
    return { secs: (Date.now() - t0) / 1000, stops: p.stops.length, diagrams: (p.diagrams ?? []).map((d) => `${d.n} ${d.kind}: ${d.parts.length} parts`), text: planText(p, l.kind === 'slides' ? 'slide' : 'page'), rings }
  }
