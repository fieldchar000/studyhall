// Mindmaps: a list page and a canvas editor (React Flow). Every change autosaves.
// Nodes can link to a real module, note or task.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { MindmapEdge, MindmapNode, NodeLinkType } from '@shared/types'
import { AutoText } from '@/components/AutoField'
import { ColorPicker, Icon } from '@/components/ui'
import { api, db, useLive } from '@/lib/data'
import { navigate } from '@/lib/nav'
import { useMode } from '@/lib/profile'
import { openTask } from '@/lib/tasks'
import { radialLayout, type GenNode } from '@/lib/mindgen'
import { splitSentences } from '@/lib/nlp'
import { generateJSON } from '@tiptap/core'
import { NOTE_EXTENSIONS, htmlToPlain } from '@/lib/noteSchema'
import { MindmapGenerator } from '@/components/MindmapGenerator'

// ---------- List ----------

export function MindmapsPage(): React.JSX.Element {
  const mode = useMode()
  const { data } = useLive(
    ['mindmaps', 'mindmap_nodes', 'modules'],
    async () => {
      const [maps, modules] = await Promise.all([api.list('mindmaps', { mode }, 'updated_at'), api.list('modules')])
      const counts = await Promise.all(maps.map((m) => api.list('mindmap_nodes', { mindmap_id: m.id }).then((n) => n.length)))
      const rows = maps.map((m, i) => ({ map: m, nodes: counts[i], module: modules.find((x) => x.id === m.module_id) }))
      return rows.reverse() // most recently edited first
    },
    [mode]
  )

  const [gen, setGen] = useState(false)
  const add = async (): Promise<void> => {
    const map = await db.create('mindmaps', { title: 'New mindmap', mode })
    await db.create('mindmap_nodes', { mindmap_id: map.id, label: 'Central idea', x: 0, y: 0, color: '#5b5bd6' })
    navigate({ name: 'mindmap', id: map.id })
  }

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-6 flex items-center">
        <h1 className="flex-1 text-2xl font-semibold tracking-tight">Mindmaps</h1>
        <button className="btn mr-2" onClick={() => void add()}>
          <Icon name="plus" /> Blank mindmap
        </button>
        <button className="btn-primary" onClick={() => setGen(true)}>
          <Icon name="spark" /> Generate from sources
        </button>
      </div>
      {gen && <MindmapGenerator onClose={() => setGen(false)} />}
      {data?.length === 0 && (
        <div className="card flex flex-col items-center gap-3 p-10 text-center text-muted">
          <div className="text-3xl">🧠</div>
          Map out a topic visually — or let Studyhall build one from your lecture slides, PDFs, notes or news articles.
          <button className="btn-primary" onClick={() => setGen(true)}>
            <Icon name="spark" /> Generate a mindmap
          </button>
        </div>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
        {data?.map(({ map, nodes, module }) => (
          <button key={map.id} className="card p-4 text-left hover:shadow-md" onClick={() => navigate({ name: 'mindmap', id: map.id })}>
            <div className="flex items-center gap-2">
              <Icon name="mindmap" className="text-accent" />
              <span className="truncate font-semibold">{map.title}</span>
            </div>
            <div className="mt-2 text-xs text-muted">
              {nodes} ideas{module && ` · ${module.code || module.name}`}
              {map.sources && map.sources !== '[]' && <span className="chip ml-2">✨ generated</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------- Editor ----------

type IdeaData = {
  label: string
  color: string | null
  linkType: NodeLinkType | null
  linkId: string | null
  kind: MindmapNode['kind']
  detail: string
  url: string
  source: string
  collapsed: boolean
  childCount: number
  onToggle?: () => void
}
type IdeaNode = Node<IdeaData, 'idea'>

const toFlowNode = (n: MindmapNode): IdeaNode => ({
  id: n.id,
  type: 'idea',
  position: { x: n.x, y: n.y },
  data: { label: n.label, color: n.color, linkType: n.link_type, linkId: n.link_id, kind: n.kind ?? '', detail: n.detail ?? '', url: n.url ?? '', source: n.source ?? '', collapsed: !!n.collapsed, childCount: 0 }
})
const toFlowEdge = (e: MindmapEdge): Edge => ({ id: e.id, source: e.source_node_id, target: e.target_node_id, label: e.label || undefined, data: { kind: e.kind ?? '' } })

const LINK_ICON: Record<NodeLinkType, string> = { module: 'modules', note: 'note', task: 'tasks' }

/** Draws the visible map onto a canvas (in the current theme) and returns it as a PNG. */
async function drawMap(nodes: IdeaNode[], edges: Edge[]): Promise<Blob> {
  const css = getComputedStyle(document.documentElement)
  const token = (name: string, fallback: string): string => css.getPropertyValue(name).trim() || fallback
  const bg = token('--color-canvas', '#ffffff')
  const panel = token('--color-panel', '#ffffff')
  const ink = token('--color-ink', '#111111')
  const accent = token('--color-accent', '#7357ff')
  const font = getComputedStyle(document.body).fontFamily
  const box = new Map(nodes.map((n) => [n.id, { x: n.position.x, y: n.position.y, w: n.measured?.width ?? 200, h: n.measured?.height ?? 50 }]))
  const PAD = 60
  const xs = [...box.values()]
  const minX = Math.min(...xs.map((b) => b.x)) - PAD
  const minY = Math.min(...xs.map((b) => b.y)) - PAD
  const W = Math.max(...xs.map((b) => b.x + b.w)) + PAD - minX
  const H = Math.max(...xs.map((b) => b.y + b.h)) + PAD - minY
  const scale = Math.min(2, 8000 / W, 8000 / H)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(W * scale)
  canvas.height = Math.round(H * scale)
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)
  ctx.translate(-minX, -minY)
  ctx.fillStyle = bg
  ctx.fillRect(minX, minY, W, H)
  const colorOf = new Map(nodes.map((n) => [n.id, n.data.color || accent]))
  // Lines first, so boxes sit on top.
  for (const e of edges) {
    const a = box.get(e.source)
    const b = box.get(e.target)
    if (!a || !b) continue
    const related = (e.data as { kind?: string } | undefined)?.kind === 'related'
    const [ax, ay, bx, by] = [a.x + a.w / 2, a.y + a.h / 2, b.x + b.w / 2, b.y + b.h / 2]
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.bezierCurveTo((ax + bx) / 2, ay, (ax + bx) / 2, by, bx, by)
    ctx.strokeStyle = related ? ink : (colorOf.get(e.target) ?? accent)
    ctx.globalAlpha = related ? 0.35 : 0.7
    ctx.lineWidth = related ? 1 : 1.6
    ctx.setLineDash(related ? [5, 5] : [])
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  ctx.setLineDash([])
  const wrap = (text: string, max: number): string[] => {
    const lines: string[] = []
    let line = ''
    for (const word of text.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word
      if (ctx.measureText(next).width > max && line) {
        lines.push(line)
        line = word
      } else line = next
    }
    if (line) lines.push(line)
    return lines
  }
  for (const n of nodes) {
    const b = box.get(n.id)!
    const color = colorOf.get(n.id)!
    const center = n.data.kind === 'center'
    const big = center || ['theme', 'source', 'branch', 'group', ''].includes(n.data.kind)
    ctx.beginPath()
    ctx.roundRect(b.x, b.y, b.w, b.h, center ? 16 : 10)
    ctx.fillStyle = center ? color : panel
    ctx.fill()
    if (!center && big) {
      ctx.globalAlpha = 0.18
      ctx.fillStyle = color
      ctx.fill()
      ctx.globalAlpha = 1
    }
    ctx.strokeStyle = color
    ctx.lineWidth = center ? 0 : big ? 2 : 1.4
    if (!center) ctx.stroke()
    const size = center ? 16 : big ? 13 : 11.5
    ctx.font = `${big ? 700 : 500} ${size}px ${font}`
    ctx.fillStyle = center ? '#ffffff' : ink
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const lines = wrap(n.data.label, b.w - 20)
    const lh = size * 1.3
    lines.forEach((l, i) => ctx.fillText(l, b.x + b.w / 2, b.y + b.h / 2 + (i - (lines.length - 1) / 2) * lh))
  }
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not create the image'))), 'image/png'))
}

function IdeaNodeView({ data, selected }: NodeProps<IdeaNode>): React.JSX.Element {
  const color = data.color ?? 'var(--color-accent)'
  const ring = selected ? 'ring-2 ring-accent ring-offset-2 ring-offset-canvas' : ''
  const toggle = data.childCount > 0 && (
    <button
      className="nodrag absolute top-1/2 -right-3 flex h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-panel px-1 text-[10px] font-bold text-muted shadow-sm hover:text-ink"
      title={data.collapsed ? 'Show branch' : 'Hide branch'}
      onClick={(e) => {
        e.stopPropagation()
        data.onToggle?.()
      }}
    >
      {data.collapsed ? `+${data.childCount}` : '−'}
    </button>
  )
  const marks = (
    <>
      {(data.detail || data.url || data.linkType) && (
        <div className="mt-1 flex items-center justify-center gap-1.5 text-[10px] opacity-70">
          {data.detail && <span title="Has details">ⓘ</span>}
          {data.url && <span title="Has a source link">↗</span>}
          {data.linkType && <Icon name={LINK_ICON[data.linkType]} size={10} />}
        </div>
      )}
    </>
  )
  if (data.kind === 'center') {
    return (
      <div
        className={`relative max-w-72 rounded-2xl px-5 py-3 text-center text-base font-bold text-white shadow-lg ${ring}`}
        style={{ background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-2))', fontFamily: 'var(--font-display)' }}
      >
        <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-white/70" />
        <div className="break-words whitespace-pre-wrap">{data.label || '…'}</div>
        <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-white" />
        {toggle}
      </div>
    )
  }
  const big = data.kind === 'theme' || data.kind === 'source' || data.kind === 'branch' || data.kind === 'group' || data.kind === ''
  return (
    <div
      className={`relative rounded-xl border-2 px-3 py-2 text-center shadow-sm ${big ? 'min-w-28 max-w-60 text-sm font-semibold' : 'max-w-64 text-xs'} ${ring}`}
      style={{ borderColor: color, background: big && data.kind ? `color-mix(in srgb, ${color} 14%, var(--color-panel))` : 'var(--color-panel)' }}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0" style={{ background: color }} />
      {data.kind === 'source' && <div className="mb-0.5 text-[10px] font-medium tracking-wide uppercase opacity-60">source</div>}
      <div className="break-words whitespace-pre-wrap">{data.label || '…'}</div>
      {marks}
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0" style={{ background: color }} />
      {toggle}
    </div>
  )
}
const nodeTypes = { idea: IdeaNodeView }

export function MindmapEditorPage({ id }: { id: string }): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <MindmapEditor id={id} />
    </ReactFlowProvider>
  )
}

/** Children along branch (non-cross-link) edges. */
function treeChildren(edges: Edge[]): Map<string, string[]> {
  const m = new Map<string, string[]>()
  for (const e of edges) if ((e.data as { kind?: string } | undefined)?.kind !== 'related') m.set(e.source, [...(m.get(e.source) ?? []), e.target])
  return m
}

function MindmapEditor({ id }: { id: string }): React.JSX.Element {
  const mode = useMode()
  const flow = useReactFlow()
  const [nodes, setNodes, onNodesChange] = useNodesState<IdeaNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [loaded, setLoaded] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focus, setFocus] = useState(true)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const { data: map } = useLive(['mindmaps'], () => api.get('mindmaps', id), [id])
  const modules = useLive(['modules'], () => api.list('modules', { archived: 0 }, 'sort'), []).data ?? []

  // Load once; after that the canvas is the source of truth and every change is written to the DB.
  useEffect(() => {
    void Promise.all([api.list('mindmap_nodes', { mindmap_id: id }), api.list('mindmap_edges', { mindmap_id: id })]).then(([n, e]) => {
      setNodes(n.map(toFlowNode))
      setEdges(e.map(toFlowEdge))
      setLoaded(true)
    })
  }, [id, setNodes, setEdges])

  const toggleCollapse = useCallback(
    (nodeId: string) => {
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== nodeId) return n
          void db.update('mindmap_nodes', nodeId, { collapsed: n.data.collapsed ? 0 : 1 })
          return { ...n, data: { ...n.data, collapsed: !n.data.collapsed } }
        })
      )
    },
    [setNodes]
  )

  // What's visible (collapsed branches hide their descendants) and what's in focus.
  const view = useMemo(() => {
    const kids = treeChildren(edges)
    const hidden = new Set<string>()
    const hide = (nid: string): void => {
      for (const c of kids.get(nid) ?? []) {
        if (hidden.has(c)) continue
        hidden.add(c)
        hide(c)
      }
    }
    for (const n of nodes) if (n.data.collapsed) hide(n.id)
    const near = new Set<string>()
    if (focus && selectedId) {
      near.add(selectedId)
      for (const e of edges) {
        if (e.source === selectedId) near.add(e.target)
        if (e.target === selectedId) near.add(e.source)
      }
    }
    const colorOf = new Map(nodes.map((n) => [n.id, n.data.color]))
    return {
      nodes: nodes.map((n) => ({
        ...n,
        hidden: hidden.has(n.id),
        style: near.size && !near.has(n.id) ? { opacity: 0.22, transition: 'opacity .2s' } : { opacity: 1, transition: 'opacity .2s' },
        data: { ...n.data, childCount: (kids.get(n.id) ?? []).length, onToggle: () => toggleCollapse(n.id) }
      })),
      edges: edges.map((e) => {
        const related = (e.data as { kind?: string } | undefined)?.kind === 'related'
        const lit = !near.size || (near.has(e.source) && near.has(e.target) && (e.source === selectedId || e.target === selectedId))
        return {
          ...e,
          hidden: hidden.has(e.source) || hidden.has(e.target),
          animated: related,
          style: {
            stroke: related ? 'var(--color-muted)' : (colorOf.get(e.target) ?? 'var(--color-muted)'),
            strokeWidth: related ? 1.2 : 2,
            strokeDasharray: related ? '5 5' : undefined,
            opacity: lit ? (related ? 0.7 : 0.85) : 0.08
          },
          labelStyle: { fontSize: 10, fill: 'var(--color-muted)' },
          labelBgStyle: { fill: 'var(--color-panel)' }
        }
      })
    }
  }, [nodes, edges, focus, selectedId, toggleCollapse])

  const addIdea = useCallback(
    async (position?: { x: number; y: number }, parentId?: string) => {
      const pane = document.querySelector('.react-flow')?.getBoundingClientRect()
      const parent = parentId ? flow.getNode(parentId) : undefined
      let pos = position
      if (!pos && parent) {
        // Children go to the right of the parent, fanning out above/below: 0, +90, -90, +180…
        const n = flow.getEdges().filter((e) => e.source === parentId).length
        const offset = n === 0 ? 0 : Math.ceil(n / 2) * 90 * (n % 2 ? 1 : -1)
        pos = { x: parent.position.x + 240, y: parent.position.y + offset }
      }
      pos ??= flow.screenToFlowPosition({ x: (pane?.left ?? 0) + (pane?.width ?? 600) / 2, y: (pane?.top ?? 0) + (pane?.height ?? 400) / 2 })
      const color = parent ? (parent.data as IdeaData).color : null
      const row = await db.create('mindmap_nodes', { mindmap_id: id, label: 'New idea', x: pos.x, y: pos.y, color, kind: parent ? 'leaf' : '' })
      // Keep the parent selected so "Add connected idea" can be pressed repeatedly.
      setNodes((ns) => [...ns, { ...toFlowNode(row), selected: !parentId }])
      if (parentId) {
        const edge = await db.create('mindmap_edges', { mindmap_id: id, source_node_id: parentId, target_node_id: row.id })
        setEdges((es) => [...es, toFlowEdge(edge)])
      } else {
        setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === row.id })))
        setSelectedId(row.id)
      }
    },
    [flow, id, setNodes, setEdges]
  )

  const onConnect = useCallback(
    async (c: Connection) => {
      if (!c.source || !c.target || c.source === c.target) return
      const edge = await db.create('mindmap_edges', { mindmap_id: id, source_node_id: c.source, target_node_id: c.target })
      setEdges((es) => [...es, toFlowEdge(edge)])
    },
    [id, setEdges]
  )

  /** Tidy everything into a radial layout around the central idea. */
  const arrange = (): void => {
    const kids = treeChildren(edges)
    const hasParent = new Set([...kids.values()].flat())
    const root = nodes.find((n) => n.data.kind === 'center') ?? nodes.find((n) => !hasParent.has(n.id)) ?? nodes[0]
    if (!root) return
    const parent = new Map<string, string | null>([[root.id, null]])
    const queue = [root.id]
    while (queue.length) {
      const cur = queue.shift()!
      const next = [...(kids.get(cur) ?? []), ...edges.filter((e) => e.target === cur).map((e) => e.source), ...edges.filter((e) => e.source === cur).map((e) => e.target)]
      for (const c of next) if (!parent.has(c)) parent.set(c, cur) && queue.push(c)
    }
    const gen: GenNode[] = nodes
      .filter((n) => parent.has(n.id))
      .map((n) => ({ key: n.id, parent: parent.get(n.id) ?? null, label: n.data.label, kind: 'leaf', detail: '', url: '', source: '', color: '', x: 0, y: 0 }))
    radialLayout(gen)
    const pos = new Map(gen.map((g) => [g.key, { x: g.x, y: g.y }]))
    setNodes((ns) => ns.map((n) => (pos.has(n.id) ? { ...n, position: pos.get(n.id)! } : n)))
    for (const [nid, p] of pos) void db.update('mindmap_nodes', nid, { x: p.x, y: p.y })
    setTimeout(() => void flow.fitView({ padding: 0.15, duration: 500 }), 250)
  }

  /** Find an idea by text and fly to it. */
  const find = (q: string): void => {
    const hit = nodes.find((n) => !n.hidden && n.data.label.toLowerCase().includes(q.toLowerCase()))
    if (!hit) return
    setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === hit.id })))
    setSelectedId(hit.id)
    void flow.setCenter(hit.position.x + 100, hit.position.y + 30, { zoom: 1.1, duration: 500 })
  }

  const setAllCollapsed = (collapsed: boolean): void => {
    const kids = treeChildren(edges)
    setNodes((ns) =>
      ns.map((n) => {
        // Collapse the main branches (children of the centre); expanding opens everything.
        const isBranch = (kids.get(n.id) ?? []).length > 0 && n.data.kind !== 'center'
        const want = collapsed ? isBranch : false
        if (n.data.collapsed !== want) void db.update('mindmap_nodes', n.id, { collapsed: want ? 1 : 0 })
        return { ...n, data: { ...n.data, collapsed: want } }
      })
    )
  }

  /** Save the whole map as a PNG image. */
  const exportPng = async (): Promise<void> => {
    setBusy('Exporting…')
    try {
      const blob = await drawMap(
        flow.getNodes().filter((n) => !n.hidden) as IdeaNode[],
        flow.getEdges().filter((e) => !e.hidden)
      )
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${(map?.title || 'mindmap').replace(/[\\/:*?"<>|]+/g, ' ').trim()}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
    } finally {
      setBusy(null)
    }
  }

  /** The map as a structured note: branches become headings and nested bullets. */
  const toNote = async (): Promise<void> => {
    const kids = treeChildren(edges)
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const hasParent = new Set([...kids.values()].flat())
    const root = nodes.find((n) => n.data.kind === 'center') ?? nodes.find((n) => !hasParent.has(n.id))
    if (!root) return
    const esc = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const item = (id: string, depth: number): string => {
      const n = byId.get(id)
      if (!n) return ''
      // Shortened labels ("…") give way to the full sentence they came from (keeping a "1974 — " prefix);
      // short labels (a theme, a name) keep their label and get the sentence as an explanation.
      const { label, detail } = n.data
      const usable = !!detail && detail !== label && detail.length < 600
      const prefix = /^(.{1,24}?) — /.exec(label)?.[1]
      const term = /^([^:]{2,40}): /.exec(label)?.[1] // "Working memory: a system that…"
      const text = !usable
        ? esc(label)
        : term
          ? `<strong>${esc(term)}</strong> — ${esc(detail)}`
        : label.endsWith('…') || detail.startsWith(label.replace(/…$/, ''))
          ? esc(prefix && !detail.includes(prefix) ? `${prefix} — ${detail}` : detail)
          : `<strong>${esc(label)}</strong> — ${esc(detail)}`
      const children = (kids.get(id) ?? []).map((c) => item(c, depth + 1)).join('')
      const src = n.data.url ? ` <a href="${esc(n.data.url)}">↗</a>` : ''
      return `<li><p>${text}${src}</p>${children ? `<ul>${children}</ul>` : ''}</li>`
    }
    let html = `<h1>${esc(root.data.label)}</h1><p><em>Made from the mindmap “${esc(map?.title ?? root.data.label)}”.</em></p>`
    for (const c of kids.get(root.id) ?? []) {
      const n = byId.get(c)
      if (!n) continue
      html += `<h2>${esc(n.data.label)}</h2>`
      const sub = (kids.get(c) ?? []).map((g) => item(g, 1)).join('')
      if (sub) html += `<ul>${sub}</ul>`
      else if (n.data.detail) html += `<p>${esc(n.data.detail)}</p>`
    }
    const json = generateJSON(html, NOTE_EXTENSIONS)
    const plain = htmlToPlain(html)
    const note = await db.create('notes', { mode, title: map?.title ?? root.data.label, content: JSON.stringify(json), plain_text: plain })
    navigate({ name: 'notes', id: note.id })
  }

  const sources = useMemo(() => {
    try {
      return (JSON.parse(map?.sources ?? '[]') as { title: string; url?: string; noteId?: string | null; text?: string }[]).filter((x) => x.text)
    } catch {
      return []
    }
  }, [map?.sources])

  const selected = nodes.find((n) => n.id === selectedId)
  const updateNode = (nodeId: string, patch: Partial<IdeaData>): void => {
    setNodes((ns) => ns.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)))
    const dbPatch: Partial<MindmapNode> = {}
    if ('label' in patch) dbPatch.label = patch.label
    if ('color' in patch) dbPatch.color = patch.color
    if ('linkType' in patch) dbPatch.link_type = patch.linkType
    if ('linkId' in patch) dbPatch.link_id = patch.linkId
    if ('detail' in patch) dbPatch.detail = patch.detail
    void db.update('mindmap_nodes', nodeId, dbPatch)
  }

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-line px-4 py-2">
          <button className="btn-ghost" onClick={() => navigate({ name: 'mindmaps' })}>
            <Icon name="back" />
          </button>
          {map && (
            <AutoText value={map.title} onSave={(v) => db.update('mindmaps', id, { title: v || 'Untitled mindmap' })} className="field max-w-md min-w-40 font-semibold" />
          )}
          {map && mode === 'study' && (
            <select className="field-boxed w-auto text-sm" value={map.module_id ?? ''} onChange={(e) => void db.update('mindmaps', id, { module_id: e.target.value || null })}>
              <option value="">No module</option>
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code || m.name}
                </option>
              ))}
            </select>
          )}
          <div className="flex-1" />
          <input
            className="field-boxed w-40 py-1 text-sm"
            placeholder="Find an idea…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search.trim() && find(search.trim())}
          />
          <button className="btn-ghost text-xs whitespace-nowrap" onClick={() => setAllCollapsed(false)} title="Show every branch">
            Expand all
          </button>
          <button className="btn-ghost text-xs" onClick={() => setAllCollapsed(true)} title="Fold every branch to see the big picture">
            Collapse
          </button>
          <label className="flex items-center gap-1.5 text-xs text-muted" title="Dim everything not connected to the selected idea">
            <input type="checkbox" checked={focus} onChange={(e) => setFocus(e.target.checked)} /> Focus
          </label>
          <button className="btn" onClick={arrange} title="Arrange everything around the central idea">
            <Icon name="mindmap" /> Arrange
          </button>
          <button className="btn" onClick={() => void toNote()} title="Turn this map into a structured note">
            <Icon name="note" /> Notes
          </button>
          <button className="btn" disabled={!!busy} onClick={() => void exportPng()} title="Save the map as a picture">
            <Icon name="upload" /> {busy ?? 'PNG'}
          </button>
          <button className="btn" onClick={() => void addIdea(undefined, selectedId ?? undefined)}>
            <Icon name="plus" /> {selectedId ? 'Add connected idea' : 'Add idea'}
          </button>
          <button
            className="btn-ghost hover:text-danger"
            title="Delete mindmap"
            onClick={() => confirm('Delete this mindmap?') && void db.remove('mindmaps', id).then(() => navigate({ name: 'mindmaps' }))}
          >
            <Icon name="trash" />
          </button>
        </div>
        <div className="min-h-0 flex-1">
          {loaded && (
            <ReactFlow
              nodes={view.nodes}
              edges={view.edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={(c) => void onConnect(c)}
              onNodeDragStop={(_e, _n, dragged) =>
                dragged.forEach((n) => void db.update('mindmap_nodes', n.id, { x: Math.round(n.position.x), y: Math.round(n.position.y) }))
              }
              onNodesDelete={(ns) => {
                ns.forEach((n) => void db.remove('mindmap_nodes', n.id))
                setSelectedId(null)
              }}
              onEdgesDelete={(es) => es.forEach((e) => void db.remove('mindmap_edges', e.id))}
              onSelectionChange={({ nodes: sel }) => setSelectedId(sel.length === 1 ? sel[0].id : null)}
              onPaneClick={(e) => {
                if (e.detail === 2) void addIdea(flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }))
              }}
              zoomOnDoubleClick={false}
              deleteKeyCode={['Delete', 'Backspace']}
              colorMode="system"
              minZoom={0.15}
              fitView
              fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
            >
              <Background gap={22} />
              <Controls />
              <MiniMap pannable zoomable position="top-right" style={{ width: 150, height: 100 }} className="!bg-panel" nodeColor={(n) => (n.data as IdeaData).color ?? '#7357ff'} />
            </ReactFlow>
          )}
        </div>
        <div className="border-t border-line px-4 py-1.5 text-[11px] text-muted">
          Click an idea to focus its connections · the small button on an idea hides or shows its branch · double-click empty space to add · drag from a dot to connect · Delete removes
        </div>
      </div>

      {selected && <NodePanel key={selected.id} node={selected} mode={mode} sources={sources} onChange={(p) => updateNode(selected.id, p)} />}
    </div>
  )
}

