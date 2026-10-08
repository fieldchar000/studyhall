// Life → Library: books, films, shows, anime, games and podcasts — what you want to
// read/watch, what you're on (with progress), what you finished and what you thought.

import { useState } from 'react'
import type { MediaItem, MediaKind, MediaStatus } from '@shared/types'
import { AutoText } from '@/components/AutoField'
import { Icon } from '@/components/ui'
import { api, db, useLive } from '@/lib/data'
import { localDate } from '@/lib/dates'

export const KINDS: { id: MediaKind; label: string; icon: string; unit: string; creator: string }[] = [
  { id: 'book', label: 'Books', icon: '📚', unit: 'pages', creator: 'Author' },
  { id: 'show', label: 'Shows', icon: '📺', unit: 'episodes', creator: 'Network / studio' },
  { id: 'anime', label: 'Anime', icon: '🌸', unit: 'episodes', creator: 'Studio' },
  { id: 'film', label: 'Films', icon: '🎬', unit: 'min', creator: 'Director' },
  { id: 'game', label: 'Games', icon: '🎮', unit: 'hours', creator: 'Developer' },
  { id: 'podcast', label: 'Podcasts', icon: '🎧', unit: 'episodes', creator: 'Host' }
]
const STATUS: { id: MediaStatus; label: string }[] = [
  { id: 'doing', label: 'In progress' },
  { id: 'want', label: 'Want to' },
  { id: 'done', label: 'Finished' },
  { id: 'dropped', label: 'Dropped' }
]
const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#64748b']

export function useMedia(): MediaItem[] | undefined {
  return useLive(['media_items'], () => api.list('media_items', {}, 'sort'), []).data
}

