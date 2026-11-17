// "Brief Bauer": turn a spoken briefing into a checklist of changes.
//  "Add a task to finish the lab report by Friday. I studied anatomy for two hours.
//   I spent 12 dollars on lunch. Cancel my gym session tomorrow."
// becomes: ➕ task (due Fri) · ⏱️ 2h of Anatomy · 💸 12 on Food & drink · ❌ the Gym event.
// Nothing is applied here; the review screen shows the list and the user confirms.
// Offline and rule based: patterns for the common requests, fuzzy matching against
// your own tasks, events, habits and modules, and chrono-node for dates ("next Tuesday at 3").

import * as chrono from 'chrono-node'

export interface BriefContext {
  tasks: { id: string; title: string; due_at: string | null }[] // open tasks
  events: { id: string; title: string; start_at: string; all_day: number }[] // recent + upcoming
  habits: { id: string; name: string; emoji: string }[]
  modules: { id: string; code: string; name: string }[]
}

interface Common {
  key: string
  on: boolean // ticked in the review list
  said: string // the words this came from
  warn?: string
}
export type BriefAction = Common &
  (
    | { kind: 'task'; title: string; due: string | null; moduleId: string | null }
    | { kind: 'task_done'; id: string; title: string }
    | { kind: 'task_cancel'; id: string; title: string }
    | { kind: 'event'; title: string; start: string; end: string; allDay: boolean; moduleId: string | null }
    | { kind: 'event_cancel'; id: string; title: string; start: string }
    | { kind: 'log'; minutes: number; subject: string; moduleId: string | null; date: string }
    | { kind: 'habit'; id: string; name: string; date: string }
    | { kind: 'money'; amount: number; flow: 'expense' | 'income'; category: string; note: string; date: string }
    | { kind: 'journal'; text: string; date: string }
    | { kind: 'checkin'; date: string; mood?: number; energy?: number; sleep?: number; highlight?: string; gratitude?: string }
    | { kind: 'inbox'; text: string }
    | { kind: 'event_move'; id: string; title: string; start: string; end: string }
    | { kind: 'task_move'; id: string; title: string; due: string | null }
    | { kind: 'open_url'; url: string; label: string }
    | { kind: 'open_page'; page: string; label: string }
    | { kind: 'explain'; topic: string }
    | { kind: 'circle' }
    | { kind: 'open_app'; name: string }
  )
export type BriefKind = BriefAction['kind']

// ---------- Small helpers ----------

const pad = (n: number): string => String(n).padStart(2, '0')
const ymd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
const squash = (s: string): string => s.replace(/\s+/g, ' ').trim()
/** Trim stray little words and punctuation from both ends of a phrase. */
const tidy = (s: string): string => {
  let t = squash(s).replace(/^[\s,.:;!?-]+|[\s,.:;!?-]+$/g, '')
  const EDGE = /^(?:and|to|for|on|at|in|by|from|the|a|an|my|of|about|that|this|please|due|until|before|with)\s+|\s+(?:and|to|for|on|at|in|by|from|the|a|an|my|of|please|due|until|before|with|then|too|as well|today|tonight)$/i
  for (let i = 0; i < 6 && EDGE.test(t); i++) t = t.replace(EDGE, '').trim()
  return t.replace(/^[\s,.:;!?-]+|[\s,.:;!?-]+$/g, '')
}
let keySeq = 0
const nextKey = (): string => `b${++keySeq}`

// ---------- Numbers said as words ----------

const SMALL: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19
}
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 }
const NUM_WORD = `(?:${[...Object.keys(TENS)].join('|')})(?:[\\s-](?:${Object.keys(SMALL).slice(1, 10).join('|')}))?|${Object.keys(SMALL).join('|')}|a hundred|hundred|a couple of|a couple|a few`
const UNIT = '(?:hours?|hrs?|minutes?|mins?|dollars?|bucks|pounds?|quid|euros?|cents?|ringgit|days?|weeks?|o\'?clock|a\\.?m\\.?|p\\.?m\\.?)'

function wordValue(w: string): number {
  const s = w.toLowerCase().replace(/-/g, ' ')
  if (s === 'a hundred' || s === 'hundred') return 100
  if (s.startsWith('a couple')) return 2
  if (s === 'a few') return 3
  const [a, b] = s.split(/\s+/)
  return (TENS[a] ?? SMALL[a] ?? 0) + (b ? (SMALL[b] ?? 0) : 0)
}

