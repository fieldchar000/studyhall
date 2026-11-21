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
import { lineDrawn, speak, speechStream, warmBeats } from '@/lib/voice/speak'

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
        // (No longer opens the full-screen circle mode by itself: that's only ever your choice, Ctrl+Alt+B.)
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

// ---------- The router: what kind of request is this? ----------
// With Claude connected (PC), a quick Haiku call sorts each request, knowing which window you're in:
// so "show me how a tree grows" is a lesson, while "show me how to export this" is about your screen.

type RouteKind = 'action' | 'question' | 'teach' | 'screen_help' | 'screen_do' | 'draft' | 'ignore'
const ROUTE_SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['action', 'question', 'teach', 'screen_help', 'screen_do', 'draft', 'ignore'] },
    topic: { type: 'string' },
    wiki: { type: 'string' },
    onScreen: { type: 'boolean' }
  },
  required: ['kind', 'topic', 'wiki', 'onScreen'],
  additionalProperties: false
}
const ROUTE_SYSTEM = `You sort one spoken request to Nova, the assistant inside Studyhall (a study and life planner). Pick kind:
- action: change or open something in Studyhall (tasks, calendar, lectures, events, habits, journal, money, check-ins, timers, focus, flashcards) or open a website or app.
- question: a quick factual question with a short answer (a sum, a date, a one-line definition) or about the user's own Studyhall data.
- teach: the user wants to understand or learn something: "explain …", "how does … work", "why …", "show me how a tree grows", "teach me …". A topic, not how to use an app.
- screen_help: how to do something in the app or website on their screen, where something is on screen, or what something on screen means.
- screen_do: they ask Nova to click, type or change something in the app on screen for them.
- draft: write or draft a document, essay, letter, plan or notes.
- ignore: small talk, fragments, or not meant for Nova.
topic: for teach and question, the subject in a few words; otherwise "".
wiki: for teach, the exact title of the English Wikipedia article that best covers it (e.g. "Black hole", "Photosynthesis", "Tree"), or "" if none fits.
onScreen: for teach, true only if the window they're in is about that topic (e.g. they're reading its Wikipedia page); otherwise false.`

const ROUTE_EXAMPLES = `

Examples (window, request → kind, wiki, onScreen):
Window "Roamies - GitHub - Opera", request "show me how a tree grows" → teach | how trees grow | Tree | no
Window "Black hole - Wikipedia - Opera", request "explain how this works" → teach | black holes | Black hole | yes
Window "Document1 - Word", request "how do I export this as a PDF?" → screen_help | | | no
Window "Budget.xlsx - Excel", request "click save for me" → screen_do | | | no
Window "New Tab - Opera", request "where's the bookmarks button?" → screen_help | | | no
Window "YouTube - Opera", request "why is the sky blue?" → teach | why the sky is blue | Rayleigh scattering | no
Window "Studyhall", request "what's 12 times 60?" → question | 12 times 60 | | no
Window "Studyhall", request "move my gym session to six" → action | | | no
Window "Inbox - Outlook", request "draft a revision plan for chemistry" → draft | | | no`

let claudeOk: { at: number; ok: boolean } = { at: 0, ok: false }
async function claudeReady(): Promise<boolean> {
  if (Date.now() - claudeOk.at < 30_000) return claudeOk.ok
  let ok = false
  try {
    ok = (await api.claude.status()).signedIn
  } catch {
    ok = false
  }
  claudeOk = { at: Date.now(), ok }
  return ok
}

