// The Brain: everything you've put into Studyhall as one living web of dots. Ask it things in
// plain words, or wander: hover a dot to see what it's tied to, click to look, double-click to open.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force'
import type { Material } from '@shared/types'
import { buildBrain, KIND_LABEL, readNewFiles, type BNode, type Brain, type Kind } from '@/lib/brain'
import { ask, EXAMPLES, type Answer } from '@/lib/brainAsk'
import { navigate } from '@/lib/nav'
import { setMode, useMode } from '@/lib/profile'
import { openTask } from '@/lib/tasks'
import { MaterialViewer, openMaterial } from '@/components/MaterialViewer'
import { Icon } from '@/components/ui'

type SimNode = SimulationNodeDatum & { id: string; n: BNode; r: number }
type SimLink = SimulationLinkDatum<SimNode> & { why: string }
type View = 'all' | 'study' | 'life'

const BASE_R: Partial<Record<Kind, number>> = { module: 9, person: 9, week: 5, idea: 4, fact: 2.6, task: 3, moment: 3.4, plan: 3.2, journal: 3.6 }
const radius = (n: BNode): number => (BASE_R[n.kind] ?? 3.8) + Math.min(9, Math.sqrt(n.degree) * 1.1)

const HIDEABLE: { kind: Kind[]; label: string }[] = [
  { kind: ['idea'], label: 'Ideas' },
  { kind: ['material'], label: 'Files' },
  { kind: ['fact'], label: 'Details' },
  { kind: ['task'], label: 'Tasks' },
  { kind: ['journal', 'moment', 'plan'], label: 'Journal & memories' }
]

const store = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem(k)
      return v ? (JSON.parse(v) as T) : d
    } catch {
      return d
    }
  },
  set(k: string, v: unknown): void {
    try {
      localStorage.setItem(k, JSON.stringify(v))
    } catch {
      /* optional */
    }
  }
}

function themeColors(): { ink: string; muted: string; line: string; panel: string; canvas: string; accent: string; brass: string; dark: boolean } {
  const cs = getComputedStyle(document.documentElement)
  const v = (n: string): string => cs.getPropertyValue(n).trim()
  const canvas = v('--color-canvas') || '#f3f0e8'
  const dark = (() => {
    const m = /^#([0-9a-f]{6})$/i.exec(canvas)
    if (!m) return false
    const x = parseInt(m[1], 16)
    return ((x >> 16) & 255) * 0.3 + ((x >> 8) & 255) * 0.59 + (x & 255) * 0.11 < 110
  })()
  return { ink: v('--color-ink'), muted: v('--color-muted'), line: v('--color-line'), panel: v('--color-panel'), canvas, accent: v('--color-accent'), brass: v('--color-brass'), dark }
}

/** Dots in dark mode get lifted so deep heritage colours still read. */
function lift(hex: string, dark: boolean): string {
  if (!dark) return hex
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const x = parseInt(m[1], 16)
  const mix = (c: number): number => Math.round(c + (255 - c) * 0.38)
  return `rgb(${mix((x >> 16) & 255)} ${mix((x >> 8) & 255)} ${mix(x & 255)})`
}

