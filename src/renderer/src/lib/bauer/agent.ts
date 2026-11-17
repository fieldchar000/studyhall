// Hands-free Bauer: understand what you said, do it straight away, write it in the Bauer log
// (with Undo), and say what was done. On the PC a local AI model understands normal speech;
// without it (or on the pad) the offline rules in lib/brief.ts do the understanding.

import type { BauerLogEntry, Mode, UndoStep } from '@shared/types'
import { describe, findDuration, normaliseNumbers, parseBrief, similarity, splitClauses, type BriefAction, type BriefContext } from '@/lib/brief'
import { applyBrief, loadBriefContext, undoSteps } from '@/lib/briefApply'
import { api, db } from '@/lib/data'
import { SIMPLE_PAGES } from '@/lib/nav'
import { buildBrain } from '@/lib/brain'
import { ask } from '@/lib/brainAsk'
import { isPhoneApp } from '@/lib/platform'
import { explainTopic, explainTopicFrom } from './explain'
import { grounded, isChitChat, stripWake } from './heard'
import { readCheckin } from '@/lib/brief'
import { speak } from '@/lib/voice/speak'

/** Cards, circling and apps exist only on the PC. */
const onPc = (): boolean => !isPhoneApp()
const APP_LIST = ['spotify', 'calculator', 'notepad', 'file explorer', 'settings', 'camera', 'clock', 'calendar', 'mail', 'photos', 'snipping tool']

export interface BauerResult {
  reply: string
  actions: BriefAction[]
  count: number
  logId: string | null
  brain: 'ai' | 'rules'
}

/** Can Nova think with an AI right now? (Claude when connected, or the model on this PC.) */
export async function aiInstalled(): Promise<boolean> {
  try {
    if ((await api.claude.status()).signedIn) return true
  } catch {
    /* the pad has no Claude connection */
  }
  try {
    return (await api.ai.status()).installed
  } catch {
    return false // the pad has no local AI
  }
}

const COMMAND = /\b(add|remind|put|schedule|book|move|push|shift|reschedule|cancel|delete|remove|drop|log|mark|tick|finish|done|open|pull up|show|set|create|note|spent|paid|bought|got|studied|revised)\b/i
const QUESTION = /^(what|when|where|who|which|how|why|is|are|am|do|does|did|have|has|tell me|any)\b/i
export const isQuestion = (t: string): boolean => (QUESTION.test(t.trim()) || /\?\s*$/.test(t)) && !COMMAND.test(t.replace(/^(can|could|would|will) you\s+/i, ''))

// ---------- Understanding with the local AI ----------

const TYPES = ['add_task', 'complete_task', 'delete_task', 'change_task_date', 'add_event', 'move_event', 'cancel_event', 'log_study', 'tick_habit', 'money', 'journal', 'checkin', 'inbox', 'open_website', 'open_page', 'explain', 'look_at_screen', 'open_app'] as const
type AiAction = {
  type: (typeof TYPES)[number]
  title?: string
  target?: string
  date?: string
  time?: string
  end_time?: string
  minutes?: number
  shift_minutes?: number
  amount?: number
  flow?: 'expense' | 'income'
  category?: string
  text?: string
  url?: string
  page?: string
  module?: string
  mood?: number
  energy?: number
  sleep?: number
}

const SCHEMA = {
  type: 'object',
  properties: {
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: TYPES },
          title: { type: 'string' },
          target: { type: 'string' },
          date: { type: 'string' },
          time: { type: 'string' },
          end_time: { type: 'string' },
          minutes: { type: 'integer' },
          shift_minutes: { type: 'integer' },
          amount: { type: 'number' },
          flow: { type: 'string', enum: ['expense', 'income'] },
          category: { type: 'string' },
          text: { type: 'string' },
          url: { type: 'string' },
          page: { type: 'string' },
          module: { type: 'string' },
          mood: { type: 'integer' },
          energy: { type: 'integer' },
          sleep: { type: 'number' }
        },
        required: ['type']
      }
    },
    reply: { type: 'string' }
  },
  required: ['actions', 'reply']
}

const pad = (n: number): string => String(n).padStart(2, '0')
const ymd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const hhmm = (d: Date): string => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const when = (iso: string): string => {
  const d = new Date(iso.length === 10 ? `${iso}T00:00` : iso)
  return iso.length === 10 ? `${ymd(d)} (all day)` : `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${ymd(d)} ${hhmm(d)}`
}