async function route(text: string): Promise<{ kind: RouteKind; topic: string; wiki: string; onScreen: boolean } | null> {
  if (!onPc() || !(await claudeReady())) return null
  const win = await api.eyes.window().catch(() => null)
  const raw = await api.ai.chat(
    [
      { role: 'system', content: ROUTE_SYSTEM + ROUTE_EXAMPLES },
      { role: 'user', content: `${win ? `Window they're in: "${win.title}" (${win.app})\n` : ''}Request: ${text}` }
    ],
    ROUTE_SCHEMA,
    200,
    'act'
  )
  const r = JSON.parse(raw) as { kind: RouteKind; topic: string; wiki: string; onScreen: boolean }
  return ['action', 'question', 'teach', 'screen_help', 'screen_do', 'draft', 'ignore'].includes(r.kind) ? r : null
}

/** Teach a topic live (cards, diagram, the key bit underlined), or the classic explain cards without Claude. */
async function teachTopic(topic: string, onScreen: boolean, said: string, source: 'voice' | 'typed' | 'pad', wiki = ''): Promise<{ reply: string; actions: BriefAction[]; logId: string | null; quiet?: boolean }> {
  const first = await api.eyes.teach(topic, onScreen, wiki).catch(() => null)
  if (first) {
    await logAnswer(said, `Teaching: ${topic}`, source)
    return { reply: first, actions: [], logId: null, quiet: true }
  }
  const reply = await explainTopic(topic)
  await logAnswer(said, reply, source)
  return { reply, actions: [], logId: null }
}

// ---------- Nova's conversation (PC, with Claude): one call does it all ----------
// The Roamies way: the request goes to ONE Claude call that has Nova's tools (Studyhall actions, your notes, lessons,
// your screen, cards, memory, files) and remembers the conversation. Its reply is spoken sentence by sentence while
// it's still being written. Studyhall's own actions run here, in this window, when it asks for them.

/** What Studyhall holds right now, for the <live-state> block (main adds the time, window and memory). */
function studyhallState(ctx: BriefContext, now: Date): string {
  const soon = ctx.events.filter((e) => Date.parse(e.start_at.length === 10 ? `${e.start_at}T00:00` : e.start_at) > now.getTime() - 2 * 864e5).slice(0, 40)
  return [
    `Today: ${ymd(now)} (weeks start on Monday)`,
    `Open tasks: ${ctx.tasks.slice(0, 40).map((t) => `"${t.title}"${t.due_at ? ` (due ${when(t.due_at)})` : ''}`).join('; ') || 'none'}`,
    `Events: ${soon.map((e) => `"${e.title}" ${when(e.start_at)}`).join('; ') || 'none'}`,
    `Habits: ${ctx.habits.map((h) => `"${h.name}"`).join('; ') || 'none'}`,
    `Modules: ${ctx.modules.map((m) => `${m.code} = ${m.name}`).join('; ') || 'none'}`,
    `Studyhall pages: ${SIMPLE_PAGES.join(', ')}`
  ].join('\n')
}

let sayListener = false
async function converse(text: string, source: 'voice' | 'typed' | 'pad', mode: Mode): Promise<{ reply: string; actions: BriefAction[]; logId: string | null; quiet: boolean; followUp: boolean; asking: boolean; patient?: boolean } | null> {
  if (!sayListener) {
    sayListener = true
    api.nova.onSay((t) => say(t)) // a walkthrough finishing later
    api.nova.onLineDrawn((id) => lineDrawn(id)) // (tutor mode: a drawing step is drawn, so its next line may be said)
  }
  const now = new Date()
  const ctx = await loadBriefContext()
  let actions: BriefAction[] = []
  let logId: string | null = null
  const stream = speechStream((t) => say(t))
  // Nothing said yet a moment after you stop talking: a short beat right away ("Mm-hmm.", "On it."), so there's
  // never a silence while Claude starts (it's skipped if the answer has already begun).
  const quickBeat = setTimeout(() => stream.beat(), 700)
  const offs = [
    { off: () => clearTimeout(quickBeat) }.off,
    api.nova.onSpeak((t) => stream.push(t)),
    api.nova.onBeat(() => stream.beat()),
    api.nova.onTool(async ({ id, name, input }) => {
      let out = ''
      try {
        if (name === 'actions') {
          const list = ((input as { actions?: AiAction[] })?.actions ?? []).filter((a) => a && TYPES.includes(a.type))
          const fresh = await loadBriefContext()
          const done = toActions(list, fresh, text, new Date())
          if (!done.length) out = 'Nothing was changed: no action matched (check the titles in <live-state>).'
          else {
            await fillMoveEnds(done)
            const { undo } = await applyBrief(done, mode)
            out = plainReply(done)
            actions = [...actions, ...done]
            logId = await writeLog(text, out, done, undo, source, 'ai')
          }
        } else if (name === 'materialText') {
          // A PDF or Word study file: its text (HTML files are read by the main process itself).
          const doc = await api.materials.read(String((input as { id?: string })?.id ?? ''))
          const { docToText } = await import('@/lib/importDoc') // (loaded only when needed: it brings the PDF reader)
          out = doc ? (await docToText(doc)).slice(0, 200_000) : ''
        } else if (name === 'notes') {
          const r = await findAnswer(String((input as { question?: string })?.question ?? text))
          out = r.found ? r.reply : 'Nothing about that in their Studyhall.'
        } else out = 'Unknown tool.'
      } catch (e) {
        out = `It failed: ${e instanceof Error ? e.message : String(e)}`
      }
      api.nova.toolResult(id, out)
    })
  ]
  void warmBeats()
  try {
    const r = await api.nova.turn(text, studyhallState(ctx, now))
    if (r.error && !r.text && !r.tools.length) {
      if (r.notice) paused = r.notice
      stream.push('')
      void stream.end()
      console.warn('Nova: the conversation failed, using the older way', r.error)
      return null
    }
    await stream.end().catch(() => {})
    const reply = r.text || (actions.length ? plainReply(actions) : '')
    if (!actions.length && reply) await logAnswer(text, reply, source)
    // A lesson or walkthrough is still talking: no follow-up listening on top of it.
    const followUp = !r.tools.some((t) => t === 'teach' || t === 'help_on_screen' || t === 'quiz')
    // A quiz is on (it asks one question per reply, sometimes ending on its options rather than a "?"): listen for
    // the answer after every reply until it's over (the score is given) or ten minutes pass.
    if (r.tools.includes('quiz_me')) quizUntil = Date.now() + 10 * 60_000
    if (quizUntil && /\b(?:final score|you got \d+ out of|that's the end of the quiz|quiz is over)\b/i.test(reply)) quizUntil = 0
    // (a lesson's check question: it waits longer for a spoken answer, with longer pauses while they think)
    const patient = r.tools.includes('check')
    const asking = patient || Date.now() < quizUntil || /\?["'”’)]*\s*$/.test(reply.trim())
    if (asking) markAsked()
    return { reply, actions, logId, quiet: true, followUp, asking, patient }
  } finally {
    for (const off of offs) off()
  }
}


// ---------- Simple commands, done on this PC (no Claude: instant, and it costs nothing) ----------
// Only requests that are clearly one of these, said plainly; anything else (or anything the rules don't fully read)
// goes to Nova's conversation as before.
const QUICK_STUDYHALL =
  /^(?:(?:please\s+)?(?:add|create|new|schedule)\s+(?:a\s+|an\s+|my\s+)?(?:task|to-?do|event|lecture|class|exam|deadline|meeting|tutorial|lab)\b|(?:mark|tick|complete|finish(?:ed)?)\b.+\b(?:done|complete|completed|finished)\b|(?:i\s+)?(?:log(?:ged)?|studied)\s+\d|(?:i\s+)?(?:spent|paid)\s+\$?\d|(?:move|reschedule|push)\b.+\b(?:to|until|till)\b|(?:cancel|delete|remove)\s+(?:my\s+|the\s+)?(?:task|event|class|lecture|meeting|tutorial|lab)\b)/i
const QUICK_KINDS = new Set(['task', 'task_done', 'task_move', 'task_cancel', 'event', 'event_move', 'event_cancel', 'log', 'habit', 'money', 'journal'])
const QUICK_REMIND = /^(?:please\s+)?(?:remind me|set (?:a|me a) reminder)\b/i
const QUICK_DUE = /^(?:what(?:'s| is)|anything|what do i have)\s+(?:due|on)(?:\s+(today|tomorrow))?\s*\??$/i

async function quickCommand(text: string, source: 'voice' | 'typed' | 'pad', mode: Mode): Promise<{ reply: string; actions: BriefAction[]; logId: string | null } | null> {
  const t = text.trim().replace(/[.!]+$/, '')
  // "What's due today?" / "what do I have on tomorrow?": from your own Studyhall.
  const due = QUICK_DUE.exec(t)
  if (due) {
    const ctx = await loadBriefContext()
    const day = new Date()
    if ((due[1] ?? 'today').toLowerCase() === 'tomorrow') day.setDate(day.getDate() + 1)
    const key = ymd(day)
    const tasks = ctx.tasks.filter((x) => x.due_at && ymd(new Date(x.due_at)) === key)
    const events = ctx.events.filter((x) => (x.start_at.length === 10 ? x.start_at : ymd(new Date(x.start_at))) === key)
    const label = key === ymd(new Date()) ? 'today' : 'tomorrow'
    const list = (xs: string[]): string => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)
    const parts = [
      tasks.length ? `due ${label}: ${list(tasks.slice(0, 6).map((x) => x.title))}` : '',
      events.length ? `on ${label}: ${list(events.slice(0, 6).map((x) => `${x.title}${x.start_at.length > 10 ? ` at ${new Date(x.start_at).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(':00', '').replace(' ', '')}` : ''}`))}` : ''
    ].filter(Boolean)
    const reply = parts.length ? `${parts.join('. ').replace(/^./, (c) => c.toUpperCase())}.` : `Nothing's due ${label}.`
    await logAnswer(text, reply, source)
    return { reply, actions: [], logId: null }
  }
  // "Remind me at 5 to call mum": straight onto Nova's own list (with a time; without one, Nova asks when).
  if (QUICK_REMIND.test(t)) {
    const ctx = await loadBriefContext()
    const asTask = parseBrief(t.replace(QUICK_REMIND, 'add a task').replace(/\bto\s+(?=\w)/i, ''), ctx, new Date()).find((a) => a.kind === 'task') as Extract<BriefAction, { kind: 'task' }> | undefined
    if (!asTask?.due) return null
    const d = new Date(asTask.due)
    if (d.getHours() === 23 && d.getMinutes() === 59) return null // a day without a time: let Nova ask
    const local = `${ymd(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    const title = asTask.title.replace(/^(?:a\s+)?task\s+/i, '').trim()
    if (title.length < 2) return null
    const ok = await api.nova.remember(title, local).catch(() => null)
    if (!ok) return null
    const when = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(':00', '').replace(' ', '')
    const reply = `Okay, I'll remind you ${ymd(d) === ymd(new Date()) ? '' : `on ${d.toLocaleDateString('en-GB', { weekday: 'long' })} `}at ${when}.`
    await logAnswer(text, reply, source)
    return { reply, actions: [], logId: null }
  }
  // Studyhall: tasks, events, study logs, habits, money, journal, read by Studyhall's own rules.
  if (QUICK_STUDYHALL.test(t)) {
    const ctx = await loadBriefContext()
    const actions = parseBrief(t, ctx, new Date()).filter((a) => a.on)
    if (!actions.length || actions.length > 3 || !actions.every((a) => QUICK_KINDS.has(a.kind))) return null
    await fillMoveEnds(actions)
    const { undo } = await applyBrief(actions, mode)
    const reply = plainReply(actions)
    const logId = await writeLog(text, reply, actions, undo, source, 'rules')
    return { reply, actions, logId }
  }
  return null
}

// Claude can't answer right now (the weekly cap, a limit, not connected): why, from the last try. Said out loud before
// the answer (at most once an hour, so it doesn't nag), and requests about the screen go to the eyes on this PC.
let paused: string | null = null
let pausedSaidAt = 0
let intro = ''
const ABOUT_SCREEN = /\b(explain|what am i looking at|what('s| is) (this|that)|this (slide|page|diagram|picture|graph|chart|question)|on my screen|confus)/i

/** Everything Nova hears goes through here: teach, explain, answer, look at your screen, or act. */
/** Nova has just asked them something (a question at the end of a reply, a quiz, its offer of one): for two minutes
 *  short replies ("yes please", "B", "the heart") are answers, not small talk to ignore. */
let askedAt = 0
let quizUntil = 0
export function markAsked(): void {
  askedAt = Date.now()
}
/** Nova is waiting on an answer from them right now (it asked something in the last two minutes, or a quiz is on). */
export const waitingOnThem = (): boolean => Date.now() < quizUntil || Date.now() - askedAt < 120_000

export async function handleSpeech(raw: string, source: 'voice' | 'typed' | 'pad', mode: Mode): Promise<{ reply: string; actions: BriefAction[]; logId: string | null; ignored?: boolean; quiet?: boolean; followUp?: boolean; asking?: boolean; patient?: boolean }> {
  paused = null
  intro = ''
  const r = await handleSpeechInner(raw, source, mode)
  if (intro && !r.ignored) return { ...r, reply: `${intro} ${r.reply}`.trim(), quiet: false }
  return r
}
async function handleSpeechInner(raw: string, source: 'voice' | 'typed' | 'pad', mode: Mode): Promise<{ reply: string; actions: BriefAction[]; logId: string | null; ignored?: boolean; quiet?: boolean; followUp?: boolean; asking?: boolean; patient?: boolean }> {
  const text = stripWake(raw)
  // Small talk, one word, half a sentence: say nothing, do nothing, log nothing.
  const nothing = { reply: source === 'typed' ? 'I didn’t find anything to do in that.' : '', actions: [] as BriefAction[], logId: null, ignored: true }
  // (Unless Nova has just asked them something: then "yes please", "B" or "the heart" is the answer.)
  if (isChitChat(text) && Date.now() - askedAt > 120_000) return nothing
  // Clear, simple commands are done right here, without Claude (instant, and free).
  if (onPc()) {
    const q = await quickCommand(text, source, mode).catch((e) => (console.warn('Nova: quick command failed', e), null))
    if (q) return q
  }
  // With Claude on the PC: the one-call conversation (fast, remembers, speaks as it goes).
  if (onPc() && (await claudeReady())) {
    const r = await converse(text, source, mode).catch((e) => (console.warn('Nova conversation:', e), null))
    if (r) return r
  }
  if (paused) {
    if (Date.now() - pausedSaidAt > 3600_000) {
      intro = paused
      pausedSaidAt = Date.now()
    }
    // "Explain this slide", "what am I looking at": the eyes on this PC look and talk you through it.
    if (onPc() && (ABOUT_SCREEN.test(text) || looksAtScreen(text))) {
      const said = await api.nova.offlineExplain(text).catch(() => null)
      if (said) {
        await logAnswer(text, said, source)
        return { reply: said, actions: [], logId: null }
      }
    }
  }
  // Clearly about Studyhall itself (tasks, calendar…)? Straight to the usual actions, no sorting needed.
  const studyhallWords = /\b(tasks?|to-?dos?|calendar|lectures?|deadlines?|exams?|assignments?|habits?|journal|remind(er)?s?|timer|focus session|budgets?|spent|grades?|flashcards?|decks?|inbox|check-?in)\b/i.test(text)
  // "Explain …" / "teach me …": clearly a lesson, so skip the sorting step (it saves ~2.5 s).
  const quickTopic = onPc() && !studyhallWords ? explainTopicFrom(text) : null
  if (quickTopic && !paused && (await claudeReady())) {
    const win = await api.eyes.window().catch(() => null)
    const words = quickTopic.toLowerCase().match(/[a-z]{4,}/g) ?? []
    const onScreen = !!win && words.some((w) => win.title.toLowerCase().includes(w.replace(/s$/, '')))
    return teachTopic(quickTopic, onScreen, text, source)
  }
  if (!studyhallWords) {
    const r = await route(text).catch((e) => (console.warn('Nova: sorting the request failed', e), null))
    if (r) {
      if (r.kind === 'ignore') return nothing
      if (r.kind === 'teach') return teachTopic(r.topic || text, r.onScreen, text, source, r.wiki)
      if (r.kind === 'screen_help' || r.kind === 'screen_do') {
        const said = await api.eyes.help(text, r.kind === 'screen_do').catch((e) => `I couldn’t look at your screen: ${e instanceof Error ? e.message : String(e)}`)
        if (said) {
          await logAnswer(text, said, source)
          return { reply: said, actions: [], logId: null }
        }
      }
      if (r.kind === 'draft') {
        const said = await api.claude.draft(text).catch((e) => `I couldn’t draft that: ${e instanceof Error ? e.message : String(e)}`)
        await logAnswer(text, said, source)
        return { reply: said, actions: [], logId: null }
      }
      if (r.kind === 'question') {
        const found = await findAnswer(text)
        const reply = found.found ? found.reply : ((await chatAnswer(text).catch(() => null)) ?? found.reply)
        await logAnswer(text, reply, source)
        return { reply, actions: [], logId: null }
      }
      // 'action' (and anything else): the usual Studyhall actions below.
      const done = await runBauer(text, { source, mode })
      if (done.actions.length) return { reply: done.reply, actions: done.actions, logId: done.logId }
    }
  }
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
