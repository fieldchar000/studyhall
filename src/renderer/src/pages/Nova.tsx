// Nova: your assistant's own page. Name, brain (Claude model + effort), usage of your Claude plan,
// and the hearing/voice settings. Nova was called Bauer before v0.30.

import { useEffect, useRef, useState } from 'react'
import type { ClaudeStatus, NovaBrain, NovaEffort, NovaName, Prefs } from '@shared/types'
import { api, useLive } from '@/lib/data'
import { setPrefs, usePrefs } from '@/lib/prefs'
import { navigate } from '@/lib/nav'
import { isPhoneApp } from '@/lib/platform'
import { startBrief } from '@/lib/voice'
import { VoiceCard } from '@/components/VoiceCard'

const NAMES: { n: NovaName; hint: string }[] = [
  { n: 'Nova', hint: 'Default · clear, 2 syllables' },
  { n: 'Atlas', hint: 'Rare in normal speech' },
  { n: 'Onyx', hint: 'Short and sharp' },
  { n: 'Bauer', hint: 'Can mishear “power”' }
]
const MODELS: { m: NovaBrain; label: string; hint: string }[] = [
  { m: 'auto', label: 'Auto', hint: 'Picks per request' },
  { m: 'haiku', label: 'Haiku', hint: 'Fastest, lightest' },
  { m: 'sonnet', label: 'Sonnet', hint: 'Smarter, a bit slower' },
  { m: 'opus', label: 'Opus', hint: 'Hardest questions' }
]
const AUTO_TABLE: [string, string][] = [
  ['Quick jobs: add a task, move a lecture, log a habit', 'Haiku · low'],
  ['Questions and chat', 'Haiku · medium'],
  ['Explain cards', 'Sonnet · medium'],
  ['Circle-to-ask on your screen', 'Sonnet · medium']
]

// ---------- usage estimate: Claude's API prices × a typical day of requests ----------
const PRICE = { haiku: [0.1, 0.01, 0.5], sonnet: [2, 0.1, 10], opus: [4, 0.2, 20] } as const // $ per million tokens: input, cached input, output
const THINK = { low: 150, medium: 700, high: 2200 }
type ModelKey = keyof typeof PRICE
const callCost = (m: ModelKey, e: NovaEffort, screen = false): number => {
  const [pi, pc, po] = PRICE[m]
  return ((1200 + (screen ? 1600 : 0)) * pi + 5000 * pc + (250 + THINK[e] + (screen ? 300 : 0)) * po) / 1e6
}
function dayCost(m: NovaBrain, e: NovaEffort, perDay: number): number {
  const pick = (kind: 'quick' | 'q' | 'screen' | 'app'): [ModelKey, NovaEffort] =>
    m === 'auto' ? ({ quick: ['haiku', 'low'], q: ['haiku', 'medium'], screen: ['sonnet', 'medium'], app: ['sonnet', 'medium'] } as const)[kind] as [ModelKey, NovaEffort] : [m, e]
  const c = (k: 'quick' | 'q' | 'screen' | 'app', s = false): number => callCost(...pick(k), s)
  return perDay * (0.6 * c('quick') + 0.25 * c('q') + 0.125 * c('screen', true) + 0.025 * 5 * c('app', true))
}
const PLANS = [
  { key: 'pro', label: 'Pro', usd: 20 },
  { key: 'max5', label: 'Max 5×', usd: 100 },
  { key: 'max20', label: 'Max 20×', usd: 200 }
]

