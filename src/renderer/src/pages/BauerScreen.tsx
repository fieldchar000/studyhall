// Bauer on the PC screen (outside the Studyhall window). Three tiny transparent windows share
// this file: #orb (the floating Bauer), #cards (cards beside your work) and #circle (circle-to-ask).

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
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

type PointMsg = {
  rect: { x: number; y: number; width: number; height: number }
  label: string
  step: string
  highlight?: boolean
  arrowTo?: { x: number; y: number } | null
}

export function PointWindow(): React.JSX.Element {
  const [p, setP] = useState<PointMsg | null>(null)
  useEffect(() => api.bauer.onPoint((m) => setP(m as PointMsg | null)), [])
  if (!p) return <div className="fixed inset-0" />
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

export function CardsWindow(): React.JSX.Element {
  const [cards, setCards] = useState<BauerCard[]>([])
  const [source, setSource] = useState<{ title: string; url: string; image: string | null; sentences: string[] } | null>(null)
  const [mark, setMark] = useState<{ n: number; tag: string } | null>(null)
  const [name, setName] = useState('nova')
  useEffect(() => api.bauer.onCards((c) => setCards(c ?? [])), [])
  // A live lesson arrives step by step.
  useEffect(
    () =>
      api.bauer.onLive((op) => {
        if (op.op === 'start') {
          setCards([])
          setSource(op.source)
          setMark(null)
        } else if (op.op === 'card') setCards((cs) => [...cs.filter((c) => c.id !== op.card.id), op.card])
        else if (op.op === 'item') setCards((cs) => cs.map((c) => (c.id === op.id ? { ...c, items: [...(c.items ?? []), op.item] } : c)))
        else if (op.op === 'quiz') setCards((cs) => cs.map((c) => (c.id === op.id ? { ...c, quiz: [...(c.quiz ?? []), op.q] } : c)))
        else if (op.op === 'mark') setMark({ n: op.n, tag: op.tag })
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
    const next = cards.filter((c) => c.id !== id)
    setCards(next)
    if (!next.length && !source) {
      api.bauer.mouse(false)
      void api.bauer.clearCards()
    }
  }
  const clearAll = (): void => {
    setCards([])
    setSource(null)
    setMark(null)
    api.bauer.mouse(false)
    void api.bauer.clearCards()
  }

  // The arrow from the underlined sentence to the first card.
  const wrap = useRef<HTMLDivElement>(null)
  const [arrow, setArrow] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  useLayoutEffect(() => {
    if (!mark || !wrap.current) return setArrow(null)
    // Bring the underlined line into view on the source page first.
    wrap.current.querySelector('.src-mark')?.scrollIntoView({ block: 'center' })
    const box = wrap.current.getBoundingClientRect()
    const from = wrap.current.querySelector('.src-mark')?.getBoundingClientRect()
    const to = wrap.current.querySelector('.px-card')?.getBoundingClientRect()
    if (!from || !to) return setArrow(null)
    setArrow({ x1: from.right - box.left + 4, y1: from.top - box.top + from.height / 2, x2: to.left - box.left - 8, y2: to.top - box.top + 34 })
  }, [mark, cards.length, source])

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
  const count = cards.length + (source ? 1 : 0)
  return (
    <div ref={wrap} className={`relative flex h-full gap-4 overflow-y-auto overflow-x-hidden p-2.5 ${source ? 'flex-row items-start' : 'flex-col'}`}>
      {source && (
        <article {...hover} className="src-page shrink-0">
          <div className="src-url">en.wikipedia.org/wiki/{source.title.replace(/ /g, '_')}</div>
          <h2>{source.title}</h2>
          <div className="src-from">From Wikipedia, the free encyclopedia</div>
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
        </article>
      )}
      <div className={`flex min-w-0 flex-col gap-4 ${source ? 'flex-1' : ''}`}>
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
                    <li key={i} className="px-in">
                      <b>{it.label}</b>
                      {it.detail && <span> {it.detail}</span>}
                    </li>
                  ))}
                </ul>
              )}
              {c.kind === 'timeline' && c.items && (
                <ol className="px-timeline">
                  {c.items.map((it, i) => (
                    <li key={i} className="px-in">
                      <b>{it.label}</b>
                      {it.detail && <span>{it.detail}</span>}
                    </li>
                  ))}
                </ol>
              )}
              {c.kind === 'steps' && c.items && (
                <ol className="px-steps">
                  {c.items.map((it, i) => (
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
              {c.kind === 'chart' && c.items && <PixelChart items={c.items} unit={c.unit} />}
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
        ))}
        {count > 1 && (
          <button {...hover} className="px-clear" onClick={clearAll}>
            CLEAR ALL · {count}
          </button>
        )}
      </div>
      {arrow && (
        <svg className="src-arrow" aria-hidden="true">
          <defs>
            <marker id="src-head" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="#a8c8ff" />
            </marker>
          </defs>
          <path d={`M${arrow.x1},${arrow.y1} C${arrow.x1 + 40},${arrow.y1} ${arrow.x2 - 40},${arrow.y2} ${arrow.x2},${arrow.y2}`} markerEnd="url(#src-head)" />
        </svg>
      )}
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
