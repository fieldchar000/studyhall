// Saving Nova's explanations as notes: your question, what Nova said (the answer and the lines it spoke while drawing)
// and pictures of the cards it drew, as a note in Studyhall's Notes, filed under the matching module. No AI call: it's
// put together here from what was said and drawn. Three ways in: "save that" (the save_explanation tool), the save
// icon on any card, or the auto-save setting (each explanation added to the day's "Nova notes" page).

import { getDb, getSetting, setSetting } from './db'
import { appendToNote, saveNote } from './notes'
import { getPrefs } from './prefs'
import { cardSavedHooks, cardSnapshots } from './roamiesTools'

type Explain = { at: number; question: string; said: string[]; drew: boolean; teaching: boolean; where: string; saved: boolean }
let current: Explain | null = null
let last: Explain | null = null

/** A request starts (novaBrain): the explanation before it is finished; auto-saved now if that's on. */
export function explainStart(question: string, where: string, teaching: boolean): void {
  if (current) finish(current)
  current = { at: Date.now(), question: question.trim(), said: [], drew: false, teaching, where, saved: false }
}
/** Something Nova said in this request (its answer, a drawing's lines). */
export function explainSaid(text: string): void {
  if (current && text) current.said.push(text) // (pieces as they stream: joined as they are)
}
export function explainDrew(): void {
  if (current) current.drew = true
}
/** The request is over (its drawing may still be playing): auto-save waits a little for the cards. */
export function explainEnd(): void {
  if (!current) return
  const e = current
  current = null
  last = e
  if (getPrefs().novaAutoNotes === true && e.drew && e.teaching) setTimeout(() => void autoSave(e), 9000)
}
function finish(e: Explain): void {
  last = e
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
/** The module this is about: one whose code or name is in the window title or the question. */
function moduleFor(e: Explain): string | null {
  const hay = `${e.where} ${e.question}`.toLowerCase()
  const mods = getDb().prepare('SELECT id, code, name FROM modules WHERE deleted_at IS NULL').all() as { id: string; code: string; name: string }[]
  return (mods.find((m) => m.code && hay.includes(m.code.toLowerCase())) ?? mods.find((m) => m.name.length > 3 && hay.includes(m.name.toLowerCase())))?.id ?? null
}
/** The note's text: what Nova said as paragraphs, then the cards as pictures. */
async function body(e: Explain, heading: boolean): Promise<{ md: string; cards: number }> {
  const cards = await cardSnapshots().catch(() => [])
  const said = e.said
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/([.!?])(?=[A-Z])/g, '$1 ') // (where the answer and a drawing's lines meet)
    .trim()
  // A paragraph every three sentences or so.
  const sentences = said.match(/[^.!?]+[.!?]+["')\]]*\s*/g) ?? [said]
  const paras: string[] = []
  for (let i = 0; i < sentences.length; i += 3)
    paras.push(
      sentences
        .slice(i, i + 3)
        .join('')
        .trim()
    )
  const when = new Date(e.at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })
  const md = [
    heading ? `## ${cap(e.question).slice(0, 120)}` : '',
    `*Nova · ${when}${e.where ? ` · ${e.where.slice(0, 80)}` : ''}*`,
    ...paras.filter(Boolean),
    ...(cards.length ? ['### Cards', ...cards.map((c) => `![${c.title.replace(/[[\]]/g, '')}](${c.data})`)] : [])
  ]
    .filter(Boolean)
    .join('\n\n')
  return { md, cards: cards.length }
}

/** "Save that" / Save on a card: the last explanation as its own note. */
export async function saveExplanation(title?: string): Promise<string> {
  const e = current?.said.length ? current : last
  if (!e || !e.said.join('').trim()) return 'There’s no explanation to save yet.'
  if (e.saved) return 'That one is already in Notes.'
  e.saved = true
  const b = await body(e, false)
  const n = saveNote(title?.trim() || cap(e.question).slice(0, 100), b.md, moduleFor(e))
  return `Saved to Notes as "${n.title}", with ${b.cards ? `a picture of ${b.cards === 1 ? 'the card' : `each of the ${b.cards} cards`} that were on screen` : 'no card pictures (none were on screen)'}.`
}

/** Auto-save: added to the day's "Nova notes" page (one note per day). */
async function autoSave(e: Explain): Promise<void> {
  if (e.saved || !e.said.length) return
  e.saved = true
  const day = new Date(e.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const key = getSetting<{ day: string; id: string }>('nova_notes_day')
  const id = key?.day === day ? key.id : null
  const exists = id ? getDb().prepare('SELECT 1 FROM notes WHERE id = ? AND deleted_at IS NULL').get(id) : null
  const { md } = await body(e, true)
  if (id && exists) appendToNote(id, md)
  else {
    const n = saveNote(`Nova notes · ${day}`, md, moduleFor(e))
    setSetting('nova_notes_day', { day, id: n.id })
  }
}

// Save on any card saves the whole explanation it belongs to (its picture still goes to Pictures\Nova cards too).
cardSavedHooks.saved = () => void saveExplanation()
