// Life → Journal: one entry per day — mood, energy, sleep, three good things and a
// free write. The calendar colours days by mood; insights show what goes with good days.

import { useMemo, useState } from 'react'
import type { JournalEntry } from '@shared/types'
import { AutoNumber, AutoText } from '@/components/AutoField'
import { Icon } from '@/components/ui'
import { api, db, useLive } from '@/lib/data'
import { addDays, localDate } from '@/lib/dates'

export const MOODS = [
  { v: 1, emoji: '😞', label: 'Awful', color: '#ef4444' },
  { v: 2, emoji: '😕', label: 'Meh', color: '#f97316' },
  { v: 3, emoji: '😐', label: 'Okay', color: '#eab308' },
  { v: 4, emoji: '🙂', label: 'Good', color: '#84cc16' },
  { v: 5, emoji: '😄', label: 'Great', color: '#22c55e' }
]

const PROMPTS = [
  'What made today good — or hard?',
  'What is one thing you learned today?',
  'What are you looking forward to?',
  'What drained your energy, and what gave you energy?',
  'If today had a title, what would it be?',
  'What would you tell yourself from this morning?',
  'Who did you enjoy spending time with?',
  'What is one small win from today?',
  'What is on your mind that you want to put down?',
  'What would make tomorrow great?'
]

export function useJournal(): JournalEntry[] | undefined {
  return useLive(['journal_entries'], () => api.list('journal_entries', {}, 'date'), []).data
}

const queue = new Map<string, Promise<void>>()

/** The entry for a day, created the first time you write in it (never empty rows).
 *  Saves for the same day run one after another so quick edits can't create two entries. */
export function saveDay(_entries: JournalEntry[], date: string, patch: Partial<JournalEntry>): Promise<void> {
  const run = (queue.get(date) ?? Promise.resolve()).then(async () => {
    const existing = (await api.list('journal_entries', { date }))[0]
    if (existing) await db.update('journal_entries', existing.id, patch)
    else await db.create('journal_entries', { date, ...patch })
  })
  queue.set(date, run.catch(() => {}))
  return run
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

export function JournalPage(): React.JSX.Element {
  const entries = useJournal()
  const today = localDate(new Date())
  const [date, setDate] = useState(today)
  const [month, setMonth] = useState(today.slice(0, 7))
  if (!entries) return <div />
  const e = entries.find((x) => x.date === date)
  const save = (patch: Partial<JournalEntry>): Promise<void> => saveDay(entries, date, patch)
  const prompt = PROMPTS[Number(date.replaceAll('-', '')) % PROMPTS.length]
  const gratitude = (e?.gratitude ?? '').split('\n')
  const past = entries.filter((x) => x.date !== date && x.date.slice(5) === date.slice(5) && (x.content || x.gratitude))

  return (
    <div className="mx-auto grid max-w-6xl gap-5 p-8 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2">
          <button className="btn-ghost" onClick={() => setDate(addDays(date, -1))} title="Previous day">
            <Icon name="back" />
          </button>
          <h1 className="text-2xl font-semibold tracking-tight">
            {date === today ? 'Today' : new Date(date + 'T00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </h1>
          <button className="btn-ghost" disabled={date >= today} onClick={() => setDate(addDays(date, 1))} title="Next day">
            <Icon name="chevron" />
          </button>
          {date !== today && (
            <button className="btn" onClick={() => setDate(today)}>
              Today
            </button>
          )}
        </div>

        <section className="card grid gap-4 p-5 md:grid-cols-[auto_1fr_auto]">
          <div>
            <div className="mb-1 text-xs text-muted">Mood</div>
            <MoodPicker value={e?.mood ?? null} onPick={(v) => void save({ mood: v })} />
          </div>
          <div>
            <div className="mb-1 text-xs text-muted">Energy</div>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((v) => (
                <button key={v} onClick={() => void save({ energy: v })} className={`h-9 w-7 rounded-md text-lg ${(e?.energy ?? 0) >= v ? 'bg-amber-400/25' : 'bg-line/60 opacity-50'}`} title={`${v} / 5`}>
                  ⚡
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col">
            <span className="mb-1 text-xs text-muted">Sleep (hours)</span>
            <AutoNumber value={e?.sleep_hours ?? null} onSave={(v) => save({ sleep_hours: v })} className="field-boxed w-24" placeholder="7.5" min={0} max={24} step={0.5} />
          </label>
        </section>

        <section className="card p-5">
          <h2 className="mb-2 text-sm font-semibold">Three good things</h2>
          <div className="flex flex-col gap-1.5">
            {[0, 1, 2].map((k) => (
              <div key={`${date}-${k}`} className="flex items-center gap-2">
                <span className="text-muted">{k + 1}.</span>
                <AutoText
                  value={gratitude[k] ?? ''}
                  onSave={(v) => {
                    const g = [0, 1, 2].map((j) => (j === k ? v.replace(/\n/g, ' ') : (gratitude[j] ?? '')))
                    return save({ gratitude: g.join('\n').replace(/\n+$/, '') })
                  }}
                  className="field-boxed flex-1"
                  placeholder={['Something that went well…', 'Someone you appreciate…', 'A small pleasure…'][k]}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="card flex flex-col gap-2 p-5">
          <h2 className="text-sm font-semibold">{prompt}</h2>
          <AutoText key={date} multiline rows={12} value={e?.content ?? ''} onSave={(v) => save({ content: v })} className="field-boxed leading-relaxed" placeholder="Write freely. Only you can see this." />
        </section>

        {past.length > 0 && (
          <section className="card p-5">
            <h2 className="mb-2 text-sm font-semibold">On this day</h2>
            {past.slice(-3).map((x) => (
              <button key={x.id} className="block w-full rounded-lg p-2 text-left text-sm hover:bg-canvas" onClick={() => setDate(x.date)}>
                <span className="text-muted">{new Date(x.date + 'T00:00').toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>{' '}
                {MOODS.find((m) => m.v === x.mood)?.emoji} {(x.content || x.gratitude).slice(0, 140)}
              </button>
            ))}
          </section>
        )}
      </div>

      <div className="flex flex-col gap-5">
        <MonthCalendar entries={entries} month={month} setMonth={setMonth} selected={date} onPick={(d) => d <= today && setDate(d)} />
        <Insights entries={entries} />
      </div>
    </div>
  )
}

function MonthCalendar({
  entries,
  month,
  setMonth,
  selected,
  onPick
}: {
  entries: JournalEntry[]
  month: string
  setMonth: (m: string) => void
  selected: string
  onPick: (d: string) => void
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
              className={`aspect-square rounded-md text-xs disabled:opacity-30 ${d === selected ? 'ring-2 ring-accent' : ''} ${e && !mood ? 'bg-line' : ''}`}
              style={mood ? { background: mood.color + '55' } : undefined}
              title={mood ? mood.label : e ? 'Written' : ''}
            >
              {i + 1}
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