function systemPrompt(ctx: BriefContext, now: Date): string {
  const soon = ctx.events.filter((e) => Date.parse(e.start_at.length === 10 ? `${e.start_at}T00:00` : e.start_at) > now.getTime() - 2 * 864e5).slice(0, 40)
  return [
    'You are Bauer, the assistant inside Studyhall (a study and life planner). Turn what the user says into actions. Do them; never ask questions.',
    `Now: ${now.toLocaleDateString('en-GB', { weekday: 'long' })} ${ymd(now)} ${hhmm(now)}. Weeks start on Monday.`,
    'Dates are YYYY-MM-DD and times HH:MM (24h). Work out "tomorrow", "Friday", "next week", "tonight" from now. "Friday" means the next Friday.',
    '',
    'Action types:',
    '- add_task: title, optional date/time (deadline), module. Also for promises and reminders ("I\'ll send Sam the notes tomorrow" → task "Send Sam the notes", tomorrow 09:00).',
    '- complete_task / delete_task: target = the task\'s title from OPEN TASKS.',
    '- change_task_date: target, new date/time, or shift_minutes to move it by an amount.',
    '- add_event: title, date, time, end_time or minutes (default 60), module.',
    '- move_event: target = title from EVENTS (use the one on the day they mean), date (the day it is on now if they only change the time), and either a new time or shift_minutes. "Push back an hour" / "an hour later" = shift_minutes 60; "bring forward 30 minutes" / "earlier" = shift_minutes -30.',
    '- cancel_event: target.',
    '- log_study: minutes studied, module or text = subject, date (default today).',
    '- tick_habit: target = habit name from HABITS, date.',
    '- money: amount, flow (expense/income), category (e.g. Food & drink, Transport, Shopping, Bills, Fun, Other), text = what for.',
    '- journal: text to add to today\'s journal.',
    '- checkin: mood 1-5, energy 1-5, sleep hours, text = best part of the day.',
    '- inbox: text, for anything else worth keeping.',
    '- open_website: url (full https link; for a topic use a search link like https://www.google.com/search?q=… or https://www.youtube.com/results?search_query=…), title = what it is.',
    `- open_page: page = one of ${SIMPLE_PAGES.join(', ')}.`,
    '- explain: text = the topic, when they want something explained or taught ("explain black holes", "teach me integration").',
    '- look_at_screen: when they want you to look at something on their screen ("what\'s this", "look at this", "help me with this question").',
    `- open_app: text = one of ${APP_LIST}.`,
    '',
    'reply: one short, friendly sentence saying what you did, as Bauer ("Done. Gym is at 7 on Thursday."). If nothing to do, say so.',
    'IMPORTANT: only act on clear requests. Small talk, half sentences, thinking out loud, talking to someone else, or exclamations ("oh god", "okay", "thank you", "can you") mean actions: []. Never copy the examples, never guess values (moods, sleep, amounts, dates) that weren\'t said, and never put text in the journal or inbox unless asked to.',
    '',
    `OPEN TASKS: ${ctx.tasks.slice(0, 40).map((t) => `"${t.title}"${t.due_at ? ` (due ${when(t.due_at)})` : ''}`).join('; ') || 'none'}`,
    `EVENTS: ${soon.map((e) => `"${e.title}" ${when(e.start_at)}`).join('; ') || 'none'}`,
    `HABITS: ${ctx.habits.map((h) => `"${h.name}"`).join('; ') || 'none'}`,
    `MODULES: ${ctx.modules.map((m) => `${m.code} = ${m.name}`).join('; ') || 'none'}`
  ].join('\n')
}

