// Gathering what a briefing can refer to, and making the changes. Every change is recorded as
// an undo step, so Bauer can act straight away and still let you take anything back.

import type { Mode, TableName, UndoStep } from '@shared/types'
import type { BriefAction, BriefContext } from './brief'
import { api, db } from './data'
import { createTask } from './tasks'
import { isPhoneApp } from './platform'
import { navigate, SIMPLE_PAGES, type Route } from './nav'

/** Your open tasks, nearby events, habits and modules — what "cancel my gym session" can point at. */
export async function loadBriefContext(): Promise<BriefContext> {
  const [tasks, events, habits, modules] = await Promise.all([api.list('tasks'), api.list('events'), api.list('habits', { archived: 0 }), api.list('modules', { archived: 0 })])
  const from = Date.now() - 7 * 864e5
  const to = Date.now() + 120 * 864e5
  return {
    tasks: tasks.filter((t) => t.status !== 'done' && !t.parent_task_id).map((t) => ({ id: t.id, title: t.title, due_at: t.due_at })),
    events: events
      .filter((e) => {
        const at = Date.parse(e.start_at.length === 10 ? `${e.start_at}T00:00` : e.start_at)
        return at >= from && at <= to
      })
      .map((e) => ({ id: e.id, title: e.title, start_at: e.start_at, all_day: e.all_day })),
    habits: habits.map((h) => ({ id: h.id, name: h.name, emoji: h.emoji })),
    modules: modules.map((m) => ({ id: m.id, code: m.code, name: m.name }))
  }
}

/** Writes that remember how to go back. */
function recorder(): {
  steps: UndoStep[]
  create: (table: TableName, values: Record<string, unknown>) => Promise<{ id: string }>
  update: (table: TableName, id: string, patch: Record<string, unknown>) => Promise<void>
  remove: (table: TableName, id: string) => Promise<void>
} {
  const steps: UndoStep[] = []
  return {
    steps,
    async create(table, values) {
      const row = (await db.create(table, values as never)) as { id: string }
      steps.push({ op: 'created', table, id: row.id })
      return row
    },
    async update(table, id, patch) {
      const row = (await api.get(table, id)) as Record<string, unknown> | null
      if (!row) return
      const before: Record<string, unknown> = {}
      for (const k of Object.keys(patch)) before[k] = row[k] ?? null
      await db.update(table, id, patch as never)
      steps.push({ op: 'updated', table, id, before })
    },
    async remove(table, id) {
      await db.remove(table, id)
      steps.push({ op: 'deleted', table, id })
    }
  }
}

/** Take back what a briefing did, newest first. */
export async function undoSteps(steps: UndoStep[]): Promise<void> {
  for (const s of [...steps].reverse()) {
    try {
      if (s.op === 'created') await db.remove(s.table, s.id)
      else if (s.op === 'updated') await db.update(s.table, s.id, s.before as never)
      else await api.restore(s.table, s.id)
    } catch (e) {
      console.error('Bauer: could not undo', s, e)
    }
  }
}

const iso = (d: Date): string => d.toISOString()

/** Make the ticked changes. Returns how many were made and how to undo them. */
export async function applyBrief(actions: BriefAction[], mode: Mode): Promise<{ count: number; undo: UndoStep[] }> {
  const w = recorder()
  let count = 0
  for (const a of actions.filter((x) => x.on)) {
    try {
      switch (a.kind) {
        case 'task': {
          const t = await createTask(mode, { title: a.title, due_at: a.due, module_id: a.moduleId })
          w.steps.push({ op: 'created', table: 'tasks', id: t.id })
          break
        }
        case 'task_done':
          await w.update('tasks', a.id, { status: 'done', completed_at: iso(new Date()) })
          break
        case 'task_cancel':
          await w.remove('tasks', a.id)
          break
        case 'task_move':
          await w.update('tasks', a.id, { due_at: a.due })
          break
        case 'event':
          await w.create('events', { title: a.title, start_at: a.start, end_at: a.end, all_day: a.allDay ? 1 : 0, module_id: a.moduleId, notes: '' })
          break
        case 'event_cancel':
          await w.remove('events', a.id)
          break
        case 'event_move':
          await w.update('events', a.id, { start_at: a.start, end_at: a.end, all_day: 0 })
          break
        case 'log': {
          const end = a.date === localToday() ? new Date() : new Date(`${a.date}T18:00`)
          const start = new Date(end.getTime() - a.minutes * 60_000)
          await w.create('focus_sessions', {
            kind: 'focus',
            started_at: iso(start),
            ended_at: iso(end),
            planned_minutes: a.minutes,
            focused_seconds: a.minutes * 60,
            completed: 1,
            mode,
            module_id: a.moduleId
          })
          break
        }
        case 'habit': {
          const already = await api.list('habit_checks', { habit_id: a.id, date: a.date })
          if (!already.length) await w.create('habit_checks', { habit_id: a.id, date: a.date })
          break
        }
        case 'money':
          await w.create('money_entries', { date: a.date, amount: a.amount, kind: a.flow, category: a.category, note: a.note })
          break
        case 'journal': {
          const [entry] = await api.list('journal_entries', { date: a.date })
          if (entry) await w.update('journal_entries', entry.id, { content: entry.content ? `${entry.content.trimEnd()}\n\n${a.text}` : a.text })
          else await w.create('journal_entries', { date: a.date, content: a.text })
          break
        }
        case 'checkin': {
          const [entry] = await api.list('journal_entries', { date: a.date })
          const patch: Record<string, unknown> = {}
          if (a.mood) patch.mood = a.mood
          if (a.energy) patch.energy = a.energy
          if (a.sleep) patch.sleep_hours = a.sleep
          if (a.gratitude) patch.gratitude = entry?.gratitude ? `${entry.gratitude.trimEnd()}\n${a.gratitude}` : a.gratitude
          if (a.highlight) {
            let details: Record<string, unknown> = {}
            try {
              details = JSON.parse(entry?.details || '{}') as Record<string, unknown>
            } catch {
              /* start fresh */
            }
            patch.details = JSON.stringify({ ...details, highlight: a.highlight })
          }
          if (entry) await w.update('journal_entries', entry.id, patch)
          else await w.create('journal_entries', { date: a.date, ...patch })
          break
        }
        case 'inbox':
          await w.create('inbox_items', { text: a.text })
          break
        case 'open_url':
          if (isPhoneApp()) window.open(a.url, '_blank')
          else await api.app.openUrl(a.url)
          break
        case 'open_page':
          if (!SIMPLE_PAGES.includes(a.page)) break
          if (isPhoneApp() || document.location.hash !== '#voice') navigate({ name: a.page } as Route)
          else await api.app.goto(a.page)
          break
      }
      count++
    } catch (e) {
      console.error('Brief: could not apply', a, e)
    }
  }
  return { count, undo: w.steps }
}

const localToday = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
