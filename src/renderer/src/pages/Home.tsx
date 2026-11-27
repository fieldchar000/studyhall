import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin, { Draggable, type EventReceiveArg } from '@fullcalendar/interaction'
import type { EventInput, EventApi, DateSelectArg, EventClickArg } from '@fullcalendar/core'
import type { CalEvent, Task } from '@shared/types'
import { AutoText } from '@/components/AutoField'
import { ColorPicker, Icon, Modal, PALETTE } from '@/components/ui'
import { api, db, useLive, useRows } from '@/lib/data'
import { addDays, formatDateTime, isoToLocalInput, localDate, localInputToIso, relativeDue } from '@/lib/dates'
import { navigate, replaceRoute } from '@/lib/nav'
import { useMode, useProfile } from '@/lib/profile'
import { addToTop3, isOverdue, openTask, removeFromTop3, setDone, todayStr } from '@/lib/tasks'
import { ExamCountdownPanel } from '@/components/RevisionPlanner'
import { SpotifyPanel } from '@/components/SpotifyPanel'
import { StarredStrip } from '@/components/Star'
import { LifeTodayCard } from './Habits'
import { BudgetAlerts, CheckinCard, OccasionsCard } from '@/components/LifeCards'
import { buildBrain, readNewFiles, type Brain } from '@/lib/brain'
import { GalaxyScene, type Cat } from '@/lib/galaxy/scene'
import { starsFromBrain } from '@/lib/galaxy/stars'
import { isPhoneApp, useNarrow } from '@/lib/platform'
import { BrainSection } from './Brain'

const clamp = (x: number): number => Math.min(1, Math.max(0, x))

/** Home and the Brain share one page: your week first, and above it the galaxies. Scroll up
 *  and they fold into a brain. The `brain` route just opens this page scrolled to the top. */
