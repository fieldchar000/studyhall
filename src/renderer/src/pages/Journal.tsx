// Life → Daily journal: a scrapbook. Each day can have photos (with captions), the story of
// the day, and the little details — weather, where, who with, a song, mood, sleep and three
// good things. Any past day can be filled in later. Insights show what goes with good days.

import { useMemo, useState } from 'react'
import type { JournalDetails, JournalEntry, Photo } from '@shared/types'
import { AutoNumber, AutoText } from '@/components/AutoField'
import { Icon } from '@/components/ui'
import { PhotoTray, Polaroids } from '@/components/Scrapbook'
import { api, db, track, useLive, useRows } from '@/lib/data'
import { addPhotos, pastedImages } from '@/lib/photos'
import { addDays, localDate } from '@/lib/dates'

export const MOODS = [
  { v: 1, emoji: '😞', label: 'Awful', color: '#a14a4a' },
  { v: 2, emoji: '😕', label: 'Meh', color: '#b5774a' },
  { v: 3, emoji: '😐', label: 'Okay', color: '#b49a52' },
  { v: 4, emoji: '🙂', label: 'Good', color: '#6f9a5f' },
  { v: 5, emoji: '😄', label: 'Great', color: '#2f6b52' }
]

const WEATHER = ['☀️ Sunny', '⛅ Cloudy', '🌦️ Showers', '🌧️ Rainy', '⛈️ Stormy', '🌫️ Hazy', '🌙 Clear night']

const PROMPTS = [
  'What made today good — or hard?',
  'What’s the story behind today’s photos?',
  'What is one thing you learned today?',
  'What are you looking forward to?',
  'What drained your energy, and what gave you energy?',
  'If today had a title, what would it be?',
  'What would you tell yourself from this morning?',
  'Who did you enjoy spending time with?',
  'What is one small win from today?',
  'What would make tomorrow great?'
]

export function useJournal(): JournalEntry[] | undefined {
  return useLive(['journal_entries'], () => api.list('journal_entries', {}, 'date'), []).data
}

const queue = new Map<string, Promise<unknown>>()

/** The entry for a day, created the first time you write in it (never empty rows).
 *  Saves for the same day run one after another so quick edits can't create two entries. */
function withDay(date: string, patch: Partial<JournalEntry>): Promise<JournalEntry> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Promise.reject(new Error('No day chosen'))
  const run = (queue.get(date) ?? Promise.resolve()).then(async () => {
    const existing = (await api.list('journal_entries', { date }))[0]
    if (existing) return Object.keys(patch).length ? db.update('journal_entries', existing.id, patch) : existing
    return db.create('journal_entries', { date, ...patch })
  })
  queue.set(
    date,
    run.catch(() => {})
  )
  return run
}

export function saveDay(_entries: JournalEntry[], date: string, patch: Partial<JournalEntry>): Promise<void> {
  return withDay(date, patch).then(() => undefined)
}

const parseDetails = (e?: JournalEntry): JournalDetails => {
  try {
    return JSON.parse(e?.details || '{}') as JournalDetails
  } catch {
    return {}
  }
}

export function MoodPicker({ value, onPick, size = 'text-2xl' }: { value: number | null; onPick: (v: number) => void; size?: string }): React.JSX.Element {
  return (
    <div className="flex gap-1">
      {MOODS.map((m) => (
        <button
          key={m.v}
          title={m.label}
          onClick={() => onPick(m.v)}
          className={`rounded-lg px-1.5 py-0.5 ${size} transition-transform hover:scale-110 ${value === m.v ? 'scale-110 bg-accent-soft' : value ? 'opacity-40' : ''}`}
        >
          {m.emoji}
        </button>
      ))}
    </div>
  )
}

