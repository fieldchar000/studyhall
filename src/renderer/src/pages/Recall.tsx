// Active recall: today's pages from each module, recalled before they're revealed.

import { useEffect, useRef, useState } from 'react'
import type { Module, RecallCard } from '@shared/types'
import { Icon, Modal } from '@/components/ui'
import { notifyChanged, useLive, useRows } from '@/lib/data'
import { navigate } from '@/lib/nav'
import {
  getScope,
  setScope,
  doneToday,
  drawPdfPage,
  grade,
  hiddenModules,
  pageFor,
  perModule,
  resetToday,
  setHiddenModules,
  setPerModule,
  sourceFor,
  todaysCards,
  type RecallPage,
  type Result
} from '@/lib/recall'

const RESULT_STYLE: Record<Result, { label: string; cls: string; dot: string }> = {
  got: { label: 'Got it', cls: 'border-ok/40 text-ok', dot: 'bg-ok' },
  partly: { label: 'Partly', cls: 'border-brass/50 text-brass', dot: 'bg-brass' },
  missed: { label: 'Missed it', cls: 'border-danger/40 text-danger', dot: 'bg-danger' }
}

/** Today's cards for every module (built on first open each day). */
export function useRecallToday(modules: Module[] | undefined): { byModule: Map<string, RecallCard[]>; loading: boolean } {
  const ids = (modules ?? []).map((m) => m.id).join(',')
  const live = useLive(
    ['recall_cards', 'notes', 'materials'],
    async () => {
      const out = new Map<string, RecallCard[]>()
      for (const m of modules ?? []) out.set(m.id, await todaysCards(m.id).catch(() => []))
      // Re-read so grades made elsewhere show up.
      for (const [id, cards] of out) {
        const fresh = new Map((await window.api.list('recall_cards', { module_id: id })).map((c) => [c.id, c]))
        out.set(
          id,
          cards.map((c) => fresh.get(c.id) ?? c)
        )
      }
      return out
    },
    [ids]
  )
  return { byModule: live.data ?? new Map(), loading: !live.data }
}

export function RecallPage(): React.JSX.Element {
  const modules = useRows('modules', { archived: 0 }, 'sort')
  const [hidden, setHidden] = useState(hiddenModules)
  const [count, setCount] = useState(perModule)
  const shown = (modules ?? []).filter((m) => !hidden.includes(m.id))
  const { byModule, loading } = useRecallToday(shown)
  const [session, setSession] = useState<{ module: Module; start: number } | null>(null)

  const all = [...byModule.values()].flat()
  const done = all.filter(doneToday)
  const got = done.filter((c) => c.last_result === 'got').length

  const toggleHidden = (id: string): void => {
    const next = hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id]
    setHidden(next)
    setHiddenModules(next)
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 px-8 py-7">
        <header className="masthead flex flex-wrap items-end gap-4">
          <div className="mr-auto">
            <div className="label-caps">Study · {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
            <h1 className="text-3xl">Active recall</h1>
            <p className="mt-1 max-w-xl text-sm text-muted">
              Every day, {count} pages from each module. Study a page, it disappears, then write down everything you remember — pulling it back out of memory is what makes it stick.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            Pages per module
            <select
              className="field-boxed w-auto py-1"
              value={count}
              onChange={(e) => {
                const n = Number(e.target.value)
                setCount(n)
                setPerModule(n)
                for (const m of shown) if (!(byModule.get(m.id) ?? []).some(doneToday)) resetToday(m.id)
              }}
            >
              {[5, 10, 15, 20].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
        </header>

        {all.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Pages today" value={`${done.length} / ${all.length}`} />
            <Stat label="Remembered" value={done.length ? `${Math.round((got / done.length) * 100)}%` : '—'} />
            <Stat label="Modules" value={String(shown.length)} />
          </div>
        )}

        {!modules ? null : modules.length === 0 ? (
          <Empty title="No modules yet" body="Add your modules, then put notes and files in them. Active recall picks pages from them every day." action={['Set up modules', () => navigate({ name: 'modules' })]} />
        ) : (
          shown.map((m) => (
            <ModuleRecall key={m.id} module={m} cards={byModule.get(m.id)} loading={loading} onStart={(start) => setSession({ module: m, start })} onHide={() => toggleHidden(m.id)} />
          ))
        )}
        {hidden.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            Skipped today:
            {(modules ?? [])
              .filter((m) => hidden.includes(m.id))
              .map((m) => (
                <button key={m.id} className="chip" onClick={() => toggleHidden(m.id)}>
                  {m.code || m.name} · show
                </button>
              ))}
          </div>
        )}
      </div>
      {session && <Session module={session.module} cards={byModule.get(session.module.id) ?? []} start={session.start} onClose={() => setSession(null)} />}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="card px-4 py-3">
      <div className="label-caps">{label}</div>
      <div className="font-display text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function Empty({ title, body, action }: { title: string; body: string; action?: [string, () => void] }): React.JSX.Element {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-10 text-center">
      <Icon name="recall" size={34} className="text-brass" />
      <h2 className="text-xl">{title}</h2>
      <p className="max-w-md text-sm text-muted">{body}</p>
      {action && (
        <button className="btn mt-2" onClick={action[1]}>
          {action[0]}
        </button>
      )}
    </div>
  )
}

