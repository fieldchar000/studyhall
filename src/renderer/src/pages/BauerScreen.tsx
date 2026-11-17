// Bauer on the PC screen (outside the Studyhall window). Three tiny transparent windows share
// this file: #orb (the floating Bauer), #cards (cards beside your work) and #circle (circle-to-ask).

import { useCallback, useEffect, useRef, useState } from 'react'
import type { BauerCard, OrbState } from '@shared/types'
import { api } from '@/lib/data'
import { lookAt, type LookKind } from '@/lib/bauer/look'
import { say } from '@/lib/bauer/agent'

const hover = {
  onMouseEnter: () => api.bauer.mouse(true),
  onMouseLeave: () => api.bauer.mouse(false)
}

// ---------- The floating Bauer ----------

export function OrbWindow(): React.JSX.Element {
  const [state, setState] = useState<OrbState>('idle')
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
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
          if (press.current) return // mid-drag: keep the mouse
          setOpen(false)
          api.bauer.mouse(false)
        }}
        onMouseEnter={() => (setOpen(true), api.bauer.mouse(true))}
      >
        {open && (
          <div className="orb-menu flex gap-1 rounded-full p-1">
            <button className="orb-btn" title="Circle something on screen and ask (Ctrl+Alt+B)" onClick={() => void api.bauer.circle()}>
              ⭕ Circle
            </button>
            <button className="orb-btn" title="Hide Bauer (Settings → Voice brings him back)" onClick={() => api.bauer.hideOrb()}>
              Hide
            </button>
          </div>
        )}
        <button
          className={`orb orb-${state}`}
          title="Click to talk · drag to move"
          aria-label="Talk to Bauer"
          onPointerDown={down}
          onPointerMove={moveDrag}
          onPointerUp={up}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && api.bauer.listen()}
          style={{ touchAction: 'none' }}
        >
          <span className="orb-core" />
          <span className="orb-swirl" />
          <span className="orb-orbit" style={{ ['--a' as string]: '0deg', animationDuration: '5s' }} />
          <span className="orb-orbit" style={{ ['--a' as string]: '60deg', animationDuration: '7s' }} />
          <span className="orb-orbit" style={{ ['--a' as string]: '-60deg', animationDuration: '6s' }} />
          <span className="orb-ring" />
        </button>
      </div>
    </div>
  )
}

// ---------- Cards beside your work ----------

export function CardsWindow(): React.JSX.Element {
  const [cards, setCards] = useState<BauerCard[]>([])
  useEffect(() => api.bauer.onCards((c) => setCards(c ?? [])), [])
  const close = (id: string): void => {
    const next = cards.filter((c) => c.id !== id)
    setCards(next)
    if (!next.length) {
      api.bauer.mouse(false)
      void api.bauer.clearCards()
    }
  }
  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-1">
      {cards.map((c) => (
        <article key={c.id} {...hover} className="bauer-card shrink-0">
          <header className="flex items-center gap-2 px-3 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#39ff88] shadow-[0_0_6px_#39ff88]" />
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] tracking-wide text-[#9fe8c4] lowercase">{c.kind === 'photo' ? 'photo' : c.kind === 'timeline' ? 'timeline' : c.kind === 'points' ? 'key points' : c.kind === 'answer' ? 'bauer' : 'summary'}</span>
            <button className="px-1 text-[15px] leading-none text-[#9fe8c4] hover:text-white" onClick={() => close(c.id)} aria-label="Close">
              ×
            </button>
          </header>
          <div className="px-4 pt-1 pb-3">
            {c.kind !== 'photo' && <h3 className="mb-1.5 text-[15px] leading-snug font-semibold text-white">{c.title}</h3>}
            {c.image && <img src={c.image} alt="" className={`mb-2 w-full rounded-lg object-contain ${c.kind === 'photo' ? 'max-h-64' : 'max-h-40'}`} />}
            {c.body && <p className="text-[13px] leading-relaxed whitespace-pre-line text-[#d8dcf0]">{c.body}</p>}
            {c.kind === 'timeline' && c.items && (
              <ol className="relative mt-1 flex flex-col gap-3 border-l border-[#39ff88]/40 pl-4">
                {c.items.map((it, i) => (
                  <li key={i} className="relative">
                    <span className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full border border-[#39ff88] bg-[#05110b] shadow-[0_0_8px_#39ff88]" />
                    <div className="text-[13px] font-semibold text-white">{it.label}</div>
                    {it.detail && <div className="text-[12px] text-[#b8bfdc]">{it.detail}</div>}
                  </li>
                ))}
              </ol>
            )}
            {c.kind === 'points' && c.items && (
              <ul className="mt-1 flex flex-col gap-2">
                {c.items.map((it, i) => (
                  <li key={i} className="text-[13px] leading-snug">
                    <span className="font-semibold text-white">{it.label}</span>
                    {it.detail && <span className="text-[#b8bfdc]"> — {it.detail}</span>}
                  </li>
                ))}
              </ul>
            )}
            {(c.source || c.link) && (
              <div className="mt-2 flex items-center justify-between text-[11px] text-[#8a90b0]">
                <span>{c.source}</span>
                {c.link && (
                  <button className="underline hover:text-white" onClick={() => void api.app.openUrl(c.link!)}>
                    Read more
                  </button>
                )}
              </div>
            )}
          </div>
        </article>
      ))}
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
    setEyes(await api.ai.status().then((s) => s.eyes).catch(() => false))
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
