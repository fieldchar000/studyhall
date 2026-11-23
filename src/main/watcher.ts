// Nova speaking up on its own (the "Speaks up on its own" setting): it checks every minute and says something when
// it matters, never more than once every 15 minutes (a class about to start can't wait that long: 5), and never while
// you're in a lesson, a focus session, away from the PC, or after "not now" (an hour of quiet).
//  • You're back after a while: what happened while you were away.
//  • A class or event in about 15 minutes.
//  • Something due tonight that isn't done (about 5 hours and 90 minutes before).
//  • A budget nearly or over spent; a birthday tomorrow.
//  • Late at night: a nudge to sleep, once.
//  • Shaky lesson ideas due a check; an exam within a week (once a day).
//  • Big news on a topic you watch closely (news.ts).
// What it said last is kept for a few minutes, so "yes" or "go on" answers it.
import { powerMonitor } from 'electron'
import { getDb, getSetting, setSetting } from './db'
import { budgetUse, upcomingOccasions } from './lifeReminders'
import { newsHooks, type Story } from './news'
import { schoolBrief } from './politemall'
import { getPrefs } from './prefs'

export const watchHooks = {
  say: (_text: string): void => {},
  sayThenListen: async (_text: string): Promise<void> => {},
  emote: (_e: string): void => {},
  /** Whether now is a bad time (a lesson, a focus session, Nova put away). */
  busy: (): boolean => false,
  /** What happened while they were away (agents finished, PoliteMall news): a line, or ''. */
  whileAway: (_since: number): string => ''
}

const MIN = 60_000
const pad = (n: number): string => String(n).padStart(2, '0')
const ymd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const hm = (iso: string): string => new Date(iso).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(':00', '').replace(' ', '')
const sir = (): string => (getPrefs().novaJarvis ? `, ${(getPrefs().novaAddress ?? 'sir').trim() || 'sir'}` : '')
const Sir = (): string => (getPrefs().novaJarvis ? `${(getPrefs().novaAddress ?? 'sir').trim() || 'Sir'}, ` : '')
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

let lastSpoke = 0
let mutedUntil = 0
let last: { text: string; at: number } | null = null
/** "Not now" / "quiet for a bit": no speaking up for an hour (or the minutes given). */
export function hush(minutes = 60): void {
  mutedUntil = Date.now() + minutes * MIN
}
/** What Nova said on its own in the last few minutes, for <live-state> (so "yes" means do that). */
export function lastSpokeUp(): string {
  return last && Date.now() - last.at < 5 * MIN ? `You just said this on your own (out loud): "${last.text}". If they answer it ("yes", "go on", "do it"), do what you offered.` : ''
}
/** Each thing is said once (kept by key). */
function once(key: string): boolean {
  const done = getSetting<Record<string, number>>('nova_watch_said') ?? {}
  if (done[key]) return false
  const keep = Object.fromEntries(Object.entries(done).filter(([, at]) => Date.now() - at < 14 * 864e5))
  setSetting('nova_watch_said', { ...keep, [key]: Date.now() })
  return true
}
/** Whether Nova may speak up now (urgent: a class about to start, something due within the hour and a half). */
const canSpeak = (urgent = false): boolean => Date.now() >= mutedUntil && Date.now() - lastSpoke >= (urgent ? 5 : 15) * MIN && !watchHooks.busy()
async function speak(text: string, o: { urgent?: boolean; ask?: boolean; emote?: string } = {}): Promise<boolean> {
  if (!canSpeak(o.urgent)) return false
  lastSpoke = Date.now()
  last = { text, at: Date.now() }
  if (o.emote) watchHooks.emote(o.emote)
  if (o.ask) await watchHooks.sayThenListen(text)
  else watchHooks.say(text)
  return true
}

// ---------- The checks ----------