export function BrainPage({ q: initialQ }: { q?: string }): React.JSX.Element {
  const [brain, setBrain] = useState<Brain | null>(null)
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null)
  const [view, setView] = useState<View>(() => store.get('brain.view', 'all'))
  const [hidden, setHidden] = useState<string[]>(() => store.get('brain.hidden', [] as string[]))
  const [query, setQuery] = useState(initialQ ?? '')
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [viewing, setViewing] = useState<Material | null>(null)
  const mode = useMode()

  const rebuild = useCallback(async () => setBrain(await buildBrain()), [])

  // Build, then read any new files in the background and rebuild once they're in.
  useEffect(() => {
    let stop = false
    void (async () => {
      const b = await buildBrain()
      if (stop) return
      setBrain(b)
      const read = await readNewFiles((done, total) => !stop && setReading(total ? { done, total } : null), () => stop)
      if (stop) return
      setReading(null)
      if (read > 0) setBrain(await buildBrain())
    })()
    return () => {
      stop = true
    }
  }, [])

  useEffect(() => store.set('brain.view', view), [view])
  useEffect(() => store.set('brain.hidden', hidden), [hidden])

  // Answer as you type (a moment after you stop).
  useEffect(() => {
    if (!brain) return
    const t = setTimeout(() => setAnswer(query.trim() ? ask(brain, query) : null), query === initialQ ? 0 : 220)
    return () => clearTimeout(t)
  }, [query, brain]) // eslint-disable-line react-hooks/exhaustive-deps

  const open = useCallback(
    (n: BNode) => {
      const o = n.open
      if (!o) return
      if ('material' in o) openMaterial(o.material, setViewing)
      else if ('task' in o) openTask(o.task)
      else {
        navigate(o.route)
        if (o.mode && o.mode !== mode) void setMode(o.mode)
      }
    },
    [mode]
  )

  const hiddenKinds = useMemo(() => new Set(HIDEABLE.filter((h) => hidden.includes(h.label)).flatMap((h) => h.kind)), [hidden])
  const examples = useMemo(() => (brain ? EXAMPLES(brain) : []), [brain])
  const sel = selected && brain ? brain.nodes.get(selected) ?? null : null

  return (
    <div className="relative flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-6 pt-5 pb-4">
        <div className="mr-2">
          <div className="label-caps">Your second brain</div>
          <h1 className="font-display text-3xl leading-tight font-semibold">Brain</h1>
        </div>
        <label className="relative min-w-72 flex-1">
          <Icon name="search" size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setQuery('')
                setSelected(null)
              }
            }}
            placeholder="Ask anything — “what does Alex like?”, “when is my exam?”, “what is elasticity?”"
            className="field-boxed w-full py-2.5 pr-3 pl-9 text-[15px]"
          />
        </label>
        <div className="flex items-center gap-1 rounded-lg border border-line p-0.5 text-xs">
          {(['all', 'study', 'life'] as View[]).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`rounded-md px-2.5 py-1 font-semibold ${view === v ? 'bg-panel text-accent shadow-sm' : 'text-muted hover:text-ink'}`}>
              {v === 'all' ? 'Everything' : v === 'study' ? 'Study' : 'Life'}
            </button>
          ))}
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        {brain ? (
          <Graph brain={brain} view={view} hiddenKinds={hiddenKinds} focus={answer?.focus ?? null} selected={selected} onSelect={setSelected} onOpen={open} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">Gathering everything you’ve saved…</div>
        )}

        {/* Answer card */}
        <div className="pointer-events-none absolute top-4 left-4 flex max-h-[calc(100%-2rem)] w-[400px] max-w-[calc(100%-2rem)] flex-col gap-3">
          {answer && answer.title && (
            <div className="card pointer-events-auto flex min-h-0 flex-col overflow-hidden shadow-xl">
              <div className="flex items-start gap-2 border-b border-line/70 px-4 pt-3 pb-2.5">
                <div className="min-w-0 flex-1">
                  <div className="label-caps">Brain says</div>
                  <div className="font-display text-lg leading-snug font-semibold">{answer.title}</div>
                </div>
                <button className="btn-ghost px-1.5" onClick={() => setQuery('')} title="Clear">
                  <Icon name="x" size={14} />
                </button>
              </div>
              <div className="min-h-0 overflow-auto px-2 py-2">
                {answer.lines.length === 0 ? (
                  <p className="px-2 py-1.5 text-sm text-muted">{answer.empty ?? 'Nothing found.'}</p>
                ) : (
                  answer.lines.map((l, i) => (
                    <button
                      key={i}
                      disabled={!l.node}
                      onClick={() => l.node && setSelected(l.node)}
                      className={`flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left ${l.node ? 'hover:bg-line/40' : ''} ${selected && l.node === selected ? 'bg-accent-soft' : ''}`}
                    >
                      <span className="text-[13.5px] leading-snug">{l.text}</span>
                      {l.sub && <span className="mt-0.5 text-[11px] text-muted">{l.sub}</span>}
                    </button>
                  ))
                )}
                {answer.hint && <p className="px-2 pt-1 text-[11px] text-muted">{answer.hint}</p>}
              </div>
            </div>
          )}
          {!query && brain && (
            <div className="card pointer-events-auto px-4 py-3 shadow-lg">
              <div className="label-caps mb-1.5">Try asking</div>
              <div className="flex flex-wrap gap-1.5">
                {examples.map((e) => (
                  <button key={e} className="chip hover:border-brass/60" onClick={() => setQuery(e)}>
                    {e}
                  </button>
                ))}
              </div>
              <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted">
                Things link up by themselves — notes in a week, names you mention, headings and slide titles that show up in more than one place. To link on purpose, type <span className="font-mono text-ink">[[Name]]</span> in any note or journal.
              </p>
            </div>
          )}
        </div>

        {/* Selected dot */}
        {sel && brain && <NodePanel brain={brain} node={sel} onSelect={setSelected} onOpen={open} onClose={() => setSelected(null)} />}

        {/* Legend and filters */}
        {brain && (
          <div className="absolute bottom-4 left-4 flex flex-wrap items-center gap-1.5 text-[11px]">
            {HIDEABLE.map((h) => {
              const on = !hidden.includes(h.label)
              return (
                <button
                  key={h.label}
                  onClick={() => setHidden((x) => (on ? [...x, h.label] : x.filter((y) => y !== h.label)))}
                  className={`rounded-full border px-2.5 py-1 backdrop-blur ${on ? 'border-line bg-panel/80 text-ink' : 'border-dashed border-line bg-panel/40 text-muted line-through'}`}
                >
                  {h.label}
                </button>
              )
            })}
            <span className="ml-2 text-muted tabular-nums">
              {brain.nodes.size} dots · {brain.edges.length} links
            </span>
            {reading && (
              <span className="ml-2 text-muted">
                Reading your files… {reading.done}/{reading.total}
              </span>
            )}
            <button className="btn-ghost ml-1 px-1.5 text-[11px]" onClick={() => void rebuild()} title="Rebuild with your latest changes">
              <Icon name="refresh" size={12} /> Refresh
            </button>
          </div>
        )}
      </div>
      {viewing && <MaterialViewer material={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}

// ---------- The selected dot ----------

function NodePanel({ brain, node, onSelect, onOpen, onClose }: { brain: Brain; node: BNode; onSelect: (id: string) => void; onOpen: (n: BNode) => void; onClose: () => void }): React.JSX.Element {
  const neighbours = [...(brain.adj.get(node.id) ?? [])].map((id) => brain.nodes.get(id)!).filter(Boolean)
  const groups = new Map<string, BNode[]>()
  for (const n of neighbours.sort((a, b) => b.degree - a.degree)) groups.set(KIND_LABEL[n.kind], [...(groups.get(KIND_LABEL[n.kind]) ?? []), n])
  const text = (brain.docText.get(node.id) ?? '').replace(/\s+/g, ' ').trim()
  const preview = node.kind === 'fact' ? '' : text.slice(node.label.length, node.label.length + 320).trim()
  return (
    <aside className="card absolute top-4 right-4 flex max-h-[calc(100%-2rem)] w-[320px] flex-col overflow-hidden shadow-xl">
      <div className="flex items-start gap-2.5 border-b border-line/70 px-4 pt-3 pb-3">
        <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{ background: node.color }} />
        <div className="min-w-0 flex-1">
          <div className="label-caps">{KIND_LABEL[node.kind]}</div>
          <div className="font-display text-lg leading-snug font-semibold break-words">{node.label}</div>
          {node.sub && <div className="text-xs text-muted">{node.sub}</div>}
        </div>
        <button className="btn-ghost px-1.5" onClick={onClose} title="Close">
          <Icon name="x" size={14} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
        {preview && <p className="mb-3 text-[12.5px] leading-relaxed text-muted">{preview}…</p>}
        {node.open && (
          <button className="btn-primary mb-3 w-full justify-center" onClick={() => onOpen(node)}>
            <Icon name="external" size={14} /> Open
          </button>
        )}
        {groups.size === 0 && <p className="text-sm text-muted">Not linked to anything yet. Mention it in a note, or type [[{node.label}]] somewhere.</p>}
        {[...groups].map(([label, list]) => (
          <div key={label} className="mb-3">
            <div className="label-caps mb-1">
              {label} · {list.length}
            </div>
            {list.slice(0, 14).map((n) => (
              <button key={n.id} onClick={() => onSelect(n.id)} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] hover:bg-line/40">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: n.color }} />
                <span className="truncate">{n.label}</span>
              </button>
            ))}
            {list.length > 14 && <div className="px-1.5 text-[11px] text-muted">+{list.length - 14} more</div>}
          </div>
        ))}
      </div>
    </aside>
  )
}

