// Nova's main screen: Nova big in the middle (the neural look, or the globe), a conversation you can type into
// beside it, and a clean briefing: today, what's coming, and the news you watch. Typing here is the same as saying
// it: Nova answers out loud and can draw, as usual. (Lessons, the map and all the settings stay on the Nova page.)
import { useEffect, useMemo, useRef, useState } from 'react'
import type { BauerCard } from '@shared/types'
import { NovaNeural, type NeuralMode } from '@/components/NovaNeural'
import { Icon } from '@/components/ui'
import { api, useLive } from '@/lib/data'
import { navigate } from '@/lib/nav'
import { usePrefs } from '@/lib/prefs'
import { startBrief } from '@/lib/voice'

type Story = Awaited<ReturnType<typeof api.nova.stories>>[number]
type Item = NonNullable<BauerCard['items']>[number]
const STEP_MS = 40 // (the voice envelope's step)

const ACTIONS: { label: string; say: string }[] = [
  { label: 'Status report', say: 'Status report' },
  { label: 'Plan my day', say: 'Plan my day around what is due' },
  { label: 'Quiz me', say: 'Quiz me on what I studied most recently' },
  { label: 'Focus 45 min', say: 'Focus for 45 minutes' },
  { label: 'The week ahead', say: 'What does my week ahead look like?' }
]

/** Nova's state from the floating globe, and how loud it is (its voice while it talks, yours while it listens). */
function useNovaLive(): { mode: NeuralMode; level: { current: number }; line: string } {
  const [state, setState] = useState<{ state: string; text?: string }>({ state: 'idle' })
  const [talking, setTalking] = useState(false)
  const voice = useRef<{ env: number[]; at: number }>({ env: [], at: 0 })
  const mic = useRef({ v: 0, at: 0 })
  const level = useMemo(
    () => ({
      get current(): number {
        const now = performance.now()
        const i = Math.floor((now - voice.current.at) / STEP_MS)
        if (i >= 0 && i < voice.current.env.length) return voice.current.env[i]
        return now - mic.current.at < 400 ? mic.current.v : 0
      }
    }),
    []
  )
  useEffect(() => {
    let off: ReturnType<typeof setTimeout> | undefined
    const a = api.nova.onState((s) => setState(s))
    const b = api.nova.onLevels((l) => {
      if (l.kind === 'voice' && l.env?.length) {
        voice.current = { env: l.env, at: performance.now() }
        setTalking(true)
        clearTimeout(off)
        off = setTimeout(() => setTalking(false), l.env.length * STEP_MS + 600)
      } else if (l.kind === 'mic') mic.current = { v: l.v ?? 0, at: performance.now() }
    })
    return () => {
      a()
      b()
      clearTimeout(off)
    }
  }, [])
  const mode: NeuralMode = talking ? 'talk' : state.state === 'listening' ? 'listen' : state.state === 'thinking' ? 'think' : 'idle'
  return { mode, level, line: state.text ?? '' }
}

