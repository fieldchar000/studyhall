// A module's weeks: each week has a number you can change, a topic, and its Notes and
// Worksheets side by side. The same filing shows up in Materials, and vice versa.

import { useState } from 'react'
import type { Material, MaterialCategory, Note, Week } from '@shared/types'
import { AutoText } from '@/components/AutoField'
import { Icon } from '@/components/ui'
import { api, db, notifyChanged, track, useRows } from '@/lib/data'
import { formatBytes } from '@/lib/dates'
import { navigate } from '@/lib/nav'
import { openWeekNote } from '../Notes'
import { useCloud } from '@/lib/cloud'
import { MaterialViewer, fileType, openMaterial } from '@/components/MaterialViewer'
import { CategoryToggle, WeekSelect, createWeek, deleteWeek, dragProps, renumberWeek, useDrop } from '@/components/Filing'

type Ctx = { weeks: Week[]; onPreview: (m: Material) => void; onImport: (w: Promise<Material[]>) => void }

export function WeeksTab({ moduleId }: { moduleId: string }): React.JSX.Element {
  const weeks = useRows('weeks', { module_id: moduleId }, 'number')
  const files = useRows('materials', { module_id: moduleId }, 'sort')
  const notes = useRows('notes', { module_id: moduleId }, 'created_at')
  const [preview, setPreview] = useState<Material | null>(null)

  const onImport = (work: Promise<Material[]>): void => {
    void track(work).then(() => {
      notifyChanged('materials')
      notifyChanged('weeks')
    })
  }
  if (!weeks || !files || !notes) return <div />
  const sorted = [...weeks].sort((a, b) => a.number - b.number)
  const weekIds = new Set(sorted.map((w) => w.id))
  const ctx: Ctx = { weeks: sorted, onPreview: setPreview, onImport }
  const looseFiles = files.filter((f) => !f.week_id || !weekIds.has(f.week_id))
  const looseNotes = notes.filter((n) => !n.week_id || !weekIds.has(n.week_id))

  const addWeeks = async (n: number): Promise<void> => {
    const made: Week[] = [...sorted]
    for (let i = 0; i < n; i++) made.push(await createWeek(moduleId, made))
  }

  return (
    <div className="flex flex-col gap-3">
      {sorted.length === 0 && (
        <div className="card flex flex-col items-center gap-3 p-8 text-center">
          <p className="text-muted">No weeks yet. Add your term’s weeks, then drop lecture notes and worksheets onto them.</p>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={() => void addWeeks(12)}>
              Add 12 weeks
            </button>
            <button className="btn" onClick={() => void addWeeks(1)}>
              Add one week
            </button>
          </div>
        </div>
      )}
      {(looseFiles.length > 0 || looseNotes.length > 0) && (
        <section className="card px-4 py-3">
          <div className="mb-2 flex items-baseline gap-2">
            <span className="label-caps">Not in a week yet</span>
            <span className="text-xs text-muted">Drag onto a week, or pick one from the row.</span>
          </div>
          <Columns moduleId={moduleId} week={null} files={looseFiles} notes={looseNotes} {...ctx} />
        </section>
      )}
      {sorted.map((w) => (
        <WeekCard key={w.id} week={w} files={files.filter((f) => f.week_id === w.id)} notes={notes.filter((n) => n.week_id === w.id)} {...ctx} />
      ))}
      {sorted.length > 0 && (
        <div>
          <button className="btn" onClick={() => void addWeeks(1)}>
            <Icon name="plus" /> Add week
          </button>
        </div>
      )}
      {preview && <MaterialViewer material={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}

function WeekCard({ week, files, notes, ...ctx }: Ctx & { week: Week; files: Material[]; notes: Note[] }): React.JSX.Element {
  const [open, setOpen] = useState(true)
  const [editingNo, setEditingNo] = useState(false)
  const drop = useDrop({ moduleId: week.module_id, weekId: week.id }, ctx.onImport)
  const total = files.length + notes.length

  const remove = (): void => {
    const msg = total
      ? `Delete Week ${week.number}? Its ${total} file${total === 1 ? '' : 's'} and notes stay in the module, under “Not in a week”.`
      : `Delete Week ${week.number}?`
    if (confirm(msg)) void deleteWeek(week)
  }

  return (
    <section className={`card transition-colors ${drop.over ? 'border-accent bg-accent-soft/50' : ''}`} {...drop.props}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button className="btn-ghost px-1" onClick={() => setOpen((o) => !o)} title={open ? 'Collapse' : 'Expand'} aria-expanded={open}>
          <Icon name="chevron" size={14} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
        {editingNo ? (
          <span className="flex shrink-0 items-center gap-1 text-sm font-semibold">
            Week
            <input
              type="number"
              min={0}
              max={99}
              autoFocus
              defaultValue={week.number}
              className="field-boxed w-14 py-0.5 text-center"
              onBlur={(e) => {
                setEditingNo(false)
                void renumberWeek(week, Number(e.target.value), ctx.weeks)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') setEditingNo(false)
              }}
            />
          </span>
        ) : (
          <button
            className="font-display shrink-0 rounded px-1 text-[17px] font-semibold hover:bg-line/50"
            title="Change the week number (if it’s taken, the two weeks swap)"
            onClick={() => setEditingNo(true)}
          >
            Week {week.number}
          </button>
        )}
        <AutoText value={week.title} onSave={(v) => db.update('weeks', week.id, { title: v })} placeholder="Topic…" className="field min-w-0 flex-1" />
        <input
          type="date"
          className="field w-auto text-xs text-muted"
          value={week.start_date ?? ''}
          title="Week start date"
          onChange={(e) => void db.update('weeks', week.id, { start_date: e.target.value || null })}
        />
        <button
          className="btn-ghost"
          title="Open this week’s lecture notes"
          onClick={() => void openWeekNote(week.module_id, week.id, `Week ${week.number}${week.title ? `: ${week.title}` : ''}`)}
        >
          <Icon name="pen" /> Write
        </button>
        <button className="btn-ghost hover:text-danger" onClick={remove} title="Delete week (keeps its files)">
          <Icon name="trash" />
        </button>
      </div>
      {open && (
        <div className="border-t border-line/70 px-4 py-3">
          <Columns moduleId={week.module_id} week={week} files={files} notes={notes} {...ctx} />
          <div className="mt-2 flex items-center gap-3">
            <button className="btn-ghost text-xs" onClick={() => ctx.onImport(api.materials.pickTo({ moduleId: week.module_id, weekId: week.id }))}>
              <Icon name="upload" size={14} /> Add files
            </button>
            <span className="text-[11px] text-muted">Drop on Notes or Worksheets. Files named “tutorial”, “problem set”… go to Worksheets by themselves.</span>
          </div>
        </div>
      )}
    </section>
  )
}

function Columns({ moduleId, week, files, notes, ...ctx }: Ctx & { moduleId: string; week: Week | null; files: Material[]; notes: Note[] }): React.JSX.Element {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {(['notes', 'worksheet'] as MaterialCategory[]).map((c) => (
        <Column
          key={c}
          category={c}
          moduleId={moduleId}
          week={week}
          files={files.filter((f) => (f.category === 'worksheet' ? 'worksheet' : 'notes') === c)}
          notes={notes.filter((n) => (n.category === 'worksheet' ? 'worksheet' : 'notes') === c)}
          {...ctx}
        />
      ))}
    </div>
  )
}

function Column({
  category,
  moduleId,
  week,
  files,
  notes,
  ...ctx
}: Ctx & { category: MaterialCategory; moduleId: string; week: Week | null; files: Material[]; notes: Note[] }): React.JSX.Element {
  const drop = useDrop({ moduleId, weekId: week?.id ?? null, category }, ctx.onImport)
  const n = files.length + notes.length
  return (
    <div className={`min-w-0 rounded-md transition-colors ${drop.over ? 'bg-accent-soft ring-1 ring-accent/40' : ''}`} {...drop.props}>
      <div className="mb-1 flex items-center gap-1.5 px-1 text-[10.5px] font-semibold tracking-[0.12em] text-muted uppercase">
        <Icon name={category === 'worksheet' ? 'pencil' : 'note'} size={12} />
        {category === 'worksheet' ? 'Worksheets' : 'Notes'}
        {n > 0 && <span className="font-normal tracking-normal text-muted/70">{n}</span>}
      </div>
      {notes.map((note) => (
        <div key={note.id} className="group flex items-center gap-2 rounded-md py-0.5 pl-1 hover:bg-line/30" {...dragProps({ table: 'notes', id: note.id })}>
          <span className="w-11 shrink-0 rounded-sm bg-accent-soft px-1 py-0.5 text-center text-[10px] font-semibold text-accent">Note</span>
          <button className="min-w-0 flex-1 truncate py-1 text-left text-[13.5px] hover:text-accent" onClick={() => navigate({ name: 'notes', id: note.id })}>
            {note.title || 'Untitled note'}
          </button>
          <div className="hidden shrink-0 group-hover:flex">
            <WeekSelect item={{ table: 'notes', id: note.id }} moduleId={moduleId} weekId={note.week_id} weeks={ctx.weeks} className="max-w-28" />
            <CategoryToggle item={{ table: 'notes', id: note.id }} category={category} />
          </div>
        </div>
      ))}
      {files.map((m) => (
        <MaterialRow key={m.id} material={m} category={category} {...ctx} />
      ))}
      {n === 0 && <div className="rounded-md border border-dashed border-line px-2 py-2 text-[11px] text-muted/70">Drop {category === 'worksheet' ? 'worksheets' : 'notes or slides'} here</div>}
    </div>
  )
}

function MaterialRow({ material: m, category, weeks, onPreview }: Ctx & { material: Material; category: MaterialCategory }): React.JSX.Element {
  const [renaming, setRenaming] = useState(false)
  const cloud = useCloud()
  const type = fileType(m)
  const previewable = type.view !== 'external'
  return (
    <div className="group flex items-center gap-2 rounded-md py-0.5 pl-1 hover:bg-line/30" {...dragProps({ table: 'materials', id: m.id })}>
      <span className={`w-11 shrink-0 rounded-sm px-1 py-0.5 text-center text-[10px] font-semibold ${type.cls}`}>{type.label}</span>
      {renaming ? (
        <div className="min-w-0 flex-1" onBlur={() => setRenaming(false)}>
          <AutoText value={m.title} onSave={(v) => db.update('materials', m.id, { title: v || m.file_name })} autoFocus />
        </div>
      ) : (
        <button
          className="min-w-0 flex-1 truncate py-1 text-left text-[13.5px] hover:text-accent"
          onClick={() => openMaterial(m, onPreview)}
          title={`${m.file_name} — click to ${previewable ? 'open' : 'open in its app'}`}
        >
          {m.title}
        </button>
      )}
      {cloud?.signedIn && m.owner_id === cloud.userId && (
        <button
          className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${m.sync_file ? 'bg-accent-soft text-accent' : 'hidden text-muted group-hover:block'}`}
          title={m.sync_file ? (m.storage_path ? 'Synced to the cloud — click to stop syncing this file' : 'Uploading on next sync…') : 'Sync this file to the cloud (counts toward the free 1 GB)'}
          onClick={() => void db.update('materials', m.id, { sync_file: m.sync_file ? 0 : 1, storage_path: m.sync_file ? m.storage_path : null })}
        >
          ☁ {m.sync_file ? (m.storage_path ? 'Synced' : 'Queued') : 'Sync'}
        </button>
      )}
      <span className="shrink-0 text-[11px] text-muted tabular-nums group-hover:hidden">{formatBytes(m.size_bytes)}</span>
      <div className="hidden shrink-0 items-center group-hover:flex">
        {m.module_id && <WeekSelect item={{ table: 'materials', id: m.id }} moduleId={m.module_id} weekId={m.week_id} weeks={weeks} className="max-w-28" />}
        <CategoryToggle item={{ table: 'materials', id: m.id }} category={category} />
        <button className="btn-ghost px-1.5" onClick={() => setRenaming(true)} title="Rename">
          <Icon name="pencil" size={14} />
        </button>
        <button className="btn-ghost px-1.5" onClick={() => void api.materials.showInFolder(m.id)} title="Show in folder">
          <Icon name="folder" size={14} />
        </button>
        <button className="btn-ghost px-1.5 hover:text-danger" onClick={() => void db.remove('materials', m.id)} title="Remove">
          <Icon name="trash" size={14} />
        </button>
      </div>
    </div>
  )
}
