// Nova's briefs: not only school. What's on (calendar, tasks, Nova's own list, PoliteMall), money (this month's
// budgets), people (birthdays and anniversaries), habits, the weather and the news you watch (news.ts).
//  • Morning: your day, the first time you're at the PC.
//  • Evening: what got done, what's left, tomorrow's first thing.
//  • Weekly (Sunday evening): the week ahead, exams counting down, money, people, and what to focus on.
//  • Status report: everything at once, whenever you ask ("Nova, status report").
// In Jarvis mode they're said as Jarvis would ("Good evening, sir."). Everything is read on this PC; only the weather
// (your city, from Open-Meteo, free, no account) and the news topics you chose leave it.
import { net } from 'electron'
import type { BauerCard } from '@shared/types'
import { getDb, getProfileId, getSetting, setSetting } from './db'
import { budgetUse, formatMoney, upcomingOccasions } from './lifeReminders'
import { newsForBrief } from './news'
import { schoolBrief } from './politemall'
import { getPrefs } from './prefs'

export type BriefKind = 'morning' | 'evening' | 'weekly' | 'status'
export const briefHooks = {
  /** Nova's own promises and reminders that are open (roamiesTools.ts fills this in, through buddy.ts). */
  promises: (): { text: string; due: number | null }[] => [],
  /** What background agents are doing, in a line ('' when none). */
  agents: (): string => ''
}

