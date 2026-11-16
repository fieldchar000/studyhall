// Gentle reminders about life (PC and phone, checked every minute alongside deadlines):
//  • budget alerts — a category reaches 80% / 100% of its monthly budget
//  • birthdays and anniversaries — two weeks, three days and on the day, with gift ideas
//    taken from what you've noted about the person
//  • an evening nudge to check in (mood, energy, sleep) if you haven't today
//  • Sunday evening: your weekly review is ready
// Each fires once (tracked in notifications_sent).

import { getDb, getProfileId, now } from './db'
import { getPrefs } from './prefs'

type Notify = (title: string, body: string, page: string) => void

const pad = (n: number): string => String(n).padStart(2, '0')
const ymd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function once(key: string): boolean {
  const db = getDb()
  if (db.prepare('SELECT 1 FROM notifications_sent WHERE key = ?').get(key)) return false
  db.prepare('INSERT OR IGNORE INTO notifications_sent (key, sent_at) VALUES (?, ?)').run(key, now())
  return true
}

function currency(): string {
  const p = getDb().prepare('SELECT currency FROM profiles WHERE id = ?').get(getProfileId()) as { currency?: string } | undefined
  return p?.currency || ''
}
export function formatMoney(n: number, code = currency()): string {
  try {
    if (code) return new Intl.NumberFormat(undefined, { style: 'currency', currency: code, maximumFractionDigits: n >= 100 ? 0 : 2 }).format(n)
  } catch {
    /* unknown code */
  }
  return n.toFixed(n >= 100 ? 0 : 2)
}

// ---------- Budgets ----------

export interface BudgetUse {
  category: string
  monthly: number
  spent: number
  share: number // spent / monthly
}

/** This month's spending against each budget. */
export function budgetUse(month = ymd(new Date()).slice(0, 7)): BudgetUse[] {
  const db = getDb()
  const me = getProfileId()
  const budgets = db.prepare('SELECT category, monthly FROM budgets WHERE deleted_at IS NULL AND owner_id = ? AND monthly > 0').all(me) as unknown as { category: string; monthly: number }[]
  const spent = db
    .prepare(`SELECT category, SUM(amount) AS total FROM money_entries WHERE deleted_at IS NULL AND owner_id = ? AND kind = 'expense' AND substr(date, 1, 7) = ? GROUP BY category`)
    .all(me, month) as unknown as { category: string; total: number }[]
  return budgets.map((b) => {
    const s = spent.find((x) => x.category === b.category)?.total ?? 0
    return { category: b.category, monthly: b.monthly, spent: s, share: s / b.monthly }
  })
}

function checkBudgets(notify: Notify): void {
  const today = new Date()
  const month = ymd(today).slice(0, 7)
  const daysLeft = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - today.getDate()
  for (const b of budgetUse(month)) {
    const tier = b.share >= 1 ? 100 : b.share >= 0.8 ? 80 : 0
    if (!tier || !once(`budget:${b.category}:${month}:${tier}`)) continue
    // (reaching 100% first also counts as the 80% warning)
    if (tier === 100) once(`budget:${b.category}:${month}:80`)
    const left = b.monthly - b.spent
    notify(
      tier === 100 ? `Over budget: ${b.category}` : `${b.category}: ${Math.round(b.share * 100)}% of this month’s budget`,
      tier === 100
        ? `${formatMoney(b.spent)} spent of ${formatMoney(b.monthly)} (${formatMoney(-left)} over) · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left this month`
        : `${formatMoney(left)} left for the next ${daysLeft} day${daysLeft === 1 ? '' : 's'} (about ${formatMoney(left / Math.max(1, daysLeft))} a day)`,
      'money'
    )
  }
}

// ---------- Birthdays and anniversaries ----------

export interface Occasion {
  personId: string
  name: string
  kind: 'birthday' | 'anniversary'
  date: string // next occurrence, YYYY-MM-DD
  days: number // from today
  years: number | null // turning / together for
  ideas: string[]
  partner: boolean
}