/** Two worked examples, dated from today, so the model sees the exact format. */
function examples(now: Date): { role: 'user' | 'assistant'; content: string }[] {
  const next = (dow: number): string => {
    const d = new Date(now)
    d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7 || 7))
    return ymd(d)
  }
  const tomorrow = ymd(new Date(now.getTime() + 864e5))
  return [
    { role: 'user', content: 'move my gym on thursday to 7pm and add a chem past paper friday at 4. oh and I spent 12 on lunch' },
    {
      role: 'assistant',
      content: JSON.stringify({
        actions: [
          { type: 'move_event', target: 'Gym', date: next(4), time: '19:00' },
          { type: 'add_event', title: 'Chem past paper', date: next(5), time: '16:00', minutes: 60 },
          { type: 'money', amount: 12, flow: 'expense', category: 'Food & drink', text: 'Lunch' }
        ],
        reply: 'Done. Gym is at 7 on Thursday, a chem past paper is on Friday at 4, and lunch is logged.'
      })
    },
    { role: 'user', content: 'push my tutorial on monday back half an hour. I told Mum I would call her tomorrow evening. and open my flashcards' },
    {
      role: 'assistant',
      content: JSON.stringify({
        actions: [
          { type: 'move_event', target: 'Tutorial', date: next(1), shift_minutes: 30 },
          { type: 'add_task', title: 'Call Mum', date: tomorrow, time: '19:00' },
          { type: 'open_page', page: 'flashcards' }
        ],
        reply: 'Done. Your tutorial is 30 minutes later, I’ll remind you to call Mum tomorrow at 7, and here are your flashcards.'
      })
    }
  ]
}