/** Spelled-out numbers to digits where they're quantities or times ("two hours", "at five"). */
export function normaliseNumbers(text: string): string {
  let t = ` ${text} `
  // Fractions of an hour first.
  t = t
    .replace(/\b(?:an|one|1) hour and a half\b/gi, '90 minutes')
    .replace(new RegExp(`\\b(\\d+|${NUM_WORD}) and a half hours?\\b`, 'gi'), (_m, n: string) => `${(/^\d+$/.test(n) ? +n : wordValue(n)) + 0.5} hours`)
    .replace(/\bhalf an hour\b/gi, '30 minutes')
    .replace(/\b(?:a )?quarter of an hour\b/gi, '15 minutes')
  const word = new RegExp(`\\b(${NUM_WORD})(?=\\s*(?:and a half\\s+)?${UNIT}\\b)`, 'gi')
  t = t.replace(word, (m) => String(wordValue(m)))
  t = t.replace(/\b(\d+(?:\.\d+)?) and a half (hours?)\b/gi, (_m, n: string, u: string) => `${+n + 0.5} ${u}`)
  t = t.replace(new RegExp(`\\b(at|by|from|until|till|to)\\s+(${NUM_WORD})(?:[\\s-](thirty|fifteen|forty[\\s-]five|o'?clock))?\\b`, 'gi'), (m, p: string, n: string, mins?: string) => {
    const h = wordValue(n)
    if (!h || h > 23) return m
    const mm = mins ? (/thirty/i.test(mins) ? ':30' : /fifteen/i.test(mins) ? ':15' : /forty/i.test(mins) ? ':45' : '') : ''
    return `${p} ${h}${mm}`
  })
  // Whisper writes "at 3.30" for half past three.
  t = t.replace(/\b(at|by|from|until|till|to)\s+(\d{1,2})\.(\d{2})\b/gi, '$1 $2:$3')
  t = t.replace(/\ban hour\b/gi, '1 hour').replace(/\ba minute\b/gi, '1 minute')
  return squash(t)
}

// ---------- Durations and amounts ----------

interface Found<T> {
  value: T
  text: string
}

export function findDuration(s: string): Found<number> | null {
  let m = /\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b(?:\s*(?:and\s+)?(\d+)\s*(?:minutes?|mins?|m)\b)?/i.exec(s)
  if (m) return { value: Math.round(parseFloat(m[1]) * 60 + (m[2] ? +m[2] : 0)), text: m[0] }
  m = /\b(\d+)\s*(?:minutes?|mins?)\b/i.exec(s)
  if (m) return { value: +m[1], text: m[0] }
  return null
}

const CURRENCY = String.raw`(?:dollars?|bucks|sgd|usd|gbp|aud|cad|nzd|eur|pounds?|quid|euros?|ringgit|rm|yen|won|rupees?)`
export function findAmount(s: string): Found<number> | null {
  let m = new RegExp(String.raw`(?:s\$|us\$|a\$|c\$|\$|£|€|¥|₹|\brm)\s?(\d[\d,]*(?:\.\d{1,2})?)`, 'i').exec(s)
  if (m) return { value: parseFloat(m[1].replace(/,/g, '')), text: m[0] }
  m = new RegExp(String.raw`\b(\d[\d,]*(?:\.\d{1,2})?)\s?${CURRENCY}(?:\s+(?:and\s+)?(\d{1,2})(?:\s*cents?)?)?\b`, 'i').exec(s)
  if (m) return { value: parseFloat(m[1].replace(/,/g, '')) + (m[2] ? +m[2] / 100 : 0), text: m[0] }
  m = /\b(\d{1,2})\s*cents?\b/i.exec(s)
  if (m) return { value: +m[1] / 100, text: m[0] }
  return null
}

// ---------- Fuzzy matching against your own things ----------

const MATCH_STOP = new Set(
  'a an the my our your his her their to of for on in at by with and or is are was be it this that these those i me we you task tasks event events reminder session thing stuff today tomorrow tonight yesterday next this week morning afternoon evening night please just also all some about up out off do did done go went going get got have had has'.split(' ')
)
const IRREGULAR: Record<string, string> = {
  ran: 'run', running: 'run', jogged: 'run', jog: 'run', jogging: 'run', went: 'go', slept: 'sleep', wrote: 'write', drank: 'drink', ate: 'eat', took: 'take',
  workout: 'gym', workouts: 'gym', exercise: 'gym', exercised: 'gym', lifting: 'gym', lifted: 'gym', meditation: 'meditate', meditated: 'meditate', meditating: 'meditate',
  reading: 'read', studying: 'study', studied: 'study', revised: 'revise', revising: 'revise', revision: 'revise', swam: 'swim', swimming: 'swim', walked: 'walk', walking: 'walk',
  cancelled: 'cancel', canceled: 'cancel'
}
function stem(w: string): string {
  const x = w.toLowerCase()
  if (IRREGULAR[x]) return IRREGULAR[x]
  let s = x.replace(/(?:ations?|ings?|ed|es|s)$/, (m) => (x.length - m.length >= 3 ? '' : m))
  if (/([bcdfgklmnprstz])\1$/.test(s)) s = s.slice(0, -1)
  return s
}
export function tokens(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+(?:'[a-z]+)?/g) ?? []).filter((w) => !MATCH_STOP.has(w)).map(stem)
}
const same = (a: string, b: string): boolean => a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)))

/** 0..1: how well the words of `query` cover the words of `title` (and vice versa). */
export function similarity(query: string, title: string): number {
  const q = [...new Set(tokens(query))]
  const t = [...new Set(tokens(title))]
  if (!q.length || !t.length) return 0
  const hit = t.filter((w) => q.some((v) => same(v, w))).length
  if (!hit) return 0
  const dice = (2 * hit) / (q.length + t.length)
  const cover = hit / t.length // all of the title's words were said
  return Math.max(dice, cover * 0.85)
}

