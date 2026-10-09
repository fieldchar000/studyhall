// Notes (study: linked to module/week) and meeting notes (work: client/project).

import { useState } from 'react'
import type { Note, PickedDoc } from '@shared/types'
import { AutoText } from '@/components/AutoField'
import { NoteEditor } from '@/components/NoteEditor'
import { Icon } from '@/components/ui'
import { api, db, useLive } from '@/lib/data'
import { isoToLocalInput, localInputToIso } from '@/lib/dates'
import { navigate } from '@/lib/nav'
import { useMode } from '@/lib/profile'
import { SharedBanner, ShareButton } from '@/components/ShareButton'
import { docToNote } from '@/lib/importDoc'
import { MindmapGenerator } from '@/components/MindmapGenerator'

/** Create a note (optionally linked) and open it. */
export async function newNote(values: Partial<Note>): Promise<Note> {
  const n = await db.create('notes', { title: 'Untitled note', ...values })
  navigate({ name: 'notes', id: n.id })
  return n
}

/** Turn documents into notes (one note per file). Returns the last note created. */
export async function importAsNotes(docs: PickedDoc[], values: Partial<Note>, onProgress?: (msg: string) => void): Promise<{ last: Note | null; errors: string[]; skipped: number }> {
  let last: Note | null = null
  const errors: string[] = []
  let skipped = 0
  for (const [i, d] of docs.entries()) {
    onProgress?.(`Importing ${i + 1} of ${docs.length}: ${d.name}…`)
    try {
      const n = await docToNote(d)
      skipped += n.skippedImages
      last = await db.create('notes', { ...values, title: n.title, content: n.content, plain_text: n.plain })
    } catch (e) {
      errors.push(`${d.name}: ${e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e)}`)
    }
  }
  return { last, errors, skipped }
}

/** Open the note for a module week, creating it the first time. */
export async function openWeekNote(moduleId: string, weekId: string, title: string): Promise<void> {
  const existing = await api.list('notes', { week_id: weekId }, 'created_at')
  if (existing[0]) navigate({ name: 'notes', id: existing[0].id })
  else await newNote({ mode: 'study', module_id: moduleId, week_id: weekId, title })
}

