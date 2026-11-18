// Bauer on the PC screen (outside the Studyhall window). Three tiny transparent windows share
// this file: #orb (the floating Bauer), #cards (cards beside your work) and #circle (circle-to-ask).

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { BauerCard, OrbState } from '@shared/types'
import { api } from '@/lib/data'
import { lookAt, type LookKind } from '@/lib/bauer/look'
import { say } from '@/lib/bauer/agent'
import { startGlobe, type NovaGlobe } from '@/lib/jarvis/nova'

/** Marks something of Nova's that takes clicks (see main.tsx: the window only catches clicks over these). */
const hover = { 'data-hot': '' }

// ---------- The floating Bauer ----------

export function OrbWindow(): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const globe = useRef<NovaGlobe | null>(null)
  const [state, setState] = useState<OrbState>('idle')
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [at, setAt] = useState({ x: -999, y: -999, r: 40 })
  // Speech bubbles: your words under the globe, Nova's above it (filling in as it speaks).
  const [you, setYou] = useState<{ text: string; listening: boolean } | null>(null)
  const [nova, setNova] = useState<{ text: string; done: boolean; at: number } | null>(null)
  const micLevel = useRef(0)

  useEffect(() => {
    if (!canvas.current) return
    const inside = (el: HTMLElement | null, x: number, y: number): boolean => {
      if (!el) return false
      const r = el.getBoundingClientRect()
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
    }
    const offs: (() => void)[] = []
    let raf = 0
    let gone = false
    void startGlobe({
      canvas: canvas.current,
      onClick: () => {
        setMenu(null)
        api.bauer.listen()
      },
      onMenu: (x, y) => setMenu({ x, y }),
      onHot: (h) => api.bauer.mouse(h),
      onHome: (x, y) => api.bauer.orbHome(x, y),
      extraHit: (x, y) => inside(menuRef.current, x, y), // (bubbles never catch clicks)
      home: null
    }).then((g) => {
      if (gone) return
      globe.current = g
      offs.push(
        api.bauer.onOrbConfig((c) => g.setConfig(c)),
        api.bauer.onLevels((l) => {
          if (l.kind === 'voice') g.voice(l.env)
          else {
            g.mic(l.v)
            micLevel.current = l.v
          }
        }),
        api.bauer.onOrbGo((p) => g.goTo(p)),
        api.bauer.onEmote((e) => g.emote(e))
      )
      // The bubbles and menu ride along with the globe.
      const track = (): void => {
        const w = g.where()
        setAt((a) => (Math.abs(a.x - w.x) > 0.5 || Math.abs(a.y - w.y) > 0.5 || a.r !== w.r ? w : a))
        raf = requestAnimationFrame(track)
      }
      raf = requestAnimationFrame(track)
    })
    return () => {
      gone = true
      for (const off of offs) off()
      cancelAnimationFrame(raf)
    }
  }, [])

  useEffect(
    () =>
      api.bauer.onBubble((b) => {
        if (b.who === 'you') {
          if (b.done && !b.text) setYou(null)
          else setYou({ text: b.text, listening: !b.text })
          if (!b.text && !b.done) setNova(null) // you're talking: Nova's last words make room
          return
        }
        setNova((n) => {
          if (b.done) return n ? { ...n, done: true, at: Date.now() } : n
          const text = b.append && n && !n.done ? `${n.text} ${b.text}`.replace(/\s+/g, ' ').trim() : b.text
          return { text, done: false, at: Date.now() }
        })
      }),
    []
  )
  useEffect(
    () =>
      api.bauer.onOrb((s) => {
        setState(s.state)
        globe.current?.setState(s.state, s.cursor)
        // Nothing spoken (voice off) or something went wrong: the words still show above the globe.
        if (s.text && (s.state === 'done' || s.state === 'error'))
          setNova((n) => (n && Date.now() - n.at < 10_000 && s.state !== 'error' ? n : { text: s.text!, done: true, at: Date.now() }))
      }),
    []
  )
  // Your words step aside a few seconds after Nova starts answering; Nova's fade a while after it finishes.
  useEffect(() => {
    if (!nova || !you || you.listening) return
    const t = setTimeout(() => setYou(null), 4000)
    return () => clearTimeout(t)
  }, [nova, you])
  useEffect(() => {
    if (!nova?.done) return
    const t = setTimeout(() => setNova(null), Math.min(14_000, 5000 + nova.text.length * 45))
    return () => clearTimeout(t)
  }, [nova])
  useEffect(() => {
    if (state !== 'done' && state !== 'error') return
    const t = setTimeout(() => {
      setState('idle')
      globe.current?.setState('idle')
    }, 9000)
    return () => clearTimeout(t)
  }, [state])
  // The menu closes when the mouse wanders off for a moment.
  useEffect(() => {
    if (!menu) return
    const t = setTimeout(() => setMenu(null), 6000)
    return () => clearTimeout(t)
  }, [menu])

  // Bubbles are centred on the globe (kept on screen); a long answer shows its newest lines.
  const W = Math.min(340, window.innerWidth - 16)
  const bx = Math.max(8, Math.min(window.innerWidth - W - 8, at.x - W / 2))
  // Centred on the globe; near a screen edge the bubble hugs that edge and its tail moves along to the globe.
  const edge = bx <= 8 ? 'flex-start' : bx >= window.innerWidth - W - 8 ? 'flex-end' : 'center'
  const tailAt = edge === 'center' ? '50%' : edge === 'flex-start' ? `${Math.max(14, at.x - bx)}px` : `calc(100% - ${Math.max(14, bx + W - at.x)}px)`
  const roomAbove = at.y - at.r * 1.35 > 90
  const roomBelow = at.y + at.r * 1.35 < window.innerHeight - 70
  const novaText = nova ? (nova.text.length > 260 ? `…${nova.text.slice(-260).replace(/^\S*\s/, '')}` : nova.text) : ''
  return (
    <>
      {/* Roamies drives the canvas; clicks on it (not on a wrapper) are the globe's. */}
      <canvas ref={canvas} className="fixed" style={{ imageRendering: 'pixelated' }} />
      {nova && novaText && (
        <div className="nova-bub-row" style={{ left: bx, width: W, justifyContent: edge, ...(roomAbove ? { bottom: window.innerHeight - (at.y - at.r * 1.35) } : { top: at.y + at.r * 1.35 + (you ? 64 : 0) }) }}>
          <div className={`nova-bub nova-bub-nova ${nova.done ? 'is-done' : ''} ${roomAbove ? '' : 'flip'}`} style={{ ['--tail' as string]: tailAt }}>
            <span className="nova-bub-who">{state === 'error' ? 'hmm' : 'nova'}</span>
            {novaText}
          </div>
        </div>
      )}
      {you && (
        <div className="nova-bub-row" style={{ left: bx, width: W, justifyContent: edge, ...(roomBelow ? { top: at.y + at.r * 1.6 } : { bottom: window.innerHeight - (at.y - at.r * 1.35) + (nova ? 70 : 0) }) }}>
          <div className={`nova-bub nova-bub-you ${roomBelow ? '' : 'flip'}`} style={{ ['--tail' as string]: tailAt }}>
            <span className="nova-bub-who">you</span>
            {you.listening ? (
              <span className="nova-bub-listen" aria-label="Listening">
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
            ) : (
              `“${you.text}”`
            )}
          </div>
        </div>
      )}
      {menu && (
        <div ref={menuRef} className="orb-menu fixed flex gap-1 rounded-full p-1" style={{ left: Math.min(menu.x + 8, window.innerWidth - 190), top: menu.y + 8 }}>
          <button
            className="orb-btn"
            onClick={() => {
              setMenu(null)
              api.bauer.listen()
            }}
          >
            Talk
          </button>
          <button className="orb-btn" title="Ctrl+Alt+N brings it back" onClick={() => api.bauer.hideOrb()}>
            Hide
          </button>
        </div>
      )}
    </>
  )
}

