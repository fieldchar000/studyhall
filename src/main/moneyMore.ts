// Money, beyond logging: what's changed in your spending, subscriptions about to renew, how your savings goals are
// going, a receipt photo read into entries, and splitting a bill (reminders to collect from each person).
// For briefs, Nova and the Money page (PC; the receipt needs Claude).
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { claudeChat } from './claude'
import { create, getProfileId, list } from './db'
import { formatMoney } from './lifeReminders'
import { getPrefs } from './prefs'

const pad = (n: number): string => String(n).padStart(2, '0')
const ymd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
type Entry = { id: string; date: string; amount: number; kind: string; category: string; note: string; owner_id: string }
const mine = (): Entry[] => {
  const me = getProfileId()
  return list<Entry>('money_entries').filter((e) => e.owner_id === me && e.kind === 'expense')
}

/** This week against last week: the total and the category that moved most. Lines for briefs ([] when quiet). */
export function spendingInsights(): string[] {
  const now = new Date()
  const d0 = ymd(new Date(now.getTime() - 7 * 864e5))
  const d1 = ymd(new Date(now.getTime() - 14 * 864e5))
  const es = mine()
  const thisW = es.filter((e) => e.date > d0)
  const lastW = es.filter((e) => e.date > d1 && e.date <= d0)
  if (thisW.length < 3) return []
  const sum = (xs: Entry[]): number => xs.reduce((n, e) => n + e.amount, 0)
  const out = [`You spent ${formatMoney(sum(thisW))} this past week${lastW.length ? `, ${sum(thisW) >= sum(lastW) ? 'up' : 'down'} from ${formatMoney(sum(lastW))}` : ''}.`]
  const cats = [...new Set(thisW.map((e) => e.category))]
  const moved = cats
    .map((c) => ({ c, a: sum(thisW.filter((e) => e.category === c)), b: sum(lastW.filter((e) => e.category === c)) }))
    .filter((x) => x.b > 0 && x.a - x.b > 10)
    .sort((x, y) => (y.a - y.b) / y.b - (x.a - x.b) / x.b)[0]
  if (moved) {
    // (what most of it went on, from the notes)
    const notes = thisW.filter((e) => e.category === moved.c && e.note.trim()).map((e) => e.note.trim().toLowerCase().split(/\s+/)[0])
    const top = [...new Set(notes)].map((w) => [w, notes.filter((x) => x === w).length] as const).sort((a, b) => b[1] - a[1])[0]
    out.push(`${moved.c} is up ${Math.round(((moved.a - moved.b) / moved.b) * 100)}% on last week${top && top[1] >= 2 ? `, mostly ${top[0]}` : ''}.`)
  }
  return out
}

/** Payments that repeat every month (the same note and about the same amount, a month apart): the subscriptions. */
export function subscriptions(): { name: string; amount: number; next: string }[] {
  const by = new Map<string, Entry[]>()
  for (const e of mine()) {
    const k = e.note.trim().toLowerCase()
    if (k.length < 3) continue
    by.set(k, [...(by.get(k) ?? []), e])
  }
  const out: { name: string; amount: number; next: string }[] = []
  for (const [, xs] of by) {
    const s = [...xs].sort((a, b) => a.date.localeCompare(b.date))
    if (s.length < 2) continue
    const a = s[s.length - 2]
    const b = s[s.length - 1]
    const gap = (Date.parse(b.date) - Date.parse(a.date)) / 864e5
    if (gap < 26 || gap > 35 || Math.abs(a.amount - b.amount) > Math.max(1, b.amount * 0.1)) continue
    const next = new Date(Date.parse(b.date))
    next.setMonth(next.getMonth() + 1)
    out.push({ name: b.note.trim(), amount: b.amount, next: ymd(next) })
  }
  return out.sort((x, y) => x.next.localeCompare(y.next))
}

