import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SavedQuiz, SavedQuizQuestion } from '@shared/types'
import { api } from '@/lib/data'
import { GRADES, isDue, previewInterval, type Grade } from '@/lib/sm2'

type QueueItem = { quizId: string; quizTitle: string; course: string; q: SavedQuizQuestion }

function fmtDue(iso: string | undefined): string {
  if (!iso) return 'Due now'
  const diff = Date.parse(iso) - Date.now()
  if (diff <= 0) return 'Due now'
  const mins = Math.round(diff / 60_000)
  if (mins < 60) return `In ${mins}m`
  const hrs = Math.round(diff / 36e5)
  if (hrs < 36) return `In ${hrs}h`
  return `In ${Math.round(diff / 864e5)}d`
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return ''
  }
}

export function QuizzesTab({ onDueChange }: { onDueChange?: (n: number) => void }): React.JSX.Element {
  const [quizzes, setQuizzes] = useState<SavedQuiz[] | null>(null)
  const [courseFilter, setCourseFilter] = useState<string>('ALL')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reviewQueue, setReviewQueue] = useState<QueueItem[] | null>(null)
  const [reviewIdx, setReviewIdx] = useState(0)
  const [pickedOption, setPickedOption] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [zoomImg, setZoomImg] = useState<string | null>(null)
  const [editingNote, setEditingNote] = useState<{ quizId: string; qId: string; text: string } | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ course: '', title: '', prompt: '', options: '', answer: '', note: '' })

  const load = useCallback(async () => {
    try {
      const list = (await api.quizzes?.list()) ?? []
      setQuizzes(list)
      const dueCount = list.reduce((sum, qz) => sum + qz.questions.filter((q) => isDue(q)).length, 0)
      onDueChange?.(dueCount)
    } catch {
      setQuizzes([])
      onDueChange?.(0)
    }
  }, [onDueChange])

  useEffect(() => {
    void load()
    const off = api.quizzes?.onChanged?.(() => void load())
    return () => off?.()
  }, [load])

  const courses = useMemo(() => {
    const set = new Set<string>()
    for (const qz of quizzes ?? []) if (qz.course) set.add(qz.course)
    return ['ALL', ...Array.from(set).sort()]
  }, [quizzes])

  const filtered = useMemo(
    () => (quizzes ?? []).filter((qz) => courseFilter === 'ALL' || qz.course === courseFilter),
    [quizzes, courseFilter]
  )

  const dueItems = useMemo<QueueItem[]>(() => {
    const out: QueueItem[] = []
    for (const qz of filtered) {
      for (const q of qz.questions) {
        if (isDue(q)) out.push({ quizId: qz.id, quizTitle: qz.title, course: qz.course, q })
      }
    }
    return out
  }, [filtered])

  const totalQuestions = useMemo(() => filtered.reduce((s, qz) => s + qz.questions.length, 0), [filtered])
  const selectedQuiz = useMemo(() => (quizzes ?? []).find((q) => q.id === selectedId) ?? null, [quizzes, selectedId])

  const startReview = (items: QueueItem[]): void => {
    if (!items.length) return
    setReviewQueue(items)
    setReviewIdx(0)
    setPickedOption(null)
    setRevealed(false)
  }

  const gradeCurrent = useCallback(
    async (grade: Grade) => {
      if (!reviewQueue) return
      const cur = reviewQueue[reviewIdx]
      if (!cur) return
      const updated = await api.quizzes?.review(cur.quizId, cur.q.id, grade)
      if (updated) {
        setQuizzes((prev) => (prev ? prev.map((x) => (x.id === updated.id ? updated : x)) : prev))
      }
      if (grade === 1) setReviewQueue((prev) => (prev ? [...prev, cur] : prev))
      const nextIdx = reviewIdx + 1
      if (nextIdx >= reviewQueue.length + (grade === 1 ? 1 : 0)) {
        setReviewQueue(null)
        void load()
      } else {
        setReviewIdx(nextIdx)
        setPickedOption(null)
        setRevealed(false)
      }
    },
    [reviewQueue, reviewIdx, load]
  )

  useEffect(() => {
    if (!reviewQueue) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Escape') {
        setReviewQueue(null)
        void load()
        return
      }
      if (e.key === ' ' && !revealed) {
        e.preventDefault()
        setRevealed(true)
        return
      }
      if (revealed) {
        const hit = GRADES.find((g) => g.key === e.key)
        if (hit) {
          e.preventDefault()
          void gradeCurrent(hit.grade)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reviewQueue, revealed, gradeCurrent, load])

  const saveNote = async (): Promise<void> => {
    if (!editingNote) return
    const updated = await api.quizzes?.updateNote(editingNote.quizId, editingNote.qId, editingNote.text)
    if (updated) setQuizzes((prev) => (prev ? prev.map((x) => (x.id === updated.id ? updated : x)) : prev))
    setEditingNote(null)
  }

  const removeQuiz = async (id: string): Promise<void> => {
    await api.quizzes?.remove(id)
    if (selectedId === id) setSelectedId(null)
    void load()
  }

  const submitManual = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!draft.prompt.trim()) return
    const opts = draft.options.split('\n').map((s) => s.trim()).filter(Boolean)
    await api.quizzes?.addManual({
      course: draft.course || 'General',
      title: draft.title || 'Practice Question',
      questions: [{ prompt: draft.prompt, options: opts, chosen: draft.answer ? [draft.answer] : [], note: draft.note }]
    })
    setDraft({ course: draft.course, title: draft.title, prompt: '', options: '', answer: '', note: '' })
    setAdding(false)
    void load()
  }

  if (reviewQueue && reviewQueue[reviewIdx]) {
    const item = reviewQueue[reviewIdx]
    const q = item.q
    const savedAnswers = q.chosen.filter(Boolean)
    const isMatch = (opt: string): boolean =>
      savedAnswers.some((a) => a.toLowerCase().trim() === opt.toLowerCase().trim())

    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-muted">
            <b className="text-ink">{item.course}</b> · {item.quizTitle} · Card {reviewIdx + 1} of {reviewQueue.length}
          </div>
          <button
            className="glass rounded-full px-3 py-1 text-xs font-semibold"
            onClick={() => {
              setReviewQueue(null)
              void load()
            }}
          >
            Exit review (Esc)
          </button>
        </div>

        <section className="card flex flex-col gap-4 rounded-2xl p-6">
          <div className="text-[16px] font-medium leading-relaxed">{q.prompt}</div>

          {q.images.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {q.images.map((src, idx) => (
                <img
                  key={idx}
                  src={src}
                  alt={`Diagram ${idx + 1}`}
                  className="max-h-64 cursor-zoom-in rounded-xl border border-line object-contain"
                  onClick={() => setZoomImg(src)}
                />
              ))}
            </div>
          )}

          {q.options.length > 0 && (
            <div className="flex flex-col gap-2">
              {q.options.map((opt, idx) => {
                const picked = pickedOption === opt
                const correct = revealed && isMatch(opt)
                const wrongPick = revealed && picked && !correct
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setPickedOption(opt)
                      setRevealed(true)
                    }}
                    className={`rounded-xl border px-4 py-2.5 text-left text-[13.5px] transition ${
                      correct
                        ? 'border-[#7ee2b8] bg-[#7ee2b8]/15 text-ink'
                        : wrongPick
                          ? 'border-[#f08a7a] bg-[#f08a7a]/15 text-ink'
                          : picked
                            ? 'border-accent bg-accent/10 text-ink'
                            : 'border-line hover:border-muted'
                    }`}
                  >
                    <span className="mr-2 text-xs font-semibold text-muted">{String.fromCharCode(65 + idx)}.</span>
                    {opt}
                  </button>
                )
              })}
            </div>
          )}

          {!revealed ? (
            <div className="pt-2">
              <button className="btn-primary rounded-full px-5 py-2 text-sm font-semibold" onClick={() => setRevealed(true)}>
                Show answer (Space)
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 border-t border-line pt-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">Saved answer</div>
                <div className="mt-1 text-[14px] font-medium text-[#7ee2b8]">
                  {savedAnswers.length ? savedAnswers.join(' · ') : 'No answer recorded yet'}
                </div>
              </div>
              {q.note && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted">Notes</div>
                  <div className="mt-1 text-[13.5px] text-muted">{q.note}</div>
                </div>
              )}
              <div className="pt-1">
                <div className="mb-2 text-xs text-muted">How well did you remember this? (Keys 1-4)</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {GRADES.map((g) => (
                    <button
                      key={g.grade}
                      className="glass flex flex-col items-center rounded-xl py-2.5 text-sm font-semibold hover:brightness-110"
                      onClick={() => void gradeCurrent(g.grade)}
                    >
                      <span className={g.tone}>{g.label}</span>
                      <span className="text-[11px] font-normal text-muted">
                        {previewInterval(q, g.grade)} · [{g.key}]
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        {zoomImg && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6" onClick={() => setZoomImg(null)}>
            <img src={zoomImg} alt="Zoomed diagram" className="max-h-full max-w-full rounded-xl object-contain" />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="card flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5">
        <div>
          <h2 className="font-semibold">PoliteMall Quiz Bank &amp; Spaced Repetition</h2>
          <p className="mt-1 text-[13px] text-muted">
            Every PoliteMall quiz Nova runs is automatically saved here with its questions, options, diagrams, and SM-2 schedule.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-[12.5px]">
            <span className="nova-chip">Saved quizzes <b>{filtered.length}</b></span>
            <span className="nova-chip">Questions <b>{totalQuestions}</b></span>
            <span className="nova-chip">
              Due for review <b className={dueItems.length ? 'text-[#7ee2b8]' : ''}>{dueItems.length}</b>
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-primary rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-40"
            disabled={!dueItems.length}
            onClick={() => startReview(dueItems)}
          >
            {dueItems.length ? `Review due (${dueItems.length})` : 'All caught up'}
          </button>
          <button className="glass rounded-full px-4 py-2 text-sm font-semibold" onClick={() => setAdding((v) => !v)}>
            {adding ? 'Close' : '+ Add question'}
          </button>
        </div>
      </section>

      {adding && (
        <form className="card flex flex-col gap-3 rounded-2xl p-5" onSubmit={(e) => void submitManual(e)}>
          <h3 className="text-sm font-semibold">Add a manual practice question</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <input className="field-boxed text-sm" placeholder="Module (e.g. HBS, Pharmacology)" value={draft.course} onChange={(e) => setDraft({ ...draft, course: e.target.value })} />
            <input className="field-boxed text-sm" placeholder="Quiz title (e.g. Endocrine Week 5)" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </div>
          <textarea className="field-boxed text-sm" rows={2} placeholder="Question prompt..." value={draft.prompt} onChange={(e) => setDraft({ ...draft, prompt: e.target.value })} />
          <textarea className="field-boxed text-sm" rows={3} placeholder="Options (one per line, optional)" value={draft.options} onChange={(e) => setDraft({ ...draft, options: e.target.value })} />
          <div className="grid gap-2 sm:grid-cols-2">
            <input className="field-boxed text-sm" placeholder="Correct answer" value={draft.answer} onChange={(e) => setDraft({ ...draft, answer: e.target.value })} />
            <input className="field-boxed text-sm" placeholder="Short explanation / note (optional)" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
          </div>
          <div>
            <button className="btn-primary rounded-full px-4 py-1.5 text-sm font-semibold" type="submit" disabled={!draft.prompt.trim()}>
              Save to Quizzes
            </button>
          </div>
        </form>
      )}

      {courses.length > 2 && (
        <div className="flex flex-wrap gap-1.5">
          {courses.map((c) => (
            <button
              key={c}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${courseFilter === c ? 'btn-primary' : 'glass text-muted'}`}
              onClick={() => setCourseFilter(c)}
            >
              {c === 'ALL' ? 'All modules' : c}
            </button>
          ))}
        </div>
      )}

      {quizzes === null ? (
        <div className="text-sm text-muted">Loading saved quizzes...</div>
      ) : filtered.length === 0 ? (
        <section className="card rounded-2xl p-6 text-center text-sm text-muted">
          No saved quizzes yet. The next time Nova runs a PoliteMall quiz, every question and diagram will appear here automatically - or click <b>+ Add question</b> above to test spaced repetition now.
        </section>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <div className="flex flex-col gap-2">
            {filtered.map((qz) => {
              const due = qz.questions.filter((q) => isDue(q)).length
              const active = selectedId === qz.id || (!selectedId && filtered[0]?.id === qz.id)
              return (
                <button
                  key={qz.id}
                  onClick={() => setSelectedId(qz.id)}
                  className={`card flex flex-col gap-1 rounded-2xl p-4 text-left transition ${active ? 'ring-1 ring-accent' : 'opacity-85 hover:opacity-100'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{qz.course || 'PoliteMall'}</span>
                    {qz.score && <span className="nova-tag free">{qz.score}</span>}
                  </div>
                  <div className="font-semibold leading-snug">{qz.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span>{qz.questions.length} Qs</span>
                    <span>·</span>
                    <span className={due ? 'text-[#7ee2b8]' : ''}>{due ? `${due} due` : 'Caught up'}</span>
                    <span>·</span>
                    <span>{fmtDate(qz.submittedAt ?? qz.startedAt)}</span>
                  </div>
                </button>
              )
            })}
          </div>

          {(() => {
            const qz = selectedQuiz ?? filtered[0]
            if (!qz) return null
            const quizItems: QueueItem[] = qz.questions.map((q) => ({ quizId: qz.id, quizTitle: qz.title, course: qz.course, q }))
            const quizDue = quizItems.filter((x) => isDue(x.q))
            return (
              <section className="card flex flex-col gap-4 rounded-2xl p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted">{qz.course}</div>
                    <h3 className="text-lg font-semibold">{qz.title}</h3>
                    <div className="text-xs text-muted">
                      {qz.questions.length} questions · {qz.submittedAt ? `Submitted ${fmtDate(qz.submittedAt)}` : `Started ${fmtDate(qz.startedAt)}`}
                      {qz.score ? ` · Score: ${qz.score}` : ''}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {quizDue.length > 0 && (
                      <button className="btn-primary rounded-full px-3.5 py-1.5 text-xs font-semibold" onClick={() => startReview(quizDue)}>
                        Review due ({quizDue.length})
                      </button>
                    )}
                    <button className="glass rounded-full px-3.5 py-1.5 text-xs font-semibold" onClick={() => startReview(quizItems)}>
                      Practice all
                    </button>
                    <button className="nova-quiet danger text-xs" onClick={() => void removeQuiz(qz.id)}>
                      Delete
                    </button>
                  </div>
                </div>

                <div className="flex flex-col divide-y divide-line">
                  {qz.questions.map((q, idx) => {
                    const isEditing = editingNote?.quizId === qz.id && editingNote.qId === q.id
                    return (
                      <div key={q.id} className="flex flex-col gap-2 py-3.5 first:pt-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-[13.5px] font-medium leading-snug">
                            <span className="mr-1.5 text-muted">Q{idx + 1}.</span>
                            {q.prompt}
                          </div>
                          <span className={`shrink-0 text-[11px] ${isDue(q) ? 'text-[#7ee2b8]' : 'text-muted'}`}>{fmtDue(q.due_at)}</span>
                        </div>

                        {q.images.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {q.images.map((src, i) => (
                              <img
                                key={i}
                                src={src}
                                alt={`Q${idx + 1} diagram`}
                                className="max-h-36 cursor-zoom-in rounded-lg border border-line object-contain"
                                onClick={() => setZoomImg(src)}
                              />
                            ))}
                          </div>
                        )}

                        {q.options.length > 0 && (
                          <ul className="flex flex-col gap-1 pl-4 text-[12.5px]">
                            {q.options.map((opt, j) => {
                              const picked = q.chosen.some((c) => c.toLowerCase().trim() === opt.toLowerCase().trim())
                              return (
                                <li key={j} className={picked ? 'font-semibold text-[#7ee2b8]' : 'text-muted'}>
                                  {picked ? '✓ ' : '• '}
                                  {opt}
                                </li>
                              )
                            })}
                          </ul>
                        )}

                        {q.options.length === 0 && q.chosen.length > 0 && (
                          <div className="pl-4 text-[12.5px] font-semibold text-[#7ee2b8]">Answer: {q.chosen.join(', ')}</div>
                        )}

                        {isEditing ? (
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <input
                              className="field-boxed min-w-0 flex-1 text-xs"
                              placeholder="Add takeaway, rationale, or correction..."
                              value={editingNote.text}
                              onChange={(e) => setEditingNote({ ...editingNote, text: e.target.value })}
                            />
                            <button className="text-xs underline" onClick={() => void saveNote()}>Save</button>
                            <button className="text-xs text-muted underline" onClick={() => setEditingNote(null)}>Cancel</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-xs text-muted">
                            {q.note && <span>Note: {q.note}</span>}
                            <button
                              className="underline hover:text-ink"
                              onClick={() => setEditingNote({ quizId: qz.id, qId: q.id, text: q.note || '' })}
                            >
                              {q.note ? 'Edit note' : '+ Add note'}
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })()}
        </div>
      )}

      {zoomImg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6" onClick={() => setZoomImg(null)}>
          <img src={zoomImg} alt="Zoomed diagram" className="max-h-full max-w-full rounded-xl object-contain" />
        </div>
      )}
    </div>
  )
}
