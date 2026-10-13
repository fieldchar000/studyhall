// Active recall: today's pages from each module, recalled before they're revealed.

import { useEffect, useRef, useState } from 'react'
import type { Module, RecallCard } from '@shared/types'
import { Icon, Modal } from '@/components/ui'
import { useLive, useRows } from '@/lib/data'
import { navigate } from '@/lib/nav'
import {
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
        <header className="flex flex-wrap items-end gap-4">
          <div className="mr-auto">
            <div className="label-caps">Study · {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
            <h1 className="text-3xl">Active recall</h1>
            <p className="mt-1 max-w-xl text-sm text-muted">
              Every day, {count} pages from each module. Try to remember what’s on a page before you look — that effort is what makes it stick.
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
    <section className="card overflow-hidden">
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

/** One card at a time: cue → write what you remember → reveal → grade. Keys: Space, 1 2 3. */
function Session({ module: m, cards, start, onClose }: { module: Module; cards: RecallCard[]; start: number; onClose: () => void }): React.JSX.Element {
  const [index, setIndex] = useState(start)
  const [page, setPage] = useState<RecallPage | null | 'missing'>(null)
  const [revealed, setRevealed] = useState(false)
  const [jot, setJot] = useState('')
  const [results, setResults] = useState<Record<string, Result>>({})
  const [finished, setFinished] = useState(false)
  const card = cards[index]

  useEffect(() => {
    if (!card) return
    let live = true
    setPage(null)
    setRevealed(false)
    setJot('')
    void pageFor(card)
      .then((p) => live && setPage(p ?? 'missing'))
      .catch(() => live && setPage('missing'))
    return () => {
      live = false
    }
  }, [card?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const rate = async (r: Result): Promise<void> => {
    if (!card) return
    await grade(card, r)
    setResults((x) => ({ ...x, [card.id]: r }))
    if (index + 1 < cards.length) setIndex(index + 1)
    else setFinished(true)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        setRevealed(true)
      } else if (revealed && ['1', '2', '3'].includes(e.key)) void rate((['missed', 'partly', 'got'] as Result[])[Number(e.key) - 1])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const openSource = async (): Promise<void> => {
    const src = card && (await sourceFor(card))
    if (!src) return
    onClose()
    navigate(src.table === 'notes' ? { name: 'notes', id: src.row.id } : { name: 'materials' })
  }

  const tally = Object.values(results)
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
        <div className="mx-auto flex max-w-3xl flex-col gap-5 px-6 py-6">
          <div className="flex items-center gap-1.5">
            {cards.map((c, i) => {
              const r = results[c.id] ?? (doneToday(c) ? c.last_result : null)
              return (
                <button
                  key={c.id}
                  onClick={() => setIndex(i)}
                  title={c.label}
                  className={`h-1.5 flex-1 rounded-full ${i === index ? 'bg-ink' : r ? RESULT_STYLE[r].dot : 'bg-line'}`}
                />
              )
            })}
          </div>
          <div className="text-xs text-muted">
            {index + 1} of {cards.length} · {card.label}
          </div>
          {page === null ? (
            <p className="text-muted">Opening the page…</p>
          ) : page === 'missing' ? (
            <div className="flex flex-col gap-3">
              <p className="text-muted">This page isn’t available on this PC (the file may be missing or was changed).</p>
              <button className="btn self-start" onClick={() => void rate('partly')}>
                Skip
              </button>
            </div>
          ) : (
            <>
              <div>
                <div className="label-caps mb-1">What do you remember about</div>
                <h2 className="text-3xl leading-tight">{page.cue}</h2>
              </div>
              {!revealed ? (
                <>
                  <textarea
                    className="field-boxed min-h-32 leading-relaxed"
                    placeholder="Write down everything you can remember — key ideas, definitions, examples. (Optional, but it works better.)"
                    value={jot}
                    onChange={(e) => setJot(e.target.value)}
                    autoFocus
                  />
                  <button className="btn-primary self-start" onClick={() => setRevealed(true)}>
                    Show the page <kbd className="ml-1 rounded-sm border border-white/30 px-1 text-[10px]">Space</kbd>
                  </button>
                </>
              ) : (
                <>
                  {jot.trim() && (
                    <div className="rounded-md border border-line bg-canvas/60 p-3 text-sm whitespace-pre-wrap">
                      <div className="label-caps mb-1">You wrote</div>
                      {jot}
                    </div>
                  )}
                  <div className="rounded-lg border border-line bg-panel p-4">
                    {page.pdf ? <PdfPage data={page.pdf.data} page={page.pdf.page} /> : <article className="reader max-w-none" dangerouslySetInnerHTML={{ __html: page.html }} />}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mr-1 text-sm text-muted">How did you do?</span>
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
            </>
          )}
        </div>
      )}
    </Modal>
  )
}

function PdfPage({ data, page }: { data: Uint8Array; page: number }): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!ref.current || !wrap.current) return
    void drawPdfPage(data, page, ref.current, Math.min(wrap.current.clientWidth, 760)).catch(() => setFailed(true))
  }, [data, page])
  return (
    <div ref={wrap} className="flex justify-center">
      {failed ? <p className="text-sm text-muted">Couldn’t draw this page.</p> : <canvas ref={ref} className="rounded-sm shadow-sm" />}
    </div>
  )
}
