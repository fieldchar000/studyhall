// Read-only calendar subscriptions: download ICS feeds (Google, Outlook, Apple, ...),
// expand recurring events, and cache the occurrences locally so they show offline.

import ICAL from 'ical.js'
import { net } from 'electron'
import { randomUUID } from 'node:crypto'
import { getDb, list, now, tx } from './db'
import type { CalendarSubscription } from '@shared/types'

const DAY = 24 * 60 * 60 * 1000
const PAST_DAYS = 90 // keep this much history
const FUTURE_DAYS = 400 // and this far ahead
const MAX_STEPS_PER_EVENT = 5000 // safety cap for long-running recurrences

interface Occurrence {
  uid: string
  title: string
  start_at: string
  end_at: string
  all_day: number
  location: string | null
}

/** Date-only values stay 'YYYY-MM-DD' (all-day); timed values become ISO UTC. */
function timeToString(t: ICAL.Time): string {
  return t.isDate ? t.toString().slice(0, 10) : t.toJSDate().toISOString()
}

function parseIcs(text: string): Occurrence[] {
  const root = new ICAL.Component(ICAL.parse(text))
  // Feeds ship their own timezone definitions; register them so times convert correctly.
  for (const tz of root.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(tz)

  const windowStart = ICAL.Time.fromJSDate(new Date(Date.now() - PAST_DAYS * DAY), true)
  const windowEnd = ICAL.Time.fromJSDate(new Date(Date.now() + FUTURE_DAYS * DAY), true)

  // Split into master events and "this one occurrence was changed" exceptions.
  const masters = new Map<string, ICAL.Event>()
  const exceptions: ICAL.Component[] = []
  for (const comp of root.getAllSubcomponents('vevent')) {
    if (comp.hasProperty('recurrence-id')) exceptions.push(comp)
    else masters.set(String(comp.getFirstPropertyValue('uid') ?? randomUUID()), new ICAL.Event(comp))
  }
  const orphans: ICAL.Event[] = []
  for (const exc of exceptions) {
    const master = masters.get(String(exc.getFirstPropertyValue('uid')))
    if (master) master.relateException(exc)
    else orphans.push(new ICAL.Event(exc))
  }

  const out: Occurrence[] = []
  const push = (ev: ICAL.Event, start: ICAL.Time, end: ICAL.Time): void => {
    if (String(ev.component.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED') return
    if (end.compare(windowStart) < 0 || start.compare(windowEnd) > 0) return
    let endStr = timeToString(end)
    const startStr = timeToString(start)
    if (endStr <= startStr) {
      // Missing/zero-length end: all-day -> 1 day, timed -> 1 hour
      const e = start.clone()
      if (start.isDate) e.day += 1
      else e.hour += 1
      endStr = timeToString(e)
    }
    out.push({
      uid: ev.uid ?? '',
      title: ev.summary || '(no title)',
      start_at: startStr,
      end_at: endStr,
      all_day: start.isDate ? 1 : 0,
      location: ev.location || null
    })
  }

  for (const ev of [...masters.values(), ...orphans]) {
    if (!ev.isRecurring()) {
      push(ev, ev.startDate, ev.endDate)
      continue
    }
    const it = ev.iterator()
    let next: ICAL.Time | null
    let steps = 0
    while ((next = it.next()) && steps++ < MAX_STEPS_PER_EVENT) {
      if (next.compare(windowEnd) > 0) break
      const d = ev.getOccurrenceDetails(next)
      push(d.item, d.startDate, d.endDate)
    }
  }
  return out
}

async function refreshOne(sub: CalendarSubscription): Promise<void> {
  const db = getDb()
  try {
    // webcal:// is just https:// for calendar apps
    const url = sub.url.trim().replace(/^webcal:\/\//i, 'https://')
    if (!/^https?:\/\//i.test(url)) throw new Error('Link must start with https:// or webcal://')
    const res = await net.fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`Server replied ${res.status}`)
    const text = await res.text()
    if (!text.includes('BEGIN:VCALENDAR')) throw new Error("That link isn't an ICS calendar feed")
    const occurrences = parseIcs(text)

    tx(() => {
      db.prepare('DELETE FROM subscription_events WHERE subscription_id = ?').run(sub.id)
      const insert = db.prepare(
        `INSERT INTO subscription_events (id, subscription_id, uid, title, start_at, end_at, all_day, location)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      for (const o of occurrences) {
        insert.run(randomUUID(), sub.id, o.uid, o.title, o.start_at, o.end_at, o.all_day, o.location)
      }
      // Fetch status is device-local, so it doesn't bump updated_at / queue a sync.
      db.prepare('UPDATE calendar_subscriptions SET last_fetched_at = ?, last_error = NULL WHERE id = ?').run(
        now(),
        sub.id
      )
    })
  } catch (err) {
    // Keep the old cached events (offline still works) and record the error.
    const msg = err instanceof Error ? err.message : String(err)
    db.prepare('UPDATE calendar_subscriptions SET last_error = ? WHERE id = ?').run(msg, sub.id)
  }
}

/** Refresh one subscription, or all enabled ones. Errors are stored per feed, never thrown. */
export async function refreshSubscriptions(id?: string): Promise<void> {
  const subs = list<CalendarSubscription>('calendar_subscriptions').filter(
    (s) => (id ? s.id === id : s.enabled === 1)
  )
  await Promise.all(subs.map(refreshOne))
}