export function LibraryPage(): React.JSX.Element {
  const items = useMedia()
  const [kind, setKind] = useState<MediaKind | 'all'>('all')
  const [title, setTitle] = useState('')
  const [addKind, setAddKind] = useState<MediaKind>('book')
  const [open, setOpen] = useState<string | null>(null)
  if (!items) return <div />

  const shown = items.filter((i) => kind === 'all' || i.kind === kind)
  const year = String(new Date().getFullYear())
  const doneThisYear = items.filter((i) => i.status === 'done' && (i.finished_at ?? '').startsWith(year))
  const add = async (): Promise<void> => {
    if (!title.trim()) return
    const k = kind === 'all' ? addKind : kind
    await db.create('media_items', { kind: k, title: title.trim(), status: 'want', color: COLORS[items.length % COLORS.length], sort: items.length })
    setTitle('')
  }

  return (
    <div className="mx-auto max-w-6xl p-8">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
        <div className="flex flex-wrap gap-1 rounded-lg bg-line/50 p-0.5 text-sm">
          <button onClick={() => setKind('all')} className={`rounded-md px-3 py-1 ${kind === 'all' ? 'bg-panel font-medium shadow-sm' : 'text-muted'}`}>
            All
          </button>
          {KINDS.map((k) => (
            <button key={k.id} onClick={() => setKind(k.id)} className={`rounded-md px-3 py-1 ${kind === k.id ? 'bg-panel font-medium shadow-sm' : 'text-muted'}`}>
              {k.icon} {k.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <span className="text-sm text-muted">
          {year}: {KINDS.map((k) => ({ k, n: doneThisYear.filter((i) => i.kind === k.id).length }))
            .filter((x) => x.n)
            .map((x) => `${x.n} ${(x.n === 1 ? x.k.label.replace(/s$/, '') : x.k.label).toLowerCase()}`)
            .join(' · ') || 'nothing finished yet'}
        </span>
      </div>

      <form
        className="mb-6 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
      >
        {kind === 'all' && (
          <select className="field-boxed w-auto" value={addKind} onChange={(e) => setAddKind(e.target.value as MediaKind)}>
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.icon} {k.label.replace(/s$/, '')}
              </option>
            ))}
          </select>
        )}
        <input className="field-boxed flex-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add something to read, watch or play…" />
        <button className="btn-primary" disabled={!title.trim()}>
          <Icon name="plus" /> Add
        </button>
      </form>

      <div className="grid gap-5 lg:grid-cols-3">
        {STATUS.filter((s) => s.id !== 'dropped' || shown.some((i) => i.status === 'dropped')).map((s) => {
          const list = shown.filter((i) => i.status === s.id)
          return (
            <section key={s.id} className={s.id === 'dropped' ? 'lg:col-span-3' : ''}>
              <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
                {s.label} <span className="font-normal">{list.length}</span>
              </h2>
              <div className="flex flex-col gap-2">
                {list.length === 0 && <div className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-muted">Nothing here</div>}
                {list.map((i) => (
                  <MediaCard key={i.id} i={i} open={open === i.id} onToggle={() => setOpen(open === i.id ? null : i.id)} />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function MediaCard({ i, open, onToggle }: { i: MediaItem; open: boolean; onToggle: () => void }): React.JSX.Element {
  const k = KINDS.find((x) => x.id === i.kind)!
  const save = (p: Partial<MediaItem>): Promise<MediaItem> => db.update('media_items', i.id, p)
  const setStatus = (status: MediaStatus): void => {
    const p: Partial<MediaItem> = { status }
    if (status === 'doing' && !i.started_at) p.started_at = localDate(new Date())
    if (status === 'done') {
      p.finished_at = localDate(new Date())
      if (i.total) p.progress = i.total
    }
    void save(p)
  }
  const pct = i.total ? Math.min(100, (i.progress / i.total) * 100) : null
  return (
    <div className="card overflow-hidden">
      <div className="flex">
        <div className="flex w-12 shrink-0 items-center justify-center text-xl" style={{ background: i.color + '30' }}>
          {k.icon}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3">
          <button className="truncate text-left font-medium" onClick={onToggle} title="Details">
            {i.title}
          </button>
          {i.creator && <div className="-mt-1 truncate text-xs text-muted">{i.creator}</div>}
          {i.status === 'doing' && (
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full" style={{ width: `${pct ?? 0}%`, background: i.color }} />
              </div>
              <span className="text-[11px] whitespace-nowrap text-muted">
                {i.progress}
                {i.total ? `/${i.total}` : ''} {k.unit}
              </span>
              <button className="btn-ghost px-1.5 py-0 text-xs" onClick={() => void save({ progress: i.progress + 1 })} title={`+1 ${k.unit}`}>
                +1
              </button>
            </div>
          )}
          {i.status === 'done' && (
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((r) => (
                <button key={r} onClick={() => void save({ rating: r })} className={`text-sm ${(i.rating ?? 0) >= r ? 'text-amber-500' : 'text-line'}`}>
                  ★
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1">
            {i.status === 'want' && (
              <button className="btn px-2 py-0.5 text-xs" onClick={() => setStatus('doing')}>
                Start
              </button>
            )}
            {i.status === 'doing' && (
              <button className="btn px-2 py-0.5 text-xs" onClick={() => setStatus('done')}>
                Finished ✓
              </button>
            )}
          </div>
        </div>
      </div>
      {open && (
        <div className="flex flex-col gap-2 border-t border-line p-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <AutoText value={i.title} onSave={(v) => save({ title: v.trim() || 'Untitled' })} className="field-boxed col-span-2" />
            <AutoText value={i.creator} onSave={(v) => save({ creator: v })} className="field-boxed" placeholder={k.creator} />
            <select className="field-boxed" value={i.status} onChange={(e) => setStatus(e.target.value as MediaStatus)}>
              {STATUS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-xs text-muted">
              On
              <input type="number" className="field-boxed" min={0} value={i.progress} onChange={(e) => void save({ progress: Math.max(0, Number(e.target.value) || 0) })} />
            </label>
            <label className="flex items-center gap-1 text-xs text-muted">
              of
              <input type="number" className="field-boxed" min={0} value={i.total ?? ''} placeholder={k.unit} onChange={(e) => void save({ total: e.target.value ? Math.max(0, Number(e.target.value)) : null })} />
            </label>
          </div>
          <AutoText multiline rows={3} value={i.notes} onSave={(v) => save({ notes: v })} className="field-boxed" placeholder="Thoughts, favourite quotes, who recommended it…" />
          <div className="flex items-center gap-1">
            {COLORS.map((c) => (
              <button key={c} className="h-4 w-4 rounded-full" style={{ background: c }} onClick={() => void save({ color: c })} />
            ))}
            <div className="flex-1" />
            {i.status !== 'dropped' && (
              <button className="btn-ghost text-xs" onClick={() => setStatus('dropped')}>
                Drop
              </button>
            )}
            <button className="btn-ghost text-xs text-danger" onClick={() => confirm(`Delete “${i.title}”?`) && void db.remove('media_items', i.id)}>
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