/** Next birthdays and anniversaries within `withinDays`, with gift ideas from their details. */
export function upcomingOccasions(withinDays = 30): Occasion[] {
  const db = getDb()
  const me = getProfileId()
  const people = db
    .prepare(`SELECT id, name, kind, birthday, anniversary FROM people WHERE deleted_at IS NULL AND archived = 0 AND owner_id = ?`)
    .all(me) as unknown as { id: string; name: string; kind: string; birthday: string | null; anniversary: string | null }[]
  const facts = db
    .prepare(`SELECT person_id, category, text FROM person_facts WHERE deleted_at IS NULL AND owner_id = ? ORDER BY CASE category WHEN 'gifts' THEN 0 WHEN 'likes' THEN 1 WHEN 'food' THEN 2 ELSE 3 END, sort`)
    .all(me) as unknown as { person_id: string; category: string; text: string }[]
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const out: Occasion[] = []
  for (const p of people) {
    for (const kind of ['birthday', 'anniversary'] as const) {
      const d = p[kind]
      if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue
      const [y, m, day] = d.split('-').map(Number)
      let next = new Date(today.getFullYear(), m - 1, day)
      if (next < today) next = new Date(today.getFullYear() + 1, m - 1, day)
      const days = Math.round((next.getTime() - today.getTime()) / 864e5)
      if (days > withinDays) continue
      const ideas = facts.filter((f) => f.person_id === p.id && ['gifts', 'likes', 'food'].includes(f.category)).map((f) => f.text.trim()).filter(Boolean)
      out.push({ personId: p.id, name: p.name, kind, date: ymd(next), days, years: y > 0 ? next.getFullYear() - y : null, ideas: ideas.slice(0, 4), partner: p.kind === 'partner' })
    }
  }
  return out.sort((a, b) => a.days - b.days)
}

function checkOccasions(notify: Notify): void {
  for (const o of upcomingOccasions(14)) {
    const tier = o.days === 0 ? 0 : o.days <= 3 ? 3 : o.days === 14 || (o.days <= 14 && o.days > 7) ? 14 : -1
    if (tier < 0 || !once(`occasion:${o.personId}:${o.kind}:${o.date}:${tier}`)) continue
    const first = o.name.split(' ')[0]
    const what = o.kind === 'birthday' ? `${first}’s birthday${o.years ? ` (${o.years})` : ''}` : `${o.partner ? 'Your' : `${first}’s`} anniversary${o.years ? ` — ${o.years} year${o.years === 1 ? '' : 's'}` : ''}`
    const when = o.days === 0 ? 'is today' : o.days === 1 ? 'is tomorrow' : `is in ${o.days} days`
    const idea = o.ideas.length ? `Gift ideas from your notes: ${o.ideas.slice(0, 3).join(', ')}.` : `Add gift ideas on ${first}’s page so you remember them next time.`
    notify(`${what} ${when}`, o.days === 0 ? `Don’t forget to say something nice! ${o.ideas.length ? idea : ''}`.trim() : idea, o.partner ? 'partner' : 'people')
  }
}

// ---------- Check-in and weekly review ----------

function checkEvening(notify: Notify): void {
  const t = new Date()
  const today = ymd(t)
  if (t.getHours() >= 21) {
    const row = getDb().prepare('SELECT mood FROM journal_entries WHERE deleted_at IS NULL AND owner_id = ? AND date = ?').get(getProfileId(), today) as { mood: number | null } | undefined
    if (!row?.mood && once(`checkin:${today}`)) notify('How was today?', 'A 20-second check-in: mood, energy, sleep. Or just say “Hey Bauer, I’m feeling…”', 'home')
  }
  // Sunday from 6pm: the week in review.
  if (t.getDay() === 0 && t.getHours() >= 18 && once(`review:${today}`)) notify('Your week in review is ready', 'What you got done, how you felt, and what’s coming next week.', 'review')
}

export function checkLifeReminders(notify: Notify): void {
  const p = getPrefs()
  try {
    if (p.notifyBudgets !== false) checkBudgets(notify)
    if (p.notifyPeople !== false) checkOccasions(notify)
    if (p.notifyCheckin !== false) checkEvening(notify)
  } catch (e) {
    console.error('Life reminders', e)
  }
}
