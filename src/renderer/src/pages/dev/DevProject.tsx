// DevKit project extras (shown on a project's page in DevKit): what kind of project and
// how far along it is, the tech, live GitHub activity, a devlog and an experiment log.

import { useEffect, useMemo, useState } from 'react'
import type { Devlog, Experiment, Project, RepoInfo } from '@shared/types'
import { AutoNumber, AutoText } from '@/components/AutoField'
import { Icon } from '@/components/ui'
import { api, db, useLive } from '@/lib/data'
import { addDays, localDate } from '@/lib/dates'
import { ago } from './Feeds'

export const KINDS = [
  { id: 'game', label: 'Game', icon: '🎮' },
  { id: 'ai', label: 'AI', icon: '🤖' },
  { id: 'tool', label: 'Tool', icon: '🛠️' },
  { id: 'web', label: 'Web/app', icon: '🌐' },
  { id: 'other', label: 'Other', icon: '✨' }
]
export const STAGES = [
  { id: 'idea', label: 'Idea' },
  { id: 'prototype', label: 'Prototype' },
  { id: 'building', label: 'Building' },
  { id: 'polish', label: 'Polish' },
  { id: 'shipped', label: 'Shipped' }
]
const LOG_KINDS: { id: Devlog['kind']; label: string; icon: string }[] = [
  { id: 'log', label: 'Log', icon: '📝' },
  { id: 'win', label: 'Win', icon: '🏆' },
  { id: 'blocker', label: 'Blocker', icon: '🧱' },
  { id: 'idea', label: 'Idea', icon: '💡' }
]

