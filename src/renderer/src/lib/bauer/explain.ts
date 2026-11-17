// "Hey Bauer, explain black holes": cards pinned beside your screen with a short summary,
// a photo and the key points (or the steps, if it's a process). The facts come from Wikipedia
// (free; only the topic is sent), and Bauer's brain on the PC turns them into points or a timeline.

import type { BauerCard, WikiSummary } from '@shared/types'
import { api } from '@/lib/data'
import { aiInstalled } from './agent'

const uid = (): string => Math.random().toString(36).slice(2, 10)

const SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    style: { type: 'string', enum: ['points', 'timeline'] },
    items: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, detail: { type: 'string' } }, required: ['label', 'detail'] } }
  },
  required: ['summary', 'style', 'items']
}

// With Claude connected, an explanation picks the layout that suits the topic and adds a short quiz.
const RICH_SCHEMA = {
  type: 'object',
  properties: {
    say: { type: 'string' },
    summary: { type: 'string' },
    style: { type: 'string', enum: ['points', 'timeline', 'steps', 'chart'] },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { label: { type: 'string' }, detail: { type: 'string' }, value: { type: 'number' } },
        required: ['label', 'detail', 'value'],
        additionalProperties: false
      }
    },
    unit: { type: 'string' },
    quiz: {
      type: 'array',
      items: {
        type: 'object',
        properties: { q: { type: 'string' }, options: { type: 'array', items: { type: 'string' } }, answer: { type: 'integer' }, why: { type: 'string' } },
        required: ['q', 'options', 'answer', 'why'],
        additionalProperties: false
      }
    }
  },
  required: ['say', 'summary', 'style', 'items', 'unit', 'quiz'],
  additionalProperties: false
}

const RICH_SYSTEM = `You explain a topic to a university student with small cards shown beside their work.
- say: one or two short sentences Nova says out loud (plain speech).
- summary: two or three plain sentences.
- style: "timeline" for history or dates in order; "steps" for a process or method someone follows; "chart" only when the topic has real numbers worth comparing (sizes, amounts, percentages); otherwise "points".
- items: 3 to 6. label: 2 to 5 words. detail: one short line. value: the number for a chart (in the same unit for every item), otherwise 0.
- unit: the chart's unit (e.g. "°C", "% of the total", "km"), otherwise "".
- quiz: 2 multiple-choice questions that check the key idea. options: 3 or 4 short answers. answer: the index (from 0) of the right one. why: one short line.
Use the reference text when given and don't invent facts or numbers. If you aren't sure of a number, don't use a chart.`

async function richExplain(topic: string, wiki: WikiSummary | null): Promise<{ cards: BauerCard[]; say: string } | null> {
  try {
    if (!(await api.claude.status()).signedIn) return null
  } catch {
    return null
  }
  const raw = await api.ai.chat(
    [
      { role: 'system', content: RICH_SYSTEM },
      { role: 'user', content: `Topic: ${topic}${wiki ? `\n\nReference (Wikipedia, ${wiki.title}):\n${wiki.extract}` : ''}` }
    ],
    RICH_SCHEMA,
    1400,
    'explain'
  )
  const a = JSON.parse(raw) as {
    say: string
    summary: string
    style: 'points' | 'timeline' | 'steps' | 'chart'
    items: { label: string; detail: string; value: number }[]
    unit: string
    quiz: { q: string; options: string[]; answer: number; why: string }[]
  }
  const title = wiki?.title ?? topic
  const cards: BauerCard[] = [{ id: uid(), kind: 'summary', title, body: a.summary, source: wiki ? 'Wikipedia + Claude' : 'Claude', link: wiki?.url }]
  if (wiki?.image) cards.push({ id: uid(), kind: 'photo', title, image: wiki.image, source: 'Wikipedia' })
  const items = (a.items ?? []).filter((i) => i.label).slice(0, 6)
  const charted = a.style === 'chart' && items.filter((i) => Number.isFinite(i.value) && i.value > 0).length >= 2
  if (items.length) {
    const kind = charted ? 'chart' : a.style === 'chart' ? 'points' : a.style
    const heading = { points: 'Key points', timeline: 'Timeline', steps: 'Step by step', chart: 'In numbers' }[kind]
    cards.push({ id: uid(), kind, title: heading, items, unit: charted ? a.unit : undefined, source: 'Claude' })
  }
  const quiz = (a.quiz ?? []).filter((q) => q.q && q.options?.length >= 2 && q.answer >= 0 && q.answer < q.options.length).slice(0, 3)
  if (quiz.length) cards.push({ id: uid(), kind: 'quiz', title: `Quick check: ${title}`, quiz, source: 'Claude' })
  return { cards, say: a.say || firstSentences(a.summary, 1) }
}

