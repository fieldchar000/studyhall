// Module grade maths from weighted assessments.

import type { Assessment } from '@shared/types'

export interface GradeSummary {
  totalWeight: number // sum of all weights entered (should be 100)
  gradedWeight: number // weight of assessments that have a score
  remainingWeight: number // weight still to be earned
  average: number | null // average % across graded work (weighted)
  secured: number // % of the final module grade already earned
  needed: number | null // average % needed on remaining work to hit the target
  neededLabel: string // "the final" or "the remaining assessments"
}

export function summarize(assessments: Assessment[], target: number | null): GradeSummary {
  let totalWeight = 0
  let gradedWeight = 0
  let secured = 0
  for (const a of assessments) {
    const w = a.weight_pct ?? 0
    totalWeight += w
    if (a.score_pct != null) {
      gradedWeight += w
      secured += (a.score_pct * w) / 100
    }
  }
  const remainingWeight = Math.max(0, totalWeight - gradedWeight)
  const average = gradedWeight > 0 ? (secured / gradedWeight) * 100 : null
  const needed = target != null && remainingWeight > 0 ? ((target - secured) / remainingWeight) * 100 : null

  const ungraded = assessments.filter((a) => a.score_pct == null && (a.weight_pct ?? 0) > 0)
  const neededLabel = ungraded.length === 1 && ungraded[0].is_final ? 'the final' : 'the remaining assessments'
  return { totalWeight, gradedWeight, remainingWeight, average, secured, needed, neededLabel }
}

export const fmtPct = (n: number | null, digits = 1): string => (n == null ? '—' : `${n.toFixed(digits)}%`)