function bestModule(text: string, ctx: BriefContext): { id: string; name: string } | null {
  const low = ` ${text.toLowerCase()} `
  for (const m of ctx.modules) if (m.code && new RegExp(`\\b${m.code.replace(/\s+/g, '\\s*').toLowerCase()}\\b`).test(low)) return { id: m.id, name: m.name || m.code }
  let best: { id: string; name: string } | null = null
  let score = 0
  for (const m of ctx.modules) {
    const s = similarity(text, m.name)
    if (s > score && tokens(m.name).every((w) => tokens(text).some((v) => same(v, w)))) {
      score = s
      best = { id: m.id, name: m.name || m.code }
    }
  }
  return best
}

// ---------- Dates ----------

interface DateHit {
  date: Date
  end: Date | null
  hasTime: boolean
  text: string
}
function findDate(s: string, now: Date, forward = true): DateHit | null {
  const r = chrono.parse(s, now, { forwardDate: forward })
  if (!r.length) return null
  const first = r[0]
  // "in 2 hours" right after a duration is usually "for 2 hours" misheard; ignore bare numbers.
  if (/^\d+$/.test(first.text.trim())) return null
  // "at 3:30" with no am/pm: 1–7 o'clock is nearly always the afternoon.
  let date = first.start.date()
  let end = first.end ? first.end.date() : null
  const h = date.getHours()
  if (first.start.isCertain('hour') && !first.start.isCertain('meridiem') && h >= 1 && h <= 7) {
    date = new Date(date.getTime() + 12 * 3600_000)
    if (end && !first.end?.isCertain('meridiem') && end.getHours() <= 11) end = new Date(end.getTime() + 12 * 3600_000)
  }
  return {
    date,
    end,
    hasTime: first.start.isCertain('hour'),
    text: r.map((x) => x.text).join(' ')
  }
}
const without = (s: string, part: string | undefined): string => {
  if (!part) return s
  const i = s.toLowerCase().indexOf(part.toLowerCase())
  return i < 0 ? s : `${s.slice(0, i)} ${s.slice(i + part.length)}`
}
const removeDates = (s: string, hit: DateHit | null): string => {
  if (!hit) return s
  let out = s
  for (const p of hit.text.split(' ').length > 1 ? [hit.text, ...hit.text.split(/\s(?=(?:at|on|in|by|next|this|tomorrow|today|tonight)\b)/)] : [hit.text]) out = without(out, p)
  return out.replace(/\b(?:by|due|on|at|for|before|until|from)\s*(?=[,.]|$)/gi, '')
}
/** A date in the past or today (for things you already did). */
function pastDay(s: string, now: Date): string {
  if (/\byesterday\b/i.test(s)) return ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
  const hit = /\b(?:last|on)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.exec(s)
  if (hit) {
    const d = findDate(hit[0], now, false)?.date
    if (d && d <= now) return ymd(d)
  }
  return ymd(now)
}
const endOfDayIso = (d: Date): string => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59).toISOString()

// ---------- Money categories ----------

