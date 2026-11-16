// Spreads revision for several exams across the weeks before them.
//  • each exam's topics (its module's week titles) get a first pass, then a spaced second review
//  • the last two study days before an exam are a timed past paper and a final review
//  • every session goes to the exam that needs it most right now:
//      (sessions still to do) ÷ (study days left before that exam)
//    so close exams get priority, but subjects stay mixed (interleaving helps memory)
//  • a weekly budget of sessions, spread evenly over your study days (rest day skipped)

import { addDays, localDate } from './dates'

export interface PlanExam {
  id: string
  title: string
  date: string // YYYY-MM-DD of the exam
  moduleId: string
  moduleLabel: string
  color: string
  topics: string[]
  weight: number // e.g. module credits (bigger = a bit more time)
}

export interface PlanSession {
  date: string
  examId: string
  title: string
  kind: 'learn' | 'review' | 'paper' | 'final' | 'extra'
}

export interface PlanOptions {
  start: string // first study day
  perWeek: number // sessions a week
  restDay: number | null // 0 = Sunday … 6 = Saturday, or null for none
}

const dow = (d: string): number => new Date(`${d}T00:00`).getDay()

export function planRevision(exams: PlanExam[], o: PlanOptions): PlanSession[] {
  const upcoming = exams.filter((e) => e.date > o.start).sort((a, b) => a.date.localeCompare(b.date))
  if (!upcoming.length) return []
  const last = upcoming[upcoming.length - 1].date
  const studyDays: string[] = []
  for (let d = o.start; d < last; d = addDays(d, 1)) if (dow(d) !== o.restDay) studyDays.push(d)
  const daysPerWeek = 7 - (o.restDay == null ? 0 : 1)
  const perDay = o.perWeek / daysPerWeek // e.g. 1.5 → alternate 1 and 2

  // Queues per exam
  type Q = { exam: PlanExam; queue: { title: string; kind: PlanSession['kind'] }[]; done: number; lastDay: string }
  const qs: Q[] = upcoming.map((exam) => {
    const topics = exam.topics.length ? exam.topics : Array.from({ length: 4 }, (_, i) => `part ${i + 1}`)
    const label = exam.moduleLabel
    return {
      exam,
      done: 0,
      lastDay: '',
      queue: [
        ...topics.map((t) => ({ title: `${label}: revise ${t}`, kind: 'learn' as const })),
        ...topics.map((t) => ({ title: `${label}: test yourself on ${t}`, kind: 'review' as const }))
      ]
    }
  })
  // The two study days right before each exam are reserved for it.
  const reserved = new Map<string, { exam: PlanExam; title: string; kind: PlanSession['kind'] }[]>()
  for (const q of qs) {
    const before = studyDays.filter((d) => d < q.exam.date)
    const [paperDay, finalDay] = before.slice(-2)
    const add = (d: string | undefined, title: string, kind: PlanSession['kind']): void => {
      if (!d) return
      reserved.set(d, [...(reserved.get(d) ?? []), { exam: q.exam, title, kind }])
    }
    if (before.length >= 4) add(paperDay, `${q.exam.moduleLabel}: timed past paper`, 'paper')
    add(finalDay ?? paperDay, `${q.exam.moduleLabel}: final review — key points & mistakes`, 'final')
  }

  const out: PlanSession[] = []
  let carry = 0
  let prevExam = ''
  studyDays.forEach((day, i) => {
    carry += perDay
    let slots = Math.floor(carry + 1e-9)
    carry -= slots
    for (const r of reserved.get(day) ?? []) {
      out.push({ date: day, examId: r.exam.id, title: r.title, kind: r.kind })
      slots--
    }
    for (let s = 0; s < slots; s++) {
      const open = qs.filter((q) => q.exam.date > day)
      if (!open.length) break
      // Urgency: work left ÷ study days left (+ weight), lightly avoiding the same exam twice in a row.
      const daysLeft = (q: Q): number => Math.max(1, studyDays.slice(i).filter((d) => d < q.exam.date).length - 2)
      let best: Q | null = null
      let score = -Infinity
      for (const q of open) {
        const left = q.queue.length || 0.3 // finished queues still get extra review, rarely
        const sc = (left / daysLeft(q)) * (0.8 + 0.2 * q.exam.weight) - (q.exam.id === prevExam && open.length > 1 ? 0.15 : 0) - (q.lastDay === day ? 0.3 : 0)
        if (sc > score) {
          score = sc
          best = q
        }
      }
      if (!best) break
      const item = best.queue.shift() ?? { title: `${best.exam.moduleLabel}: mixed practice questions`, kind: 'extra' as const }
      out.push({ date: day, examId: best.exam.id, title: item.title, kind: item.kind })
      best.done++
      best.lastDay = day
      prevExam = best.exam.id
    }
  })
  return out
}

/** Sessions that won't fit before an exam (topics left unplanned). */
export function unplanned(exams: PlanExam[], sessions: PlanSession[]): { exam: PlanExam; missing: number }[] {
  return exams
    .map((e) => {
      const topics = e.topics.length || 4
      const got = sessions.filter((s) => s.examId === e.id && (s.kind === 'learn' || s.kind === 'review')).length
      return { exam: e, missing: Math.max(0, topics * 2 - got) }
    })
    .filter((x) => x.missing > 0)
}

export const todayStr = (): string => localDate(new Date())
