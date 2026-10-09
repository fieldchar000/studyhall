import { useState } from 'react'
import type { Material, Week } from '@shared/types'
import { AutoText } from '@/components/AutoField'
import { Icon } from '@/components/ui'
import { api, db, notifyChanged, track, useRows } from '@/lib/data'
import { formatBytes } from '@/lib/dates'
import { navigate } from '@/lib/nav'
import { openWeekNote } from '../Notes'
import { useCloud } from '@/lib/cloud'
import { MaterialViewer, fileType, openMaterial } from '@/components/MaterialViewer'

const DRAG = 'application/x-studyhall-item'

export function WeeksTab({ moduleId }: { moduleId: string }): React.JSX.Element {
  const weeks = useRows('weeks', { module_id: moduleId }, 'number')
  const loose = useRows('materials', { module_id: moduleId, week_id: null }, 'sort')
  const [preview, setPreview] = useState<Material | null>(null)

  const addWeek = (): void => {
    const next = Math.max(0, ...(weeks ?? []).map((w) => w.number)) + 1
    void db.create('weeks', { module_id: moduleId, number: next, title: '' })
  }

  return (
    <div className="flex flex-col gap-3">
      {weeks?.length === 0 && (
        <div className="card p-8 text-center text-muted">No weeks yet. Add one, then drop lecture files onto it.</div>
      )}
      {loose && loose.length > 0 && (
        <div className="card px-3 py-2">
          <div className="flex items-center gap-2 py-1 text-sm font-semibold">
            Not in a week yet
            <span className="text-xs font-normal text-muted">drag them onto a week, or use Materials → Move to…</span>
          </div>
          {loose.map((m) => (
            <MaterialRow key={m.id} material={m} onPreview={setPreview} />
          ))}
        </div>
      )}
      {weeks?.map((w) => <WeekCard key={w.id} week={w} onPreview={setPreview} />)}
      <div>
        <button className="btn" onClick={addWeek}>
          <Icon name="plus" /> Add week
        </button>
      </div>
      {preview && <MaterialViewer material={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}

function WeekCard({ week, onPreview }: { week: Week; onPreview: (m: Material) => void }): React.JSX.Element {
  const materials = useRows('materials', { week_id: week.id }, 'sort')
  const notes = useRows('notes', { week_id: week.id }, 'created_at')
  const [open, setOpen] = useState(true)
  const [dragging, setDragging] = useState(false)

  const importFiles = async (work: Promise<Material[]>): Promise<void> => {
    await track(work)
    notifyChanged('materials')
  }

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setDragging(false)
    const moved = e.dataTransfer.getData(DRAG)
    if (moved) {
      const { table, id } = JSON.parse(moved) as { table: 'materials' | 'notes'; id: string }
      void db.update(table, id, { module_id: week.module_id, week_id: week.id })
      return
    }
    const paths = [...e.dataTransfer.files].map((f) => api.materials.pathForFile(f)).filter(Boolean)
    if (paths.length) void importFiles(api.materials.importPaths(week.id, paths))
  }

  const remove = (): void => {
    const n = materials?.length ?? 0
    if (n > 0 && !confirm(`Delete week ${week.number} and its ${n} file(s)?`)) return
    void db.remove('weeks', week.id)
  }

  return (
    <div
      className={`card transition-colors ${dragging ? 'border-accent bg-accent-soft' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
      }}
      onDrop={onDrop}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <button className="btn-ghost px-1" onClick={() => setOpen((o) => !o)} title={open ? 'Collapse' : 'Expand'}>
          <Icon name="chevron" className={`transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
        <div className="shrink-0 font-semibold">Week {week.number}</div>
        <AutoText
          value={week.title}
          onSave={(v) => db.update('weeks', week.id, { title: v })}
          placeholder="Topic…"
          className="field min-w-0 flex-1"
        />
        <input
          type="date"
          className="field w-auto text-xs text-muted"
          value={week.start_date ?? ''}
          title="Week start date"
          onChange={(e) => void db.update('weeks', week.id, { start_date: e.target.value || null })}
        />
        <span className="text-xs whitespace-nowrap text-muted">
          {materials?.length ?? 0} file{materials?.length === 1 ? '' : 's'}
          {notes?.length ? ` · ${notes.length} note${notes.length === 1 ? '' : 's'}` : ''}
        </span>
        <button
          className="btn-ghost"
          title="Open this week's notes"
          onClick={() => void openWeekNote(week.module_id, week.id, `Week ${week.number}${week.title ? `: ${week.title}` : ''}`)}
        >
          <Icon name="note" /> Notes
        </button>
        <button className="btn-ghost hover:text-danger" onClick={remove} title="Delete week">
          <Icon name="trash" />
        </button>
      </div>

      {open && (
        <div className="border-t border-line px-3 py-2">
          {notes?.map((n) => (
            <div key={n.id} className="flex items-center gap-2 rounded-md py-0.5 pl-1 hover:bg-canvas">
              <span className="w-14 shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-center text-[11px] font-semibold text-accent">Note</span>
              <button className="min-w-0 flex-1 truncate px-2 py-1 text-left hover:text-accent" onClick={() => navigate({ name: 'notes', id: n.id })}>
                {n.title || 'Untitled note'}
              </button>
            </div>
          ))}
          {materials?.map((m) => <MaterialRow key={m.id} material={m} onPreview={onPreview} />)}
          <div className="flex items-center gap-3 py-1.5">
            <button className="btn-ghost" onClick={() => void importFiles(api.materials.pickAndImport(week.id))}>
              <Icon name="upload" /> Add files
            </button>
            <span className="text-xs text-muted">or drag files here — PDF, Word, PowerPoint, HTML…</span>
          </div>
        </div>
      )}
    </div>
  )
}

function MaterialRow({ material: m, onPreview }: { material: Material; onPreview: (m: Material) => void }): React.JSX.Element {
  const [renaming, setRenaming] = useState(false)
  const cloud = useCloud()
  const type = fileType(m)
  const previewable = type.view !== 'external'
  const open = (): void => openMaterial(m, onPreview)
  return (
    <div
      className="group flex items-center gap-2 rounded-md py-0.5 pl-1 hover:bg-canvas"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG, JSON.stringify({ table: 'materials', id: m.id }))
        e.dataTransfer.effectAllowed = 'move'
      }}
    >
      <span className={`w-14 shrink-0 rounded px-1.5 py-0.5 text-center text-[11px] font-semibold ${type.cls}`}>{type.label}</span>
      {renaming ? (
        <div className="min-w-0 flex-1" onBlur={() => setRenaming(false)}>
          <AutoText value={m.title} onSave={(v) => db.update('materials', m.id, { title: v || m.file_name })} autoFocus />
        </div>
      ) : (
        <button
          className="min-w-0 flex-1 truncate px-2 py-1 text-left hover:text-accent"
          onClick={open}
          title={`${m.file_name} — click to ${previewable ? 'preview' : 'open in its app'}`}
        >
          {m.title}
        </button>
      )}
      {cloud?.signedIn && m.owner_id === cloud.userId && (
        <button
          className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${m.sync_file ? 'bg-accent-soft text-accent' : 'text-muted opacity-0 group-hover:opacity-100'}`}
          title={m.sync_file ? (m.storage_path ? 'Synced to the cloud — click to stop syncing this file' : 'Uploading on next sync…') : 'Sync this file to the cloud (counts toward the free 1 GB)'}
          onClick={() => void db.update('materials', m.id, { sync_file: m.sync_file ? 0 : 1, storage_path: m.sync_file ? m.storage_path : null })}
        >
          ☁ {m.sync_file ? (m.storage_path ? 'Synced' : 'Queued') : 'Sync file'}
        </button>
      )}
      <span className="shrink-0 text-xs text-muted">{formatBytes(m.size_bytes)}</span>
      <div className="flex shrink-0 opacity-0 group-hover:opacity-100">
        <button className="btn-ghost" onClick={() => setRenaming(true)} title="Rename">
          <Icon name="pencil" />
        </button>
        <button className="btn-ghost" onClick={() => void api.materials.openExternal(m.id)} title="Open in default app">
          <Icon name="external" />
        </button>
        <button className="btn-ghost" onClick={() => void api.materials.showInFolder(m.id)} title="Show in folder">
          <Icon name="folder" />
        </button>
        <button className="btn-ghost hover:text-danger" onClick={() => void db.remove('materials', m.id)} title="Remove">
          <Icon name="trash" />
        </button>
      </div>
    </div>
  )
}
