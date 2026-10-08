// Life → Money: a simple student budget. Log spending and income in seconds, set a
// monthly budget per category, see where it goes, and save towards goals.

import { useMemo, useState } from 'react'
import type { Budget, MoneyEntry, SavingsGoal } from '@shared/types'
import { AutoNumber, AutoText } from '@/components/AutoField'
import { Icon } from '@/components/ui'
import { api, db, notifyChanged, track, useLive } from '@/lib/data'
import { localDate } from '@/lib/dates'
import { useProfile } from '@/lib/profile'

export const EXPENSE_CATS = [
  { id: 'Food & drink', icon: '🍔' },
  { id: 'Groceries', icon: '🛒' },
  { id: 'Transport', icon: '🚌' },
  { id: 'Rent', icon: '🏠' },
  { id: 'Bills', icon: '💡' },
  { id: 'Subscriptions', icon: '🔁' },
  { id: 'Fun', icon: '🎉' },
  { id: 'Shopping', icon: '🛍️' },
  { id: 'Study', icon: '📚' },
  { id: 'Health', icon: '💊' },
  { id: 'Gifts', icon: '🎁' },
  { id: 'Other', icon: '•' }
]
const INCOME_CATS = [
  { id: 'Job', icon: '💼' },
  { id: 'Student loan', icon: '🎓' },
  { id: 'Allowance', icon: '👪' },
  { id: 'Gift', icon: '🎁' },
  { id: 'Other income', icon: '•' }
]
const CURRENCIES = ['GBP', 'EUR', 'USD', 'CAD', 'AUD', 'NZD', 'SGD', 'HKD', 'MYR', 'INR', 'JPY', 'CNY', 'KRW', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'ZAR', 'NGN', 'AED', 'BRL', 'MXN']

/** Currency from Settings, or a guess from the system region. */
export function useCurrency(): string {
  const p = useProfile()
  if (p?.currency) return p.currency
  const region = (navigator.language.split('-')[1] ?? '').toUpperCase()
  const guess: Record<string, string> = { GB: 'GBP', US: 'USD', CA: 'CAD', AU: 'AUD', NZ: 'NZD', SG: 'SGD', HK: 'HKD', MY: 'MYR', IN: 'INR', JP: 'JPY', CN: 'CNY', KR: 'KRW', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', ZA: 'ZAR', NG: 'NGN', AE: 'AED', BR: 'BRL', MX: 'MXN', IE: 'EUR', DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR', PT: 'EUR', FI: 'EUR' }
  return guess[region] ?? 'GBP'
}

export const money = (n: number, currency: string): string => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2 }).format(n)
  } catch {
    return `${n.toFixed(2)} ${currency}`
  }
}

const catIcon = (c: string): string => [...EXPENSE_CATS, ...INCOME_CATS].find((x) => x.id === c)?.icon ?? '•'

