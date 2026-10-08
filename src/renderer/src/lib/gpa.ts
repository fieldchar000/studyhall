// Grade scales and GPA maths.

import type { GradeBand } from '@shared/types'

export const PRESETS: Record<string, { label: string; bands: GradeBand[] }> = {
  uk: {
    label: 'UK degree classification',
    bands: [
      { min: 70, label: 'First', points: 4.0 },
      { min: 60, label: '2:1', points: 3.3 },
      { min: 50, label: '2:2', points: 2.7 },
      { min: 40, label: 'Third', points: 2.0 },
      { min: 0, label: 'Fail', points: 0 }
    ]
  },
  us: {
    label: 'US letter grades (4.0)',
    bands: [
      { min: 93, label: 'A', points: 4.0 },
      { min: 90, label: 'A-', points: 3.7 },
      { min: 87, label: 'B+', points: 3.3 },
      { min: 83, label: 'B', points: 3.0 },
      { min: 80, label: 'B-', points: 2.7 },
      { min: 77, label: 'C+', points: 2.3 },
      { min: 73, label: 'C', points: 2.0 },
      { min: 70, label: 'C-', points: 1.7 },
      { min: 67, label: 'D+', points: 1.3 },
      { min: 63, label: 'D', points: 1.0 },
      { min: 60, label: 'D-', points: 0.7 },
      { min: 0, label: 'F', points: 0 }
    ]
  },
  au: {
    label: 'Australian 7-point',
    bands: [
      { min: 85, label: 'HD', points: 7 },
      { min: 75, label: 'D', points: 6 },
      { min: 65, label: 'C', points: 5 },
      { min: 50, label: 'P', points: 4 },
      { min: 0, label: 'F', points: 0 }
    ]
  }
}

export function parseScale(raw: string | null): GradeBand[] {
  if (raw) {
    try {
      const v = JSON.parse(raw)
      if (Array.isArray(v) && v.length) return v
    } catch {
      /* fall through to default */
    }
  }
  return PRESETS.uk.bands
}

/** The band a percentage falls in (bands sorted high → low). */
export function bandFor(pct: number | null, scale: GradeBand[]): GradeBand | null {
  if (pct == null) return null
  return [...scale].sort((a, b) => b.min - a.min).find((b) => pct >= b.min) ?? null
}

export const maxPoints = (scale: GradeBand[]): number => Math.max(...scale.map((b) => b.points), 0)

export interface GpaRow {
  credits: number
  pct: number | null
}

/** Credit-weighted GPA and average % over rows that have a grade. */
export function gpa(rows: GpaRow[], scale: GradeBand[]): { gpa: number | null; avg: number | null; credits: number } {
  let pts = 0
  let pctSum = 0
  let credits = 0
  for (const r of rows) {
    const band = bandFor(r.pct, scale)
    if (!band || r.pct == null) continue
    const c = r.credits || 1 // a module without credits counts once
    pts += band.points * c
    pctSum += r.pct * c
    credits += c
  }
  return { gpa: credits ? pts / credits : null, avg: credits ? pctSum / credits : null, credits }
}