export function HomePage({ view, q }: { view: 'home' | 'brain'; q?: string }): React.JSX.Element {
  const mode = useMode()
  const pageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const brainRef = useRef<HTMLElement>(null)
  const bandRef = useRef<HTMLDivElement>(null)
  const veilRef = useRef<HTMLDivElement>(null)
  const [scene, setScene] = useState<GalaxyScene | null>(null)
  const [brain, setBrain] = useState<Brain | null>(null)
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null)
  const [inBrain, setInBrain] = useState(view === 'brain')
  const [brainQ, setBrainQ] = useState<string | undefined>(q)
  const readStarted = useRef(false)

  // Task rows can be dragged onto the calendar to block out time.
  useEffect(() => {
    if (!pageRef.current) return
    const d = new Draggable(pageRef.current, {
      itemSelector: '[data-task-drag]',
      eventData: (el) => ({
        title: el.getAttribute('data-title') ?? 'Task',
        duration: '01:00',
        create: true,
        extendedProps: { taskId: el.getAttribute('data-task-drag') }
      })
    })
    return () => d.destroy()
  }, [])

  // The sky (WebGL). If the device can't do it, the page still works on a plain dark background.
  useEffect(() => {
    let sc: GalaxyScene | null = null
    try {
      sc = new GalaxyScene(canvasRef.current!, { lowPower: isPhoneApp(), overlay: overlayRef.current! })
      sc.bindPointer(scrollRef.current!)
      setScene(sc)
    } catch (e) {
      console.warn('Galaxy sky unavailable', e)
    }
    return () => sc?.dispose()
  }, [])

  const rebuild = useCallback(async () => setBrain(await buildBrain()), [])
  useEffect(() => {
    let stop = false
    void buildBrain().then((b) => !stop && setBrain(b))
    return () => {
      stop = true
    }
  }, [])
  // Reading new files is slow, so only once you've been up to the Brain.
  useEffect(() => {
    if (!inBrain || readStarted.current) return
    readStarted.current = true
    void (async () => {
      const read = await readNewFiles((done, total) => alive.current && setReading(total ? { done, total } : null), () => !alive.current)
      if (!alive.current) return
      setReading(null)
      if (read > 0) setBrain(await buildBrain())
    })()
  }, [inBrain])
  const alive = useRef(true)
  useEffect(
    () => () => {
      alive.current = false
    },
    []
  )

  const catCounts = useMemo(() => {
    const c: Record<Cat, number> = { study: 0, life: 0, proj: 0, due: 0 }
    if (!brain) return c
    const { stars } = starsFromBrain(brain)
    stars.forEach((s) => c[s.cat]++)
    return c
  }, [brain])
  useEffect(() => {
    if (!scene || !brain) return
    const { stars, links } = starsFromBrain(brain)
    scene.setStars(stars, links)
  }, [scene, brain])

  // Scrolling between the week (bottom) and the brain (top)
  const onScroll = useCallback(() => {
    const s = scrollRef.current, br = brainRef.current
    if (!s || !br) return
    const b = clamp(1 - s.scrollTop / Math.max(1, br.offsetHeight))
    scene?.set({ b })
    if (veilRef.current) veilRef.current.style.opacity = String(1 - b)
    if (overlayRef.current) overlayRef.current.style.opacity = String(b)
    setInBrain(b > 0.5)
  }, [scene])
  useEffect(onScroll, [onScroll])

  // Scrolling up into the Brain (or back) updates the sidebar without adding a Back step.
  const fromScroll = useRef(false)
  useEffect(() => {
    const want = inBrain ? 'brain' : 'home'
    if (want !== view) {
      fromScroll.current = true
      replaceRoute({ name: want })
    }
  }, [inBrain]) // eslint-disable-line react-hooks/exhaustive-deps

  const first = useRef(true)
  useLayoutEffect(() => {
    const s = scrollRef.current, br = brainRef.current
    if (!s || !br) return
    if (fromScroll.current) {
      fromScroll.current = false
      return
    }
    s.scrollTo({ top: view === 'brain' ? 0 : br.offsetHeight, behavior: first.current ? 'auto' : 'smooth' })
    first.current = false
    onScroll()
    if (view === 'brain' && q != null) setBrainQ(q)
  }, [view, q]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the galaxies centred in the open band above the calendar.
  useEffect(() => {
    const s = scrollRef.current, band = bandRef.current
    if (!s || !band || !scene) return
    const measure = (): void => scene.set({ band: (band.offsetTop + band.offsetHeight / 2) / Math.max(1, s.clientHeight) }) // offsetTop is within the week section
    const ro = new ResizeObserver(measure)
    ro.observe(s)
    ro.observe(band)
    measure()
    return () => ro.disconnect()
  }, [scene])
  // Stay on the week when the window changes size.
  useEffect(() => {
    const s = scrollRef.current
    if (!s) return
    const ro = new ResizeObserver(() => {
      if (!inBrain && brainRef.current && s.scrollTop < brainRef.current.offsetHeight * 1.2) s.scrollTop = brainRef.current.offsetHeight
    })
    ro.observe(s)
    return () => ro.disconnect()
  }, [inBrain])

  const goBrain = (): void => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  const goHome = (): void => scrollRef.current?.scrollTo({ top: brainRef.current?.offsetHeight ?? 0, behavior: 'smooth' })
  const searchFromHome = (v: string): void => {
    setBrainQ(v)
    goBrain()
    setTimeout(() => (document.getElementById('brain-q') as HTMLInputElement | null)?.focus({ preventScroll: true }), 50)
  }

  return (
    <div ref={pageRef} className="space relative h-full overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-hidden />
      <div ref={veilRef} className="space-veil pointer-events-none absolute inset-0" />
      <div ref={overlayRef} className="pointer-events-none absolute inset-0 z-[1] overflow-hidden" />
      <div ref={scrollRef} onScroll={onScroll} className="no-scrollbar absolute inset-0 z-[2] snap-y snap-proximity overflow-x-hidden overflow-y-auto">
        <section ref={brainRef} className="relative h-full min-h-[560px] snap-start" style={{ touchAction: 'pan-y' }}>
          <BrainSection brain={brain} scene={scene} catCounts={catCounts} reading={reading} onRebuild={() => void rebuild()} initialQ={brainQ} active={inBrain} onGoHome={goHome} />
        </section>

        <section className="relative flex min-h-[640px] snap-start flex-col px-4 pb-4 sm:px-6 lg:h-full">
          <div ref={bandRef} className="flex shrink-0 flex-col items-center pt-3" style={{ height: 'clamp(84px, 21vh, 230px)' }}>
            <button data-ui className="space-chip" onClick={goBrain}>
              <span className="flex gap-1">
                <i className="h-1.5 w-1.5 rounded-full bg-[#39ff88] shadow-[0_0_8px_#39ff88]" />
                <i className="h-1.5 w-1.5 rounded-full bg-[#ff3ea5]" />
                <i className="h-1.5 w-1.5 rounded-full bg-[#ff3b3b]" />
              </span>
              <Icon name="chevron" size={13} className="-rotate-90" /> Scroll up to form your brain
            </button>
          </div>
          <Greeting onSearch={searchFromHome} />
          <div className="mt-3 flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
            <section className="card flex h-[74vh] min-w-0 flex-col p-3 lg:h-auto lg:min-h-0 lg:flex-1">
              <CalendarView />
            </section>
            <aside className="no-scrollbar flex w-full shrink-0 flex-col gap-4 lg:w-[300px] lg:overflow-y-auto">
              <Top3Panel />
              <PlanPanel />
              <DeadlinesPanel />
            </aside>
          </div>
        </section>

        <section className="snap-start px-4 pt-2 pb-12 sm:px-6">
          <div className="label-caps mb-3">More for today</div>
          <div className="flex flex-col gap-5">
            <StarredStrip title="Starred — keep handy" />
            <BudgetAlerts />
            <div className="columns-1 gap-5 md:columns-2 xl:columns-3 [&>*]:mb-5 [&>*]:break-inside-avoid">
              {mode === 'study' && <RecallHomeCard />}
              {mode === 'life' && <LifeTodayCard />}
              <CheckinCard />
              <ExamCountdownPanel />
              <OccasionsCard />
              <SpotifyPanel />
              <SubscriptionsPanel />
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

/** The date, "Good evening" and a one-line summary of the day. */
function Greeting({ onSearch }: { onSearch: (q: string) => void }): React.JSX.Element {
  const mode = useMode()
  const profile = useProfile()
  const { data } = useLive(
    ['tasks', 'focus_sessions'],
    async () => {
      const [tasks, sessions] = await Promise.all([api.list('tasks', { mode }), api.list('focus_sessions')])
      const today = todayStr()
      const open = tasks.filter((t) => t.status !== 'done' && !t.parent_task_id)
      const dueToday = open.filter((t) => t.due_at && localDate(new Date(t.due_at)) === today).length
      const overdue = open.filter((t) => isOverdue(t) && localDate(new Date(t.due_at!)) !== today).length
      const focused = Math.round(sessions.filter((s) => localDate(new Date(s.started_at)) === today).reduce((n, s) => n + s.focused_seconds, 0) / 60)
      return { dueToday, overdue, focused }
    },
    [mode]
  )
  const [q, setQ] = useState('')
  const h = new Date().getHours()
  const hello = h < 5 ? 'Burning the midnight oil' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
  const name = profile?.display_name?.split(' ')[0]
  const bits = data
    ? [
        data.dueToday ? `${data.dueToday} due today` : 'nothing due today',
        data.overdue ? `${data.overdue} overdue` : '',
        data.focused ? `${data.focused >= 60 ? `${Math.floor(data.focused / 60)}h ${data.focused % 60}m` : `${data.focused}m`} focused` : ''
      ].filter(Boolean)
    : []
  return (
    <header className="flex flex-wrap items-end gap-3">
      <div className="mr-auto [text-shadow:0_0_14px_#04050a]">
        <div className="label-caps">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <h1 className="font-display text-3xl leading-tight font-semibold">
          {hello}
          {name ? `, ${name}` : ''}.
        </h1>
        <p className="mt-0.5 text-sm text-muted">{bits.length ? `${bits.join(' · ').replace(/^./, (c) => c.toUpperCase())}.` : ' '}</p>
      </div>
      <label data-ui className="relative">
        <Icon name="search" size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => {
            setQ('')
            onSearch(e.target.value)
          }}
          placeholder="Search everything"
          className="space-search w-56 py-2 pr-3 pl-9 text-sm max-sm:w-40"
        />
      </label>
      <button className="btn" onClick={() => navigate({ name: 'focus' })}>
        <Icon name="focus" /> Focus
      </button>
      <button className="btn" onClick={() => navigate({ name: 'tasks' })}>
        <Icon name="tasks" /> Tasks
      </button>
    </header>
  )
}

/** Active recall: today's quiz, your streak, and how many questions are ready (pages/Recall.tsx). */
function RecallHomeCard(): React.JSX.Element | null {
  const { data: ov } = useLive(['quiz_questions', 'exam_papers', 'paper_attempts'], () => api.recall.overview(), [])
  if (!ov) return null
  const ready = ov.modules.reduce((n, m) => n + m.total, 0)
  const due = ov.modules.reduce((n, m) => n + m.due, 0)
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4">
        <Icon name="recall" size={22} className="text-brass" />
        <div className="flex-1">
          <h2 className="text-xl">Active recall</h2>
          <p className="text-xs text-muted">
            {ov.doneToday
              ? `Done today${ov.lastScore ? ` · ${ov.lastScore.score}/${ov.lastScore.max}` : ''}${ov.streak > 1 ? ` · ${ov.streak}-day streak` : ''}`
              : ready
                ? `Today's quiz is ready · ${ready} questions${due ? `, ${due} due` : ''}`
                : 'Nova is preparing questions from your weeks.'}
          </p>
        </div>
        <button className="btn-primary" onClick={() => navigate({ name: 'recall' })}>
          {ov.doneToday ? 'Another' : 'Start'}
        </button>
      </div>
    </section>
  )
}

