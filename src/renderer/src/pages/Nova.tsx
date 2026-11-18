// Nova: your assistant's own page. Name, brain (Claude model + effort), usage of your Claude plan,
// and the hearing/voice settings. Nova was called Bauer before v0.30.

import { useEffect, useRef, useState } from 'react'
import type { ClaudeStatus, EarsStatus, NovaBrain, NovaEffort, NovaName, Prefs } from '@shared/types'
import { api, useLive } from '@/lib/data'
import { setPrefs, usePrefs } from '@/lib/prefs'
import { navigate } from '@/lib/nav'
import { isPhoneApp } from '@/lib/platform'
import { startBrief } from '@/lib/voice'
import { VoiceCard } from '@/components/VoiceCard'
import { onSpeaking, speak, voiceLevelRef } from '@/lib/voice/speak'
import { NovaOrb } from '@/components/NovaOrb'

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

/** What Nova remembers about you (facts you told it), each with Forget, and a fresh start for the conversation. */
function MemoryCard({ name }: { name: string }): React.JSX.Element {
  const [facts, setFacts] = useState<{ id: string; text: string; at: string }[] | null>(null)
  const [fresh, setFresh] = useState(false)
  useEffect(() => {
    void api.nova
      .facts()
      .then(setFacts)
      .catch(() => setFacts([]))
  }, [])
  return (
    <section className="card rounded-2xl p-5">
      <h2 className="font-semibold">Memory</h2>
      <p className="mt-1 text-[13px] text-muted">
        Things you told {name} to remember. They stay on this PC and go along with each request so {name} can use them. Say “forget …” or press Forget.
      </p>
      <ul className="mt-2 flex flex-col">
        {(facts ?? []).map((f) => (
          <li key={f.id} className="flex items-start gap-2 border-t border-line py-2 text-[13px] first:border-t-0">
            <span className="min-w-0 flex-1">{f.text}</span>
            <button className="text-xs text-muted underline hover:text-ink" onClick={() => void api.nova.forgetFact(f.id).then(setFacts)}>
              Forget
            </button>
          </li>
        ))}
        {facts && !facts.length && <li className="text-sm text-muted">Nothing yet. Try “remember I’m doing chemistry A-level”.</li>}
      </ul>
      <button
        className="mt-3 text-sm underline"
        onClick={() => {
          void api.nova.reset().then(() => {
            setFresh(true)
            setTimeout(() => setFresh(false), 2500)
          })
        }}
      >
        {fresh ? 'Fresh start: the chat so far is forgotten' : 'Start a new conversation'}
      </button>
      <p className="mt-1 text-xs text-muted">{name} remembers what you said in the last 15 minutes (so “move it to six” works); this forgets that too.</p>
    </section>
  )
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

function useMouth(): EarsStatus | null {
  const [s, setS] = useState<EarsStatus | null>(null)
  useEffect(() => {
    let off = (): void => {}
    try {
      void api.mouth.status().then(setS).catch(() => setS(null))
      off = api.mouth.onStatus(setS)
    } catch {
      /* the pad has no Kokoro voice yet */
    }
    return off
  }, [])
  return s
}

const VOICES: { id: string; name: string; hint: string; line: string }[] = [
  { id: 'af_heart', name: 'Heart', hint: 'Warm · US', line: 'Hi! I’m ready when you are.' },
  { id: 'af_nova', name: 'Nova', hint: 'Clear · US', line: 'Hi, I’m Nova. Your next lecture is at nine.' },
  { id: 'af_bella', name: 'Bella', hint: 'Bright · US', line: 'Done! I added that to your tasks.' },
  { id: 'bf_emma', name: 'Emma', hint: 'Calm · UK', line: 'Your revision session starts in ten minutes.' },
  { id: 'bf_isabella', name: 'Isabella', hint: 'Soft · UK', line: 'I’ve moved your gym session to six.' },
  { id: 'bm_george', name: 'George', hint: 'Deep · UK', line: 'Right, three tasks are due tomorrow.' },
  { id: 'bm_daniel', name: 'Daniel', hint: 'Steady · UK', line: 'Your focus timer is running.' },
  { id: 'am_michael', name: 'Michael', hint: 'Even · US', line: 'Got it. I logged forty minutes of chemistry.' },
  { id: 'am_onyx', name: 'Onyx', hint: 'Low · US', line: 'I’m Onyx. What do you need?' }
]

/** Apps on this PC Nova can be allowed to use (Windows process name → name you know). */
const APP_NAMES: Record<string, string> = {
  opera: 'Opera GX',
  chrome: 'Google Chrome',
  msedge: 'Microsoft Edge',
  explorer: 'File Explorer',
  notion: 'Notion',
  obsidian: 'Obsidian',
  excel: 'Excel',
  winword: 'Word',
  powerpnt: 'PowerPoint',
  onenote: 'OneNote',
  outlook: 'Outlook',
  discord: 'Discord',
  spotify: 'Spotify',
  'notepad++': 'Notepad++',
  notepad: 'Notepad',
  studyhall: 'Studyhall'
}

function useEars(): EarsStatus | null {
  const [s, setS] = useState<EarsStatus | null>(null)
  useEffect(() => {
    let off = (): void => {}
    try {
      void api.ears.status().then(setS).catch(() => setS(null))
      off = api.ears.onStatus(setS)
    } catch {
      /* the pad has no new ears yet */
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
  const ears = useEars()
  const mouth = useMouth()
  const [speed, setSpeed] = useState<number | null>(null)
  const [previewing, setPreviewing] = useState<string | null>(null)
  // The orb on this page ripples while a voice preview plays.
  const [talking, setTalking] = useState(false)
  useEffect(() => onSpeaking(setTalking), [])
  const preview = async (id: string, line: string): Promise<void> => {
    setPreviewing(id)
    try {
      await speak(line, id, speed ?? prefs?.novaSpeed ?? 1.05)
    } finally {
      setPreviewing(null)
    }
  }
  const [earsConfirm, setEarsConfirm] = useState(false)
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
  const [connectors, setConnectors] = useState<string[] | null>(null)
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
        <NovaOrb size={phone ? 150 : 200} mode={talking ? 'speaking' : busy || !!claude?.signingIn || !!claude?.downloading ? 'thinking' : 'idle'} level={voiceLevelRef} drift={prefs?.novaDrift !== false} />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-5xl font-semibold leading-none">{name}</h1>
          <p className="mt-2 max-w-[62ch] text-[15px] text-muted">
            Your assistant, built into Studyhall. Hold Ctrl + Alt anywhere and talk, tap Ctrl + Shift to type, or say “Hey {name}”.
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
            <p className="mb-3 text-[13px] text-muted">What you call your assistant. The wake word follows the name (“Hey {name}”), with no extra download.</p>
            <div className="flex flex-wrap gap-2">
              {NAMES.map(({ n, hint }) => (
                <button key={n} className="nova-name" aria-pressed={name === n} onClick={() => save({ novaName: n })}>
                  <b>{n}</b>
                  <span>{hint}</span>
                </button>
              ))}
            </div>
          </section>

          {!phone && ears && (
            <section className="card rounded-2xl p-5">
              <h2 className="flex items-center gap-2 font-semibold">
                Ears <span className="nova-tag free">Free · on this PC</span>
              </h2>
              <p className="mb-3 text-[13px] text-muted">How {name} hears you. Your voice is written down on this PC by Parakeet, a free offline speech model, so it never leaves your computer.</p>
              <Row title="Talk" hint="Hold, speak, let go. Works in any app.">
                <span className="nova-keys">
                  hold <kbd>Ctrl</kbd>+<kbd>Alt</kbd>
                </span>
              </Row>
              <Row title="Follow-up" hint={`After ${name} finishes talking, it keeps listening for about 6 seconds so you can answer straight back (no key or “Hey ${name}”). It never hears itself: it only listens once it has stopped.`}>
                <Seg
                  value={prefs?.novaFollowUp ?? 'asked'}
                  options={[
                    ['off', 'Off'],
                    ['asked', 'When it asks me'],
                    ['always', 'After every reply']
                  ]}
                  onChange={(v) => save({ novaFollowUp: v as Prefs['novaFollowUp'] })}
                />
              </Row>
              <Row title="Draw while you talk" hint="While you hold the talk keys, your mouse draws on the screen: circle or underline what you mean. The marks fade when you let go.">
                <span className="nova-keys">
                  hold <kbd>Ctrl</kbd>+<kbd>Alt</kbd> + drag
                </span>
              </Row>
              <Row title="Type instead" hint="Opens a small box beside your cursor">
                <span className="nova-keys">
                  tap <kbd>Ctrl</kbd>+<kbd>Shift</kbd>
                </span>
              </Row>
              <Row title={`Wake word: “Hey ${name}”`} hint="Listens for the name without pressing anything (switch it on below, under voice settings)">
                <span className="text-xs text-muted">{prefs?.voiceWake ? 'On' : 'Off'}</span>
              </Row>
              <Row
                title="Hearing model"
                hint={ears.installed ? 'Parakeet and the wake-word listener are ready' : `Parakeet (writing down) and the “Hey ${name}” listener: ${ears.sizeMb} MB, downloaded once`}
              >
                {ears.installed ? (
                  earsConfirm ? (
                    <span className="flex items-center gap-2 text-[13px]">
                      Remove them?
                      <button
                        className="nova-quiet danger"
                        onClick={() => {
                          setEarsConfirm(false)
                          void api.ears.remove()
                        }}
                      >
                        Remove
                      </button>
                      <button className="nova-quiet" onClick={() => setEarsConfirm(false)}>
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span className="text-[13px] text-[#7ee2b8]">● Ready</span>
                      <button className="nova-quiet" onClick={() => setEarsConfirm(true)}>
                        Remove
                      </button>
                    </span>
                  )
                ) : ears.downloading ? (
                  <span className="tabular-nums text-[13px] text-muted">Downloading… {Math.round(ears.progress * 100)}%</span>
                ) : (
                  <button className="btn-primary rounded-full px-4 py-1.5 text-sm font-semibold" onClick={() => void api.ears.install()}>
                    Download ({ears.sizeMb} MB)
                  </button>
                )}
              </Row>
              {ears.error && <p className="text-sm text-danger">{ears.error}</p>}
            </section>
          )}

          {!phone && mouth && (
            <section className="card rounded-2xl p-5">
              <h2 className="flex items-center gap-2 font-semibold">
                Voice <span className="nova-tag free">Free · on this PC</span>
              </h2>
              <p className="mb-3 text-[13px] text-muted">How {name} talks back. Kokoro, a free voice model, speaks on this PC, starting while the rest of the answer is still being made.</p>
              <Row title={`${name} talks back`} hint="Off: answers are shown, not spoken">
                <input type="checkbox" checked={prefs?.bauerTalk !== false} onChange={(e) => save({ bauerTalk: e.target.checked })} aria-label="Talks back" />
              </Row>
              {mouth.installed ? (
                <>
                  <div className="grid grid-cols-1 gap-2 py-2 sm:grid-cols-3">
                    {VOICES.map((v) => (
                      <div key={v.id} className="nova-voice" aria-pressed={(prefs?.novaVoice ?? 'af_heart') === v.id}>
                        <button className="nova-play" aria-label={`Hear ${v.name}`} disabled={!!previewing} onClick={() => void preview(v.id, v.line)}>
                          {previewing === v.id ? '…' : '▶'}
                        </button>
                        <button className="min-w-0 flex-1 text-left" onClick={() => save({ novaVoice: v.id })}>
                          <b className="block text-[13px]">{v.name}</b>
                          <span className="block text-[11px] text-muted">{v.hint}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                  <Row title="Speed">
                    <input
                      type="range"
                      min={0.8}
                      max={1.3}
                      step={0.05}
                      value={speed ?? prefs?.novaSpeed ?? 1.05}
                      onChange={(e) => setSpeed(Number(e.target.value))}
                      onPointerUp={() => speed != null && save({ novaSpeed: speed })}
                      onKeyUp={() => speed != null && save({ novaSpeed: speed })}
                      aria-label="Speaking speed"
                    />
                    <span className="w-12 text-right tabular-nums">{(speed ?? prefs?.novaSpeed ?? 1.05).toFixed(2)}×</span>
                  </Row>
                  <Row title="Voice model" hint="Kokoro, ready">
                    <button className="nova-quiet" onClick={() => void api.mouth.remove()}>
                      Remove
                    </button>
                  </Row>
                </>
              ) : (
                <Row title="Voice model" hint={`Kokoro: ${mouth.sizeMb} MB, downloaded once. Until then ${name} uses the voice built into Windows.`}>
                  {mouth.downloading ? (
                    <span className="tabular-nums text-[13px] text-muted">Downloading… {Math.round(mouth.progress * 100)}%</span>
                  ) : (
                    <button className="btn-primary rounded-full px-4 py-1.5 text-sm font-semibold" onClick={() => void api.mouth.install()}>
                      Download ({mouth.sizeMb} MB)
                    </button>
                  )}
                </Row>
              )}
              {mouth.error && <p className="text-sm text-danger">{mouth.error}</p>}
            </section>
          )}

          {!phone && (
            <section className="card rounded-2xl p-5">
              <h2 className="flex items-center gap-2 font-semibold">
                Eyes &amp; pointing <span className="nova-tag">Screenshots go to Claude</span>
              </h2>
              <p className="mb-3 text-[13px] text-muted">
                Ask about the app you’re using: “where’s export?”, “how do I save this as a PDF?”, “what does this button do?”. {name} reads that window’s buttons and text through Windows (the way screen readers do), takes one screenshot of just that window, and puts a ring around the right place. Nothing is looked at unless you ask.
              </p>
              <Row title="Look at my screen" hint="Only for requests about what’s on screen. Needs Claude connected.">
                <Seg
                  value={prefs?.novaEyes ?? 'auto'}
                  options={[
                    ['off', 'Off'],
                    ['auto', 'When I ask']
                  ]}
                  onChange={(v) => save({ novaEyes: v as Prefs['novaEyes'] })}
                />
              </Row>
              <Row title="Teaching something that isn’t on my screen" hint={`When you ask ${name} to explain a topic you’re not reading about, it can open a brief source page beside the cards and underline the key bit there.`}>
                <Seg
                  value={prefs?.novaSource ?? 'source'}
                  options={[
                    ['source', 'Show a source page'],
                    ['none', 'Just explain']
                  ]}
                  onChange={(v) => save({ novaSource: v as Prefs['novaSource'] })}
                />
              </Row>
              <Row title="Walk me through it" hint="Rings step 1, waits for your click there, then shows step 2 (up to 8 steps). Esc stops.">
                <input type="checkbox" checked={prefs?.novaWalk !== false} onChange={(e) => save({ novaWalk: e.target.checked })} aria-label="Walkthroughs" />
              </Row>
              <p className="text-xs text-muted">{name} can’t see apps running as administrator. The ring and {name} itself never appear in screenshots.</p>
            </section>
          )}

          {!phone && (
            <section className="card rounded-2xl p-5">
              <h2 className="flex items-center gap-2 font-semibold">
                Hands <span className="nova-tag">Off until you turn it on</span>
              </h2>
              <p className="mb-3 text-[13px] text-muted">
                Say “click export”, “type my name in the search box”, “turn on dark mode”, or “… for me”, and {name} does it in the app you’re using: pressing buttons, filling in fields, ticking boxes, choosing tabs. It works the controls through Windows, so it never moves your mouse or types with your keyboard. Esc stops it at once.
              </p>
              <Row title="Use my apps">
                <Seg
                  value={prefs?.novaHands ?? 'off'}
                  options={[
                    ['off', 'Off'],
                    ['ask', 'Ask me each time'],
                    ['allowed', 'Allowed apps only']
                  ]}
                  onChange={(v) => save({ novaHands: v as Prefs['novaHands'] })}
                />
              </Row>
              <Row title="Allowed apps" hint="Used without asking when “Allowed apps only” is on. Other apps still ask.">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(prefs?.novaHandsApps ?? []).map((a) => (
                    <span key={a} className="nova-app">
                      {APP_NAMES[a.toLowerCase()] ?? a}
                      <button aria-label={`Remove ${a}`} onClick={() => save({ novaHandsApps: (prefs?.novaHandsApps ?? []).filter((x) => x !== a) })}>
                        ×
                      </button>
                    </span>
                  ))}
                  <select
                    className="nova-app-add"
                    value=""
                    onChange={(e) => e.target.value && save({ novaHandsApps: [...new Set([...(prefs?.novaHandsApps ?? []), e.target.value])] })}
                    aria-label="Add an app"
                  >
                    <option value="">+ Add</option>
                    {Object.entries(APP_NAMES)
                      .filter(([k]) => !(prefs?.novaHandsApps ?? []).some((a) => a.toLowerCase() === k))
                      .map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                  </select>
                </div>
              </Row>
              <p className="text-xs text-muted">
                Always asks first, in every mode: sending, posting, deleting, buying, paying, ordering, installing, submitting forms, signing out. Never types into password fields. Some controls only answer to a real mouse click: {name} rings those for you to click instead.
              </p>
            </section>
          )}

          {!phone && (
            <section className="card rounded-2xl p-5">
              <h2 className="font-semibold">Look</h2>
              <p className="mb-3 text-[13px] text-muted">A JARVIS globe of pixel lights in your blue (from Roamies). It ripples with {name}’s voice, pulses with yours while listening, and a light sweeps round it while it thinks. It never shows up in screenshots or screen recordings.</p>
              <Row title={`Show ${name}`} hint="Ctrl + Alt + N also shows or hides it">
                <input type="checkbox" checked={prefs?.bauerOrb ?? true} onChange={(e) => save({ bauerOrb: e.target.checked })} aria-label="Show the orb" />
              </Row>
              <Row title="Size">
                <Seg
                  value={prefs?.novaOrbSize ?? 'default'}
                  options={[
                    ['small', 'Small'],
                    ['default', 'Default'],
                    ['cursor', 'Follows my cursor']
                  ]}
                  onChange={(v) => save({ novaOrbSize: v as Prefs['novaOrbSize'] })}
                />
              </Row>
              <Row title="Float around my screen" hint="Off: it rests where you drop it. When you drop it somewhere, it stays there for a few minutes either way; it comes over when you talk.">
                <input type="checkbox" checked={prefs?.novaDrift !== false} onChange={(e) => save({ novaDrift: e.target.checked })} aria-label="Float around my screen" />
              </Row>
              <p className="text-xs text-muted">Drag it to move it (or fling it); click it to talk; right-click it for Hide. In “follows my cursor” size it shrinks to a little HUD ring beside your mouse.</p>
            </section>
          )}

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

          {!phone && (
            <section className="card rounded-2xl p-5">
              <h2 className="flex items-center gap-2 font-semibold">
                Claude extras <span className="nova-tag">Off unless you switch them on</span>
              </h2>
              <Row
                title="Let Nova use my Claude connectors"
                hint={`For “draft a document about…” only: ${name} may use the apps linked to your Claude account (like Claude Docs) and asks before every action. All other requests never see your connectors.`}
              >
                <input type="checkbox" checked={!!prefs?.novaConnectors} onChange={(e) => save({ novaConnectors: e.target.checked })} aria-label="Let Nova use my Claude connectors" />
              </Row>
              {prefs?.novaConnectors && (
                <div className="pb-2 text-xs text-muted">
                  {connectors === null ? (
                    <button className="underline" onClick={() => void api.claude.connectors().then(setConnectors).catch(() => setConnectors([]))}>
                      Show which connectors my account has
                    </button>
                  ) : connectors.length ? (
                    <>Your connectors: {connectors.join(', ')}</>
                  ) : (
                    <>No connectors found on your Claude account.</>
                  )}
                </div>
              )}
              <Row title="Share usage statistics and crash reports with Anthropic" hint="Lets Claude Code send Anthropic the usage statistics and crash reports it normally sends, to help improve it. Changes nothing about how Nova works.">
                <input type="checkbox" checked={!!prefs?.novaShareStats} onChange={(e) => save({ novaShareStats: e.target.checked })} aria-label="Share usage statistics" />
              </Row>
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
          {!phone && <MemoryCard name={name} />}
          <section className="card rounded-2xl p-5">
            <h2 className="font-semibold">Try saying</h2>
            <ul className="nova-try mt-2 flex flex-col gap-1.5 text-[13px] text-muted">
              <li>“Add revise thermodynamics to my tasks for Thursday”</li>
              <li>“Move my gym session to six”</li>
              <li>“Explain integration by parts”</li>
              <li>“Where’s the export button?”</li>
              <li>“Walk me through making a chart in Excel”</li>
              <li>“Click save for me” (with Hands on)</li>
              <li>“Draft a revision plan for chemistry in Claude Docs” (with connectors on)</li>
              <li>“I’ll email Sam the notes tomorrow morning” (a promise: it reminds you)</li>
              <li>“Remember I’m doing chemistry A-level” · “Forget that”</li>
              <li>Tap Ctrl + Shift to type to {name} beside your cursor</li>
              <li>“Teach me week 3 PNS from my notes” · “Quiz me on my pharm week 2 file”</li>
              <li>“Pull up a YouTube video on how beta blockers work” · “Play some study music”</li>
              <li>Hold Ctrl + Alt, circle something on screen and ask “what’s this?” (or Ctrl + Alt + B, then circle)</li>
              <li>Highlight text anywhere and say “explain this”</li>
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