// ---------- Pointing: a ring around one control on your screen ----------

type PointMsg = {
  rect: { x: number; y: number; width: number; height: number }
  label: string
  step: string
  highlight?: boolean
  arrowTo?: { x: number; y: number } | null
  marks?: { rect: { x: number; y: number; width: number; height: number }; label: string }[]
}

export function PointWindow(): React.JSX.Element {
  const [p, setP] = useState<PointMsg | null>(null)
  useEffect(() => api.bauer.onPoint((m) => setP(m as PointMsg | null)), [])
  if (!p) return <div className="fixed inset-0" />
  // Marks: Nova showing you things while it talks (numbered rings when there are several).
  if (p.marks?.length) {
    const many = p.marks.length > 1
    return (
      <div className="pointer-events-none fixed inset-0 select-none">
        {p.marks.map((m, i) => {
          const pad = 6
          const r = { x: m.rect.x - pad, y: m.rect.y - pad, w: m.rect.width + pad * 2, h: m.rect.height + pad * 2 }
          const below = r.y + r.h + 40 < window.innerHeight
          return (
            <div key={i} className="nova-mark-in" style={{ animationDelay: `${i * 0.35}s` }}>
              <div className="nova-ring" style={{ left: r.x, top: r.y, width: r.w, height: r.h }} />
              {m.label && (
                <div className="nova-ring-label" style={{ left: Math.max(8, Math.min(window.innerWidth - 260, r.x)), top: below ? r.y + r.h + 8 : r.y - 38 }}>
                  {many && <span className="nova-ring-step">{i + 1}</span>}
                  {m.label}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }
  // The key bit: an underline and a soft box under the text, a tag, and an arrow to Nova's cards.
  if (p.highlight) {
    const r = p.rect
    const tagX = Math.min(window.innerWidth - 200, r.x + r.width + 10)
    const from = { x: r.x + r.width + 8, y: r.y + r.height / 2 }
    return (
      <div className="pointer-events-none fixed inset-0 select-none">
        <div className="nova-mark-box" style={{ left: r.x - 4, top: r.y - 2, width: r.width + 8, height: r.height + 4 }} />
        <div className="nova-mark" style={{ left: r.x - 2, top: r.y + r.height + 1, width: r.width + 4 }} />
        <div className="nova-ring-label" style={{ left: Math.max(8, tagX), top: Math.max(8, r.y - 34) }}>
          {p.label}
        </div>
        {p.arrowTo && (
          <svg className="nova-arrow" aria-hidden="true">
            <path d={`M${from.x},${from.y} C${from.x + 80},${from.y} ${p.arrowTo.x - 80},${p.arrowTo.y} ${p.arrowTo.x - 6},${p.arrowTo.y}`} />
          </svg>
        )}
      </div>
    )
  }
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

/** Nova is talking about this card: it lights up, scrolls into view, and the globe floats over beside it. */
function lookAtCard(id: string): void {
  let tries = 0
  const go = (): void => {
    const el = document.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(id)}"]`)
    if (!el) {
      if (tries++ < 10) setTimeout(go, 60) // (it may still be appearing)
      return
    }
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    el.classList.remove('px-looking')
    void el.offsetWidth
    el.classList.add('px-looking')
    setTimeout(() => el.classList.remove('px-looking'), 3500)
    setTimeout(() => {
      const r = el.getBoundingClientRect()
      api.bauer.cardAt({ x: r.left, y: r.top, width: r.width, height: Math.min(r.height, 220) })
    }, 250)
  }
  setTimeout(go, 40)
}

// ---------- Cards: small floating cards around what you asked about (the Roamies way) ----------
// The cards window is one see-through layer over the screen. Each card is placed on its own in free space around the
// subject (what Nova ringed, underlined or you circled), never on top of it, with a short arrow to it; with nothing to
// work around they line up along the right edge. At most 4 stay up (the oldest closes first, pinned ones stay). Drag
// one by its bar to put it somewhere else (it stays there); pin it to keep it.

type Rect = { x: number; y: number; width: number; height: number }
type Pos = { x: number; y: number; moved?: boolean }
const MAX_CARDS = 4
const GAP = 12
const SOURCE_ID = '__source'
const overlaps = (a: Rect, b: Rect, pad = 0): boolean =>
  a.x < b.x + b.width + pad && a.x + a.width + pad > b.x && a.y < b.y + b.height + pad && a.y + a.height + pad > b.y

/** Where a card of size w × h goes: around the subject first (right, left, below, above), then the screen's edges,
 *  never over the subject or another card. */
function placeCard(w: number, h: number, subject: Rect | null, taken: Rect[]): Pos {
  const W = window.innerWidth
  const H = window.innerHeight
  const free = (x: number, y: number): boolean => {
    if (x < 8 || y < 8 || x + w > W - 8 || y + h > H - 8) return false
    const r = { x, y, width: w, height: h }
    if (subject && overlaps(r, subject, 14)) return false
    return !taken.some((t) => overlaps(r, t, GAP - 2))
  }
  const columns: number[] = []
  const rows: number[] = []
  if (subject) {
    columns.push(subject.x + subject.width + 18, subject.x - w - 18)
    rows.push(subject.y + subject.height + 18, subject.y - h - 18)
  }
  columns.push(W - w - 16, 16)
  // Down each column from the subject's top (or the screen's), then along each row.
  for (const x of columns) {
    const startY = subject ? Math.max(8, Math.min(subject.y - 20, H - h - 8)) : 12
    for (let y = startY; y + h <= H - 8; y += 12) if (free(x, y)) return { x, y }
    for (let y = startY; y >= 8; y -= 12) if (free(x, y)) return { x, y }
  }
  for (const y of rows) {
    const startX = subject ? Math.max(8, Math.min(subject.x, W - w - 8)) : 16
    for (let x = startX; x + w <= W - 8; x += 12) if (free(x, y)) return { x, y }
    for (let x = startX; x >= 8; x -= 12) if (free(x, y)) return { x, y }
  }
  // Nowhere free: the right edge, from the top (over whatever's there).
  return { x: Math.max(8, W - w - 16), y: 12 }
}

export function CardsWindow(): React.JSX.Element {
  const [cards, setCards] = useState<BauerCard[]>([])
  const [source, setSource] = useState<{ title: string; url: string; image: string | null; sentences: string[] } | null>(null)
  const [mark, setMark] = useState<{ n: number; tag: string } | null>(null)
  const [name, setName] = useState('nova')
  const [subject, setSubject] = useState<Rect | null>(null)
  const [pos, setPos] = useState<Record<string, Pos>>({})
  const [pinned, setPinned] = useState<Record<string, boolean>>({})
  const [open, setOpen] = useState<Record<string, boolean>>({}) // "+ more" expanded
  const sizes = useRef<Record<string, { w: number; h: number }>>({})
  const [, setTick] = useState(0)
  const lastActive = useRef(Date.now())
  // (The message handlers read these, so they never need re-subscribing: each subscription tells main "ready".)
  const pinnedRef = useRef(pinned)
  pinnedRef.current = pinned
  const sourceRef = useRef(source)
  sourceRef.current = source
  const closedRef = useRef(new Set<string>())

  // At most 4 cards: when a new one comes, the oldest that isn't pinned makes way.
  const keepFew = (list: BauerCard[]): BauerCard[] => {
    const out = [...list]
    while (out.length + (sourceRef.current ? 1 : 0) > MAX_CARDS) {
      const i = out.findIndex((c) => !pinnedRef.current[c.id])
      if (i < 0) break
      out.splice(i, 1)
    }
    return out
  }
  // Main sends the whole list: cards already up keep their order (and pinned ones stay), new ones go after them.
  useEffect(
    () =>
      api.bauer.onCards((c) =>
        setCards((old) => {
          const incoming = (c ?? []).filter((n) => !closedRef.current.has(n.id)) // (closed ones stay closed)
          const kept = old.filter((o) => pinnedRef.current[o.id] || incoming.some((n) => n.id === o.id)).map((o) => incoming.find((n) => n.id === o.id) ?? o)
          return keepFew([...kept, ...incoming.filter((n) => !kept.some((k) => k.id === n.id))])
        })
      ),
    []
  )
  // A new subject: the cards you haven't moved or pinned rearrange around it.
  useEffect(
    () =>
      api.bauer.onSubject((r) => {
        setSubject(r)
        setPos((p) => Object.fromEntries(Object.entries(p).filter(([id, q]) => q.moved || pinnedRef.current[id])))
      }),
    []
  )
  // A live lesson arrives step by step.
  useEffect(
    () =>
      api.bauer.onLive((op) => {
        if (op.op !== 'end') lastActive.current = Date.now()
        if (op.op === 'start') {
          setCards((cs) => cs.filter((c) => pinnedRef.current[c.id]))
          setSource(op.source)
          setMark(null)
          setPos((p) => Object.fromEntries(Object.entries(p).filter(([id]) => pinnedRef.current[id])))
        } else if (op.op === 'card') setCards((cs) => keepFew([...cs.filter((c) => c.id !== op.card.id), op.card]))
        else if (op.op === 'item') setCards((cs) => cs.map((c) => (c.id === op.id ? { ...c, items: [...(c.items ?? []), op.item] } : c)))
        else if (op.op === 'quiz') setCards((cs) => cs.map((c) => (c.id === op.id ? { ...c, quiz: [...(c.quiz ?? []), op.q] } : c)))
        else if (op.op === 'mark') setMark({ n: op.n, tag: op.tag })
        else if (op.op === 'look') lookAtCard(op.id)
      }),
    []
  )
  useEffect(() => {
    void api.prefs
      .get()
      .then((p) => setName((p.novaName ?? 'Nova').toLowerCase()))
      .catch(() => {})
  }, [])
  const close = (id: string): void => {
    closedRef.current.add(id)
    if (id === SOURCE_ID) setSource(null)
    const next = cards.filter((c) => c.id !== id)
    setCards(next)
    setPinned((p) => ({ ...p, [id]: false }))
    if (!next.length && (id === SOURCE_ID || !source)) {
      api.bauer.mouse(false)
      void api.bauer.clearCards()
    }
  }
  const clearAll = (): void => {
    setCards([])
    setSource(null)
    setMark(null)
    setPos({})
    setPinned({})
    api.bauer.mouse(false)
    void api.bauer.clearCards()
  }
  // Everything clears itself after 3 quiet minutes (pinned cards stay).
  useEffect(() => {
    const touch = (): void => void (lastActive.current = Date.now())
    document.addEventListener('mousemove', touch, { passive: true })
    const t = setInterval(() => {
      if ((cards.length || source) && Date.now() - lastActive.current > 180_000) {
        const keep = cards.filter((c) => pinned[c.id])
        if (!keep.length) clearAll()
        else {
          setCards(keep)
          setSource(null)
        }
      }
    }, 5000)
    return () => {
      document.removeEventListener('mousemove', touch)
      clearInterval(t)
    }
  })

  // Measure each card; place the ones that need a place (new, or now covering something), keep the rest still.
  const ids = [...(source ? [SOURCE_ID] : []), ...cards.map((c) => c.id)]
  const layer = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = layer.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      let changed = false
      for (const node of el.querySelectorAll<HTMLElement>('[data-card-id]')) {
        const id = node.dataset.cardId!
        const s = { w: node.offsetWidth, h: node.offsetHeight }
        const o = sizes.current[id]
        if (!o || Math.abs(o.w - s.w) > 1 || Math.abs(o.h - s.h) > 1) {
          sizes.current[id] = s
          changed = true
        }
      }
      if (changed) setTick((t) => t + 1)
    })
    for (const node of el.querySelectorAll<HTMLElement>('[data-card-id]')) ro.observe(node)
    return () => ro.disconnect()
  }, [ids.join('|'), open])
  useLayoutEffect(() => {
    const next: Record<string, Pos> = {}
    const taken: Rect[] = []
    let changed = false
    // Moved and pinned cards keep their place; then the others in order, keeping their place while it's still free.
    const order = [...ids].sort((a, b) => Number(!!(pos[b]?.moved || pinned[b])) - Number(!!(pos[a]?.moved || pinned[a])))
    for (const id of order) {
      const s = sizes.current[id]
      if (!s) continue
      const p = pos[id]
      const r = p && { x: p.x, y: p.y, width: s.w, height: s.h }
      const ok = r && (p.moved || pinned[id] || ((!subject || !overlaps(r, subject, 10)) && !taken.some((t) => overlaps(r, t, GAP - 4)) && r.x + r.width <= window.innerWidth && r.y + r.height <= window.innerHeight))
      const q = ok ? p : placeCard(s.w, s.h, subject, taken)
      if (!ok) changed = true
      next[id] = q
      taken.push({ x: q.x, y: q.y, width: s.w, height: s.h })
    }
    if (changed || Object.keys(pos).some((k) => !next[k])) setPos(next)
  })

  // Dragging a card by its bar: it stays where you drop it.
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null)
  const startDrag = (id: string, e: React.PointerEvent): void => {
    if ((e.target as HTMLElement).closest('button')) return
    const p = pos[id]
    if (!p) return
    drag.current = { id, dx: e.clientX - p.x, dy: e.clientY - p.y }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const moveDrag = (e: React.PointerEvent): void => {
    const d = drag.current
    if (!d) return
    const s = sizes.current[d.id] ?? { w: 260, h: 100 }
    const x = Math.max(0, Math.min(window.innerWidth - s.w, e.clientX - d.dx))
    const y = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - d.dy))
    setPos((p) => ({ ...p, [d.id]: { x, y, moved: true } }))
  }
  const endDrag = (): void => void (drag.current = null)

  // The source page's underlined line: the globe floats over to it.
  const lastMark = useRef<typeof mark>(null)
  useLayoutEffect(() => {
    if (!mark || !layer.current) return
    const line = layer.current.querySelector<HTMLElement>('.src-mark')
    if (!line) return
    line.scrollIntoView({ block: 'center' })
    if (lastMark.current !== mark) {
      lastMark.current = mark
      const r = line.getBoundingClientRect()
      api.bauer.cardAt({ x: (pos[SOURCE_ID]?.x ?? r.left), y: r.top, width: r.width, height: r.height })
    }
  }, [mark, pos])

  const kindLabel: Record<BauerCard['kind'], string> = {
    summary: 'answer',
    answer: 'answer',
    photo: 'photo',
    points: 'answer',
    timeline: 'timeline',
    steps: 'steps',
    chart: 'in numbers',
    quiz: 'quick check',
    diagram: 'diagram'
  }
  const count = ids.length
  // The arrow from the first card to the subject.
  const first = ids.find((id) => id !== SOURCE_ID) ?? ids[0]
  const fp = first ? pos[first] : null
  const fs = first ? sizes.current[first] : null
  let arrow: { x1: number; y1: number; x2: number; y2: number } | null = null
  if (subject && fp && fs) {
    const cx = fp.x + fs.w / 2
    const sx = subject.x + subject.width / 2
    const x1 = cx < sx ? fp.x + fs.w : fp.x
    const y1 = Math.min(fp.y + fs.h - 10, Math.max(fp.y + 18, subject.y + subject.height / 2))
    const x2 = cx < sx ? subject.x - 6 : subject.x + subject.width + 6
    const y2 = subject.y + subject.height / 2
    if (Math.hypot(x2 - x1, y2 - y1) > 30) arrow = { x1, y1, x2, y2 }
  }
  const bar = (id: string, label: string): React.JSX.Element => (
    <header className="px-bar px-drag" onPointerDown={(e) => startDrag(id, e)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} title="Drag to move">
      <i />
      <i />
      <span>{label}</span>
      {count > 1 && id === ids[ids.length - 1] && (
        <button onClick={clearAll} title="Close all the cards" className="px-all">
          all ×
        </button>
      )}
      <button onClick={() => setPinned((p) => ({ ...p, [id]: !p[id] }))} aria-label={pinned[id] ? 'Unpin' : 'Pin'} title={pinned[id] ? 'Pinned: stays until you close it' : 'Pin: keep this card'} className={pinned[id] ? 'px-pinned' : ''}>
        ▣
      </button>
      <button onClick={() => close(id)} aria-label="Close">
        ×
      </button>
    </header>
  )
  const style = (id: string): React.CSSProperties => {
    const p = pos[id]
    return p ? { left: p.x, top: p.y } : { left: -9999, top: 0, visibility: 'hidden' } // (measured first, then placed)
  }
  return (
    <div ref={layer} className="fixed inset-0 select-none">
      {arrow && (
        <svg className="px-arrow" aria-hidden="true">
          <defs>
            <marker id="px-head" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="#a8c8ff" />
            </marker>
          </defs>
          <path d={`M${arrow.x1},${arrow.y1} C${(arrow.x1 + arrow.x2) / 2},${arrow.y1} ${(arrow.x1 + arrow.x2) / 2},${arrow.y2} ${arrow.x2},${arrow.y2}`} markerEnd="url(#px-head)" />
        </svg>
      )}
      {source && (
        <article {...hover} data-card-id={SOURCE_ID} className={`px-card px-float src-card ${pinned[SOURCE_ID] ? 'is-pinned' : ''}`} style={style(SOURCE_ID)}>
          {bar(SOURCE_ID, `${name} · source`)}
          <div className="src-page">
            <h2>{source.title}</h2>
            <div className="src-from">From Wikipedia</div>
            {source.image && <img src={source.image} alt="" />}
            <p>
              {source.sentences.map((s, i) =>
                mark && mark.n === i ? (
                  <span key={i} className="src-mark">
                    {s}
                    <em>{mark.tag}</em>{' '}
                  </span>
                ) : (
                  <span key={i}>{s} </span>
                )
              )}
            </p>
            <button className="src-more" onClick={() => void api.app.openUrl(source.url)}>
              Open the full page
            </button>
          </div>
        </article>
      )}
      {cards.map((c) => {
        const items = c.items ?? []
        const many = items.length > 4 && !open[c.id]
        const shown = many ? items.slice(0, 4) : items
        return (
          <article key={c.id} {...hover} data-card-id={c.id} className={`px-card px-float ${c.kind === 'diagram' ? 'is-wide' : ''} ${pinned[c.id] ? 'is-pinned' : ''}`} style={style(c.id)}>
            {bar(c.id, `${name} · ${kindLabel[c.kind]}`)}
            <div className="px-body">
              {c.kind !== 'photo' && <h3>{c.title}</h3>}
              {c.image && <img src={c.image} alt="" className={`px-img ${c.kind === 'photo' ? 'max-h-52' : 'max-h-32'}`} />}
              {c.body && <p className="whitespace-pre-line">{c.body}</p>}
              {c.kind === 'points' && shown.length > 0 && (
                <ul className="px-list">
                  {shown.map((it, i) => (
                    <li key={i} className="px-in">
                      <b>{it.label}</b>
                      {it.detail && <span> {it.detail}</span>}
                    </li>
                  ))}
                </ul>
              )}
              {c.kind === 'timeline' && shown.length > 0 && (
                <ol className="px-timeline">
                  {shown.map((it, i) => (
                    <li key={i} className="px-in">
                      <b>{it.label}</b>
                      {it.detail && <span>{it.detail}</span>}
                    </li>
                  ))}
                </ol>
              )}
              {c.kind === 'steps' && shown.length > 0 && (
                <ol className="px-steps">
                  {shown.map((it, i) => (
                    <li key={i} className="px-in">
                      <em>{i + 1}</em>
                      <div>
                        <b>{it.label}</b>
                        {it.detail && <span>{it.detail}</span>}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              {many && (
                <button className="px-more" onClick={() => setOpen((o) => ({ ...o, [c.id]: true }))}>
                  + {items.length - 4} more
                </button>
              )}
              {c.kind === 'chart' && items.length > 0 && <PixelChart items={items} unit={c.unit} />}
              {c.kind === 'diagram' && c.svg && <PixelDiagram svg={c.svg} />}
              {c.kind === 'quiz' && c.quiz && c.quiz.length > 0 && <Quiz card={c} />}
              {(c.source || c.link) && c.kind !== 'diagram' && (
                <div className="px-foot">
                  <span>{c.source}</span>
                  {c.link && !source && <button onClick={() => void api.app.openUrl(c.link!)}>read more</button>}
                </div>
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}

// ---------- Pixel diagrams: Claude's small drawing, shapes made pixel-chunky, labels crisp ----------

const SVG_TAGS = new Set(['svg', 'g', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text', 'tspan'])
const SVG_ATTRS = new Set([
  'viewBox', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'points', 'd', 'fill', 'stroke',
  'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'fill-opacity', 'stroke-opacity', 'transform',
  'font-size', 'text-anchor', 'dominant-baseline'
])

/** Keep only plain shapes and text (no scripts, links, images or styles). */
function cleanSvg(raw: string): { shapes: string; labels: { x: number; y: number; text: string; size: number; anchor: string; fill: string }[]; w: number; h: number } | null {
  const doc = new DOMParser().parseFromString(raw, 'image/svg+xml')
  const root = doc.documentElement
  if (root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) return null
  const vb = (root.getAttribute('viewBox') ?? '0 0 320 200').split(/[\s,]+/).map(Number)
  const [, , w, h] = vb.length === 4 && vb.every(Number.isFinite) ? vb : [0, 0, 320, 200]
  const labels: { x: number; y: number; text: string; size: number; anchor: string; fill: string }[] = []
  const walk = (el: Element): void => {
    for (const child of [...el.children]) {
      const tag = child.nodeName.toLowerCase()
      if (!SVG_TAGS.has(tag)) {
        child.remove()
        continue
      }
      for (const a of [...child.attributes]) if (!SVG_ATTRS.has(a.name) || /url\(|javascript:|expression/i.test(a.value)) child.removeAttribute(a.name)
      if (tag === 'text') {
        // Labels are shown as crisp pixel text on top, not inside the chunky picture.
        const t = (child.textContent ?? '').trim().slice(0, 40)
        if (t && !child.getAttribute('transform'))
          labels.push({
            x: Number(child.getAttribute('x') ?? 0),
            y: Number(child.getAttribute('y') ?? 0),
            text: t,
            size: Number(child.getAttribute('font-size') ?? 14) || 14,
            anchor: child.getAttribute('text-anchor') ?? 'start',
            fill: child.getAttribute('fill') ?? '#e4eeff'
          })
        child.remove()
        continue
      }
      walk(child)
    }
  }
  for (const a of [...root.attributes]) if (!SVG_ATTRS.has(a.name) && a.name !== 'xmlns') root.removeAttribute(a.name)
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  walk(root)
  return { shapes: new XMLSerializer().serializeToString(root), labels: labels.slice(0, 14), w, h }
}

function PixelDiagram({ svg }: { svg: string }): React.JSX.Element | null {
  const clean = useRef(cleanSvg(svg)).current
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!clean || !canvas.current) return
    const c = canvas.current
    // Drawn small, then shown 3× bigger without smoothing: the pixel look.
    const scale = 3
    c.width = Math.round(clean.w / scale)
    c.height = Math.round(clean.h / scale)
    const img = new Image()
    img.onload = () => {
      const x = c.getContext('2d')!
      x.imageSmoothingEnabled = false
      x.clearRect(0, 0, c.width, c.height)
      x.drawImage(img, 0, 0, c.width, c.height)
    }
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(clean.shapes)}`
  }, [clean])
  if (!clean) return null
  return (
    <div className="px-diagram" style={{ aspectRatio: `${clean.w} / ${clean.h}` }}>
      <canvas ref={canvas} />
      {clean.labels.map((l, i) => (
        <span
          key={i}
          style={{
            left: `${(l.x / clean.w) * 100}%`,
            top: `${(l.y / clean.h) * 100}%`,
            fontSize: Math.max(9, Math.min(12, l.size * 0.75)),
            color: /^#[0-9a-f]{3,8}$/i.test(l.fill) ? l.fill : '#e4eeff',
            transform: `translate(${l.anchor === 'middle' ? '-50%' : l.anchor === 'end' ? '-100%' : '0'}, -85%)`
          }}
        >
          {l.text}
        </span>
      ))}
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
    // Right-click anywhere also cancels (Esc only works if Windows gave this screen the keyboard).
    const r = (e: MouseEvent): void => {
      e.preventDefault()
      close()
    }
    window.addEventListener('keydown', k)
    window.addEventListener('contextmenu', r)
    return () => {
      window.removeEventListener('keydown', k)
      window.removeEventListener('contextmenu', r)
    }
  }, [close])
  // Left untouched for 40 seconds (nothing circled, nothing asked): it closes itself, so it can never trap you.
  const touched = useRef(Date.now())
  useEffect(() => {
    if (!shot) return
    touched.current = Date.now()
    const t = setInterval(() => {
      if (!busy && Date.now() - touched.current > 40_000) close()
    }, 1000)
    return () => clearInterval(t)
  }, [shot, busy, close])

  const down = (e: React.PointerEvent): void => {
    touched.current = Date.now()
    if (busy || (e.target as HTMLElement).closest('[data-prompt]') || (e.target as HTMLElement).closest('[data-cancel]')) return
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
          Circle what you want Nova to look at · Esc or right-click to cancel
        </div>
      )}
      <button data-cancel className="circle-cancel absolute top-5 right-5" onPointerDown={(e) => e.stopPropagation()} onClick={close}>
        ✕ CANCEL
      </button>
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
