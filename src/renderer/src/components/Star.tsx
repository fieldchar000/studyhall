// Starring: keep the files and notes you're using right now one tap away, for a week, two weeks,
// a month or until you take the star off. Star with the ☆ button, a right-click, or by pressing
// and holding on a touch screen. Starred things show in a "Starred" strip on Materials and Home.
// The star is saved on the file/note itself, so it syncs to your other devices.

import { useRef, useState } from 'react'
import type { Material, Note } from '@shared/types'
import { Icon } from '@/components/ui'
import { db, useRows } from '@/lib/data'
import { navigate } from '@/lib/nav'
import { Popover } from '@/components/Popover'
import { MaterialViewer, fileType, openMaterial } from '@/components/MaterialViewer'

/** "Until I remove it" is stored as a date far in the future, so every check is just a comparison. */
export const FOREVER = '9999-12-31T00:00:00.000Z'

type Starrable = { starred_until?: string | null }
export type StarTable = 'materials' | 'notes'

export const isStarred = (row: Starrable): boolean => !!row.starred_until && row.starred_until > new Date().toISOString()

/** "5 days left", "ends today", or "" for until-removed. */
export function starLeft(row: Starrable): string {
  if (!row.starred_until || row.starred_until >= FOREVER) return ''
  const days = Math.ceil((new Date(row.starred_until).getTime() - Date.now()) / 86_400_000)
  return days <= 1 ? 'ends today' : `${days} days left`
}

const CHOICES: [string, number | null][] = [
  ['For 7 days', 7],
  ['For 14 days', 14],
  ['For 30 days', 30],
  ['Until I remove it', null]
]

export function setStar(table: StarTable, id: string, days: number | null | 'off'): Promise<unknown> {
  const until = days === 'off' ? null : days === null ? FOREVER : new Date(Date.now() + days * 86_400_000).toISOString()
  return db.update(table, id, { starred_until: until })
}

/** The menu: how long to star for, or take the star off. */
export function StarMenu({ table, row, anchor, onClose }: { table: StarTable; row: Starrable & { id: string }; anchor: React.RefObject<HTMLElement | null>; onClose: () => void }): React.JSX.Element {
  const on = isStarred(row)
  const pick = (d: number | null | 'off'): void => {
    onClose()
    void setStar(table, row.id, d)
  }
  return (
    <Popover anchor={anchor} onClose={onClose} className="w-52 p-1 text-sm">
      <div className="label-caps px-2 pt-1 pb-1.5">{on ? `Starred${starLeft(row) ? ` · ${starLeft(row)}` : ''}` : 'Star'}</div>
      {CHOICES.map(([label, d]) => (
        <button key={label} className="flex items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-line/40" onClick={() => pick(d)}>
          <Icon name="star" size={14} className="text-brass" /> {on ? label.replace(/^For/, 'Keep for') : label}
        </button>
      ))}
      {on && (
        <button className="mt-0.5 flex items-center gap-2 rounded-md border-t border-line/60 px-2 py-2 text-left text-muted hover:bg-line/40 hover:text-ink" onClick={() => pick('off')}>
          <Icon name="x" size={14} /> Remove star
        </button>
      )}
    </Popover>
  )
}

/** Right-click, or press and hold on a touch screen, to open the star menu. */
export function useStarGestures(open: () => void): {
  onContextMenu: (e: React.MouseEvent) => void
  onTouchStart: () => void
  onTouchMove: () => void
  onTouchEnd: (e: React.TouchEvent) => void
  onClickCapture: (e: React.MouseEvent) => void
} {
  const timer = useRef<number | null>(null)
  const held = useRef(false)
  const cancel = (): void => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
  }
  return {
    onContextMenu: (e) => {
      e.preventDefault()
      open()
    },
    onTouchStart: () => {
      held.current = false
      cancel()
      timer.current = window.setTimeout(() => {
        held.current = true
        navigator.vibrate?.(15)
        open()
      }, 500)
    },
    onTouchMove: cancel,
    onTouchEnd: (e) => {
      cancel()
      if (held.current) e.preventDefault() // the hold opened the menu; don't also open the file
    },
    onClickCapture: (e) => {
      if (held.current) {
        held.current = false
        e.stopPropagation()
        e.preventDefault()
      }
    }
  }
}

