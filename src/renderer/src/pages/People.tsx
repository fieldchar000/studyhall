// Life → People: the people you care about and the little things worth remembering —
// birthdays, what they love, what's going on in their life, memories and plans together.

import { useMemo, useState } from 'react'
import type { Person, PersonKind } from '@shared/types'
import { AutoText } from '@/components/AutoField'
import { Icon, PALETTE } from '@/components/ui'
import { Avatar, FactsPanel, IdeasBrowser, MomentsPanel, PlansPanel, QuestionsCard, agoDays, daysSince, daysUntil, firstName, inDays, yearsSince } from '@/components/Relationships'
import { db, useRows } from '@/lib/data'
import { localDate } from '@/lib/dates'
import { navigate } from '@/lib/nav'
import { setPartner, useProfile } from '@/lib/profile'
import { FRIEND_CHECKIN, LOVE_LANGUAGES, PERSON_KINDS, TIPS } from '@/lib/peopleContent'

const EMOJI = ['', '🌻', '🐻', '🦊', '🐱', '🌙', '⭐', '🍵', '🎧', '📚', '⚽', '🎨', '🌊', '🍜', '🧋', '🌸']

export async function createPerson(kind: PersonKind = 'friend', name = ''): Promise<Person> {
  const count = (await window.api.list('people')).length
  return db.create('people', { name, kind, color: PALETTE[count % PALETTE.length], sort: count })
}

export function PeoplePage({ id }: { id?: string }): React.JSX.Element {
  return id ? <PersonPage id={id} /> : <PeopleList />
}

type Upcoming = { person: Person; what: string; days: number }

