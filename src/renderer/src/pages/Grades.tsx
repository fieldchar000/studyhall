// GPA tracker: grade per module (from weighted assessments or a final override),
// mapped through a configurable grade scale, weighted by credits.

import { useEffect, useRef, useState } from 'react'
import type { GradeBand } from '@shared/types'
import { AutoNumber } from '@/components/AutoField'
import { Icon } from '@/components/ui'
import { api, db, notifyChanged, registerFlusher, track, useLive } from '@/lib/data'
import { bandFor, gpa, maxPoints, parseScale, PRESETS } from '@/lib/gpa'
import { fmtPct, summarize } from '@/lib/grades'
import { navigate } from '@/lib/nav'
import { useProfile } from '@/lib/profile'

export function GradesPage(): React.JSX.Element {
  const profile = useProfile()
  const [editingScale, setEditingScale] = useState(false)
  const { data } = useLive(
    ['modules', 'assessments'],
    async () => {
      const [modules, assessments] = await Promise.all([api.list('modules', {}, 'sort'), api.list('assessments')])
      return modules.map((m) => {
        const s = summarize(
          assessments.filter((a) => a.module_id === m.id),
          m.target_grade
        )
        // Complete when every weighted assessment has a score (or a final grade is entered).
        const complete = m.final_grade != null || (s.totalWeight > 0 && s.remainingWeight === 0)
        const pct = m.final_grade ?? s.average
        return { module: m, summary: s, pct, complete }
      })
    },
    []
  )
  if (!profile || !data) return <div />
  const scale = parseScale(profile.grade_scale)
  const top = maxPoints(scale)

  const completed = gpa(
    data.filter((r) => r.complete).map((r) => ({ credits: r.module.credits ?? 0, pct: r.pct })),
    scale
  )
  const projected = gpa(
    data.map((r) => ({ credits: r.module.credits ?? 0, pct: r.pct })),
    scale
  )
  const terms = [...new Set(data.map((r) => r.module.term || 'No term'))]

  const saveProfile = (patch: { grade_scale?: string; target_gpa?: number | null }): void =>
    void track(api.profile.update(patch)).then(() => notifyChanged('profiles'))

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Grades</h1>

      <div className="grid grid-cols-4 gap-3">
        <Stat label="GPA (completed modules)" value={completed.gpa?.toFixed(2) ?? '—'} hint={`out of ${top} · ${completed.credits} credits`} />
        <Stat label="Projected GPA" value={projected.gpa?.toFixed(2) ?? '—'} hint="including current averages" />
        <Stat label="Weighted average" value={fmtPct(projected.avg)} hint={bandFor(projected.avg, scale)?.label ?? 'by credits'} />
        <div className="card p-3">
          <div className="text-xs text-muted">Target GPA</div>
          <AutoNumber value={profile.target_gpa} onSave={(v) => saveProfile({ target_gpa: v })} min={0} step={0.1} placeholder="e.g. 3.5" className="field mt-1 -ml-2 text-xl font-semibold" />
          <div className={`mt-0.5 text-[11px] ${projected.gpa != null && profile.target_gpa != null ? (projected.gpa >= profile.target_gpa ? 'text-ok' : 'text-danger') : 'text-muted'}`}>
            {projected.gpa != null && profile.target_gpa != null
              ? projected.gpa >= profile.target_gpa
                ? 'On track ✓'
                : `${(profile.target_gpa - projected.gpa).toFixed(2)} below target`
              : 'set a goal'}
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Module</th>
              <th className="px-2 py-2 font-medium">Term</th>
              <th className="w-24 px-2 py-2 font-medium">Credits</th>
              <th className="px-2 py-2 font-medium">From assessments</th>
              <th className="w-28 px-2 py-2 font-medium" title="Enter a final mark from your transcript to override">
                Final mark %
              </th>
              <th className="px-2 py-2 font-medium">Grade</th>
              <th className="px-3 py-2 text-right font-medium">Points</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted">
                  Add modules (with credits) and their assessments to track your GPA.
                </td>
              </tr>
            )}
            {terms.map((term) => (
              <TermRows key={term} term={term} rows={data.filter((r) => (r.module.term || 'No term') === term)} scale={scale} showHeader={terms.length > 1} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-5">
        <div className="mb-3 flex items-center gap-3">
          <h2 className="flex-1 font-semibold">Grade scale</h2>
          <select
            className="field-boxed w-auto text-sm"
            value=""
            onChange={(e) => {
              if (!e.target.value) return
              saveProfile({ grade_scale: JSON.stringify(PRESETS[e.target.value].bands) })
              setEditingScale(false) // show the preset; "Edit" reopens with it loaded
            }}
          >
            <option value="">Use a preset…</option>
            {Object.entries(PRESETS).map(([k, p]) => (
              <option key={k} value={k}>
                {p.label}
              </option>
            ))}
          </select>
          <button className="btn" onClick={() => setEditingScale((e) => !e)}>
            {editingScale ? 'Done' : 'Edit'}
          </button>
        </div>
        {editingScale ? (
          <ScaleEditor scale={scale} onChange={(b) => saveProfile({ grade_scale: JSON.stringify(b) })} />
        ) : (
          <div className="flex flex-wrap gap-2 text-xs">
            {[...scale]
              .sort((a, b) => b.min - a.min)
              .map((b) => (
                <span key={b.label + b.min} className="rounded-md bg-canvas px-2 py-1">
                  <b>{b.label}</b> ≥ {b.min}% → {b.points}
                </span>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}

type Row = { module: { id: string; code: string; name: string; color: string; credits: number | null; final_grade: number | null; term: string }; summary: { average: number | null; remainingWeight: number; totalWeight: number }; pct: number | null; complete: boolean }

function TermRows({ term, rows, scale, showHeader }: { term: string; rows: Row[]; scale: GradeBand[]; showHeader: boolean }): React.JSX.Element {
  const t = gpa(
    rows.map((r) => ({ credits: r.module.credits ?? 0, pct: r.pct })),
    scale
  )
  return (
    <>
      {showHeader && (
        <tr className="bg-canvas text-xs">
          <td colSpan={5} className="px-3 py-1.5 font-semibold">
            {term}
          </td>
          <td colSpan={2} className="px-3 py-1.5 text-right text-muted">
            Term GPA {t.gpa?.toFixed(2) ?? '—'}
          </td>
        </tr>
      )}
      {rows.map(({ module: m, summary: s, pct, complete }) => {
        const band = bandFor(pct, scale)
        return (
          <tr key={m.id} className="border-b border-line last:border-0">
            <td className="px-3 py-1.5">
              <button className="flex items-center gap-2 text-left hover:text-accent" onClick={() => navigate({ name: 'module', id: m.id, tab: 'assessments' })}>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: m.color }} />
                <span className="truncate">{m.code ? `${m.code} · ${m.name}` : m.name}</span>
              </button>
            </td>
            <td className="px-2 py-1.5 text-muted">{m.term || '—'}</td>
            <td className="px-1 py-1">
              <AutoNumber value={m.credits} onSave={(v) => db.update('modules', m.id, { credits: v })} min={0} placeholder="—" />
            </td>
            <td className="px-2 py-1.5">
              {fmtPct(s.average)}
              <span className="ml-1.5 text-[11px] text-muted">{s.totalWeight ? (complete ? 'final' : `${s.remainingWeight}% left`) : 'no assessments'}</span>
            </td>
            <td className="px-1 py-1">
              <AutoNumber value={m.final_grade} onSave={(v) => db.update('modules', m.id, { final_grade: v })} min={0} max={100} placeholder="—" />
            </td>
            <td className="px-2 py-1.5 font-medium">{band?.label ?? '—'}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{band ? band.points.toFixed(1) : '—'}</td>
          </tr>
        )
      })}
    </>
  )
}

/** Edits a local copy; saves ~0.6s after the last change and when closed. */
function ScaleEditor({ scale, onChange }: { scale: GradeBand[]; onChange: (b: GradeBand[]) => void }): React.JSX.Element {
  const [sorted, setBands] = useState(() => [...scale].sort((a, b) => b.min - a.min))
  const latest = useRef(sorted)
  const dirty = useRef(false)
  const save = useRef(onChange)
  save.current = onChange
  useEffect(() => {
    if (!dirty.current) return
    const t = setTimeout(() => {
      dirty.current = false
      save.current(latest.current)
    }, 600)
    return () => clearTimeout(t)
  }, [sorted])
  useEffect(() => {
    const flush = async (): Promise<void> => {
      if (dirty.current) {
        dirty.current = false
        save.current(latest.current)
      }
    }
    const unregister = registerFlusher(flush)
    return () => {
      unregister()
      void flush()
    }
  }, [])
  const update = (next: GradeBand[]): void => {
    latest.current = next
    dirty.current = true
    setBands(next)
  }
  const set = (i: number, patch: Partial<GradeBand>): void => update(sorted.map((b, j) => (j === i ? { ...b, ...patch } : b)))
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-xs text-muted">
        <span>Label</span>
        <span>From % (at least)</span>
        <span>Points</span>
        <span />
      </div>
      {sorted.map((b, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
          <input className="field-boxed" value={b.label} onChange={(e) => set(i, { label: e.target.value })} />
          <input className="field-boxed" type="number" value={b.min} onChange={(e) => set(i, { min: Number(e.target.value) })} />
          <input className="field-boxed" type="number" step={0.1} value={b.points} onChange={(e) => set(i, { points: Number(e.target.value) })} />
          <button className="btn-ghost hover:text-danger" onClick={() => update(sorted.filter((_, j) => j !== i))} disabled={sorted.length <= 1}>
            <Icon name="trash" />
          </button>
        </div>
      ))}
      <button className="btn-ghost self-start" onClick={() => update([...sorted, { min: 0, label: 'New', points: 0 }])}>
        <Icon name="plus" /> Add band
      </button>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }): React.JSX.Element {
  return (
    <div className="card p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      <div className="mt-0.5 text-[11px] text-muted">{hint}</div>
    </div>
  )
}
