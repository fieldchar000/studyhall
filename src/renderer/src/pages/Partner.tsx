// Life → Partner: one page for your girlfriend / boyfriend / partner — how long you've been
// together, what's coming up, date ideas around Singapore, memories, the little details,
// questions to ask, their love language and gift ideas, and a monthly check-in.

import { useMemo, useState } from 'react'
import type { Person } from '@shared/types'
import { AutoText } from '@/components/AutoField'
import { Icon } from '@/components/ui'
import { Avatar, FactsPanel, IdeasBrowser, MomentsPanel, PlansPanel, QuestionsCard, daysSince, daysUntil, firstName, inDays, yearsSince } from '@/components/Relationships'
import { db, useLive, useRows } from '@/lib/data'
import { localDate } from '@/lib/dates'
import { navigate } from '@/lib/nav'
import { setPartner, useProfile } from '@/lib/profile'
import { APPRECIATION_PROMPTS, CHECKIN_PROMPTS, GIFT_IDEAS, IDEAS, IDEA_CATEGORIES, LOVE_LANGUAGES, PARTNER_LABELS, TIPS, questionOfTheDay } from '@/lib/peopleContent'
import { createPerson } from './People'

type Tab = 'overview' | 'ideas' | 'plans' | 'memories' | 'details' | 'ask' | 'love' | 'checkin'

export function PartnerPage(): React.JSX.Element {
  const profile = useProfile()
  const partner = useLive(['people', 'profiles'], async () => (profile?.partner_id ? await window.api.get('people', profile.partner_id) : null), [profile?.partner_id]).data
  if (!profile || partner === undefined) return <div />
  if (!partner) return <Setup label={profile.partner_label || 'Partner'} />
  return <PartnerHome partner={partner} label={profile.partner_label || 'Partner'} />
}