function PeopleList(): React.JSX.Element {
  const people = useRows('people', { archived: 0 }, 'sort')
  const [filter, setFilter] = useState<PersonKind | 'all'>('all')
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<'people' | 'ideas' | 'ask'>('people')
  const tip = useMemo(() => TIPS[new Date().getDate() % TIPS.length], [])
  if (!people) return <div />

  const upcoming: Upcoming[] = people
    .flatMap((p) => [
      { person: p, what: 'birthday', days: daysUntil(p.birthday) },
      { person: p, what: 'anniversary', days: daysUntil(p.anniversary) }
    ])
    .filter((u): u is Upcoming => u.days != null && u.days <= 60)
    .sort((a, b) => a.days - b.days)
  const catchUp = people
    .filter((p) => p.contact_every_days && (daysSince(p.last_contact_on) ?? 9999) >= p.contact_every_days)
    .sort((a, b) => (daysSince(b.last_contact_on) ?? 9999) - (daysSince(a.last_contact_on) ?? 9999))
  const shown = people.filter((p) => (filter === 'all' || p.kind === filter) && (!q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase())))

  const add = async (): Promise<void> => {
    const p = await createPerson()
    navigate({ name: 'people', id: p.id })
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-8 py-7">
        <header className="flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <div className="label-caps">Life · people</div>
            <h1 className="text-3xl">People</h1>
            <p className="mt-0.5 max-w-xl text-sm text-muted">Remember the little things about the people you love — and make the plans you keep meaning to make.</p>
          </div>
          <button className="btn-primary" onClick={() => void add()}>
            <Icon name="plus" /> Add someone
          </button>
        </header>

        <div className="flex gap-1 border-b border-line">
          {(
            [
              ['people', 'Everyone'],
              ['ideas', 'Hangout ideas'],
              ['ask', 'Things to ask']
            ] as const
          ).map(([t, label]) => (
            <button key={t} className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t ? 'border-accent font-semibold text-ink' : 'border-transparent text-muted hover:text-ink'}`} onClick={() => setTab(t)}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'ideas' ? (
          <IdeasBrowser person={null} audience="friends" />
        ) : tab === 'ask' ? (
          <div className="card p-5">
            <QuestionsCard decks={['friends', 'light', 'deep', 'memories', 'rather']} title="Conversation starters" />
          </div>
        ) : (
          <>
            {(upcoming.length > 0 || catchUp.length > 0) && (
              <div className="grid gap-4 md:grid-cols-2">
                {upcoming.length > 0 && (
                  <section className="card p-4">
                    <h2 className="mb-2 text-lg">Coming up</h2>
                    {upcoming.slice(0, 6).map((u) => (
                      <button key={u.person.id + u.what} className="flex w-full items-center gap-3 rounded-md px-1.5 py-1.5 text-left hover:bg-line/30" onClick={() => navigate({ name: 'people', id: u.person.id })}>
                        <Avatar person={u.person} size={28} />
                        <span className="flex-1 text-sm">
                          {firstName(u.person)}’s {u.what}
                          {u.what === 'birthday' && yearsSince(u.person.birthday) != null ? ` (turns ${yearsSince(u.person.birthday)! + 1})` : ''}
                        </span>
                        <span className={`text-xs ${u.days <= 7 ? 'font-semibold text-accent' : 'text-muted'}`}>{inDays(u.days)}</span>
                      </button>
                    ))}
                  </section>
                )}
                {catchUp.length > 0 && (
                  <section className="card p-4">
                    <h2 className="mb-2 text-lg">Time to catch up</h2>
                    {catchUp.slice(0, 6).map((p) => (
                      <div key={p.id} className="flex items-center gap-3 px-1.5 py-1.5">
                        <Avatar person={p} size={28} />
                        <button className="flex-1 text-left text-sm hover:text-accent" onClick={() => navigate({ name: 'people', id: p.id })}>
                          {p.name}
                          <span className="block text-[11px] text-muted">{p.last_contact_on ? `last caught up ${agoDays(daysSince(p.last_contact_on)!)}` : 'not logged yet'}</span>
                        </button>
                        <button className="btn px-2 py-1 text-xs" onClick={() => void db.update('people', p.id, { last_contact_on: localDate(new Date()) })}>
                          <Icon name="check" size={13} /> Caught up
                        </button>
                      </div>
                    ))}
                  </section>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {[{ id: 'all', label: 'Everyone' }, ...PERSON_KINDS].map((k) => (
                <button key={k.id} className={`chip ${filter === k.id ? '' : 'opacity-60'}`} onClick={() => setFilter(k.id as PersonKind | 'all')}>
                  {k.label}
                </button>
              ))}
              <input className="field-boxed ml-auto w-48 py-1 text-sm" placeholder="Find someone" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>

            {people.length === 0 ? (
              <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
                <Icon name="users" size={36} className="text-brass" />
                <h2 className="text-xl">Start with your closest people</h2>
                <p className="max-w-md text-sm text-muted">Add a best friend, a sibling, your parents. Note their birthday, what they love, and what’s going on in their life — then never forget to ask.</p>
                <button className="btn-primary" onClick={() => void add()}>
                  Add someone
                </button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {shown.map((p) => (
                  <PersonCard key={p.id} person={p} />
                ))}
              </div>
            )}
            <p className="flex items-start gap-2 text-sm text-muted">
              <Icon name="spark" className="mt-0.5 text-brass" /> {tip}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function PersonCard({ person: p }: { person: Person }): React.JSX.Element {
  const bday = daysUntil(p.birthday)
  const since = daysSince(p.last_contact_on)
  return (
    <button className="card flex items-center gap-3 p-4 text-left" onClick={() => navigate({ name: 'people', id: p.id })}>
      <Avatar person={p} size={44} />
      <span className="min-w-0 flex-1">
        <span className="font-display block truncate text-lg font-semibold">{p.name || 'Unnamed'}</span>
        <span className="block truncate text-xs text-muted">{p.relation || PERSON_KINDS.find((k) => k.id === p.kind)?.label}</span>
        <span className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted">
          {bday != null && <span>🎂 {inDays(bday)}</span>}
          {since != null && <span>💬 {agoDays(since)}</span>}
        </span>
      </span>
    </button>
  )
}

function PersonPage({ id }: { id: string }): React.JSX.Element {
  const person = (useRows('people', {}) ?? []).find((p) => p.id === id)
  const profile = useProfile()
  const [tab, setTab] = useState<'details' | 'memories' | 'plans' | 'ask' | 'ideas'>('details')
  if (!person) return <div className="p-8 text-muted">Loading…</div>
  const p = person
  const isPartner = profile?.partner_id === p.id
  const age = yearsSince(p.birthday)
  const bday = daysUntil(p.birthday)
  const save = (patch: Partial<Person>): Promise<unknown> => db.update('people', p.id, patch)

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-8 py-6">
        <button className="btn-ghost self-start" onClick={() => navigate({ name: 'people' })}>
          <Icon name="back" /> People
        </button>
        <section className="card flex flex-wrap items-start gap-5 p-6">
          <AvatarPicker person={p} onSave={save} />
          <div className="min-w-0 flex-1">
            <AutoText value={p.name} onSave={(v) => save({ name: v })} placeholder="Their name" className="field font-display text-3xl font-semibold" autoFocus={!p.name} />
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <AutoText value={p.relation} onSave={(v) => save({ relation: v })} placeholder="Best friend, sister, uni friend…" className="field w-56 text-muted" />
              <select className="field-boxed w-auto py-1 text-sm" value={p.kind} onChange={(e) => void save({ kind: e.target.value as PersonKind })}>
                {PERSON_KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
              {p.kind === 'partner' && !isPartner && (
                <button className="btn text-xs" onClick={() => void setPartner({ partner_id: p.id })}>
                  <Icon name="heart" size={13} /> Show on the Partner page
                </button>
              )}
              {isPartner && (
                <button className="chip" onClick={() => navigate({ name: 'partner' })}>
                  ♥ Your {profile?.partner_label?.toLowerCase() || 'partner'}
                </button>
              )}
            </div>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Field label={`🎂 Birthday${bday != null ? ` · ${inDays(bday)}${age != null ? `, turns ${age + 1}` : ''}` : ''}`}>
                <input type="date" className="field-boxed py-1" value={p.birthday ?? ''} onChange={(e) => void save({ birthday: e.target.value || null })} />
              </Field>
              <Field label="💬 Catch up every">
                <select className="field-boxed py-1" value={p.contact_every_days ?? ''} onChange={(e) => void save({ contact_every_days: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">No reminder</option>
                  {[7, 14, 30, 60, 90, 180].map((d) => (
                    <option key={d} value={d}>
                      {d === 7 ? 'week' : d === 14 ? 'two weeks' : d === 30 ? 'month' : d === 60 ? 'two months' : d === 90 ? 'three months' : 'six months'}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={`🕰️ Last caught up${p.last_contact_on ? ` · ${agoDays(daysSince(p.last_contact_on)!)}` : ''}`}>
                <div className="flex gap-1.5">
                  <input type="date" className="field-boxed py-1" value={p.last_contact_on ?? ''} onChange={(e) => void save({ last_contact_on: e.target.value || null })} />
                  <button className="btn px-2 text-xs" onClick={() => void save({ last_contact_on: localDate(new Date()) })}>
                    Today
                  </button>
                </div>
              </Field>
              {p.kind === 'partner' && (
                <Field label="💞 Together since">
                  <input type="date" className="field-boxed py-1" value={p.anniversary ?? ''} onChange={(e) => void save({ anniversary: e.target.value || null })} />
                </Field>
              )}
              <Field label="❤️ Love language">
                <select className="field-boxed py-1" value={p.love_language} onChange={(e) => void save({ love_language: e.target.value })}>
                  <option value="">Not sure yet</option>
                  {LOVE_LANGUAGES.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="🤝 How you met">
                <AutoText value={p.how_met} onSave={(v) => save({ how_met: v })} placeholder="Orientation week, a friend’s party…" className="field-boxed py-1" />
              </Field>
            </div>
          </div>
          <button className="btn-ghost text-xs hover:text-danger" onClick={() => confirm(`Remove ${p.name || 'this person'} and everything noted about them?`) && void db.remove('people', p.id).then(() => navigate({ name: 'people' }))}>
            <Icon name="trash" size={14} />
          </button>
        </section>

        <div className="flex gap-1 border-b border-line">
          {(
            [
              ['details', 'Little details'],
              ['memories', 'Memories'],
              ['plans', 'Plans'],
              ['ask', 'Things to ask'],
              ['ideas', 'Ideas']
            ] as const
          ).map(([t, label]) => (
            <button key={t} className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t ? 'border-accent font-semibold text-ink' : 'border-transparent text-muted hover:text-ink'}`} onClick={() => setTab(t)}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'details' && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
            <FactsPanel person={p} />
            <aside className="flex flex-col gap-4">
              <section className="card p-4">
                <h3 className="mb-1 text-lg">Notes</h3>
                <AutoText multiline rows={6} value={p.notes} onSave={(v) => save({ notes: v })} placeholder={`Anything else about ${firstName(p)}…`} className="field-boxed text-sm" />
              </section>
              <section className="card p-4">
                <h3 className="mb-1.5 text-lg">Before you next see {firstName(p)}</h3>
                <ul className="flex flex-col gap-1 text-sm text-muted">
                  {FRIEND_CHECKIN.map((t) => (
                    <li key={t} className="flex gap-1.5">
                      <span className="text-brass">·</span>
                      {t}
                    </li>
                  ))}
                </ul>
              </section>
              {p.love_language && (
                <section className="card p-4">
                  <h3 className="text-lg">{LOVE_LANGUAGES.find((l) => l.id === p.love_language)?.label}</h3>
                  <p className="mb-1.5 text-xs text-muted">{LOVE_LANGUAGES.find((l) => l.id === p.love_language)?.about}</p>
                  <ul className="text-sm">
                    {LOVE_LANGUAGES.find((l) => l.id === p.love_language)?.ideas.map((i) => (
                      <li key={i}>· {i}</li>
                    ))}
                  </ul>
                </section>
              )}
            </aside>
          </div>
        )}
        {tab === 'memories' && <MomentsPanel person={p} title={`Memories with ${firstName(p)}`} />}
        {tab === 'plans' && <PlansPanel person={p} />}
        {tab === 'ask' && (
          <div className="card p-5">
            <QuestionsCard decks={p.kind === 'partner' ? ['us', 'deep', 'light', 'future', 'memories'] : ['friends', 'light', 'deep', 'memories', 'rather']} title={`Things to ask ${firstName(p)}`} />
          </div>
        )}
        {tab === 'ideas' && <IdeasBrowser person={p} audience={p.kind === 'partner' ? 'date' : 'friends'} />}
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

