// Nova as a study buddy, on its own initiative (each part can be switched off on Nova's page):
//  • Focus sessions ("focus on chemistry for 45 minutes"): Studyhall's own focus timer runs (so the time is logged as
//    usual); Nova checks in halfway, nudges you (the globe gets upset) if you drift to YouTube, games or socials for
//    a while, and cheers when you finish.
//  • Morning brief: the first time you're at the PC each morning, "here's your day" (classes, what's due, promises).
//  • Proactive quiz: after about 30 minutes on the same notes, it offers a quick quiz on them.
// It only reads the title of the window in front (the same as the taskbar shows), once every 20 seconds, while a
// focus session runs or you're on study notes. Nothing is stored or sent anywhere.

import { powerMonitor } from 'electron'
import type { BauerCard } from '@shared/types'
import { getDb, getSetting, setSetting } from './db'
import { getPrefs } from './prefs'
import { eyes } from './eyes'
import * as timer from './timer'

export const buddyHooks = {
  say: (_text: string): void => {},
  sayThenListen: async (_text: string): Promise<void> => {},
  emote: (_e: string): void => {},
  cards: (_c: BauerCard[]): void => {},
  away: (): boolean => false
}

const OFFSCREEN = process.env.STUDYHALL_OFFSCREEN === '1'
const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)]

async function frontTitle(): Promise<{ title: string; app: string } | null> {
  if (OFFSCREEN) return null
  const r = await eyes({ cmd: 'window', exclude: [process.pid] }, 2000).catch(() => null)
  const w = r?.ok ? (r.window as { title: string; app: string }) : null
  return w ? { title: String(w.title ?? ''), app: String(w.app ?? '') } : null
}

// ---------- Focus sessions ----------

const DISTRACTING = /\b(youtube|netflix|prime video|disney\+|twitch|instagram|tiktok|reddit|twitter|facebook|snapchat|discord|steam|epic games|roblox|minecraft|valorant|league of legends|fortnite|9gag|tumblr|pinterest)\b|(^|[\s-])x\s*$/i
const STUDYISH = /\b(lecture|lesson|tutorial|explained|course|crash course|khan|osmosis|ninja nerd|anatomy|physiology|pharm|biology|chemistry|physics|maths?|calculus|revision|exam|study|notes|how\b.*\bworks?)\b/i

type Focus = { subject: string; startedAt: number; endsAt: number; minutes: number; halfway: boolean; drift: number; nudgedAt: number; done: boolean }
let focus: Focus | null = null

export function startFocus(minutes: number, subject: string, moduleId?: string | null): string {
  const m = Math.max(5, Math.min(180, Math.round(minutes || 25)))
  timer.startFocusFor(m, moduleId)
  focus = { subject: subject.trim() || 'your work', startedAt: Date.now(), endsAt: Date.now() + m * 60_000, minutes: m, halfway: m < 20, drift: 0, nudgedAt: 0, done: false }
  return `Focus session started: ${m} minutes on ${focus.subject} (Studyhall's timer is running and logs it).`
}
export function stopFocus(): string {
  if (!focus) return 'No focus session is running.'
  const mins = Math.round((Date.now() - focus.startedAt) / 60_000)
  timer.pause()
  focus = null
  return `Stopped after ${mins} minutes.`
}
export function focusState(): string {
  if (!focus) return ''
  const left = Math.max(0, Math.round((focus.endsAt - Date.now()) / 60_000))
  return `A focus session is running: ${focus.subject}, ${left} of ${focus.minutes} minutes left.`
}

async function focusTick(): Promise<void> {
  const f = focus
  if (!f || f.done) return
  const st = timer.getState()
  const now = Date.now()
  // Finished (the timer moved on), or stopped in Studyhall.
  if (now >= f.endsAt - 1500 || st.phase !== 'focus') {
    f.done = true
    focus = null
    if (now >= f.endsAt - 60_000) {
      buddyHooks.emote('hype')
      buddyHooks.say(pick([`Done! ${f.minutes} minutes of ${f.subject}. Nice work. Take a proper break.`, `That's ${f.minutes} minutes on ${f.subject} done. Great stuff, go stretch.`, `Session done! ${f.minutes} minutes logged. Proud of you.`]))
    }
    return
  }
  if (!st.running) return // paused in Studyhall
  if (!f.halfway && now - f.startedAt >= (f.minutes * 60_000) / 2) {
    f.halfway = true
    buddyHooks.emote('motivate')
    buddyHooks.say(pick([`Halfway there. ${Math.round((f.endsAt - now) / 60_000)} minutes to go.`, `Halfway through ${f.subject}. Keep it going.`]))
  }
  if (getPrefs().novaProactive === false) return
  const w = await frontTitle()
  if (!w) return
  const hay = `${w.title} ${w.app}`
  const drifting = DISTRACTING.test(hay) && !STUDYISH.test(w.title)
  f.drift = drifting ? f.drift + 20 : Math.max(0, f.drift - 40)
  if (f.drift >= 60 && now - f.nudgedAt > 5 * 60_000) {
    f.nudgedAt = now
    f.drift = 0
    buddyHooks.emote('upset')
    buddyHooks.say(pick([`Hey, that doesn't look like ${f.subject}. Back to it?`, `Caught you! ${Math.round((f.endsAt - now) / 60_000)} minutes left on ${f.subject}. You've got this.`, `Ahem. ${f.subject}, remember? Close that and I'll stop nagging.`]))
  }
}

