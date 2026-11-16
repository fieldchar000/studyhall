// Gathering what a briefing can refer to, and making the confirmed changes.

import type { Mode } from '@shared/types'
import type { BriefAction, BriefContext } from './brief'
import { api, db } from './data'
import { createTask, setDone } from './tasks'

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

/** Make the ticked changes. Returns how many were made. */
export async function applyBrief(actions: BriefAction[], mode: Mode): Promise<number> {
  let done = 0
  for (const a of actions.filter((x) => x.on)) {
    try {
      switch (a.kind) {
        case 'task':
          await createTask(mode, { title: a.title, due_at: a.due, module_id: a.moduleId })
          break
        case 'task_done': {
          const t = await api.get('tasks', a.id)
          if (t) await setDone(t, true)
          break
        }
        case 'task_cancel':
          await db.remove('tasks', a.id)
          break
        case 'event':
          await db.create('events', { title: a.title, start_at: a.start, end_at: a.end, all_day: a.allDay ? 1 : 0, module_id: a.moduleId, notes: '' })
          break
        case 'event_cancel':
          await db.remove('events', a.id)
          break
        case 'log': {
          const end = a.date === localToday() ? new Date() : new Date(`${a.date}T18:00`)
          const start = new Date(end.getTime() - a.minutes * 60_000)
          await db.create('focus_sessions', {
            kind: 'focus',
            started_at: start.toISOString(),
            ended_at: end.toISOString(),
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
          if (!already.length) await db.create('habit_checks', { habit_id: a.id, date: a.date })
          break
        }
        case 'money':
          await db.create('money_entries', { date: a.date, amount: a.amount, kind: a.flow, category: a.category, note: a.note })
          break
        case 'journal': {
          const [entry] = await api.list('journal_entries', { date: a.date })
          if (entry) await db.update('journal_entries', entry.id, { content: entry.content ? `${entry.content.trimEnd()}\n\n${a.text}` : a.text })
          else await db.create('journal_entries', { date: a.date, content: a.text })
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
          if (entry) await db.update('journal_entries', entry.id, patch)
          else await db.create('journal_entries', { date: a.date, ...patch })
          break
        }
        case 'inbox':
          await db.create('inbox_items', { text: a.text })
          break
      }
      done++
    } catch (e) {
      console.error('Brief: could not apply', a, e)
    }
  }
  return done
}

const localToday = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