const longDate = (d: string): string => new Date(d + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
const weekday = (d: string): string => new Date(d + 'T00:00').toLocaleDateString(undefined, { weekday: 'long' })

export function JournalPage(): React.JSX.Element {
  const entries = useJournal()
  const photos = useRows('photos', { parent_table: 'journal_entries' }, 'sort')
  const today = localDate(new Date())
  const [editing, setEditing] = useState<string>(today)
  const [month, setMonth] = useState(today.slice(0, 7))
  const [shown, setShown] = useState(12)
  if (!entries) return <div />

  const photosOf = (e?: JournalEntry): Photo[] => (e ? (photos ?? []).filter((p) => p.parent_id === e.id) : [])
  const hasPhotos = new Set((photos ?? []).map((p) => p.parent_id))
  const written = [...entries]
    .filter((e) => e.content || e.title || e.gratitude || hasPhotos.has(e.id) || e.mood)
    .sort((a, b) => b.date.localeCompare(a.date))
  const pages = [...(editing ? [editing] : []), ...written.map((e) => e.date).filter((d) => d !== editing)].slice(0, shown + 1)
  const onThisDay = entries.filter((x) => x.date !== today && x.date.slice(5) === today.slice(5) && (x.content || hasPhotos.has(x.id)))

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto grid max-w-6xl gap-6 px-8 py-7 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-6">
          <header className="masthead flex flex-wrap items-end gap-3">
            <div className="mr-auto">
              <div className="label-caps">Life · scrapbook</div>
              <h1 className="text-3xl">Daily journal</h1>
              <p className="mt-0.5 text-sm text-muted">Photos, the story behind them, and the little details of each day.</p>
            </div>
            <label className="flex items-center gap-2 text-sm text-muted">
              Write about
              <input type="date" className="field-boxed w-auto py-1" max={today} value={editing} onChange={(e) => e.target.value && setEditing(e.target.value)} />
            </label>
          </header>

          {editing !== today && !written.some((x) => x.date === today) && (
            <button className="card flex items-center gap-3 border-dashed px-6 py-4 text-left hover:border-brass/60" onClick={() => setEditing(today)}>
              <Icon name="camera" size={22} className="text-brass" />
              <span>
                <span className="font-display block text-xl font-semibold">How was today?</span>
                <span className="text-sm text-muted">Add a few photos and write the story behind them.</span>
              </span>
            </button>
          )}
          {pages.map((d) => {
            const e = entries.find((x) => x.date === d)
            return d === editing ? (
              <DayEditor key={d} date={d} entry={e} photos={photosOf(e)} onDone={() => setEditing('')} />
            ) : (
              <DayPage key={d} date={d} entry={e!} photos={photosOf(e)} onEdit={() => setEditing(d)} />
            )
          })}
          {written.length > shown && (
            <button className="btn self-center" onClick={() => setShown((n) => n + 12)}>
              Older pages
            </button>
          )}
        </div>

        <aside className="flex flex-col gap-5">
          <MonthCalendar entries={entries} month={month} setMonth={setMonth} selected={editing} onPick={(d) => d <= today && setEditing(d)} photoDays={new Set(entries.filter((x) => hasPhotos.has(x.id)).map((x) => x.date))} />
          {onThisDay.length > 0 && (
            <section className="card p-4">
              <h2 className="mb-2 text-lg">On this day</h2>
              {onThisDay.slice(-3).map((x) => (
                <button key={x.id} className="block w-full rounded-md p-2 text-left text-sm hover:bg-line/40" onClick={() => setEditing(x.date)}>
                  <span className="text-muted">{x.date.slice(0, 4)}</span> · {x.title || (x.content || '').slice(0, 90) || 'Photos'}
                </button>
              ))}
            </section>
          )}
          <Insights entries={entries} />
        </aside>
      </div>
    </div>
  )
}