// ---------- Morning brief ----------

const ymd = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const hm = (iso: string): string => new Date(iso).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(':00', '').replace(' ', '')

export function briefText(): { say: string; card: BauerCard } {
  const db = getDb()
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start.getTime() + 864e5)
  const events = db
    .prepare(`SELECT title, start_at, all_day FROM events WHERE deleted_at IS NULL AND ((start_at >= ? AND start_at < ?) OR start_at = ?) ORDER BY start_at`)
    .all(start.toISOString(), end.toISOString(), ymd(now)) as unknown as { title: string; start_at: string; all_day: number }[]
  const due = db
    .prepare(`SELECT title, due_at FROM tasks WHERE deleted_at IS NULL AND status != 'done' AND due_at IS NOT NULL AND due_at < ? ORDER BY due_at`)
    .all(end.toISOString()) as unknown as { title: string; due_at: string }[]
  const overdue = due.filter((t) => Date.parse(t.due_at) < start.getTime())
  const today = due.filter((t) => Date.parse(t.due_at) >= start.getTime())
  const greet = now.getHours() < 12 ? 'Morning!' : 'Hey!'
  const parts: string[] = [greet]
  if (events.length) parts.push(`Today you've got ${events.slice(0, 4).map((e) => (e.all_day || e.start_at.length === 10 ? e.title : `${e.title} at ${hm(e.start_at)}`)).join(', ')}${events.length > 4 ? `, and ${events.length - 4} more` : ''}.`)
  else parts.push('Nothing in your calendar today.')
  if (today.length) parts.push(`Due today: ${today.slice(0, 3).map((t) => t.title).join(', ')}${today.length > 3 ? ` and ${today.length - 3} more` : ''}.`)
  if (overdue.length) parts.push(`${overdue.length === 1 ? `"${overdue[0].title}" is` : `${overdue.length} things are`} overdue.`)
  if (!today.length && !overdue.length) parts.push('Nothing due. Good day to get ahead.')
  const items = [
    ...events.slice(0, 6).map((e) => ({ label: e.all_day || e.start_at.length === 10 ? 'All day' : hm(e.start_at), detail: e.title })),
    ...today.slice(0, 4).map((t) => ({ label: 'Due', detail: t.title })),
    ...overdue.slice(0, 3).map((t) => ({ label: 'Overdue', detail: t.title }))
  ]
  return {
    say: parts.join(' '),
    card: { id: `brief-${ymd(now)}`, kind: 'timeline', title: `Today · ${now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}`, items: items.length ? items : [{ label: 'Free', detail: 'Nothing planned' }], source: 'Studyhall' }
  }
}

function briefTick(): void {
  if (getPrefs().novaBrief === false || getPrefs().bauerOrb === false || OFFSCREEN || buddyHooks.away()) return
  const now = new Date()
  if (now.getHours() < 5 || now.getHours() >= 14) return
  if (getSetting<string>('nova_brief_day') === ymd(now)) return
  if (powerMonitor.getSystemIdleTime() > 60) return // you're not at the PC yet
  setSetting('nova_brief_day', ymd(now))
  const b = briefText()
  buddyHooks.emote('wave')
  buddyHooks.cards([b.card])
  buddyHooks.say(b.say)
}

// ---------- Proactive quiz offer ----------

const NOTESY = /\b(notes?|lecture|slides?|week\s*\d+|lab|study|revision|chapter|module|\.pdf|\.html?|companion|trainer|pack)\b/i
let onTitle: { title: string; since: number } | null = null
let lastOffer: { title: string; at: number } | null = null
export function lastOffered(): string {
  return lastOffer && Date.now() - lastOffer.at < 10 * 60_000 ? `You just offered them (out loud) a quick quiz on "${lastOffer.title}". A "yes" means: find_material for it (or use what's on screen) and quiz_me, 5 questions.` : ''
}

async function offerTick(): Promise<void> {
  if (getPrefs().novaProactive === false || getPrefs().bauerOrb === false || OFFSCREEN || focus || buddyHooks.away()) return
  if (powerMonitor.getSystemIdleTime() > 300) {
    onTitle = null
    return
  }
  const w = await frontTitle()
  if (!w || !NOTESY.test(w.title)) {
    onTitle = null
    return
  }
  if (!onTitle || onTitle.title !== w.title) onTitle = { title: w.title, since: Date.now() }
  const long = Date.now() - onTitle.since >= 30 * 60_000
  const recently = lastOffer && (lastOffer.title === w.title ? Date.now() - lastOffer.at < 2 * 3600_000 : Date.now() - lastOffer.at < 40 * 60_000)
  if (!long || recently) return
  const name = w.title.replace(/\s+[-–—|]\s+[^-–—|]+$/, '').slice(0, 60)
  lastOffer = { title: name, at: Date.now() }
  buddyHooks.emote('remind')
  await buddyHooks.sayThenListen(pick([`You've been on ${name} for half an hour. Want a quick quiz on it?`, `Half an hour on ${name}. Shall I test you on it?`]))
}

// ---------- The clock ----------

let started = false
export function startBuddy(): void {
  if (started) return
  started = true
  setInterval(() => void focusTick().catch(() => {}), 20_000).unref()
  setInterval(() => {
    try {
      briefTick()
    } catch (e) {
      console.warn('Nova brief:', e)
    }
    void offerTick().catch(() => {})
  }, 60_000).unref()
}
