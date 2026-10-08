// SM-2 spaced repetition (the classic SuperMemo 2 algorithm).
// Grades: Again = 1, Hard = 3, Good = 4, Easy = 5 (on SM-2's 0–5 scale).

import type { Flashcard } from '@shared/types'

export type Grade = 1 | 3 | 4 | 5

export const GRADES: { grade: Grade; label: string; key: string; tone: string }[] = [
  { grade: 1, label: 'Again', key: '1', tone: 'text-danger' },
  { grade: 3, label: 'Hard', key: '2', tone: 'text-amber-500' },
  { grade: 4, label: 'Good', key: '3', tone: 'text-ok' },
  { grade: 5, label: 'Easy', key: '4', tone: 'text-accent' }
]

const AGAIN_MINUTES = 10 // a failed card comes back later in the same session

export interface Review {
  ease: number
  repetitions: number
  interval_days: number
  due_at: string
  last_reviewed_at: string
}

export function review(card: Pick<Flashcard, 'ease' | 'repetitions' | 'interval_days'>, q: Grade, now = new Date()): Review {
  let { ease, repetitions, interval_days } = card
  if (q < 3) {
    repetitions = 0
    interval_days = 0
  } else {
    interval_days = repetitions === 0 ? 1 : repetitions === 1 ? 6 : Math.round(interval_days * ease)
    repetitions += 1
  }
  ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
  const due = new Date(now)
  if (q < 3) due.setMinutes(due.getMinutes() + AGAIN_MINUTES)
  else due.setDate(due.getDate() + interval_days)
  return { ease: Math.round(ease * 100) / 100, repetitions, interval_days, due_at: due.toISOString(), last_reviewed_at: now.toISOString() }
}

/** "10m", "1d", "6d", "3w", "2mo" — shown under each grade button. */
export function previewInterval(card: Pick<Flashcard, 'ease' | 'repetitions' | 'interval_days'>, q: Grade): string {
  const r = review(card, q)
  if (q < 3) return `${AGAIN_MINUTES}m`
  const d = r.interval_days
  if (d < 14) return `${d}d`
  if (d < 60) return `${Math.round(d / 7)}w`
  return `${Math.round(d / 30)}mo`
}

export const isDue = (c: Pick<Flashcard, 'due_at'>, now = Date.now()): boolean => !c.due_at || Date.parse(c.due_at) <= now