export function NovaHomePage(): React.JSX.Element {
  const prefs = usePrefs()
  const name = prefs?.novaName ?? 'Nova'
  const { mode, level, line } = useNovaLive()
  const [today, setToday] = useState<{ say: string; card: BauerCard } | null>(null)
  const [week, setWeek] = useState<{ say: string; card: BauerCard } | null>(null)
  const [stories, setStories] = useState<Story[] | null>(null)
  const [text, setText] = useState('')
  const [sent, setSent] = useState<{ text: string; at: string } | null>(null)
  const chat = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const [big, setBig] = useState(420)
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const fit = (): void => {
      const r = el.getBoundingClientRect()
      // (in steps of 20 px: each new size starts Nova's drawing afresh)
      setBig(Math.max(220, Math.min(460, Math.floor(Math.min(r.width, r.height - 24) / 20) * 20)))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const { data: log } = useLive(['bauer_log'], async () => (await api.list('bauer_log', {})).sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-14), [])

  // The briefing: today (a status report), the week ahead, the news. Fresh when the page opens and every 10 minutes.
  useEffect(() => {
    const load = (): void => {
      void api.nova
        .brief('status')
        .then(setToday)
        .catch(() => {})
      void api.nova
        .brief('weekly')
        .then(setWeek)
        .catch(() => {})
      void api.nova
        .stories()
        .then(setStories)
        .catch(() => setStories([]))
    }
    load()
    const t = setInterval(load, 10 * 60_000)
    return () => clearInterval(t)
  }, [])
  // (a typed message shows at once, until its answer is in the log)
  useEffect(() => {
    if (sent && log?.some((r) => r.created_at >= sent.at && r.said.trim() === sent.text.trim())) setSent(null)
  }, [log, sent])
  useEffect(() => {
    chat.current?.scrollTo({ top: chat.current.scrollHeight, behavior: 'smooth' })
  }, [log?.length, sent])

  const send = (t: string): void => {
    const s = t.trim()
    if (!s) return
    setSent({ text: s, at: new Date().toISOString() })
    setText('')
    void api.nova.ask(s)
  }
  const now = new Date()
  const part = now.getHours() < 12 ? 'morning' : now.getHours() < 18 ? 'afternoon' : 'evening'
  const hello = prefs?.novaJarvis ? `Good ${part}, ${(prefs.novaAddress ?? 'sir').trim() || 'sir'}.` : `Good ${part}.`
  const caption = mode === 'listen' ? 'Listening…' : mode === 'think' ? 'Thinking…' : mode === 'talk' ? 'Speaking' : line || `Ask ${name} anything, out loud or below.`
  const weather = today?.card.items?.find((i) => i.label === 'Weather')
  const todayItems = (today?.card.items ?? []).filter((i) => i.label !== 'Weather' && i.label !== 'Confirmed' && i.label !== 'Reported' && i.label !== 'Rumour')
  const weekItems = (week?.card.items ?? []).filter((i) => !['Confirmed', 'Reported', 'Rumour'].includes(i.label))

  return (
    <div className="nova-home">
      <div className="nova-home-main">
        <header className="nova-home-head">
          <div>
            <h1 className="font-display text-4xl font-semibold">{hello}</h1>
            <p className="mt-1 text-[14px] text-muted">
              {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
              {weather ? ` · ${weather.detail}` : ''}
            </p>
          </div>
          <button className="nova-home-link" onClick={() => navigate({ name: 'nova' })}>
            Lessons, map and settings <Icon name="chevron" size={14} />
          </button>
        </header>

        <div ref={stage} className="nova-home-stage">
          {/* (as big as the space above the conversation allows, so the message box always stays on screen) */}
          <NovaNeural key={big} size={big} mode={mode} level={level} look={prefs?.novaLook ?? 'hologram'} color={prefs?.novaColor ?? 'blue'} />
          <p className={`nova-home-caption ${mode !== 'idle' ? 'live' : ''}`}>{caption}</p>
        </div>

        <section className="nova-glass nova-home-chat">
          <div ref={chat} className="nova-home-thread">
            {(log ?? []).map((r) => (
              <div key={r.id} className="flex flex-col gap-1.5">
                {r.said && <p className="nova-msg you">{r.said}</p>}
                {r.reply && <p className="nova-msg nova">{r.reply}</p>}
              </div>
            ))}
            {sent && (
              <div className="flex flex-col gap-1.5">
                <p className="nova-msg you">{sent.text}</p>
                <p className="nova-msg nova pending">…</p>
              </div>
            )}
            {log && !log.length && !sent && <p className="text-center text-[13px] text-muted">Nothing yet. Say hello.</p>}
          </div>
          <form
            className="nova-home-input"
            onSubmit={(e) => {
              e.preventDefault()
              send(text)
            }}
          >
            <button type="button" className="nova-round" title={`Talk to ${name}`} aria-label={`Talk to ${name}`} onClick={() => void startBrief()}>
              <Icon name="mic" size={16} />
            </button>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Message ${name}…`} aria-label={`Message ${name}`} />
            <button type="submit" className="nova-round send" disabled={!text.trim()} aria-label="Send">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </form>
          <div className="nova-home-actions">
            {ACTIONS.map((a) => (
              <button key={a.label} onClick={() => send(a.say)}>
                {a.label}
              </button>
            ))}
          </div>
        </section>
      </div>

      <aside className="nova-home-side">
        <Panel title="Today" action={{ label: 'Read it to me', onClick: () => send('Status report') }}>
          {!today && <Skeleton />}
          {today && !todayItems.length && <p className="text-[13px] text-muted">Nothing planned. A good day to get ahead.</p>}
          <ItemList items={todayItems.slice(0, 7)} />
        </Panel>
        <Panel title="Coming up">
          {!week && <Skeleton />}
          {week && !weekItems.length && <p className="text-[13px] text-muted">Nothing due this week.</p>}
          <ItemList items={weekItems.slice(0, 6)} />
        </Panel>
        <Panel title="News you watch" action={{ label: 'Topics', onClick: () => navigate({ name: 'nova' }) }}>
          {!stories && <Skeleton />}
          {stories && !stories.length && <p className="text-[13px] text-muted">No topics yet. Say “watch NVIDIA news”, or add topics in settings.</p>}
          <ul className="flex flex-col gap-3">
            {(stories ?? []).slice(0, 4).map((s) => (
              <li key={`${s.topic}-${s.headline}`}>
                <div className="flex items-center gap-2 text-[11px] text-muted">
                  <span className={`nova-trust ${s.trust}`}>{s.trust === 'confirmed' ? 'Confirmed' : s.trust === 'reported' ? 'Reported' : 'Rumour'}</span>
                  <span className="truncate">{s.topic}</span>
                  <span className="ml-auto shrink-0">{ago(s.at)}</span>
                </div>
                <p className="mt-0.5 text-[13px] leading-snug">{s.headline}</p>
              </li>
            ))}
          </ul>
        </Panel>
      </aside>
    </div>
  )
}

function Panel({ title, action, children }: { title: string; action?: { label: string; onClick: () => void }; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="nova-glass p-4">
      <div className="mb-2.5 flex items-center">
        <h2 className="nova-panel-title">{title}</h2>
        {action && (
          <button className="ml-auto text-[12px] text-muted hover:text-ink" onClick={action.onClick}>
            {action.label}
          </button>
        )}
      </div>
      {children}
    </section>
  )
}
function ItemList({ items }: { items: Item[] }): React.JSX.Element {
  return (
    <ul className="flex flex-col">
      {items.map((i, k) => (
        <li key={k} className="nova-item">
          <span className="nova-item-label">{i.label}</span>
          <span className="min-w-0 flex-1 truncate" title={i.detail}>
            {i.detail}
          </span>
        </li>
      ))}
    </ul>
  )
}
const Skeleton = (): React.JSX.Element => (
  <div className="flex flex-col gap-2">
    {[70, 55, 62].map((w) => (
      <div key={w} className="nova-skel" style={{ width: `${w}%` }} />
    ))}
  </div>
)
function ago(at: number): string {
  const m = Math.round((Date.now() - at) / 60_000)
  return m < 60 ? `${Math.max(1, m)}m` : m < 48 * 60 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`
}
