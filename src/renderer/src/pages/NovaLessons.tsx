// Nova's page, Lessons and Map tabs: tutor lessons taken (each with its pack: notes, test, mind map, flashcards, and
// Replay), starting or carrying on a lesson, the 10 + 3 test, and the map of what's been learned by module and topic.
import { useCallback, useEffect, useState } from 'react'
import type { LessonDetail, LessonMapData, LessonSummary, PracticeQ } from '@shared/types'
import { api } from '@/lib/data'
import { navigate } from '@/lib/nav'

const when = (t: number): string => new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
const mins = (a: number, b: number | null): string => (b ? `${Math.max(1, Math.round((b - a) / 60000))} min` : 'in progress')

function useLessons(): [LessonSummary[] | null, () => void] {
  const [list, setList] = useState<LessonSummary[] | null>(null)
  const load = useCallback(
    () =>
      void api.lessons
        .list()
        .then(setList)
        .catch(() => setList([])),
    []
  )
  useEffect(() => {
    load()
    const t = setInterval(load, 15_000)
    return () => clearInterval(t)
  }, [load])
  return [list, load]
}

// ---------- the test: 10 multiple-choice and 3 short-answer questions ----------
function TestModal({ id, onClose }: { id: string; onClose: () => void }): React.JSX.Element {
  const [d, setD] = useState<LessonDetail | null>(null)
  const [mcq, setMcq] = useState<(number | null)[]>([])
  const [saq, setSaq] = useState<string[]>([])
  const [marking, setMarking] = useState(false)
  const [result, setResult] = useState<{ score: number; outOf: number; saq: { answer: string; hit: boolean[]; feedback: string }[] } | null>(null)
  useEffect(() => {
    void api.lessons.get(id).then((x) => {
      setD(x)
      setMcq((x?.pack?.test.mcq ?? []).map(() => null))
      setSaq((x?.pack?.test.saq ?? []).map(() => ''))
    })
  }, [id])
  const test = d?.pack?.test
  const submit = async (): Promise<void> => {
    if (!test) return
    setMarking(true)
    const marked = await Promise.all(
      test.saq.map(async (q, k) =>
        saq[k].trim()
          ? ((await api.lessons.markSaq(id, k, saq[k]).catch(() => null)) ?? { hit: q.points.map(() => false), feedback: 'Couldn’t mark this one.' })
          : { hit: q.points.map(() => false), feedback: 'No answer.' }
      )
    )
    const s = await api.lessons.saveTest(id, { mcq, saq: marked.map((m, k) => ({ answer: saq[k], ...m })) })
    setMarking(false)
    if (s) setResult({ ...s, saq: marked.map((m, k) => ({ answer: saq[k], ...m })) })
  }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-6 backdrop-blur-sm" role="dialog" aria-label="Lesson test" onClick={onClose}>
      <div className="card my-6 w-full max-w-3xl rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-3">
          <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">Test · {d?.title ?? '…'}</h2>
          {result && (
            <span className="nova-chip">
              Score <b>{result.score}</b> / {result.outOf}
            </span>
          )}
          <button className="text-sm underline" onClick={onClose}>
            Close
          </button>
        </div>
        {!test && <p className="text-sm text-muted">{d ? 'This lesson has no test yet.' : 'Loading…'}</p>}
        {test && (
          <ol className="flex flex-col gap-5">
            {test.mcq.map((q, k) => (
              <li key={`m${k}`}>
                <div className="mb-2 text-[14.5px] font-medium">
                  {k + 1}. {q.q}
                </div>
                <div className="flex flex-col gap-1.5">
                  {q.options.map((o, i) => {
                    const picked = mcq[k] === i
                    const right = result && i === q.answer
                    const wrong = result && picked && i !== q.answer
                    return (
                      <button
                        key={i}
                        disabled={!!result}
                        onClick={() => setMcq((m) => m.map((x, j) => (j === k ? i : x)))}
                        className={`rounded-lg border px-3 py-2 text-left text-sm ${right ? 'border-[#7ad8a0] bg-[#7ad8a0]/15' : wrong ? 'border-[#ff8a7a] bg-[#ff8a7a]/12' : picked ? 'border-accent bg-accent/10' : 'border-line hover:border-accent/60'}`}
                      >
                        <span className="mr-2 text-muted">{String.fromCharCode(65 + i)}</span>
                        {o}
                      </button>
                    )
                  })}
                </div>
                {result && <p className="mt-1.5 text-[13px] text-muted">{q.why}</p>}
              </li>
            ))}
            {test.saq.map((q, k) => (
              <li key={`s${k}`}>
                <div className="mb-2 text-[14.5px] font-medium">
                  {test.mcq.length + k + 1}. {q.q} <span className="text-xs text-muted">(short answer · {q.points.length} marks)</span>
                </div>
                <textarea
                  className="field-boxed min-h-[84px] w-full rounded-lg p-2 text-sm"
                  value={saq[k] ?? ''}
                  disabled={!!result}
                  onChange={(e) => setSaq((a) => a.map((x, j) => (j === k ? e.target.value : x)))}
                  placeholder="Your answer, in your own words"
                />
                {result && (
                  <div className="mt-1.5 text-[13px]">
                    <ul className="flex flex-col gap-0.5">
                      {q.points.map((p, i) => (
                        <li key={i} className={result.saq[k]?.hit[i] ? 'text-[#9be3b8]' : 'text-[#ffb0a6]'}>
                          {result.saq[k]?.hit[i] ? '✓' : '✗'} {p}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 text-muted">{result.saq[k]?.feedback}</p>
                    <p className="mt-1 text-muted">
                      <b>Model answer:</b> {q.model}
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
        {test && !result && (
          <div className="mt-6 flex items-center gap-3">
            <button className="btn-primary rounded-full px-5 py-2 text-sm font-semibold" disabled={marking} onClick={() => void submit()}>
              {marking ? 'Marking…' : 'Mark my test'}
            </button>
            <span className="text-xs text-muted">Short answers are marked by Nova against their key points. What you miss goes to your flashcards.</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- one lesson's details: stops, checks, shaky, what was said ----------
function DetailModal({ id, onClose }: { id: string; onClose: () => void }): React.JSX.Element {
  const [d, setD] = useState<LessonDetail | null>(null)
  useEffect(() => {
    void api.lessons.get(id).then(setD)
  }, [id])
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-6 backdrop-blur-sm" role="dialog" aria-label="Lesson details" onClick={onClose}>
      <div className="card my-6 w-full max-w-3xl rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-3">
          <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{d?.title ?? '…'}</h2>
          <button className="text-sm underline" onClick={onClose}>
            Close
          </button>
        </div>
        {d && (
          <div className="flex flex-col gap-5 text-[13.5px]">
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">The lesson’s stops</h3>
              <ol className="flex flex-col gap-1">
                {d.stopsList.map((s) => (
                  <li key={s.n} className={d.taught && s.n <= d.stopsList.length ? '' : 'text-muted'}>
                    <b>{s.n}.</b> {s.topic}: {s.idea}
                  </li>
                ))}
              </ol>
            </section>
            {!!d.checksList.length && (
              <section>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Checks</h3>
                <ul className="flex flex-col gap-1.5">
                  {d.checksList.map((c, k) => (
                    <li key={k}>
                      <span className={c.correct ? 'text-[#9be3b8]' : c.correct === false ? 'text-[#ffb0a6]' : 'text-muted'}>{c.correct ? '✓' : c.correct === false ? '✗' : '·'}</span> {c.question}
                      {c.given && <span className="text-muted"> · you: “{c.given}”</span>}
                      {c.correct === false && <span className="text-muted"> · answer: {c.answer}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {!!d.shakyList.length && (
              <section>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Still shaky</h3>
                <ul className="flex flex-col gap-1">
                  {d.shakyList.map((s, k) => (
                    <li key={k} className={s.fixed ? 'text-muted line-through' : ''}>
                      {s.topic && <b>{s.topic}: </b>}
                      {s.fix}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">What was said</h3>
              <div className="flex max-h-[40vh] flex-col gap-1.5 overflow-y-auto pr-2">
                {d.transcript.map((t, k) => (
                  <p key={k} className={t.who === 'you' ? 'text-accent' : ''}>
                    <b>{t.who === 'you' ? 'You' : 'Nova'}:</b> {t.text}
                  </p>
                ))}
                {!d.transcript.length && <p className="text-muted">Nothing was said in this lesson.</p>}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- Lessons tab ----------
export function LessonsTab({ name }: { name: string }): React.JSX.Element {
  const [list, reload] = useLessons()
  const [decks, setDecks] = useState<{ path: string; name: string; at: number; taught: boolean }[] | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  useEffect(() => {
    void api.lessons
      .suggest()
      .then(setDecks)
      .catch(() => setDecks([]))
  }, [])
  const teach = async (path: string, carryOn?: string): Promise<void> => {
    setMsg('')
    const r = await api.lessons.teach(path, carryOn)
    if (r !== 'ok') setMsg(r)
  }
  const last = (list ?? []).find((l) => l.stops > 0 && l.taught < l.stops && l.source)
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
      <div className="flex min-w-0 flex-col gap-4">
        {last && (
          <section className="card nova-hero rounded-2xl p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Continue where you left off</div>
            <div className="mt-1 text-lg font-semibold">{last.title}</div>
            <p className="text-[13px] text-muted">
              {last.taught} of {last.stops} stops done · {when(last.started)}
            </p>
            <button className="btn-primary mt-3 rounded-full px-5 py-2 text-sm font-semibold" onClick={() => void teach(last.source, last.id)}>
              Continue lesson
            </button>
          </section>
        )}
        <section className="card rounded-2xl p-5">
          <h2 className="font-semibold">Your lessons</h2>
          {list && !list.length && <p className="mt-2 text-sm text-muted">No lessons yet. Start one on the right, or open a deck and say “teach me this”.</p>}
          <ul className="mt-2 flex flex-col">
            {(list ?? []).map((l) => (
              <li key={l.id} className="border-t border-line py-3 first:border-t-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="min-w-0 truncate text-[15px] font-semibold">{l.title}</span>
                  {l.module && <span className="nova-chip text-[11.5px]">{l.module}</span>}
                  <span className="text-xs text-muted">
                    {when(l.started)} · {mins(l.started, l.ended)} · {l.taught}/{l.stops || '?'} stops
                    {l.checks.total ? ` · checks ${l.checks.right}/${l.checks.total}` : ''}
                    {l.shaky ? ` · ${l.shaky} shaky` : ''}
                    {l.pack?.outOf ? ` · test ${l.pack.score}/${l.pack.outOf}` : ''}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[13px]">
                  {l.replay && (
                    <button className="btn-primary rounded-full px-3.5 py-1.5 font-semibold" onClick={() => void api.lessons.replay(l.id)}>
                      ▶ Replay
                    </button>
                  )}
                  {l.pack?.made && (
                    <button className="glass rounded-full px-3.5 py-1.5" onClick={() => setTesting(l.id)}>
                      {l.pack.testAt ? 'Test again' : 'Take the test'}
                    </button>
                  )}
                  {l.pack?.noteId && (
                    <button className="glass rounded-full px-3.5 py-1.5" onClick={() => navigate({ name: 'notes', id: l.pack!.noteId })}>
                      Notes
                    </button>
                  )}
                  {l.pack?.mindmapId && (
                    <button className="glass rounded-full px-3.5 py-1.5" onClick={() => navigate({ name: 'mindmap', id: l.pack!.mindmapId! })}>
                      Mind map
                    </button>
                  )}
                  {l.pack?.deck && (
                    <button className="glass rounded-full px-3.5 py-1.5" onClick={() => navigate({ name: 'flashcards' })}>
                      Flashcards
                    </button>
                  )}
                  <button className="glass rounded-full px-3.5 py-1.5" onClick={() => setDetail(l.id)}>
                    Details
                  </button>
                  {!l.pack && l.ended && (
                    <button
                      className="glass rounded-full px-3.5 py-1.5"
                      disabled={busy === l.id}
                      onClick={() => {
                        setBusy(l.id)
                        void api.lessons.makePack(l.id).then((ok) => {
                          setBusy(null)
                          if (!ok) setMsg('Couldn’t make the pack for that lesson (too little was taught, or Claude is paused).')
                          reload()
                        })
                      }}
                    >
                      {busy === l.id ? 'Making the pack…' : 'Make notes and test'}
                    </button>
                  )}
                  {confirmDel === l.id ? (
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-muted">Delete this lesson’s record? (Its notes, mind map and flashcards stay.)</span>
                      <button
                        className="text-xs text-danger underline"
                        onClick={() => {
                          setConfirmDel(null)
                          void api.lessons.remove(l.id).then(reload)
                        }}
                      >
                        Delete
                      </button>
                      <button className="text-xs underline" onClick={() => setConfirmDel(null)}>
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button className="nova-quiet text-xs" onClick={() => setConfirmDel(l.id)}>
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <aside className="flex min-w-0 flex-col gap-4">
        <section className="card rounded-2xl p-5">
          <h2 className="font-semibold">Start a lesson</h2>
          <p className="mt-1 text-[13px] text-muted">
            {name} reads the whole deck, plans the lesson, and teaches it in the lesson window: rings on your slides, cards beside them, quick checks as you go.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button className="btn rounded-full px-4 py-2 text-sm" onClick={() => void api.nova.tutor(true)}>
              Teach what I have open
            </button>
            <span className="nova-keys text-[12.5px] text-muted">
              or <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>T</kbd>
            </span>
          </div>
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Or pick a deck</h3>
          <ul className="mt-1 flex flex-col">
            {(decks ?? []).map((d) => (
              <li key={d.path} className="flex items-center gap-2 border-t border-line py-2 text-[13px] first:border-t-0">
                <span className="min-w-0 flex-1 truncate" title={d.path}>
                  {d.name}
                </span>
                {d.taught && <span className="text-[11px] text-muted">taught before</span>}
                <button className="text-xs font-semibold underline" onClick={() => void teach(d.path)}>
                  Teach me
                </button>
              </li>
            ))}
            {decks && !decks.length && <li className="text-sm text-muted">No slides or PDFs in your Downloads yet.</li>}
          </ul>
          {msg && <p className="mt-2 text-sm text-danger">{msg}</p>}
        </section>
      </aside>
      {testing && (
        <TestModal
          id={testing}
          onClose={() => {
            setTesting(null)
            reload()
          }}
        />
      )}
      {detail && <DetailModal id={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

// ---------- Map tab: what's been learned ----------
const DOT: Record<string, { c: string; label: string }> = {
  solid: { c: '#7ad8a0', label: 'Solid' },
  shaky: { c: '#ffcf5c', label: 'Shaky' },
  taught: { c: '#a8c8ff', label: 'Taught, test to take' },
  new: { c: '#5d6f91', label: 'Not yet' }
}
export function MapTab(): React.JSX.Element {
  const [m, setM] = useState<LessonMapData | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [practice, setPractice] = useState<PracticeAsk | null>(null)
  const [exam, setExam] = useState<string | null>(null)
  const load = useCallback(
    () =>
      void api.lessons
        .map()
        .then(setM)
        .catch(() => setM({ modules: [], due: { tests: [], shaky: [], later: 0 } })),
    []
  )
  useEffect(() => {
    load()
  }, [load])
  const total = (m?.modules ?? []).flatMap((x) => x.topics)
  return (
    <div className="flex flex-col gap-4">
      <section className="card rounded-2xl p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-semibold">Due today</h2>
          {!!m?.due.shaky.length && (
            <button className="btn-primary rounded-full px-4 py-1.5 text-[13px] font-semibold" onClick={() => setPractice({ due: true, title: 'What’s due' })}>
              Practise what’s due ({m.due.shaky.length})
            </button>
          )}
          {!!m?.due.later && (
            <span className="text-xs text-muted">
              {m.due.later} more shaky idea{m.due.later > 1 ? 's come' : ' comes'} up for a check later
            </span>
          )}
        </div>
        {m && !m.due.tests.length && !m.due.shaky.length && <p className="mt-2 text-sm text-muted">Nothing due. Take a lesson and it fills in.</p>}
        {!!m?.due.tests.length && (
          <div className="mt-3 flex flex-wrap gap-2">
            {m.due.tests.map((t) => (
              <button key={t.id} className="glass rounded-full px-3.5 py-1.5 text-[13px]" onClick={() => setTesting(t.id)}>
                Take the test · {t.title}
              </button>
            ))}
          </div>
        )}
        {!!m?.due.shaky.length && (
          <ul className="mt-3 flex flex-col gap-1 text-[13px]">
            {m.due.shaky.map((s, k) => (
              <li key={k}>
                <span style={{ color: DOT.shaky.c }}>●</span> {s.topic && <b>{s.topic}: </b>}
                {s.idea} <span className="text-muted">· {s.title}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card rounded-2xl p-5">
        <div className="flex flex-wrap items-center gap-4">
          <h2 className="font-semibold">What you’ve learned</h2>
          <div className="flex flex-wrap gap-3 text-xs text-muted">
            {Object.entries(DOT).map(([k, v]) => (
              <span key={k}>
                <span style={{ color: v.c }}>●</span> {v.label} ({total.filter((t) => t.status === k).length})
              </span>
            ))}
          </div>
        </div>
        {m && !m.modules.length && <p className="mt-2 text-sm text-muted">Your modules and their topics show up here as you take lessons with Nova.</p>}
        <div className="mt-3 flex flex-col gap-4">
          {(m?.modules ?? []).map((mod) => (
            <div key={mod.name}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">{mod.name}</h3>
                {mod.examIn != null && (
                  <span className="nova-chip text-[11.5px]" style={{ borderColor: '#ffcf5c66' }}>
                    Exam {mod.examIn === 0 ? 'today' : `in ${mod.examIn} day${mod.examIn > 1 ? 's' : ''}`}
                  </span>
                )}
                <button className="text-xs underline" onClick={() => setExam(mod.name)}>
                  Exam practice
                </button>
                <button className="text-xs underline" onClick={() => setPractice({ module: mod.name, title: mod.name })}>
                  Practise this module
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {mod.topics.map((t) => {
                  const key = `${mod.name}/${t.topic}`
                  return (
                    <div key={key} className="relative">
                      <button
                        className="rounded-full border px-3 py-1 text-[13px]"
                        style={{ borderColor: `${DOT[t.status].c}88`, background: `${DOT[t.status].c}18` }}
                        title={DOT[t.status].label}
                        onClick={() => setOpen(open === key ? null : key)}
                      >
                        <span style={{ color: DOT[t.status].c }}>●</span> {t.topic}
                      </button>
                      {open === key && (
                        <div className="card absolute left-0 top-9 z-20 flex w-64 flex-col gap-1.5 rounded-xl bg-[#081633]/95 p-3 text-[13px] shadow-xl backdrop-blur">
                          <div className="font-semibold">{t.topic}</div>
                          <div className="text-xs text-muted">{DOT[t.status].label}</div>
                          {t.status !== 'new' && (
                            <button className="text-left font-semibold underline" onClick={() => setPractice({ topic: t.topic, title: t.topic })}>
                              Practise this
                            </button>
                          )}
                          {t.noteId && (
                            <button className="text-left underline" onClick={() => navigate({ name: 'notes', id: t.noteId })}>
                              Notes
                            </button>
                          )}
                          {t.mindmapId && (
                            <button className="text-left underline" onClick={() => navigate({ name: 'mindmap', id: t.mindmapId! })}>
                              Mind map
                            </button>
                          )}
                          {t.deck && (
                            <button className="text-left underline" onClick={() => navigate({ name: 'flashcards' })}>
                              Flashcards
                            </button>
                          )}
                          {t.lessons.map((l) => (
                            <button key={l.id} className="text-left underline" onClick={() => void api.lessons.replay(l.id)}>
                              ▶ Replay · {l.title}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
      {testing && (
        <TestModal
          id={testing}
          onClose={() => {
            setTesting(null)
            load()
          }}
        />
      )}
      {practice && (
        <PracticeModal
          ask={practice}
          onClose={() => {
            setPractice(null)
            load()
          }}
        />
      )}
      {exam && (
        <ExamModal
          module={exam}
          onClose={() => {
            setExam(null)
            load()
          }}
        />
      )}
    </div>
  )
}

// ---------- Practice: new cases where Nova doesn't say which idea applies ----------
type PracticeAsk = { due?: boolean; topic?: string; module?: string; title: string }
type Mark = { correct: boolean; hit: boolean[]; feedback: string }
function PracticeModal({ ask, onClose }: { ask: PracticeAsk; onClose: () => void }): React.JSX.Element {
  const [qs, setQs] = useState<PracticeQ[] | null>(null)
  const [answers, setAnswers] = useState<string[]>([])
  const [marks, setMarks] = useState<(Mark | null)[]>([])
  const [busy, setBusy] = useState<number | null>(null)
  useEffect(() => {
    void api.lessons
      .practice({ due: ask.due, topic: ask.topic, module: ask.module })
      .then((x) => {
        setQs(x)
        setAnswers(x.map(() => ''))
        setMarks(x.map(() => null))
      })
      .catch(() => setQs([]))
  }, [ask])
  const check = async (k: number): Promise<void> => {
    if (!qs) return
    setBusy(k)
    const m = await api.lessons.markPractice(qs[k], answers[k]).catch(() => null)
    setBusy(null)
    setMarks((a) => a.map((x, j) => (j === k ? (m ?? { correct: false, hit: qs[k].points.map(() => false), feedback: 'Couldn’t mark that one: have a look at the model answer.' }) : x)))
  }
  // (what was marked counts: for the map, and for when each shaky idea is checked next)
  const close = (): void => {
    const done = (qs ?? []).flatMap((q, k) => (marks[k] ? [{ q, correct: marks[k]!.correct }] : []))
    if (done.length) void api.lessons.savePractice(done).finally(onClose)
    else onClose()
  }
  const right = marks.filter((m) => m?.correct).length
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-6 backdrop-blur-sm" role="dialog" aria-label="Practice" onClick={close}>
      <div className="card my-6 w-full max-w-3xl rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center gap-3">
          <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">Practice · {ask.title}</h2>
          {marks.some(Boolean) && (
            <span className="nova-chip">
              <b>{right}</b> / {marks.filter(Boolean).length} right
            </span>
          )}
          <button className="text-sm underline" onClick={close}>
            Done
          </button>
        </div>
        <p className="mb-4 text-[13px] text-muted">Real situations. Work out which idea applies and why: Nova checks your reasoning, not the wording.</p>
        {!qs && <p className="text-sm text-muted">Nova is writing your practice… (about 15 seconds)</p>}
        {qs && !qs.length && <p className="text-sm text-muted">Nothing to practise yet: take a lesson first (or Claude is paused).</p>}
        <ol className="flex flex-col gap-6">
          {(qs ?? []).map((q, k) => (
            <li key={k}>
              <div className="mb-2 text-[14.5px] leading-relaxed">
                <b>{k + 1}.</b> {q.q}
              </div>
              <textarea
                className="field-boxed min-h-[76px] w-full rounded-lg p-2 text-sm"
                value={answers[k] ?? ''}
                disabled={!!marks[k]}
                onChange={(e) => setAnswers((a) => a.map((x, j) => (j === k ? e.target.value : x)))}
                placeholder="What’s going on, and why?"
              />
              {!marks[k] ? (
                <button className="glass mt-2 rounded-full px-4 py-1.5 text-[13px]" disabled={busy === k} onClick={() => void check(k)}>
                  {busy === k ? 'Checking…' : 'Check my answer'}
                </button>
              ) : (
                <div className="mt-2 text-[13px]">
                  <div className={marks[k]!.correct ? 'font-semibold text-[#9be3b8]' : 'font-semibold text-[#ffcf5c]'}>
                    {marks[k]!.correct ? 'Got it' : 'Not quite'} · it tests: {q.idea}
                  </div>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {q.points.map((p, i) => (
                      <li key={i} className={marks[k]!.hit[i] ? 'text-[#9be3b8]' : 'text-muted'}>
                        {marks[k]!.hit[i] ? '✓' : '·'} {p}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1">{marks[k]!.feedback}</p>
                  <p className="mt-1 text-muted">
                    <b>Model answer:</b> {q.model}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

// ---------- Exam practice: a module's lessons' questions, mixed, more on what's shaky ----------
type ExamSet = Awaited<ReturnType<typeof api.lessons.exam>>
function ExamModal({ module, onClose }: { module: string; onClose: () => void }): React.JSX.Element {
  const [set, setSet] = useState<ExamSet | null>(null)
  const [mcq, setMcq] = useState<(number | null)[]>([])
  const [saq, setSaq] = useState<string[]>([])
  const [result, setResult] = useState<{ score: number; outOf: number; saq: (Mark | null)[] } | null>(null)
  const [marking, setMarking] = useState(false)
  useEffect(() => {
    void api.lessons.exam(module).then((x) => {
      setSet(x)
      setMcq(x.mcq.map(() => null))
      setSaq(x.saq.map(() => ''))
    })
  }, [module])
  const toQ = (q: ExamSet['saq'][number]): PracticeQ => ({ q: q.q, topic: q.topic, idea: q.topic, points: q.points, model: q.model, lessonId: q.lessonId })
  const submit = async (): Promise<void> => {
    if (!set) return
    setMarking(true)
    const marked = await Promise.all(set.saq.map((q, k) => api.lessons.markPractice(toQ(q), saq[k]).catch(() => null)))
    const score = set.mcq.filter((q, k) => mcq[k] === q.answer).length + marked.reduce((a, m) => a + (m?.hit.filter(Boolean).length ?? 0), 0)
    const outOf = set.mcq.length + set.saq.reduce((a, q) => a + q.points.length, 0)
    await api.lessons.savePractice([
      ...set.mcq.map((q, k) => ({ q: { q: q.q, topic: q.topic, idea: q.topic, points: [], model: '', lessonId: q.lessonId }, correct: mcq[k] === q.answer })),
      ...set.saq.map((q, k) => ({ q: toQ(q), correct: !!marked[k]?.correct }))
    ])
    setMarking(false)
    setResult({ score, outOf, saq: marked })
  }
  const empty = !!set && !set.mcq.length && !set.saq.length
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-6 backdrop-blur-sm" role="dialog" aria-label="Exam practice" onClick={onClose}>
      <div className="card my-6 w-full max-w-3xl rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-3">
          <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">Exam practice · {module}</h2>
          {result && (
            <span className="nova-chip">
              Score <b>{result.score}</b> / {result.outOf}
            </span>
          )}
          <button className="text-sm underline" onClick={onClose}>
            Close
          </button>
        </div>
        {!set && <p className="text-sm text-muted">Loading…</p>}
        {empty && <p className="text-sm text-muted">No lesson tests in this module yet: take a lesson on it first.</p>}
        <ol className="flex flex-col gap-5">
          {(set?.mcq ?? []).map((q, k) => (
            <li key={`m${k}`}>
              <div className="mb-2 text-[14.5px] font-medium">
                {k + 1}. {q.q}
              </div>
              <div className="flex flex-col gap-1.5">
                {q.options.map((o, i) => {
                  const picked = mcq[k] === i
                  const right = result && i === q.answer
                  const wrong = result && picked && i !== q.answer
                  return (
                    <button
                      key={i}
                      disabled={!!result}
                      onClick={() => setMcq((m) => m.map((x, j) => (j === k ? i : x)))}
                      className={`rounded-lg border px-3 py-2 text-left text-sm ${right ? 'border-[#7ad8a0] bg-[#7ad8a0]/15' : wrong ? 'border-[#ff8a7a] bg-[#ff8a7a]/12' : picked ? 'border-accent bg-accent/10' : 'border-line hover:border-accent/60'}`}
                    >
                      <span className="mr-2 text-muted">{String.fromCharCode(65 + i)}</span>
                      {o}
                    </button>
                  )
                })}
              </div>
              {result && <p className="mt-1.5 text-[13px] text-muted">{q.why}</p>}
            </li>
          ))}
          {(set?.saq ?? []).map((q, k) => (
            <li key={`s${k}`}>
              <div className="mb-2 text-[14.5px] font-medium">
                {(set?.mcq.length ?? 0) + k + 1}. {q.q} <span className="text-xs text-muted">(short answer · {q.points.length} marks)</span>
              </div>
              <textarea
                className="field-boxed min-h-[84px] w-full rounded-lg p-2 text-sm"
                value={saq[k] ?? ''}
                disabled={!!result}
                onChange={(e) => setSaq((a) => a.map((x, j) => (j === k ? e.target.value : x)))}
              />
              {result && (
                <div className="mt-1.5 text-[13px]">
                  {q.points.map((p, i) => (
                    <div key={i} className={result.saq[k]?.hit[i] ? 'text-[#9be3b8]' : 'text-[#ffb0a6]'}>
                      {result.saq[k]?.hit[i] ? '✓' : '✗'} {p}
                    </div>
                  ))}
                  <p className="mt-1 text-muted">{result.saq[k]?.feedback}</p>
                  <p className="mt-1 text-muted">
                    <b>Model answer:</b> {q.model}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ol>
        {set && !empty && !result && (
          <button className="btn-primary mt-6 rounded-full px-5 py-2 text-sm font-semibold" disabled={marking} onClick={() => void submit()}>
            {marking ? 'Marking…' : 'Mark it'}
          </button>
        )}
      </div>
    </div>
  )
}

// ---------- Settings tab: every shortcut in one place ----------
export function ShortcutsCard({ capture }: { capture: string }): React.JSX.Element {
  const keys = (s: string): React.JSX.Element => (
    <span className="nova-keys">
      {s.split('+').map((k, i) => (
        <span key={i}>
          {i > 0 && '+'}
          <kbd>{k.trim()}</kbd>
        </span>
      ))}
    </span>
  )
  const rows: [React.JSX.Element, string][] = [
    [keys('Ctrl+Alt'), 'Hold and talk to Nova'],
    [keys('Ctrl+Shift'), 'Tap to type to Nova beside your cursor'],
    [keys('Ctrl+Alt+Shift'), 'Hold: Nova listens to what’s playing on your PC'],
    [keys('Ctrl+Alt+B'), 'Circle something on screen and ask about it'],
    [keys('Ctrl+Alt+N'), 'Show or hide Nova'],
    [keys('Ctrl+Alt+T'), 'Tutor mode on or off'],
    [keys('Ctrl+Alt+C'), 'Conversation mode on or off'],
    [keys('Esc'), 'Stop Nova talking or drawing'],
    [<span key="r">Right-click</span>, 'While circling: take your last mark away']
  ]
  if (capture) rows.push([keys(capture.replace('CommandOrControl', 'Ctrl')), 'Quick capture: jot something down'])
  return (
    <section className="card rounded-2xl p-5" data-settings="shortcuts keys keyboard hotkeys">
      <h2 className="font-semibold">Shortcuts</h2>
      <ul className="mt-2 flex flex-col">
        {rows.map(([k, what], i) => (
          <li key={i} className="flex items-center gap-3 border-t border-line py-2 text-[13px] first:border-t-0">
            <span className="w-40 shrink-0">{k}</span>
            <span className="text-muted">{what}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
