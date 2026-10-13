// Filing helpers shared by Materials and a module's Weeks tab: weeks you can renumber,
// a compact week picker, the Notes/Worksheet switch, and moving things by drag-and-drop.

import { useState } from 'react'
import type { Material, MaterialCategory, MaterialPlace, Week } from '@shared/types'
import { api, db } from '@/lib/data'

/** dataTransfer type for an item dragged inside the app. */
export const DRAG = 'application/x-studyhall-item'

export type Filed = { table: 'materials' | 'notes'; id: string }

export const CATEGORY_LABEL: Record<MaterialCategory, string> = { notes: 'Notes', worksheet: 'Worksheets' }

/** The lowest week number not in use (so deleting Week 1 and adding a week brings Week 1 back). */
export function nextWeekNumber(weeks: Week[]): number {
  const used = new Set(weeks.map((w) => w.number))
  let n = 1
  while (used.has(n)) n++
  return n
}

export const weekLabel = (w: Week): string => `Week ${w.number}${w.title ? ` · ${w.title}` : ''}`

/** Give a week a new number. If another week already has it, the two swap. */
export async function renumberWeek(week: Week, n: number, siblings: Week[]): Promise<void> {
  if (!Number.isInteger(n) || n < 0 || n > 99 || n === week.number) return
  const clash = siblings.find((w) => w.id !== week.id && w.number === n)
  if (clash) await db.update('weeks', clash.id, { number: week.number })
  await db.update('weeks', week.id, { number: n })
}

/** Delete a week but keep everything that was in it (it moves to "Not in a week"). */
export async function deleteWeek(week: Week): Promise<void> {
  const [files, notes] = await Promise.all([api.list('materials', { week_id: week.id }), api.list('notes', { week_id: week.id })])
  for (const f of files) await db.update('materials', f.id, { week_id: null })
  for (const n of notes) await db.update('notes', n.id, { week_id: null })
  await db.remove('weeks', week.id)
}

export async function createWeek(moduleId: string, weeks: Week[]): Promise<Week> {
  return db.create('weeks', { module_id: moduleId, number: nextWeekNumber(weeks), title: '' })
}

/** File an item somewhere (any field left out stays as it is). */
export function fileItem(item: Filed, place: Partial<MaterialPlace>): Promise<unknown> {
  const patch: Record<string, unknown> = {}
  if ('moduleId' in place) patch.module_id = place.moduleId
  if ('weekId' in place) patch.week_id = place.weekId
  if (place.category) patch.category = place.category
  return db.update(item.table, item.id, patch)
}

/** Props that make an element accept dragged items (moved) and files from Explorer (imported). */
export function useDrop(
  place: MaterialPlace,
  onImport: (work: Promise<Material[]>) => void
): { over: boolean; props: Pick<React.HTMLAttributes<HTMLElement>, 'onDragOver' | 'onDragLeave' | 'onDrop'> } {
  const [over, setOver] = useState(false)
  return {
    over,
    props: {
      onDragOver: (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!over) setOver(true)
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
          void fileItem(JSON.parse(moved) as Filed, place)
          return
        }
        const paths = [...e.dataTransfer.files].map((f) => api.materials.pathForFile(f)).filter(Boolean)
        if (paths.length) onImport(api.materials.importTo(place, paths))
      }
    }
  }
}

export const dragProps = (item: Filed): Pick<React.HTMLAttributes<HTMLElement>, 'draggable' | 'onDragStart'> => ({
  draggable: true,
  onDragStart: (e) => {
    e.dataTransfer.setData(DRAG, JSON.stringify(item))
    e.dataTransfer.effectAllowed = 'move'
  }
})

/** A small "Week 3 ▾" picker. Choosing "New week" makes the next free week. */
export function WeekSelect({
  item,
  moduleId,
  weekId,
  weeks,
  className = ''
}: {
  item: Filed
  moduleId: string
  weekId: string | null
  weeks: Week[]
  className?: string
}): React.JSX.Element {
  const mine = weeks.filter((w) => w.module_id === moduleId).sort((a, b) => a.number - b.number)
  return (
    <select
      className={`cursor-pointer rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-[11px] text-muted outline-none hover:border-line hover:text-ink focus:border-accent ${className}`}
      value={weekId && mine.some((w) => w.id === weekId) ? weekId : ''}
      title="Change week"
      onClick={(e) => e.stopPropagation()}
      onChange={async (e) => {
        const v = e.target.value
        const target = v === 'new' ? (await createWeek(moduleId, mine)).id : v || null
        await fileItem(item, { weekId: target })
      }}
    >
      <option value="">No week</option>
      {mine.map((w) => (
        <option key={w.id} value={w.id}>
          {weekLabel(w)}
        </option>
      ))}
      <option value="new">＋ New week</option>
    </select>
  )
}

/** Switch between Notes and Worksheet. */
export function CategoryToggle({ item, category }: { item: Filed; category: MaterialCategory }): React.JSX.Element {
  const other: MaterialCategory = category === 'worksheet' ? 'notes' : 'worksheet'
  return (
    <button
      className="btn-ghost px-1.5 text-[11px]"
      title={`File under ${CATEGORY_LABEL[other]}`}
      onClick={(e) => {
        e.stopPropagation()
        void fileItem(item, { category: other })
      }}
    >
      → {other === 'worksheet' ? 'Worksheet' : 'Notes'}
    </button>
  )
}