// ---------- The web itself (canvas + d3-force) ----------

function Graph({
  brain,
  view,
  hiddenKinds,
  focus,
  selected,
  onSelect,
  onOpen
}: {
  brain: Brain
  view: View
  hiddenKinds: Set<Kind>
  focus: string[] | null
  selected: string | null
  onSelect: (id: string | null) => void
  onOpen: (n: BNode) => void
}): React.JSX.Element {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const sim = useRef<Simulation<SimNode, SimLink> | null>(null)
  const nodesRef = useRef<SimNode[]>([])
  const linksRef = useRef<SimLink[]>([])
  const byId = useRef(new Map<string, SimNode>())
  const positions = useRef(new Map<string, { x: number; y: number }>())
  const t = useRef({ x: 0, y: 0, k: 0.9 })
  const hover = useRef<SimNode | null>(null)
  const dirty = useRef(true)
  const state = useRef({ focus: null as Set<string> | null, selected: null as string | null })
  const size = useRef({ w: 800, h: 600 })
  const anim = useRef<{ from: { x: number; y: number; k: number }; to: { x: number; y: number; k: number }; start: number } | null>(null)
  // Dots an answer mentions stay visible even if their kind is filtered out.
  const revealKey = useMemo(() => {
    if (!focus) return ''
    return focus
      .filter((id) => {
        const n = brain.nodes.get(id)
        return n && (hiddenKinds.has(n.kind) || (view !== 'all' && n.side !== view))
      })
      .sort()
      .join(',')
  }, [focus, brain, hiddenKinds, view])
  const onOpenRef = useRef(onOpen)
  onOpenRef.current = onOpen
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // (Re)start the layout whenever what's shown changes, keeping dots where they were.
  useEffect(() => {
    const reveal = new Set(revealKey ? revealKey.split(',') : [])
    const keep = (n: BNode): boolean => reveal.has(n.id) || (!hiddenKinds.has(n.kind) && (view === 'all' || n.side === view || (n.side === 'other' && n.kind !== 'idea')))
    for (const n of nodesRef.current) positions.current.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 })
    const nodes: SimNode[] = []
    const map = new Map<string, SimNode>()
    let i = 0
    for (const n of brain.nodes.values()) {
      if (!keep(n)) continue
      const p = positions.current.get(n.id)
      const side = view === 'all' ? (n.side === 'study' ? -1 : n.side === 'life' ? 1 : 0) : 0
      const a = i++ * 2.399963 // golden-angle spiral start
      const r = 12 * Math.sqrt(i)
      const s: SimNode = { id: n.id, n, r: radius(n), x: p?.x ?? side * 260 + Math.cos(a) * r, y: p?.y ?? Math.sin(a) * r }
      nodes.push(s)
      map.set(n.id, s)
    }
    const links: SimLink[] = brain.edges.filter((e) => map.has(e.a) && map.has(e.b)).map((e) => ({ source: e.a, target: e.b, why: e.why }))
    nodesRef.current = nodes
    linksRef.current = links
    byId.current = map

    sim.current?.stop()
    const s = forceSimulation<SimNode, SimLink>(nodes)
      .force(
        'link',
        forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance((l) => (l.why === 'part' ? 34 : l.why === 'idea' ? 70 : 90))
          .strength((l) => (l.why === 'part' ? 0.7 : l.why === 'idea' ? 0.12 : 0.2))
      )
      .force('charge', forceManyBody<SimNode>().strength((d) => -24 - Math.min(d.n.degree, 40) * 3).distanceMax(520))
      .force('collide', forceCollide<SimNode>((d) => d.r + 2.5))
      // Study gathers on the left, life on the right — two halves of one brain.
      .force('x', forceX<SimNode>((d) => (view === 'all' ? (d.n.side === 'study' ? -240 : d.n.side === 'life' ? 240 : 0) : 0)).strength(0.045))
      .force('y', forceY<SimNode>(0).strength(0.05))
      .alphaDecay(0.028)
      .on('tick', () => (dirty.current = true))
    if (positions.current.size === 0) s.tick(60) // a head start so it doesn't open as a tangle
    sim.current = s
    dirty.current = true
    return () => {
      s.stop()
    }
  }, [brain, view, hiddenKinds, revealKey])

  // Fit the view the first time.
  const fitted = useRef(false)
  const zoomTo = useCallback((ids: string[] | null, maxK = 2.2) => {
    const pts = (ids ? ids.map((id) => byId.current.get(id)).filter((n): n is SimNode => !!n) : nodesRef.current).filter((n) => n.x != null)
    if (!pts.length) return
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity
    for (const p of pts) {
      x0 = Math.min(x0, p.x!)
      y0 = Math.min(y0, p.y!)
      x1 = Math.max(x1, p.x!)
      y1 = Math.max(y1, p.y!)
    }
    const { w, h } = size.current
    const pad = 120
    const k = Math.min(maxK, Math.max(0.15, Math.min((w - pad * 2) / Math.max(1, x1 - x0), (h - pad * 2) / Math.max(1, y1 - y0))))
    const to = { k, x: w / 2 - ((x0 + x1) / 2) * k + (ids ? 130 : 0), y: h / 2 - ((y0 + y1) / 2) * k }
    anim.current = { from: { ...t.current }, to, start: performance.now() }
  }, [])

  useEffect(() => {
    if (fitted.current || !nodesRef.current.length) return
    fitted.current = true
    const id = setTimeout(() => zoomTo(null, 1.4), 60)
    return () => clearTimeout(id)
  }, [brain, zoomTo])

  // Focus from an answer: light those dots up and fly to them.
  useEffect(() => {
    state.current.focus = focus && focus.length ? new Set(focus) : null
    dirty.current = true
    if (focus && focus.length) {
      const id = setTimeout(() => zoomTo(focus.slice(0, 40)), 120)
      return () => clearTimeout(id)
    }
    return undefined
  }, [focus, zoomTo])

  useEffect(() => {
    state.current.selected = selected
    dirty.current = true
    if (selected && byId.current.has(selected) && !state.current.focus?.has(selected)) {
      const n = byId.current.get(selected)!
      const { w, h } = size.current
      const k = Math.max(t.current.k, 1.2)
      anim.current = { from: { ...t.current }, to: { k, x: w / 2 - n.x! * k - 120, y: h / 2 - n.y! * k }, start: performance.now() }
    }
  }, [selected])

  // Size the canvas to its box.
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const c = canvas.current!
      const dpr = window.devicePixelRatio || 1
      size.current = { w: el.clientWidth, h: el.clientHeight }
      c.width = el.clientWidth * dpr
      c.height = el.clientHeight * dpr
      c.style.width = `${el.clientWidth}px`
      c.style.height = `${el.clientHeight}px`
      if (!fitted.current) t.current = { x: el.clientWidth / 2, y: el.clientHeight / 2, k: 0.8 }
      dirty.current = true
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Draw loop.
  useEffect(() => {
    let raf = 0
    let colors = themeColors()
    const themeTimer = setInterval(() => {
      const c = themeColors()
      if (c.canvas !== colors.canvas) {
        colors = c
        dirty.current = true
      }
    }, 1000)
    const draw = (now: number): void => {
      raf = requestAnimationFrame(draw)
      if (anim.current) {
        const p = Math.min(1, (now - anim.current.start) / 450)
        const e = 1 - Math.pow(1 - p, 3)
        const { from, to } = anim.current
        t.current = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, k: from.k + (to.k - from.k) * e }
        dirty.current = true
        if (p >= 1) anim.current = null
      }
      if (!dirty.current) return
      dirty.current = false
      const c = canvas.current
      if (!c) return
      const g = c.getContext('2d')!
      const dpr = window.devicePixelRatio || 1
      const { x, y, k } = t.current
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.clearRect(0, 0, c.width, c.height)
      g.setTransform(dpr * k, 0, 0, dpr * k, dpr * x, dpr * y)

      const focus = state.current.focus
      const sel = state.current.selected
      const hov = hover.current?.id ?? null
      const lit = new Set<string>()
      const centre = hov ?? sel
      if (centre) {
        lit.add(centre)
        for (const id of brain.adj.get(centre) ?? []) lit.add(id)
      }
      const dimming = !!focus || !!centre
      const isLit = (id: string): boolean => (focus ? focus.has(id) : false) || lit.has(id)

      // Links
      g.lineWidth = 1 / k
      for (const l of linksRef.current) {
        const a = l.source as SimNode
        const b = l.target as SimNode
        const on = centre ? (a.id === centre || b.id === centre) : focus ? focus.has(a.id) && focus.has(b.id) : false
        g.strokeStyle = on ? colors.brass : colors.ink
        g.globalAlpha = on ? 0.75 : dimming ? 0.035 : l.why === 'part' ? 0.16 : 0.09
        g.beginPath()
        g.moveTo(a.x!, a.y!)
        g.lineTo(b.x!, b.y!)
        g.stroke()
      }
      // Dots
      for (const n of nodesRef.current) {
        const on = isLit(n.id)
        g.globalAlpha = dimming && !on ? 0.16 : 1
        g.fillStyle = lift(n.n.color, colors.dark)
        g.beginPath()
        if (n.n.kind === 'idea') {
          // ideas are diamonds
          g.moveTo(n.x!, n.y! - n.r * 1.2)
          g.lineTo(n.x! + n.r * 1.2, n.y!)
          g.lineTo(n.x!, n.y! + n.r * 1.2)
          g.lineTo(n.x! - n.r * 1.2, n.y!)
          g.closePath()
        } else g.arc(n.x!, n.y!, n.r, 0, Math.PI * 2)
        g.fill()
        if (n.n.kind === 'module' || n.n.kind === 'person') {
          g.lineWidth = 1.6 / k
          g.strokeStyle = colors.canvas
          g.stroke()
        }
        if (n.id === sel || n.id === hov) {
          g.globalAlpha = 1
          g.lineWidth = 2 / k
          g.strokeStyle = colors.brass
          g.beginPath()
          g.arc(n.x!, n.y!, n.r + 3 / k, 0, Math.PI * 2)
          g.stroke()
        }
      }
      // Labels: big dots always, the rest when zoomed in or lit up
      g.textAlign = 'center'
      g.textBaseline = 'top'
      const fontPx = 11.5 / k
      const big = (n: SimNode): boolean => n.n.kind === 'module' || n.n.kind === 'person' || n.n.degree >= 12
      const rank = (n: SimNode): number => (n.id === hov || n.id === sel ? 1e6 : 0) + (isLit(n.id) ? 1e5 : 0) + (big(n) ? 1e4 : 0) + n.n.degree * 10 + n.r
      const candidates = nodesRef.current
        .filter((n) => n.id === hov || n.id === sel || isLit(n.id) || (!dimming && (big(n) ? k > 0.3 : k * n.r > 5 || (n.n.kind === 'idea' && n.n.degree >= 3 && k > 0.6))))
        .sort((a, b) => rank(b) - rank(a))
        .slice(0, 160)
      const placed: [number, number, number, number][] = []
      for (const n of candidates) {
        const on = isLit(n.id)
        const strong = n.id === hov || n.id === sel || big(n)
        const label0 = n.n.label.length > 34 ? `${n.n.label.slice(0, 33)}…` : n.n.label
        g.font = `${strong ? 600 : 450} ${fontPx}px 'Instrument Sans Variable', system-ui, sans-serif`
        const w = g.measureText(label0).width
        const box: [number, number, number, number] = [n.x! - w / 2 - 2 / k, n.y! + n.r + 2 / k, n.x! + w / 2 + 2 / k, n.y! + n.r + 3 / k + fontPx * 1.15]
        const must = n.id === hov || n.id === sel
        if (!must && placed.some((p) => box[0] < p[2] && box[2] > p[0] && box[1] < p[3] && box[3] > p[1])) continue
        placed.push(box)
        g.globalAlpha = dimming && !on && n.id !== hov ? 0.25 : 1
        const label = label0
        g.lineWidth = 3 / k
        g.strokeStyle = colors.canvas
        g.strokeText(label, n.x!, n.y! + n.r + 3 / k)
        g.fillStyle = strong ? colors.ink : colors.muted
        g.fillText(label, n.x!, n.y! + n.r + 3 / k)
      }
      g.globalAlpha = 1
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      clearInterval(themeTimer)
    }
  }, [brain])

  // Mouse: pan, zoom, hover, drag dots, click, double-click.
  useEffect(() => {
    const c = canvas.current!
    const toWorld = (e: MouseEvent): [number, number] => {
      const r = c.getBoundingClientRect()
      return [(e.clientX - r.left - t.current.x) / t.current.k, (e.clientY - r.top - t.current.y) / t.current.k]
    }
    const pick = (e: MouseEvent): SimNode | null => {
      const [wx, wy] = toWorld(e)
      let best: SimNode | null = null
      let bd = Infinity
      for (const n of nodesRef.current) {
        const d = Math.hypot(n.x! - wx, n.y! - wy)
        if (d < n.r + 4 / t.current.k && d < bd) {
          best = n
          bd = d
        }
      }
      return best
    }
    let drag: { node: SimNode | null; sx: number; sy: number; tx: number; ty: number; moved: boolean } | null = null
    const down = (e: MouseEvent): void => {
      if (e.button !== 0) return
      const node = pick(e)
      drag = { node, sx: e.clientX, sy: e.clientY, tx: t.current.x, ty: t.current.y, moved: false }
      anim.current = null
      if (node) {
        node.fx = node.x
        node.fy = node.y
      }
    }
    const move = (e: MouseEvent): void => {
      if (drag) {
        if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 3) drag.moved = true
        if (drag.node) {
          const [wx, wy] = toWorld(e)
          drag.node.fx = wx
          drag.node.fy = wy
          if (drag.moved) sim.current?.alphaTarget(0.25).restart()
        } else {
          t.current = { ...t.current, x: drag.tx + e.clientX - drag.sx, y: drag.ty + e.clientY - drag.sy }
        }
        dirty.current = true
        return
      }
      const h = pick(e)
      if (h !== hover.current) {
        hover.current = h
        c.style.cursor = h ? 'pointer' : 'grab'
        dirty.current = true
      }
    }
    const up = (): void => {
      if (!drag) return
      if (drag.node) {
        drag.node.fx = null
        drag.node.fy = null
        sim.current?.alphaTarget(0)
        if (!drag.moved) onSelectRef.current(drag.node.id)
      } else if (!drag.moved) onSelectRef.current(null)
      drag = null
    }
    const dbl = (e: MouseEvent): void => {
      const n = pick(e)
      if (n) onOpenRef.current(n.n)
    }
    const wheel = (e: WheelEvent): void => {
      e.preventDefault()
      anim.current = null
      const r = c.getBoundingClientRect()
      const mx = e.clientX - r.left
      const my = e.clientY - r.top
      const k = Math.min(6, Math.max(0.08, t.current.k * Math.exp(-e.deltaY * 0.0015)))
      const f = k / t.current.k
      t.current = { k, x: mx - (mx - t.current.x) * f, y: my - (my - t.current.y) * f }
      dirty.current = true
    }
    const leave = (): void => {
      hover.current = null
      dirty.current = true
    }
    c.addEventListener('mousedown', down)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    c.addEventListener('dblclick', dbl)
    c.addEventListener('wheel', wheel, { passive: false })
    c.addEventListener('mouseleave', leave)
    return () => {
      c.removeEventListener('mousedown', down)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      c.removeEventListener('dblclick', dbl)
      c.removeEventListener('wheel', wheel)
      c.removeEventListener('mouseleave', leave)
    }
  }, [])

  return (
    <div ref={wrap} className="absolute inset-0 overflow-hidden" style={{ cursor: 'grab' }}>
      <canvas ref={canvas} className="block" />
      <div className="absolute right-4 bottom-4 flex gap-1">
        <button className="btn px-2 py-1 text-xs" onClick={() => zoomTo(null, 1.4)} title="Show everything">
          <Icon name="brain" size={13} /> Fit
        </button>
      </div>
    </div>
  )
}