/** Side panel for the selected idea: text, details, source, colour and link to a module/note/task. */
type MapSource = { title: string; url?: string; noteId?: string | null; text?: string }

/** Everything the map's sources say about an idea (sentences that mention it). */
function evidenceFor(label: string, sources: MapSource[]): { text: string; src: MapSource }[] {
  const term = label
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .split(/\s[·—:]\s|:\s/)[0]
    .trim()
  if (!term || term.split(' ').length > 6 || term.length < 3) return []
  const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
  const out: { text: string; src: MapSource }[] = []
  for (const src of sources) for (const s of splitSentences(src.text ?? '')) if (re.test(s)) out.push({ text: s, src })
  return out.slice(0, 25)
}

function NodePanel({ node, mode, sources, onChange }: { node: IdeaNode; mode: string; sources: MapSource[]; onChange: (p: Partial<IdeaData>) => void }): React.JSX.Element {
  const evidence = useMemo(() => evidenceFor(node.data.label, sources), [node.data.label, sources])
  const { linkType, linkId } = node.data
  const { data: targets } = useLive(
    ['modules', 'notes', 'tasks'],
    async () => {
      if (linkType === 'module') return (await api.list('modules', {}, 'sort')).map((m) => ({ id: m.id, label: m.code ? `${m.code} · ${m.name}` : m.name }))
      if (linkType === 'note') return (await api.list('notes', { mode: mode as 'study' }, 'title')).map((n) => ({ id: n.id, label: n.title }))
      if (linkType === 'task') return (await api.list('tasks', { mode: mode as 'study', parent_task_id: null }, 'title')).map((t) => ({ id: t.id, label: t.title }))
      return []
    },
    [linkType, mode]
  )
  const openLink = (): void => {
    if (!linkId) return
    if (linkType === 'module') navigate({ name: 'module', id: linkId })
    if (linkType === 'note') navigate({ name: 'notes', id: linkId })
    if (linkType === 'task') openTask(linkId)
  }
  return (
    <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-auto border-l border-line bg-panel/80 p-4 backdrop-blur">
      <h2 className="text-sm font-semibold">Idea</h2>
      <AutoText multiline rows={3} value={node.data.label} onSave={(v) => onChange({ label: v })} className="field-boxed" />
      {(node.data.detail || node.data.source) && (
        <div className="flex flex-col gap-2 rounded-xl bg-canvas/70 p-3 text-sm">
          {node.data.source && <div className="text-[11px] font-medium text-muted">From: {node.data.source}</div>}
          {node.data.detail && <p className="leading-relaxed">“{node.data.detail}”</p>}
          {node.data.url && (
            <button className="btn self-start" onClick={() => window.open(node.data.url)}>
              <Icon name="external" /> Open source
            </button>
          )}
        </div>
      )}
      {evidence.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-muted">
            Everything said about this · {evidence.length} mention{evidence.length === 1 ? '' : 's'}
          </span>
          <ul className="flex max-h-80 flex-col gap-2 overflow-auto">
            {evidence.map((e, i) => (
              <li key={i} className="rounded-lg bg-canvas/70 p-2 text-xs leading-relaxed">
                {e.text}
                <button
                  className="mt-1 block text-[10px] text-accent hover:underline"
                  onClick={() => (e.src.url ? window.open(e.src.url) : e.src.noteId ? navigate({ name: 'notes', id: e.src.noteId }) : undefined)}
                >
                  — {e.src.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted">Colour</span>
        <ColorPicker value={node.data.color} onChange={(c) => onChange({ color: c })} />
      </div>
      <div className="flex flex-col gap-2 text-sm">
        <span className="text-xs text-muted">Link to</span>
        <select className="field-boxed" value={linkType ?? ''} onChange={(e) => onChange({ linkType: (e.target.value || null) as NodeLinkType | null, linkId: null })}>
          <option value="">Nothing</option>
          {mode === 'study' && <option value="module">Module</option>}
          <option value="note">Note</option>
          <option value="task">Task</option>
        </select>
        {linkType && (
          <select className="field-boxed" value={linkId ?? ''} onChange={(e) => onChange({ linkId: e.target.value || null })}>
            <option value="">Choose…</option>
            {targets?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        )}
        {linkId && (
          <button className="btn self-start" onClick={openLink}>
            <Icon name="link" /> Open {linkType}
          </button>
        )}
      </div>
    </aside>
  )
}