export function DevPanel({ project: p }: { project: Project }): React.JSX.Element {
  const save = (patch: Partial<Project>): Promise<unknown> => db.update('projects', p.id, patch)
  const [tab, setTab] = useState<'log' | 'experiments'>(p.kind === 'ai' ? 'experiments' : 'log')
  const stageIdx = STAGES.findIndex((s) => s.id === p.stage)
  return (
    <div className="flex flex-col gap-5">
      <section className="card flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          {KINDS.map((k) => (
            <button
              key={k.id}
              onClick={() => void save({ kind: k.id })}
              className={`rounded-full border px-3 py-1 text-sm ${p.kind === k.id ? 'border-transparent bg-accent-soft font-semibold text-accent' : 'border-line text-muted hover:text-ink'}`}
            >
              {k.icon} {k.label}
            </button>
          ))}
        </div>
        {/* Stage pipeline */}
        <div className="flex items-center gap-1">
          {STAGES.map((s, i) => (
            <button key={s.id} onClick={() => void save({ stage: s.id })} className="flex flex-1 flex-col items-center gap-1.5" title={`Set stage: ${s.label}`}>
              <div
                className="h-2 w-full rounded-full transition-all"
                style={{ background: i <= stageIdx ? 'linear-gradient(90deg, var(--color-accent), var(--color-accent-2))' : 'var(--color-line)' }}
              />
              <span className={`text-xs ${i === stageIdx ? 'font-semibold text-ink' : 'text-muted'}`}>{s.label}</span>
            </button>
          ))}
        </div>
        <div className="grid gap-3 text-sm md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Tech stack (comma-separated)</span>
            <AutoText value={p.tech} onSave={(v) => save({ tech: v })} className="field-boxed" placeholder="Godot, GDScript, Aseprite / PyTorch, Python…" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">GitHub repository</span>
            <AutoText value={p.repo_url} onSave={(v) => save({ repo_url: v.trim() })} className="field-boxed" placeholder="https://github.com/you/your-game" />
          </label>
        </div>
        {p.tech && (
          <div className="flex flex-wrap gap-1.5">
            {p.tech
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
              .map((t) => (
                <span key={t} className="chip">
                  {t}
                </span>
              ))}
          </div>
        )}
      </section>

      {p.repo_url && <Repo url={p.repo_url} />}

      <section className="card p-5">
        <div className="mb-4 flex gap-1 rounded-lg bg-line/50 p-0.5 text-sm" style={{ width: 'fit-content' }}>
          {(
            [
              ['log', '📝 Devlog'],
              ['experiments', '🧪 Experiments']
            ] as const
          ).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1 ${tab === k ? 'bg-panel font-medium shadow-sm' : 'text-muted'}`}>
              {label}
            </button>
          ))}
        </div>
        {tab === 'log' ? <DevlogView projectId={p.id} /> : <Experiments projectId={p.id} />}
      </section>
    </div>
  )
}

function Repo({ url }: { url: string }): React.JSX.Element {
  const [info, setInfo] = useState<RepoInfo | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    setErr(null)
    api.github
      .repo(url)
      .then(setInfo)
      .catch((e: unknown) => setErr(String(e instanceof Error ? e.message : e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
  }, [url])
  if (err) return <div className="card p-4 text-sm text-muted">GitHub: {err}</div>
  if (!info) return <div className="card h-24 animate-pulse" />
  return (
    <section className="card flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <Icon name="code" />
        <button className="font-semibold hover:text-accent" onClick={() => window.open(info.html_url)}>
          {info.full_name} ↗
        </button>
        {info.language && <span className="chip">{info.language}</span>}
        <div className="flex-1" />
        <span className="text-sm">⭐ {info.stars}</span>
        <span className="text-sm">🍴 {info.forks}</span>
        <span className="text-sm">🐛 {info.open_issues}</span>
        {info.pushed_at && <span className="text-xs text-muted">pushed {ago(info.pushed_at)} ago</span>}
      </div>
      {info.description && <p className="text-sm text-muted">{info.description}</p>}
      {info.commits.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {info.commits.map((c) => (
            <li key={c.sha} className="flex items-center gap-2">
              <code className="rounded bg-line/60 px-1.5 text-[11px]">{c.sha}</code>
              <button className="min-w-0 flex-1 truncate text-left hover:text-accent" onClick={() => window.open(c.url)}>
                {c.message}
              </button>
              <span className="text-xs text-muted">{c.date && ago(c.date)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function DevlogView({ projectId }: { projectId: string }): React.JSX.Element {
  const logs = useLive(['devlogs'], () => api.list('devlogs', { project_id: projectId }, 'date'), [projectId]).data ?? []
  const [kind, setKind] = useState<Devlog['kind']>('log')
  const [text, setText] = useState('')
  const today = localDate(new Date())
  const days = useMemo(() => new Set(logs.map((l) => l.date)), [logs])
  const add = async (): Promise<void> => {
    if (!text.trim()) return
    await db.create('devlogs', { project_id: projectId, date: today, kind, content: text.trim() })
    setText('')
  }
  const byDate = [...new Set(logs.map((l) => l.date))].sort().reverse()
  const last14 = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13))
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1" title="Days you logged in the last two weeks">
        {last14.map((d) => (
          <span key={d} className="h-3 flex-1 rounded-sm" style={{ background: days.has(d) ? 'var(--color-accent)' : 'var(--color-line)' }} title={d} />
        ))}
        <span className="ml-2 text-xs text-muted">{last14.filter((d) => days.has(d)).length}/14 days</span>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex gap-1.5">
          {LOG_KINDS.map((k) => (
            <button key={k.id} onClick={() => setKind(k.id)} className={`rounded-full border px-2.5 py-0.5 text-xs ${kind === k.id ? 'border-transparent bg-accent-soft font-semibold text-accent' : 'border-line text-muted'}`}>
              {k.icon} {k.label}
            </button>
          ))}
        </div>
        <textarea
          className="field-boxed text-sm"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void add()
          }}
          placeholder="What did you do today? What’s blocking you? What’s next? (Ctrl+Enter to add)"
        />
        <button className="btn-primary self-end" disabled={!text.trim()} onClick={() => void add()}>
          Add to devlog
        </button>
      </div>
      {byDate.length === 0 && <p className="text-sm text-muted">A few lines a day keeps momentum — and makes coming back after a break easy.</p>}
      <div className="flex flex-col gap-4">
        {byDate.map((d) => (
          <div key={d}>
            <div className="mb-1 text-xs font-semibold text-muted">{d === today ? 'Today' : new Date(d + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
            <ul className="flex flex-col gap-1.5 border-l-2 border-line pl-4">
              {logs
                .filter((l) => l.date === d)
                .map((l) => (
                  <li key={l.id} className="group flex gap-2 text-sm">
                    <span>{LOG_KINDS.find((k) => k.id === l.kind)?.icon}</span>
                    <span className="min-w-0 flex-1 whitespace-pre-wrap">{l.content}</span>
                    <button className="btn-ghost invisible px-1 group-hover:visible" onClick={() => void db.remove('devlogs', l.id)}>
                      <Icon name="trash" size={12} />
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

const EXP_STATUS: Record<Experiment['status'], string> = { planned: '⏳ Planned', running: '🏃 Running', done: '✅ Done', failed: '❌ Failed' }

function Experiments({ projectId }: { projectId: string }): React.JSX.Element {
  const exps = useLive(['experiments'], () => api.list('experiments', { project_id: projectId }, 'date'), [projectId]).data ?? []
  const [open, setOpen] = useState<string | null>(null)
  const add = async (): Promise<void> => {
    const e = await db.create('experiments', { project_id: projectId, name: `Run ${exps.length + 1}`, date: localDate(new Date()), metric_name: exps.at(-1)?.metric_name ?? 'accuracy' })
    setOpen(e.id)
  }
  const scored = exps.filter((e) => e.metric_value != null)
  const best = scored.length ? scored.reduce((a, b) => ((b.metric_value ?? -Infinity) > (a.metric_value ?? -Infinity) ? b : a)) : null
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-sm text-muted">One row per run: what you tried, the settings, and the result. Change one thing at a time.</p>
        <button className="btn-primary" onClick={() => void add()}>
          <Icon name="plus" /> New run
        </button>
      </div>
      {scored.length > 1 && <MetricChart exps={scored} />}
      <div className="divide-y divide-line/60 rounded-xl border border-line">
        {exps.length === 0 && <div className="p-4 text-sm text-muted">No runs yet.</div>}
        {[...exps].reverse().map((e) => (
          <div key={e.id} className="text-sm">
            <button className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-line/30" onClick={() => setOpen(open === e.id ? null : e.id)}>
              <span className="w-24 shrink-0 text-xs">{EXP_STATUS[e.status]}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{e.name}</span>
              {e.metric_value != null && (
                <span className={`tabular-nums ${best?.id === e.id ? 'font-bold text-ok' : ''}`}>
                  {e.metric_name}: {e.metric_value}
                  {best?.id === e.id && ' ★'}
                </span>
              )}
              <span className="text-xs text-muted">{e.date}</span>
            </button>
            {open === e.id && (
              <div className="grid gap-2 bg-canvas/40 px-3 pb-3 md:grid-cols-2">
                <AutoText value={e.name} onSave={(v) => db.update('experiments', e.id, { name: v || 'Experiment' })} className="field-boxed" placeholder="Name" />
                <select className="field-boxed" value={e.status} onChange={(ev) => void db.update('experiments', e.id, { status: ev.target.value as Experiment['status'] })}>
                  {Object.entries(EXP_STATUS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <AutoText multiline rows={2} value={e.hypothesis} onSave={(v) => db.update('experiments', e.id, { hypothesis: v })} className="field-boxed md:col-span-2" placeholder="Hypothesis — what do you expect, and why?" />
                <AutoText multiline rows={3} value={e.config} onSave={(v) => db.update('experiments', e.id, { config: v })} className="field-boxed font-mono text-xs md:col-span-2" placeholder={'model: …\nlr: 3e-4\nbatch: 32\ndata: …'} />
                <div className="flex gap-2">
                  <AutoText value={e.metric_name} onSave={(v) => db.update('experiments', e.id, { metric_name: v })} className="field-boxed" placeholder="Metric" />
                  <AutoNumber value={e.metric_value} onSave={(v) => db.update('experiments', e.id, { metric_value: v })} className="field-boxed" placeholder="Value" step={0.001} />
                </div>
                <input type="date" className="field-boxed" value={e.date} onChange={(ev) => void db.update('experiments', e.id, { date: ev.target.value || e.date })} />
                <AutoText multiline rows={2} value={e.result} onSave={(v) => db.update('experiments', e.id, { result: v })} className="field-boxed md:col-span-2" placeholder="Result — what happened, what you learned, what to try next" />
                <button className="btn-ghost justify-self-start text-danger" onClick={() => void db.remove('experiments', e.id)}>
                  Delete run
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function MetricChart({ exps }: { exps: Experiment[] }): React.JSX.Element {
  const vals = exps.map((e) => e.metric_value as number)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const W = 100
  const H = 30
  const y = (v: number): number => (max === min ? H / 2 : H - ((v - min) / (max - min)) * (H - 4) - 2)
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="mb-1 flex justify-between text-[11px] text-muted">
        <span>{exps[0].metric_name} over runs</span>
        <span>
          {min} – {max}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-20 w-full" preserveAspectRatio="none">
        <polyline fill="none" stroke="var(--color-accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" points={vals.map((v, i) => `${(i / Math.max(1, vals.length - 1)) * W},${y(v)}`).join(' ')} />
      </svg>
    </div>
  )
}
