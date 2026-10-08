// Study → Exam Prep: a library of past papers, mark schemes and practice sheets.
//  • Sit a paper on a timer, then log your score (tracked over time per module).
//  • "Make a quiz" finds the questions in a paper and the answers in its mark scheme;
//    you check them, then practise them as a quiz. Questions you miss come back later
//    (spaced repetition), and any question set can become flashcards.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ExamPaper, Module, PaperAttempt, PaperKind, QuizQuestion } from '@shared/types'
import { AutoNumber, AutoText } from '@/components/AutoField'
import { Icon } from '@/components/ui'
import { api, db, track, useLive } from '@/lib/data'
import { localDate } from '@/lib/dates'
import { docToText } from '@/lib/importDoc'
import { navigate } from '@/lib/nav'
import { attachAnswers, correctOption, parseAnswers, parseQuestions, type ParsedQuestion } from '@/lib/quizParse'
import { review, type Grade } from '@/lib/sm2'

export const KIND_LABEL: Record<PaperKind, string> = {
  past_paper: 'Past paper',
  mark_scheme: 'Mark scheme',
  mock: 'Mock',
  practice: 'Practice',
  other: 'Other'
}
const KIND_TONE: Record<PaperKind, string> = {
  past_paper: 'bg-accent-soft text-accent',
  mark_scheme: 'bg-ok/10 text-ok',
  mock: 'bg-amber-500/15 text-amber-600',
  practice: 'bg-sky-500/15 text-sky-600',
  other: 'bg-line text-muted'
}

