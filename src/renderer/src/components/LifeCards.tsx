// Small Home/Money cards: the daily check-in, upcoming birthdays & anniversaries (with gift
// ideas), and budget warnings.

import type { JournalDetails } from '@shared/types'
import { api, useLive } from '@/lib/data'
import { localDate } from '@/lib/dates'
import { navigate } from '@/lib/nav'
import { upcomingOccasions, whenLabel } from '@/lib/occasions'
import { startBrief } from '@/lib/voice'
import { useProfile } from '@/lib/profile'
import { MoodPicker, saveDay } from '@/pages/Journal'
import { money, useCurrency } from '@/pages/Money'
import { AutoText } from './AutoField'
import { Avatar } from './Relationships'
import { Icon } from './ui'

// ---------- Daily check-in ----------

const ENERGY = ['Drained', 'Low', 'Okay', 'Good', 'Buzzing']

export function CheckinCard(): React.JSX.Element | null {
  const today = localDate(new Date())
  const entry = useLive(['journal_entries'], async () => (await api.list('journal_entries', { date: today }))[0] ?? null, [today]).data
  if (entry === undefined) return null
  let details: JournalDetails = {}
  try {
    details = JSON.parse(entry?.details || '{}') as JournalDetails
  } catch {
    /* empty */
  }
  const save = (patch: Parameters<typeof saveDay>[2]): void => void saveDay([], today, patch)
  const sleep = entry?.sleep_hours ?? null
  const done = !!(entry?.mood && entry?.energy && sleep != null)
  return (
    <section className="card p-4">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="flex-1 text-sm font-semibold">{done ? '✓ Checked in today' : 'Daily check-in'}</h2>
        <button className="btn-ghost px-1.5" title={'Say it — e.g. “I’m feeling good, energy’s okay, slept 7 hours, highlight was…”'} onClick={() => void startBrief()} aria-label="Check in by voice">
          <Icon name="mic" />
        </button>
        <button className="text-xs text-muted hover:text-ink" onClick={() => navigate({ name: 'journal' })}>
          Journal →
        </button>
      </div>
      <div className="flex flex-col gap-2.5 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-xs text-muted">Mood</span>
          <MoodPicker value={entry?.mood ?? null} size="text-lg" onPick={(v) => save({ mood: v })} />
        </div>
        <div className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-xs text-muted">Energy</span>
          <div className="flex items-end gap-1" role="radiogroup" aria-label="Energy">
            {ENERGY.map((label, i) => {
              const v = i + 1
              const on = (entry?.energy ?? 0) >= v
              return (
                <button key={v} title={label} role="radio" aria-checked={entry?.energy === v} onClick={() => save({ energy: v })} className="flex h-6 w-5 items-end justify-center">
                  <span className={`block w-3 rounded-sm transition-colors ${on ? 'bg-accent' : 'bg-line hover:bg-muted/40'}`} style={{ height: 6 + i * 4 }} />
                </button>
              )
            })}
          </div>
          {entry?.energy ? <span className="text-xs text-muted">{ENERGY[entry.energy - 1]}</span> : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-xs text-muted">Sleep</span>
          <button className="btn-ghost h-6 w-6 justify-center p-0" onClick={() => save({ sleep_hours: Math.max(0, (sleep ?? 7.5) - 0.5) })} aria-label="Less sleep">
            −
          </button>
          <span className="w-12 text-center tabular-nums">{sleep == null ? '—' : `${sleep}h`}</span>
          <button className="btn-ghost h-6 w-6 justify-center p-0" onClick={() => save({ sleep_hours: Math.min(16, (sleep ?? 6.5) + 0.5) })} aria-label="More sleep">
            +
          </button>
        </div>
        <AutoText
          key={`${today}-hi`}
          value={details.highlight ?? ''}
          onSave={(v) => save({ details: JSON.stringify({ ...details, highlight: v }) })}
          placeholder="Best part of today…"
          className="field-boxed text-sm"
        />
      </div>
    </section>
  )
}

// ---------- Birthdays and anniversaries ----------

export function OccasionsCard(): React.JSX.Element | null {
  const partnerId = useProfile()?.partner_id
  const list = useLive(['people', 'person_facts'], async () => upcomingOccasions(await api.list('people', { archived: 0 }), await api.list('person_facts'), 30), []).data
  if (!list?.length) return null
  return (
    <section className="card p-4">
      <h2 className="mb-3 text-sm font-semibold">Coming up 🎁</h2>
      <ul className="flex flex-col gap-3">
        {list.slice(0, 5).map((o) => {
          const first = o.person.name.split(' ')[0]
          const partner = o.person.id === partnerId
          const open = (): void => navigate(partner ? { name: 'partner' } : { name: 'people', id: o.person.id })
          return (
            <li key={`${o.person.id}-${o.kind}`} className="flex gap-3">
              <button onClick={open} className="shrink-0">
                <Avatar person={o.person} size={34} />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <button onClick={open} className="truncate text-left text-sm hover:text-accent">
                    {o.kind === 'birthday' ? `${first}’s birthday${o.years ? ` (${o.years})` : ''}` : `${partner ? 'Your' : `${first}’s`} anniversary${o.years ? ` · ${o.years} yr` : ''}`}
                  </button>
                  <span className={`ml-auto shrink-0 text-xs ${o.days <= 3 ? 'font-medium text-accent' : 'text-muted'}`}>{whenLabel(o.days)}</span>
                </div>
                {o.ideas.length ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {o.ideas.map((i) => (
                      <span key={i} className="max-w-full truncate rounded-full bg-accent-soft px-2 py-0.5 text-[11px]">
                        {i}
                      </span>
                    ))}
                  </div>
                ) : (
                  <button onClick={open} className="text-[11px] text-muted hover:text-ink">
                    No gift ideas yet — add what they like →
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ---------- Budget warnings ----------

export function BudgetAlerts({ compact = false }: { compact?: boolean }): React.JSX.Element | null {
  const cur = useCurrency()
  const month = localDate(new Date()).slice(0, 7)
  const rows = useLive(
    ['money_entries', 'budgets'],
    async () => {
      const [budgets, entries] = await Promise.all([api.list('budgets'), api.list('money_entries', { kind: 'expense' })])
      return budgets
        .filter((b) => b.monthly > 0)
        .map((b) => {
          const spent = entries.filter((e) => e.category === b.category && e.date.startsWith(month)).reduce((s, e) => s + e.amount, 0)
          return { ...b, spent, share: spent / b.monthly }
        })
        .filter((b) => b.share >= 0.8)
        .sort((a, b) => b.share - a.share)
    },
    [month]
  ).data
  if (!rows?.length) return null
  const today = new Date()
  const daysLeft = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - today.getDate()
  return (
    <div className={`flex flex-col gap-1.5 rounded-lg border px-3 py-2 text-sm ${rows.some((r) => r.share >= 1) ? 'border-danger/40 bg-danger/5' : 'border-amber-500/40 bg-amber-500/5'}`}>
      {rows.map((r) => (
        <button key={r.id} className="flex items-center gap-2 text-left" onClick={() => navigate({ name: 'money' })}>
          <span>{r.share >= 1 ? '🚨' : '⚠️'}</span>
          <span className="min-w-0 flex-1 truncate">
            <strong>{r.category}</strong>{' '}
            {r.share >= 1 ? `over budget by ${money(r.spent - r.monthly, cur)}` : `${Math.round(r.share * 100)}% used — ${money(r.monthly - r.spent, cur)} left`}
            {!compact && ` · ${daysLeft} day${daysLeft === 1 ? '' : 's'} to go this month`}
          </span>
        </button>
      ))}
    </div>
  )
}
