// "Hey Bauer, explain black holes": cards pinned beside your screen with a short summary,
// a photo and the key points (or the steps, if it's a process). The facts come from Wikipedia
// (free; only the topic is sent), and Bauer's brain on the PC turns them into points or a timeline.

import type { BauerCard } from '@shared/types'
import { api } from '@/lib/data'

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

/** Make the cards for a topic and show them. Returns what Bauer says out loud. */
export async function explainTopic(topic: string): Promise<string> {
  const wiki = await api.bauer.wiki(topic).catch(() => null)
  let ai: { summary: string; style: 'points' | 'timeline'; items: { label: string; detail: string }[] } | null = null
  const ready = await api.ai
    .status()
    .then((s) => s.installed)
    .catch(() => false)
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
        600
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
  const m = /^(?:hey\s+bauer[,.\s]*)?(?:can you\s+|please\s+)?(?:explain|tell me (?:about|what)|teach me(?: about)?|show me (?:info|something) about|give me (?:an? )?(?:overview|summary) of)\s+(.+?)[.?!]*$/i.exec(text.trim())
  return m ? m[1].replace(/^(?:to me\s+)?(?:what\s+)?/i, '').replace(/\s+(?:is|are|means?)$/i, '').trim() : null
}
