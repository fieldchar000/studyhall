// DevKit → Codex: the built-in library — landmark AI papers, AI concepts, geopolitics
// frameworks and institutions, philosophy, mental models and builder's principles.

import { useState } from 'react'
import { Icon } from '@/components/ui'
import { db } from '@/lib/data'
import { navigate } from '@/lib/nav'
import { AI_CONCEPTS, BUILDER, GEO_CONCEPTS, INSTITUTIONS, MENTAL_MODELS, NEWS_HABITS, PAPERS, PHILOSOPHY, type Card } from '@/lib/devContent'

type Tab = 'papers' | 'ai' | 'geo' | 'philosophy' | 'models' | 'builder'

const TABS: { id: Tab; label: string; icon: string; blurb: string }[] = [
  { id: 'papers', label: 'AI papers', icon: '📄', blurb: 'The papers that built modern AI — each with why it matters.' },
  { id: 'ai', label: 'AI concepts', icon: '🤖', blurb: 'The vocabulary you need to follow AI news without hand-waving.' },
  { id: 'geo', label: 'Geopolitics', icon: '🌍', blurb: 'Frameworks for making sense of world events, the institutions that matter, and good news habits.' },
  { id: 'philosophy', label: 'Philosophy', icon: '🦉', blurb: 'Big ideas and thought experiments, each with a question to sit with.' },
  { id: 'models', label: 'Mental models', icon: '🧠', blurb: 'Thinking tools that transfer to almost any problem.' },
  { id: 'builder', label: 'Builder', icon: '🛠️', blurb: 'Hard-won principles for making games and AI projects.' }
]

export function CodexPage(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('papers')
  const [q, setQ] = useState('')
  const match = (s: string): boolean => !q || s.toLowerCase().includes(q.toLowerCase())
  const cards = (list: Card[]): Card[] => list.filter((c) => match(c.title + c.body + (c.who ?? '')))
  const toDeck = async (name: string, list: Card[]): Promise<void> => {
    const deck = await db.create('flashcard_decks', { name: `Codex — ${name}` })
    for (const c of list) await db.create('flashcards', { deck_id: deck.id, front: c.title, back: c.body })
    navigate({ name: 'deck', id: deck.id })
  }
  const t = TABS.find((x) => x.id === tab)!

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-8">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h1 className="text-3xl">Codex</h1>
          <p className="text-sm text-muted">{t.blurb}</p>
        </div>
        <input className="field-boxed w-64" placeholder="Search the codex…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((x) => (
          <button
            key={x.id}
            onClick={() => setTab(x.id)}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${tab === x.id ? 'border-transparent bg-accent-soft font-semibold text-accent' : 'border-line text-muted hover:text-ink'}`}
          >
            {x.icon} {x.label}
          </button>
        ))}
      </div>

      {tab === 'papers' && (
        <div className="grid gap-3 md:grid-cols-2">
          {PAPERS.filter((p) => match(p.title + p.why + p.authors)).map((p) => (
            <button key={p.url} className="card flex flex-col gap-1 p-4 text-left" onClick={() => window.open(p.url)}>
              <div className="flex items-center gap-2 text-xs text-muted">
                <span className="chip">{p.year}</span>
                {p.authors}
              </div>
              <div className="font-semibold">{p.title} ↗</div>
              <div className="text-sm text-muted">{p.why}</div>
            </button>
          ))}
        </div>
      )}
      {tab === 'ai' && <CardGrid cards={cards(AI_CONCEPTS)} onDeck={() => void toDeck('AI concepts', AI_CONCEPTS)} />}
      {tab === 'geo' && (
        <>
          <Section title="Frameworks">
            <CardGrid cards={cards(GEO_CONCEPTS)} onDeck={() => void toDeck('Geopolitics', GEO_CONCEPTS)} />
          </Section>
          <Section title="Institutions">
            <CardGrid cards={cards(INSTITUTIONS)} onDeck={() => void toDeck('Institutions', INSTITUTIONS)} />
          </Section>
          <Section title="Good news habits">
            <CardGrid cards={cards(NEWS_HABITS)} />
          </Section>
        </>
      )}
      {tab === 'philosophy' && <CardGrid cards={cards(PHILOSOPHY)} onDeck={() => void toDeck('Philosophy', PHILOSOPHY)} />}
      {tab === 'models' && <CardGrid cards={cards(MENTAL_MODELS)} onDeck={() => void toDeck('Mental models', MENTAL_MODELS)} />}
      {tab === 'builder' && <CardGrid cards={cards(BUILDER)} />}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-bold tracking-wide text-muted uppercase">{title}</h2>
      {children}
    </section>
  )
}

function CardGrid({ cards, onDeck }: { cards: Card[]; onDeck?: () => void }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      {onDeck && (
        <button className="btn self-end" onClick={onDeck} title="Turn these into a spaced-repetition flashcard deck">
          <Icon name="cards" /> Make flashcards
        </button>
      )}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.title} className="card flex flex-col gap-1.5 p-4">
            <div className="font-semibold">{c.title}</div>
            {c.who && <div className="-mt-1 text-xs text-muted">{c.who}</div>}
            <p className="text-sm leading-relaxed text-muted">{c.body}</p>
            {c.ask && <p className="mt-auto pt-1 text-sm text-accent italic">{c.ask}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
