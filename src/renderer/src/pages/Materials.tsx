// Materials: one place for every file and note, filed module by module and week by week,
// each week split into Notes and Worksheets. Unsorted things live in "Other".
// Anything can be moved by drag-and-drop, the week picker on each row, or "Move to…".

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Material, MaterialCategory, Module, Note, Week } from '@shared/types'
import { Icon } from '@/components/ui'
import { api, db, notifyChanged, track, useRows } from '@/lib/data'
import { formatBytes } from '@/lib/dates'
import { navigate } from '@/lib/nav'
import { MaterialViewer, fileType, openMaterial } from '@/components/MaterialViewer'
import { CategoryToggle, WeekSelect, createWeek, dragProps, useDrop, type Filed } from '@/components/Filing'

type Item = { table: 'materials'; row: Material } | { table: 'notes'; row: Note }
type Filter = 'all' | MaterialCategory
const OTHER = 'other'

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
const filed = (i: Item): Filed => ({ table: i.table, id: i.row.id })
const categoryOf = (i: Item): MaterialCategory => (i.row.category === 'worksheet' ? 'worksheet' : 'notes')
const count = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

type Shared = {
  modules: Module[]
  allWeeks: Week[]
  filter: Filter
  onAdd: (w: Promise<Material[]>) => void
  onOpen: (m: Material) => void
}

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
      ...(files ?? []).map((row) => ({ table: 'materials' as const, row })),
      ...[...(notes ?? [])].reverse().map((row) => ({ table: 'notes' as const, row }))
    ].filter((i) => filter === 'all' || categoryOf(i) === filter)
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
    const sheets = added.filter((m) => m.category === 'worksheet').length
    setMsg(
      `Added ${count(added.length, 'file')}` +
        (sorted === added.length ? (sorted > 1 ? ', all sorted into modules' : '') : sorted ? `: ${sorted} sorted by name, ${added.length - sorted} in Other` : ' to Other') +
        (sheets ? ` (${count(sheets, 'worksheet')})` : '') +
        '.'
    )
    setTimeout(() => setMsg(null), 6000)
  }

  const visible = modules.filter((m) => !view.hidden.includes(m.id))
  const loading = !files || !notes
  const totals = { notes: items.filter((i) => categoryOf(i) === 'notes').length, sheets: items.filter((i) => categoryOf(i) === 'worksheet').length }
  const shared: Shared = { modules, allWeeks: weeks, filter, onAdd: (w) => void add(w), onOpen: setViewing }
  const searching = !!q.trim() || filter !== 'all'

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
        const paths = [...e.dataTransfer.files].map((f) => api.materials.pathForFile(f)).filter(Boolean)
        if (paths.length) void add(api.materials.importTo(null, paths))
      }}
    >
      <header className="border-b border-line/70 px-8 pt-6 pb-4">
        <div className="mx-auto flex max-w-5xl flex-wrap items-end gap-3">
          <div className="mr-auto min-w-0">
            <div className="label-caps">Study library</div>
            <h1 className="text-3xl">Materials</h1>
            <p className="mt-0.5 text-sm text-muted">
              {loading ? ' ' : `${count(totals.notes, 'set of notes', 'notes')} · ${count(totals.sheets, 'worksheet')}`} — drop files anywhere and they file themselves.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <Icon name="search" size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
              <input className="field-boxed w-48 py-1.5 pl-8 text-sm" placeholder="Search materials" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <div className="flex gap-0.5 rounded-md border border-line bg-line/30 p-0.5 text-xs">
              {(
                [
                  ['all', 'All'],
                  ['notes', 'Notes'],
                  ['worksheet', 'Worksheets']
                ] as const
              ).map(([f, label]) => (
                <button key={f} onClick={() => setFilter(f)} className={`rounded px-2.5 py-1 ${filter === f ? 'bg-panel font-semibold text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
                  {label}
                </button>
              ))}
            </div>
            <ModulePicker modules={modules} hidden={view.hidden} onToggle={(id) => toggle('hidden', id)} onShowAll={() => update({ ...view, hidden: [] })} />
            <button className="btn-primary" onClick={() => void add(api.materials.pickTo(null))}>
              <Icon name="upload" /> Add files
            </button>
          </div>
        </div>
      </header>

      <div className={`min-h-0 flex-1 overflow-auto px-8 py-5 transition-colors ${dropAll ? 'bg-accent-soft/40' : ''}`}>
        <div className="mx-auto flex max-w-5xl flex-col gap-4">
          {msg && <div className="rounded-md border border-brass/40 bg-panel px-3 py-2 text-sm">{msg}</div>}
          {loading ? null : !modules.length && !items.length ? (
            <div className="m-auto mt-16 flex max-w-md flex-col items-center gap-3 text-center">
              <Icon name="materials" size={40} className="text-brass" />
              <h2 className="text-xl">Your study library</h2>
              <p className="text-sm text-muted">
                Drop lecture slides, readings, PDFs and worksheets here. Add your modules and files will sort themselves into them, week by week.
              </p>
              <button className="btn" onClick={() => navigate({ name: 'modules' })}>
                <Icon name="modules" /> Set up modules
              </button>
            </div>
          ) : (
            <>
              {visible.map((m) => (
                <Section
                  key={m.id}
                  module={m}
                  weeks={weeks.filter((w) => w.module_id === m.id)}
                  items={bySection.get(m.id) ?? []}
                  folded={view.folded.includes(m.id)}
                  onFold={() => toggle('folded', m.id)}
                  searching={searching}
                  {...shared}
                />
              ))}
              {!view.hidden.includes(OTHER) && (
                <Section
                  module={null}
                  weeks={[]}
                  items={bySection.get(OTHER) ?? []}
                  folded={view.folded.includes(OTHER)}
                  onFold={() => toggle('folded', OTHER)}
                  searching={searching}
                  {...shared}
                />
              )}
              {view.hidden.length > 0 && (
                <button className="self-center text-xs text-muted hover:text-ink" onClick={() => update({ ...view, hidden: [] })}>
                  {count(view.hidden.length, 'section')} hidden · show all
                </button>
              )}
            </>
          )}
        </div>
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

function Section({
  module: mod,
  weeks,
  items,
  folded,
  onFold,
  searching,
  ...shared
}: Shared & {
  module: Module | null
  weeks: Week[]
  items: Item[]
  folded: boolean
  onFold: () => void
  searching: boolean
}): React.JSX.Element | null {
  const drop = useDrop({ moduleId: mod?.id ?? null, weekId: null }, shared.onAdd)
  if (searching && !items.length) return null

  // Weeks in order (only the ones with something in them), then things with no week.
  const weekIds = new Set(weeks.map((w) => w.id))
  const groups: { week: Week | null; items: Item[] }[] = [...weeks]
    .sort((a, b) => a.number - b.number)
    .map((w) => ({ week: w, items: items.filter((i) => i.row.week_id === w.id) }))
    .filter((g) => g.items.length)
  const loose = items.filter((i) => !i.row.week_id || !weekIds.has(i.row.week_id))
  if (loose.length || !groups.length) groups.push({ week: null, items: loose })
  const sheets = items.filter((i) => categoryOf(i) === 'worksheet').length

  return (
    <section className={`card overflow-hidden transition-colors ${drop.over ? 'border-accent bg-accent-soft/50' : ''}`} {...drop.props}>
      <div className="flex items-center gap-2 px-4 py-3">
        <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={onFold} aria-expanded={!folded}>
          <Icon name="chevron" size={14} className={`shrink-0 text-muted transition-transform ${folded ? '' : 'rotate-90'}`} />
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: mod?.color ?? 'var(--color-muted)' }} />
          <span className="min-w-0">
            <span className="font-display block truncate text-[18px] leading-tight font-semibold">{mod ? mod.name : 'Other'}</span>
            <span className="text-[11px] tracking-wide text-muted">
              {mod?.code ? `${mod.code} · ` : ''}
              {items.length ? `${count(items.length - sheets, 'note')} · ${count(sheets, 'worksheet')}` : mod ? 'Nothing filed yet' : 'Unsorted files and notes'}
            </span>
          </span>
        </button>
        <button
          className="btn-ghost px-1.5"
          title={`Add files to ${mod ? mod.code || mod.name : 'Other'}`}
          onClick={() => shared.onAdd(api.materials.pickTo({ moduleId: mod?.id ?? null, weekId: null }))}
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
        <div className="flex flex-col divide-y divide-line/60 border-t border-line/60">
          {groups.map((g) => (
            <WeekBlock key={g.week?.id ?? 'none'} module={mod} week={g.week} items={g.items} {...shared} />
          ))}
          {mod && !searching && (
            <button
              className="px-4 py-2 text-left text-xs text-muted hover:bg-line/30 hover:text-ink"
              onClick={() => void createWeek(mod.id, weeks).then(() => notifyChanged('weeks'))}
            >
              + Add a week
            </button>
          )}
        </div>
      )}
    </section>
  )
}

/** One week: its Notes and Worksheets side by side. */
function WeekBlock({ module: mod, week, items, ...shared }: Shared & { module: Module | null; week: Week | null; items: Item[] }): React.JSX.Element {
  const cols: MaterialCategory[] = shared.filter === 'all' ? ['notes', 'worksheet'] : [shared.filter]
  return (
    <div className="px-4 py-3">
      {mod && (
        <div className="mb-2 flex items-baseline gap-2">
          {week ? (
            <>
              <span className="rounded-sm bg-accent-soft px-1.5 py-px text-[11px] font-semibold text-accent tabular-nums">Week {week.number}</span>
              <span className="truncate text-sm font-medium">{week.title || <span className="text-muted">No topic yet</span>}</span>
            </>
          ) : (
            <span className="label-caps">Not in a week</span>
          )}
        </div>
      )}
      <div className={`grid gap-3 ${cols.length > 1 ? 'md:grid-cols-2' : ''}`}>
        {cols.map((c) => (
          <Column key={c} category={c} module={mod} week={week} items={items.filter((i) => categoryOf(i) === c)} {...shared} />
        ))}
      </div>
    </div>
  )
}

function Column({
  category,
  module: mod,
  week,
  items,
  ...shared
}: Shared & { category: MaterialCategory; module: Module | null; week: Week | null; items: Item[] }): React.JSX.Element {
  const drop = useDrop({ moduleId: mod?.id ?? null, weekId: week?.id ?? null, category }, shared.onAdd)
  return (
    <div className={`min-w-0 rounded-md transition-colors ${drop.over ? 'bg-accent-soft ring-1 ring-accent/40' : ''}`} {...drop.props}>
      <div className="mb-1 flex items-center gap-1.5 px-1 text-[10.5px] font-semibold tracking-[0.12em] text-muted uppercase">
        <Icon name={category === 'worksheet' ? 'pencil' : 'note'} size={12} />
        {category === 'worksheet' ? 'Worksheets' : 'Notes'}
        {items.length > 0 && <span className="font-normal tracking-normal text-muted/70">{items.length}</span>}
      </div>
      {items.length ? (
        items.map((i) => <Row key={i.row.id} item={i} {...shared} />)
      ) : (
        <div className="rounded-md border border-dashed border-line px-2 py-2 text-[11px] text-muted/70">Drop {category === 'worksheet' ? 'worksheets' : 'notes or slides'} here</div>
      )}
    </div>
  )
}

function Row({ item, modules, allWeeks, onOpen }: Shared & { item: Item }): React.JSX.Element {
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
    <div className="group relative flex items-center gap-2 rounded-md py-0.5 pr-1 pl-1 hover:bg-line/30" {...dragProps(filed(item))}>
      <span className={`w-11 shrink-0 rounded-sm px-1 py-0.5 text-center text-[10px] font-semibold ${type.cls}`}>{type.label}</span>
      <button
        className="min-w-0 flex-1 truncate py-1 text-left text-[13.5px] hover:text-accent"
        onClick={open}
        title={item.table === 'materials' ? `${item.row.file_name} — click to open` : 'Open note'}
      >
        {titleOf(item)}
      </button>
      <span className="shrink-0 text-[11px] text-muted tabular-nums group-hover:hidden">{item.table === 'materials' ? formatBytes(item.row.size_bytes) : ''}</span>
      <div className="hidden shrink-0 items-center group-hover:flex">
        {item.row.module_id && <WeekSelect item={filed(item)} moduleId={item.row.module_id} weekId={item.row.week_id} weeks={allWeeks} className="max-w-28" />}
        <CategoryToggle item={filed(item)} category={categoryOf(item)} />
        <button className="btn-ghost px-1.5 text-[11px]" onClick={() => setMoving((m) => !m)} title="Move to another module">
          Move…
        </button>
        {item.table === 'materials' && (
          <button className="btn-ghost px-1.5" onClick={() => void api.materials.openExternal(item.row.id)} title="Open in its own app">
            <Icon name="external" size={14} />
          </button>
        )}
        <button className="btn-ghost px-1.5 hover:text-danger" onClick={remove} title="Delete">
          <Icon name="trash" size={14} />
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
    if (week === 'new') week = (await createWeek(moduleId, weeks)).id
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