/** Savings goals in a line each: how far, and how long at the recent pace. */
export function savingsLines(): string[] {
  const me = getProfileId()
  return list<{ name: string; target: number; saved: number; deadline: string | null; owner_id: string }>('savings_goals')
    .filter((g) => g.owner_id === me && g.saved < g.target)
    .slice(0, 2)
    .map((g) => {
      const left = g.target - g.saved
      const weeks = g.deadline ? Math.max(1, Math.round((Date.parse(g.deadline) - Date.now()) / (7 * 864e5))) : null
      return `${formatMoney(left)} to go for ${g.name}${weeks ? `, about ${formatMoney(left / weeks)} a week to make it by ${new Date(g.deadline!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}.`
    })
}

// (the Money page's own categories)
const CATEGORIES = ['Food & drink', 'Groceries', 'Transport', 'Rent', 'Bills', 'Subscriptions', 'Fun', 'Shopping', 'Study', 'Health', 'Gifts', 'Other']
/** A receipt photo read into money entries (one per receipt, or per item group): what was added. */
export async function readReceipt(path: string): Promise<{ added: { amount: number; category: string; note: string; date: string }[]; error?: string }> {
  const ext = extname(path).slice(1).toLowerCase()
  const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
  if (!['png', 'jpg', 'jpeg', 'webp'].includes(ext)) return { added: [], error: 'That isn’t a photo (a JPG, PNG or WebP).' }
  const b64 = (await readFile(path)).toString('base64')
  const used = new Set(list<{ category: string }>('money_entries').map((e) => e.category))
  const cats = [...new Set([...used, ...CATEGORIES])]
  const raw = await claudeChat(
    [
      {
        role: 'system',
        content: `Read this receipt. Give the total as one entry (or, for a receipt that clearly mixes very different things, one entry per group): amount (a number, the currency's units), category (one of: ${cats.join(', ')}), note (the shop, and what, in a few words), date (YYYY-MM-DD from the receipt; today ${ymd(new Date())} if none). If it isn't a receipt, return none.`
      },
      { role: 'user', content: [{ type: 'image_url', image_url: { url: `data:${type};base64,${b64}` } }] }
    ],
    {
      type: 'object',
      properties: {
        entries: {
          type: 'array',
          items: {
            type: 'object',
            properties: { amount: { type: 'number' }, category: { type: 'string' }, note: { type: 'string' }, date: { type: 'string' } },
            required: ['amount', 'category', 'note', 'date']
          }
        }
      },
      required: ['entries']
    },
    { ...getPrefs(), novaBrain: 'haiku', novaEffort: 'low' },
    'chat'
  ).catch(() => '')
  try {
    const j = JSON.parse(raw) as { entries?: { amount: number; category: string; note: string; date: string }[] }
    const added = (j.entries ?? [])
      .filter((e) => Number(e.amount) > 0)
      .map((e) => ({
        amount: Math.round(Number(e.amount) * 100) / 100,
        category: cats.includes(e.category) ? e.category : 'Other',
        note: String(e.note ?? '').slice(0, 80),
        date: /^\d{4}-\d\d-\d\d$/.test(e.date) ? e.date : ymd(new Date())
      }))
    for (const e of added) create('money_entries', { ...e, kind: 'expense' })
    return added.length ? { added } : { added, error: 'That doesn’t look like a receipt.' }
  } catch {
    return { added: [], error: 'Couldn’t read that receipt just now.' }
  }
}

/** Splitting a bill you paid: a task to collect each person's share (tomorrow), and the line for Nova. */
export function splitBill(o: { total: number; people: string[]; what?: string; includeMe?: boolean }): string {
  const names = o.people.map((p) => p.trim()).filter(Boolean)
  if (!names.length || !(o.total > 0)) return 'Ask who it was split with and the total.'
  const share = Math.round((o.total / (names.length + (o.includeMe === false ? 0 : 1))) * 100) / 100
  const due = new Date(Date.now() + 864e5)
  due.setHours(12, 0, 0, 0)
  for (const n of names) create('tasks', { title: `Collect ${formatMoney(share)} from ${n}${o.what ? ` (${o.what})` : ''}`, due_at: due.toISOString(), status: 'todo', mode: 'life' })
  return `Each share is ${formatMoney(share)}. Added a reminder to collect from ${names.join(', ')} tomorrow.`
}

/** Subscriptions renewing in the next two days (for Nova speaking up). */
export const renewingSoon = (): { name: string; amount: number; next: string }[] => {
  const soon = ymd(new Date(Date.now() + 2 * 864e5))
  const today = ymd(new Date())
  return subscriptions().filter((s) => s.next >= today && s.next <= soon)
}
