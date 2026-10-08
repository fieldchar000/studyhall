// Mindmaps: a list page and a canvas editor (React Flow). Every change autosaves.
// Nodes can link to a real module, note or task.

import { useCallback, useEffect, useState } from 'react'
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

  const add = async (): Promise<void> => {
    const map = await db.create('mindmaps', { title: 'New mindmap', mode })
    await db.create('mindmap_nodes', { mindmap_id: map.id, label: 'Central idea', x: 0, y: 0, color: '#5b5bd6' })
    navigate({ name: 'mindmap', id: map.id })
  }

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-6 flex items-center">
        <h1 className="flex-1 text-2xl font-semibold tracking-tight">Mindmaps</h1>
        <button className="btn-primary" onClick={() => void add()}>
          <Icon name="plus" /> New mindmap
        </button>
      </div>
      {data?.length === 0 && (
        <div className="card p-10 text-center text-muted">Map out a topic visually. Nodes can link to your modules, notes and tasks.</div>
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
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------- Editor ----------

type IdeaData = { label: string; color: string | null; linkType: NodeLinkType | null; linkId: string | null }
type IdeaNode = Node<IdeaData, 'idea'>

const toFlowNode = (n: MindmapNode): IdeaNode => ({
  id: n.id,
  type: 'idea',
  position: { x: n.x, y: n.y },
  data: { label: n.label, color: n.color, linkType: n.link_type, linkId: n.link_id }
})
const toFlowEdge = (e: MindmapEdge): Edge => ({ id: e.id, source: e.source_node_id, target: e.target_node_id })

const LINK_ICON: Record<NodeLinkType, string> = { module: 'modules', note: 'note', task: 'tasks' }

function IdeaNodeView({ data, selected }: NodeProps<IdeaNode>): React.JSX.Element {
  const color = data.color ?? 'var(--color-line)'
  return (
    <div
      className={`min-w-28 max-w-60 rounded-xl border-2 bg-panel px-3 py-2 text-center text-sm shadow-sm ${selected ? 'ring-2 ring-accent ring-offset-2 ring-offset-canvas' : ''}`}
      style={{ borderColor: color }}
    >
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !bg-muted" />
      <div className="font-medium break-words whitespace-pre-wrap">{data.label || '…'}</div>
      {data.linkType && (
        <div className="mt-1 flex items-center justify-center gap-1 text-[10px] text-accent">
          <Icon name={LINK_ICON[data.linkType]} size={11} /> linked {data.linkType}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !bg-accent" />
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

function MindmapEditor({ id }: { id: string }): React.JSX.Element {
  const mode = useMode()
  const flow = useReactFlow()
  const [nodes, setNodes, onNodesChange] = useNodesState<IdeaNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [loaded, setLoaded] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
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
      const row = await db.create('mindmap_nodes', { mindmap_id: id, label: 'New idea', x: pos.x, y: pos.y })
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

  const selected = nodes.find((n) => n.id === selectedId)
  const updateNode = (nodeId: string, patch: Partial<IdeaData>): void => {
    setNodes((ns) => ns.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)))
    const dbPatch: Partial<MindmapNode> = {}
    if ('label' in patch) dbPatch.label = patch.label
    if ('color' in patch) dbPatch.color = patch.color
    if ('linkType' in patch) dbPatch.link_type = patch.linkType
    if ('linkId' in patch) dbPatch.link_id = patch.linkId
    void db.update('mindmap_nodes', nodeId, dbPatch)
  }

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2">
          <button className="btn-ghost" onClick={() => navigate({ name: 'mindmaps' })}>
            <Icon name="back" />
          </button>
          {map && (
            <AutoText value={map.title} onSave={(v) => db.update('mindmaps', id, { title: v || 'Untitled mindmap' })} className="field max-w-md font-semibold" />
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
              nodes={nodes}
              edges={edges}
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
              fitView
              fitViewOptions={{ maxZoom: 1, padding: 0.3 }}
            >
              <Background gap={20} />
              <Controls />
              <MiniMap pannable zoomable position="top-right" style={{ width: 140, height: 90 }} className="!bg-panel" />
            </ReactFlow>
          )}
        </div>
        <div className="border-t border-line px-4 py-1.5 text-[11px] text-muted">
          Double-click empty space to add an idea · drag from a node's right dot to another node to connect · select + Delete to remove
        </div>
      </div>

      {selected && <NodePanel key={selected.id} node={selected} mode={mode} onChange={(p) => updateNode(selected.id, p)} />}
    </div>
  )
}

/** Side panel for the selected idea: text, colour and link to a module/note/task. */
function NodePanel({ node, mode, onChange }: { node: IdeaNode; mode: string; onChange: (p: Partial<IdeaData>) => void }): React.JSX.Element {
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
    <aside className="flex w-72 shrink-0 flex-col gap-4 border-l border-line bg-panel p-4">
      <h2 className="text-sm font-semibold">Idea</h2>
      <AutoText multiline rows={3} value={node.data.label} onSave={(v) => onChange({ label: v })} className="field-boxed" />
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
            <Icon name="link" /> Open
          </button>
        )}
      </div>
    </aside>
  )
}
