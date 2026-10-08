import type { Assessment, AssessmentKind, Module } from '@shared/types'
import { AutoNumber, AutoText } from '@/components/AutoField'
import { Icon } from '@/components/ui'
import { db, useRows } from '@/lib/data'
import { isoToLocalInput, localInputToIso } from '@/lib/dates'
import { fmtPct, summarize } from '@/lib/grades'

const KINDS: AssessmentKind[] = ['exam', 'assignment', 'quiz', 'presentation', 'lab', 'other']

export function AssessmentsTab({ module }: { module: Module }): React.JSX.Element {
  const assessments = useRows('assessments', { module_id: module.id }, 'due_at')
  if (!assessments) return <div />
  const s = summarize(assessments, module.target_grade)

  const add = (): void => void db.create('assessments', { module_id: module.id, title: 'New assessment' })

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Current average" value={fmtPct(s.average)} hint={`across ${s.gradedWeight}% graded`} />
        <Stat label="Secured so far" value={fmtPct(s.secured)} hint="of the final module grade" />
        <Stat label="Target" value={fmtPct(module.target_grade, 0)} hint="set in the header" />
        <Stat
          label={`Needed on ${s.neededLabel}`}
          value={neededText(s.needed)}
          hint={s.remainingWeight > 0 ? `average over ${s.remainingWeight}% left` : 'nothing left to grade'}
          tone={s.needed == null ? undefined : s.needed > 100 ? 'bad' : s.needed <= 0 ? 'good' : undefined}
        />
      </div>
      {assessments.length > 0 && Math.abs(s.totalWeight - 100) > 0.01 && (
        <div className="text-xs text-muted">
          Weights add up to {s.totalWeight}% — they usually total 100%.
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Title</th>
              <th className="px-2 py-2 font-medium">Type</th>
              <th className="px-2 py-2 font-medium">Due</th>
              <th className="w-24 px-2 py-2 font-medium">Weight %</th>
              <th className="w-24 px-2 py-2 font-medium">Score %</th>
              <th className="px-2 py-2 font-medium" title="Is this the final exam/assessment?">
                Final
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {assessments.map((a) => (
              <Row key={a.id} a={a} />
            ))}
            {assessments.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted">
                  Add each assessment with its weighting to see your grade and what you need on the final.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div>
        <button className="btn" onClick={add}>
          <Icon name="plus" /> Add assessment
        </button>
      </div>
    </div>
  )
}

function Row({ a }: { a: Assessment }): React.JSX.Element {
  const save = (patch: Partial<Assessment>): Promise<unknown> => db.update('assessments', a.id, patch)
  return (
    <tr className="group border-b border-line last:border-0">
      <td className="px-1 py-1">
        <AutoText value={a.title} onSave={(v) => save({ title: v || 'Untitled' })} />
      </td>
      <td className="px-1 py-1">
        <select
          className="field w-auto capitalize"
          value={a.kind}
          onChange={(e) => void save({ kind: e.target.value as AssessmentKind })}
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </td>
      <td className="px-1 py-1">
        <input
          type="datetime-local"
          className="field w-auto"
          value={isoToLocalInput(a.due_at)}
          onChange={(e) => void save({ due_at: localInputToIso(e.target.value) })}
        />
      </td>
      <td className="px-1 py-1">
        <AutoNumber value={a.weight_pct} onSave={(v) => save({ weight_pct: v })} min={0} max={100} placeholder="—" />
      </td>
      <td className="px-1 py-1">
        <AutoNumber value={a.score_pct} onSave={(v) => save({ score_pct: v })} min={0} max={100} placeholder="—" />
      </td>
      <td className="px-2 py-1 text-center">
        <input type="checkbox" checked={!!a.is_final} onChange={(e) => void save({ is_final: e.target.checked ? 1 : 0 })} />
      </td>
      <td className="px-1 py-1 text-right">
        <button
          className="btn-ghost opacity-0 group-hover:opacity-100 hover:text-danger"
          onClick={() => void db.remove('assessments', a.id)}
          title="Delete"
        >
          <Icon name="trash" />
        </button>
      </td>
    </tr>
  )
}

function neededText(needed: number | null): string {
  if (needed == null) return '—'
  if (needed <= 0) return 'Secured ✓'
  if (needed > 100) return `${needed.toFixed(0)}% ✗`
  return `${needed.toFixed(1)}%`
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: 'good' | 'bad' }): React.JSX.Element {
  return (
    <div className="card p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${tone === 'good' ? 'text-ok' : tone === 'bad' ? 'text-danger' : ''}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-muted">{hint}</div>
    </div>
  )
}
