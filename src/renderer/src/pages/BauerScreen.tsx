// Bauer on the PC screen (outside the Studyhall window). Three tiny transparent windows share
// this file: #orb (the floating Bauer), #cards (cards beside your work) and #circle (circle-to-ask).

import { useCallback, useEffect, useRef, useState } from 'react'
import type { BauerCard, OrbState } from '@shared/types'
import { api } from '@/lib/data'
import { lookAt, type LookKind } from '@/lib/bauer/look'
import { say } from '@/lib/bauer/agent'
import { NovaOrb, type OrbMode } from '@/components/NovaOrb'

const hover = {
  onMouseEnter: () => api.bauer.mouse(true),
  onMouseLeave: () => api.bauer.mouse(false)
}

// ---------- The floating Bauer ----------

export function OrbWindow(): React.JSX.Element {
  const [state, setState] = useState<OrbState>('idle')
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [cfg, setCfg] = useState({ px: 76, follow: false, drift: true })
  useEffect(() => api.bauer.onOrbConfig(setCfg), [])
  // Loudness for the ripples: Nova's voice (a list every 40 ms, from when it arrives) or the microphone.
  const voice = useRef<{ env: number[]; at: number }>({ env: [], at: 0 })
  const mic = useRef({ v: 0, at: 0 })
  const [talking, setTalking] = useState(false)
  useEffect(
    () =>
      api.bauer.onLevels((l) => {
        if (l.kind === 'voice') {
          voice.current = { env: l.env, at: performance.now() }
          setTalking(l.env.length > 0)
        } else mic.current = { v: l.v, at: performance.now() }
      }),
    []
  )
  useEffect(() => {
    if (!talking) return
    const t = setInterval(() => {
      const v = voice.current
      if (performance.now() - v.at > v.env.length * 40 + 400) setTalking(false)
    }, 250)
    return () => clearInterval(t)
  }, [talking])
  const level = useRef({
    get current(): number {
      const now = performance.now()
      const v = voice.current
      const i = Math.floor((now - v.at) / 40)
      if (i >= 0 && i < v.env.length) return v.env[i]
      return now - mic.current.at < 400 ? mic.current.v : 0
    }
  }).current
  const mode: OrbMode = talking ? 'speaking' : state === 'listening' || state === 'thinking' || state === 'error' ? state : 'idle'
  // Press and drag to move Bauer; a plain click talks to him.
  const press = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const down = (e: React.PointerEvent): void => {
    press.current = { x: e.screenX, y: e.screenY, moved: false }
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    api.bauer.drag('dragStart', e.screenX, e.screenY)
  }
  const moveDrag = (e: React.PointerEvent): void => {
    const p = press.current
    if (!p) return
    if (!p.moved && Math.hypot(e.screenX - p.x, e.screenY - p.y) < 4) return
    p.moved = true
    setOpen(false)
    api.bauer.drag('dragMove', e.screenX, e.screenY)
  }
  const up = (e: React.PointerEvent): void => {
    const p = press.current
    press.current = null
    if (p?.moved) api.bauer.drag('dragEnd', e.screenX, e.screenY)
    else api.bauer.listen()
  }
  useEffect(
    () =>
      api.bauer.onOrb((s) => {
        setState(s.state)
        if (s.text) setText(s.text)
        else if (s.state === 'listening') setText('')
      }),
    []
  )
  // The "done" bubble fades after a while.
  useEffect(() => {
    if (state !== 'done' && state !== 'error') return
    const t = setTimeout(() => {
      setState('idle')
      setText('')
    }, 9000)
    return () => clearTimeout(t)
  }, [state, text])

  return (
    <div className="fixed inset-0 flex flex-col items-end justify-end gap-2 p-3 select-none">
      {text && (state === 'done' || state === 'error') && (
        <div {...hover} className="orb-bubble max-w-[300px] rounded-2xl rounded-br-md px-4 py-3 text-[13.5px] leading-snug">
          {text}
        </div>
      )}
      <div
        className="flex items-center gap-2"
        onMouseLeave={() => {
          if (press.current || cfg.follow) return // mid-drag: keep the mouse
          setOpen(false)
          api.bauer.mouse(false)
        }}
        onMouseEnter={() => {
          if (cfg.follow) return // riding along with the cursor: never catch clicks
          setOpen(true)
          api.bauer.mouse(true)
        }}
      >
        {open && (
          <div className="orb-menu flex gap-1 rounded-full p-1">
            <button className="orb-btn" title="Circle something on screen and ask (Ctrl+Alt+B)" onClick={() => void api.bauer.circle()}>
              ⭕ Circle
            </button>
            <button className="orb-btn" title="Hide Nova (Ctrl+Alt+N brings it back)" onClick={() => api.bauer.hideOrb()}>
              Hide
            </button>
          </div>
        )}
        <button
          className="nova-orb-btn"
          title="Click to talk (or hold Ctrl+Alt) · drag to move"
          aria-label="Talk to Nova"
          onPointerDown={down}
          onPointerMove={moveDrag}
          onPointerUp={up}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && api.bauer.listen()}
          style={{ touchAction: 'none' }}
        >
          <NovaOrb size={cfg.px} mode={mode} level={level} drift={cfg.drift && !cfg.follow} solid />
        </button>
      </div>
    </div>
  )
}

