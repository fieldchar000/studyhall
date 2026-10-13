// Shared pieces for People and Partner: avatars, countdowns, the "little details" lists,
// memories with photos, plans, the Singapore ideas browser and conversation questions.

import { useMemo, useState } from 'react'
import type { Moment, Person, Plan } from '@shared/types'
import { AutoText } from './AutoField'
import { Icon } from './ui'
import { PhotoTray, Polaroids } from './Scrapbook'
import { db, useRows } from '@/lib/data'
import { localDate } from '@/lib/dates'
import { DECKS, FACT_CATEGORIES, IDEAS, IDEA_CATEGORIES, QUESTIONS, type Idea, type IdeaCategory, type QuestionDeck } from '@/lib/peopleContent'

// ---------- Dates ----------

const DAY = 86_400_000
const midnight = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** Days until the next yearly occurrence of a YYYY-MM-DD (or 0000-MM-DD) date. */
export function daysUntil(date: string | null): number | null {
  if (!date) return null
  const [, m, d] = date.split('-').map(Number)
  if (!m || !d) return null
  const now = new Date()
  let next = new Date(now.getFullYear(), m - 1, d)
  if (midnight(next) < midnight(now)) next = new Date(now.getFullYear() + 1, m - 1, d)
  return Math.round((midnight(next) - midnight(now)) / DAY)
}

/** How many times the date has come round (years old, years together). */
export function yearsSince(date: string | null): number | null {
  if (!date || date.startsWith('0000')) return null
  const [y, m, d] = date.split('-').map(Number)
  const now = new Date()
  let n = now.getFullYear() - y
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) n--
  return n
}

export const daysSince = (date: string | null): number | null => (date ? Math.round((midnight(new Date()) - midnight(new Date(date + 'T00:00'))) / DAY) : null)

