// Circle-to-ask: Bauer's eyes (a vision AI on the PC) look at the part of the screen you circled.
// Ask a question, or pick: explain it, make flashcards, put its dates in your calendar, save it as a note.

import { generateJSON } from '@tiptap/core'
import { marked } from 'marked'
import type { Mode, UndoStep } from '@shared/types'
import { api, db } from '@/lib/data'
import { NOTE_EXTENSIONS, htmlToPlain } from '@/lib/noteSchema'
import { showAnswer } from './explain'
import { runBauer } from './agent'

export type LookKind = 'ask' | 'explain' | 'cards' | 'dates' | 'note'

const SYSTEM = 'You are Bauer, a study helper. You are looking at part of the user’s screen. Be accurate: only use what you can see, and say so if it is unclear. Answer directly: no preamble like "Based on the image".'

async function look(image: string, prompt: string, schema?: object, maxTokens = 700): Promise<string> {
  return api.ai.chat(
    [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: [{ type: 'image_url', image_url: { url: image } }, { type: 'text', text: prompt }] }
    ],
    schema,
    maxTokens,
    'look'
  )
}

const today = (): string => new Date().toLocaleDateString('en-CA')

/** Do what was asked with the circled picture. Returns a short line for Bauer to say. */
export async function lookAt(image: string, kind: LookKind, question: string, mode: Mode): Promise<string> {
  if (kind === 'ask' || kind === 'explain') {
    const q = kind === 'explain' || !question.trim() ? 'Explain what this shows, simply, in a few short paragraphs. If it is a question or problem, work through it step by step.' : question.trim()
    const answer = (await look(image, q, undefined, 900)).trim()
    await showAnswer(kind === 'explain' || !question.trim() ? 'What you circled' : question.trim(), answer, image)
    await logLook(question || 'Explain what I circled', firstLine(answer), [], 'ai')
    return firstLine(answer)
  }

  if (kind === 'cards') {
    const raw = await look(
      image,
      'Make 4 to 10 flashcards that test the key facts in this picture. Front: a short question. Back: the short answer.',
      { type: 'object', properties: { title: { type: 'string' }, cards: { type: 'array', items: { type: 'object', properties: { front: { type: 'string' }, back: { type: 'string' } }, required: ['front', 'back'] } } }, required: ['title', 'cards'] },
      1200
    )
    const parsed = JSON.parse(raw) as { title: string; cards: { front: string; back: string }[] }
    const list = parsed.cards.filter((c) => c.front?.trim() && c.back?.trim()).slice(0, 20)
    if (!list.length) return 'I couldn’t find anything to make flashcards from.'
    const undo: UndoStep[] = []
    const deck = await db.create('flashcard_decks', { name: `${(parsed.title || 'From your screen').slice(0, 60)} · ${today()}`, module_id: null })
    undo.push({ op: 'created', table: 'flashcard_decks', id: deck.id })
    for (const c of list) {
      const card = await db.create('flashcards', { deck_id: deck.id, front: c.front.trim(), back: c.back.trim(), ease: 2.5, interval_days: 0, repetitions: 0, due_at: null })
      undo.push({ op: 'created', table: 'flashcards', id: card.id })
    }
    const reply = `I made ${list.length} flashcards in “${deck.name}”.`
    await api.bauer.cards([{ id: deck.id, kind: 'points', title: `${list.length} new flashcards`, items: list.slice(0, 6).map((c) => ({ label: c.front, detail: c.back })), source: 'Flashcards' }])
    await logLook('Make flashcards from what I circled', reply, [{ icon: '🃏', verb: 'New deck', text: deck.name, detail: `${list.length} cards` }], 'ai', undo)
    return reply
  }

  if (kind === 'dates') {
    const text = (
      await look(image, `Today is ${today()}. List every deadline, exam, class, event or task you can see, one per line, as plain instructions: "Add a task <name> due <YYYY-MM-DD> at <HH:MM>" or "Add an event <name> on <YYYY-MM-DD> at <HH:MM> for <minutes> minutes". Copy each date exactly from the picture and write it as YYYY-MM-DD with no weekday name. If there are none, reply NONE.`, undefined, 600)
    ).trim()
    if (!text || /^none\b/i.test(text)) return 'I couldn’t see any dates in that.'
    const r = await runBauer(text, { source: 'typed', mode })
    await api.bauer.cards([{ id: r.logId ?? String(Date.now()), kind: 'points', title: 'Added from your screen', items: r.actions.map((a) => ({ label: 'title' in a ? String((a as { title: string }).title) : a.kind, detail: '' })).slice(0, 8), source: 'Bauer log' }])
    return r.reply
  }

  // note
  const md = (await look(image, 'Copy out all the text you can see, keeping headings and lists, as Markdown. Then add a line "Summary:" with one sentence.', undefined, 1500)).trim()
  const html = await marked.parse(md)
  const title = (md.match(/^#+\s*(.+)$/m)?.[1] ?? md.split('\n')[0] ?? 'From your screen').replace(/[#*_`]/g, '').slice(0, 80) || 'From your screen'
  const note = await db.create('notes', { mode, title, content: JSON.stringify(generateJSON(html, NOTE_EXTENSIONS)), plain_text: htmlToPlain(html), kind: 'note', pinned: 0, category: 'notes' })
  const reply = `Saved it as a note: “${title}”.`
  await showAnswer('Saved as a note', `${title}\n\n${md.slice(0, 600)}${md.length > 600 ? '…' : ''}`, image)
  await logLook('Save what I circled as a note', reply, [{ icon: '📝', verb: 'New note', text: title, detail: '' }], 'ai', [{ op: 'created', table: 'notes', id: note.id }])
  return reply
}

/** The first real sentence (skipping lead-ins that end in a colon). */
const firstLine = (t: string): string =>
  (
    t
      .replace(/[#*_`>]/g, '')
      .split(/(?<=[.!?])\s|\n/)
      .map((x) => x.trim())
      .find((x) => x.length > 3 && !x.endsWith(':') && !/^(based on|looking at|in (the|this) image)/i.test(x)) ?? t
  )
    .trim()
    .slice(0, 220)

async function logLook(said: string, reply: string, actions: { icon: string; verb: string; text: string; detail: string }[], brain: string, undo: UndoStep[] = []): Promise<void> {
  await db.create('bauer_log', { said, reply, actions: JSON.stringify(actions), undo: JSON.stringify(undo), source: 'screen', brain }).catch(() => {})
}