/** First visit: choose someone already in People, or add them. */
function Setup({ label: initial }: { label: string }): React.JSX.Element {
  const people = useRows('people', { archived: 0 }, 'sort') ?? []
  const [name, setName] = useState('')
  const [label, setLabel] = useState(initial)
  const [since, setSince] = useState('')
  const create = async (): Promise<void> => {
    const p = await createPerson('partner', name.trim())
    await db.update('people', p.id, { anniversary: since || null, emoji: '' })
    await setPartner({ partner_id: p.id, partner_label: label })
  }
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex max-w-xl flex-col gap-5 px-8 py-12">
        <div className="text-center">
          <Icon name="heart" size={36} className="mx-auto text-brass" />
          <h1 className="mt-2 text-3xl">Your person</h1>
          <p className="mt-1 text-sm text-muted">A page for your partner: the little details, date ideas around Singapore, memories with photos, and gentle reminders for the days that matter.</p>
        </div>
        <section className="card flex flex-col gap-3 p-5">
          <label className="flex flex-col gap-1 text-sm">
            Their name
            <input className="field-boxed" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" autoFocus />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            They’re your
            <select className="field-boxed" value={label} onChange={(e) => setLabel(e.target.value)}>
              {PARTNER_LABELS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Together since (optional)
            <input type="date" className="field-boxed" value={since} max={localDate(new Date())} onChange={(e) => setSince(e.target.value)} />
          </label>
          <button className="btn-primary justify-center" disabled={!name.trim()} onClick={() => void create()}>
            Create their page
          </button>
        </section>
        {people.length > 0 && (
          <section className="card p-5">
            <div className="mb-2 text-sm text-muted">Or choose someone from People</div>
            <div className="flex flex-col gap-1">
              {people.map((p) => (
                <button key={p.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-line/40" onClick={() => void db.update('people', p.id, { kind: 'partner' }).then(() => setPartner({ partner_id: p.id, partner_label: label }))}>
                  <Avatar person={p} size={28} />
                  <span className="text-sm">{p.name}</span>
                </button>
              ))}
            </div>
          </section>
        )}
        <p className="text-center text-xs text-muted">You can change this any time in Settings → Relationships.</p>
      </div>
    </div>
  )
}

function together(since: string | null): { text: string; days: number } | null {
  const days = daysSince(since)
  if (days == null || days < 0) return null
  const s = new Date(since + 'T00:00')
  const now = new Date()
  let months = (now.getFullYear() - s.getFullYear()) * 12 + now.getMonth() - s.getMonth()
  if (now.getDate() < s.getDate()) months--
  const y = Math.floor(months / 12)
  const m = months % 12
  const text = [y ? `${y} year${y === 1 ? '' : 's'}` : '', m ? `${m} month${m === 1 ? '' : 's'}` : '', !y && !m ? `${days} day${days === 1 ? '' : 's'}` : ''].filter(Boolean).join(', ')
  return { text, days }
}

function PartnerHome({ partner: p, label }: { partner: Person; label: string }): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('overview')
  const plans = useRows('plans', { person_id: p.id }, 'date') ?? []
  const name = firstName(p)
  const t = together(p.anniversary)
  const anni = daysUntil(p.anniversary)
  const anniYears = yearsSince(p.anniversary)
  const bday = daysUntil(p.birthday)
  const today = localDate(new Date())
  const next = plans.filter((x) => x.status === 'planned' && x.date && x.date >= today).sort((a, b) => a.date!.localeCompare(b.date!))[0]

  const tabs: [Tab, string][] = [
    ['overview', 'Overview'],
    ['ideas', 'Date ideas'],
    ['plans', 'Plans'],
    ['memories', 'Memories'],
    ['details', 'Little details'],
    ['ask', 'Questions'],
    ['love', 'Love & gifts'],
    ['checkin', 'Check-in']
  ]

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-8 py-7">
        <section className="card relative overflow-hidden px-7 py-6">
          <div className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full opacity-[0.08]" style={{ background: 'var(--color-accent)' }} />
          <div className="flex flex-wrap items-center gap-5">
            <button onClick={() => navigate({ name: 'people', id: p.id })} title="Edit their details">
              <Avatar person={p} size={76} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="label-caps">Your {label.toLowerCase()}</div>
              <h1 className="text-4xl">{p.name}</h1>
              {t ? (
                <p className="mt-1 text-sm text-muted">
                  Together <span className="font-semibold text-ink">{t.text}</span> · {t.days.toLocaleString()} days
                </p>
              ) : (
                <button className="mt-1 text-sm text-accent underline" onClick={() => navigate({ name: 'people', id: p.id })}>
                  Add the day you got together
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <Countdown icon="date" label={anniYears != null ? `${anniYears + 1}${ordinal(anniYears + 1)} anniversary` : 'Anniversary'} days={anni} />
              <Countdown icon="cake" label="Birthday" days={bday} />
              <Countdown icon="pin" label={next ? next.title : 'Next date'} days={next ? Math.round((new Date(next.date + 'T00:00').getTime() - new Date(today + 'T00:00').getTime()) / 86_400_000) : null} empty="Plan one" onClick={() => setTab('ideas')} />
            </div>
          </div>
        </section>

        <div className="flex flex-wrap gap-1 border-b border-line">
          {tabs.map(([k, l]) => (
            <button key={k} className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === k ? 'border-accent font-semibold text-ink' : 'border-transparent text-muted hover:text-ink'}`} onClick={() => setTab(k)}>
              {l}
            </button>
          ))}
        </div>

        {tab === 'overview' && <Overview partner={p} onTab={setTab} />}
        {tab === 'ideas' && <IdeasBrowser person={p} audience="date" />}
        {tab === 'plans' && <PlansPanel person={p} />}
        {tab === 'memories' && <MomentsPanel person={p} title={`Memories with ${name}`} />}
        {tab === 'details' && <FactsPanel person={p} />}
        {tab === 'ask' && (
          <div className="card p-5">
            <QuestionsCard decks={['us', 'deep', 'light', 'future', 'memories', 'rather']} title={`Ask ${name}`} />
          </div>
        )}
        {tab === 'love' && <LoveAndGifts partner={p} />}
        {tab === 'checkin' && <CheckIn partner={p} />}
      </div>
    </div>
  )
}

const ordinal = (n: number): string => (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')

function Countdown({ icon, label, days, empty = '—', onClick }: { icon: string; label: string; days: number | null; empty?: string; onClick?: () => void }): React.JSX.Element {
  return (
    <button className="flex w-28 flex-col items-center gap-0.5 rounded-lg border border-line bg-canvas/50 px-2 py-2.5 hover:border-brass/60" onClick={onClick} disabled={!onClick}>
      <Icon name={icon} size={18} className="text-brass" />
      <span className="font-display text-xl leading-tight font-semibold tabular-nums">{days == null ? empty : days === 0 ? 'Today' : `${days}d`}</span>
      <span className="line-clamp-1 text-[10.5px] text-muted">{label}</span>
    </button>
  )
}

function Overview({ partner: p, onTab }: { partner: Person; onTab: (t: Tab) => void }): React.JSX.Element {
  const name = firstName(p)
  const question = useMemo(() => questionOfTheDay(['us', 'deep', 'light', 'future'], p.id), [p.id])
  const appreciations = (useRows('moments', { person_id: p.id, kind: 'appreciation' }, 'date') ?? []).slice(-5).reverse()
  const [note, setNote] = useState('')
  const prompt = APPRECIATION_PROMPTS[new Date().getDate() % APPRECIATION_PROMPTS.length]
  const tip = TIPS[(new Date().getDate() + 3) % TIPS.length]
  const love = LOVE_LANGUAGES.find((l) => l.id === p.love_language)
  const idea = useMemo(() => {
    const pool = IDEAS.filter((i) => i.for !== 'friends')
    return pool[(new Date().getDate() * 7 + new Date().getMonth()) % pool.length]
  }, [])
  const addNote = async (): Promise<void> => {
    if (!note.trim()) return
    await db.create('moments', { person_id: p.id, kind: 'appreciation', date: localDate(new Date()), story: note.trim() })
    setNote('')
  }
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-5">
        <section className="card px-6 py-6 text-center">
          <div className="label-caps">Today’s question for {name}</div>
          <p className="font-display mx-auto mt-2 max-w-xl text-3xl leading-snug">{question}</p>
          <button className="btn mt-4" onClick={() => onTab('ask')}>
            More questions
          </button>
        </section>
        <section className="card p-5">
          <h2 className="text-xl">Appreciation log</h2>
          <p className="mb-3 text-xs text-muted">{prompt}. A line a day adds up — read them back on a hard day, or put them in an anniversary card.</p>
          <div className="flex gap-2">
            <input className="field-boxed flex-1" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void addNote()} placeholder={`Something you appreciated about ${name}…`} />
            <button className="btn-primary" disabled={!note.trim()} onClick={() => void addNote()}>
              Save
            </button>
          </div>
          <ul className="mt-3 flex flex-col gap-1.5">
            {appreciations.map((a) => (
              <li key={a.id} className="group flex items-start gap-2 text-sm">
                <span className="text-brass">♥</span>
                <span className="flex-1">{a.story}</span>
                <span className="text-[11px] text-muted">{new Date(a.date + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                <button className="hidden text-muted group-hover:block hover:text-danger" onClick={() => void db.remove('moments', a.id)}>
                  <Icon name="x" size={12} />
                </button>
              </li>
            ))}
          </ul>
        </section>
        <PlansPanel person={p} />
      </div>
      <aside className="flex flex-col gap-5">
        <section className="card p-5">
          <div className="label-caps">An idea for this week</div>
          <div className="font-display mt-1 text-xl font-semibold">
            {IDEA_CATEGORIES[idea.category].icon} {idea.title}
          </div>
          <div className="text-[11px] text-muted">{idea.area}</div>
          <p className="mt-2 text-sm">{idea.blurb}</p>
          <button className="btn mt-3" onClick={() => onTab('ideas')}>
            <Icon name="dice" /> More date ideas
          </button>
        </section>
        <section className="card p-5">
          <div className="label-caps">{love ? `${name}’s love language` : 'Love language'}</div>
          {love ? (
            <>
              <div className="font-display mt-1 text-xl font-semibold">{love.label}</div>
              <ul className="mt-2 text-sm">
                {love.ideas.slice(0, 3).map((i) => (
                  <li key={i}>· {i}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted">Not set yet — have a look in Love & gifts and pick the one that sounds most like {name}.</p>
          )}
          <button className="btn mt-3" onClick={() => onTab('love')}>
            Love & gifts
          </button>
        </section>
        <p className="flex items-start gap-2 text-sm text-muted">
          <Icon name="spark" className="mt-0.5 text-brass" /> {tip}
        </p>
      </aside>
    </div>
  )
}

function LoveAndGifts({ partner: p }: { partner: Person }): React.JSX.Element {
  const name = firstName(p)
  const [budget, setBudget] = useState('any')
  const gifts = GIFT_IDEAS.filter((g) => (!p.love_language || g.tags.includes(p.love_language)) && (budget === 'any' || g.budget === budget))
  const saved = (useRows('person_facts', { person_id: p.id, category: 'gifts' }) ?? []).map((f) => f.text)
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="flex flex-col gap-3">
        <h2 className="text-xl">Love languages</h2>
        <p className="text-sm text-muted">Everyone gives and receives love a bit differently. Pick the one that sounds most like {name}; it shapes the gift and date suggestions.</p>
        {LOVE_LANGUAGES.map((l) => (
          <button
            key={l.id}
            className={`rounded-lg border p-4 text-left transition-colors ${p.love_language === l.id ? 'border-accent bg-accent-soft' : 'border-line bg-panel hover:border-brass/60'}`}
            onClick={() => void db.update('people', p.id, { love_language: p.love_language === l.id ? '' : l.id })}
          >
            <div className="font-display text-lg font-semibold">
              {l.label} {p.love_language === l.id && <span className="text-sm text-accent">· {name}</span>}
            </div>
            <div className="text-sm text-muted">{l.about}</div>
            <div className="mt-1.5 text-xs">{l.ideas.join(' · ')}</div>
          </button>
        ))}
      </section>
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="mr-auto text-xl">Gift ideas</h2>
          <select className="field-boxed w-auto py-1 text-sm" value={budget} onChange={(e) => setBudget(e.target.value)}>
            <option value="any">Any budget</option>
            <option value="free">Free</option>
            <option value="$">$</option>
            <option value="$$">$$</option>
            <option value="$$$">$$$</option>
          </select>
        </div>
        {saved.length > 0 && (
          <div className="rounded-lg border border-brass/50 bg-panel p-3">
            <div className="label-caps mb-1">Things {name} mentioned</div>
            {saved.map((s) => (
              <div key={s} className="text-sm">
                🎁 {s}
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          {gifts.map((g) => (
            <div key={g.title} className="group flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-2 text-sm">
              <span className="flex-1">{g.title}</span>
              <span className="text-xs text-muted">{g.budget === 'free' ? 'Free' : g.budget}</span>
              <button
                className="btn-ghost hidden px-1.5 text-xs group-hover:inline-flex"
                title="Save to their gift ideas"
                onClick={() => void db.create('person_facts', { person_id: p.id, category: 'gifts', text: g.title })}
              >
                <Icon name="bookmark" size={13} /> Save
              </button>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted">Add what {name} mentions wanting to “Little details → Gift ideas” the moment they say it.</p>
      </section>
    </div>
  )
}

function CheckIn({ partner: p }: { partner: Person }): React.JSX.Element {
  const name = firstName(p)
  const month = new Date().getMonth()
  const prompts = useMemo(() => [0, 1, 2, 3].map((k) => CHECKIN_PROMPTS[(month * 4 + k) % CHECKIN_PROMPTS.length]), [month])
  const [answers, setAnswers] = useState<string[]>(['', '', '', ''])
  const [saved, setSaved] = useState(false)
  const save = async (): Promise<void> => {
    const story = prompts.map((q, i) => (answers[i].trim() ? `${q}\n${answers[i].trim()}` : '')).filter(Boolean).join('\n\n')
    if (!story) return
    await db.create('moments', { person_id: p.id, kind: 'checkin', date: localDate(new Date()), title: `${new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} check-in`, story })
    setAnswers(['', '', '', ''])
    setSaved(true)
  }
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="card flex flex-col gap-4 p-6">
        <div>
          <h2 className="text-2xl">This month’s check-in</h2>
          <p className="text-sm text-muted">Sit down with {name} once a month — over dinner or on a walk — and go through these together. Keep it light and curious; it’s a conversation, not an appraisal.</p>
        </div>
        {prompts.map((q, i) => (
          <label key={q} className="flex flex-col gap-1">
            <span className="font-display text-lg">{q}</span>
            <AutoText
              multiline
              rows={2}
              value={answers[i]}
              onSave={async (v) => setAnswers((a) => a.map((x, j) => (j === i ? v : x)))}
              className="field-boxed text-sm"
              placeholder="Notes from your chat…"
            />
          </label>
        ))}
        <button className="btn-primary self-start" onClick={() => void save()}>
          Save check-in
        </button>
        {saved && <p className="text-sm text-ok">Saved. See you next month.</p>}
      </section>
      <MomentsPanel person={p} kind="checkin" title="Past check-ins" />
    </div>
  )
}
