import { useState } from 'react'
import type { Material, Week } from '@shared/types'
import { AutoText } from '@/components/AutoField'
import { Icon, Modal } from '@/components/ui'
import { api, db, notifyChanged, track, useRows } from '@/lib/data'
import { formatBytes } from '@/lib/dates'
import { openWeekNote } from '../Notes'

const KIND_LABEL: Record<Material['kind'], string> = { pdf: 'PDF', html: 'HTML', slides: 'Slides', other: 'File' }
const KIND_COLOR: Record<Material['kind'], string> = {
  pdf: 'bg-red-500/15 text-red-600 dark:text-red-400',
  html: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  slides: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  other: 'bg-slate-500/15 text-slate-600 dark:text-slate-400'
}

export function WeeksTab({ moduleId }: { moduleId: string }): React.JSX.Element {
  const weeks = useRows('weeks', { module_id: moduleId }, 'number')
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
      {weeks?.map((w) => <WeekCard key={w.id} week={w} onPreview={setPreview} />)}
      <div>
        <button className="btn" onClick={addWeek}>
          <Icon name="plus" /> Add week
        </button>
      </div>
      {preview && <MaterialPreview material={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}

function WeekCard({ week, onPreview }: { week: Week; onPreview: (m: Material) => void }): React.JSX.Element {
  const materials = useRows('materials', { week_id: week.id }, 'sort')
  const [open, setOpen] = useState(true)
  const [dragging, setDragging] = useState(false)

  const importFiles = async (work: Promise<Material[]>): Promise<void> => {
    await track(work)
    notifyChanged('materials')
  }

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setDragging(false)
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
        <span className="text-xs whitespace-nowrap text-muted">{materials?.length ?? 0} files</span>
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
          {materials?.map((m) => <MaterialRow key={m.id} material={m} onPreview={onPreview} />)}
          <div className="flex items-center gap-3 py-1.5">
            <button className="btn-ghost" onClick={() => void importFiles(api.materials.pickAndImport(week.id))}>
              <Icon name="upload" /> Add files
            </button>
            <span className="text-xs text-muted">or drag files here — PDF, HTML, PowerPoint…</span>
          </div>
        </div>
      )}
    </div>
  )
}

function MaterialRow({ material: m, onPreview }: { material: Material; onPreview: (m: Material) => void }): React.JSX.Element {
  const [renaming, setRenaming] = useState(false)
  const previewable = m.kind === 'pdf' || m.kind === 'html'
  const open = (): void => {
    if (previewable) onPreview(m)
    else void api.materials.openExternal(m.id).catch((e) => alert(`Couldn't open the file: ${e.message}`))
  }
  return (
    <div className="group flex items-center gap-2 rounded-md py-0.5 pl-1 hover:bg-canvas">
      <span className={`w-14 shrink-0 rounded px-1.5 py-0.5 text-center text-[11px] font-semibold ${KIND_COLOR[m.kind]}`}>
        {KIND_LABEL[m.kind]}
      </span>
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

/** In-app viewer. PDFs use Chromium's built-in viewer; HTML runs in a locked-down sandbox. */
function MaterialPreview({ material: m, onClose }: { material: Material; onClose: () => void }): React.JSX.Element {
  const src = `material://local/${m.id}/${encodeURIComponent(m.file_name)}`
  return (
    <Modal
      wide
      title={m.title}
      onClose={onClose}
      actions={
        <button className="btn-ghost" onClick={() => void api.materials.openExternal(m.id)}>
          <Icon name="external" /> Open in default app
        </button>
      }
    >
      {m.kind === 'html' ? (
        // allow-scripts only: no same-origin, no popups, no top navigation, no forms.
        // The file is also served with a CSP that blocks all network access.
        <iframe title={m.title} src={src} sandbox="allow-scripts" className="h-full w-full bg-white" />
      ) : (
        <iframe title={m.title} src={src} className="h-full w-full" />
      )}
    </Modal>
  )
}
