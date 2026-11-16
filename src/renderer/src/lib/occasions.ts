// Upcoming birthdays and anniversaries, with gift ideas from what you've noted about the person.
// (The reminders in src/main/lifeReminders.ts use the same rules.)

import type { Person, PersonFact } from '@shared/types'
import { localDate } from './dates'

export interface Occasion {
  person: Person
  kind: 'birthday' | 'anniversary'
  date: string // next occurrence
  days: number
  years: number | null
  ideas: string[]
}

export function upcomingOccasions(people: Person[], facts: PersonFact[], withinDays = 30, today = new Date()): Occasion[] {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const out: Occasion[] = []
  for (const p of people) {
    if (p.archived) continue
    for (const kind of ['birthday', 'anniversary'] as const) {
      const d = p[kind]
      if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue
      const [y, m, day] = d.split('-').map(Number)
      let next = new Date(start.getFullYear(), m - 1, day)
      if (next < start) next = new Date(start.getFullYear() + 1, m - 1, day)
      const days = Math.round((next.getTime() - start.getTime()) / 864e5)
      if (days > withinDays) continue
      const rank = (c: string): number => (c === 'gifts' ? 0 : c === 'likes' ? 1 : c === 'food' ? 2 : 9)
      const ideas = facts
        .filter((f) => f.person_id === p.id && rank(f.category) < 9 && f.text.trim())
        .sort((a, b) => rank(a.category) - rank(b.category) || a.sort - b.sort)
        .map((f) => f.text.trim())
      out.push({ person: p, kind, date: localDate(next), days, years: y > 0 ? next.getFullYear() - y : null, ideas: ideas.slice(0, 4) })
    }
  }
  return out.sort((a, b) => a.days - b.days)
}

export const whenLabel = (days: number): string => (days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days < 7 ? `In ${days} days` : `In ${Math.round(days / 7) === 1 ? '1 week' : `${Math.round(days / 7)} weeks`}`)