const CATEGORY_WORDS: [string, RegExp][] = [
  ['Groceries', /\b(?:groceries|grocery|supermarket|fairprice|ntuc|cold storage|giant|tesco|sainsbury|aldi|lidl|walmart)\b/i],
  ['Food & drink', /\b(?:lunch|dinner|breakfast|brunch|food|meal|coffee|tea|bubble tea|boba|snacks?|drinks?|kopi|hawker|restaurant|cafe|takeaway|takeout|mcdonald'?s|kfc|pizza|sushi|supper|grabfood|foodpanda|deliveroo)\b/i],
  ['Transport', /\b(?:grab|gojek|taxi|cab|uber|bus|mrt|train|metro|tube|petrol|gas|fuel|parking|ez-?link|transport|fare|flight)\b/i],
  ['Rent', /\b(?:rent|landlord|hostel|dorm)\b/i],
  ['Bills', /\b(?:bills?|electricity|water bill|internet|wifi|phone bill|utilities)\b/i],
  ['Subscriptions', /\b(?:subscription|netflix|spotify|disney|youtube premium|icloud|chatgpt|membership)\b/i],
  ['Fun', /\b(?:movies?|cinema|concert|games?|steam|party|bar|club|karaoke|outing|tickets?)\b/i],
  ['Shopping', /\b(?:clothes|shirt|shoes|shopping|shopee|lazada|amazon|taobao|uniqlo|bag|dress|jeans)\b/i],
  ['Study', /\b(?:books?|textbook|stationery|notebook|pens?|printing|course|tuition|exam fee|calculator)\b/i],
  ['Health', /\b(?:medicine|pharmacy|doctor|clinic|dentist|gym membership|vitamins|guardian|watsons|hospital)\b/i],
  ['Gifts', /\b(?:gifts?|present|flowers|birthday)\b/i]
]
const INCOME_WORDS: [string, RegExp][] = [
  ['Job', /\b(?:salary|wage|wages|pay ?check|paid me|got paid|work|shift|tutoring|freelance)\b/i],
  ['Allowance', /\b(?:allowance|pocket money|parents|mum|mom|dad)\b/i],
  ['Student loan', /\b(?:loan|bursary|scholarship|grant)\b/i],
  ['Gift', /\b(?:gift|ang ?pao|red packet|birthday money)\b/i]
]
const pickCategory = (s: string, list: [string, RegExp][], fallback: string): string => list.find(([, re]) => re.test(s))?.[0] ?? fallback

// ---------- Splitting a briefing into requests ----------

const LEAD =
  /^(?:(?:ok(?:ay)?|so|um+|uh+|er+|erm|right|alright|well|and|also|then|plus|oh|hey|hi|hello|yeah|yes|now|next|after that|lastly|finally|first(?:ly)?|second(?:ly)?|third(?:ly)?|anyway|actually|basically|please|can you|could you|would you|will you|i want you to|i'd like you to|i would like you to|i'd like to|i want to|go ahead and|let's)\b[\s,]*)+/i
const WAKE = /^\s*(?:(?:hey|hi|ok(?:ay)?|hello|yo)[\s,]+)?(?:bauer|bower|power|bowser|brower|bauers|our)\b[\s,.!:]*/i
const VERBS = 'add|cancel|remind|log|delete|remove|mark|tick|schedule|book|put|create|make|set|spent|paid|bought|studied|worked|revised|practi[cs]ed|went|did|finished|completed|submitted|need|have to|i|i\'ve|i\'m|i\'ll|move|note|journal|got|earned|received|had|ran|read'
const SPLIT_AND = new RegExp(String.raw`(?:,\s*|\s+)(?:and\s+then|and\s+also|and|then|also|plus|after that)\s+(?=(?:${VERBS})\b)`, 'i')
const SPLIT_COMMA = new RegExp(String.raw`,\s+(?=(?:${VERBS})\b)`, 'i')
const END_WORDS = new Set("that's thats that is it all thanks thank you cheers done bye over ok okay cool great yeah yes no um uh umm nothing else for now please bauer good".split(' '))
const isEnding = (c: string): boolean => (c.toLowerCase().match(/[a-z']+/g) ?? []).every((w) => END_WORDS.has(w))

export function splitClauses(text: string): string[] {
  const t = text
    .replace(WAKE, '')
    .replace(/\b([ap])\.\s?m\b\.?/gi, '$1m')
    .replace(/\b(Dr|Mr|Mrs|Ms|Prof|St|vs|etc)\./gi, '$1')
  const out: string[] = []
  for (const sentence of t.split(/(?<=[.!?;])\s+|\n+|(?<=[a-z])\.(?=\s|$)/i)) {
    let parts = [sentence]
    for (const re of [SPLIT_AND, SPLIT_COMMA]) parts = parts.flatMap((p) => p.split(re))
    for (const p of parts) {
      const c = squash(p.replace(WAKE, '').replace(LEAD, '').replace(/[.!?;,]+$/, ''))
      if (c) out.push(c)
    }
  }
  // Glue little fragments ("On Friday", "Tomorrow") onto the next request.
  const glued: string[] = []
  for (let i = 0; i < out.length; i++) {
    const c = out[i]
    if (i < out.length - 1 && c.split(' ').length <= 3 && !new RegExp(`^(?:${VERBS})\\b`, 'i').test(c) && !isEnding(c)) out[i + 1] = `${c} ${out[i + 1]}`
    else glued.push(c)
  }
  return glued.filter((c) => !isEnding(c) && c.replace(/[^a-z0-9]/gi, '').length > 1)
}

// ---------- Understanding one request ----------

const EVENT_NOUN =
  /\b(?:meeting|meetup|appointment|appt|class|lecture|tutorial|seminar|lab session|call|zoom|dinner|lunch|breakfast|brunch|party|exam|test|quiz|interview|date|match|game|practice|training|rehearsal|concert|movie|film|flight|trip|wedding|dentist|doctor|check-?up|haircut|presentation|viva|session|shift|consultation|talk|workshop|event)\b/i
const TASK_PREFIX =
  /^(?:(?:add|create|make|put|new|set|write down)\s+(?:a\s+|an\s+|another\s+)?(?:new\s+)?(?:task|to-?do|todo|reminder|item)\s*(?:to|for|called|:)?\s*|remind me (?:to|that|about)\s+|i (?:need to|have to|got to|gotta|must|should|ought to|'ve got to|have got to|'ll need to)\s+|don'?t (?:let me )?forget (?:to\s+)?|(?:add|put)\s+(?=.+\b(?:to|on|onto) (?:my |the )?(?:to-?do |task )?list\b))/i
const EVENT_PREFIX =
  /^(?:(?:add|create|make|put|schedule|book|set up|plan|arrange)\s+(?:a\s+|an\s+)?(?:new\s+)?(?:(?:calendar\s+)?event\s*(?:called|for|about|:)?\s*)?|(?:i(?:'ve| have)?(?: got)?|there(?:'s| is)|we(?:'ve| have)(?: got)?)\s+(?:a|an|my|the)\s+(?=.*\b(?:on|at|tomorrow|today|tonight|next|this|from)\b))/i
const CANCEL =
  /^(?:cancel|delete|remove|scrap|drop|call off|clear|get rid of|forget about|take off|take out|unschedule|bin)\s+(.+)|^(?:i'?m|i am) not (?:going to|gonna|doing|attending)\s+(.+?)(?:\s+any ?more)?$|^(.+?)\s+(?:is|was|has been|got)\s+(?:cancelled|canceled|called off|off)$|^(?:i (?:can't|cannot|won't) (?:make|go to|attend))\s+(.+)/i
const DONE =
  /^(?:mark|tick(?: off)?|check off|cross off)\s+(.+?)(?:\s+as)?(?:\s+(?:done|complete|completed|finished))?$|^(?:i(?:'ve| have)?\s+)?(?:just\s+)?(?:finished|completed|submitted|handed in|done with|turned in|sent off)\s+(.+)|^(.+?)\s+is\s+(?:done|finished|complete|submitted)$/i
const IS_ON = /\b(?:is|are|'s)\s+(?:on|at|this|next|tomorrow|today|tonight)\b/i
const JOURNAL =/^(?:note(?: that| down)?|journal|diary|dear diary|write (?:down|in my journal)|for (?:my|the) journal|add to (?:my|the) journal)\b[:,]?\s*(.+)/i
const LOG_VERB =
  /\b(?:studied|study|worked|work|revised|revise|practi[cs]ed|practi[cs]e|read|reviewed|focused|coded|wrote|went over|learned|learnt|log(?:ged)?|did|spent|put in|trained|prepped|prepared|researched|drilled|revision|got)\b/i
const MONEY_VERB = /\b(?:spent|spend|paid|pay|bought|buy|cost|costs|was|were|got|earned|received|made|cashed|lent|owe|for)\b/i
const HABIT_HINT = /\b(?:did|done|went|had|took|completed|check(?:ed)?(?: off)?|tick(?:ed)?(?: off)?|log(?:ged)?|habit|ran|meditated|read|walked|swam|slept|drank|journaled|stretched|practi[cs]ed)\b/i

function matchHabit(clause: string, ctx: BriefContext): BriefContext['habits'][number] | null {
  const said = tokens(clause)
  let best: BriefContext['habits'][number] | null = null
  let bestScore = 0
  for (const h of ctx.habits) {
    const words = tokens(h.name)
    if (!words.length) continue
    const hit = words.filter((w) => said.some((v) => same(v, w))).length
    const score = hit / words.length
    if (score >= (words.length > 2 ? 0.66 : 1) && score > bestScore) {
      best = h
      bestScore = score
    }
  }
  return best
}

function bestOf<T extends { title: string }>(target: string, list: T[], bonus: (x: T) => number = () => 0): { item: T; score: number } | null {
  let best: { item: T; score: number } | null = null
  for (const item of list) {
    const s = similarity(target, item.title) + bonus(item)
    if (s > (best?.score ?? 0)) best = { item, score: s }
  }
  return best && best.score >= 0.5 ? best : null
}

function understand(raw: string, ctx: BriefContext, now: Date): BriefAction | null {
  const said = raw
  const c = normaliseNumbers(raw)
  const base = { key: nextKey(), on: true, said }

  // 1) Journal
  const jm = JOURNAL.exec(c)
  if (jm) return { ...base, kind: 'journal', text: cap(tidy(jm[1])), date: pastDay(c, now) }

  // 1b) Daily check-in: "I'm feeling about a four", "energy is low", "slept 7 hours", "highlight was…"
  const ci = readCheckin(c)
  if (ci) return { ...base, kind: 'checkin', date: pastDay(c, now), ...ci }

  // 2) Cancel something
  const cm = CANCEL.exec(c)
  if (cm) {
    const target = (cm[1] ?? cm[2] ?? cm[3] ?? cm[4] ?? '').trim()
    const when = findDate(target, now)
    const subject = tidy(removeDates(target, when).replace(/\b(?:the|my|that|this|our)\b|\b(?:task|event|reminder|plans?)\b/gi, ' '))
    const sameDay = (iso: string): boolean => !!when && ymd(new Date(iso.length === 10 ? `${iso}T00:00` : iso)) === ymd(when.date)
    const ev = bestOf(subject || target, ctx.events.map((e) => ({ ...e, title: e.title })), (e) => (sameDay(e.start_at) ? 0.25 : when ? -0.1 : 0))
    const tk = bestOf(subject || target, ctx.tasks)
    if (ev && (!tk || ev.score >= tk.score)) return { ...base, kind: 'event_cancel', id: ev.item.id, title: ev.item.title, start: ev.item.start_at }
    if (tk) return { ...base, kind: 'task_cancel', id: tk.item.id, title: tk.item.title }
    return { ...base, on: false, kind: 'inbox', text: cap(c), warn: `Couldn't find "${subject || target}" to cancel` }
  }

  // 3) A new task said with "remind me to…", "I need to…", "add a task…"
  const taskLead = TASK_PREFIX.exec(c)
  const eventLead = !taskLead ? EVENT_PREFIX.exec(c) : null

  // 4) Money
  const amount = findAmount(c)
  if (amount && !taskLead && (MONEY_VERB.test(c) || /^\S+\s+(?:was|cost)/i.test(c))) {
    const income = /\b(?:earned|got paid|received|income|salary|made|paid me|allowance|refund|cashed)\b/i.test(c)
    let note = without(c, amount.text)
      .replace(/\b(?:i|i've|we)\b|\b(?:spent|spend|paid|pay|bought|buy|cost|costs|earned|received|made|got paid|got|was|were|today|yesterday|on|for|from|at|about|around|roughly|like|just|a total of)\b/gi, ' ')
    note = tidy(note)
    const flow = income ? 'income' : 'expense'
    return {
      ...base,
      kind: 'money',
      amount: Math.round(amount.value * 100) / 100,
      flow,
      category: income ? pickCategory(c, INCOME_WORDS, 'Other income') : pickCategory(c, CATEGORY_WORDS, 'Other'),
      note: cap(note),
      date: pastDay(c, now)
    }
  }

  // 5) Time spent studying / working
  const dur = findDuration(c)
  const habit = matchHabit(c, ctx)
  if (dur && !taskLead && !eventLead && (LOG_VERB.test(c) || /^log\b/i.test(c)) && !(habit && !/\b(?:stud|revis|work)/i.test(c))) {
    const mod = bestModule(c, ctx)
    let subject = without(c, dur.text)
      .replace(/\b(?:i|i've|i have|we)\b|\b(?:log(?:ged)?|studied|study|worked|work|revised|revise|practi[cs]ed|practi[cs]e|read|reviewed|focused|coded|wrote|went over|learned|learnt|did|spent|put in|trained|prepped|prepared|researched|drilled|revision|got|done|today|yesterday|this morning|this afternoon|this evening|tonight|for|on|of|doing|some|about|around|roughly|like|just|hours?|minutes?)\b/gi, ' ')
    subject = tidy(subject)
    return { ...base, kind: 'log', minutes: Math.max(1, Math.min(16 * 60, dur.value)), subject: cap(subject || mod?.name || 'Study'), moduleId: mod?.id ?? null, date: pastDay(c, now) }
  }

  // 6) Done: "I finished the lab report", "mark essay as done"
  const dm = !taskLead ? DONE.exec(c) : null
  if (dm) {
    const target = tidy((dm[1] ?? dm[2] ?? dm[3] ?? '').replace(/\b(?:the|my|that|this)\b|\btask\b/gi, ' '))
    const tk = bestOf(target, ctx.tasks)
    if (tk) return { ...base, kind: 'task_done', id: tk.item.id, title: tk.item.title }
    if (habit) return { ...base, kind: 'habit', id: habit.id, name: habit.name, date: pastDay(c, now) }
  }

  // 7) Habits: "I went to the gym", "did my meditation"
  if (habit && !taskLead && !eventLead && (HABIT_HINT.test(c) || tokens(c).length <= tokens(habit.name).length + 1)) {
    const future = findDate(c, now)
    if (!future || future.date <= new Date(now.getTime() + 60_000) || /\b(?:today|this morning|yesterday)\b/i.test(c)) return { ...base, kind: 'habit', id: habit.id, name: habit.name, date: pastDay(c, now) }
  }

  // 8) Events: something at a time / with an event word
  const when = findDate(c, now)
  if (!taskLead && when && (eventLead || (EVENT_NOUN.test(c) && (when.hasTime || /^(?:add|put|schedule|book)\b/i.test(c) || IS_ON.test(c))))) {
    const span = findDuration(without(c, when.text))
    let title = c.replace(EVENT_PREFIX, '').replace(/\s+(?:is|are|'s)\s+(?=(?:on|at|this|next|tomorrow|today|tonight)\b)/i, ' ')
    title = removeDates(title, when)
    if (span) title = without(title, span.text)
    title = tidy(title.replace(/\b(?:to|in|on|into) (?:my|the) (?:calendar|diary|schedule)\b/gi, ' ').replace(/^(?:an?\s+)?(?:event|calendar event)\s+(?:called|for|about)?\s*/i, ''))
    const mod = bestModule(c, ctx)
    const start = when.date
    if (!when.hasTime) {
      const d = ymd(start)
      const next = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1)
      return { ...base, kind: 'event', title: cap(title || 'Event'), start: d, end: ymd(next), allDay: true, moduleId: mod?.id ?? null }
    }
    const end = when.end && when.end > start ? when.end : new Date(start.getTime() + (span ? span.value : 60) * 60_000)
    return { ...base, kind: 'event', title: cap(title || 'Event'), start: start.toISOString(), end: end.toISOString(), allDay: false, moduleId: mod?.id ?? null }
  }

  // 9) Tasks
  const looksLikeTask = taskLead || /^(?:add|create|make|put|new|set|write down)\b/i.test(c) || /^(?:buy|call|email|text|message|finish|start|submit|send|pay|book|pick up|return|print|clean|wash|reply|ask|check|study|revise|read|write|prepare|practi[cs]e|review|fix|sign|renew|order|cook|plan)\b/i.test(c)
  if (looksLikeTask) {
    let title = taskLead ? c.slice(taskLead[0].length) : c.replace(/^(?:add|create|make|put|new|set|write down)\s+(?:a\s+|an\s+)?/i, '')
    title = title.replace(/\b(?:to|on|onto) (?:my |the )?(?:to-?do |task )?list\b|\bto (?:my |the )?tasks\b|\bas a task\b/gi, ' ')
    title = removeDates(title, when)
    title = tidy(title)
    if (!title) return null
    const due = when ? (when.hasTime ? when.date.toISOString() : endOfDayIso(when.date)) : null
    const mod = bestModule(c, ctx)
    return { ...base, kind: 'task', title: cap(title), due, moduleId: mod?.id ?? null }
  }

  // 10) Anything else goes to the Inbox so nothing is lost.
  if (c.split(' ').length < 2) return null
  return { ...base, kind: 'inbox', text: cap(c) }
}

/** The whole briefing → reviewable actions. */
export function parseBrief(text: string, ctx: BriefContext, now = new Date()): BriefAction[] {
  const out: BriefAction[] = []
  for (const clause of splitClauses(text)) {
    const a = understand(clause, ctx, now)
    if (!a) continue
    // Several check-in sentences about the same day become one check-in.
    const prev = a.kind === 'checkin' ? out.find((b): b is Extract<BriefAction, { kind: 'checkin' }> => b.kind === 'checkin' && b.date === a.date) : undefined
    if (prev && a.kind === 'checkin') {
      Object.assign(prev, Object.fromEntries(Object.entries(a).filter(([k, v]) => v !== undefined && !['key', 'said', 'on', 'kind'].includes(k))))
      prev.said = `${prev.said}. ${a.said}`
      continue
    }
    // The same thing twice (people repeat themselves) → keep one.
    if (out.some((b) => JSON.stringify({ ...b, key: 0, said: 0 }) === JSON.stringify({ ...a, key: 0, said: 0 }))) continue
    out.push(a)
  }
  return out
}

// ---------- Daily check-in ----------

const MOOD_WORDS: [RegExp, number][] = [
  [/\b(?:amazing|fantastic|awesome|brilliant|great|excellent|wonderful|really good|very good|happy)\b/i, 5],
  [/\b(?:good|pretty good|nice|well|positive|content)\b/i, 4],
  [/\b(?:okay|ok|alright|fine|so-so|not bad|average|meh then)\b/i, 3],
  [/\b(?:meh|tired|stressed|low|down|bit off|not great|anxious|worn out|flat)\b/i, 2],
  [/\b(?:awful|terrible|horrible|really bad|very bad|sad|miserable|depressed|exhausted)\b/i, 1]
]
const ENERGY_WORDS: [RegExp, number][] = [
  [/\b(?:very high|really high|full of energy|buzzing|energetic|pumped)\b/i, 5],
  [/\b(?:high|good|decent)\b/i, 4],
  [/\b(?:okay|ok|medium|average|alright|fine)\b/i, 3],
  [/\b(?:low|tired|sluggish|meh)\b/i, 2],
  [/\b(?:very low|really low|exhausted|drained|dead|wiped out|knackered)\b/i, 1]
]
/** "4", "four", "4 out of 5", "8 out of 10" → 1–5. */
function scale(raw: string): number | null {
  const s = raw.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/gi, (w) => String(['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'].indexOf(w.toLowerCase()) + 1))
  const m =/\b(\d+(?:\.\d+)?)\s*(?:\/|out of)\s*(5|10)\b/i.exec(s) ?? /\b(?:a|about|around|like|maybe)?\s*(\d)\b/i.exec(s)
  if (!m) return null
  let v = parseFloat(m[1])
  if (m[2] === '10') v = v / 2
  return v >= 1 && v <= 5 ? Math.round(v) : null
}
const fromWords = (s: string, list: [RegExp, number][]): number | null => {
  // Check the strongest phrases first ("very low" before "low").
  for (const [re, v] of [...list].sort((a, b) => b[0].source.length - a[0].source.length)) if (re.test(s)) return v
  return null
}

/** The check-in parts of one sentence, or null if it isn't a check-in. */
export function readCheckin(c: string): { mood?: number; energy?: number; sleep?: number; highlight?: string; gratitude?: string } | null {
  const out: { mood?: number; energy?: number; sleep?: number; highlight?: string; gratitude?: string } = {}
  const t = normaliseNumbers(` ${c} `)
  const sleep = /\b(?:slept|sleep(?:ing)?)\s+(?:for\s+)?(?:about\s+|around\s+|like\s+)?(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b|\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\s+(?:of\s+)?sleep\b/i.exec(t)
  if (sleep) {
    const h = parseFloat(sleep[1] ?? sleep[2])
    if (h > 0 && h <= 16) out.sleep = h
  }
  const energy = /\benergy(?:\s+(?:level|levels))?\s*(?:is|was|'s|are|were|:)?\s*([^,.;]+)/i.exec(t)
  if (energy) out.energy = scale(energy[1]) ?? fromWords(energy[1], ENERGY_WORDS) ?? undefined
  else if (/\b(?:i'?m|i am|feeling|feel)\s+(?:so\s+|really\s+|pretty\s+|quite\s+)?(?:exhausted|drained|knackered|wiped out|full of energy|energetic)\b/i.test(t)) out.energy = fromWords(t, ENERGY_WORDS) ?? undefined
  const mood = /\b(?:mood(?:\s+is|\s+was|'s)?|i'?m feeling|i am feeling|i feel|feeling|i'?m|i am|today was|day was|it was a|had a)\s+(?:a\s+|an\s+|about\s+|around\s+|like\s+|maybe\s+|really\s+|pretty\s+|quite\s+|so\s+)*([^,.;]+)/i.exec(t)
  if (mood && (/\b(?:mood|feel|feeling)\b/i.test(t) || /\b(?:today was|today's been|day was|had an?|it was an?|been an?)\b.*\bday\b/i.test(t))) {
    const v = scale(mood[1]) ?? fromWords(mood[1], MOOD_WORDS)
    if (v && !(out.energy && /^\s*(?:exhausted|drained|knackered|wiped out)/i.test(mood[1]))) out.mood = v
  }
  const hi = /\b(?:the\s+)?(?:highlight|best (?:part|thing|bit))(?:\s+of\s+(?:the|my|today)(?:\s+day)?)?\s+(?:was|is|has been)\s+(.+)/i.exec(c)
  if (hi) out.highlight = cap(tidy(hi[1]))
  const gr = /\b(?:i'?m|i am|i feel|feeling)\s+(?:really\s+|so\s+)?(?:grateful|thankful)\s+(?:for|that)\s+(.+)/i.exec(c)
  if (gr) out.gratitude = cap(tidy(gr[1]))
  return Object.values(out).some((v) => v !== undefined) ? out : null
}

// ---------- How each action reads in the list ----------

const dayName = (iso: string, now = new Date()): string => {
  const d = new Date(iso.length === 10 ? `${iso}T00:00` : iso)
  const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 864e5)
  const day = days === 0 ? 'today' : days === 1 ? 'tomorrow' : days === -1 ? 'yesterday' : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  if (iso.length === 10) return day
  const t = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return d.getHours() === 23 && d.getMinutes() === 59 ? day : `${day} ${t}`
}
const hm = (m: number): string => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`)

export function describe(a: BriefAction, currency = ''): { icon: string; verb: string; text: string; detail: string } {
  switch (a.kind) {
    case 'task':
      return { icon: '➕', verb: 'New task', text: a.title, detail: a.due ? `due ${dayName(a.due)}` : '' }
    case 'task_done':
      return { icon: '✅', verb: 'Mark done', text: a.title, detail: '' }
    case 'task_cancel':
      return { icon: '🗑️', verb: 'Remove task', text: a.title, detail: '' }
    case 'event':
      return { icon: '📅', verb: 'New event', text: a.title, detail: a.allDay ? dayName(a.start) : `${dayName(a.start)}–${new Date(a.end).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` }
    case 'event_cancel':
      return { icon: '❌', verb: 'Cancel event', text: a.title, detail: dayName(a.start) }
    case 'log':
      return { icon: '⏱️', verb: `Log ${hm(a.minutes)}`, text: a.subject, detail: a.date === ymd(new Date()) ? 'today' : dayName(a.date) }
    case 'habit':
      return { icon: '🔁', verb: 'Tick habit', text: a.name, detail: dayName(a.date) }
    case 'money':
      return {
        icon: a.flow === 'income' ? '💰' : '💸',
        verb: `${a.flow === 'income' ? 'Income' : 'Spent'} ${currency}${a.amount.toFixed(a.amount % 1 ? 2 : 0)}`,
        text: a.note || a.category,
        detail: `${a.category}${a.date === ymd(new Date()) ? '' : ` · ${dayName(a.date)}`}`
      }
    case 'journal':
      return { icon: '📓', verb: 'Journal', text: a.text, detail: dayName(a.date) }
    case 'checkin': {
      const faces = ['', '😞', '😕', '😐', '🙂', '😄']
      const bits = [
        a.mood ? `${faces[a.mood]} mood ${a.mood}/5` : '',
        a.energy ? `⚡ energy ${a.energy}/5` : '',
        a.sleep ? `😴 slept ${a.sleep}h` : '',
        a.highlight ? `✨ ${a.highlight}` : '',
        a.gratitude ? `🙏 ${a.gratitude}` : ''
      ].filter(Boolean)
      return { icon: '🌤️', verb: 'Check-in', text: bits.join(' · '), detail: dayName(a.date) }
    }
    case 'inbox':
      return { icon: '📥', verb: 'To Inbox', text: a.text, detail: '' }
    case 'event_move':
      return { icon: '↔️', verb: 'Move event', text: a.title, detail: `to ${dayName(a.start)}` }
    case 'task_move':
      return { icon: '🗓️', verb: 'New due date', text: a.title, detail: a.due ? dayName(a.due) : 'no date' }
    case 'open_url':
      return { icon: '🌐', verb: 'Open website', text: a.label || a.url, detail: a.url.replace(/^https?:\/\//, '').split('/')[0] }
    case 'open_page':
      return { icon: '📂', verb: 'Open', text: a.label, detail: '' }
    case 'explain':
      return { icon: '💡', verb: 'Explain', text: a.topic, detail: 'cards beside your screen' }
    case 'circle':
      return { icon: '⭕', verb: 'Look at the screen', text: 'circle what you mean', detail: '' }
    case 'open_app':
      return { icon: '🖥️', verb: 'Open app', text: a.name, detail: '' }
  }
}

/** Which field of an action the review list lets you retype. */
export function editableText(a: BriefAction): string | null {
  switch (a.kind) {
    case 'task':
    case 'event':
      return a.title
    case 'log':
      return a.subject
    case 'money':
      return a.note
    case 'journal':
    case 'inbox':
      return a.text
    default:
      return null
  }
}
export function withText(a: BriefAction, text: string): BriefAction {
  switch (a.kind) {
    case 'task':
    case 'event':
      return { ...a, title: text }
    case 'log':
      return { ...a, subject: text }
    case 'money':
      return { ...a, note: text }
    case 'journal':
    case 'inbox':
      return { ...a, text }
    default:
      return a
  }
}