export const inDays = (n: number): string => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`)
export const agoDays = (n: number): string => (n === 0 ? 'today' : n === 1 ? 'yesterday' : n < 14 ? `${n} days ago` : n < 60 ? `${Math.round(n / 7)} weeks ago` : `${Math.round(n / 30)} months ago`)

export const firstName = (p: Pick<Person, 'name'>): string => p.name.trim().split(/\s+/)[0] || 'them'

// ---------- Avatar ----------

export function Avatar({ person, size = 40 }: { person: Pick<Person, 'name' | 'emoji' | 'color'>; size?: number }): React.JSX.Element {
  const initials = person.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <span
      className="font-display inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: person.color, fontSize: size * (person.emoji ? 0.5 : 0.4), boxShadow: '0 0 0 2px var(--color-panel), 0 0 0 3px var(--color-brass)' }}
    >
      {person.emoji || initials || '?'}
    </span>
  )
}

// ---------- Little details ----------

export function FactsPanel({ person }: { person: Person }): React.JSX.Element {
  const facts = useRows('person_facts', { person_id: person.id }, 'sort') ?? []
  const [adding, setAdding] = useState<Record<string, string>>({})
  const add = async (category: string): Promise<void> => {
    const text = (adding[category] ?? '').trim()
    if (!text) return
    setAdding((a) => ({ ...a, [category]: '' }))
    await db.create('person_facts', { person_id: person.id, category, text, sort: facts.length })
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {FACT_CATEGORIES.map((c) => {
        const list = facts.filter((f) => f.category === c.id)
        return (
          <div key={c.id} className="rounded-lg border border-line bg-canvas/40 p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
              <span>{c.icon}</span>
              {c.label}
            </div>
            <ul className="flex flex-col gap-0.5">
              {list.map((f) => (
                <li key={f.id} className="group flex items-start gap-1.5 text-sm">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brass" />
                  <AutoText value={f.text} onSave={(v) => (v.trim() ? db.update('person_facts', f.id, { text: v }) : db.remove('person_facts', f.id))} className="field min-w-0 flex-1 py-0.5" />
                  <button className="mt-1 hidden text-muted hover:text-danger group-hover:block" onClick={() => void db.remove('person_facts', f.id)} title="Remove">
                    <Icon name="x" size={12} />
                  </button>
                </li>
              ))}
            </ul>
            <input
              className="field mt-1 text-sm"
              placeholder={list.length ? 'Add another…' : c.placeholder}
              value={adding[c.id] ?? ''}
              onChange={(e) => setAdding((a) => ({ ...a, [c.id]: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && void add(c.id)}
              onBlur={() => void add(c.id)}
            />
          </div>
        )
      })}
    </div>
  )
}

// ---------- Memories ----------

export function MomentsPanel({ person, kind = 'memory', title = 'Memories' }: { person: Person | null; kind?: Moment['kind']; title?: string }): React.JSX.Element {
  const where: Record<string, string> = person ? { person_id: person.id, kind } : { kind }
  const moments = (useRows('moments', where, 'date') ?? []).slice().reverse()
  const photos = useRows('photos', { parent_table: 'moments' }, 'sort') ?? []
  const [editing, setEditing] = useState<string | null>(null)
  const add = async (): Promise<void> => {
    const m = await db.create('moments', { person_id: person?.id ?? null, kind, date: localDate(new Date()), title: '' })
    setEditing(m.id)
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center">
        <h3 className="flex-1 text-lg">{title}</h3>
        <button className="btn" onClick={() => void add()}>
          <Icon name="plus" /> Add {kind === 'memory' ? 'a memory' : 'one'}
        </button>
      </div>
      {!moments.length && <p className="text-sm text-muted">{kind === 'memory' ? 'Things you did together — with photos and the story — collect here.' : 'Nothing yet.'}</p>}
      {moments.map((m) => {
        const pics = photos.filter((p) => p.parent_id === m.id)
        return editing === m.id ? (
          <div key={m.id} className="flex flex-col gap-3 rounded-lg border border-brass/50 bg-panel p-4">
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" className="field-boxed w-auto py-1 text-sm" value={m.date} onChange={(e) => e.target.value && void db.update('moments', m.id, { date: e.target.value })} />
              <AutoText value={m.title} onSave={(v) => db.update('moments', m.id, { title: v })} placeholder="What did you do?" className="field-boxed font-display min-w-0 flex-1 text-lg" autoFocus />
            </div>
            <AutoText value={m.place} onSave={(v) => db.update('moments', m.id, { place: v })} placeholder="📍 Where" className="field-boxed text-sm" />
            {kind === 'memory' && <PhotoTray photos={pics} parentTable="moments" onNeedParent={async () => m.id} />}
            <AutoText multiline rows={4} value={m.story} onSave={(v) => db.update('moments', m.id, { story: v })} placeholder="The story — what happened, what was funny, what you want to remember." className="field-boxed text-sm leading-relaxed" />
            <div className="flex items-center gap-2">
              {kind === 'memory' && (
                <div className="flex gap-0.5" title="How good was it?">
                  {[1, 2, 3, 4, 5].map((r) => (
                    <button key={r} className={`text-lg ${(m.rating ?? 0) >= r ? 'text-brass' : 'text-line'}`} onClick={() => void db.update('moments', m.id, { rating: r })}>
                      ★
                    </button>
                  ))}
                </div>
              )}
              <button className="btn-ghost ml-auto text-xs hover:text-danger" onClick={() => confirm('Delete this?') && void db.remove('moments', m.id)}>
                Delete
              </button>
              <button className="btn" onClick={() => setEditing(null)}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <article key={m.id} className="group relative rounded-lg border border-line bg-panel px-5 py-4">
            <div className="flex items-baseline gap-2">
              <span className="label-caps">{new Date(m.date + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              {m.place && <span className="text-xs text-muted">· {m.place}</span>}
              {m.rating ? <span className="text-xs text-brass">{'★'.repeat(m.rating)}</span> : null}
              <button className="btn-ghost ml-auto hidden text-xs group-hover:inline-flex" onClick={() => setEditing(m.id)}>
                <Icon name="pencil" size={13} /> Edit
              </button>
            </div>
            {m.title && <h4 className="font-display mt-0.5 text-xl font-semibold">{m.title}</h4>}
            <Polaroids photos={pics} size={150} />
            {m.story && <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap text-ink/90">{m.story}</p>}
          </article>
        )
      })}
    </div>
  )
}

// ---------- Plans ----------

export function PlansPanel({ person }: { person: Person | null }): React.JSX.Element {
  const plans = useRows('plans', person ? { person_id: person.id } : {}, 'date') ?? []
  const today = localDate(new Date())
  const upcoming = plans.filter((p) => p.status === 'planned').sort((a, b) => (a.date ?? '9').localeCompare(b.date ?? '9'))
  const ideas = plans.filter((p) => p.status === 'idea')
  const done = plans.filter((p) => p.status === 'done').sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  const add = (): Promise<Plan> => db.create('plans', { person_id: person?.id ?? null, title: 'New plan', status: 'idea' })
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center">
        <h3 className="flex-1 text-lg">Plans</h3>
        <button className="btn" onClick={() => void add()}>
          <Icon name="plus" /> Add your own
        </button>
      </div>
      {[
        ['Coming up', upcoming],
        ['Saved ideas', ideas],
        ['Done', done.slice(0, 12)]
      ].map(([label, list]) =>
        (list as Plan[]).length ? (
          <div key={label as string} className="flex flex-col gap-1.5">
            <div className="label-caps">{label as string}</div>
            {(list as Plan[]).map((p) => (
              <PlanRow key={p.id} plan={p} past={!!p.date && p.date < today && p.status === 'planned'} person={person} />
            ))}
          </div>
        ) : null
      )}
      {!plans.length && <p className="text-sm text-muted">Save ideas from the list below, or add your own. Give a plan a date and it shows up here.</p>}
    </div>
  )
}

function PlanRow({ plan: p, past, person }: { plan: Plan; past: boolean; person: Person | null }): React.JSX.Element {
  const idea = IDEAS.find((i) => i.id === p.idea_id)
  const toMemory = async (): Promise<void> => {
    await db.update('plans', p.id, { status: 'done', date: p.date ?? localDate(new Date()) })
    await db.create('moments', { person_id: person?.id ?? p.person_id, kind: 'memory', date: p.date ?? localDate(new Date()), title: p.title, place: p.place || idea?.area || '' })
  }
  return (
    <div className={`group flex flex-wrap items-center gap-2 rounded-md border border-line bg-panel px-3 py-2 ${p.status === 'done' ? 'opacity-70' : ''}`}>
      <span className="text-base">{idea ? IDEA_CATEGORIES[idea.category].icon : '📝'}</span>
      <AutoText value={p.title} onSave={(v) => db.update('plans', p.id, { title: v })} className="field min-w-40 flex-1 text-sm font-medium" />
      <input
        type="date"
        className={`field w-auto text-xs ${past ? 'text-danger' : 'text-muted'}`}
        value={p.date ?? ''}
        onChange={(e) => void db.update('plans', p.id, { date: e.target.value || null, status: e.target.value && p.status === 'idea' ? 'planned' : p.status })}
        title="When"
      />
      {p.status !== 'done' ? (
        <button className="btn-ghost text-xs" onClick={() => void toMemory()} title="Mark as done and start a memory for it">
          <Icon name="check" size={13} /> Done
        </button>
      ) : (
        <span className="text-xs text-ok">Done</span>
      )}
      <button className="btn-ghost hidden px-1 group-hover:inline-flex hover:text-danger" onClick={() => void db.remove('plans', p.id)} title="Remove">
        <Icon name="trash" size={13} />
      </button>
      {idea && <div className="w-full pl-7 text-xs text-muted">{idea.area} · {idea.blurb}</div>}
    </div>
  )
}

// ---------- Ideas browser ----------

const COSTS = ['free', '$', '$$', '$$$'] as const

export function IdeasBrowser({ person, audience }: { person: Person | null; audience: 'date' | 'friends' }): React.JSX.Element {
  const plans = useRows('plans', person ? { person_id: person.id } : {}) ?? []
  const [cat, setCat] = useState<IdeaCategory | 'all'>('all')
  const [cost, setCost] = useState<string>('any')
  const [indoor, setIndoor] = useState<'any' | 'in' | 'out'>('any')
  const [q, setQ] = useState('')
  const [surprise, setSurprise] = useState<Idea | null>(null)
  const saved = new Map(plans.map((p) => [p.idea_id, p]))

  const list = useMemo(
    () =>
      IDEAS.filter(
        (i) =>
          (i.for === 'both' || i.for === audience) &&
          (cat === 'all' || i.category === cat) &&
          (cost === 'any' || i.cost === cost) &&
          (indoor === 'any' || i.indoor === (indoor === 'in')) &&
          (!q.trim() || `${i.title} ${i.area} ${i.blurb}`.toLowerCase().includes(q.trim().toLowerCase()))
      ),
    [audience, cat, cost, indoor, q]
  )
  const save = (i: Idea, date?: string): Promise<Plan> =>
    db.create('plans', { person_id: person?.id ?? null, idea_id: i.id, title: i.title, category: i.category, place: i.area, cost: i.cost, status: date ? 'planned' : 'idea', date: date ?? null })
  const cats = (Object.keys(IDEA_CATEGORIES) as IdeaCategory[]).filter((c) => IDEAS.some((i) => i.category === c && (i.for === 'both' || i.for === audience)))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-lg">{audience === 'date' ? 'Date ideas' : 'Hangout ideas'} in Singapore</h3>
        <button
          className="btn-primary"
          onClick={() => {
            const pool = list.filter((i) => !saved.has(i.id))
            setSurprise((pool.length ? pool : list)[Math.floor(Math.random() * (pool.length || list.length))] ?? null)
          }}
        >
          <Icon name="dice" /> Surprise me
        </button>
      </div>
      {surprise && (
        <div className="rounded-lg border border-brass/60 bg-accent-soft/60 p-4">
          <IdeaCard idea={surprise} saved={saved.get(surprise.id)} onSave={save} big />
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        <button className={`chip ${cat === 'all' ? '' : 'opacity-60'}`} onClick={() => setCat('all')}>
          All
        </button>
        {cats.map((c) => (
          <button key={c} className={`chip ${cat === c ? '' : 'opacity-60'}`} onClick={() => setCat(c)}>
            {IDEA_CATEGORIES[c].icon} {IDEA_CATEGORIES[c].label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input className="field-boxed w-48 py-1" placeholder="Search ideas" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="field-boxed w-auto py-1" value={cost} onChange={(e) => setCost(e.target.value)}>
          <option value="any">Any budget</option>
          {COSTS.map((c) => (
            <option key={c} value={c}>
              {c === 'free' ? 'Free' : c}
            </option>
          ))}
        </select>
        <select className="field-boxed w-auto py-1" value={indoor} onChange={(e) => setIndoor(e.target.value as 'any' | 'in' | 'out')}>
          <option value="any">Indoor or outdoor</option>
          <option value="in">Indoor (rainy day)</option>
          <option value="out">Outdoor</option>
        </select>
        <span className="text-xs text-muted">{list.length} ideas</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {list.map((i) => (
          <div key={i.id} className="rounded-lg border border-line bg-panel p-3.5">
            <IdeaCard idea={i} saved={saved.get(i.id)} onSave={save} />
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted">Check opening times, bookings and prices before you go — places change.</p>
    </div>
  )
}

function IdeaCard({ idea: i, saved, onSave, big }: { idea: Idea; saved?: Plan; onSave: (i: Idea, date?: string) => Promise<Plan>; big?: boolean }): React.JSX.Element {
  const [date, setDate] = useState('')
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start gap-2">
        <span className={big ? 'text-2xl' : 'text-lg'}>{IDEA_CATEGORIES[i.category].icon}</span>
        <div className="min-w-0 flex-1">
          <div className={`font-display font-semibold ${big ? 'text-2xl' : 'text-[17px]'}`}>{i.title}</div>
          <div className="text-[11px] text-muted">
            {i.area} · {i.cost === 'free' ? 'Free' : i.cost} · {i.indoor ? 'Indoor' : 'Outdoor'} · {i.when === 'any' ? 'Any time' : i.when}
          </div>
        </div>
      </div>
      <p className="text-sm text-ink/85">{i.blurb}</p>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {saved ? (
          <span className="text-xs text-ok">{saved.status === 'done' ? 'Done ✓' : saved.status === 'planned' ? `Planned${saved.date ? ` for ${saved.date}` : ''}` : 'Saved'}</span>
        ) : (
          <>
            <button className="btn px-2 py-1 text-xs" onClick={() => void onSave(i)}>
              <Icon name="bookmark" size={13} /> Save
            </button>
            <input type="date" className="field-boxed w-auto py-0.5 text-xs" value={date} onChange={(e) => setDate(e.target.value)} title="Pick a date to plan it" />
            {date && (
              <button className="btn-primary px-2 py-1 text-xs" onClick={() => void onSave(i, date)}>
                Plan it
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ---------- Questions ----------

export function QuestionsCard({ decks, title = 'Something to ask' }: { decks: QuestionDeck[]; title?: string }): React.JSX.Element {
  const [deck, setDeck] = useState<QuestionDeck>(decks[0])
  const [i, setI] = useState(() => Math.floor(Math.random() * QUESTIONS[decks[0]].length))
  const list = QUESTIONS[deck]
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <h3 className="mr-auto text-lg">{title}</h3>
        {decks.map((d) => (
          <button
            key={d}
            className={`chip ${deck === d ? '' : 'opacity-60'}`}
            onClick={() => {
              setDeck(d)
              setI(Math.floor(Math.random() * QUESTIONS[d].length))
            }}
          >
            {DECKS[d]}
          </button>
        ))}
      </div>
      <div className="rounded-lg border border-line bg-canvas/50 px-6 py-7 text-center">
        <Icon name="question" size={22} className="mx-auto mb-2 text-brass" />
        <p className="font-display text-2xl leading-snug">{list[i % list.length]}</p>
      </div>
      <div className="flex justify-center gap-2">
        <button className="btn" onClick={() => setI((x) => (x - 1 + list.length) % list.length)}>
          Previous
        </button>
        <button className="btn" onClick={() => setI(Math.floor(Math.random() * list.length))}>
          <Icon name="dice" /> Shuffle
        </button>
        <button className="btn" onClick={() => setI((x) => (x + 1) % list.length)}>
          Next
        </button>
      </div>
    </div>
  )
}