/** The ☆ button on a row: filled and always shown when starred. */
export function StarButton({ table, row, open, onOpen, onClose, anchor }: { table: StarTable; row: Starrable & { id: string }; open: boolean; onOpen: () => void; onClose: () => void; anchor: React.RefObject<HTMLElement | null> }): React.JSX.Element {
  const on = isStarred(row)
  return (
    <>
      <button
        className={`btn-ghost shrink-0 px-1.5 ${on ? 'text-brass' : 'invisible text-muted group-hover:visible'}`}
        onClick={(e) => {
          e.stopPropagation()
          if (open) onClose()
          else onOpen()
        }}
        title={on ? `Starred${starLeft(row) ? ` — ${starLeft(row)}` : ''} (click to change)` : 'Star — keep it handy for a while'}
      >
        <Icon name="star" size={14} weight={on ? 'fill' : 'light'} />
      </button>
      {open && <StarMenu table={table} row={row} anchor={anchor} onClose={onClose} />}
    </>
  )
}

type Starred = { table: 'materials'; row: Material } | { table: 'notes'; row: Note }

/** The starred strip: everything starred right now, soonest-ending last. */
export function StarredStrip({ title = 'Starred', className = '' }: { title?: string; className?: string }): React.JSX.Element | null {
  const files = useRows('materials', {}, 'sort')
  const notes = useRows('notes', {}, 'updated_at')
  const [viewing, setViewing] = useState<Material | null>(null)
  const items: Starred[] = [
    ...(files ?? []).filter(isStarred).map((row) => ({ table: 'materials' as const, row })),
    ...(notes ?? []).filter(isStarred).map((row) => ({ table: 'notes' as const, row }))
  ].sort((a, b) => (b.row.starred_until ?? '').localeCompare(a.row.starred_until ?? ''))
  if (!items.length) return null
  return (
    <section className={className}>
      <div className="label-caps mb-1.5 flex items-center gap-1.5">
        <Icon name="star" size={12} weight="fill" className="text-brass" /> {title}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {items.map((i) => (
          <StarChip key={i.row.id} item={i} onOpen={() => (i.table === 'notes' ? navigate({ name: 'notes', id: i.row.id }) : openMaterial(i.row, setViewing))} />
        ))}
      </div>
      {viewing && <MaterialViewer material={viewing} onClose={() => setViewing(null)} />}
    </section>
  )
}

function StarChip({ item, onOpen }: { item: Starred; onOpen: () => void }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState(false)
  const gestures = useStarGestures(() => setMenu(true))
  const type = item.table === 'notes' ? { label: 'Note', cls: 'bg-accent-soft text-accent' } : fileType(item.row)
  const title = item.table === 'notes' ? item.row.title || 'Untitled note' : item.row.title
  const left = starLeft(item.row)
  return (
    <div ref={ref} className="card flex w-56 shrink-0 items-stretch overflow-hidden p-0 hover:border-brass/60" {...gestures}>
      <button className="flex min-w-0 flex-1 flex-col items-start gap-1 px-3 py-2 text-left" onClick={onOpen} title={item.table === 'materials' ? item.row.file_name : 'Open note'}>
        <span className={`rounded-sm px-1 py-0.5 text-[10px] font-semibold ${type.cls}`}>{type.label}</span>
        <span className="line-clamp-2 text-[13px] leading-snug font-medium">{title}</span>
        {left && <span className="text-[10.5px] text-muted">{left}</span>}
      </button>
      <button className="btn-ghost shrink-0 self-start px-1.5 pt-2 text-brass" onClick={() => setMenu((m) => !m)} title="Change or remove the star">
        <Icon name="star" size={14} weight="fill" />
      </button>
      {menu && <StarMenu table={item.table} row={item.row} anchor={ref} onClose={() => setMenu(false)} />}
    </div>
  )
}