const pad = (n: number): string => String(n).padStart(2, '0')
const ymd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const hm = (iso: string): string => new Date(iso).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(':00', '').replace(' ', '')
const list = (xs: string[], max = 3): string => {
  const shown = xs.slice(0, max)
  const more = xs.length - shown.length
  const body = shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}` : (shown[0] ?? '')
  return more > 0 ? `${shown.join(', ')}, and ${more} more` : body
}
const jarvisOn = (): boolean => !!getPrefs().novaJarvis
const sir = (): string => (getPrefs().novaAddress ?? 'sir').trim() || 'sir'
/** "Good morning, sir." in Jarvis mode, else a friendly hello. */
export function greeting(now = new Date()): string {
  const part = now.getHours() < 12 ? 'morning' : now.getHours() < 18 ? 'afternoon' : 'evening'
  return jarvisOn() ? `Good ${part}, ${sir()}.` : part === 'morning' ? 'Morning!' : part === 'afternoon' ? 'Hey!' : 'Evening!'
}

// ---------- What's on ----------

type Item = { label: string; detail: string }
function eventsOn(day: Date): { title: string; start_at: string; all_day: number }[] {
  const start = new Date(day)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start.getTime() + 864e5)
  const db = getDb()
  const own = db
    .prepare(`SELECT title, start_at, all_day FROM events WHERE deleted_at IS NULL AND ((start_at >= ? AND start_at < ?) OR start_at = ?) ORDER BY start_at`)
    .all(start.toISOString(), end.toISOString(), ymd(start)) as unknown as { title: string; start_at: string; all_day: number }[]
  // (calendar feeds: the PoliteMall timetable and others, shown with your course names)
  let feeds: { title: string; start_at: string; all_day: number }[] = []
  try {
    feeds = db
      .prepare(`SELECT title, start_at, all_day FROM subscription_events WHERE (start_at >= ? AND start_at < ?) OR start_at = ? ORDER BY start_at`)
      .all(start.toISOString(), end.toISOString(), ymd(start)) as unknown as { title: string; start_at: string; all_day: number }[]
  } catch {
    /* no feeds */
  }
  const seen = new Set<string>()
  return [...own, ...feeds]
    .filter((e) => {
      const k = `${e.title.toLowerCase()}|${e.start_at.slice(0, 16)}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .sort((a, b) => a.start_at.localeCompare(b.start_at))
}
const eventSaid = (e: { title: string; start_at: string; all_day: number }): string => (e.all_day || e.start_at.length === 10 ? e.title : `${e.title} at ${hm(e.start_at)}`)
function tasksDue(before: Date): { title: string; due_at: string; status: string }[] {
  return getDb()
    .prepare(`SELECT title, due_at, status FROM tasks WHERE deleted_at IS NULL AND status != 'done' AND due_at IS NOT NULL AND due_at < ? ORDER BY due_at`)
    .all(before.toISOString()) as unknown as { title: string; due_at: string; status: string }[]
}
function doneToday(): string[] {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  return (
    getDb().prepare(`SELECT title FROM tasks WHERE deleted_at IS NULL AND status = 'done' AND updated_at >= ? ORDER BY updated_at DESC LIMIT 8`).all(start.toISOString()) as unknown as {
      title: string
    }[]
  ).map((t) => t.title)
}
/** Habits still to do today (those not ticked, for the days a week they're meant for). */
function habitsLeft(): string[] {
  try {
    const db = getDb()
    const me = getProfileId()
    const today = ymd(new Date())
    const monday = new Date()
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
    const hs = db.prepare('SELECT id, name, days_per_week FROM habits WHERE deleted_at IS NULL AND archived = 0 AND owner_id = ?').all(me) as unknown as {
      id: string
      name: string
      days_per_week: number
    }[]
    const checks = db.prepare('SELECT habit_id, date FROM habit_checks WHERE deleted_at IS NULL AND date >= ?').all(ymd(monday)) as unknown as { habit_id: string; date: string }[]
    return hs.filter((h) => !checks.some((c) => c.habit_id === h.id && c.date === today) && checks.filter((c) => c.habit_id === h.id).length < h.days_per_week).map((h) => h.name)
  } catch {
    return []
  }
}
/** Habits whose week is slipping: fewer days ticked than they need with the days left. */
function habitsAtRisk(): string[] {
  try {
    const db = getDb()
    const me = getProfileId()
    const now = new Date()
    const monday = new Date(now)
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
    const daysLeft = 7 - ((now.getDay() + 6) % 7)
    const hs = db.prepare('SELECT id, name, days_per_week FROM habits WHERE deleted_at IS NULL AND archived = 0 AND owner_id = ?').all(me) as unknown as {
      id: string
      name: string
      days_per_week: number
    }[]
    const checks = db.prepare('SELECT habit_id FROM habit_checks WHERE deleted_at IS NULL AND date >= ?').all(ymd(monday)) as unknown as { habit_id: string }[]
    return hs.filter((h) => h.days_per_week - checks.filter((c) => c.habit_id === h.id).length >= daysLeft && h.days_per_week < 7).map((h) => h.name)
  } catch {
    return []
  }
}
function moneyLine(): string {
  const now = new Date()
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1
  const use = budgetUse().sort((a, b) => b.share - a.share)
  const over = use.filter((b) => b.share >= 1)
  const close = use.filter((b) => b.share >= 0.8 && b.share < 1)
  if (over.length) return `You're over budget on ${list(over.map((b) => b.category.toLowerCase()))} this month.`
  if (close.length) {
    const b = close[0]
    return `${b.category} is at ${Math.round(b.share * 100)}% of this month's budget: ${formatMoney(b.monthly - b.spent)} left for ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`
  }
  return ''
}
function peopleLine(within: number): string {
  const os = upcomingOccasions(within)
  if (!os.length) return ''
  const o = os[0]
  const first = o.name.split(' ')[0]
  const what = o.kind === 'birthday' ? `${first}'s birthday` : o.partner ? 'your anniversary' : `${first}'s anniversary`
  const when = o.days === 0 ? 'is today' : o.days === 1 ? 'is tomorrow' : `is ${new Date(o.date).toLocaleDateString('en-GB', { weekday: 'long' })}`
  return `${what[0].toUpperCase()}${what.slice(1)} ${when}${o.ideas.length ? `; from your notes, ${first} likes ${list(o.ideas, 2)}` : ''}.`
}

// ---------- The weather (Open-Meteo: free, no account) ----------