/** A task row you can tick off, click to open, or drag onto the calendar. */
function TaskRow({ task, trailing }: { task: Task; trailing?: React.ReactNode }): React.JSX.Element {
  const done = task.status === 'done'
  return (
    <div
      data-task-drag={task.id}
      data-title={task.title}
      className="group flex cursor-grab items-center gap-2 rounded-md px-1.5 py-1 hover:bg-canvas"
      title="Drag onto the calendar to schedule it"
    >
      <input type="checkbox" checked={done} onChange={(e) => void setDone(task, e.target.checked)} />
      <button className={`min-w-0 flex-1 truncate text-left text-sm ${done ? 'text-muted line-through' : ''}`} onClick={() => openTask(task.id)}>
        {task.title}
      </button>
      {task.due_at && !done && (
        <span className={`shrink-0 text-[11px] ${isOverdue(task) ? 'text-danger' : 'text-muted'}`}>
          {isOverdue(task) ? 'overdue' : relativeDue(task.due_at)}
        </span>
      )}
      {trailing}
    </div>
  )
}

// ---------- Top 3 today ----------

function Top3Panel(): React.JSX.Element {
  const mode = useMode()
  const { data } = useLive(
    ['tasks'],
    async () => {
      const [top, open] = await Promise.all([
        api.list('tasks', { mode, today_date: todayStr() }, 'today_rank'),
        api.list('tasks', { mode, parent_task_id: null }, 'sort')
      ])
      return { top, open: open.filter((t) => t.status !== 'done' && t.today_date !== todayStr()) }
    },
    [mode]
  )
  const [picking, setPicking] = useState(false)
  const top = data?.top ?? []
  const allDone = top.length === 3 && top.every((t) => t.status === 'done')

  return (
    <section className="card p-4">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <Icon name="star" size={14} className="fill-current text-amber-500" /> Top 3 today
        {allDone && <span className="ml-auto text-xs font-normal text-ok">All done 🎉</span>}
      </h2>
      {top.map((t) => (
        <TaskRow
          key={t.id}
          task={t}
          trailing={
            <button className="opacity-0 group-hover:opacity-100" title="Remove from Top 3" onClick={() => void removeFromTop3(t)}>
              <Icon name="x" size={13} className="text-muted" />
            </button>
          }
        />
      ))}
      {top.length < 3 &&
        (picking ? (
          <select
            autoFocus
            className="field-boxed mt-1 text-sm"
            value=""
            onBlur={() => setPicking(false)}
            onChange={(e) => {
              const t = data?.open.find((x) => x.id === e.target.value)
              if (t) void addToTop3(t)
              setPicking(false)
            }}
          >
            <option value="">Pick a task…</option>
            {data?.open.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        ) : (
          <button className="btn-ghost mt-1" onClick={() => setPicking(true)} disabled={!data?.open.length}>
            <Icon name="plus" /> {data?.open.length ? `Pick ${3 - top.length} more` : 'Add tasks first'}
          </button>
        ))}
    </section>
  )
}

// ---------- Tasks to schedule ----------

function PlanPanel(): React.JSX.Element {
  const mode = useMode()
  const { data } = useLive(
    ['tasks', 'events'],
    async () => {
      const tasks = await api.list('tasks', { mode, parent_task_id: null }, 'sort')
      // Open tasks, soonest due first (undated last)
      return tasks
        .filter((t) => t.status !== 'done' && t.today_date !== todayStr())
        .sort((a, b) => (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999'))
        .slice(0, 8)
    },
    [mode]
  )
  return (
    <section className="card p-4">
      <h2 className="mb-1 text-sm font-semibold">Plan your day</h2>
      <p className="mb-2 text-[11px] text-muted">Drag a task onto the calendar to block time for it.</p>
      {data?.length === 0 && <div className="text-xs text-muted">No open tasks.</div>}
      {data?.map((t) => <TaskRow key={t.id} task={t} />)}
      <button className="btn-ghost mt-1" onClick={() => navigate({ name: 'tasks' })}>
        All tasks →
      </button>
    </section>
  )
}

// ---------- Calendar ----------

type ExternalInfo = { title: string; start: string; location: string | null; calendar: string }

/** Storage format for a FullCalendar date: YYYY-MM-DD for all-day, ISO UTC otherwise. */
function toStored(date: Date, allDay: boolean, fallbackStr: string): string {
  return allDay ? fallbackStr.slice(0, 10) : date.toISOString()
}

function CalendarView(): React.JSX.Element {
  const mode = useMode()
  const ref = useRef<FullCalendar>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [external, setExternal] = useState<ExternalInfo | null>(null)
  const narrow = useNarrow()
  const [night, setNightState] = useState(() => {
    try {
      return localStorage.getItem('home.nightHours') === '1'
    } catch {
      return false
    }
  })
  const setNight = (v: boolean): void => {
    setNightState(v)
    try {
      localStorage.setItem('home.nightHours', v ? '1' : '0')
    } catch {
      /* optional */
    }
  }

  // Reload calendar data when events/assessments/tasks/feeds change.
  useLive(
    ['events', 'assessments', 'tasks', 'calendar_subscriptions', 'modules', 'timetable_slots'],
    async () => ref.current?.getApi().refetchEvents(),
    []
  )

  const loadEvents = async (info: { startStr: string; endStr: string }): Promise<EventInput[]> => {
    const { events, external, assessments, tasks, classes } = await api.calendar.range(info.startStr, info.endStr, mode)
    return [
      // Weekly classes from the timetable (edit them on the Timetable page)
      ...classes.map((c) => ({
        id: `class:${c.id}`,
        title: c.location ? `${c.title} · ${c.location}` : c.title,
        start: c.start_at,
        end: c.end_at,
        backgroundColor: c.color,
        classNames: ['opacity-85'],
        editable: false,
        extendedProps: { kind: 'class' }
      })),
      ...events.map((e) => ({
        id: e.id,
        // Time blocks for tasks show a tick once the task is done
        title: e.task_status === 'done' ? `✓ ${e.title}` : e.title,
        start: e.start_at,
        end: e.end_at,
        allDay: !!e.all_day,
        backgroundColor: e.color ?? undefined,
        classNames: e.task_status === 'done' ? ['opacity-60'] : [],
        editable: true,
        extendedProps: { kind: 'local' }
      })),
      ...tasks.map((t) => ({
        id: `task:${t.id}`,
        title: `☐ ${t.title}`,
        start: new Date(t.due_at!).toLocaleDateString('en-CA'),
        allDay: true,
        backgroundColor: '#64748b',
        editable: false,
        extendedProps: { kind: 'task', taskId: t.id }
      })),
      ...external.map((e) => ({
        id: `ext:${e.id}`,
        title: e.title,
        start: e.start_at,
        end: e.end_at,
        allDay: !!e.all_day,
        backgroundColor: e.color,
        editable: false,
        extendedProps: { kind: 'external', location: e.location, calendar: e.subscription_name }
      })),
      ...assessments.map((a) => ({
        id: `as:${a.id}`,
        title: `📌 ${a.module_code || a.module_name}: ${a.title}`,
        start: new Date(a.due_at!).toLocaleDateString('en-CA'), // local YYYY-MM-DD
        allDay: true,
        backgroundColor: a.module_color,
        editable: false,
        extendedProps: { kind: 'assessment', moduleId: a.module_id }
      }))
    ]
  }

  // Drag-select an empty slot -> create an event and open it for editing.
  const onSelect = async (sel: DateSelectArg): Promise<void> => {
    sel.view.calendar.unselect()
    const e = await db.create('events', {
      title: 'New event',
      start_at: toStored(sel.start, sel.allDay, sel.startStr),
      end_at: toStored(sel.end, sel.allDay, sel.endStr),
      all_day: sel.allDay ? 1 : 0
    })
    setEditing(e.id)
  }

  // Dragging or resizing an event saves immediately.
  const onMove = ({ event }: { event: EventApi }): void => {
    const start = event.start!
    const allDay = event.allDay
    let end = event.end
    if (!end) end = new Date(start.getTime() + (allDay ? 864e5 : 36e5))
    void db.update('events', event.id, {
      all_day: allDay ? 1 : 0,
      start_at: toStored(start, allDay, event.startStr),
      end_at: allDay ? (event.endStr ? event.endStr.slice(0, 10) : addDays(event.startStr.slice(0, 10), 1)) : end.toISOString()
    })
  }

  // A task dropped from the side panel: save it as a time block linked to the task.
  const onReceive = async (info: EventReceiveArg): Promise<void> => {
    const { event } = info
    const taskId = event.extendedProps.taskId as string
    event.remove() // FullCalendar's temporary copy; the saved one comes back on refetch
    const start = event.start!
    const allDay = event.allDay
    const task = await api.get('tasks', taskId)
    await db.create('events', {
      title: task?.title ?? event.title,
      task_id: taskId,
      module_id: task?.module_id ?? null,
      all_day: allDay ? 1 : 0,
      start_at: toStored(start, allDay, event.startStr),
      end_at: allDay ? addDays(event.startStr.slice(0, 10), 1) : (event.end ?? new Date(start.getTime() + 36e5)).toISOString()
    })
  }

  const onClick = ({ event }: EventClickArg): void => {
    const p = event.extendedProps
    if (p.kind === 'local') setEditing(event.id)
    else if (p.kind === 'task') openTask(p.taskId)
    else if (p.kind === 'class') navigate({ name: 'timetable' })
    else if (p.kind === 'assessment') navigate({ name: 'module', id: p.moduleId, tab: 'assessments' })
    else
      setExternal({
        title: event.title,
        start: event.allDay ? event.start!.toDateString() : formatDateTime(event.start!.toISOString()),
        location: p.location,
        calendar: p.calendar
      })
  }

  return (
    <div className="home-cal min-h-0 flex-1">
      <FullCalendar
        ref={ref}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView={narrow ? 'timeGrid3' : 'timeGridWeek'}
        headerToolbar={{ left: 'title', center: '', right: narrow ? 'night prev,next timeGrid3,dayGridMonth' : 'night prev,today,next timeGridWeek,dayGridMonth,timeGridDay' }}
        customButtons={{ night: { text: night ? 'Hide night hours' : 'Show night hours', click: () => setNight(!night) } }}
        views={{ timeGridWeek: { buttonText: 'Week' }, timeGrid3: { type: 'timeGrid', duration: { days: 3 }, buttonText: '3 days' } }}
        buttonText={{ today: 'Today', day: 'Day', month: 'Month' }}
        titleFormat={{ month: 'long', day: 'numeric' }}
        height="100%"
        dayHeaderFormat={{ weekday: 'short', day: 'numeric' }}
        slotLabelFormat={{ hour: 'numeric', meridiem: 'short' }}
        firstDay={1}
        nowIndicator
        selectable
        selectMirror
        editable
        droppable
        eventReceive={(info) => void onReceive(info)}
        dayMaxEvents
        // Your day is 8 am to 11 pm; night hours fold away until you ask for them.
        slotMinTime={night ? '00:00:00' : '08:00:00'}
        slotMaxTime={night ? '24:00:00' : '23:00:00'}
        expandRows={!night}
        slotDuration="01:00:00"
        snapDuration="00:15:00"
        scrollTime="08:00:00"
        eventDidMount={(info) => info.el.style.setProperty('--c', info.event.backgroundColor || '#7aa2ff')}
        events={(info, ok, fail) => void loadEvents(info).then(ok, fail)}
        select={(s) => void onSelect(s)}
        eventDrop={onMove}
        eventResize={onMove}
        eventClick={onClick}
      />
      {editing && <EventEditor id={editing} onClose={() => setEditing(null)} />}
      {external && (
        <Modal title={external.title} onClose={() => setExternal(null)}>
          <div className="flex flex-col gap-1 text-sm">
            <div>{external.start}</div>
            {external.location && <div className="text-muted">{external.location}</div>}
            <div className="mt-2 text-xs text-muted">
              From “{external.calendar}” (read-only subscription — edit it in the original calendar).
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function EventEditor({ id, onClose }: { id: string; onClose: () => void }): React.JSX.Element | null {
  const { data: ev } = useLive(['events'], () => api.get('events', id), [id])
  const { data: task } = useLive(['tasks', 'events'], async () => (ev?.task_id ? api.get('tasks', ev.task_id) : null), [ev?.task_id])
  const modules = useRows('modules', { archived: 0 }, 'sort')
  if (!ev) return null
  const save = (patch: Partial<CalEvent>): Promise<unknown> => db.update('events', id, patch)

  const setAllDay = (allDay: boolean): void => {
    if (allDay) {
      const day = new Date(ev.start_at).toLocaleDateString('en-CA')
      void save({ all_day: 1, start_at: day, end_at: addDays(day, 1) })
    } else {
      const start = new Date(`${ev.start_at.slice(0, 10)}T09:00`)
      void save({ all_day: 0, start_at: start.toISOString(), end_at: new Date(start.getTime() + 36e5).toISOString() })
    }
  }

  return (
    <Modal
      title="Event"
      onClose={onClose}
      actions={
        <button
          className="btn-ghost hover:text-danger"
          title="Delete event"
          onClick={() => {
            void db.remove('events', id)
            onClose()
          }}
        >
          <Icon name="trash" />
        </button>
      }
    >
      <div className="flex flex-col gap-3">
        <AutoText value={ev.title} onSave={(v) => save({ title: v || 'Untitled' })} className="field-boxed text-base font-medium" autoFocus />
        {task && (
          <div className="flex items-center gap-2 rounded-lg bg-canvas px-3 py-2 text-sm">
            <span className="text-xs text-muted">Task:</span>
            <input type="checkbox" checked={task.status === 'done'} onChange={(e) => void setDone(task, e.target.checked)} />
            <button
              className={`flex-1 truncate text-left hover:text-accent ${task.status === 'done' ? 'text-muted line-through' : ''}`}
              onClick={() => {
                onClose()
                openTask(task.id)
              }}
            >
              {task.title}
            </button>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!ev.all_day} onChange={(e) => setAllDay(e.target.checked)} /> All day
        </label>
        {ev.all_day ? (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">Date</span>
              <input
                type="date"
                className="field-boxed"
                value={ev.start_at.slice(0, 10)}
                onChange={(e) => e.target.value && void save({ start_at: e.target.value, end_at: addDays(e.target.value, 1) })}
              />
            </label>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">Starts</span>
              <input
                type="datetime-local"
                className="field-boxed"
                value={isoToLocalInput(ev.start_at)}
                onChange={(e) => {
                  const start = localInputToIso(e.target.value)
                  if (!start) return
                  // Keep the same duration when moving the start
                  const dur = Date.parse(ev.end_at) - Date.parse(ev.start_at)
                  void save({ start_at: start, end_at: new Date(Date.parse(start) + Math.max(dur, 15 * 6e4)).toISOString() })
                }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">Ends</span>
              <input
                type="datetime-local"
                className="field-boxed"
                value={isoToLocalInput(ev.end_at)}
                onChange={(e) => {
                  const end = localInputToIso(e.target.value)
                  if (end && end > ev.start_at) void save({ end_at: end })
                }}
              />
            </label>
          </div>
        )}
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-muted">Module (optional)</span>
          <select className="field-boxed" value={ev.module_id ?? ''} onChange={(e) => void save({ module_id: e.target.value || null })}>
            <option value="">—</option>
            {modules?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code ? `${m.code} · ` : ''}
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted">Colour</span>
          <ColorPicker value={ev.color} onChange={(c) => void save({ color: c })} />
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-muted">Notes</span>
          <AutoText multiline rows={4} value={ev.notes} onSave={(v) => save({ notes: v })} className="field-boxed" />
        </label>
      </div>
    </Modal>
  )
}

// ---------- Upcoming deadlines ----------

function DeadlinesPanel(): React.JSX.Element {
  const mode = useMode()
  const { data } = useLive(
    ['assessments', 'modules', 'tasks', 'projects', 'clients'],
    () => api.calendar.upcomingDeadlines(8, mode),
    [mode]
  )
  return (
    <section className="card p-4">
      <h2 className="mb-3 text-sm font-semibold">Upcoming deadlines</h2>
      {data?.length === 0 && (
        <div className="text-xs text-muted">
          Nothing due. {mode === 'study' ? 'Give assessments or tasks a due date.' : 'Give tasks a due date.'}
        </div>
      )}
      <ul className="flex flex-col gap-1">
        {data?.map((d) => (
          <li key={`${d.kind}:${d.id}`}>
            <button
              className="flex w-full items-start gap-2 rounded-md p-1.5 text-left hover:bg-canvas"
              onClick={() =>
                d.kind === 'task' ? openTask(d.id) : navigate({ name: 'module', id: d.module_id!, tab: 'assessments' })
              }
            >
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 ${d.kind === 'task' ? 'rounded-sm' : 'rounded-full'}`}
                style={{ background: d.color }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{d.title}</span>
                <span className="block text-xs text-muted">
                  {d.kind === 'assessment' ? '📌 ' : ''}
                  {d.subtitle}
                  {d.weight_pct != null && ` · ${d.weight_pct}%`}
                </span>
              </span>
              <span className={`shrink-0 text-xs font-medium ${Date.parse(d.due_at) < Date.now() ? 'text-danger' : 'text-accent'}`}>
                {relativeDue(d.due_at)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ---------- ICS subscriptions ----------

function SubscriptionsPanel(): React.JSX.Element {
  const subs = useRows('calendar_subscriptions')
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = async (id?: string): Promise<void> => {
    setBusy(true)
    try {
      await api.calendar.refreshSubscriptions(id)
    } finally {
      setBusy(false)
    }
  }

  const add = async (): Promise<void> => {
    if (!url.trim()) return
    const sub = await db.create('calendar_subscriptions', {
      name: name.trim() || 'Calendar',
      url: url.trim(),
      color: PALETTE[((subs?.length ?? 0) + 1) % PALETTE.length]
    })
    setName('')
    setUrl('')
    setAdding(false)
    await refresh(sub.id) // status/errors appear via the calendar:updated event
  }

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="flex-1 text-sm font-semibold">Subscribed calendars</h2>
        <button className="btn-ghost px-1" onClick={() => void refresh()} title="Refresh all now" disabled={busy}>
          <Icon name="refresh" className={busy ? 'animate-spin' : ''} />
        </button>
        <button className="btn-ghost px-1" onClick={() => setAdding((a) => !a)} title="Add calendar">
          <Icon name="plus" />
        </button>
      </div>

      {adding && (
        <div className="mb-3 flex flex-col gap-2">
          <input className="field-boxed" placeholder="Name (e.g. Uni timetable)" value={name} onChange={(e) => setName(e.target.value)} />
          <input
            className="field-boxed"
            placeholder="Paste ICS link (https://… or webcal://…)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void add()}
          />
          <button className="btn-primary justify-center" onClick={() => void add()} disabled={!url.trim()}>
            Subscribe
          </button>
          <p className="text-[11px] leading-snug text-muted">
            PoliteMall: Calendar → Subscribe (at the bottom) → All courses → copy the link. Google: Calendar settings → your calendar → “Secret address in iCal format”. Outlook: Settings → Calendar → Shared calendars → Publish → ICS link.
            Read-only. Feeds can lag behind the source by several hours (Google sometimes up to a day).
          </p>
        </div>
      )}

      {subs?.length === 0 && !adding && <div className="text-xs text-muted">Add a Google, Outlook or Apple calendar by its ICS link.</div>}
      <ul className="flex flex-col gap-2">
        {subs?.map((s) => (
          <li key={s.id} className="group flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={!!s.enabled}
              title="Show on calendar"
              onChange={(e) => void db.update('calendar_subscriptions', s.id, { enabled: e.target.checked ? 1 : 0 })}
            />
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
            <div className="min-w-0 flex-1">
              <AutoText value={s.name} onSave={(v) => db.update('calendar_subscriptions', s.id, { name: v || 'Calendar' })} className="field -ml-2 py-0" />
              <div className={`truncate text-[11px] ${s.last_error ? 'text-danger' : 'text-muted'}`} title={s.last_error ?? s.url}>
                {s.last_error
                  ? `⚠ ${s.last_error}`
                  : s.last_fetched_at
                    ? `Updated ${formatDateTime(s.last_fetched_at)}`
                    : 'Not fetched yet'}
              </div>
            </div>
            <button
              className="btn-ghost px-1 opacity-0 group-hover:opacity-100 hover:text-danger"
              title="Unsubscribe"
              onClick={() => confirm(`Remove “${s.name}”?`) && void db.remove('calendar_subscriptions', s.id)}
            >
              <Icon name="trash" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