export function NotesPage({ id }: { id?: string }): React.JSX.Element {
  const mode = useMode()
  const [search, setSearch] = useState('')
  const [group, setGroup] = useState('') // module (study), client (work) or goal (life) filter
  const [importing, setImporting] = useState<string | null>(null)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [auto, setAuto] = useState(false)
  const baseValues = (): Partial<Note> =>
    mode === 'study' ? { mode, module_id: group || null } : mode === 'life' ? { mode, project_id: group || null } : { mode, client_id: group || null }
  const runImport = async (docs: Promise<PickedDoc[]>): Promise<void> => {
    setImportMsg(null)
    setImporting('Reading files…')
    try {
      const list = await docs
      if (!list.length) return
      const r = await importAsNotes(list, baseValues(), setImporting)
      if (r.last) navigate({ name: 'notes', id: r.last.id })
      const parts = [
        r.errors.length ? `Couldn't import: ${r.errors.join('; ')}` : '',
        r.skipped ? `${r.skipped} picture${r.skipped === 1 ? ' was' : 's were'} left out (unsupported format or the note got too big).` : ''
      ].filter(Boolean)
      if (parts.length) setImportMsg(parts.join(' '))
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
    } finally {
      setImporting(null)
    }
  }
  const { data } = useLive(
    ['notes', 'modules', 'clients', 'projects'],
    async () => {
      const [notes, modules, clients, projects] = await Promise.all([
        api.list('notes', { mode }, 'updated_at'),
        api.list('modules', {}, 'sort'),
        api.list('clients', {}, 'name'),
        api.list('projects', { mode }, 'sort')
      ])
      return { notes: notes.reverse(), modules, clients, projects } // newest first
    },
    [mode]
  )
  const selectedId = id ?? data?.notes[0]?.id
  const q = search.trim().toLowerCase()
  const groupKey = mode === 'study' ? 'module_id' : mode === 'life' || mode === 'dev' ? 'project_id' : 'client_id'
  const shown = (data?.notes ?? [])
    .filter((n) => (!q || n.title.toLowerCase().includes(q) || n.plain_text.toLowerCase().includes(q)) && (!group || n[groupKey] === group))
    .sort((a, b) => b.pinned - a.pinned)
  const label = (n: Note): string | null => {
    if (mode === 'study') {
      const m = data?.modules.find((x) => x.id === n.module_id)
      return m ? m.code || m.name : null
    }
    if (mode === 'life' || mode === 'dev') return data?.projects.find((x) => x.id === n.project_id)?.title ?? null
    return data?.clients.find((x) => x.id === n.client_id)?.name ?? null
  }

  return (
    <div
      className="relative flex h-full"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setDragging(true)
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const paths = [...e.dataTransfer.files].map((f) => api.materials.pathForFile(f)).filter(Boolean)
        if (paths.length) void runImport(api.docs.read(paths))
      }}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-3 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-accent-soft/80 text-sm font-medium text-accent">
          Drop Word, PowerPoint, PDF, HTML, Markdown or text files to turn them into notes
        </div>
      )}
      {auto && <MindmapGenerator purpose="notes" onClose={() => setAuto(false)} />}
      <aside className="flex w-72 shrink-0 flex-col border-r border-line">
        <div className="flex items-center gap-2 px-4 pt-5 pb-3">
          <h1 className="flex-1 text-lg font-semibold">{mode === 'work' ? 'Meeting notes' : 'Notes'}</h1>
          <button
            className="btn px-2 py-1"
            title="Import Word, PowerPoint, PDF, HTML, Markdown or text files as notes (or drag them here)"
            disabled={!!importing}
            onClick={() => void runImport(api.docs.pick('Import as notes'))}
          >
            <Icon name="upload" /> Import
          </button>
          <button className="btn px-2 py-1" title="Make notes automatically from files, other notes or articles" onClick={() => setAuto(true)}>
            ✨ Auto
          </button>
          <button
            className="btn-primary px-2 py-1"
            title="New note"
            onClick={() =>
              void newNote(
                mode === 'study'
                  ? { mode, module_id: group || null }
                  : mode === 'life' || mode === 'dev'
                    ? { mode, project_id: group || null }
                    : { mode, kind: 'meeting', client_id: group || null, title: 'Meeting', meeting_at: new Date().toISOString() }
              )
            }
          >
            <Icon name="plus" />
          </button>
        </div>
        {(importing || importMsg) && (
          <div className={`mx-3 mb-2 rounded-lg px-3 py-2 text-xs ${importing ? 'bg-accent-soft text-accent' : 'bg-danger/10 text-danger'}`}>
            {importing ?? importMsg}
            {importMsg && (
              <button className="ml-2 underline" onClick={() => setImportMsg(null)}>
                OK
              </button>
            )}
          </div>
        )}
        <div className="flex flex-col gap-2 px-3 pb-2">
          <input className="field-boxed" placeholder="Search notes…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="field-boxed" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">{mode === 'study' ? 'All modules' : mode === 'life' ? 'All goals' : mode === 'dev' ? 'All projects' : 'All clients'}</option>
            {(mode === 'study'
              ? data?.modules.map((m) => ({ id: m.id, name: m.code || m.name }))
              : mode === 'life' || mode === 'dev'
                ? data?.projects.map((p) => ({ id: p.id, name: p.title }))
                : data?.clients
            )?.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <ul className="min-h-0 flex-1 overflow-auto px-2 pb-3">
          {data && shown.length === 0 && <li className="px-2 py-4 text-xs text-muted">No notes yet.</li>}
          {shown.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => navigate({ name: 'notes', id: n.id })}
                className={`w-full rounded-lg px-3 py-2 text-left ${n.id === selectedId ? 'bg-accent-soft' : 'hover:bg-line/50'}`}
              >
                <div className="flex items-center gap-1.5">
                  {n.pinned ? <Icon name="star" size={12} className="fill-current text-amber-500" /> : null}
                  <span className="truncate text-sm font-medium">{n.title || 'Untitled'}</span>
                </div>
                <div className="mt-0.5 truncate text-xs text-muted">
                  {label(n) && <span className="mr-1.5">{label(n)} ·</span>}
                  {n.plain_text.slice(0, 80) || 'Empty note'}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        {selectedId ? <NoteView key={selectedId} id={selectedId} /> : <EmptyState mode={mode} />}
      </section>
    </div>
  )
}