function localIso(date: string | undefined, time: string | undefined, fallbackTime: string): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const t = time && /^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, '0') : fallbackTime
  const d = new Date(`${date}T${t}`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** "push the lecture back an hour" → +60; "bring it forward 30 minutes" → -30; a clock time or no amount → null. */
export function spokenShift(said: string, title: string): number | null {
  const clauses = splitClauses(said)
  const c = clauses.find((x) => similarity(title, x) > 0.2 && /\b(back|later|postpone|delay|forward|earlier|sooner)\b/i.test(x)) ?? (clauses.length === 1 ? clauses[0] : null)
  if (!c) return null
  if (/\b\d{1,2}(:\d{2})?\s*(am|pm|o'?clock)\b|\b\d{1,2}:\d{2}\b|\b(noon|midday|midnight)\b/i.test(c)) return null
  const dir = /\b(forward|earlier|sooner)\b/i.test(c) ? -1 : /\b(back|later|postpone|delay)\b/i.test(c) ? 1 : 0
  const mins = findDuration(normaliseNumbers(c.replace(/\ban hour\b/i, '1 hour').replace(/\bhalf an hour\b/i, '30 minutes')))?.value
  return dir && mins ? dir * mins : null
}

function best<T>(items: T[], name: (t: T) => string, q: string | undefined, extra?: (t: T) => number): T | null {
  if (!q) return null
  let top: T | null = null
  let score = 0.34
  for (const it of items) {
    const s = similarity(q, name(it)) + (extra?.(it) ?? 0)
    if (s > score) {
      score = s
      top = it
    }
  }
  return top
}

function toActions(list: AiAction[], ctx: BriefContext, said: string, now: Date): BriefAction[] {
  const out: BriefAction[] = []
  const common = (): { key: string; on: boolean; said: string } => ({ key: `ai${out.length}`, on: true, said })
  const mod = (q?: string): string | null => (q ? (ctx.modules.find((m) => m.code.toLowerCase() === q.toLowerCase()) ?? best(ctx.modules, (m) => `${m.code} ${m.name}`, q))?.id ?? null : null)
  const today = ymd(now)
  for (const a of list) {
    switch (a.type) {
      case 'add_task':
        if (a.title) out.push({ ...common(), kind: 'task', title: a.title, due: localIso(a.date, a.time, '23:59'), moduleId: mod(a.module) })
        break
      case 'complete_task':
      case 'delete_task':
      case 'change_task_date': {
        const t = best(ctx.tasks, (x) => x.title, a.target || a.title)
        if (!t) break
        if (a.type === 'complete_task') out.push({ ...common(), kind: 'task_done', id: t.id, title: t.title })
        else if (a.type === 'delete_task') out.push({ ...common(), kind: 'task_cancel', id: t.id, title: t.title })
        else {
          const shifted = a.shift_minutes && t.due_at && !a.time ? new Date(Date.parse(t.due_at) + a.shift_minutes * 60_000).toISOString() : null
          out.push({ ...common(), kind: 'task_move', id: t.id, title: t.title, due: shifted ?? localIso(a.date, a.time, '23:59') })
        }
        break
      }
      case 'add_event': {
        const start = localIso(a.date, a.time, '09:00')
        if (!a.title || !start) break
        const endIso = localIso(a.date, a.end_time, '')
        const end = endIso && endIso > start ? endIso : new Date(Date.parse(start) + (a.minutes || 60) * 60_000).toISOString()
        out.push({ ...common(), kind: 'event', title: a.title, start, end, allDay: false, moduleId: mod(a.module) })
        break
      }
      case 'move_event':
      case 'cancel_event': {
        // Prefer the event on the day they mention, if any.
        const sameDay = (e: BriefContext['events'][number]): number => (a.date && e.start_at.length > 10 && ymd(new Date(e.start_at)) === a.date ? 0.3 : 0)
        const e = best(ctx.events, (x) => x.title, a.target || a.title, sameDay)
        if (!e) break
        if (a.type === 'cancel_event') {
          out.push({ ...common(), kind: 'event_cancel', id: e.id, title: e.title, start: e.start_at })
          break
        }
        const old = new Date(e.start_at.length === 10 ? `${e.start_at}T09:00` : e.start_at)
        // "Push back an hour": move by an amount (keeping the day unless they named another).
        // Small models mix up "back" and "forward", so the direction and amount come from your words when they're clear.
        const shift = spokenShift(said, e.title) ?? a.shift_minutes
        const shifted = shift && (spokenShift(said, e.title) != null || !a.time) ? new Date(old.getTime() + shift * 60_000) : null
        const start = shifted && (!a.date || a.date === ymd(old)) ? shifted.toISOString() : localIso(a.date ?? ymd(old), a.time ?? hhmm(shifted ?? old), hhmm(old))
        if (!start) break
        out.push({ ...common(), kind: 'event_move', id: e.id, title: e.title, start, end: '' })
        break
      }
      case 'log_study': {
        const minutes = Math.round(a.minutes ?? 0)
        if (minutes > 0) out.push({ ...common(), kind: 'log', minutes, subject: a.module || a.text || a.title || 'Study', moduleId: mod(a.module || a.text), date: a.date || today })
        break
      }
      case 'tick_habit': {
        const h = best(ctx.habits, (x) => x.name, a.target || a.title || a.text)
        if (h) out.push({ ...common(), kind: 'habit', id: h.id, name: h.name, date: a.date || today })
        break
      }
      case 'money':
        if (a.amount && a.amount > 0) out.push({ ...common(), kind: 'money', amount: a.amount, flow: a.flow === 'income' ? 'income' : 'expense', category: a.category || 'Other', note: a.text || a.title || '', date: a.date || today })
        break
      case 'journal':
        if (a.text) out.push({ ...common(), kind: 'journal', text: a.text, date: a.date || today })
        break
      case 'checkin': {
        // Only the numbers you actually said (the AI can't make up a mood or sleep).
        const c = readCheckin(said)
        if (c) out.push({ ...common(), kind: 'checkin', date: a.date || today, mood: c.mood, energy: c.energy, sleep: c.sleep, highlight: c.highlight, gratitude: c.gratitude })
        break
      }
      case 'inbox':
        if (a.text || a.title) out.push({ ...common(), kind: 'inbox', text: a.text || a.title! })
        break
      case 'open_website':
        if (a.url && /^https?:\/\/\S+$/i.test(a.url)) out.push({ ...common(), kind: 'open_url', url: a.url, label: a.title || '' })
        break
      case 'open_page':
        if (a.page && SIMPLE_PAGES.includes(a.page)) out.push({ ...common(), kind: 'open_page', page: a.page, label: a.page[0].toUpperCase() + a.page.slice(1) })
        break
      case 'explain': {
        // The topic comes from your words, not the AI's own explanation.
        const topic = explainTopicFrom(said) ?? (a.text || a.title || '')
        if (onPc() && topic && topic.length <= 80) out.push({ ...common(), kind: 'explain', topic })
        break
      }
      case 'look_at_screen':
        if (onPc()) out.push({ ...common(), kind: 'circle' })
        break
      case 'open_app': {
        const name = (a.text || a.title || '').toLowerCase()
        if (onPc() && APP_LIST.includes(name)) out.push({ ...common(), kind: 'open_app', name })
        break
      }
    }
  }
  return out
}

/** Moving an event keeps how long it was. */
async function fillMoveEnds(actions: BriefAction[]): Promise<void> {
  for (const a of actions) {
    if (a.kind !== 'event_move') continue
    const e = await api.get('events', a.id)
    const dur = e && e.start_at.length > 10 ? Math.max(15 * 60_000, Date.parse(e.end_at) - Date.parse(e.start_at)) : 60 * 60_000
    a.end = new Date(Date.parse(a.start) + dur).toISOString()
  }
}

async function understandWithAi(text: string, ctx: BriefContext, now: Date): Promise<{ actions: BriefAction[]; reply: string }> {
  const raw = await api.ai.chat(
    [
      { role: 'system', content: systemPrompt(ctx, now) },
      ...examples(now),
      { role: 'user', content: text }
    ],
    SCHEMA,
    undefined,
    'act'
  )
  const parsed = JSON.parse(raw) as { actions: AiAction[]; reply: string }
  // Keep only what your words actually ask for.
  const kept = (parsed.actions ?? []).filter((a) => grounded(a, text))
  if (kept.length < (parsed.actions ?? []).length) console.info('Bauer: dropped unsupported actions', (parsed.actions ?? []).filter((a) => !kept.includes(a)))
  return { actions: toActions(kept, ctx, text, now), reply: String(parsed.reply ?? '') }
}

// ---------- Doing it ----------

const listOf = (xs: string[]): string => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
/** What Bauer says back, built from what was actually done (so times are always right). */
function plainReply(actions: BriefAction[]): string {
  if (!actions.length) return 'I didn’t find anything to do in that.'
  const bit = (a: BriefAction): string => {
    const d = describe(a)
    const when = d.detail ? ` (${d.detail})` : ''
    switch (a.kind) {
      case 'task':
        return `added “${a.title}”${when}`
      case 'task_done':
        return `ticked off “${a.title}”`
      case 'task_cancel':
        return `removed “${a.title}”`
      case 'task_move':
        return `moved “${a.title}” to ${d.detail}`
      case 'event':
        return `put ${a.title} in your calendar, ${d.detail}`
      case 'event_cancel':
        return `cancelled ${a.title}`
      case 'event_move':
        return `moved ${a.title} ${d.detail}`
      case 'log':
        return `logged ${d.verb.replace(/^Log /, '')} of ${a.subject}`
      case 'habit':
        return `ticked ${a.name}`
      case 'money':
        return a.flow === 'income' ? `noted ${a.amount} coming in from ${(a.note || a.category).toLowerCase()}` : `noted ${a.amount} spent on ${(a.note || a.category).toLowerCase()}`
      case 'journal':
        return 'added that to your journal'
      case 'checkin':
        return 'saved your check-in'
      case 'inbox':
        return 'put that in your Inbox'
      case 'open_url':
        return `opened ${a.label || 'the website'}`
      case 'open_page':
        return `opened ${a.label}`
      case 'explain':
        return `put some cards about ${a.topic} beside your screen`
      case 'circle':
        return 'froze your screen — circle what you mean'
      case 'open_app':
        return `opened ${a.name}`
    }
  }
  const parts = actions.slice(0, 4).map(bit)
  const s = `Done. I ${listOf(parts)}${actions.length > 4 ? `, and ${actions.length - 4} more` : ''}.`
  return s.replace(/\s+/g, ' ')
}

/** Understand and act. Nothing to confirm: everything goes in the Bauer log, where it can be undone. */
export async function runBauer(text: string, opts: { source: 'voice' | 'typed' | 'pad'; mode: Mode }): Promise<BauerResult> {
  const now = new Date()
  const ctx = await loadBriefContext()
  let actions: BriefAction[] = []
  let reply = ''
  let brain: 'ai' | 'rules' = 'rules'
  if (await aiInstalled()) {
    try {
      const r = await understandWithAi(text, ctx, now)
      actions = r.actions
      reply = r.reply
      brain = 'ai'
    } catch (e) {
      console.warn('Bauer: the local AI failed, using the rules instead', e)
    }
  }
  if (brain === 'rules') actions = parseBrief(text, ctx, now).filter((a) => a.on && a.kind !== 'inbox') // (the rules used to drop anything unclear into the Inbox)
  if (!actions.length) return { reply: '', actions, count: 0, logId: null, brain }
  await fillMoveEnds(actions)
  const { count, undo } = await applyBrief(actions, opts.mode)
  // The AI's own sentence can get times wrong; say what was really done.
  reply = plainReply(actions)
  const logId = await writeLog(text, reply, actions, undo, opts.source, brain)
  return { reply, actions, count, logId, brain }
}

async function writeLog(said: string, reply: string, actions: BriefAction[], undo: UndoStep[], source: string, brain: string): Promise<string | null> {
  try {
    const row = await db.create('bauer_log', {
      said,
      reply,
      actions: JSON.stringify(actions.map((a) => describe(a))),
      undo: JSON.stringify(undo),
      source,
      brain
    })
    return row.id
  } catch (e) {
    console.error('Bauer: could not write the log', e)
    return null
  }
}

/** Undo everything one log entry did. */
export async function undoLog(entry: BauerLogEntry): Promise<void> {
  if (entry.undone_at) return
  let steps: UndoStep[] = []
  try {
    steps = JSON.parse(entry.undo) as UndoStep[]
  } catch {
    /* nothing to undo */
  }
  await undoSteps(steps)
  await db.update('bauer_log', entry.id, { undone_at: new Date().toISOString() })
}

/** Answer a question from everything you've saved (the Brain), and log it. */
export async function answerQuestion(text: string, source: 'voice' | 'typed' | 'pad'): Promise<string> {
  const { reply } = await findAnswer(text)
  await logAnswer(text, reply, source)
  return reply
}

async function findAnswer(text: string): Promise<{ reply: string; found: boolean }> {
  const a = ask(await buildBrain(), text)
  const lines = a.lines
    .slice(0, 3)
    .map((l) => `${l.text}${l.sub ? `, ${l.sub}` : ''}`.replace(/\s+/g, ' ').replace(/\s·\s/g, ', ').trim())
    .filter(Boolean)
  // A plain word search isn't an answer ("Results for …" from a stray word).
  const found = lines.length > 0 && !/^results for\b/i.test(a.title)
  const reply = found ? `${a.title}. ${lines.join('. ')}`.replace(/\.\./g, '.') : 'I don’t know that one yet.'
  return { reply, found }
}

/** Everything Bauer hears goes through here: explain, answer from your notes, or act. */
export async function handleSpeech(raw: string, source: 'voice' | 'typed' | 'pad', mode: Mode): Promise<{ reply: string; actions: BriefAction[]; logId: string | null; ignored?: boolean }> {
  const text = stripWake(raw)
  // Small talk, one word, half a sentence: say nothing, do nothing, log nothing.
  const nothing = { reply: source === 'typed' ? 'I didn’t find anything to do in that.' : '', actions: [] as BriefAction[], logId: null, ignored: true }
  if (isChitChat(text)) return nothing
  // "Draft a document about…" with your Claude connectors (only when you've switched that on).
  if (onPc() && wantsDocument(text)) {
    const prefs = await api.prefs.get()
    if (prefs.novaConnectors) {
      const said = await api.claude.draft(text).catch((e) => `I couldn’t draft that: ${e instanceof Error ? e.message : String(e)}`)
      await logAnswer(text, said, source)
      return { reply: said, actions: [], logId: null }
    }
  }
  // About the app on your screen ("where's export?", "how do I save this as a PDF?")? Look and point.
  if (onPc() && (looksAtScreen(text) || wantsHands(text))) {
    const said = await api.eyes.help(text, wantsHands(text)).catch((e) => `I couldn’t look at your screen: ${e instanceof Error ? e.message : String(e)}`)
    if (said) {
      await logAnswer(text, said, source)
      return { reply: said, actions: [], logId: null }
    }
  }
  const topic = onPc() ? explainTopicFrom(text) : null
  if (topic) {
    const reply = await explainTopic(topic)
    await logAnswer(text, reply, source)
    return { reply, actions: [], logId: null }
  }
  if (isQuestion(text)) {
    const r = await findAnswer(text)
    // Nothing in your own notes? On the PC, look it up and pin cards instead.
    const what = /^(?:what|who)(?:'s| is| are| was| were)\s+(?:a |an |the )?(.+?)[?.!]*$/i.exec(text.trim())?.[1]
    let reply = r.reply
    if (!r.found) {
      if (what && onPc()) reply = await explainTopic(what)
      else reply = (await chatAnswer(text).catch(() => null)) ?? r.reply
    }
    await logAnswer(text, reply, source)
    return { reply, actions: [], logId: null }
  }
  const r = await runBauer(text, { source, mode })
  if (!r.actions.length) return nothing
  return { reply: r.reply, actions: r.actions, logId: r.logId }
}

/** Is this about what's on your screen (rather than your tasks, calendar or notes)? */
export function looksAtScreen(t: string): boolean {
  // Drop a leading "Hey Nova," first.
  const s = t.toLowerCase().replace(/^\W*(hey|hi|okay|ok)\W+\w+\W*/, '').trim()
  // Things Studyhall itself keeps: those go to the usual actions and answers.
  if (/\b(tasks?|to-?dos?|calendar|lectures?|deadlines?|exams?|assignments?|habits?|journal|remind(er)?s?|timer|focus|budgets?|spent|grades?|flashcards?|decks?|inbox|check-?in|my notes?)\b/.test(s)) return false
  return (
    /\b(on (my|the|this) screen|this (page|window|app|site|website|document|doc|file|button|menu|tab|box|field|thing|bit|part|error|message|option|setting|chart|table|cell|slide|link|icon|code|graph)|that (button|menu|tab|option|icon|link)|in (this|the) (app|window|page|document))\b/.test(s) ||
    /^(how (do|can|would|should) i|where('s| is| are| do i| can i)|which (button|menu|option|tab)|show me (how|where)|walk me through|help me (find|with this)|what (does|do) (this|that|these)|what('s| is) (this|that)\b|explain (this|that)\b|(click|press|tap) )/.test(s)
  )
}

/** "Draft a document about…", "write me an essay plan in Claude Docs" (uses your connectors when allowed). */
export function wantsDocument(t: string): boolean {
  const s = t.toLowerCase()
  return /\b(draft|write|make|create|start|put together)\b.{0,40}\b(doc|docs|document|essay|report|letter|cover letter|outline|plan|summary)\b/.test(s) || /\bin (claude )?docs\b/.test(s)
}

/** Is this asking Nova to do something in the app on screen ("click export", "type my name in the search box")? */
export function wantsHands(t: string): boolean {
  const s = t.toLowerCase().replace(/^\W*(hey|hi|okay|ok)\W+\w+\W*/, '').trim()
  if (/\b(tasks?|to-?dos?|calendar|lectures?|habits?|journal|remind(er)?s?|timer|focus|budgets?|flashcards?|inbox|check-?in)\b/.test(s)) return false
  return (
    /^(please |can you |could you |now )?(click|press|tap|hit|type|enter|fill (in|out)|tick|untick|check|uncheck|select|choose|pick|turn (on|off)|switch (on|off|to)|expand|collapse|open the \w+ (menu|tab|settings)|go to the \w+ (tab|page|menu))\b/.test(s) ||
    /\b(do it|do that|do this) for me\s*[.!?]*$/.test(s) ||
    /\bfor me\s*[.!?]*$/.test(s)
  )
}

/** A short spoken answer from Claude, for questions your own notes can't answer. */
async function chatAnswer(text: string): Promise<string | null> {
  try {
    if (!(await api.claude.status()).signedIn) return null
  } catch {
    return null // the pad has no Claude connection
  }
  const name = (await api.prefs.get()).novaName ?? 'Nova'
  const raw = await api.ai.chat(
    [
      {
        role: 'system',
        content: `You are ${name}, a friendly assistant built into Studyhall, a study and life planner. Today is ${new Date().toDateString()}. Your reply is spoken out loud: answer in one to three short sentences of plain speech, with no markdown, lists or emoji.`
      },
      { role: 'user', content: text }
    ],
    undefined,
    400,
    'chat'
  )
  return raw.trim() || null
}

/** Log a spoken answer to a question (nothing changed, so nothing to undo). */
export async function logAnswer(said: string, reply: string, source: 'voice' | 'typed' | 'pad'): Promise<void> {
  await writeLog(said, reply, [], [], source, 'rules')
}

/** Nova talks back: its own voice (Kokoro) when installed, otherwise the voice built into Windows / Android. */
export function say(text: string): void {
  void speak(text)
    .then((ok) => {
      if (!ok) sayWithSystemVoice(text)
    })
    .catch(() => sayWithSystemVoice(text))
}

function sayWithSystemVoice(text: string): void {
  try {
    if (!('speechSynthesis' in window) || !text) return
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text.replace(/[^\p{L}\p{N}\p{P}\s£$€]/gu, ''))
    const v = speechSynthesis.getVoices().find((x) => /en[-_](GB|AU|US)/i.test(x.lang) && /male|ryan|george|guy|david|mark/i.test(x.name)) ?? speechSynthesis.getVoices().find((x) => /^en/i.test(x.lang))
    if (v) u.voice = v
    u.rate = 1.04
    speechSynthesis.speak(u)
  } catch {
    /* no voice available */
  }
}
