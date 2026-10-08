import { useState } from 'react'
import { Board, useBoardData } from '@/components/Board'
import { useMode } from '@/lib/profile'
import { parseLabels } from '@/lib/tasks'

export function TasksPage(): React.JSX.Element {
  const mode = useMode()
  const data = useBoardData()
  const [search, setSearch] = useState('')
  const [label, setLabel] = useState('')
  const [priority, setPriority] = useState(-1)

  const labels = [...new Set((data?.tasks ?? []).flatMap(parseLabels))].sort()
  const q = search.trim().toLowerCase()

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent capitalize">{mode}</span>
        <div className="flex-1" />
        <input className="field-boxed w-56" placeholder="Search tasks…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="field-boxed w-auto" value={label} onChange={(e) => setLabel(e.target.value)}>
          <option value="">All labels</option>
          {labels.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select className="field-boxed w-auto" value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
          <option value={-1}>Any priority</option>
          <option value={3}>High</option>
          <option value={2}>Medium</option>
          <option value={1}>Low</option>
        </select>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <Board
          match={(t) =>
            (!q || t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q)) &&
            (!label || parseLabels(t).includes(label)) &&
            (priority < 0 || t.priority === priority)
          }
        />
      </div>
      <p className="mt-3 text-xs text-muted">
        Drag cards between columns. Click a card for details, subtasks and links. ★ adds it to today's Top 3.
      </p>
    </div>
  )
}