const errText = (e: unknown): string => String(e instanceof Error ? e.message : e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
const pct = (a: PaperAttempt): number | null => (a.score != null && a.max_score ? (a.score / a.max_score) * 100 : null)
const viewerSrc = (p: ExamPaper): string => `material://local/${p.id}/${encodeURIComponent(p.file_name)}`
const canPreview = (p: ExamPaper): boolean => /\.(pdf|html?|txt)$/i.test(p.file_name)
const isDue = (q: QuizQuestion): boolean => q.times_seen > 0 && !!q.due_at && Date.parse(q.due_at) <= Date.now()

function useExamData(): { papers: ExamPaper[]; modules: Module[]; attempts: PaperAttempt[]; questions: QuizQuestion[] } | undefined {
  return useLive(
    ['exam_papers', 'modules', 'paper_attempts', 'quiz_questions'],
    async () => {
      const [papers, modules, attempts, questions] = await Promise.all([
        api.list('exam_papers', {}, 'sort'),
        api.list('modules', { archived: 0 }, 'sort'),
        api.list('paper_attempts', {}, 'date'),
        api.list('quiz_questions', {}, 'sort')
      ])
      return { papers, modules, attempts, questions }
    },
    []
  ).data
}

// ---------- Library ----------

export function ExamsPage(): React.JSX.Element {
  const data = useExamData()
  const [moduleId, setModuleId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  if (!data) return <div />

  const add = async (work: Promise<ExamPaper[]>): Promise<void> => {
    setError(null)
    setBusy(true)
    try {
      await track(work)
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const shown = data.papers.filter((p) => !moduleId || p.module_id === moduleId)
  const byId = new Map(data.papers.map((p) => [p.id, p]))
  // Mark schemes paired with a paper are shown on that paper's card.
  const cards = shown.filter((p) => !(p.kind === 'mark_scheme' && p.paired_id && byId.get(p.paired_id)))
  const groups = [...data.modules.map((m) => ({ id: m.id as string | null, name: m.code ? `${m.code} · ${m.name}` : m.name, color: m.color })), { id: null, name: 'No module', color: 'var(--color-muted)' }]
    .map((g) => ({ ...g, papers: cards.filter((p) => p.module_id === g.id).sort((a, b) => b.year.localeCompare(a.year) || a.title.localeCompare(b.title)) }))
    .filter((g) => g.papers.length)
  const due = data.questions.filter((q) => (!moduleId || q.module_id === moduleId) && isDue(q))
  const recent = data.attempts.filter((a) => (!moduleId || a.module_id === moduleId) && pct(a) != null)
  const avg = recent.length ? recent.slice(-10).reduce((s, a) => s + pct(a)!, 0) / Math.min(10, recent.length) : null

  return (
    <div
      className="relative mx-auto max-w-5xl p-8"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setDragging(true)
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const paths = [...e.dataTransfer.files].map((f) => api.materials.pathForFile(f)).filter(Boolean)
        if (paths.length) void add(api.papers.importPaths(moduleId || null, paths))
      }}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-3 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-accent-soft/80 text-sm font-medium text-accent">
          Drop past papers and mark schemes here
        </div>
      )}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Exam Prep</h1>
        <select className="field-boxed w-auto" value={moduleId} onChange={(e) => setModuleId(e.target.value)}>
          <option value="">All modules</option>
          {data.modules.map((m) => (
            <option key={m.id} value={m.id}>
              {m.code ? `${m.code} · ` : ''}
              {m.name}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <button className="btn" disabled={!due.length} onClick={() => navigate({ name: 'quiz', review: true, moduleId: moduleId || undefined })}>
          <Icon name="refresh" /> Review missed {due.length ? `(${due.length})` : ''}
        </button>
        <button className="btn-primary" disabled={busy} onClick={() => void add(api.papers.pick(moduleId || null))}>
          <Icon name="plus" /> {busy ? 'Adding…' : 'Add papers'}
        </button>
      </div>
      {error && <div className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Papers" value={String(shown.filter((p) => p.kind !== 'mark_scheme').length)} hint={`${shown.filter((p) => p.kind === 'mark_scheme').length} mark schemes`} />
        <Tile label="Attempts" value={String(data.attempts.filter((a) => !moduleId || a.module_id === moduleId).length)} hint="timed papers + quizzes" />
        <Tile label="Recent average" value={avg == null ? '—' : `${Math.round(avg)}%`} hint="last 10 scored attempts" />
        <Tile label="Quiz questions" value={String(data.questions.filter((q) => !moduleId || q.module_id === moduleId).length)} hint={due.length ? `${due.length} due for review` : 'none due'} />
      </div>

      {groups.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <div className="text-3xl">📝</div>
          <div className="font-medium">Add your past papers and mark schemes</div>
          <p className="max-w-md text-sm text-muted">
            PDF, Word, PowerPoint or text — drag them here or use “Add papers”. Name them like “2023 Paper 1” and “2023 Paper 1 mark scheme” and they pair up automatically.
            Then sit them on a timer, or turn them into quizzes.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <section key={g.id ?? 'none'}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.color }} />
                {g.name}
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {g.papers.map((p) => (
                  <PaperCard key={p.id} p={p} scheme={p.paired_id ? byId.get(p.paired_id) : undefined} attempts={data.attempts.filter((a) => a.paper_id === p.id)} questions={data.questions.filter((q) => q.paper_id === p.id).length} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }): React.JSX.Element {
  return (
    <div className="card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-muted">{hint}</div>
    </div>
  )
}

function PaperCard({ p, scheme, attempts, questions }: { p: ExamPaper; scheme?: ExamPaper; attempts: PaperAttempt[]; questions: number }): React.JSX.Element {
  const scores = attempts.map(pct).filter((x): x is number => x != null)
  const best = scores.length ? Math.max(...scores) : null
  return (
    <div className="card flex flex-col gap-3 p-4">
      <button className="flex items-start gap-3 text-left" onClick={() => navigate({ name: 'paper', id: p.id })}>
        <Icon name="file" size={20} className="mt-0.5 text-muted" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{p.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            <span className={`rounded px-1.5 py-0.5 ${KIND_TONE[p.kind]}`}>{KIND_LABEL[p.kind]}</span>
            {p.year && <span className="text-muted">{p.year}</span>}
            {p.duration_min && <span className="text-muted">· {p.duration_min} min</span>}
            {scheme && <span className="text-ok">· ✓ mark scheme</span>}
          </div>
        </div>
        {best != null && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${best >= 70 ? 'bg-ok/10 text-ok' : best >= 50 ? 'bg-amber-500/15 text-amber-600' : 'bg-danger/10 text-danger'}`} title="Best score">
            {Math.round(best)}%
          </span>
        )}
      </button>
      {p.kind !== 'mark_scheme' && (
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => navigate({ name: 'paper', id: p.id, timed: true })}>
            <Icon name="focus" /> Sit timed
          </button>
          {questions > 0 ? (
            <button className="btn" onClick={() => navigate({ name: 'quiz', paperId: p.id })}>
              <Icon name="cards" /> Quiz ({questions})
            </button>
          ) : (
            <button className="btn" onClick={() => navigate({ name: 'paper', id: p.id, tab: 'questions' })}>
              <Icon name="cards" /> Make a quiz
            </button>
          )}
          <span className="ml-auto self-center text-xs text-muted">
            {attempts.length} attempt{attempts.length === 1 ? '' : 's'}
          </span>
        </div>
      )}
    </div>
  )
}

// ---------- One paper ----------

export function PaperPage({ id, timed = false, tab: startTab }: { id: string; timed?: boolean; tab?: 'paper' | 'questions' | 'attempts' }): React.JSX.Element {
  const data = useExamData()
  const [tab, setTab] = useState<'paper' | 'questions' | 'attempts'>(startTab ?? 'paper')
  const [sitting, setSitting] = useState<number | null>(timed ? Date.now() : null)
  const p = data?.papers.find((x) => x.id === id)
  if (!data) return <div />
  if (!p) {
    return (
      <div className="p-8 text-sm text-muted">
        This paper was deleted.{' '}
        <button className="text-accent underline" onClick={() => navigate({ name: 'exams' })}>
          Back to Exam Prep
        </button>
      </div>
    )
  }
  const save = (patch: Partial<ExamPaper>): Promise<ExamPaper> => db.update('exam_papers', p.id, patch)
  const scheme = p.paired_id ? data.papers.find((x) => x.id === p.paired_id) : undefined
  const questions = data.questions.filter((q) => q.paper_id === p.id)
  const attempts = data.attempts.filter((a) => a.paper_id === p.id)

  if (sitting !== null) return <TimedSitting p={p} scheme={scheme} startedAt={sitting} onDone={() => setSitting(null)} />

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-6 py-3">
        <button className="btn-ghost" onClick={() => navigate({ name: 'exams' })} title="Exam Prep">
          <Icon name="back" />
        </button>
        <AutoText value={p.title} onSave={(v) => save({ title: v.trim() || 'Untitled paper' })} className="field max-w-md text-lg font-semibold" />
        <div className="flex gap-1 rounded-lg bg-line/50 p-0.5 text-sm">
          {(
            [
              ['paper', 'Paper'],
              ['questions', `Quiz questions (${questions.length})`],
              ['attempts', `Attempts (${attempts.length})`]
            ] as const
          ).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1 ${tab === k ? 'bg-panel font-medium shadow-sm' : 'text-muted'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {p.kind !== 'mark_scheme' && (
          <button className="btn-primary" onClick={() => setSitting(Date.now())}>
            <Icon name="focus" /> Sit timed
          </button>
        )}
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto">
          {tab === 'paper' && <Viewer p={p} />}
          {tab === 'questions' && <QuestionsTab p={p} scheme={scheme} questions={questions} />}
          {tab === 'attempts' && <AttemptsTab p={p} attempts={attempts} />}
        </div>
        <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-auto border-l border-line p-4 text-sm">
          <Field label="Type">
            <select className="field-boxed" value={p.kind} onChange={(e) => void save({ kind: e.target.value as PaperKind })}>
              {(Object.keys(KIND_LABEL) as PaperKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Module">
            <select className="field-boxed" value={p.module_id ?? ''} onChange={(e) => void save({ module_id: e.target.value || null })}>
              <option value="">No module</option>
              {data.modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code ? `${m.code} · ` : ''}
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Year">
              <AutoText value={p.year} onSave={(v) => save({ year: v.trim().slice(0, 12) })} className="field-boxed" placeholder="2024" />
            </Field>
            <Field label="Minutes">
              <AutoNumber value={p.duration_min} onSave={(v) => save({ duration_min: v == null ? null : Math.round(v) })} className="field-boxed" placeholder="90" min={1} />
            </Field>
          </div>
          <Field label="Total marks">
            <AutoNumber value={p.total_marks} onSave={(v) => save({ total_marks: v })} className="field-boxed" placeholder="e.g. 80" min={0} />
          </Field>
          <Field label={p.kind === 'mark_scheme' ? 'Paper it marks' : 'Mark scheme'}>
            <select
              className="field-boxed"
              value={p.paired_id ?? ''}
              onChange={(e) => {
                const other = e.target.value || null
                void (async () => {
                  if (p.paired_id) await db.update('exam_papers', p.paired_id, { paired_id: null })
                  await save({ paired_id: other })
                  if (other) await db.update('exam_papers', other, { paired_id: p.id })
                })()
              }}
            >
              <option value="">None</option>
              {data.papers
                .filter((o) => o.id !== p.id && (p.kind === 'mark_scheme' ? o.kind !== 'mark_scheme' : o.kind === 'mark_scheme'))
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title}
                  </option>
                ))}
            </select>
          </Field>
          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" className="mt-0.5" checked={!!p.sync_file} onChange={(e) => void save({ sync_file: e.target.checked ? 1 : 0 })} />
            <span>
              Sync file
              <span className="block text-muted">Upload to your account so it opens on your other PCs (uses the free 1 GB).</span>
            </span>
          </label>
          <Field label="Notes">
            <AutoText multiline rows={4} value={p.notes} onSave={(v) => save({ notes: v })} className="field-boxed" placeholder="Topics to revise, tricky questions…" />
          </Field>
          <div className="mt-auto flex flex-col gap-2">
            <button className="btn justify-center" onClick={() => void api.papers.openExternal(p.id).catch((e) => alert(errText(e)))}>
              <Icon name="external" /> Open in its app
            </button>
            <button
              className="btn justify-center text-danger"
              onClick={() => {
                if (!confirm(`Delete “${p.title}”, its quiz questions and attempts?`)) return
                void db.remove('exam_papers', p.id).then(() => navigate({ name: 'exams' }))
              }}
            >
              <Icon name="trash" /> Delete
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      {children}
    </label>
  )
}

function Viewer({ p }: { p: ExamPaper }): React.JSX.Element {
  if (canPreview(p)) return <iframe title={p.title} src={viewerSrc(p)} className="h-full min-h-[70vh] w-full border-0 bg-white" />
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center text-sm text-muted">
      <Icon name="file" size={36} />
      <div>{p.file_name}</div>
      <div>Word and PowerPoint files open in their own app.</div>
      <button className="btn" onClick={() => void api.papers.openExternal(p.id).catch((e) => alert(errText(e)))}>
        <Icon name="external" /> Open {p.file_name}
      </button>
    </div>
  )
}

// ---------- Timed sitting ----------

function TimedSitting({ p, scheme, startedAt, onDone }: { p: ExamPaper; scheme?: ExamPaper; startedAt: number; onDone: () => void }): React.JSX.Element {
  const [minutes, setMinutes] = useState(p.duration_min ?? 60)
  const [now, setNow] = useState(Date.now())
  const [finished, setFinished] = useState<number | null>(null)
  const [score, setScore] = useState('')
  const [max, setMax] = useState(p.total_marks != null ? String(p.total_marks) : '')
  const [notes, setNotes] = useState('')
  const [showScheme, setShowScheme] = useState(false)
  const warned = useRef(false)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [])
  const elapsed = Math.floor(((finished ?? now) - startedAt) / 1000)
  const left = minutes * 60 - elapsed
  useEffect(() => {
    if (left <= 0 && !warned.current && finished === null) {
      warned.current = true
      new Notification("Time's up", { body: `${p.title}: put your pen down and mark it.` })
    }
  }, [left, finished, p.title])
  const clock = (s: number): string => `${s < 0 ? '+' : ''}${Math.floor(Math.abs(s) / 3600) ? `${Math.floor(Math.abs(s) / 3600)}:` : ''}${String(Math.floor((Math.abs(s) % 3600) / 60)).padStart(2, '0')}:${String(Math.abs(s) % 60).padStart(2, '0')}`

  const saveAttempt = async (): Promise<void> => {
    await db.create('paper_attempts', {
      paper_id: p.id,
      module_id: p.module_id,
      kind: 'timed',
      date: localDate(new Date()),
      duration_sec: elapsed,
      score: score.trim() === '' ? null : Number(score),
      max_score: max.trim() === '' ? null : Number(max),
      notes
    })
    if (max && p.total_marks == null) await db.update('exam_papers', p.id, { total_marks: Number(max) })
    onDone()
  }

  return (
    <div className="flex h-full flex-col">
      <div className={`flex items-center gap-4 border-b border-line px-6 py-3 ${left < 0 && finished === null ? 'bg-danger/10' : ''}`}>
        <span className="text-sm font-semibold">{p.title}</span>
        <span className={`font-mono text-2xl font-semibold tabular-nums ${left < 300 && finished === null ? 'text-danger' : ''}`}>{clock(finished === null ? left : elapsed)}</span>
        {finished === null && elapsed < 5 && (
          <label className="flex items-center gap-1.5 text-xs text-muted">
            Time allowed
            <input type="number" className="field-boxed w-20" value={minutes} min={1} onChange={(e) => setMinutes(Math.max(1, Number(e.target.value) || 60))} /> min
          </label>
        )}
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
          <div className="h-full bg-accent transition-all" style={{ width: `${Math.min(100, (elapsed / (minutes * 60)) * 100)}%` }} />
        </div>
        {finished === null ? (
          <>
            <button className="btn-ghost" onClick={() => confirm('Stop without saving?') && onDone()}>
              Cancel
            </button>
            <button className="btn-primary" onClick={() => setFinished(Date.now())}>
              Finish
            </button>
          </>
        ) : (
          scheme && (
            <button className="btn" onClick={() => setShowScheme((v) => !v)}>
              {showScheme ? 'Show paper' : 'Show mark scheme'}
            </button>
          )
        )}
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <Viewer p={showScheme && scheme ? scheme : p} />
        </div>
        {finished !== null && (
          <aside className="flex w-72 shrink-0 flex-col gap-3 border-l border-line p-4 text-sm">
            <h2 className="font-semibold">Mark it</h2>
            <p className="text-xs text-muted">
              Took {clock(elapsed)}.{' '}
              {scheme ? 'Open the mark scheme above and be honest!' : 'Add a mark scheme to this paper to mark it here next time.'}
            </p>
            <div className="flex items-center gap-2">
              <input className="field-boxed w-20" inputMode="decimal" value={score} onChange={(e) => setScore(e.target.value)} placeholder="Score" />
              <span>/</span>
              <input className="field-boxed w-20" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} placeholder="Out of" />
            </div>
            <textarea className="field-boxed" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What went wrong? Topics to revise…" />
            <button className="btn-primary justify-center" onClick={() => void saveAttempt()}>
              Save attempt
            </button>
            <p className="text-[11px] text-muted">Finishing a timed paper earns 💎 50 in Pixel Quest.</p>
          </aside>
        )}
      </div>
    </div>
  )
}

// ---------- Attempts ----------

function AttemptsTab({ p, attempts }: { p: ExamPaper; attempts: PaperAttempt[] }): React.JSX.Element {
  const scored = attempts.filter((a) => pct(a) != null)
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      {scored.length > 1 && (
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold">Scores over time</h2>
          <div className="flex h-32 items-end gap-2">
            {scored.map((a) => (
              <div key={a.id} className="flex flex-1 flex-col items-center gap-1" title={`${a.date}: ${Math.round(pct(a)!)}%`}>
                <span className="text-[10px] text-muted">{Math.round(pct(a)!)}%</span>
                <div className="w-full max-w-10 rounded-t bg-accent" style={{ height: `${Math.max(4, pct(a)!)}%` }} />
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="card divide-y divide-line">
        {attempts.length === 0 && <div className="p-5 text-sm text-muted">No attempts yet. “Sit timed” to do this paper under exam conditions.</div>}
        {[...attempts].reverse().map((a) => (
          <div key={a.id} className="group flex items-center gap-3 px-4 py-3 text-sm">
            <span className="w-24 text-muted">{new Date(a.date + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            <span className="rounded bg-line px-1.5 py-0.5 text-xs">{a.kind === 'timed' ? '⏱ Timed' : '🃏 Quiz'}</span>
            <span className="font-medium">
              {a.score != null ? `${a.score}${a.max_score ? ` / ${a.max_score}` : ''}` : '—'}
              {pct(a) != null && <span className="ml-1 text-muted">({Math.round(pct(a)!)}%)</span>}
            </span>
            <span className="min-w-0 flex-1 truncate text-muted">{a.notes}</span>
            {a.duration_sec > 0 && <span className="text-xs text-muted">{Math.round(a.duration_sec / 60)} min</span>}
            <button className="btn-ghost invisible px-1 group-hover:visible" onClick={() => void db.remove('paper_attempts', a.id)} title="Delete">
              <Icon name="trash" size={13} />
            </button>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted">{p.total_marks ? `This paper is out of ${p.total_marks}.` : 'Set “Total marks” on the right to see percentages.'}</p>
    </div>
  )
}

// ---------- Questions ----------

function QuestionsTab({ p, scheme, questions }: { p: ExamPaper; scheme?: ExamPaper; questions: QuizQuestion[] }): React.JSX.Element {
  const [found, setFound] = useState<(ParsedQuestion & { keep: boolean })[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [paste, setPaste] = useState<string | null>(null)

  const detect = async (pasted?: string): Promise<void> => {
    setError(null)
    setBusy('Reading the paper…')
    try {
      let text = pasted ?? ''
      if (!pasted) {
        const doc = await api.papers.doc(p.id)
        if (!doc) throw new Error('This paper has no file.')
        text = await docToText(doc)
      }
      let qs = parseQuestions(text)
      if (scheme) {
        setBusy('Reading the mark scheme…')
        const sd = await api.papers.doc(scheme.id).catch(() => null)
        if (sd) qs = attachAnswers(qs, parseAnswers(await docToText(sd)))
      }
      if (!qs.length) {
        setError(text.trim() ? 'No questions found. Paste the questions below (one per line or numbered) instead.' : 'This file has no readable text (probably a scan). Paste the questions below instead.')
        setPaste('')
      } else setFound(qs.map((q) => ({ ...q, keep: true })))
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(null)
    }
  }

  const saveFound = async (): Promise<void> => {
    if (!found) return
    const keep = found.filter((q) => q.keep && q.prompt.trim())
    const start = questions.length
    for (const [i, q] of keep.entries()) {
      await db.create('quiz_questions', {
        paper_id: p.id,
        module_id: p.module_id,
        number: q.number,
        prompt: q.prompt.trim(),
        kind: q.kind,
        options: JSON.stringify(q.options),
        answer: q.answer,
        marks: q.marks,
        sort: start + i
      })
    }
    setFound(null)
    setPaste(null)
  }

  const addOne = (): void =>
    void db.create('quiz_questions', { paper_id: p.id, module_id: p.module_id, number: String(questions.length + 1), prompt: '', kind: 'open', sort: questions.length })

  const toFlashcards = async (): Promise<void> => {
    const deck = await db.create('flashcard_decks', { name: `${p.title} — questions`, module_id: p.module_id })
    for (const q of questions) {
      const opts = JSON.parse(q.options) as string[]
      const front = q.prompt + (opts.length ? '\n\n' + opts.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join('\n') : '')
      await db.create('flashcards', { deck_id: deck.id, front, back: q.answer || '(see mark scheme)' })
    }
    navigate({ name: 'deck', id: deck.id })
  }

  if (found) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-3 p-6">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <h2 className="font-semibold">Found {found.length} questions</h2>
            <p className="text-sm text-muted">
              Untick anything that isn't a real question, and fix wording or answers. {scheme ? `Answers come from “${scheme.title}”.` : 'Pair a mark scheme to fill answers in automatically.'}
            </p>
          </div>
          <button className="btn" onClick={() => setFound(null)}>
            Cancel
          </button>
          <button className="btn-primary" onClick={() => void saveFound()}>
            Save {found.filter((q) => q.keep).length} questions
          </button>
        </div>
        {found.map((q, i) => (
          <div key={i} className={`card flex flex-col gap-2 p-3 ${q.keep ? '' : 'opacity-50'}`}>
            <div className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={q.keep} onChange={(e) => setFound(found.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)))} />
              <b>{q.number}</b>
              <span className="rounded bg-line px-1.5 text-xs">{q.kind === 'mcq' ? 'Multiple choice' : 'Written'}</span>
              {q.marks != null && <span className="text-xs text-muted">{q.marks} marks</span>}
            </div>
            <textarea className="field-boxed text-sm" rows={Math.min(6, Math.ceil(q.prompt.length / 90) + 1)} value={q.prompt} onChange={(e) => setFound(found.map((x, j) => (j === i ? { ...x, prompt: e.target.value } : x)))} />
            {q.options.length > 0 && <div className="text-xs text-muted">{q.options.map((o, k) => `${String.fromCharCode(65 + k)}) ${o}`).join('   ')}</div>}
            <input className="field-boxed text-sm" value={q.answer} onChange={(e) => setFound(found.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))} placeholder={q.kind === 'mcq' ? 'Answer letter (e.g. C)' : 'Answer / mark scheme points'} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" disabled={!!busy} onClick={() => void detect()}>
          <Icon name="refresh" /> {busy ?? (questions.length ? 'Find more questions in the paper' : 'Make a quiz from this paper')}
        </button>
        <button className="btn" onClick={() => setPaste(paste === null ? '' : null)}>
          Paste questions
        </button>
        <button className="btn" onClick={addOne}>
          <Icon name="plus" /> Add one
        </button>
        <div className="flex-1" />
        {questions.length > 0 && (
          <>
            <button className="btn" onClick={() => void toFlashcards()}>
              Make flashcards
            </button>
            <button className="btn-primary" onClick={() => navigate({ name: 'quiz', paperId: p.id })}>
              <Icon name="play" /> Start quiz
            </button>
          </>
        )}
      </div>
      {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
      {paste !== null && (
        <div className="card flex flex-col gap-2 p-3">
          <textarea className="field-boxed text-sm" rows={8} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'1 What is …? [2]\n2 (a) Explain …\n(b) Describe …'} />
          <button className="btn self-end" disabled={!paste.trim()} onClick={() => void detect(paste)}>
            Find questions in this text
          </button>
        </div>
      )}
      {questions.length === 0 && !error && paste === null && (
        <p className="text-sm text-muted">
          Studyhall reads the paper's numbering (1, 2(a), (ii)…), multiple-choice options and marks, and — if a mark scheme is paired — the answers. You check the
          list before anything is saved. Works on PDFs with selectable text, Word and PowerPoint files.
        </p>
      )}
      {questions.map((q) => (
        <QuestionRow key={q.id} q={q} />
      ))}
    </div>
  )
}

function QuestionRow({ q }: { q: QuizQuestion }): React.JSX.Element {
  const save = (patch: Partial<QuizQuestion>): Promise<QuizQuestion> => db.update('quiz_questions', q.id, patch)
  const opts = JSON.parse(q.options) as string[]
  return (
    <div className="card group flex flex-col gap-2 p-3 text-sm">
      <div className="flex items-center gap-2">
        <AutoText value={q.number} onSave={(v) => save({ number: v })} className="field w-20 font-semibold" />
        <select className="bg-transparent text-xs text-muted" value={q.kind} onChange={(e) => void save({ kind: e.target.value as QuizQuestion['kind'] })}>
          <option value="open">Written</option>
          <option value="mcq">Multiple choice</option>
        </select>
        <AutoNumber value={q.marks} onSave={(v) => save({ marks: v })} className="field w-20 text-xs" placeholder="marks" />
        {q.times_seen > 0 && (
          <span className="text-xs text-muted">
            {q.times_right}/{q.times_seen} right
          </span>
        )}
        <div className="flex-1" />
        <button className="btn-ghost invisible px-1 group-hover:visible" onClick={() => void db.remove('quiz_questions', q.id)} title="Delete question">
          <Icon name="trash" size={13} />
        </button>
      </div>
      <AutoText multiline rows={2} value={q.prompt} onSave={(v) => save({ prompt: v })} className="field-boxed" placeholder="Question" />
      {q.kind === 'mcq' && (
        <AutoText
          value={opts.join(' | ')}
          onSave={(v) => save({ options: JSON.stringify(v.split('|').map((s) => s.trim()).filter(Boolean)) })}
          className="field-boxed text-xs"
          placeholder="Options separated by |  e.g.  21 | 27 | 29 | 33"
        />
      )}
      <AutoText multiline rows={1} value={q.answer} onSave={(v) => save({ answer: v })} className="field-boxed text-xs" placeholder={q.kind === 'mcq' ? 'Correct letter, e.g. C' : 'Answer / mark scheme points'} />
    </div>
  )
}

// ---------- Quiz player ----------

export function QuizPage({ paperId, moduleId, review: reviewMode }: { paperId?: string; moduleId?: string; review?: boolean }): React.JSX.Element {
  const data = useExamData()
  const [order, setOrder] = useState<string[] | null>(null)
  const [i, setI] = useState(0)
  const [results, setResults] = useState<Record<string, number>>({}) // id → 1 right, 0.5 partly, 0 missed
  const [startedAt] = useState(Date.now())
  const paper = paperId ? data?.papers.find((p) => p.id === paperId) : undefined

  const pool = useMemo(() => {
    if (!data) return []
    return data.questions.filter((q) => (paperId ? q.paper_id === paperId : true) && (moduleId ? q.module_id === moduleId : true) && (reviewMode ? isDue(q) : true) && q.prompt.trim())
  }, [data, paperId, moduleId, reviewMode])

  useEffect(() => {
    if (order || !pool.length) return
    const ids = pool.map((q) => q.id)
    if (reviewMode) ids.sort(() => Math.random() - 0.5)
    setOrder(ids)
  }, [pool, order, reviewMode])

  if (!data) return <div />
  const title = paper ? paper.title : reviewMode ? 'Review missed questions' : 'Quiz'
  if (!pool.length && !order) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center text-sm text-muted">
        {reviewMode ? 'Nothing to review right now — nice.' : 'No questions here yet.'}{' '}
        <button className="text-accent underline" onClick={() => navigate(paperId ? { name: 'paper', id: paperId, tab: 'questions' } : { name: 'exams' })}>
          Back
        </button>
      </div>
    )
  }
  if (!order) return <div />

  const qs = order.map((id) => data.questions.find((q) => q.id === id)).filter((q): q is QuizQuestion => !!q)
  const done = i >= qs.length

  const grade = async (q: QuizQuestion, value: number): Promise<void> => {
    setResults((r) => ({ ...r, [q.id]: value }))
    const g: Grade = value >= 1 ? 5 : value > 0 ? 3 : 1
    const r = review(q, g)
    await db.update('quiz_questions', q.id, {
      times_seen: q.times_seen + 1,
      times_right: q.times_right + (value >= 1 ? 1 : 0),
      ease: r.ease,
      repetitions: r.repetitions,
      interval_days: r.interval_days,
      // missed: back tomorrow; otherwise the spaced interval
      due_at: value === 0 ? new Date(Date.now() + 864e5).toISOString() : r.due_at
    })
    setI((n) => n + 1)
  }

  if (done) {
    const marks = qs.reduce((s, q) => s + (q.marks ?? 1), 0)
    const got = qs.reduce((s, q) => s + (q.marks ?? 1) * (results[q.id] ?? 0), 0)
    const missed = qs.filter((q) => (results[q.id] ?? 0) < 1)
    return (
      <QuizSummary
        title={title}
        got={got}
        marks={marks}
        missed={missed}
        onSave={async () => {
          await db.create('paper_attempts', {
            paper_id: paperId ?? null,
            module_id: paper?.module_id ?? moduleId ?? null,
            kind: 'quiz',
            date: localDate(new Date()),
            duration_sec: Math.round((Date.now() - startedAt) / 1000),
            score: Math.round(got * 10) / 10,
            max_score: marks
          })
        }}
        onRetry={() => {
          setOrder(missed.map((q) => q.id))
          setResults({})
          setI(0)
        }}
        onExit={() => navigate(paperId ? { name: 'paper', id: paperId, tab: 'questions' } : { name: 'exams' })}
      />
    )
  }

  const q = qs[i]
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-8">
      <div className="flex items-center gap-3">
        <button className="btn-ghost" onClick={() => navigate(paperId ? { name: 'paper', id: paperId, tab: 'questions' } : { name: 'exams' })}>
          <Icon name="back" />
        </button>
        <div className="flex-1 font-semibold">{title}</div>
        <span className="text-sm text-muted">
          {i + 1} / {qs.length}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full bg-accent transition-all" style={{ width: `${(i / qs.length) * 100}%` }} />
      </div>
      <QuestionCard key={q.id} q={q} onGrade={(v) => void grade(q, v)} />
    </div>
  )
}

function QuestionCard({ q, onGrade }: { q: QuizQuestion; onGrade: (value: number) => void }): React.JSX.Element {
  const [picked, setPicked] = useState<number | null>(null)
  const [shown, setShown] = useState(false)
  const [mine, setMine] = useState('')
  const opts = JSON.parse(q.options) as string[]
  const right = q.kind === 'mcq' ? correctOption(q) : null
  const mcqAuto = q.kind === 'mcq' && opts.length > 0 && right !== null

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.target as HTMLElement).tagName === 'TEXTAREA') return
      if (mcqAuto && picked === null && /^[1-5]$/.test(e.key) && Number(e.key) <= opts.length) setPicked(Number(e.key) - 1)
      else if (e.key === ' ' && !shown && !mcqAuto) {
        e.preventDefault()
        setShown(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mcqAuto, picked, shown, opts.length])

  return (
    <div className="card flex flex-col gap-4 p-6">
      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="font-semibold text-ink">Question {q.number}</span>
        {q.marks != null && <span>· {q.marks} mark{q.marks === 1 ? '' : 's'}</span>}
        {q.times_seen > 0 && (
          <span>
            · {q.times_right}/{q.times_seen} right before
          </span>
        )}
      </div>
      <div className="text-base leading-relaxed whitespace-pre-wrap">{q.prompt}</div>

      {opts.length > 0 && (
        <div className="flex flex-col gap-2">
          {opts.map((o, k) => {
            const state = picked === null ? '' : k === right ? 'border-ok bg-ok/10' : k === picked ? 'border-danger bg-danger/10' : 'opacity-60'
            return (
              <button
                key={k}
                disabled={picked !== null}
                onClick={() => (mcqAuto ? setPicked(k) : (setPicked(k), setShown(true)))}
                className={`flex items-center gap-3 rounded-lg border border-line px-4 py-2.5 text-left text-sm hover:bg-canvas ${state}`}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-line text-xs font-semibold">{String.fromCharCode(65 + k)}</span>
                {o}
              </button>
            )
          })}
        </div>
      )}

      {mcqAuto && picked !== null && (
        <div className="flex items-center gap-3">
          <span className={`flex-1 text-sm font-medium ${picked === right ? 'text-ok' : 'text-danger'}`}>
            {picked === right ? 'Correct!' : `Not quite — it's ${String.fromCharCode(65 + right!)}.`}
          </span>
          <button className="btn-primary" onClick={() => onGrade(picked === right ? 1 : 0)}>
            Next →
          </button>
        </div>
      )}

      {!mcqAuto && (
        <>
          {opts.length === 0 && !shown && (
            <textarea className="field-boxed text-sm" rows={4} value={mine} onChange={(e) => setMine(e.target.value)} placeholder="Write your answer (optional), then check it…" />
          )}
          {!shown ? (
            <button className="btn-primary self-start" onClick={() => setShown(true)}>
              Show answer <kbd className="ml-1 text-[10px] opacity-70">Space</kbd>
            </button>
          ) : (
            <>
              {mine.trim() && (
                <div className="rounded-lg bg-canvas p-3 text-sm">
                  <div className="mb-1 text-xs text-muted">Your answer</div>
                  <div className="whitespace-pre-wrap">{mine}</div>
                </div>
              )}
              <div className="rounded-lg border border-ok/40 bg-ok/5 p-3 text-sm">
                <div className="mb-1 text-xs text-ok">Mark scheme</div>
                <div className="whitespace-pre-wrap">{q.answer || 'No answer saved for this question — check the mark scheme, then add it on the paper page.'}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="self-center text-sm text-muted">How did you do?</span>
                <button className="btn border-danger/40 text-danger" onClick={() => onGrade(0)}>
                  ✗ Missed it
                </button>
                <button className="btn border-amber-500/40 text-amber-600" onClick={() => onGrade(0.5)}>
                  ~ Partly
                </button>
                <button className="btn border-ok/40 text-ok" onClick={() => onGrade(1)}>
                  ✓ Got it
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function QuizSummary({
  title,
  got,
  marks,
  missed,
  onSave,
  onRetry,
  onExit
}: {
  title: string
  got: number
  marks: number
  missed: QuizQuestion[]
  onSave: () => Promise<void>
  onRetry: () => void
  onExit: () => void
}): React.JSX.Element {
  const saved = useRef(false)
  useEffect(() => {
    if (saved.current) return
    saved.current = true
    void onSave()
  }, [onSave])
  const p = marks ? Math.round((got / marks) * 100) : 0
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-5 p-10 text-center">
      <div className="text-5xl">{p >= 80 ? '🏆' : p >= 50 ? '💪' : '📚'}</div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="text-4xl font-semibold tabular-nums">
        {Math.round(got * 10) / 10} / {marks} <span className="text-xl text-muted">({p}%)</span>
      </div>
      <p className="text-sm text-muted">
        {missed.length
          ? `${missed.length} question${missed.length === 1 ? '' : 's'} to work on — they'll come back in “Review missed” tomorrow.`
          : 'Everything right. They will come back later so you keep them.'}
      </p>
      <div className="flex gap-2">
        {missed.length > 0 && (
          <button className="btn-primary" onClick={onRetry}>
            Retry the {missed.length} missed
          </button>
        )}
        <button className="btn" onClick={onExit}>
          Done
        </button>
      </div>
      <p className="text-xs text-muted">Every question answered earns 💎 in Pixel Quest.</p>
    </div>
  )
}

/** For other pages (e.g. a module): how revision is going. */
export function useModuleExamStats(moduleId: string): { papers: number; due: number } {
  const d = useLive(['exam_papers', 'quiz_questions'], async () => {
    const [p, q] = await Promise.all([api.list('exam_papers', { module_id: moduleId }), api.list('quiz_questions', { module_id: moduleId })])
    return { papers: p.filter((x) => x.kind !== 'mark_scheme').length, due: q.filter(isDue).length }
  }, [moduleId]).data
  return d ?? { papers: 0, due: 0 }
}
