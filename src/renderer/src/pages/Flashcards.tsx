// Flashcard decks, card editing and SM-2 review sessions.

import { useEffect, useMemo, useState } from 'react'
import type { Flashcard } from '@shared/types'
import { AutoText } from '@/components/AutoField'
import { Icon } from '@/components/ui'
import { api, db, notifyChanged, track, useLive } from '@/lib/data'
import { relativeDue } from '@/lib/dates'
import { navigate } from '@/lib/nav'
import { GRADES, isDue, previewInterval, review, type Grade } from '@/lib/sm2'

// ---------- Deck list ----------

export function FlashcardsPage(): React.JSX.Element {
  const { data } = useLive(
    ['flashcard_decks', 'flashcards', 'modules'],
    async () => {
      const [decks, cards, modules] = await Promise.all([api.list('flashcard_decks', {}, 'name'), api.list('flashcards'), api.list('modules')])
      return decks.map((d) => {
        const mine = cards.filter((c) => c.deck_id === d.id)
        return { deck: d, total: mine.length, due: mine.filter((c) => isDue(c)).length, module: modules.find((m) => m.id === d.module_id) }
      })
    },
    []
  )
  const totalDue = data?.reduce((s, d) => s + d.due, 0) ?? 0
  const add = async (): Promise<void> => {
    const d = await db.create('flashcard_decks', { name: 'New deck' })
    navigate({ name: 'deck', id: d.id })
  }
  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Flashcards</h1>
        {totalDue > 0 && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">{totalDue} due</span>}
        <div className="flex-1" />
        <button className="btn-primary" onClick={() => void add()}>
          <Icon name="plus" /> New deck
        </button>
      </div>
      {data?.length === 0 && (
        <div className="card p-10 text-center text-muted">
          Make a deck per module. Cards you know well come back less often (spaced repetition), so a few minutes a day is enough.
        </div>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
        {data?.map(({ deck, total, due, module }) => (
          <div key={deck.id} className="card flex flex-col p-4">
            <button className="text-left" onClick={() => navigate({ name: 'deck', id: deck.id })}>
              <div className="truncate font-semibold">{deck.name}</div>
              <div className="mt-1 text-xs text-muted">
                {module ? `${module.code || module.name} · ` : ''}
                {total} cards
              </div>
            </button>
            <button className="btn-primary mt-4 justify-center" disabled={!due} onClick={() => navigate({ name: 'deck', id: deck.id, review: true })}>
              {due ? `Study ${due} due` : 'Nothing due'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- One deck ----------

export function DeckPage({ id, review: startInReview }: { id: string; review?: boolean }): React.JSX.Element {
  const [reviewing, setReviewing] = useState(!!startInReview)
  const { data } = useLive(
    ['flashcard_decks', 'flashcards', 'modules'],
    async () => {
      const deck = await api.get('flashcard_decks', id)
      if (!deck) return null
      const [cards, modules] = await Promise.all([api.list('flashcards', { deck_id: id }, 'created_at'), api.list('modules', { archived: 0 }, 'sort')])
      return { deck, cards, modules }
    },
    [id]
  )
  if (data === undefined) return <div />
  if (data === null) return <div className="p-8 text-muted">This deck was deleted.</div>
  const { deck, cards, modules } = data
  const due = cards.filter((c) => isDue(c))

  if (reviewing) return <ReviewSession deckName={deck.name} cards={due} onDone={() => setReviewing(false)} />

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-8">
      <button className="btn-ghost -mb-2 -ml-2 self-start" onClick={() => navigate({ name: 'flashcards' })}>
        <Icon name="back" /> Flashcards
      </button>
      <div className="card flex items-center gap-3 p-5">
        <div className="min-w-0 flex-1">
          <AutoText value={deck.name} onSave={(v) => db.update('flashcard_decks', id, { name: v || 'Deck' })} className="field text-2xl font-semibold tracking-tight" />
          <div className="mt-1 flex items-center gap-2 pl-2 text-sm text-muted">
            <select className="field-boxed w-auto" value={deck.module_id ?? ''} onChange={(e) => void db.update('flashcard_decks', id, { module_id: e.target.value || null })}>
              <option value="">No module</option>
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code ? `${m.code} · ` : ''}
                  {m.name}
                </option>
              ))}
            </select>
            <span>
              {cards.length} cards · {due.length} due
            </span>
          </div>
        </div>
        <button className="btn-primary h-11 px-5" disabled={!due.length} onClick={() => setReviewing(true)}>
          <Icon name="play" /> Study {due.length || ''}
        </button>
        <button
          className="btn-ghost hover:text-danger"
          title="Delete deck"
          onClick={() => confirm(`Delete “${deck.name}” and its ${cards.length} cards?`) && void db.remove('flashcard_decks', id).then(() => navigate({ name: 'flashcards' }))}
        >
          <Icon name="trash" />
        </button>
      </div>

      <AddCards deckId={id} />

      <div className="card divide-y divide-line">
        {cards.length === 0 && <div className="p-6 text-center text-sm text-muted">No cards yet.</div>}
        {cards.map((c) => (
          <div key={c.id} className="group grid grid-cols-[1fr_1fr_auto] items-start gap-3 p-3">
            <AutoText multiline rows={2} value={c.front} onSave={(v) => db.update('flashcards', c.id, { front: v })} className="field resize-none" placeholder="Front" />
            <AutoText multiline rows={2} value={c.back} onSave={(v) => db.update('flashcards', c.id, { back: v })} className="field resize-none text-muted" placeholder="Back" />
            <div className="flex flex-col items-end gap-1">
              <span className="text-[11px] whitespace-nowrap text-muted">{isDue(c) ? (c.due_at ? 'Due now' : 'New') : `Next ${relativeDue(c.due_at!)}`}</span>
              <button className="btn-ghost opacity-0 group-hover:opacity-100 hover:text-danger" onClick={() => void db.remove('flashcards', c.id)} title="Delete card">
                <Icon name="trash" size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Add one card, or paste many as "front | back" lines. */
function AddCards({ deckId }: { deckId: string }): React.JSX.Element {
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [bulk, setBulk] = useState(false)
  const [text, setText] = useState('')

  const addOne = async (): Promise<void> => {
    if (!front.trim()) return
    await db.create('flashcards', { deck_id: deckId, front: front.trim(), back: back.trim() })
    setFront('')
    setBack('')
    document.getElementById('card-front')?.focus()
  }
  const addBulk = async (): Promise<void> => {
    const rows = text
      .split('\n')
      .map((l) => l.split(/\s*(?:\||\t)\s*/))
      .filter(([f]) => f?.trim())
    await track(Promise.all(rows.map(([f, ...b]) => api.create('flashcards', { deck_id: deckId, front: f.trim(), back: b.join(' | ').trim() }))))
    notifyChanged('flashcards')
    setText('')
    setBulk(false)
  }

  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center">
        <h2 className="flex-1 text-sm font-semibold">Add cards</h2>
        <button className="btn-ghost text-xs" onClick={() => setBulk((b) => !b)}>
          {bulk ? 'One at a time' : 'Paste many'}
        </button>
      </div>
      {bulk ? (
        <div className="flex flex-col gap-2">
          <textarea
            className="field-boxed font-mono text-xs"
            rows={6}
            placeholder={'One card per line: front | back\nmitochondria | powerhouse of the cell'}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="btn-primary self-start" onClick={() => void addBulk()} disabled={!text.trim()}>
            Add {text.split('\n').filter((l) => l.trim()).length} cards
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <textarea id="card-front" className="field-boxed resize-none" rows={2} placeholder="Front (question)" value={front} onChange={(e) => setFront(e.target.value)} />
          <textarea
            className="field-boxed resize-none"
            rows={2}
            placeholder="Back (answer) — Ctrl+Enter to add"
            value={back}
            onChange={(e) => setBack(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && e.ctrlKey && void addOne()}
          />
          <button className="btn-primary self-stretch" onClick={() => void addOne()} disabled={!front.trim()}>
            Add
          </button>
        </div>
      )}
    </div>
  )
}

// ---------- Review ----------

function ReviewSession({ deckName, cards, onDone }: { deckName: string; cards: Flashcard[]; onDone: () => void }): React.JSX.Element {
  // Snapshot the due cards when the session starts; "Again" puts a card back at the end.
  const [queue, setQueue] = useState<Flashcard[]>(() => [...cards].sort(() => Math.random() - 0.5))
  const [shown, setShown] = useState(false)
  const [reviewed, setReviewed] = useState(0)
  const card = queue[0]
  const total = useMemo(() => cards.length, []) // eslint-disable-line react-hooks/exhaustive-deps

  const grade = (q: Grade): void => {
    if (!card) return
    const r = review(card, q)
    void db.update('flashcards', card.id, r)
    setReviewed((n) => n + 1)
    setShown(false)
    setQueue(([first, ...rest]) => (q < 3 ? [...rest, { ...first, ...r }] : rest))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onDone()
      if (!card) return
      if (!shown && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        setShown(true)
      } else if (shown) {
        const g = GRADES.find((x) => x.key === e.key)
        if (g) grade(g.grade)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col p-8">
      <div className="mb-4 flex items-center gap-3 text-sm text-muted">
        <button className="btn-ghost -ml-2" onClick={onDone}>
          <Icon name="x" /> End session
        </button>
        <span className="flex-1 truncate">{deckName}</span>
        <span>
          {Math.min(reviewed, total)} / {total} · {queue.length} left
        </span>
      </div>
      <div className="mb-6 h-1 overflow-hidden rounded-full bg-line">
        <div className="h-full bg-accent transition-all" style={{ width: `${total ? (100 * (total - Math.min(queue.length, total))) / total : 100}%` }} />
      </div>

      {!card ? (
        <div className="card m-auto flex flex-col items-center gap-3 p-10 text-center">
          <div className="text-4xl">🎉</div>
          <div className="text-lg font-semibold">All done for now</div>
          <div className="text-sm text-muted">You reviewed {reviewed} cards. They'll come back when they're due.</div>
          <button className="btn-primary mt-2" onClick={onDone}>
            Back to deck
          </button>
        </div>
      ) : (
        <div className="flex flex-1 flex-col">
          <div className="card flex min-h-64 flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
            <div className="text-xl whitespace-pre-wrap">{card.front}</div>
            {shown && (
              <>
                <div className="h-px w-1/2 bg-line" />
                <div className="text-lg whitespace-pre-wrap text-muted">{card.back || <i>(no answer)</i>}</div>
              </>
            )}
          </div>
          <div className="mt-5">
            {!shown ? (
              <button className="btn-primary h-12 w-full justify-center text-base" onClick={() => setShown(true)}>
                Show answer <span className="text-xs opacity-70">(Space)</span>
              </button>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {GRADES.map((g) => (
                  <button key={g.grade} className="btn h-14 flex-col justify-center gap-0" onClick={() => grade(g.grade)}>
                    <span className={`font-semibold ${g.tone}`}>{g.label}</span>
                    <span className="text-[11px] text-muted">
                      {previewInterval(card, g.grade)} · {g.key}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