type Weather = { max: number; min: number; rainFrom: string | null; rainChance: number; code: number }
const DESCR: [number, string][] = [
  [0, 'clear'],
  [3, 'partly cloudy'],
  [48, 'foggy'],
  [57, 'drizzly'],
  [67, 'rainy'],
  [77, 'snowy'],
  [82, 'showery'],
  [99, 'stormy']
]
async function place(): Promise<{ lat: number; lon: number; name: string } | null> {
  const city = (getPrefs().novaCity ?? '').trim() || Intl.DateTimeFormat().resolvedOptions().timeZone.split('/').pop()?.replace(/_/g, ' ') || ''
  if (!city) return null
  const kept = getSetting<{ city: string; lat: number; lon: number; name: string }>('nova_weather_place')
  if (kept?.city === city) return kept
  const r = await net.fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`, { signal: AbortSignal.timeout(8000) }).catch(() => null)
  const j = r?.ok ? ((await r.json().catch(() => null)) as { results?: { latitude: number; longitude: number; name: string }[] } | null) : null
  const hit = j?.results?.[0]
  if (!hit) return null
  const p = { city, lat: hit.latitude, lon: hit.longitude, name: hit.name }
  setSetting('nova_weather_place', p)
  return p
}
let weatherKept: { at: number; day: string; w: Weather } | null = null
export async function weatherToday(): Promise<Weather | null> {
  if (getPrefs().novaWeather === false) return null
  const day = ymd(new Date())
  if (weatherKept && weatherKept.day === day && Date.now() - weatherKept.at < 3 * 3600_000) return weatherKept.w
  const p = await place().catch(() => null)
  if (!p) return null
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&hourly=precipitation_probability&forecast_days=1&timezone=auto`
  const r = await net.fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null)
  const j = r?.ok
    ? ((await r.json().catch(() => null)) as {
        daily?: { temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: number[]; weather_code: number[] }
        hourly?: { time: string[]; precipitation_probability: number[] }
      } | null)
    : null
  if (!j?.daily) return null
  const nowH = new Date().getHours()
  const i = j.hourly?.precipitation_probability.findIndex((v, k) => v >= 50 && Number(j.hourly!.time[k].slice(11, 13)) >= nowH) ?? -1
  const w: Weather = {
    max: Math.round(j.daily.temperature_2m_max[0]),
    min: Math.round(j.daily.temperature_2m_min[0]),
    rainChance: j.daily.precipitation_probability_max[0] ?? 0,
    rainFrom: i >= 0 && j.hourly ? hm(j.hourly.time[i]) : null,
    code: j.daily.weather_code[0] ?? 0
  }
  weatherKept = { at: Date.now(), day, w }
  return w
}
const weatherLine = (w: Weather | null): string =>
  !w
    ? ''
    : `It's ${DESCR.find(([c]) => w.code <= c)?.[1] ?? 'mixed'} today, up to ${w.max} degrees${w.rainFrom ? `, with rain likely from ${w.rainFrom}, so take an umbrella` : w.rainChance >= 40 ? `, and a ${w.rainChance}% chance of rain` : ''}.`

// ---------- The briefs ----------

export type Brief = { say: string; card: BauerCard }
const card = (kind: BriefKind, title: string, items: Item[]): BauerCard => ({
  id: `brief-${kind}-${ymd(new Date())}`,
  kind: 'timeline',
  title,
  items: items.length ? items.slice(0, 12) : [{ label: 'Free', detail: 'Nothing planned' }],
  source: 'Studyhall'
})
const dueWhen = (iso: string, from: Date): string => {
  const start = new Date(from)
  start.setHours(0, 0, 0, 0)
  const days = Math.round((new Date(iso).setHours(0, 0, 0, 0) - start.getTime()) / 864e5)
  return days === 0 ? `today at ${hm(iso)}` : days === 1 ? `tomorrow at ${hm(iso)}` : new Date(iso).toLocaleDateString('en-GB', { weekday: 'long' })
}
// ("Bio: Endocrine quiz (quiz)" is said "Bio's Endocrine quiz")
const spokenDue = (what: string): string => what.replace(/^(.*?): (.*?)( \(quiz\))?$/, (_m, c: string, n: string, q?: string) => `${c}'s ${n}${q && !/quiz/i.test(n) ? ' quiz' : ''}`)

