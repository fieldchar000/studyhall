// Weekly timetable: recurring lectures/tutorials that appear on the Home calendar.

import { useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { DateSelectArg, EventApi, EventInput } from '@fullcalendar/core'
import type { SlotKind, TimetableSlot } from '@shared/types'
import { AutoText } from '@/components/AutoField'
import { Icon } from '@/components/ui'
import { api, db, useLive } from '@/lib/data'

const KINDS: SlotKind[] = ['lecture', 'tutorial', 'lab', 'seminar', 'other']
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const pad = (n: number): string => String(n).padStart(2, '0')
const hhmm = (d: Date): string => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const weekdayOf = (d: Date): number => ((d.getDay() + 6) % 7) + 1

export function TimetablePage(): React.JSX.Element {
  const ref = useRef<FullCalendar>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const { data } = useLive(
    ['timetable_slots', 'modules'],
    async () => {
      const [slots, modules] = await Promise.all([api.list('timetable_slots', {}, 'weekday'), api.list('modules', { archived: 0 }, 'sort')])
      ref.current?.getApi().refetchEvents()
      return { slots: slots.sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time)), modules }
    },
    []
  )
  const modules = data?.modules ?? []

  const loadEvents = async (info: { startStr: string; endStr: string }): Promise<EventInput[]> => {
    const { classes } = await api.calendar.range(info.startStr, info.endStr, 'study')
    return classes.map((c) => ({
      id: c.id,
      title: c.location ? `${c.title} · ${c.location}` : c.title,
      start: c.start_at,
      end: c.end_at,
      backgroundColor: c.color,
      extendedProps: { slotId: c.slot_id }
    }))
  }

  // Drag across the grid to add a class at that day/time.
  const onSelect = async (sel: DateSelectArg): Promise<void> => {
    sel.view.calendar.unselect()
    if (!modules.length) return alert('Create a module first.')
    const slot = await db.create('timetable_slots', {
      module_id: modules[0].id,
      kind: 'lecture',
      weekday: weekdayOf(sel.start),
      start_time: hhmm(sel.start),
      end_time: hhmm(sel.end)
    })
    setSelected(slot.id)
  }

  // Dragging/resizing an occurrence moves the weekly slot.
  const onMove = ({ event }: { event: EventApi }): void => {
    const start = event.start!
    const end = event.end ?? new Date(start.getTime() + 36e5)
    void db.update('timetable_slots', event.extendedProps.slotId, {
      weekday: weekdayOf(start),
      start_time: hhmm(start),
      end_time: hhmm(end)
    })
  }

  return (
    <div className="flex h-full gap-5 p-5">
      <div className="card min-w-0 flex-1 p-4">
        <FullCalendar
          ref={ref}
          plugins={[timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
          buttonText={{ today: 'Today' }}
          height="100%"
          firstDay={1}
          allDaySlot={false}
          slotMinTime="07:00:00"
          slotMaxTime="22:00:00"
          nowIndicator
          selectable
          selectMirror
          editable
          events={(info, ok, fail) => void loadEvents(info).then(ok, fail)}
          select={(s) => void onSelect(s)}
          eventDrop={onMove}
          eventResize={onMove}
          eventClick={({ event }) => setSelected(event.extendedProps.slotId)}
          eventClassNames={({ event }) => (event.extendedProps.slotId === selected ? ['ring-2', 'ring-ink'] : [])}
        />
      </div>

      <div className="flex w-96 shrink-0 flex-col gap-3 overflow-auto">
        <div className="card p-4 text-sm">
          <h1 className="mb-1 text-lg font-semibold">Timetable</h1>
          <p className="text-xs text-muted">
            Drag on the grid to add a class; drag a class to move it. Each class repeats every week between its term dates and shows on your Home calendar.
          </p>
          <button
            className="btn mt-3"
            disabled={!modules.length}
            onClick={() =>
              void db
                .create('timetable_slots', { module_id: modules[0].id, kind: 'lecture', weekday: 1, start_time: '09:00', end_time: '10:00' })
                .then((s) => setSelected(s.id))
            }
          >
            <Icon name="plus" /> Add class
          </button>
          {!modules.length && <p className="mt-2 text-xs text-danger">Create a module first (Modules page).</p>}
        </div>
        {data?.slots.map((s) => (
          <SlotCard key={s.id} slot={s} modules={modules} selected={s.id === selected} onSelect={() => setSelected(s.id)} />
        ))}
      </div>
    </div>
  )
}

function SlotCard({
  slot: s,
  modules,
  selected,
  onSelect
}: {
  slot: TimetableSlot
  modules: { id: string; code: string; name: string; color: string }[]
  selected: boolean
  onSelect: () => void
}): React.JSX.Element {
  const save = (patch: Partial<TimetableSlot>): Promise<unknown> => db.update('timetable_slots', s.id, patch)
  const m = modules.find((x) => x.id === s.module_id)
  return (
    <div className={`card flex flex-col gap-2 p-3 text-sm ${selected ? 'border-accent' : ''}`} onClick={onSelect}>
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: m?.color }} />
        <select className="field-boxed min-w-0 flex-1" value={s.module_id} onChange={(e) => void save({ module_id: e.target.value })}>
          {modules.map((x) => (
            <option key={x.id} value={x.id}>
              {x.code ? `${x.code} · ` : ''}
              {x.name}
            </option>
          ))}
        </select>
        <select className="field-boxed w-auto capitalize" value={s.kind} onChange={(e) => void save({ kind: e.target.value as SlotKind })}>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <button className="btn-ghost px-1 hover:text-danger" title="Delete class" onClick={() => void db.remove('timetable_slots', s.id)}>
          <Icon name="trash" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <select className="field-boxed w-auto" value={s.weekday} onChange={(e) => void save({ weekday: Number(e.target.value) })}>
          {DAYS.map((d, i) => (
            <option key={d} value={i + 1}>
              {d}
            </option>
          ))}
        </select>
        <input type="time" className="field-boxed w-auto" value={s.start_time} onChange={(e) => e.target.value && void save({ start_time: e.target.value })} />
        <span className="text-muted">–</span>
        <input
          type="time"
          className="field-boxed w-auto"
          value={s.end_time}
          onChange={(e) => e.target.value && e.target.value > s.start_time && void save({ end_time: e.target.value })}
        />
      </div>
      <AutoText value={s.location} onSave={(v) => save({ location: v })} placeholder="Room / location" className="field-boxed" />
      <div className="flex items-center gap-2 text-xs text-muted">
        <span>Term</span>
        <input type="date" className="field-boxed w-auto" value={s.valid_from ?? ''} onChange={(e) => void save({ valid_from: e.target.value || null })} />
        <span>to</span>
        <input type="date" className="field-boxed w-auto" value={s.valid_to ?? ''} onChange={(e) => void save({ valid_to: e.target.value || null })} />
      </div>
    </div>
  )
}