/** A finished day, laid out like a scrapbook page. */
function DayPage({ date, entry: e, photos, onEdit }: { date: string; entry: JournalEntry; photos: Photo[]; onEdit: () => void }): React.JSX.Element {
  const d = parseDetails(e)
  const mood = MOODS.find((m) => m.v === e.mood)
  const good = (e.gratitude ?? '').split('\n').filter(Boolean)
  const chips: [string, string | undefined][] = [
    ['', d.weather],
    ['📍', d.place],
    ['👥', d.with],
    ['🎵', d.song],
    ['🍽️', d.food],
    ['✨', d.highlight]
  ]
  return (
    <article className="card relative overflow-hidden px-7 py-6">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <div className="label-caps">{weekday(date)}</div>
          <div className="font-display text-[15px] text-muted">{longDate(date)}</div>
          {e.title && <h2 className="mt-1 text-2xl italic">{e.title}</h2>}
        </div>
        {mood && (
          <span className="text-2xl" title={mood.label}>
            {mood.emoji}
          </span>
        )}
        <button className="btn-ghost" onClick={onEdit}>
          <Icon name="pencil" /> Edit
        </button>
      </div>
      <Polaroids photos={photos} />
      {e.content && <p className="dropcap mt-3 text-[15px] leading-relaxed whitespace-pre-wrap">{e.content}</p>}
      {(chips.some(([, v]) => v) || e.sleep_hours != null || good.length > 0) && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line/70 pt-3 text-xs text-muted">
          {chips
            .filter(([, v]) => v)
            .map(([icon, v]) => (
              <span key={v} className="rounded-full border border-line px-2 py-0.5">
                {icon} {v}
              </span>
            ))}
          {e.sleep_hours != null && <span className="rounded-full border border-line px-2 py-0.5">😴 {e.sleep_hours}h sleep</span>}
          {good.length > 0 && <span className="w-full pt-1">Grateful for: {good.join(' · ')}</span>}
        </div>
      )}
    </article>
  )
}