function Seg<T extends string>({ value, options, onChange, disabled }: { value: T; options: [T, string][]; onChange: (v: T) => void; disabled?: boolean }): React.JSX.Element {
  return (
    <div className="nova-seg">
      {options.map(([v, label]) => (
        <button key={v} disabled={disabled} aria-pressed={value === v} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  )
}

function Row({ title, hint, children }: { title: React.ReactNode; hint?: React.ReactNode; children?: React.ReactNode }): React.JSX.Element {
  return (
    <div className="nova-row">
      <div className="min-w-[180px] flex-1">
        <div className="text-[13.5px] font-medium">{title}</div>
        {hint && <div className="text-xs text-muted">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

/** How much of this week Nova may still use, and what happens when the plan runs out. Changes with the switch. */
function RoomLeft({ name, usage, cap, noExtra }: { name: string; usage: ClaudeStatus['usage']; cap: number; noExtra: boolean }): React.JSX.Element {
  const week = usage?.sevenDay ?? null
  const five = usage?.fiveHour ?? null
  const used = Math.min(100, week ?? 0)
  const room = Math.max(0, cap - used)
  return (
    <div className={`nova-room ${noExtra ? '' : 'warn'}`}>
      <div className="nova-room-bar" role="img" aria-label={week == null ? 'Usage not known yet' : `${Math.round(used)}% of this week used, ${Math.round(room)}% left for ${name}`}>
        <i className="used" style={{ width: `${used}%` }} />
        {room > 0 && <i className="room" style={{ left: `${used}%`, width: `${room}%` }} />}
        <em style={{ left: `${cap}%` }} />
        {!noExtra && <i className="extra" />}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>0%</span>
        <span>{noExtra ? 'your plan ends at 100%' : '100%, then paid extra →'}</span>
      </div>
      {week == null ? (
        <p className="text-[13px] text-muted">The bar fills in after {name}’s first answer (or press Refresh).</p>
      ) : room > 0 ? (
        <p className="text-[13px]">
          <b>{name} can use about {Math.round(room)}% more of this week</b> before it pauses at {cap}%.{resetIn(usage?.sevenDayResets) && ` The week ${resetIn(usage?.sevenDayResets)}.`}
        </p>
      ) : (
        <p className="text-[13px]">
          <b>{name} is paused for Claude this week</b> ({Math.round(used)}% used, your cap is {cap}%). It uses the offline brain until the week {resetIn(usage?.sevenDayResets) || 'resets'}.
        </p>
      )}
      {five != null && (
        <p className="text-xs text-muted">
          This 5-hour window: {Math.round(five)}% used{five >= 100 ? `, so ${name} waits until it ${resetIn(usage?.fiveHourResets) || 'resets'}` : ''}.
        </p>
      )}
      {noExtra ? (
        <p className="text-xs text-muted">If your plan runs out completely, {name} stops using Claude and switches to the offline brain. It never adds charges.</p>
      ) : (
        <p className="nova-warn-text text-[13px]">
          Paid extra usage is allowed. Once your plan runs out, {name} keeps going on extra usage, which costs money.{' '}
          {cap < 100 ? `Your ${cap}% cap still pauses ${name} first; set it to 100% to let it run into paid usage.` : 'Your cap is 100%, so nothing stops it before paid usage.'}
        </p>
      )}
    </div>
  )
}

/** The orb: a hollow sphere of fine blue strands with three orbits. Ripples while `busy`. */
export function NovaOrb({ size = 200, busy = false }: { size?: number; busy?: boolean }): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const busyRef = useRef(busy)
  busyRef.current = busy
  useEffect(() => {
    const c = ref.current!
    const x = c.getContext('2d')!
    const d = Math.min(devicePixelRatio || 1, 2)
    c.width = size * d
    c.height = size * d
    x.setTransform(d, 0, 0, d, 0, 0)
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    let amp = 0
    let raf = 0
    const draw = (t: number): void => {
      const cx = size / 2, R = size * 0.3
      amp += ((busyRef.current ? 0.6 + 0.4 * Math.abs(Math.sin(t * 0.013)) : 0) - amp) * 0.2
      x.clearRect(0, 0, size, size)
      x.globalCompositeOperation = 'lighter'
      const g = x.createRadialGradient(cx, cx, 0, cx, cx, R * 0.32)
      g.addColorStop(0, 'rgba(225,236,255,.95)')
      g.addColorStop(0.35, 'rgba(110,160,255,.35)')
      g.addColorStop(1, 'rgba(60,110,240,0)')
      x.fillStyle = g
      x.beginPath()
      x.arc(cx, cx, R * 0.32, 0, 6.283)
      x.fill()
      x.lineWidth = 0.8
      const spin = t * 0.00035
      for (let i = 0; i < 16; i++) {
        const a = spin + (i / 16) * Math.PI, wob = 1 + amp * 0.08 * Math.sin(t * 0.01 + i)
        x.strokeStyle = `rgba(${110 + i * 4},${150 + i * 3},255,${0.12 + 0.22 * Math.abs(Math.sin(a))})`
        x.beginPath()
        x.ellipse(cx, cx, Math.max(0.5, Math.abs(Math.cos(a)) * R * wob), R * wob, 0, 0, 6.283)
        x.stroke()
      }
      for (let k = 0; k < 3; k++) {
        const a = t * 0.0012 * (k % 2 ? -1 : 1) + k
        x.save()
        x.translate(cx, cx)
        x.rotate(k * 2.094 + 0.4)
        x.strokeStyle = 'rgba(168,200,255,.45)'
        x.lineWidth = 1
        x.beginPath()
        x.ellipse(0, 0, R * 1.18, R * 0.38, 0, 0, 6.283)
        x.stroke()
        x.fillStyle = '#e6efff'
        x.beginPath()
        x.arc(Math.cos(a) * R * 1.18, Math.sin(a) * R * 0.38, 2.2, 0, 6.283)
        x.fill()
        x.restore()
      }
      for (let j = 0; j < 3 && amp > 0.03; j++) {
        const p = (t * 0.0011 + j / 3) % 1
        x.strokeStyle = `rgba(140,185,255,${(1 - p) * 0.55 * amp})`
        x.lineWidth = 1.2
        x.beginPath()
        x.arc(cx, cx, R * (1.05 + p * 0.55), 0, 6.283)
        x.stroke()
      }
      x.globalCompositeOperation = 'source-over'
      if (!reduce && !document.hidden) raf = requestAnimationFrame(draw)
      else if (!reduce) raf = window.setTimeout(() => (raf = requestAnimationFrame(draw)), 500) as unknown as number
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(raf)
    }
  }, [size])
  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden="true" />
}

function useClaude(): ClaudeStatus | null {
  const [s, setS] = useState<ClaudeStatus | null>(null)
  useEffect(() => {
    let off = (): void => {}
    try {
      void api.claude.status().then(setS).catch(() => setS(null))
      off = api.claude.onStatus(setS)
    } catch {
      /* the pad has no Claude connection */
    }
    return off
  }, [])
  return s
}

const pct = (n: number | null | undefined): string => (n == null ? '–' : `${Math.round(n)}%`)
const resetIn = (iso: string | null | undefined): string => {
  if (!iso) return ''
  const ms = Date.parse(iso) - Date.now()
  if (!(ms > 0)) return ''
  const h = Math.round(ms / 36e5)
  return h < 1 ? 'resets within the hour' : h < 48 ? `resets in ${h} h` : `resets in ${Math.round(h / 24)} days`
}

export function NovaPage(): React.JSX.Element {
  const phone = isPhoneApp()
  const prefs = usePrefs()
  const claude = useClaude()
  const name = prefs?.novaName ?? 'Nova'
  const brain = prefs?.novaBrain ?? 'auto'
  const effort = prefs?.novaEffort ?? 'medium'
  const save = (patch: Partial<Prefs>): void => void setPrefs(patch)
  const [perDay, setPerDay] = useState(40)
  const [plan, setPlan] = useState<string | null>(null)
  const planKey = plan ?? (claude?.plan === 'max' ? 'max5' : 'pro')
  const planUsd = PLANS.find((p) => p.key === planKey)?.usd ?? 20
  const [busy, setBusy] = useState(false)
  const [cap, setCap] = useState<number | null>(null)
  const [confirm, setConfirm] = useState<'disconnect' | 'remove' | null>(null)
  const { data: log } = useLive(['bauer_log'], async () => (await api.list('bauer_log', {})).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5), [])

  // Fresh usage numbers when the page opens.
  useEffect(() => {
    if (claude?.signedIn) void api.claude.refreshUsage().catch(() => {})
  }, [claude?.signedIn])

  const connect = async (): Promise<void> => {
    setBusy(true)
    try {
      await api.claude.signIn()
    } finally {
      setBusy(false)
    }
  }

  const status = !claude
    ? null
    : claude.downloading
      ? `Downloading Claude Code… ${Math.round(claude.progress * 100)}%`
      : claude.signingIn
        ? 'Finish signing in on the page that opened in your browser'
        : claude.signedIn
          ? claude.paused
            ? `Paused: ${claude.paused}`
            : `Connected to Claude${claude.plan ? ` (${claude.plan[0].toUpperCase()}${claude.plan.slice(1)})` : ''}`
          : 'Not connected to Claude'
  const capNow = cap ?? prefs?.novaCap ?? 80

  return (
    <div className="nova-page mx-auto max-w-[1180px] px-6 pb-16 pt-2">
      <section className="flex flex-wrap items-center gap-6 py-4">
        <NovaOrb size={phone ? 150 : 200} busy={busy || !!claude?.signingIn || !!claude?.downloading} />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-5xl font-semibold leading-none">{name}</h1>
          <p className="mt-2 max-w-[62ch] text-[15px] text-muted">
            Your assistant, built into Studyhall. Talk with “Hey Bauer” or the Brief button for now; holding Ctrl + Alt to talk, “Hey {name}”, the new voice and the new orb arrive in the next updates.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-[12.5px]">
            {status && (
              <span className="nova-chip">
                <span className={`nova-led ${claude?.signedIn && !claude.paused ? 'on' : ''}`} />
                {status}
              </span>
            )}
            <span className="nova-chip">
              Brain <b>{brain === 'auto' ? 'Auto' : `${brain[0].toUpperCase()}${brain.slice(1)} · ${effort}`}</b>
            </span>
            {claude?.last && (
              <span className="nova-chip">
                Last answer <b>{(claude.last.ms / 1000).toFixed(1)} s</b> on {claude.last.model} · {claude.last.effort}
              </span>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {!phone && claude && !claude.signedIn && (
              <button className="btn-primary rounded-full px-4 py-2 text-sm font-semibold" disabled={busy || claude.downloading || claude.signingIn} onClick={() => void connect()}>
                {claude.installed ? 'Connect Claude' : `Connect Claude (downloads ${claude.sizeMb} MB once)`}
              </button>
            )}
            {!phone && (
              <button className="glass rounded-full px-4 py-2 text-sm font-semibold" onClick={() => void startBrief()}>
                Talk to {name}
              </button>
            )}
            {!phone && (
              <button className="glass rounded-full px-4 py-2 text-sm font-semibold" onClick={() => save({ bauerOrb: !(prefs?.bauerOrb ?? true) })}>
                {(prefs?.bauerOrb ?? true) ? `Hide ${name}` : `Show ${name}`}
              </button>
            )}
          </div>
          {claude?.error && <p className="mt-2 text-sm text-danger">{claude.error}</p>}
          {!phone && claude?.installed && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
              {confirm === null && (
                <>
                  {claude.signedIn && (
                    <button className="nova-quiet" onClick={() => setConfirm('disconnect')}>
                      Disconnect Claude
                    </button>
                  )}
                  <button className="nova-quiet" onClick={() => setConfirm('remove')}>
                    Remove Claude from Studyhall
                  </button>
                </>
              )}
              {confirm && (
                <div className="nova-confirm">
                  <span>
                    {confirm === 'disconnect'
                      ? `Sign Studyhall out of Claude? ${name} uses the offline brain until you connect again.`
                      : `Sign out and delete Claude Code (${claude.sizeMb} MB) and everything it stored from this PC?`}
                  </span>
                  <button
                    className="nova-quiet danger"
                    onClick={() => {
                      const which = confirm
                      setConfirm(null)
                      void (which === 'disconnect' ? api.claude.signOut() : api.claude.remove())
                    }}
                  >
                    {confirm === 'disconnect' ? 'Disconnect' : 'Remove'}
                  </button>
                  <button className="nova-quiet" onClick={() => setConfirm(null)}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
          {!phone && claude && !claude.signedIn && (
            <p className="mt-2 max-w-[70ch] text-xs text-muted">
              Connecting downloads Anthropic’s own Claude Code program and opens Claude’s sign-in page in your browser. You sign in there, so Studyhall never sees your password. Until you connect, {name} uses the model on this PC.
            </p>
          )}
          {phone && <p className="mt-2 text-xs text-muted">Claude runs from the PC app. On the pad, {name} uses the offline rules for now.</p>}
        </div>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="card rounded-2xl p-5">
            <h2 className="font-semibold">Name</h2>
            <p className="mb-3 text-[13px] text-muted">What you call your assistant. From the next update the wake word follows the name (“Hey {name}”), with no download.</p>
            <div className="flex flex-wrap gap-2">
              {NAMES.map(({ n, hint }) => (
                <button key={n} className="nova-name" aria-pressed={name === n} onClick={() => save({ novaName: n })}>
                  <b>{n}</b>
                  <span>{hint}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="card rounded-2xl p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              Brain <span className="nova-tag">Your Claude plan</span>
            </h2>
            <p className="mb-3 text-[13px] text-muted">Which Claude model thinks, and how hard. Higher effort is smarter but slower and uses more of your plan.</p>
            <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {MODELS.map(({ m, label, hint }) => (
                <button key={m} className="nova-model" aria-pressed={brain === m} onClick={() => save({ novaBrain: m })}>
                  <b>{label}</b>
                  <span>{hint}</span>
                </button>
              ))}
            </div>
            <Row title="Effort" hint={brain === 'auto' ? 'Auto chooses the effort too' : 'Low = quickest replies, High = most careful'}>
              <Seg<NovaEffort> value={effort} disabled={brain === 'auto'} options={[['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]} onChange={(v) => save({ novaEffort: v })} />
            </Row>
            {brain === 'auto' && (
              <table className="nova-table">
                <tbody>
                  {AUTO_TABLE.map(([what, pick]) => (
                    <tr key={what}>
                      <td>{what}</td>
                      <td className="text-right text-ink">{pick}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <Row title="Offline backup" hint="Use the model on this PC when Claude isn’t connected, there’s no internet, or Claude is paused (slower)">
              <input type="checkbox" checked={prefs?.novaOffline ?? true} onChange={(e) => save({ novaOffline: e.target.checked })} aria-label="Offline backup" />
            </Row>
          </section>

          {!phone && (
            <section className="card rounded-2xl p-5">
              <h2 className="flex items-center gap-2 font-semibold">
                Usage <span className="nova-tag">Your Claude plan</span>
              </h2>
              <p className="mb-3 text-[13px] text-muted">Your plan’s real usage, as Claude reports it (this includes your own chats with Claude, not just {name}).</p>
              {claude?.signedIn ? (
                <div className="flex flex-col gap-3">
                  {(
                    [
                      ['This 5-hour window', claude.usage?.fiveHour, claude.usage?.fiveHourResets],
                      ['This week', claude.usage?.sevenDay, claude.usage?.sevenDayResets]
                    ] as const
                  ).map(([label, v, r]) => (
                    <div key={label}>
                      <div className="mb-1 flex justify-between text-[13px]">
                        <span>{label}</span>
                        <span className="tabular-nums text-muted">
                          {pct(v)} {resetIn(r) && `· ${resetIn(r)}`}
                        </span>
                      </div>
                      <div className="nova-meter">
                        <i style={{ width: `${Math.min(100, v ?? 0)}%` }} />
                        {label === 'This week' && <em style={{ left: `${capNow}%` }} />}
                      </div>
                    </div>
                  ))}
                  <div className="text-xs text-muted">
                    {name} this month: about ${(claude.monthCostUsd ?? 0).toFixed(2)} at Claude’s API prices (a guide to how heavy it is; your plan covers it).{' '}
                    <button className="underline" onClick={() => void api.claude.refreshUsage()}>
                      Refresh
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted">Connect Claude to see your plan’s usage here.</p>
              )}
              <Row title="Never use paid extra usage" hint={`Your Claude account has extra usage switched on. With this on, ${name} stays inside your plan.`}>
                <input type="checkbox" checked={prefs?.novaNoExtra ?? true} onChange={(e) => save({ novaNoExtra: e.target.checked })} aria-label="Never use paid extra usage" />
              </Row>
              <Row title={`Pause ${name} at`} hint="When your weekly Claude usage reaches this, so you keep plenty for chatting with Claude">
                <input type="range" min={10} max={100} step={5} value={capNow} onChange={(e) => setCap(Number(e.target.value))} onPointerUp={() => save({ novaCap: capNow })} onKeyUp={() => save({ novaCap: capNow })} aria-label="Weekly cap" />
                <span className="w-10 text-right tabular-nums">{capNow}%</span>
              </Row>
              {claude?.signedIn && <RoomLeft name={name} usage={claude.usage} cap={capNow} noExtra={prefs?.novaNoExtra ?? true} />}

              <h3 className="mt-4 text-[13.5px] font-medium">Estimate by brain setting</h3>
              <Row title="Your plan" hint="Pick yours to see the percentages">
                <Seg value={planKey} options={PLANS.map((p) => [p.key, p.label] as [string, string])} onChange={setPlan} />
              </Row>
              <Row title="Requests a day" hint="About 6 in 10 quick jobs, 2–3 questions, 1 about your screen, an app task now and then">
                <input type="range" min={10} max={150} step={5} value={perDay} onChange={(e) => setPerDay(Number(e.target.value))} aria-label="Requests a day" />
                <span className="w-10 text-right tabular-nums">{perDay}</span>
              </Row>
              <div className="overflow-x-auto">
                <table className="nova-table nova-use">
                  <tbody>
                    {(['auto', 'haiku', 'sonnet', 'opus'] as NovaBrain[]).flatMap((m) =>
                      (m === 'auto' ? (['medium'] as NovaEffort[]) : (['low', 'medium', 'high'] as NovaEffort[])).map((e) => {
                        const month = dayCost(m, e, perDay) * 30
                        const p = (month / planUsd) * 100
                        const sel = m === brain && (m === 'auto' || e === effort)
                        return (
                          <tr key={m + e} className={sel ? 'sel' : ''}>
                            <td>{m === 'auto' ? 'Auto' : `${m[0].toUpperCase()}${m.slice(1)} · ${e}`}</td>
                            <td className="w-[45%]">
                              <div className={`nova-bar ${p > 100 ? 'over' : ''}`}>
                                <i style={{ width: `${Math.min(100, Math.max(1, p))}%` }} />
                              </div>
                            </td>
                            <td className="text-right tabular-nums">
                              {p < 1 ? '<1%' : `${Math.round(p)}%`} <span className="text-[11px] text-muted">≈ ${month < 1 ? month.toFixed(2) : month.toFixed(0)}</span>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-muted">Anthropic doesn’t publish exact plan limits, so the estimate uses Claude’s API prices against about $20 (Pro), $100 (Max 5×) or $200 (Max 20×) a month.</p>
            </section>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <section className="card rounded-2xl p-5">
            <h2 className="font-semibold">Recently</h2>
            <ul className="mt-2 flex flex-col">
              {(log ?? []).map((r) => (
                <li key={r.id} className="border-t border-line py-2 text-[13px] first:border-t-0">
                  <div className="text-muted">“{r.said}”</div>
                  <div>{r.reply}</div>
                </li>
              ))}
              {log && !log.length && <li className="text-sm text-muted">Nothing yet. Ask {name} something.</li>}
            </ul>
            <button className="mt-2 text-sm underline" onClick={() => navigate({ name: 'bauer' })}>
              Full log, typing and Undo
            </button>
          </section>
          <section className="card rounded-2xl p-5">
            <h2 className="font-semibold">Coming next</h2>
            <ul className="mt-2 flex flex-col gap-1.5 text-[13px] text-muted">
              <li>
                <b className="text-ink">Ears:</b> hold Ctrl + Alt to talk, “Hey {name}”, and a much more accurate offline hearing model
              </li>
              <li>
                <b className="text-ink">Voice:</b> a natural free voice that runs on this PC
              </li>
              <li>
                <b className="text-ink">Look:</b> the new floating orb
              </li>
              <li>
                <b className="text-ink">Eyes &amp; pointing</b>, then <b className="text-ink">hands</b> (clicking and typing in your apps), then <b className="text-ink">pixel cards</b>
              </li>
            </ul>
          </section>
        </aside>
      </div>

      <div className="mt-4 max-w-[760px]">
        <VoiceCard />
      </div>
    </div>
  )
}