function AvatarPicker({ person, onSave }: { person: Person; onSave: (p: Partial<Person>) => Promise<unknown> }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} title="Change look">
        <Avatar person={person} size={72} />
      </button>
      {open && (
        <div className="card absolute top-full left-0 z-30 mt-2 w-60 p-3 shadow-xl">
          <div className="mb-1 text-xs text-muted">Emoji</div>
          <div className="grid grid-cols-8 gap-1">
            {EMOJI.map((e) => (
              <button key={e || 'none'} className={`rounded p-0.5 text-lg hover:bg-line/50 ${person.emoji === e ? 'bg-accent-soft' : ''}`} onClick={() => void onSave({ emoji: e })}>
                {e || <span className="text-xs text-muted">Aa</span>}
              </button>
            ))}
          </div>
          <div className="mt-2 mb-1 text-xs text-muted">Colour</div>
          <div className="flex flex-wrap gap-1.5">
            {PALETTE.map((c) => (
              <button key={c} className={`h-6 w-6 rounded-full ${person.color === c ? 'ring-2 ring-brass ring-offset-2 ring-offset-panel' : ''}`} style={{ background: c }} onClick={() => void onSave({ color: c })} />
            ))}
          </div>
          <button className="btn mt-3 w-full justify-center text-xs" onClick={() => setOpen(false)}>
            Done
          </button>
        </div>
      )}
    </div>
  )
}