export function MoneyPage(): React.JSX.Element {
  const cur = useCurrency()
  const today = localDate(new Date())
  const [month, setMonth] = useState(today.slice(0, 7))
  const { data } = useLive(
    ['money_entries', 'budgets', 'savings_goals'],
    async () => {
      const [entries, budgets, goals] = await Promise.all([api.list('money_entries', {}, 'date'), api.list('budgets'), api.list('savings_goals', {}, 'sort')])
      return { entries, budgets, goals }
    },
    []
  )
  const [kind, setKind] = useState<'expense' | 'income'>('expense')
  const [amount, setAmount] = useState('')
  const [cat, setCat] = useState('Food & drink')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(today)

  const m = useMemo(() => {
    const list = (data?.entries ?? []).filter((e) => e.date.startsWith(month)).reverse()
    const spent = list.filter((e) => e.kind === 'expense').reduce((s, e) => s + e.amount, 0)
    const income = list.filter((e) => e.kind === 'income').reduce((s, e) => s + e.amount, 0)
    const byCat = new Map<string, number>()
    for (const e of list) if (e.kind === 'expense') byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount)
    return { list, spent, income, byCat }
  }, [data, month])
  if (!data) return <div />

  const budgetFor = (c: string): Budget | undefined => data.budgets.find((b) => b.category === c)
  const totalBudget = data.budgets.reduce((s, b) => s + b.monthly, 0)
  const [y, mo] = month.split('-').map(Number)
  const daysIn = new Date(y, mo, 0).getDate()
  const dayNow = month === today.slice(0, 7) ? Number(today.slice(8)) : daysIn
  const shift = (n: number): void => {
    const d = new Date(y, mo - 1 + n, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const add = async (): Promise<void> => {
    const n = Number(amount.replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) return
    await db.create('money_entries', { date, amount: Math.round(n * 100) / 100, kind, category: cat, note: note.trim() })
    setAmount('')
    setNote('')
  }
  const cats = kind === 'expense' ? EXPENSE_CATS : INCOME_CATS

  return (
    <div className="mx-auto grid max-w-6xl gap-5 p-8 lg:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2">
          <h1 className="mr-2 text-2xl font-semibold tracking-tight">Money</h1>
          <button className="btn-ghost px-1" onClick={() => shift(-1)}>
            <Icon name="back" />
          </button>
          <span className="min-w-32 text-center font-medium">{new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
          <button className="btn-ghost px-1" onClick={() => shift(1)}>
            <Icon name="chevron" />
          </button>
          <div className="flex-1" />
          <select className="field-boxed w-auto text-sm" value={cur} onChange={(e) => void track(api.profile.update({ currency: e.target.value })).then(() => notifyChanged('profiles'))} title="Currency">
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Spent" value={money(m.spent, cur)} hint={`${money(m.spent / Math.max(1, dayNow), cur)} a day`} />
          <Tile label="Income" value={money(m.income, cur)} hint="this month" />
          <Tile label="Left" value={money(m.income - m.spent, cur)} hint={m.income - m.spent >= 0 ? 'income − spending' : 'spending more than income'} tone={m.income - m.spent < 0 ? 'text-danger' : ''} />
          <Tile
            label="Budget"
            value={totalBudget ? `${Math.round((m.spent / totalBudget) * 100)}%` : '—'}
            hint={totalBudget ? `of ${money(totalBudget, cur)} · ${Math.round((dayNow / daysIn) * 100)}% of month gone` : 'set budgets on the right'}
            tone={totalBudget && m.spent / totalBudget > dayNow / daysIn + 0.1 ? 'text-danger' : ''}
          />
        </div>

        <section className="card flex flex-col gap-3 p-5">
          <div className="flex gap-1 self-start rounded-lg bg-line/50 p-0.5 text-sm">
            {(['expense', 'income'] as const).map((k) => (
              <button
                key={k}
                onClick={() => {
                  setKind(k)
                  setCat(k === 'expense' ? 'Food & drink' : 'Job')
                }}
                className={`rounded-md px-3 py-1 ${kind === k ? 'bg-panel font-medium shadow-sm' : 'text-muted'}`}
              >
                {k === 'expense' ? 'Spent' : 'Received'}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {cats.map((c) => (
              <button key={c.id} onClick={() => setCat(c.id)} className={`rounded-full border px-2.5 py-1 text-xs ${cat === c.id ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-ink'}`}>
                {c.icon} {c.id}
              </button>
            ))}
          </div>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void add()
            }}
          >
            <input className="field-boxed w-28 text-lg font-semibold" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" autoFocus />
            <input className="field-boxed min-w-32 flex-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What for? (optional)" />
            <input type="date" className="field-boxed w-auto" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} />
            <button className="btn-primary" disabled={!(Number(amount.replace(',', '.')) > 0)}>
              Add
            </button>
          </form>
        </section>

        <section className="card">
          {m.list.length === 0 ? (
            <div className="p-5 text-sm text-muted">Nothing logged this month.</div>
          ) : (
            <ul className="divide-y divide-line">
              {m.list.map((e) => (
                <EntryRow key={e.id} e={e} cur={cur} />
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="flex flex-col gap-5">
        <section className="card p-5">
          <h2 className="mb-1 text-sm font-semibold">Where it went</h2>
          <p className="mb-3 text-xs text-muted">Click a budget to set a monthly limit.</p>
          <div className="flex flex-col gap-2.5 text-sm">
            {EXPENSE_CATS.filter((c) => m.byCat.get(c.id) || budgetFor(c.id)).map((c) => {
              const spent = m.byCat.get(c.id) ?? 0
              const b = budgetFor(c.id)
              const k = b?.monthly ? spent / b.monthly : null
              return (
                <div key={c.id}>
                  <div className="mb-1 flex items-center gap-2">
                    <span>{c.icon}</span>
                    <span className="flex-1">{c.id}</span>
                    <span className={k != null && k > 1 ? 'font-medium text-danger' : ''}>{money(spent, cur)}</span>
                    <span className="text-xs text-muted">/</span>
                    <AutoNumber
                      value={b?.monthly ?? null}
                      onSave={(v) => (b ? (v ? db.update('budgets', b.id, { monthly: v }) : db.remove('budgets', b.id)) : v ? db.create('budgets', { category: c.id, monthly: v }) : undefined)}
                      className="field w-16 text-right text-xs"
                      placeholder="limit"
                      min={0}
                    />
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-line">
                    <div className={`h-full rounded-full ${k != null && k > 1 ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${Math.min(100, (k ?? spent / Math.max(1, m.spent)) * 100)}%` }} />
                  </div>
                </div>
              )
            })}
            {m.byCat.size === 0 && !data.budgets.length && <p className="text-xs text-muted">Log some spending to see the breakdown.</p>}
            <details className="text-xs text-muted">
              <summary className="cursor-pointer">Set a budget for another category</summary>
              <div className="mt-2 flex flex-wrap gap-1">
                {EXPENSE_CATS.filter((c) => !budgetFor(c.id)).map((c) => (
                  <button key={c.id} className="rounded-full border border-line px-2 py-0.5 hover:text-ink" onClick={() => void db.create('budgets', { category: c.id, monthly: 50 })}>
                    {c.icon} {c.id}
                  </button>
                ))}
              </div>
            </details>
          </div>
        </section>
        <Goals goals={data.goals} cur={cur} />
      </div>
    </div>
  )
}

function Tile({ label, value, hint, tone = '' }: { label: string; value: string; hint: string; tone?: string }): React.JSX.Element {
  return (
    <div className="card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${tone}`}>{value}</div>
      <div className="text-[11px] text-muted">{hint}</div>
    </div>
  )
}

function EntryRow({ e, cur }: { e: MoneyEntry; cur: string }): React.JSX.Element {
  return (
    <li className="group flex items-center gap-3 px-4 py-2.5 text-sm">
      <span className="w-6 text-center">{catIcon(e.category)}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate">{e.note || e.category}</div>
        <div className="text-xs text-muted">
          {e.note ? `${e.category} · ` : ''}
          {new Date(e.date + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
        </div>
      </div>
      <span className={`font-medium tabular-nums ${e.kind === 'income' ? 'text-ok' : ''}`}>
        {e.kind === 'income' ? '+' : '−'}
        {money(e.amount, cur)}
      </span>
      <button className="btn-ghost invisible px-1 group-hover:visible" onClick={() => void db.remove('money_entries', e.id)} title="Delete">
        <Icon name="trash" size={13} />
      </button>
    </li>
  )
}

function Goals({ goals, cur }: { goals: SavingsGoal[]; cur: string }): React.JSX.Element {
  return (
    <section className="card flex flex-col gap-3 p-5">
      <div className="flex items-center">
        <h2 className="flex-1 text-sm font-semibold">Savings goals</h2>
        <button className="btn-ghost px-1" title="New goal" onClick={() => void db.create('savings_goals', { name: 'New goal', target: 200, sort: goals.length })}>
          <Icon name="plus" />
        </button>
      </div>
      {goals.length === 0 && <p className="text-xs text-muted">A trip, a laptop, an emergency fund… add one with +.</p>}
      {goals.map((g) => {
        const k = g.target ? Math.min(1, g.saved / g.target) : 0
        const save = (p: Partial<SavingsGoal>): Promise<SavingsGoal> => db.update('savings_goals', g.id, p)
        return (
          <div key={g.id} className="group flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-sm">
              <AutoText value={g.name} onSave={(v) => save({ name: v.trim() || 'Goal' })} className="field flex-1 font-medium" />
              <button className="btn-ghost invisible px-1 group-hover:visible" onClick={() => confirm(`Delete “${g.name}”?`) && void db.remove('savings_goals', g.id)}>
                <Icon name="trash" size={13} />
              </button>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-ok transition-all" style={{ width: `${k * 100}%` }} />
            </div>
            <div className="flex flex-wrap items-center gap-1 text-xs text-muted">
              <span className="font-medium text-ink">{money(g.saved, cur)}</span> of
              <AutoNumber value={g.target} onSave={(v) => save({ target: Math.max(1, v ?? 1) })} className="field w-20 text-xs" min={1} />
              <span>{k >= 1 ? '🎉' : `${Math.round(k * 100)}%`}</span>
              <div className="flex-1" />
              {[10, 50].map((n) => (
                <button key={n} className="btn px-1.5 py-0 text-xs" onClick={() => void save({ saved: Math.round((g.saved + n) * 100) / 100 })}>
                  +{n}
                </button>
              ))}
              <input
                className="field-boxed w-12 px-1 py-0 text-xs"
                inputMode="decimal"
                placeholder="± …"
                title="Type an amount and press Enter (minus to take money out)"
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  const n = Number(e.currentTarget.value.replace(',', '.'))
                  if (Number.isFinite(n) && n !== 0) void save({ saved: Math.max(0, Math.round((g.saved + n) * 100) / 100) })
                  e.currentTarget.value = ''
                }}
              />
            </div>
          </div>
        )
      })}
    </section>
  )
}