function EmptyState({ mode }: { mode: string }): React.JSX.Element {
  return (
    <div className="m-auto max-w-sm text-center text-sm text-muted">
      {mode === 'study'
        ? 'Notes can be linked to a module and week. Open a week in a module and click “Notes”, or press + to start one.'
        : mode === 'life'
          ? 'Notes for everything else in life: recipes, ideas, journal entries, phrases you learned. Press + to start one.'
          : 'Keep notes for each meeting, linked to a client or project. Press + to start one.'}
    </div>
  )
}

/** Title + links header and the editor for one note. */
export function NoteView({ id, compact = false }: { id: string; compact?: boolean }): React.JSX.Element {
  const { data } = useLive(
    ['notes', 'modules', 'weeks', 'clients', 'projects'],
    async () => {
      const note = await api.get('notes', id)
      if (!note) return null
      const [modules, weeks, clients, projects] = await Promise.all([
        api.list('modules', { archived: 0 }, 'sort'),
        note.module_id ? api.list('weeks', { module_id: note.module_id }, 'number') : Promise.resolve([]),
        api.list('clients', { archived: 0 }, 'name'),
        api.list('projects', { mode: note.mode }, 'sort')
      ])
      return { note, modules, weeks, clients, projects }
    },
    [id]
  )
  if (data === undefined) return <div />
  if (data === null) return <div className="m-auto text-sm text-muted">This note was deleted.</div>
  const { note: n, modules, weeks, clients, projects } = data
  const save = (patch: Partial<Note>): Promise<unknown> => db.update('notes', n.id, patch)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={`flex flex-col gap-2 border-b border-line ${compact ? 'px-3 py-2' : 'px-8 pt-6 pb-3'}`}>
        <div className="flex items-center gap-2">
          <AutoText value={n.title} onSave={(v) => save({ title: v || 'Untitled note' })} className={`field ${compact ? 'font-semibold' : 'text-2xl font-semibold tracking-tight'}`} />
          {!compact && (
            <>
              <ShareButton type="note" id={n.id} ownerId={n.owner_id} />
              <button className={`btn-ghost ${n.pinned ? 'text-amber-500' : ''}`} title={n.pinned ? 'Unpin' : 'Pin to top'} onClick={() => void save({ pinned: n.pinned ? 0 : 1 })}>
                <Icon name="star" className={n.pinned ? 'fill-current' : ''} />
              </button>
              <button
                className="btn-ghost hover:text-danger"
                title="Delete note"
                onClick={() => confirm(`Delete “${n.title}”?`) && void db.remove('notes', n.id).then(() => navigate({ name: 'notes' }))}
              >
                <Icon name="trash" />
              </button>
            </>
          )}
        </div>
        {!compact && <SharedBanner ownerId={n.owner_id} kind="note" resourceId={n.id} />}
        {!compact && (
          <div className="flex flex-wrap gap-2 text-sm">
            {n.mode === 'study' ? (
              <>
                <select className="field-boxed w-auto" value={n.module_id ?? ''} onChange={(e) => void save({ module_id: e.target.value || null, week_id: null })}>
                  <option value="">No module</option>
                  {modules.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.code ? `${m.code} · ` : ''}
                      {m.name}
                    </option>
                  ))}
                </select>
                <select className="field-boxed w-auto" value={n.week_id ?? ''} disabled={!n.module_id} onChange={(e) => void save({ week_id: e.target.value || null })}>
                  <option value="">No week</option>
                  {weeks.map((w) => (
                    <option key={w.id} value={w.id}>
                      Week {w.number}
                      {w.title && ` · ${w.title}`}
                    </option>
                  ))}
                </select>
              </>
            ) : n.mode === 'life' || n.mode === 'dev' ? null : (
              <>
                <input
                  type="datetime-local"
                  className="field-boxed w-auto"
                  title="Meeting date"
                  value={isoToLocalInput(n.meeting_at)}
                  onChange={(e) => void save({ meeting_at: localInputToIso(e.target.value) })}
                />
                <select className="field-boxed w-auto" value={n.client_id ?? ''} onChange={(e) => void save({ client_id: e.target.value || null })}>
                  <option value="">No client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            <select className="field-boxed w-auto" value={n.project_id ?? ''} onChange={(e) => void save({ project_id: e.target.value || null })}>
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <NoteEditor note={n} compact={compact} />
    </div>
  )
}
