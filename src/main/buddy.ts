// Nova as a study buddy, on its own initiative (each part can be switched off on Nova's page):
//  • Focus sessions ("focus on chemistry for 45 minutes"): Studyhall's own focus timer runs (so the time is logged as
//    usual); Nova checks in halfway, nudges you (the globe gets upset) if you drift to YouTube, games or socials for
//    a while, and cheers when you finish.
//  • Briefs (briefs.ts): the morning brief the first time you're at the PC, and (if switched on) the evening wrap-up,
//    or the week ahead on Sundays.
//  • Proactive quiz: after about 30 minutes on the same notes, it offers a quick quiz on them.
// It only reads the title of the window in front (the same as the taskbar shows), once every 20 seconds, while a
// focus session runs or you're on study notes. Nothing is stored or sent anywhere.

import { powerMonitor } from 'electron'
import type { BauerCard } from '@shared/types'
import { getSetting, setSetting } from './db'
import { getPrefs } from './prefs'
import { eyes } from './eyes'
import * as timer from './timer'
import { makeBrief, type BriefKind } from './briefs'

export const buddyHooks = {
  say: (_text: string): void => {},
  sayThenListen: async (_text: string): Promise<void> => {},
  emote: (_e: string): void => {},
  cards: (_c: BauerCard[]): void => {},
  away: (): boolean => false,
  /** Nova's own promises and reminders that are open (roamiesTools.ts fills this in). */
  promises: (): { text: string; due: number | null }[] => []
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

// ---------- Briefs (briefs.ts) ----------

const ymd = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** The briefs, each once a day at its time, the first time you're at the PC then: the morning brief (5 am to 2 pm), the
 *  evening wrap-up (7 to 11 pm, if you switched it on) and the week ahead (Sunday evening, instead of the wrap-up). */
async function briefTick(): Promise<void> {
  const p = getPrefs()
  if (p.bauerOrb === false || OFFSCREEN || buddyHooks.away()) return
  if (powerMonitor.getSystemIdleTime() > 60) return // you're not at the PC
  const now = new Date()
  const h = now.getHours()
  const kind: BriefKind | null = h >= 5 && h < 14 && p.novaBrief !== false ? 'morning' : h >= 19 && h < 23 && p.novaBriefEvening === true ? (now.getDay() === 0 ? 'weekly' : 'evening') : null
  if (!kind) return
  const key = `nova_brief_${kind === 'morning' ? 'day' : 'evening'}`
  if (getSetting<string>(key) === ymd(now)) return
  setSetting(key, ymd(now))
  const b = await makeBrief(kind)
  buddyHooks.emote('wave')
  buddyHooks.cards([b.card])
  buddyHooks.say(b.say)
}

// ---------- Proactive quiz offer ----------

const NOTESY = /\b(notes?|lecture|slides?|week\s*\d+|lab|study|revision|chapter|module|\.pdf|\.html?|companion|trainer|pack)\b/i
let onTitle: { title: string; since: number } | null = null
let lastOffer: { title: string; at: number } | null = null
export function lastOffered(): string {
  return lastOffer && Date.now() - lastOffer.at < 10 * 60_000 ? `You just offered them (out loud) a quick quiz on "${lastOffer.title}". A "yes" means: start it now: find_material for it and quiz_me with that file, or, if it isn't one of their files, read_lesson (a deck or PDF) or read_window (a page) for what's on screen, then quiz_me with topic. 5 questions; ask question 1 in this reply.` : ''
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
    void briefTick().catch((e) => console.warn('Nova brief:', e))
    void offerTick().catch(() => {})
  }, 60_000).unref()
}

// Automated tests only: the morning brief's words, without waiting for the morning.
if (process.env.STUDYHALL_OFFSCREEN === '1') (globalThis as unknown as { __novaBrief: unknown }).__novaBrief = (kind: BriefKind = 'morning') => makeBrief(kind)
