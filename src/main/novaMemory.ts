// Nova learns lasting facts about you by itself, the way Roamies does: every few exchanges (and straight away when you
// say "remember…"), a small side call reads the latest turns and picks out what's worth knowing in every future
// conversation. The instructions and the checks on what comes back are Roamies' own (brain.mjs: FACT_RULES,
// memoryPrompt, memoryInput, parseBrain; by Ken Kai, AGPL-3.0), copied here; nothing that looks like a password,
// code, card or account number is ever stored. Facts live in Roamies' memory store (userData/nova/sidekick).

import type { Prefs } from '@shared/types'
import { claudeChat } from './claude'
import { getPrefs } from './prefs'
import { roamies } from './roamiesTools'

type Fact = { id: string; text: string; createdAt?: number; updatedAt?: number }

// ---------- Roamies' brain.mjs (copied) ----------

const FACT_RULES = (name: string): string => `Facts are lasting things about ${name} worth knowing in every future conversation: who they are and what they do, their projects, goals, channels, apps and tools, the people they mention (and who those are), their preferences and how they like to work.
- Only what ${name} said themselves or clearly showed. Nothing guessed, nothing the assistant said or did.
- Not small talk, passing moods, questions they asked, one-off tasks, or anything tied to a date or time (reminders and commitments are kept elsewhere).
- Never secrets: no passwords, keys, codes, card, bank or account numbers.
- Skip anything ${name} asked to forget or said was wrong.
- One short sentence each, naming ${name}, under 200 characters.
- Return only facts that are new, or that change a current fact: then set "replaces" to that fact's id. Already known: leave it out. Nothing new: an empty list.`

const knownFacts = (facts: Fact[]): string => (facts.length ? facts.map((f) => `- ${f.id}: ${f.text}`).join('\n') : '(none yet)')

const memoryPrompt = (name: string): string => `You read a conversation between ${name} and their desktop companion and pick out what to remember about ${name}. You never talk to ${name}; you only write JSON.
Reply with one JSON object and nothing else: {"facts": [{"text": "...", "replaces": "f123"}]}.
${FACT_RULES(name)}`

const memoryInput = ({ facts, turns }: { facts: Fact[]; turns: string }): string => `Current facts (id: text):\n${knownFacts(facts)}\n\nConversation, oldest first:\n${turns}\n\nWrite the JSON now.`

// Things that look like secrets (card-like digit runs and named secrets) are never stored.
const SECRETISH = /\b(?:\d[ -]?){12,19}\b|\b(?:password|passcode|passphrase|pin code|api key|secret key|access token|2fa code|one-time code)\b/i
const KEYISH = /\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/

function parseBrain(text: string, knownIds: string[]): { text: string; replaces?: string }[] {
  const raw = String(text ?? '').replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '')
  const a = raw.indexOf('{')
  const b = raw.lastIndexOf('}')
  if (a < 0 || b < a) throw new Error('no JSON in the reply')
  const j = JSON.parse(raw.slice(a, b + 1)) as { facts?: unknown[] }
  const known = new Set(knownIds)
  return (Array.isArray(j.facts) ? j.facts : [])
    .flatMap((f) => {
      const o = f as { text?: string; replaces?: string } | string
      const t = (typeof o === 'string' ? o : (o?.text ?? '')).replace(/\s+/g, ' ').trim()
      if (t.length < 3 || t.length > 240 || SECRETISH.test(t) || KEYISH.test(t)) return []
      const replaces = typeof o !== 'string' && typeof o?.replaces === 'string' && known.has(o.replaces) ? o.replaces : undefined
      return [replaces ? { text: t, replaces } : { text: t }]
    })
    .slice(0, 20)
}

// ---------- Nova's side ----------

const turns: { said: string; reply: string }[] = []
let sinceLast = 0
let running: Promise<void> | null = null

/** One finished exchange. Every 6 (or now, when they asked Nova to remember something), a memory pass runs. */
export function noteExchange(said: string, reply: string, name: string): void {
  turns.push({ said: said.slice(0, 2000), reply: reply.slice(0, 2000) })
  if (turns.length > 12) turns.splice(0, turns.length - 12)
  sinceLast++
  if (sinceLast >= 12 || /\bremember\b|\bdon'?t forget\b|\bkeep in mind\b/i.test(said)) void memoryPass(name)
}

/** The conversation is ending (closed, or "new conversation"): learn from what's left. */
export function memoryOnEnd(name: string): void {
  if (sinceLast) void memoryPass(name)
}

export async function memoryPass(name: string): Promise<void> {
  if (running) return running
  const window = turns.slice(-Math.max(sinceLast, 2))
  if (!window.length) return
  sinceLast = 0
  running = (async () => {
    const store = (await roamies()) && (await import('./roamies/store.mjs'))
    const facts = store.listFacts() as Fact[]
    const transcript = window.map((t) => `${name}: ${t.said}\nAssistant: ${t.reply}`).join('\n')
    const p: Prefs = getPrefs()
    const raw = await claudeChat(
      [
        { role: 'system', content: memoryPrompt(name) },
        { role: 'user', content: memoryInput({ facts, turns: transcript }) }
      ],
      undefined,
      p,
      'act'
    )
    for (const f of parseBrain(raw, facts.map((x) => x.id))) {
      if (f.replaces) await store.forgetFact(f.replaces)
      await store.addFact(f.text)
    }
  })()
    .catch((e) => console.warn('Nova memory:', e instanceof Error ? e.message : e))
    .finally(() => {
      running = null
    })
  return running
}

/** Facts for Nova's page (and Forget). */
export async function listNovaFacts(): Promise<{ id: string; text: string; at: string }[]> {
  await roamies()
  const store = await import('./roamies/store.mjs')
  return (store.listFacts() as Fact[]).map((f) => ({ id: f.id, text: f.text, at: new Date(f.updatedAt ?? f.createdAt ?? Date.now()).toISOString() }))
}
export async function forgetNovaFactById(id: string): Promise<{ id: string; text: string; at: string }[]> {
  await roamies()
  const store = await import('./roamies/store.mjs')
  await store.forgetFact(id)
  return listNovaFacts()
}