/** Make the cards for a topic and show them. Returns what Bauer says out loud. */
export async function explainTopic(topic: string): Promise<string> {
  const wiki = await api.bauer.wiki(topic).catch(() => null)
  const rich = await richExplain(topic, wiki).catch((e) => (console.warn('Nova: rich explain failed', e), null))
  if (rich) {
    await api.bauer.cards(rich.cards)
    return rich.say
  }
  let ai: { summary: string; style: 'points' | 'timeline'; items: { label: string; detail: string }[] } | null = null
  const ready = await aiInstalled()
  if (ready) {
    try {
      const raw = await api.ai.chat(
        [
          {
            role: 'system',
            content:
              'You explain topics to a university student in plain words. Reply in JSON. summary: 2 short sentences. style: "timeline" if the topic is a process, life cycle, history or sequence of steps, otherwise "points". items: 4 items; for a timeline, label = the stage (2-4 words) and detail = one short line; for points, label = a key idea (2-5 words) and detail = one short line. Use the reference text when given; don’t invent facts.'
          },
          { role: 'user', content: `Topic: ${topic}${wiki ? `\n\nReference (Wikipedia, ${wiki.title}):\n${wiki.extract}` : ''}` }
        ],
        SCHEMA,
        600,
        'explain'
      )
      ai = JSON.parse(raw)
    } catch (e) {
      console.warn('Bauer: explain without the AI', e)
    }
  }
  if (!wiki && !ai) return `I couldn’t find anything about ${topic}.`
  const title = wiki?.title ?? topic
  const cards: BauerCard[] = []
  cards.push({ id: uid(), kind: 'summary', title, body: ai?.summary || firstSentences(wiki?.extract ?? '', 3), source: wiki ? 'Wikipedia' : 'Bauer', link: wiki?.url })
  if (wiki?.image) cards.push({ id: uid(), kind: 'photo', title, image: wiki.image, source: 'Wikipedia' })
  if (ai?.items?.length) cards.push({ id: uid(), kind: ai.style === 'timeline' ? 'timeline' : 'points', title: ai.style === 'timeline' ? 'Step by step' : 'Key points', items: ai.items.slice(0, 6), source: 'Bauer’s brain' })
  // Shown top to bottom: summary, photo, then points or steps.
  await api.bauer.cards(cards)
  return firstSentences(ai?.summary || wiki?.extract || '', 1) || `Here’s ${title}.`
}

/** A cards-only answer (circle-to-ask and questions). */
export async function showAnswer(title: string, body: string, image?: string): Promise<void> {
  await api.bauer.cards([{ id: uid(), kind: 'answer', title, body, image, source: 'Bauer' }])
}

const firstSentences = (t: string, n: number): string => (t.match(/[^.!?]+[.!?]+/g) ?? [t]).slice(0, n).join(' ').trim()

/** "explain photosynthesis", "tell me about the French revolution", "teach me integrals". */
export function explainTopicFrom(text: string): string | null {
  const m = /^(?:hey\s+bauer[,.\s]*)?(?:can you\s+|could you\s+|please\s+)?(?:explain|tell me (?:about|what)|teach me(?: about)?|show me (?:info|something) about|give me (?:an? )?(?:overview|summary) of)\s+(.+?)[.?!]*$/i.exec(text.trim())
  if (!m) return null
  const t = m[1]
    .replace(/\s+(?:to me|for me|please|simply|in simple terms)$/i, '')
    .replace(/^(?:to me\s+)?(?:what\s+|how\s+)?(?:a |an |the )?/i, '')
    .replace(/\s+(?:is|are|means?|works?)$/i, '')
    .trim()
  return t.length >= 2 && t.length <= 80 ? t : null
}
