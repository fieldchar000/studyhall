// Materials: one place for every file and note, filed module by module and week by week.
// Unsorted things live in "Other"; anything can be moved by drag-and-drop or "Move to…".

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Material, MaterialPlace, Module, Note, Week } from '@shared/types'
import { Icon } from '@/components/ui'
import { api, db, notifyChanged, track, useRows } from '@/lib/data'
import { formatBytes } from '@/lib/dates'
import { navigate } from '@/lib/nav'
import { MaterialViewer, fileType, openMaterial } from '@/components/MaterialViewer'

type Item = { table: 'materials'; row: Material } | { table: 'notes'; row: Note }
type Filter = 'all' | 'files' | 'notes'
const OTHER = 'other'
const DRAG = 'application/x-studyhall-item'

// Which modules are hidden / folded is a per-PC view preference.
const VIEW_KEY = 'materials.view'
type View = { hidden: string[]; folded: string[] }
const loadView = (): View => {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}') as Partial<View>
    return { hidden: v.hidden ?? [], folded: v.folded ?? [] }
  } catch {
    return { hidden: [], folded: [] }
  }
}
const saveView = (v: View): void => {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(v))
  } catch {
    // view preferences are optional
  }
}

const titleOf = (i: Item): string => (i.table === 'notes' ? i.row.title || 'Untitled note' : i.row.title)
const pathsOf = (e: React.DragEvent): string[] => [...e.dataTransfer.files].map((f) => api.materials.pathForFile(f)).filter(Boolean)

