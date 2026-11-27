// Active recall: short quizzes from your modules' weeks. Nova prepares the questions in the background (from each
// week's worksheets and slides, filed from PoliteMall); you pick a size, where the questions come from, and which
// modules and weeks, and go. Multiple choice is marked at once; a short answer is marked by Nova on the PC, or by
// you against the model answer on the phone. What you miss comes back sooner. (main/recallQuiz.ts)
import { useEffect, useMemo, useState } from 'react'
import type { RecallOverview, RecallQ, RecallSize, RecallSource } from '../../../main/recallQuiz'
import { Icon } from '@/components/ui'
import { api, useLive } from '@/lib/data'
import { isPhoneApp } from '@/lib/platform'

type Grade = 'got' | 'partly' | 'missed'
type Answered = { q: RecallQ; grade: Grade; given: string; feedback?: string }
const SIZE_LABEL: Record<RecallSize, string> = { short: 'Short · 5 + 1', medium: 'Medium · 10 + 3', long: 'Long · 20 + 4' }
const SOURCE_LABEL: Record<RecallSource, string> = { both: 'Worksheets + content', worksheet: 'Worksheets only', content: 'Content only' }
type WeekMode = 'all' | 'latest' | 'upto'

export function RecallPage(): React.JSX.Element {
  const phone = isPhoneApp()
  const { data: ov } = useLive(['quiz_questions', 'exam_papers', 'paper_attempts'], () => api.recall.overview(), [])
  const [status, setStatus] = useState<Awaited<ReturnType<typeof api.recall.status>> | null>(null)
  const [size, setSize] = useState<RecallSize | null>(null)
  const [source, setSource] = useState<RecallSource | null>(null)
  const [mods, setMods] = useState<string[] | null>(null)
  const [weekMode, setWeekMode] = useState<WeekMode>('all')
  const [upto, setUpto] = useState<number | null>(null)
  const [quiz, setQuiz] = useState<{ qs: RecallQ[]; started: number } | null>(null)
  useEffect(() => {
    if (phone) return
    const load = (): void =>
      void api.recall
        .status()
        .then(setStatus)
        .catch(() => {})
    load()
    const t = setInterval(load, 20_000)
    return () => clearInterval(t)
  }, [phone])
  // A quiz Nova started for you ("yes, test me"): begins as soon as the page opens, or at once if it's open.
  useEffect(() => {
    const take = (): void =>
      void api.recall
        .take()
        .then(async (ask) => {
          if (!ask) return
          const qs = await api.recall.build(ask)
          const st = await api.recall.settings()
          setSize(ask.size ?? st.size)
          setSource(ask.source ?? st.source)
          setQuiz({ qs, started: Date.now() })
        })
        .catch(() => {})
    take()
    return api.recall.onStart(take)
  }, [])
  const s = ov?.settings
  const sz = size ?? s?.size ?? 'medium'
  const src = source ?? s?.source ?? 'both'
  const chosen = mods ?? s?.modules ?? null
  const maxWeek = Math.max(0, ...(ov?.modules ?? []).flatMap((m) => m.weeks.map((w) => w.week)))
  const ready = (ov?.modules ?? []).filter((m) => !chosen?.length || chosen.includes(m.id)).reduce((n, m) => n + m.total, 0)
  const pick = (patch: Partial<{ size: RecallSize; source: RecallSource; modules: string[] | null }>): void => void api.recall.settings(patch)

  const start = async (): Promise<void> => {
    const qs = await api.recall.build({ size: sz, source: src, modules: chosen, latest: weekMode === 'latest', toWeek: weekMode === 'upto' ? (upto ?? maxWeek) : null })
    setQuiz({ qs, started: Date.now() })
  }

  if (quiz) return <QuizRun key={quiz.started} qs={quiz.qs} started={quiz.started} size={sz} source={src} onClose={() => setQuiz(null)} />

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-6 py-7">
      <header className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <div className="label-caps">Study</div>
          <h1 className="font-display text-3xl font-semibold">Active recall</h1>
          <p className="mt-1 text-sm text-muted">Short quizzes from your weeks: the worksheets’ own questions and Nova’s on the slides. What you miss comes back sooner.</p>
        </div>
        {ov && (
          <div className="flex gap-2 text-[12.5px]">
            <span className="rounded-full border border-line px-3 py-1">{ov.doneToday ? '✓ Done today' : 'Not done today'}</span>
            {ov.streak > 0 && <span className="rounded-full border border-line px-3 py-1">{ov.streak}-day streak</span>}
          </div>
        )}
      </header>

      <section className="card p-5">
        <h2 className="mb-3 font-semibold">New quiz</h2>
        <Choice label="Size" value={sz} options={(['short', 'medium', 'long'] as RecallSize[]).map((v) => [v, SIZE_LABEL[v]])} onChange={(v) => (setSize(v), pick({ size: v }))} />
        <Choice
          label="Questions from"
          value={src}
          options={(['both', 'worksheet', 'content'] as RecallSource[]).map((v) => [v, SOURCE_LABEL[v]])}
          onChange={(v) => (setSource(v), pick({ source: v }))}
        />
        <div className="flex flex-wrap items-center gap-2 py-2">
          <span className="w-32 shrink-0 text-[13px] text-muted">Modules</span>
          <button className={`pick ${!chosen?.length ? 'on' : ''}`} onClick={() => (setMods(null), pick({ modules: null }))}>
            All
          </button>
          {(ov?.modules ?? []).map((m) => {
            const on = !!chosen?.includes(m.id)
            return (
              <button
                key={m.id}
                className={`pick ${on ? 'on' : ''}`}
                onClick={() => {
                  const next = on ? (chosen ?? []).filter((x) => x !== m.id) : [...(chosen ?? []), m.id]
                  setMods(next.length ? next : null)
                  pick({ modules: next.length ? next : null })
                }}
              >
                {m.name}
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 py-2">
          <span className="w-32 shrink-0 text-[13px] text-muted">Weeks</span>
          {(
            [
              ['all', 'All weeks'],
              ['latest', 'Latest week'],
              ['upto', 'Up to week…']
            ] as [WeekMode, string][]
          ).map(([v, l]) => (
            <button key={v} className={`pick ${weekMode === v ? 'on' : ''}`} onClick={() => setWeekMode(v)}>
              {l}
            </button>
          ))}
          {weekMode === 'upto' && (
            <select className="field-boxed w-auto py-1 text-sm" value={upto ?? maxWeek} onChange={(e) => setUpto(Number(e.target.value))}>
              {Array.from({ length: Math.max(1, maxWeek) }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  Week {n}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button className="btn-primary" disabled={!ready} onClick={() => void start()}>
            <Icon name="play" /> Start quiz
          </button>
          <span className="text-[12.5px] text-muted">
            {ready ? `${ready} questions ready` : 'No questions yet: Nova makes them from your weeks’ files in the background.'}
            {ov?.lastScore ? ` · last time ${ov.lastScore.score}/${ov.lastScore.max}` : ''}
          </span>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-2 font-semibold">Your weeks</h2>
        {!phone && status && (
          <p className="mb-3 text-[12.5px] text-muted">
            {status.working
              ? `Making questions from “${status.working}”…`
              : status.pending
                ? `${status.pending} file${status.pending === 1 ? '' : 's'} still to make questions from${status.paused ? ` (${status.paused})` : ': a few every hour, so your Claude plan isn’t used up'}.`
                : 'All your weeks’ files have questions.'}
          </p>
        )}
        {!ov?.modules.length && <p className="text-sm text-muted">Nothing yet. Once PoliteMall is read, each course’s weeks are filed into your modules and the questions follow.</p>}
        <ul className="flex flex-col">
          {(ov?.modules ?? []).map((m) => (
            <li key={m.id} className="border-t border-line py-2.5 first:border-t-0">
              <div className="flex items-center gap-2 text-sm">
                <b className="min-w-0 flex-1 truncate">{m.name}</b>
                <span className="text-[12px] text-muted">
                  {m.total} questions{m.due ? ` · ${m.due} due` : ''}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {m.weeks.map((w) => (
                  <span key={w.week} className="rounded-md border border-line px-2 py-0.5 text-[11.5px] text-muted" title={`${w.worksheet} from worksheets, ${w.content} from content`}>
                    Week {w.week} · {w.worksheet + w.content}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      <span className="w-32 shrink-0 text-[13px] text-muted">{label}</span>
      {options.map(([v, l]) => (
        <button key={v} className={`pick ${value === v ? 'on' : ''}`} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  )
}

/** The quiz: one question at a time, marked as you go, then your score and what to look at again. */
function QuizRun({ qs, started, size, source, onClose }: { qs: RecallQ[]; started: number; size: RecallSize; source: RecallSource; onClose: () => void }): React.JSX.Element {
  const phone = isPhoneApp()
  const [i, setI] = useState(0)
  const [done, setDone] = useState<Answered[]>([])
  const [picked, setPicked] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [marking, setMarking] = useState(false)
  const [shown, setShown] = useState<Answered | null>(null)
  const [result, setResult] = useState<{ score: number; max: number } | null>(null)
  const q = qs[i]
  const finish = async (all: Answered[]): Promise<void> => {
    setResult(
      await api.recall.save(
        all.map((a) => ({ id: a.q.id, grade: a.grade })),
        { size, source, seconds: (Date.now() - started) / 1000 }
      )
    )
  }
  const next = (a: Answered): void => {
    const all = [...done, a]
    setDone(all)
    setShown(null)
    setPicked(null)
    setText('')
    if (i + 1 >= qs.length) void finish(all)
    else setI(i + 1)
  }
  const missed = useMemo(() => done.filter((a) => a.grade !== 'got'), [done])

  if (!qs.length)
    return (
      <div className="mx-auto max-w-2xl px-6 py-10">
        <p className="text-sm text-muted">No questions match that yet. Try all weeks, or both sources.</p>
        <button className="btn mt-3" onClick={onClose}>
          Back
        </button>
      </div>
    )
  if (result)
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-8">
        <h1 className="font-display text-3xl font-semibold">
          {Math.round(result.score * 10) / 10} / {result.max}
        </h1>
        <p className="text-sm text-muted">{missed.length ? 'These come back sooner. Have a look at them now:' : 'All of them. Nicely done.'}</p>
        <ul className="flex flex-col gap-3">
          {missed.map((a) => (
            <li key={a.q.id} className="card p-4 text-sm">
              <div className="text-[11.5px] text-muted">
                {a.q.module} · Week {a.q.week} · {a.grade === 'partly' ? 'partly' : 'missed'}
              </div>
              <p className="mt-1 font-medium">{a.q.prompt}</p>
              <p className="mt-1.5">
                <span className="text-muted">Answer: </span>
                {a.q.answer}
                {a.q.novaAnswer && <span className="ml-1 text-[11px] text-muted">(Nova’s answer)</span>}
              </p>
            </li>
          ))}
        </ul>
        <button className="btn-primary self-start" onClick={onClose}>
          Done
        </button>
      </div>
    )

  const markSaq = async (): Promise<void> => {
    if (phone) return void setShown({ q, grade: 'partly', given: text })
    setMarking(true)
    try {
      const r = await api.recall.markSaq({ prompt: q.prompt, answer: q.answer }, text)
      setShown({ q, grade: r.grade, given: text, feedback: r.feedback })
    } catch {
      setShown({ q, grade: 'partly', given: text })
    } finally {
      setMarking(false)
    }
  }
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-8">
      <div className="flex items-center gap-3 text-[12.5px] text-muted">
        <span>
          {i + 1} of {qs.length}
        </span>
        <span className="h-1 flex-1 overflow-hidden rounded-full bg-line">
          <span className="block h-full rounded-full bg-accent" style={{ width: `${(i / qs.length) * 100}%` }} />
        </span>
        <button className="hover:text-ink" onClick={onClose}>
          Stop
        </button>
      </div>
      <section className="card p-5">
        <div className="text-[11.5px] text-muted">
          {q.module} · Week {q.week} · {q.source === 'worksheet' ? 'worksheet' : 'from the slides'}
          {q.topic ? ` · ${q.topic}` : ''}
        </div>
        <p className="mt-2 text-[15.5px] leading-relaxed">{q.prompt}</p>
        {q.kind === 'mcq' ? (
          <div className="mt-4 flex flex-col gap-2">
            {q.options.map((o) => {
              const right = o.trim() === q.answer.trim()
              const state = picked == null ? '' : right ? 'border-ok/60 bg-ok/10' : o === picked ? 'border-danger/60 bg-danger/10' : 'opacity-60'
              return (
                <button key={o} disabled={picked != null} className={`rounded-lg border border-line px-3 py-2 text-left text-sm ${state}`} onClick={() => setPicked(o)}>
                  {o}
                </button>
              )
            })}
            {picked != null && (
              <button className="btn-primary mt-2 self-start" onClick={() => next({ q, grade: picked.trim() === q.answer.trim() ? 'got' : 'missed', given: picked })}>
                {i + 1 >= qs.length ? 'Finish' : 'Next'}
              </button>
            )}
          </div>
        ) : !shown ? (
          <div className="mt-4 flex flex-col gap-2">
            <textarea className="field-boxed min-h-[110px] text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder="Your answer, in a sentence or two" />
            <button className="btn-primary self-start" disabled={marking} onClick={() => void markSaq()}>
              {marking ? 'Marking…' : phone ? 'Show the answer' : 'Check'}
            </button>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-2 text-sm">
            {shown.feedback && <p className={shown.grade === 'got' ? 'text-ok' : shown.grade === 'partly' ? 'text-brass' : 'text-danger'}>{shown.feedback}</p>}
            <p>
              <span className="text-muted">Model answer: </span>
              {q.answer}
              {q.novaAnswer && <span className="ml-1 text-[11px] text-muted">(Nova’s answer)</span>}
            </p>
            {phone ? (
              <div className="mt-1 flex gap-2">
                <span className="self-center text-[12.5px] text-muted">How did you do?</span>
                {(['got', 'partly', 'missed'] as Grade[]).map((g) => (
                  <button key={g} className="btn" onClick={() => next({ ...shown, grade: g })}>
                    {g === 'got' ? 'Got it' : g === 'partly' ? 'Partly' : 'Missed it'}
                  </button>
                ))}
              </div>
            ) : (
              <button className="btn-primary mt-1 self-start" onClick={() => next(shown)}>
                {i + 1 >= qs.length ? 'Finish' : 'Next'}
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