let awaySince = 0
async function backAgain(idle: number): Promise<boolean> {
  if (idle > 30 * 60) {
    if (!awaySince) awaySince = Date.now() - idle * 1000
    return false
  }
  if (!awaySince || idle > 60) return false
  const away = Date.now() - awaySince
  const since = awaySince
  awaySince = 0
  if (away < 45 * MIN) return false
  const news = watchHooks.whileAway(since)
  const due = schoolBrief().due.filter((x) => Date.parse(x.due) - Date.now() < 24 * 60 * MIN)
  const bits = [
    news,
    due.length ? `${due[0].what.replace(/ \(quiz\)$/, ' quiz')} is due ${new Date(due[0].due).toDateString() === new Date().toDateString() ? `today at ${hm(due[0].due)}` : 'tomorrow'}.` : ''
  ].filter(Boolean)
  if (!bits.length || !canSpeak()) return false
  const hello = getPrefs().novaJarvis ? `Welcome back${sir()}.` : 'Welcome back.'
  return speak(`${hello} ${bits.join(' ')}`, { emote: 'wave' })
}
async function classSoon(): Promise<boolean> {
  const now = Date.now()
  const from = new Date(now + 10 * MIN).toISOString()
  const to = new Date(now + 20 * MIN).toISOString()
  const db = getDb()
  let evs: { title: string; start_at: string }[] = db
    .prepare(`SELECT title, start_at FROM events WHERE deleted_at IS NULL AND all_day = 0 AND start_at >= ? AND start_at < ?`)
    .all(from, to) as unknown as { title: string; start_at: string }[]
  try {
    evs = [
      ...evs,
      ...(db.prepare(`SELECT title, start_at FROM subscription_events WHERE all_day = 0 AND start_at >= ? AND start_at < ?`).all(from, to) as unknown as { title: string; start_at: string }[])
    ]
  } catch {
    /* no feeds */
  }
  const e = evs.find((x) => !/\b(due|deadline|closes?)\b/i.test(x.title))
  if (!e || !canSpeak(true) || !once(`class:${e.title}:${e.start_at}`)) return false
  const mins = Math.round((Date.parse(e.start_at) - now) / MIN)
  return speak(`${Sir()}${e.title} starts in ${mins} minutes, at ${hm(e.start_at)}.`, { urgent: true, emote: 'remind' })
}
async function dueTonight(): Promise<boolean> {
  const now = Date.now()
  const items = [
    ...(getDb()
      .prepare(`SELECT id, title, due_at FROM tasks WHERE deleted_at IS NULL AND status = 'todo' AND due_at IS NOT NULL AND due_at > ? AND due_at < ?`)
      .all(new Date(now).toISOString(), new Date(now + 6 * 60 * MIN).toISOString()) as unknown as { id: string; title: string; due_at: string }[]),
    ...schoolBrief()
      .due.filter((x) => Date.parse(x.due) > now && Date.parse(x.due) < now + 6 * 60 * MIN)
      .map((x) => ({ id: x.what, title: x.what.replace(/ \(quiz\)$/, ' quiz'), due_at: x.due }))
  ]
  for (const t of items) {
    const left = (Date.parse(t.due_at) - now) / MIN
    const stage = left <= 100 ? 'late' : left <= 330 ? 'early' : ''
    if (!stage || !canSpeak(stage === 'late') || !once(`due:${t.id}:${t.due_at}:${stage}`)) continue
    if (stage === 'late') once(`due:${t.id}:${t.due_at}:early`)
    const when = left < 60 ? `in ${Math.round(left)} minutes` : `at ${hm(t.due_at)}`
    return speak(`${Sir()}${t.title} is due ${when}. Shall I open it?`, { ask: true, emote: 'remind', urgent: stage === 'late' })
  }
  return false
}
async function moneyAndPeople(): Promise<boolean> {
  if (!canSpeak()) return false
  const month = ymd(new Date()).slice(0, 7)
  for (const b of budgetUse(month)) {
    const tier = b.share >= 1 ? 'over' : b.share >= 0.9 ? 'near' : ''
    if (!tier || !once(`watch-budget:${b.category}:${month}:${tier}`)) continue
    const line =
      tier === 'over'
        ? `${Sir()}you've gone over this month's ${b.category.toLowerCase()} budget.`
        : `${Sir()}${b.category.toLowerCase()} is at ${Math.round(b.share * 100)}% of this month's budget.${getPrefs().novaJarvis && getPrefs().novaWit !== 'off' && /food|eat|dining/i.test(b.category) ? ' It has made a strong case for instant noodles.' : ''}`
    return speak(cap(line))
  }
  const o = upcomingOccasions(1).find((x) => x.days === 1)
  if (o && once(`watch-occasion:${o.personId}:${o.kind}:${o.date}`)) {
    const first = o.name.split(' ')[0]
    return speak(
      `${Sir()}${o.kind === 'birthday' ? `${first}'s birthday` : o.partner ? 'your anniversary' : `${first}'s anniversary`} is tomorrow.${o.ideas.length ? ` From your notes: ${o.ideas.slice(0, 2).join(' or ')}.` : ' Shall I help you think of something?'}`,
      { ask: !o.ideas.length }
    )
  }
  return false
}
async function lateNight(): Promise<boolean> {
  const h = new Date().getHours()
  if (h < 1 || h >= 4 || !canSpeak()) return false
  if (!once(`late:${ymd(new Date())}`)) return false
  const first = getDb().prepare(`SELECT title, start_at FROM events WHERE deleted_at IS NULL AND all_day = 0 AND start_at >= ? ORDER BY start_at LIMIT 1`).get(new Date().toISOString()) as
    { title: string; start_at: string } | undefined
  const tomorrow = first && Date.parse(first.start_at) - Date.now() < 12 * 60 * MIN ? ` ${first.title} is at ${hm(first.start_at)}.` : ''
  const t = new Date().toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(' ', '')
  const wit = getPrefs().novaJarvis && getPrefs().novaWit !== 'off' ? ` I'd suggest sleep, though I suspect you'll suggest otherwise.` : ' Time to wind down?'
  return speak(`It's ${t}${sir()}.${tomorrow}${wit}`)
}
async function studyNudges(): Promise<boolean> {
  const day = ymd(new Date())
  if (new Date().getHours() < 10 || !canSpeak()) return false
  try {
    const { dueChecks, examsSoon } = await import('./lessonPractice')
    const ex = Object.entries(examsSoon())
      .filter(([, d]) => d <= 7)
      .sort((a, b) => a[1] - b[1])[0]
    if (ex && once(`exam:${ex[0]}:${day}`)) return speak(`${Sir()}the ${ex[0]} exam is in ${ex[1]} day${ex[1] === 1 ? '' : 's'}. Shall we do some exam practice?`, { ask: true })
    const due = await dueChecks()
    if (due.length && once(`shaky:${day}`)) return speak(`${Sir()}${due.length} shaky idea${due.length > 1 ? 's are' : ' is'} due a two-minute check, from ${due[0].title}. Shall we?`, { ask: true })
  } catch {
    /* no lessons */
  }
  return false
}

newsHooks.alert = (s: Story) => {
  const sure = s.trust === 'confirmed' ? (s.sources.length > 1 ? `${s.sources.length} sources confirm it.` : `It's from ${s.sources[0]}.`) : `Reported by ${s.sources[0]}, not confirmed yet.`
  void speak(
    `${Sir()}news on ${s.topic}: ${s.summary} ${sure} Want the details?`.replace(/^./, (c) => c.toUpperCase()),
    { ask: true }
  )
}

let started = false
export function startWatcher(): void {
  if (started || process.env.STUDYHALL_OFFSCREEN === '1') return
  started = true
  const tick = async (): Promise<void> => {
    const p = getPrefs()
    if (p.novaProactive === false || p.bauerOrb === false) return
    const idle = powerMonitor.getSystemIdleTime()
    if (await backAgain(idle)) return
    if (idle > 5 * 60) return // (not at the PC)
    for (const check of [classSoon, dueTonight, studyNudges, moneyAndPeople, lateNight]) if (await check().catch(() => false)) return
  }
  setInterval(() => void tick(), MIN).unref?.()
}