export function MaterialsPage(): React.JSX.Element {
  const modules = useRows('modules', { archived: 0 }, 'sort') ?? []
  const weeks = useRows('weeks', {}, 'number') ?? []
  const files = useRows('materials', {}, 'sort')
  const notes = useRows('notes', { mode: 'study' }, 'updated_at')
  const [view, setView] = useState<View>(loadView)
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [viewing, setViewing] = useState<Material | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [dropAll, setDropAll] = useState(false)

  const update = (v: View): void => {
    setView(v)
    saveView(v)
  }
  const toggle = (list: 'hidden' | 'folded', key: string): void => {
    const set = new Set(view[list])
    if (set.has(key)) set.delete(key)
    else set.add(key)
    update({ ...view, [list]: [...set] })
  }

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const all: Item[] = [
      ...(filter === 'notes' ? [] : (files ?? []).map((row) => ({ table: 'materials' as const, row }))),
      ...(filter === 'files' ? [] : [...(notes ?? [])].reverse().map((row) => ({ table: 'notes' as const, row })))
    ]
    return needle
      ? all.filter((i) => titleOf(i).toLowerCase().includes(needle) || (i.table === 'materials' && i.row.file_name.toLowerCase().includes(needle)))
      : all
  }, [files, notes, filter, q])

  const moduleIds = new Set(modules.map((m) => m.id))
  const bySection = new Map<string, Item[]>()
  for (const i of items) {
    const key = i.row.module_id && moduleIds.has(i.row.module_id) ? i.row.module_id : OTHER
    bySection.set(key, [...(bySection.get(key) ?? []), i])
  }

  /** Import dropped/picked files, then say where they went. */
  const add = async (work: Promise<Material[]>): Promise<void> => {
    const added = await track(work)
    notifyChanged('materials')
    notifyChanged('weeks')
    if (!added.length) return
    const sorted = added.filter((m) => m.module_id).length
    setMsg(
      `Added ${added.length} file${added.length === 1 ? '' : 's'}` +
        (sorted === added.length
          ? sorted > 1
            ? ' — all sorted into modules.'
            : '.'
          : sorted
            ? ` — ${sorted} sorted by name, ${added.length - sorted} in Other.`
            : ' to Other.')
    )
    setTimeout(() => setMsg(null), 6000)
  }

  const visible = modules.filter((m) => !view.hidden.includes(m.id))
  const loading = !files || !notes

  return (
    <div
      className="flex h-full flex-col"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setDropAll(true)
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropAll(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDropAll(false)
        const paths = pathsOf(e)
        if (paths.length) void add(api.materials.importTo(null, paths))
      }}
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-line/70 px-6 py-4">
        <div className="mr-auto min-w-0">
          <h1 className="text-2xl">Materials</h1>
          <p className="text-xs text-muted">Drop files anywhere — they sort themselves by module and week.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input className="field-boxed w-44 py-1.5 text-sm" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="flex gap-0.5 rounded-lg bg-line/50 p-0.5 text-xs">
            {(['all', 'files', 'notes'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md px-2.5 py-1 capitalize ${filter === f ? 'bg-panel font-medium shadow-sm' : 'text-muted'}`}
              >
                {f}
              </button>
            ))}
          </div>
          <ModulePicker modules={modules} hidden={view.hidden} onToggle={(id) => toggle('hidden', id)} onShowAll={() => update({ ...view, hidden: [] })} />
          <button className="btn-primary" onClick={() => void add(api.materials.pickTo(null))}>
            <Icon name="upload" /> Add files
          </button>
        </div>
      </header>

      {msg && <div className="mx-6 mt-3 rounded-lg bg-accent-soft px-3 py-2 text-sm">{msg}</div>}

      <div className={`min-h-0 flex-1 overflow-auto px-6 py-4 transition-colors ${dropAll ? 'bg-accent-soft/40' : ''}`}>
        {loading ? null : !modules.length && !items.length ? (
          <div className="m-auto mt-16 flex max-w-md flex-col items-center gap-3 text-center">
            <div className="text-4xl">📚</div>
            <h2 className="text-lg">Your materials library</h2>
            <p className="text-sm text-muted">
              Drop lecture slides, readings, PDFs and documents here. Add your modules and files will sort themselves into them, week by week.
            </p>
            <button className="btn" onClick={() => navigate({ name: 'modules' })}>
              <Icon name="modules" /> Set up modules
            </button>
          </div>
        ) : (
          <div className="mx-auto flex max-w-4xl flex-col gap-3">
            {visible.map((m) => (
              <Section
                key={m.id}
                module={m}
                weeks={weeks.filter((w) => w.module_id === m.id)}
                items={bySection.get(m.id) ?? []}
                folded={view.folded.includes(m.id)}
                onFold={() => toggle('folded', m.id)}
                onAdd={add}
                modules={modules}
                allWeeks={weeks}
                onOpen={setViewing}
                searching={!!q.trim() || filter !== 'all'}
              />
            ))}
            {!view.hidden.includes(OTHER) && (
              <Section
                module={null}
                weeks={[]}
                items={bySection.get(OTHER) ?? []}
                folded={view.folded.includes(OTHER)}
                onFold={() => toggle('folded', OTHER)}
                onAdd={add}
                modules={modules}
                allWeeks={weeks}
                onOpen={setViewing}
                searching={!!q.trim() || filter !== 'all'}
              />
            )}
            {view.hidden.length > 0 && (
              <button className="self-center text-xs text-muted hover:text-ink" onClick={() => update({ ...view, hidden: [] })}>
                {view.hidden.length} hidden — show all
              </button>
            )}
          </div>
        )}
      </div>
      {viewing && <MaterialViewer material={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}

/** "Modules ▾" — tick which modules to show. */
function ModulePicker({
  modules,
  hidden,
  onToggle,
  onShowAll
}: {
  modules: Module[]
  hidden: string[]
  onToggle: (id: string) => void
  onShowAll: () => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])
  const shown = modules.length + 1 - hidden.length
  return (
    <div className="relative" ref={ref}>
      <button className="btn" onClick={() => setOpen((o) => !o)}>
        <Icon name="modules" /> Modules
        {hidden.length ? ` (${shown}/${modules.length + 1})` : ''}
        <Icon name="chevron" className={`transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} size={12} />
      </button>
      {open && (
        <div className="card absolute right-0 z-30 mt-1 flex w-64 flex-col p-1.5 shadow-xl">
          {[
            ...modules.map((m) => ({
              id: m.id,
              label: m.code ? `${m.code} · ${m.name}` : m.name,
              color: m.color
            })),
            { id: OTHER, label: 'Other (unsorted)', color: '#94a3b8' }
          ].map((m) => (
            <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-line/40">
              <input type="checkbox" checked={!hidden.includes(m.id)} onChange={() => onToggle(m.id)} />
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: m.color }} />
              <span className="truncate">{m.label}</span>
            </label>
          ))}
          {hidden.length > 0 && (
            <button className="mt-1 border-t border-line/70 pt-1.5 text-xs text-muted hover:text-ink" onClick={onShowAll}>
              Show all
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Where a drop lands: an internal item gets moved, files from Explorer get imported there. */
function useDropTarget(place: MaterialPlace, onAdd: (w: Promise<Material[]>) => void): { over: boolean; props: React.HTMLAttributes<HTMLElement> } {
  const [over, setOver] = useState(false)
  return {
    over,
    props: {
      onDragOver: (e) => {
        e.preventDefault()
        e.stopPropagation()
        setOver(true)
      },
      onDragLeave: (e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false)
      },
      onDrop: (e) => {
        e.preventDefault()
        e.stopPropagation()
        setOver(false)
        const moved = e.dataTransfer.getData(DRAG)
        if (moved) {
          const { table, id } = JSON.parse(moved) as {
            table: Item['table']
            id: string
          }
          void db.update(table, id, {
            module_id: place.moduleId,
            week_id: place.weekId
          })
          return
        }
        const paths = pathsOf(e)
        if (paths.length) onAdd(api.materials.importTo(place, paths))
      }
    }
  }
}

function Section({
  module: mod,
  weeks,
  items,
  folded,
  onFold,
  onAdd,
  modules,
  allWeeks,
  onOpen,
  searching
}: {
  module: Module | null
  weeks: Week[]
  items: Item[]
  folded: boolean
  onFold: () => void
  onAdd: (w: Promise<Material[]>) => void
  modules: Module[]
  allWeeks: Week[]
  onOpen: (m: Material) => void
  searching: boolean
}): React.JSX.Element | null {
  const drop = useDropTarget({ moduleId: mod?.id ?? null, weekId: null }, onAdd)
  if (searching && !items.length) return null

  // Group by week (in week order); things in the module without a week come last.
  const weekIds = new Set(weeks.map((w) => w.id))
  const groups = weeks
    .map((w) => ({
      week: w as Week | null,
      items: items.filter((i) => i.row.week_id === w.id)
    }))
    .filter((g) => g.items.length)
  const loose = items.filter((i) => !i.row.week_id || !weekIds.has(i.row.week_id))
  if (loose.length) groups.push({ week: null, items: loose })
  const fileCount = items.filter((i) => i.table === 'materials').length
  const noteCount = items.length - fileCount

  return (
    <section className={`card overflow-hidden transition-colors ${drop.over ? 'border-accent bg-accent-soft/60' : ''}`} {...drop.props}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={onFold}>
          <Icon name="chevron" className={`shrink-0 text-muted transition-transform ${folded ? '' : 'rotate-90'}`} />
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: mod?.color ?? '#94a3b8' }} />
          <span className="truncate font-semibold">{mod ? (mod.code ? `${mod.code} · ${mod.name}` : mod.name) : 'Other'}</span>
          <span className="shrink-0 text-xs text-muted">
            {[fileCount && `${fileCount} file${fileCount === 1 ? '' : 's'}`, noteCount && `${noteCount} note${noteCount === 1 ? '' : 's'}`]
              .filter(Boolean)
              .join(' · ') || 'empty'}
          </span>
        </button>
        <button
          className="btn-ghost px-1.5"
          title={`Add files to ${mod ? mod.code || mod.name : 'Other'}`}
          onClick={() => onAdd(api.materials.pickTo({ moduleId: mod?.id ?? null, weekId: null }))}
        >
          <Icon name="plus" />
        </button>
        {mod && (
          <button className="btn-ghost px-1.5" title="Open module" onClick={() => navigate({ name: 'module', id: mod.id, tab: 'weeks' })}>
            <Icon name="external" />
          </button>
        )}
      </div>
      {!folded && (
        <div className="border-t border-line/60 px-2 pt-1 pb-2">
          {!items.length && (
            <p className="px-2 py-3 text-xs text-muted">{mod ? 'Nothing here yet — drop files on this card.' : 'Unsorted files and notes show up here.'}</p>
          )}
          {groups.map((g) => (
            <WeekGroup
              key={g.week?.id ?? 'none'}
              module={mod}
              week={g.week}
              items={g.items}
              onAdd={onAdd}
              modules={modules}
              allWeeks={allWeeks}
              onOpen={onOpen}
              showHeader={!!mod}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function WeekGroup({
  module: mod,
  week,
  items,
  onAdd,
  modules,
  allWeeks,
  onOpen,
  showHeader
}: {
  module: Module | null
  week: Week | null
  items: Item[]
  onAdd: (w: Promise<Material[]>) => void
  modules: Module[]
  allWeeks: Week[]
  onOpen: (m: Material) => void
  showHeader: boolean
}): React.JSX.Element {
  const drop = useDropTarget({ moduleId: mod?.id ?? null, weekId: week?.id ?? null }, onAdd)
  return (
    <div className={`rounded-lg transition-colors ${drop.over ? 'bg-accent-soft' : ''}`} {...drop.props}>
      {showHeader && (
        <div className="px-2 pt-2 pb-0.5 text-[11px] font-semibold tracking-wide text-muted uppercase">
          {week ? `Week ${week.number}${week.title ? ` · ${week.title}` : ''}` : 'Not in a week'}
        </div>
      )}
      {items.map((i) => (
        <Row key={i.row.id} item={i} modules={modules} allWeeks={allWeeks} onOpen={onOpen} />
      ))}
    </div>
  )
}

function Row({ item, modules, allWeeks, onOpen }: { item: Item; modules: Module[]; allWeeks: Week[]; onOpen: (m: Material) => void }): React.JSX.Element {
  const [moving, setMoving] = useState(false)
  const type = item.table === 'notes' ? { label: 'Note', cls: 'bg-accent-soft text-accent' } : fileType(item.row)
  const open = (): void => {
    if (item.table === 'notes') navigate({ name: 'notes', id: item.row.id })
    else openMaterial(item.row, onOpen)
  }
  const remove = (): void => {
    if (confirm(`Delete “${titleOf(item)}”?`)) void db.remove(item.table, item.row.id)
  }
  return (
    <div
      className="group relative flex items-center gap-2 rounded-md py-0.5 pl-1 hover:bg-line/30"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG, JSON.stringify({ table: item.table, id: item.row.id }))
        e.dataTransfer.effectAllowed = 'move'
      }}
    >
      <span className={`w-12 shrink-0 rounded px-1 py-0.5 text-center text-[10px] font-semibold ${type.cls}`}>{type.label}</span>
      <button
        className="min-w-0 flex-1 truncate px-1.5 py-1 text-left text-sm hover:text-accent"
        onClick={open}
        title={item.table === 'materials' ? item.row.file_name : 'Open note'}
      >
        {titleOf(item)}
      </button>
      <span className="shrink-0 text-[11px] text-muted group-hover:hidden">{item.table === 'materials' ? formatBytes(item.row.size_bytes) : ''}</span>
      <div className="hidden shrink-0 items-center group-hover:flex">
        <button className="btn-ghost px-1.5 text-xs" onClick={() => setMoving((m) => !m)} title="File it under a module and week">
          Move to…
        </button>
        {item.table === 'materials' && (
          <button className="btn-ghost px-1.5" onClick={() => void api.materials.openExternal(item.row.id)} title="Open in its own app">
            <Icon name="external" />
          </button>
        )}
        <button className="btn-ghost px-1.5 hover:text-danger" onClick={remove} title="Delete">
          <Icon name="trash" />
        </button>
      </div>
      {moving && <MoveTo item={item} modules={modules} allWeeks={allWeeks} onClose={() => setMoving(false)} />}
    </div>
  )
}

/** Small "file it under…" popover: pick a module and week, then Move. */
function MoveTo({ item, modules, allWeeks, onClose }: { item: Item; modules: Module[]; allWeeks: Week[]; onClose: () => void }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [moduleId, setModuleId] = useState(item.row.module_id ?? '')
  const [weekId, setWeekId] = useState(item.row.week_id ?? '')
  const weeks = allWeeks.filter((w) => w.module_id === moduleId).sort((a, b) => a.number - b.number)
  useEffect(() => {
    const close = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [onClose])
  const move = async (): Promise<void> => {
    let week = moduleId ? weekId || null : null
    if (week === 'new') week = (await db.create('weeks', { module_id: moduleId, number: Math.max(0, ...weeks.map((x) => x.number)) + 1, title: '' })).id
    onClose()
    await db.update(item.table, item.row.id, { module_id: moduleId || null, week_id: week })
  }
  return (
    <div ref={ref} className="card absolute top-full right-0 z-30 mt-1 flex w-64 flex-col gap-2 p-3 shadow-xl">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Module
        <select
          className="field-boxed text-sm text-ink"
          value={moduleId}
          onChange={(e) => {
            setModuleId(e.target.value)
            setWeekId('')
          }}
        >
          <option value="">Other (unsorted)</option>
          {modules.map((m) => (
            <option key={m.id} value={m.id}>
              {m.code ? `${m.code} · ${m.name}` : m.name}
            </option>
          ))}
        </select>
      </label>
      {moduleId && (
        <label className="flex flex-col gap-1 text-xs text-muted">
          Week
          <select className="field-boxed text-sm text-ink" value={weekId} onChange={(e) => setWeekId(e.target.value)}>
            <option value="">No week</option>
            {weeks.map((w) => (
              <option key={w.id} value={w.id}>
                Week {w.number}
                {w.title ? ` · ${w.title}` : ''}
              </option>
            ))}
            <option value="new">＋ New week</option>
          </select>
        </label>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button className="btn-ghost text-xs" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary px-3 py-1 text-xs" onClick={() => void move()}>
          Move
        </button>
      </div>
    </div>
  )
}