/** Writing a day: photos, a title, the story, and the details. Saves as you type. */
function DayEditor({ date, entry: e, photos, onDone }: { date: string; entry?: JournalEntry; photos: Photo[]; onDone: () => void }): React.JSX.Element {
  const today = localDate(new Date())
  const save = (patch: Partial<JournalEntry>): Promise<void> => withDay(date, patch).then(() => undefined)
  const d = parseDetails(e)
  const setDetail = (k: keyof JournalDetails, v: string): Promise<void> => save({ details: JSON.stringify({ ...parseDetails(e), [k]: v || undefined }) })
  const gratitude = (e?.gratitude ?? '').split('\n')
  const prompt = PROMPTS[Number(date.replaceAll('-', '')) % PROMPTS.length]
  return (
    <article
      className="card flex flex-col gap-5 border-brass/50 px-7 py-6"
      onPaste={(e) => {
        // Paste a copied picture or screenshot anywhere on the page.
        const files = pastedImages(e)
        if (!files.length) return
        e.preventDefault()
        void withDay(date, {}).then((x) => track(addPhotos(files, 'journal_entries', x.id, photos.length)))
      }}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <div className="label-caps">{date === today ? 'Today' : weekday(date)}</div>
          <div className="font-display text-[15px] text-muted">{longDate(date)}</div>
        </div>
        <button className="btn-ghost" onClick={() => onDone()} title="Done">
          <Icon name="check" /> Done
        </button>
      </div>
      <AutoText
        key={`${date}-title`}
        value={e?.title ?? ''}
        onSave={(v) => save({ title: v })}
        placeholder="Give the day a title…"
        className="field font-display text-2xl italic"
      />
      <PhotoTray photos={photos} parentTable="journal_entries" onNeedParent={() => withDay(date, {}).then((x) => x.id)} />
      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-muted">{prompt}</span>
        <AutoText key={`${date}-story`} multiline rows={8} value={e?.content ?? ''} onSave={(v) => save({ content: v })} className="field-boxed text-[15px] leading-relaxed" placeholder="Write it like you’ll read it in ten years." />
      </label>

      <div className="flex flex-col gap-3 rounded-lg bg-canvas/60 p-4">
        <div className="label-caps">The little details</div>
        <div className="flex flex-wrap gap-1.5">
          {WEATHER.map((w) => (
            <button key={w} className={`rounded-full border px-2.5 py-0.5 text-xs ${d.weather === w ? 'border-accent bg-accent-soft text-ink' : 'border-line text-muted hover:text-ink'}`} onClick={() => void setDetail('weather', d.weather === w ? '' : w)}>
              {w}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ['place', '📍 Where', 'Home, campus, Tiong Bahru…'],
              ['with', '👥 With', 'Who you spent it with'],
              ['song', '🎵 Song of the day', 'What was playing'],
              ['food', '🍽️ Best thing you ate', 'Chicken rice, obviously'],
              ['highlight', '✨ Highlight', 'The moment you’ll remember']
            ] as [keyof JournalDetails, string, string][]
          ).map(([k, label, ph]) => (
            <label key={k} className="flex flex-col gap-0.5 text-xs text-muted">
              {label}
              <AutoText key={`${date}-${k}`} value={d[k] ?? ''} onSave={(v) => setDetail(k, v)} placeholder={ph} className="field-boxed text-sm text-ink" />
            </label>
          ))}
          <label className="flex flex-col gap-0.5 text-xs text-muted">
            😴 Sleep (hours)
            <AutoNumber value={e?.sleep_hours ?? null} onSave={(v) => save({ sleep_hours: v })} className="field-boxed text-sm text-ink" placeholder="7.5" min={0} max={24} step={0.5} />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div>
            <div className="mb-0.5 text-xs text-muted">Mood</div>
            <MoodPicker value={e?.mood ?? null} onPick={(v) => void save({ mood: v })} size="text-xl" />
          </div>
          <div>
            <div className="mb-0.5 text-xs text-muted">Energy</div>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((v) => (
                <button key={v} onClick={() => void save({ energy: v })} className={`h-7 w-6 rounded-md text-sm ${(e?.energy ?? 0) >= v ? 'bg-brass/25' : 'bg-line/60 opacity-50'}`} title={`${v} / 5`}>
                  ⚡
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="text-xs text-muted">Three good things</div>
          {[0, 1, 2].map((k) => (
            <AutoText
              key={`${date}-g${k}`}
              value={gratitude[k] ?? ''}
              onSave={(v) => {
                const g = [0, 1, 2].map((j) => (j === k ? v.replace(/\n/g, ' ') : (gratitude[j] ?? '')))
                return save({ gratitude: g.join('\n').replace(/\n+$/, '') })
              }}
              className="field-boxed text-sm"
              placeholder={['Something that went well…', 'Someone you appreciate…', 'A small pleasure…'][k]}
            />
          ))}
        </div>
      </div>
    </article>
  )
}

function MonthCalendar({
  entries,
  month,
  setMonth,
  selected,
  onPick,
  photoDays
}: {
  entries: JournalEntry[]
  month: string
  setMonth: (m: string) => void
  selected: string
  onPick: (d: string) => void
  photoDays: Set<string>
}): React.JSX.Element {
  const [y, m] = month.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  const lead = (first.getDay() + 6) % 7
  const days = new Date(y, m, 0).getDate()
  const byDate = new Map(entries.map((e) => [e.date, e]))
  const shift = (n: number): void => {
    const d = new Date(y, m - 1 + n, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const today = localDate(new Date())
  return (
    <section className="card p-4">
      <div className="mb-2 flex items-center">
        <button className="btn-ghost px-1" onClick={() => shift(-1)}>
          <Icon name="back" />
        </button>
        <div className="flex-1 text-center text-sm font-semibold">{first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
        <button className="btn-ghost px-1" onClick={() => shift(1)}>
          <Icon name="chevron" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px]">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i} className="text-muted">
            {d}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`x${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const d = `${month}-${String(i + 1).padStart(2, '0')}`
          const e = byDate.get(d)
          const mood = MOODS.find((x) => x.v === e?.mood)
          return (
            <button
              key={d}
              onClick={() => onPick(d)}
              disabled={d > today}
              className={`relative aspect-square rounded-md text-xs disabled:opacity-30 ${d === selected ? 'ring-2 ring-accent' : ''} ${e && !mood ? 'bg-line' : ''}`}
              style={mood ? { background: mood.color + '55' } : undefined}
              title={mood ? mood.label : e ? 'Written' : ''}
            >
              {i + 1}
              {photoDays.has(d) && <span className="absolute right-0.5 bottom-0.5 h-1 w-1 rounded-full bg-brass" />}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function Insights({ entries }: { entries: JournalEntry[] }): React.JSX.Element {
  const stats = useMemo(() => {
    const since = addDays(localDate(new Date()), -30)
    const recent = entries.filter((e) => e.date >= since)
    const moods = recent.filter((e) => e.mood != null)
    const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
    const goodSleep = moods.filter((e) => (e.sleep_hours ?? 0) >= 7).map((e) => e.mood!)
    const badSleep = moods.filter((e) => e.sleep_hours != null && e.sleep_hours < 7).map((e) => e.mood!)
    const byDow = Array.from({ length: 7 }, (_, d) => avg(moods.filter((e) => (new Date(e.date + 'T00:00').getDay() + 6) % 7 === d).map((e) => e.mood!)))
    // writing streak
    let streak = 0
    const dates = new Set(entries.map((e) => e.date))
    let day = dates.has(localDate(new Date())) ? localDate(new Date()) : addDays(localDate(new Date()), -1)
    while (dates.has(day)) {
      streak++
      day = addDays(day, -1)
    }
    return {
      days: recent.length,
      mood: avg(moods.map((e) => e.mood!)),
      sleep: avg(recent.filter((e) => e.sleep_hours != null).map((e) => e.sleep_hours!)),
      goodSleep: avg(goodSleep),
      badSleep: avg(badSleep),
      byDow,
      streak,
      series: moods.slice(-30)
    }
  }, [entries])
  const fmt = (n: number | null, d = 1): string => (n == null ? '—' : n.toFixed(d))
  return (
    <section className="card flex flex-col gap-3 p-4 text-sm">
      <h2 className="text-sm font-semibold">Last 30 days</h2>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-lg font-semibold">{stats.mood == null ? '—' : MOODS[Math.round(stats.mood) - 1].emoji}</div>
          <div className="text-[11px] text-muted">avg mood {fmt(stats.mood)}</div>
        </div>
        <div>
          <div className="text-lg font-semibold">{fmt(stats.sleep)}h</div>
          <div className="text-[11px] text-muted">avg sleep</div>
        </div>
        <div>
          <div className="text-lg font-semibold">🔥 {stats.streak}</div>
          <div className="text-[11px] text-muted">days in a row</div>
        </div>
      </div>
      {stats.series.length > 1 && (
        <svg viewBox={`0 0 ${(stats.series.length - 1) * 10} 44`} className="h-16 w-full" preserveAspectRatio="none">
          <polyline
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            points={stats.series.map((e, i) => `${i * 10},${42 - (e.mood! - 1) * 10}`).join(' ')}
          />
        </svg>
      )}
      {stats.goodSleep != null && stats.badSleep != null && (
        <p className="text-xs text-muted">
          Mood after 7h+ sleep: <b className="text-ink">{fmt(stats.goodSleep)}</b> vs less: <b className="text-ink">{fmt(stats.badSleep)}</b>.
          {stats.goodSleep > stats.badSleep + 0.3 && ' Sleep seems to matter for you.'}
        </p>
      )}
      {stats.byDow.some((x) => x != null) && (
        <div className="flex items-end gap-1">
          {stats.byDow.map((v, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div className="w-full rounded-t bg-accent/70" style={{ height: `${v ? v * 8 : 2}px` }} title={v ? fmt(v) : 'no data'} />
              <span className="text-[10px] text-muted">{'MTWTFSS'[i]}</span>
            </div>
          ))}
        </div>
      )}
      {stats.days === 0 && <p className="text-xs text-muted">Pick a mood each day — patterns show up here after a week or two.</p>}
    </section>
  )
}