// ---------- Pointing: a ring around one control on your screen ----------

export function PointWindow(): React.JSX.Element {
  const [p, setP] = useState<{ rect: { x: number; y: number; width: number; height: number }; label: string; step: string } | null>(null)
  useEffect(() => api.bauer.onPoint(setP), [])
  if (!p) return <div className="fixed inset-0" />
  const pad = 8
  const r = { x: p.rect.x - pad, y: p.rect.y - pad, w: p.rect.width + pad * 2, h: p.rect.height + pad * 2 }
  // The label sits below the ring, or above it near the bottom of the screen.
  const below = r.y + r.h + 46 < window.innerHeight
  return (
    <div className="pointer-events-none fixed inset-0 select-none">
      <div className="nova-ring" style={{ left: r.x, top: r.y, width: r.w, height: r.h }} />
      <div className="nova-ring-label" style={{ left: Math.max(8, Math.min(window.innerWidth - 260, r.x)), top: below ? r.y + r.h + 10 : r.y - 40 }}>
        {p.step && <span className="nova-ring-step">{p.step}</span>}
        {p.label}
      </div>
    </div>
  )
}

// ---------- Cards beside your work ----------

export function CardsWindow(): React.JSX.Element {
  const [cards, setCards] = useState<BauerCard[]>([])
  const [name, setName] = useState('nova')
  useEffect(() => api.bauer.onCards((c) => setCards(c ?? [])), [])
  useEffect(() => {
    void api.prefs
      .get()
      .then((p) => setName((p.novaName ?? 'Nova').toLowerCase()))
      .catch(() => {})
  }, [])
  const close = (id: string): void => {
    const next = cards.filter((c) => c.id !== id)
    setCards(next)
    if (!next.length) {
      api.bauer.mouse(false)
      void api.bauer.clearCards()
    }
  }
  const clearAll = (): void => {
    setCards([])
    api.bauer.mouse(false)
    void api.bauer.clearCards()
  }
  const kindLabel: Record<BauerCard['kind'], string> = {
    summary: 'answer',
    answer: 'answer',
    photo: 'photo',
    points: 'key points',
    timeline: 'timeline',
    steps: 'steps',
    chart: 'in numbers',
    quiz: 'quick check'
  }
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto overflow-x-hidden p-2.5">
      {cards.map((c) => (
        <article key={c.id} {...hover} className="px-card shrink-0">
          <header className="px-bar">
            <i />
            <i />
            <span>
              {name} · {kindLabel[c.kind]}
            </span>
            <button onClick={() => close(c.id)} aria-label="Close">
              ×
            </button>
          </header>
          <div className="px-body">
            {c.kind !== 'photo' && <h3>{c.title}</h3>}
            {c.image && <img src={c.image} alt="" className={`px-img ${c.kind === 'photo' ? 'max-h-64' : 'max-h-40'}`} />}
            {c.body && <p className="whitespace-pre-line">{c.body}</p>}
            {c.kind === 'points' && c.items && (
              <ul className="px-list">
                {c.items.map((it, i) => (
                  <li key={i}>
                    <b>{it.label}</b>
                    {it.detail && <span> {it.detail}</span>}
                  </li>
                ))}
              </ul>
            )}
            {c.kind === 'timeline' && c.items && (
              <ol className="px-timeline">
                {c.items.map((it, i) => (
                  <li key={i}>
                    <b>{it.label}</b>
                    {it.detail && <span>{it.detail}</span>}
                  </li>
                ))}
              </ol>
            )}
            {c.kind === 'steps' && c.items && (
              <ol className="px-steps">
                {c.items.map((it, i) => (
                  <li key={i}>
                    <em>{i + 1}</em>
                    <div>
                      <b>{it.label}</b>
                      {it.detail && <span>{it.detail}</span>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {c.kind === 'chart' && c.items && <PixelChart items={c.items} unit={c.unit} />}
            {c.kind === 'quiz' && c.quiz && <Quiz card={c} />}
            {(c.source || c.link) && (
              <div className="px-foot">
                <span>{c.source}</span>
                {c.link && <button onClick={() => void api.app.openUrl(c.link!)}>read more</button>}
              </div>
            )}
          </div>
        </article>
      ))}
      {cards.length > 1 && (
        <button {...hover} className="px-clear" onClick={clearAll}>
          CLEAR ALL · {cards.length}
        </button>
      )}
    </div>
  )
}

/** Horizontal bars, one colour, each value written next to its bar. */
function PixelChart({ items, unit }: { items: { label: string; detail?: string; value?: number }[]; unit?: string }): React.JSX.Element {
  const max = Math.max(...items.map((i) => i.value ?? 0), 0) || 1
  const fmt = (v: number): string => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : String(Math.round(v * 10) / 10))
  return (
    <div className="px-chart" role="table" aria-label={`Chart${unit ? ` (${unit})` : ''}`}>
      {items.map((it, i) => (
        <div key={i} className="px-chart-row" role="row" title={it.detail}>
          <span role="cell" className="px-chart-label">
            {it.label}
          </span>
          <span role="cell" className="px-chart-track">
            <i style={{ width: `${Math.max(2, ((it.value ?? 0) / max) * 100)}%` }} />
          </span>
          <span role="cell" className="px-chart-value">
            {fmt(it.value ?? 0)}
            {unit && unit.length <= 3 ? unit : ''}
          </span>
        </div>
      ))}
      {unit && unit.length > 3 && <div className="px-chart-unit">{unit}</div>}
    </div>
  )
}

/** Multiple choice. Pick an answer to see if it's right; save them all as flashcards. */
function Quiz({ card }: { card: BauerCard }): React.JSX.Element {
  const [picked, setPicked] = useState<Record<number, number>>({})
  const [saved, setSaved] = useState<'no' | 'saving' | 'yes'>('no')
  const quiz = card.quiz ?? []
  const save = async (): Promise<void> => {
    setSaved('saving')
    try {
      const deck = await api.create('flashcard_decks', { name: `${card.title.replace(/^Quick check: /, '').slice(0, 60)} · Nova`, module_id: null })
      for (const q of quiz)
        await api.create('flashcards', {
          deck_id: deck.id,
          front: q.q,
          back: `${q.options[q.answer]}${q.why ? ` (${q.why})` : ''}`,
          ease: 2.5,
          interval_days: 0,
          repetitions: 0,
          due_at: null
        })
      setSaved('yes')
    } catch (e) {
      console.warn('Nova: couldn’t save the quiz', e)
      setSaved('no')
    }
  }
  return (
    <div className="px-quiz">
      {quiz.map((q, qi) => {
        const p = picked[qi]
        return (
          <div key={qi} className="px-q">
            <p>{q.q}</p>
            <div className="px-options">
              {q.options.map((o, oi) => (
                <button
                  key={oi}
                  disabled={p != null}
                  className={p == null ? '' : oi === q.answer ? 'right' : oi === p ? 'wrong' : 'dim'}
                  onClick={() => setPicked({ ...picked, [qi]: oi })}
                >
                  {o}
                </button>
              ))}
            </div>
            {p != null && <p className="px-why">{p === q.answer ? 'Right!' : `It’s ${q.options[q.answer]}.`} {q.why}</p>}
          </div>
        )
      })}
      <button className="px-save" disabled={saved !== 'no'} onClick={() => void save()}>
        {saved === 'yes' ? 'SAVED TO FLASHCARDS ✓' : saved === 'saving' ? 'SAVING…' : 'SAVE AS FLASHCARDS'}
      </button>
    </div>
  )
}

// ---------- Circle to ask ----------

type Pt = { x: number; y: number }
const CHIPS: { kind: LookKind; label: string }[] = [
  { kind: 'explain', label: 'Explain this' },
  { kind: 'cards', label: 'Make flashcards' },
  { kind: 'dates', label: 'Add its dates' },
  { kind: 'note', label: 'Save as a note' }
]

// For automated tests: run a look on any picture.
;(window as unknown as { __look?: typeof lookAt }).__look = lookAt

export function CircleWindow(): React.JSX.Element {
  const [shot, setShot] = useState<{ image: string; width: number; height: number } | null>(null)
  const [path, setPath] = useState<Pt[]>([])
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState('')
  const [eyes, setEyes] = useState<boolean | null>(null)
  const drawing = useRef(false)
  const pts = useRef<Pt[]>([]) // the stroke so far (state can lag behind fast pointer moves)
  const input = useRef<HTMLInputElement>(null)

  const reset = useCallback(async () => {
    setPath([])
    setBox(null)
    setQ('')
    setBusy('')
    setShot(await api.bauer.shot())
    setEyes((await api.claude.status().then((s) => s.signedIn).catch(() => false)) || (await api.ai.status().then((s) => s.eyes).catch(() => false)))
  }, [])
  useEffect(() => {
    void reset()
    return api.bauer.onCircle(() => void reset())
  }, [reset])
  const close = useCallback(() => {
    setShot(null)
    api.bauer.closeCircle()
  }, [])
  useEffect(() => {
    const k = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [close])

  const down = (e: React.PointerEvent): void => {
    if (busy || (e.target as HTMLElement).closest('[data-prompt]')) return
    drawing.current = true
    setBox(null)
    pts.current = [{ x: e.clientX, y: e.clientY }]
    setPath(pts.current)
    try {
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      /* not a real pointer (tests) */
    }
  }
  const move = (e: React.PointerEvent): void => {
    if (!drawing.current) return
    pts.current = [...pts.current, { x: e.clientX, y: e.clientY }]
    setPath(pts.current)
  }
  const up = (): void => {
    if (!drawing.current) return
    drawing.current = false
    const path = pts.current
    if (path.length < 3) return
    const xs = path.map((p) => p.x), ys = path.map((p) => p.y)
    const b = { x: Math.max(0, Math.min(...xs) - 6), y: Math.max(0, Math.min(...ys) - 6), w: 0, h: 0 }
    b.w = Math.min(innerWidth, Math.max(...xs) + 6) - b.x
    b.h = Math.min(innerHeight, Math.max(...ys) + 6) - b.y
    if (b.w < 16 || b.h < 16) return
    setBox(b)
    setTimeout(() => input.current?.focus(), 30)
  }

  /** The circled part of the frozen screen, at full sharpness (but not bigger than the AI needs). */
  const crop = async (): Promise<string> => {
    const img = new Image()
    img.src = shot!.image
    await img.decode()
    const sx = shot!.width / innerWidth, sy = shot!.height / innerHeight
    const w = box!.w * sx, h = box!.h * sy
    const scale = Math.min(1, 1280 / Math.max(w, h))
    const c = document.createElement('canvas')
    c.width = Math.round(w * scale)
    c.height = Math.round(h * scale)
    c.getContext('2d')!.drawImage(img, box!.x * sx, box!.y * sy, w, h, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.9)
  }

  const go = async (kind: LookKind): Promise<void> => {
    if (!box || !shot) return
    setBusy(kind === 'cards' ? 'Making flashcards…' : kind === 'dates' ? 'Finding the dates…' : kind === 'note' ? 'Copying it out…' : 'Looking…')
    try {
      const image = await crop()
      const [profile, prefs] = await Promise.all([api.profile.get(), api.prefs.get()])
      const reply = await lookAt(image, kind, kind === 'ask' ? q : '', profile.mode)
      api.bauer.orb('done', reply)
      if (prefs.bauerTalk !== false) say(reply)
      close()
    } catch (e) {
      setBusy(`Something went wrong: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (!shot) return <div className="fixed inset-0" />
  const d = path.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ')
  const promptTop = box ? (box.y + box.h + 170 < innerHeight ? box.y + box.h + 12 : Math.max(12, box.y - 160)) : 0
  const promptLeft = box ? Math.min(Math.max(12, box.x), innerWidth - 492) : 0
  return (
    <div className="fixed inset-0 cursor-crosshair select-none" onPointerDown={down} onPointerMove={move} onPointerUp={up}>
      <img src={shot.image} alt="" className="pointer-events-none absolute inset-0 h-full w-full" draggable={false} />
      <svg className="pointer-events-none absolute inset-0 h-full w-full">
        <defs>
          <mask id="hole">
            <rect width="100%" height="100%" fill="white" />
            {box && <rect x={box.x} y={box.y} width={box.w} height={box.h} rx="10" fill="black" />}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(4,5,10,0.55)" mask="url(#hole)" />
        {box && <rect x={box.x} y={box.y} width={box.w} height={box.h} rx="10" fill="none" stroke="#39ff88" strokeWidth="2" style={{ filter: 'drop-shadow(0 0 6px #39ff88)' }} />}
        {path.length > 1 && <path d={d} fill="none" stroke="#ff3ea5" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 6px #ff3ea5)' }} />}
      </svg>
      {!box && (
        <div className="circle-hint pointer-events-none absolute top-6 left-1/2 -translate-x-1/2 rounded-full px-5 py-2.5 text-sm">
          Circle what you want Bauer to look at · Esc to cancel
        </div>
      )}
      {box && (
        <div data-prompt className="circle-prompt absolute w-[480px] max-w-[calc(100vw-24px)] cursor-auto rounded-2xl p-3" style={{ top: promptTop, left: promptLeft }} onPointerDown={(e) => e.stopPropagation()}>
          {eyes === false ? (
            <div className="flex flex-col gap-2 text-sm">
              <p>Bauer needs his eyes for this: a free AI that looks at pictures, on this PC (3 GB, one-time).</p>
              <div className="flex gap-2">
                <button
                  className="circle-chip on"
                  onClick={() => {
                    void api.app.goto('settings')
                    close()
                  }}
                >
                  Open Settings → Voice
                </button>
                <button className="circle-chip" onClick={close}>
                  Cancel
                </button>
              </div>
            </div>
          ) : busy ? (
            <p className="flex items-center gap-2 px-1 py-2 text-sm">
              <span className="h-2 w-2 animate-ping rounded-full bg-[#39ff88]" /> {busy}
            </p>
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  ref={input}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && q.trim() && void go('ask')}
                  placeholder="Ask about this…"
                  className="circle-input min-w-0 flex-1 px-3 py-2 text-sm"
                />
                <button className="circle-chip on" disabled={!q.trim()} onClick={() => void go('ask')}>
                  Ask
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {CHIPS.map((c) => (
                  <button key={c.kind} className="circle-chip" onClick={() => void go(c.kind)}>
                    {c.label}
                  </button>
                ))}
                <button className="circle-chip ml-auto" onClick={close}>
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