function ModuleRecall({
  module: m,
  cards,
  loading,
  onStart,
  onHide
}: {
  module: Module
  cards: RecallCard[] | undefined
  loading: boolean
  onStart: (index: number) => void
  onHide: () => void
}): React.JSX.Element {
  const list = cards ?? []
  const done = list.filter(doneToday).length
  const next = Math.max(0, list.findIndex((c) => !doneToday(c)))
  return (
    <section className="card">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: m.color }} />
        <div className="min-w-0 flex-1">
          <div className="label-caps">Active recall — {m.code || 'module'}</div>
          <div className="font-display truncate text-xl font-semibold">{m.name}</div>
        </div>
        {list.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted tabular-nums">
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(done / list.length) * 100}%` }} />
            </div>
            {done}/{list.length}
          </div>
        )}
        {list.length > 0 && (
          <button className="btn-primary" onClick={() => onStart(done === list.length ? 0 : next)}>
            {done === 0 ? 'Start' : done === list.length ? 'Go again' : 'Continue'}
          </button>
        )}
        <ScopePicker moduleId={m.id} />
        <button className="btn-ghost px-1.5 text-xs" onClick={onHide} title="Skip this module today (and until you show it again)">
          Skip
        </button>
      </div>
      <div className="border-t border-line/70 px-5 py-4">
        {!cards && loading ? (
          <p className="text-sm text-muted">Picking today’s pages…</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing to recall yet — add notes or files to this module in{' '}
            <button className="text-accent underline" onClick={() => navigate({ name: 'materials' })}>
              Materials
            </button>
            .
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {list.map((c, i) => {
              const r = doneToday(c) && c.last_result ? RESULT_STYLE[c.last_result] : null
              return (
                <button
                  key={c.id}
                  onClick={() => onStart(i)}
                  className="group flex min-h-20 flex-col gap-1 rounded-md border border-line bg-canvas/50 p-2.5 text-left transition-colors hover:border-brass/60"
                >
                  <span className="flex items-center gap-1.5 text-[10px] tracking-wide text-muted uppercase">
                    <span className={`h-1.5 w-1.5 rounded-full ${r ? r.dot : 'bg-line'}`} />
                    {i + 1}
                    {r && <span className="normal-case">· {r.label}</span>}
                  </span>
                  <span className="line-clamp-3 text-[12.5px] leading-snug">{c.label}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

type Phase = 'look' | 'recall' | 'check'

const LOOK_KEY = 'recall.lookSeconds'
const lookSeconds = (): number => {
  try {
    return Number(localStorage.getItem(LOOK_KEY)) || 30
  } catch {
    return 30
  }
}

/** One page at a time: look at the real page → it's hidden while you recall and write → check and grade.
 *  Keys: Space moves on, 1 2 3 grade. */
function Session({ module: m, cards, start, onClose }: { module: Module; cards: RecallCard[]; start: number; onClose: () => void }): React.JSX.Element {
  const [index, setIndex] = useState(start)
  const [page, setPage] = useState<RecallPage | null | 'missing'>(null)
  const [phase, setPhase] = useState<Phase>('look')
  const [seconds, setSeconds] = useState(lookSeconds)
  const [left, setLeft] = useState(seconds)
  const [thinking, setThinking] = useState(0)
  const [jot, setJot] = useState('')
  const [results, setResults] = useState<Record<string, Result>>({})
  const [finished, setFinished] = useState(false)
  const card = cards[index]

  useEffect(() => {
    if (!card) return
    let live = true
    setPage(null)
    setPhase('look')
    setJot('')
    setLeft(seconds)
    setThinking(0)
    void pageFor(card)
      .then((p) => live && setPage(p ?? 'missing'))
      .catch(() => live && setPage('missing'))
    return () => {
      live = false
    }
  }, [card?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Look: count down, then hide the page. Recall: count the thinking time.
  useEffect(() => {
    if (!page || page === 'missing' || finished) return
    const t = setInterval(() => {
      if (phase === 'look') setLeft((s) => (seconds === 0 ? s : s - 1))
      else if (phase === 'recall') setThinking((s) => s + 1)
    }, 1000)
    return () => clearInterval(t)
  }, [phase, page, seconds, finished])
  useEffect(() => {
    if (phase === 'look' && seconds > 0 && left <= 0) setPhase('recall')
  }, [left, phase, seconds])

  const rate = async (r: Result): Promise<void> => {
    if (!card) return
    await grade(card, r)
    setResults((x) => ({ ...x, [card.id]: r }))
    if (index + 1 < cards.length) setIndex(index + 1)
    else setFinished(true)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const typing = (e.target as HTMLElement)?.tagName === 'TEXTAREA'
      if (typing && !(e.key === 'Enter' && e.ctrlKey)) return
      if (phase === 'look' && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        setPhase('recall')
      } else if (phase === 'recall' && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        setPhase('check')
      } else if (phase === 'check' && ['1', '2', '3'].includes(e.key)) void rate((['missed', 'partly', 'got'] as Result[])[Number(e.key) - 1])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const setLook = (n: number): void => {
    setSeconds(n)
    setLeft(n)
    try {
      localStorage.setItem(LOOK_KEY, String(n))
    } catch {
      /* optional */
    }
  }

  const openSource = async (): Promise<void> => {
    const src = card && (await sourceFor(card))
    if (!src) return
    onClose()
    navigate(src.table === 'notes' ? { name: 'notes', id: src.row.id } : { name: 'materials' })
  }

  const tally = Object.values(results)
  const steps: [Phase, string][] = [
    ['look', 'Look'],
    ['recall', 'Recall'],
    ['check', 'Check']
  ]
  const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <Modal wide title={`Active recall — ${m.code || m.name}`} onClose={onClose}>
      {finished || !card ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-10 text-center">
          <Icon name="recall" size={40} className="text-brass" />
          <h2 className="text-3xl">Done for today</h2>
          <p className="text-muted">
            {tally.filter((r) => r === 'got').length} remembered · {tally.filter((r) => r === 'partly').length} partly · {tally.filter((r) => r === 'missed').length} missed. Missed pages come back
            tomorrow; the ones you knew come back later and later.
          </p>
          <button className="btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      ) : (
        <div className="mx-auto flex max-w-4xl flex-col gap-4 px-6 py-5">
          {/* progress across today's pages */}
          <div className="flex items-center gap-1.5">
            {cards.map((c, i) => {
              const r = results[c.id] ?? (doneToday(c) ? c.last_result : null)
              return <button key={c.id} onClick={() => setIndex(i)} title={c.label} className={`h-1.5 flex-1 rounded-full ${i === index ? 'bg-ink' : r ? RESULT_STYLE[r].dot : 'bg-line'}`} />
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 text-sm">
              {steps.map(([p, label], i) => (
                <span key={p} className="flex items-center gap-1">
                  {i > 0 && <span className="text-line">—</span>}
                  <span className={`rounded-full px-2.5 py-0.5 ${phase === p ? 'bg-accent text-on-accent' : steps.findIndex((s) => s[0] === phase) > i ? 'text-ok' : 'text-muted'}`}>
                    {i + 1}. {label}
                  </span>
                </span>
              ))}
            </div>
            <span className="ml-auto text-xs text-muted">
              Page {index + 1} of {cards.length} · {card.label}
            </span>
          </div>

          {page === null ? (
            <p className="py-10 text-center text-muted">Opening the page…</p>
          ) : page === 'missing' ? (
            <div className="flex flex-col gap-3">
              <p className="text-muted">This page isn’t available on this PC (the file may be missing or was changed).</p>
              <button className="btn self-start" onClick={() => void rate('partly')}>
                Skip
              </button>
            </div>
          ) : phase === 'look' ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <div className="label-caps">Read this page carefully</div>
                  <h2 className="text-2xl leading-tight">{page.cue}</h2>
                </div>
                <div className="ml-auto flex items-center gap-2 text-sm text-muted">
                  Time to look
                  <select className="field-boxed w-auto py-0.5 text-sm" value={seconds} onChange={(e) => setLook(Number(e.target.value))}>
                    {[15, 30, 45, 60, 90, 120].map((s) => (
                      <option key={s} value={s}>
                        {s < 60 ? `${s}s` : `${s / 60} min`}
                      </option>
                    ))}
                    <option value={0}>No limit</option>
                  </select>
                </div>
              </div>
              {seconds > 0 && (
                <div className="h-1 overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-brass transition-all duration-1000 ease-linear" style={{ width: `${(left / seconds) * 100}%` }} />
                </div>
              )}
              <PageView page={page} />
              <div className="flex items-center gap-3">
                <button className="btn-primary" onClick={() => setPhase('recall')}>
                  I’m ready — hide it <kbd className="ml-1 rounded-sm border border-white/30 px-1 text-[10px]">Space</kbd>
                </button>
                {seconds > 0 && <span className="text-sm text-muted tabular-nums">hides in {left}s</span>}
              </div>
            </>
          ) : phase === 'recall' ? (
            <>
              <div className="rounded-lg border border-dashed border-brass/60 bg-canvas/60 px-6 py-8 text-center">
                <div className="label-caps">The page is hidden</div>
                <h2 className="mt-1 text-3xl leading-tight">{page.cue}</h2>
                <p className="mx-auto mt-2 max-w-xl text-sm text-muted">Close your eyes for a moment, then write down everything you remember — the main idea, key terms, examples, how it connects to what you already know.</p>
              </div>
              <textarea className="field-boxed min-h-48 text-[15px] leading-relaxed" placeholder="What do you remember?" value={jot} onChange={(e) => setJot(e.target.value)} autoFocus />
              <div className="flex items-center gap-3">
                <button className="btn-primary" onClick={() => setPhase('check')}>
                  Check against the page <kbd className="ml-1 rounded-sm border border-white/30 px-1 text-[10px]">Ctrl+Enter</kbd>
                </button>
                <span className="text-sm text-muted tabular-nums">thinking {mmss(thinking)}</span>
              </div>
            </>
          ) : (
            <>
              <div className={`grid gap-4 ${jot.trim() ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]' : ''}`}>
                {jot.trim() && (
                  <div className="flex flex-col gap-1">
                    <div className="label-caps">What you remembered</div>
                    <div className="min-h-32 flex-1 rounded-lg border border-line bg-canvas/60 p-4 text-sm leading-relaxed whitespace-pre-wrap">{jot}</div>
                  </div>
                )}
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="label-caps">The page</div>
                  <PageView page={page} />
                </div>
              </div>
              <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-line bg-panel py-3">
                <span className="mr-1 text-sm text-muted">How much did you get?</span>
                {(['missed', 'partly', 'got'] as Result[]).map((r, i) => (
                  <button key={r} className={`btn ${RESULT_STYLE[r].cls}`} onClick={() => void rate(r)}>
                    {RESULT_STYLE[r].label} <kbd className="text-[10px] opacity-60">{i + 1}</kbd>
                  </button>
                ))}
                <button className="btn-ghost ml-auto text-xs" onClick={() => void openSource()}>
                  Open the source
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}