/** A brief of this kind: what's said, and the card shown with it. */
export async function makeBrief(kind: BriefKind, now = new Date()): Promise<Brief> {
  const p = getPrefs()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const tomorrow = new Date(start.getTime() + 864e5)
  const parts: string[] = []
  const items: Item[] = []
  const school = schoolBrief()
  const promises = briefHooks.promises().sort((x, y) => (x.due ?? Infinity) - (y.due ?? Infinity))
  const news = p.novaNews === false ? [] : await newsForBrief(kind).catch(() => [])
  const weather = kind === 'morning' || kind === 'status' ? await weatherToday().catch(() => null) : null

  if (kind === 'morning' || kind === 'status') {
    parts.push(kind === 'morning' ? greeting(now) : jarvisOn() ? `Status report, ${sir()}.` : "Here's where things stand.")
    if (kind === 'morning' && weather) parts.push(weatherLine(weather))
    const evs = eventsOn(now).filter((e) => kind === 'morning' || e.all_day || Date.parse(e.start_at) > now.getTime())
    if (evs.length) parts.push(`${kind === 'morning' ? 'Today you have' : 'Still ahead today:'} ${list(evs.map(eventSaid), 4)}.`)
    else if (kind === 'morning') parts.push('Nothing in your calendar today.')
    items.push(...evs.slice(0, 6).map((e) => ({ label: e.all_day || e.start_at.length === 10 ? 'All day' : hm(e.start_at), detail: e.title })))
    const due = tasksDue(tomorrow)
    const late = due.filter((t) => Date.parse(t.due_at) < start.getTime())
    const today = due.filter((t) => Date.parse(t.due_at) >= start.getTime())
    if (today.length) parts.push(`Due today: ${list(today.map((t) => t.title))}.`)
    if (late.length) parts.push(`${late.length === 1 ? `"${late[0].title}" is` : `${late.length} things are`} overdue.`)
    items.push(...today.slice(0, 4).map((t) => ({ label: 'Due', detail: t.title })), ...late.slice(0, 3).map((t) => ({ label: 'Overdue', detail: t.title })))
    const pToday = promises.filter((x) => x.due != null && x.due < tomorrow.getTime())
    if (pToday.length) parts.push(`On your list: ${list(pToday.map((x) => x.text.replace(/^./, (c) => c.toLowerCase())))}.`)
    if (school.due.length)
      parts.push(
        `On PoliteMall, ${list(
          school.due.map((x) => `${spokenDue(x.what)} is due ${dueWhen(x.due, now)}`),
          3
        )}.`
      )
    items.push(...school.due.slice(0, 4).map((x) => ({ label: new Date(x.due).toLocaleDateString('en-GB', { weekday: 'short' }), detail: x.what })))
    if (school.news.length)
      parts.push(
        `${school.news.length === 1 ? 'There is a new announcement' : `There are ${school.news.length} new announcements`}: ${school.news
          .slice(0, 2)
          .map((n) => n.what)
          .join('; ')}.`
      )
    items.push(...school.news.slice(0, 2).map((n) => ({ label: 'News', detail: n.what })))
    const money = moneyLine()
    if (money) parts.push(money)
    const ppl = peopleLine(kind === 'morning' ? 3 : 7)
    if (ppl) parts.push(ppl)
    const habits = habitsLeft()
    if (habits.length && kind === 'status') parts.push(`Habits still to tick today: ${list(habits)}.`)
    if (kind === 'status') {
      const ag = briefHooks.agents()
      if (ag) parts.push(ag)
    }
    if (weather && kind === 'status') items.unshift({ label: 'Weather', detail: `${weather.max}°${weather.rainFrom ? `, rain from ${weather.rainFrom}` : ''}` })
  }

  if (kind === 'evening') {
    parts.push(greeting(now))
    const done = doneToday()
    if (done.length) parts.push(`Today you finished ${list(done)}.`)
    const left = tasksDue(tomorrow)
    if (left.length) parts.push(`${left.length === 1 ? `"${left[0].title}" is` : `${list(left.map((t) => t.title))} are`} still open.`)
    const tmr = eventsOn(tomorrow)
    if (tmr.length) parts.push(`Tomorrow starts with ${eventSaid(tmr[0])}.`)
    const soon = school.due.filter((x) => Date.parse(x.due) < tomorrow.getTime() + 864e5)
    if (soon.length)
      parts.push(
        `On PoliteMall, ${list(
          soon.map((x) => `${spokenDue(x.what)} is due ${dueWhen(x.due, now)}`),
          2
        )}.`
      )
    const habits = habitsLeft()
    if (habits.length) parts.push(`Still time for ${list(habits, 2)} today.`)
    const ppl = peopleLine(1)
    if (ppl) parts.push(ppl)
    items.push(
      ...done.slice(0, 4).map((t) => ({ label: 'Done', detail: t })),
      ...left.slice(0, 3).map((t) => ({ label: 'Open', detail: t.title })),
      ...tmr.slice(0, 3).map((e) => ({ label: `Tmr ${e.all_day ? '' : hm(e.start_at)}`.trim(), detail: e.title }))
    )
    if (!done.length && !left.length && !tmr.length) parts.push('A quiet day, all told.')
  }

  if (kind === 'weekly') {
    parts.push(jarvisOn() ? `Your week ahead, ${sir()}.` : "Here's your week ahead.")
    const weekEnd = new Date(start.getTime() + 8 * 864e5)
    const due = tasksDue(weekEnd)
    if (due.length) parts.push(`${due.length} thing${due.length === 1 ? '' : 's'} due this week, the first ${dueWhen(due[0].due_at, now)}: ${due[0].title}.`)
    const sd = school.due
    if (sd.length)
      parts.push(
        `On PoliteMall: ${list(
          sd.map((x) => spokenDue(x.what)),
          3
        )}.`
      )
    try {
      const { examsSoon } = await import('./lessonPractice')
      const ex = Object.entries(examsSoon()).sort((a, b) => a[1] - b[1])
      if (ex.length) parts.push(`${ex[0][0]} exam in ${ex[0][1]} day${ex[0][1] === 1 ? '' : 's'}.`)
    } catch {
      /* no exams */
    }
    const money = moneyLine()
    if (money) parts.push(money)
    const ppl = peopleLine(7)
    if (ppl) parts.push(ppl)
    const risk = habitsAtRisk()
    if (risk.length) parts.push(`${list(risk, 2)} need${risk.length === 1 ? 's' : ''} a few more days this week.`)
    items.push(
      ...due.slice(0, 6).map((t) => ({ label: new Date(t.due_at).toLocaleDateString('en-GB', { weekday: 'short' }), detail: t.title })),
      ...sd.slice(0, 4).map((x) => ({ label: 'PoliteMall', detail: x.what }))
    )
  }

  // The news you watch (confirmed first).
  if (news.length) {
    parts.push(
      `${kind === 'status' ? 'On your news watch' : 'In the news you follow'}: ${news
        .slice(0, 2)
        .map((n) => n.say)
        .join(' ')}`
    )
    items.push(...news.slice(0, 3).map((n) => ({ label: n.badge, detail: n.title })))
  }
  if (parts.length === 1) parts.push(kind === 'status' ? 'Nothing needs you right now.' : 'Nothing pressing. A good day to get ahead.')
  const title =
    kind === 'morning'
      ? `Today · ${now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}`
      : kind === 'evening'
        ? 'This evening'
        : kind === 'weekly'
          ? 'The week ahead'
          : 'Status report'
  return { say: parts.filter(Boolean).join(' '), card: card(kind, title, items) }
}
