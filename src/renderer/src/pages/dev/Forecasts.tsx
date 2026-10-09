// DevKit → Forecasts: write down what you think will happen (with a probability and a
// date), resolve it later, and see how well-calibrated you are. Best practice from
// forecasting research: specific questions, explicit probabilities, honest scoring.

import { useMemo, useState } from 'react'
import type { FeedTopic, Prediction } from '@shared/types'
import { AutoText } from '@/components/AutoField'
import { Icon } from '@/components/ui'
import { api, db, useLive } from '@/lib/data'
import { localDate } from '@/lib/dates'
import { topicOf, TOPICS } from '@/lib/devContent'

/** Brier score: mean squared error of probabilities (0 perfect, 0.25 = always saying 50%). */
export const brier = (ps: Prediction[]): number | null => {
  const r = ps.filter((p) => p.outcome != null)
  return r.length ? r.reduce((s, p) => s + (p.probability / 100 - (p.outcome as number)) ** 2, 0) / r.length : null
}

const EXAMPLES = [
  'Will a new frontier AI model top the main public leaderboards before the end of the year?',
  'Will the two leaders meet in person before the summit date?',
  'Will my game hit 100 wishlists by the end of next month?',
  'Will the central bank cut rates at its next meeting?'
]

export function ForecastsPage(): React.JSX.Element {
  const all = useLive(['predictions'], () => api.list('predictions', {}, 'created_at'), []).data ?? []
  const [question, setQuestion] = useState('')
  const [p, setP] = useState(60)
  const [topic, setTopic] = useState<FeedTopic>('ai')
  const [by, setBy] = useState(localDate(new Date(Date.now() + 30 * 864e5)))
  const [why, setWhy] = useState('')
  const [tab, setTab] = useState<'open' | 'resolved'>('open')
  const today = localDate(new Date())

  const add = async (): Promise<void> => {
    if (!question.trim()) return
    await db.create('predictions', { question: question.trim(), probability: p, topic, resolve_by: by || null, reasoning: why.trim() })
    setQuestion('')
    setWhy('')
  }
  const open = all.filter((x) => x.outcome == null).sort((a, b) => (a.resolve_by ?? '9').localeCompare(b.resolve_by ?? '9'))
  const resolved = all.filter((x) => x.outcome != null).reverse()
  const score = brier(all)

  return (
    <div className="mx-auto grid max-w-6xl gap-6 p-8 lg:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-3xl">Forecasts</h1>
          <p className="text-sm text-muted">Turn opinions into testable predictions. Over time you’ll learn when your 70% really means 70%.</p>
        </div>

        <section className="card flex flex-col gap-3 p-5">
          <textarea className="field-boxed text-[15px]" rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={EXAMPLES[new Date().getDate() % EXAMPLES.length]} />
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex flex-1 items-center gap-3">
              <span className="text-sm text-muted">Chance</span>
              <input type="range" min={1} max={99} value={p} onChange={(e) => setP(Number(e.target.value))} className="flex-1 accent-[var(--color-accent)]" />
              <span className="w-12 text-right text-xl font-bold tabular-nums">{p}%</span>
            </label>
            <select className="field-boxed w-auto" value={topic} onChange={(e) => setTopic(e.target.value as FeedTopic)}>
              {TOPICS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.icon} {t.label}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-muted">
              Resolves by
              <input type="date" className="field-boxed w-auto" value={by} min={today} onChange={(e) => setBy(e.target.value)} />
            </label>
          </div>
          <input className="field-boxed text-sm" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why? (base rate, key evidence, what would change your mind)" />
          <button className="btn-primary self-end" disabled={!question.trim()} onClick={() => void add()}>
            <Icon name="plus" /> Make forecast
          </button>
        </section>

        <div className="flex gap-0.5 self-start rounded-lg bg-line/50 p-0.5 text-sm">
          {(['open', 'resolved'] as const).map((k) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1 capitalize ${tab === k ? 'bg-panel font-medium shadow-sm' : 'text-muted'}`}>
              {k} ({k === 'open' ? open.length : resolved.length})
            </button>
          ))}
        </div>
        {(tab === 'open' ? open : resolved).map((x) => (
          <ForecastRow key={x.id} x={x} overdue={!!x.resolve_by && x.resolve_by <= today && x.outcome == null} />
        ))}
        {(tab === 'open' ? open : resolved).length === 0 && <div className="text-sm text-muted">{tab === 'open' ? 'No open forecasts.' : 'Resolve a forecast to start scoring yourself.'}</div>}
      </div>

      <aside className="flex flex-col gap-5">
        <section className="card p-5">
          <h2 className="font-bold">Your score</h2>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-4xl font-bold tabular-nums">{score == null ? '—' : score.toFixed(3)}</span>
            <span className="text-xs text-muted">Brier (lower is better)</span>
          </div>
          <p className="mt-1 text-xs text-muted">0 is perfect; always answering 50% scores 0.250. Below 0.20 is good, below 0.15 is excellent.</p>
          <Calibration all={all} />
        </section>
        <section className="card p-5 text-sm">
          <h2 className="mb-2 font-bold">Good forecasting habits</h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-4 text-muted">
            <li>Make it specific and checkable: who, what, by when.</li>
            <li>Start from the base rate — how often does this kind of thing happen?</li>
            <li>Use the whole range: 60% and 90% mean very different things.</li>
            <li>Update in small steps as news arrives (edit the % and note why).</li>
            <li>Resolve honestly, especially the misses.</li>
          </ul>
        </section>
      </aside>
    </div>
  )
}

function ForecastRow({ x, overdue }: { x: Prediction; overdue: boolean }): React.JSX.Element {
  const t = topicOf(x.topic)
  const resolve = (outcome: 0 | 1): void => void db.update('predictions', x.id, { outcome, resolved_at: new Date().toISOString() })
  const right = x.outcome != null && (x.outcome === 1 ? x.probability >= 50 : x.probability < 50)
  return (
    <div className={`card group flex flex-col gap-2 p-4 ${overdue ? 'border-amber-500/50' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="flex w-14 shrink-0 flex-col items-center rounded-xl py-1.5" style={{ background: 'var(--color-accent-soft)' }}>
          <span className="text-lg font-bold tabular-nums">{Math.round(x.probability)}%</span>
        </div>
        <div className="min-w-0 flex-1">
          <AutoText multiline rows={2} value={x.question} onSave={(v) => db.update('predictions', x.id, { question: v })} className="field resize-none font-semibold" />
          <div className="flex flex-wrap items-center gap-2 px-2 text-xs text-muted">
            <span style={{ color: t.color }}>
              {t.icon} {t.label}
            </span>
            {x.resolve_by && <span className={overdue ? 'font-medium text-amber-600' : ''}>· by {new Date(x.resolve_by + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
            {x.outcome != null && <span className={right ? 'text-ok' : 'text-danger'}>· {x.outcome ? 'Happened' : 'Didn’t happen'} — {right ? 'called it' : 'missed'}</span>}
          </div>
        </div>
        <button className="btn-ghost invisible px-1 group-hover:visible" onClick={() => confirm('Delete this forecast?') && void db.remove('predictions', x.id)}>
          <Icon name="trash" size={13} />
        </button>
      </div>
      {x.reasoning && <p className="pl-[4.25rem] text-sm text-muted">{x.reasoning}</p>}
      {x.outcome == null ? (
        <div className="flex flex-wrap items-center gap-2 pl-[4.25rem]">
          <input
            type="range"
            min={1}
            max={99}
            defaultValue={x.probability}
            onMouseUp={(e) => void db.update('predictions', x.id, { probability: Number((e.target as HTMLInputElement).value) })}
            className="w-40 accent-[var(--color-accent)]"
            title="Update your forecast"
          />
          <div className="flex-1" />
          <span className="text-xs text-muted">Resolve:</span>
          <button className="btn border-ok/40 px-2 py-0.5 text-xs text-ok" onClick={() => resolve(1)}>
            ✓ Happened
          </button>
          <button className="btn border-danger/40 px-2 py-0.5 text-xs text-danger" onClick={() => resolve(0)}>
            ✗ Didn’t
          </button>
        </div>
      ) : (
        <button className="self-start pl-[4.25rem] text-xs text-muted hover:text-ink" onClick={() => void db.update('predictions', x.id, { outcome: null, resolved_at: null })}>
          Undo resolution
        </button>
      )}
    </div>
  )
}

/** Predicted vs actual in 10%-wide buckets. On the diagonal = perfectly calibrated. */
function Calibration({ all }: { all: Prediction[] }): React.JSX.Element | null {
  const buckets = useMemo(() => {
    const r = all.filter((p) => p.outcome != null)
    return Array.from({ length: 10 }, (_, i) => {
      const inB = r.filter((p) => Math.min(9, Math.floor(p.probability / 10)) === i)
      return { mid: i * 10 + 5, n: inB.length, actual: inB.length ? (inB.filter((p) => p.outcome === 1).length / inB.length) * 100 : null }
    })
  }, [all])
  if (!buckets.some((b) => b.n)) return null
  const S = 160
  return (
    <div className="mt-4">
      <div className="mb-1 text-xs font-medium">Calibration</div>
      <svg viewBox={`0 0 ${S} ${S}`} className="w-full max-w-60 rounded-lg bg-canvas/60">
        <line x1="0" y1={S} x2={S} y2="0" stroke="var(--color-line)" strokeDasharray="4 4" />
        {buckets
          .filter((b) => b.actual != null)
          .map((b) => (
            <circle key={b.mid} cx={(b.mid / 100) * S} cy={S - (b.actual! / 100) * S} r={3 + Math.min(6, b.n)} fill="var(--color-accent)" opacity="0.75">
              <title>
                You said ~{b.mid}%: happened {Math.round(b.actual!)}% of the time ({b.n})
              </title>
            </circle>
          ))}
      </svg>
      <p className="mt-1 text-[11px] text-muted">Dots above the line: things happened more often than you said (under-confident); below: over-confident.</p>
    </div>
  )
}