function PageView({ page }: { page: RecallPage }): React.JSX.Element {
  return <div className="rounded-lg border border-line bg-panel p-4">{page.pdf ? <PdfPage data={page.pdf.data} page={page.pdf.page} /> : <article className="reader max-w-none" dangerouslySetInnerHTML={{ __html: page.html }} />}</div>
}

function PdfPage({ data, page }: { data: Uint8Array; page: number }): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!ref.current || !wrap.current) return
    void drawPdfPage(data, page, ref.current, Math.min(wrap.current.clientWidth, 900)).catch(() => setFailed(true))
  }, [data, page])
  return (
    <div ref={wrap} className="flex justify-center">
      {failed ? <p className="text-sm text-muted">Couldn’t draw this page.</p> : <canvas ref={ref} className="rounded-sm shadow-sm" />}
    </div>
  )
}

/** Choose which weeks a module's active recall tests: everything, one week, or several. */
function ScopePicker({ moduleId }: { moduleId: string }): React.JSX.Element {
  const weeks = (useRows('weeks', { module_id: moduleId }, 'number') ?? []).slice().sort((a, b) => a.number - b.number)
  const [scope, setLocal] = useState<string[] | null>(() => getScope(moduleId))
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])
  const apply = (next: string[] | null): void => {
    setScope(moduleId, next)
    setLocal(next && next.length ? next : null)
    resetToday(moduleId)
    notifyChanged('recall_cards') // rebuild today's pages for the new selection
  }
  const toggle = (id: string): void => {
    const cur = new Set(scope ?? [])
    if (cur.has(id)) cur.delete(id)
    else cur.add(id)
    apply([...cur])
  }
  const label = !scope
    ? 'All materials'
    : scope.length === 1
      ? scope[0] === 'none'
        ? 'Not in a week'
        : `Week ${weeks.find((w) => w.id === scope[0])?.number ?? '?'}`
      : `${scope.length} weeks`
  return (
    <div className="relative" ref={ref}>
      <button className="btn px-2.5 py-1 text-xs" onClick={() => setOpen((o) => !o)} title="Choose which weeks to test">
        <Icon name="calendar" size={13} /> Testing: <span className="font-semibold">{label}</span>
        <Icon name="chevron" size={11} className={`transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} />
      </button>
      {open && (
        <div className="card absolute right-0 z-30 mt-1 flex max-h-80 w-60 flex-col overflow-auto p-1.5 shadow-xl">
          <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-line/40">
            <input type="radio" checked={!scope} onChange={() => apply(null)} />
            <span className="font-medium">All materials</span>
          </label>
          <div className="my-1 border-t border-line/70" />
          {weeks.map((w) => (
            <label key={w.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-line/40">
              <input type="checkbox" checked={!!scope?.includes(w.id)} onChange={() => toggle(w.id)} />
              <span className="truncate">
                Week {w.number}
                {w.title ? ` · ${w.title}` : ''}
              </span>
            </label>
          ))}
          <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-line/40">
            <input type="checkbox" checked={!!scope?.includes('none')} onChange={() => toggle('none')} />
            <span className="text-muted">Not in a week</span>
          </label>
          <p className="px-2 pt-1 pb-0.5 text-[11px] text-muted">Pick one week before a quiz, several before a test, or all of them for revision.</p>
        </div>
      )}
    </div>
  )
}
