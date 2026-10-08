// Task helpers shared by the board, drawer, Home and project pages.

import { useSyncExternalStore } from 'react'
import type { Mode, Task, TaskStatus } from '@shared/types'
import { api, db } from './data'
import { localDate } from './dates'

export const STATUSES: { key: Exclude<TaskStatus, 'inbox'>; label: string }[] = [
  { key: 'todo', label: 'To do' },
  { key: 'doing', label: 'Doing' },
  { key: 'done', label: 'Done' }
]

export const PRIORITIES = [
  { value: 0, label: 'None', color: 'transparent' },
  { value: 1, label: 'Low', color: '#64748b' },
  { value: 2, label: 'Medium', color: '#f59e0b' },
  { value: 3, label: 'High', color: '#ef4444' }
]

export const todayStr = (): string => localDate(new Date())

export function parseLabels(t: Pick<Task, 'labels'>): string[] {
  try {
    const v = JSON.parse(t.labels)
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function isOverdue(t: Pick<Task, 'due_at' | 'status'>): boolean {
  return !!t.due_at && t.status !== 'done' && Date.parse(t.due_at) < Date.now()
}

/** New task at the bottom of its column. */
export async function createTask(mode: Mode, values: Partial<Task>): Promise<Task> {
  const siblings = await api.list('tasks', { mode, status: values.status ?? 'todo' })
  const sort = Math.max(0, ...siblings.map((s) => s.sort)) + 1
  return db.create('tasks', { title: 'New task', status: 'todo', ...values, mode, sort })
}

/** Move a task to a column, optionally placing it before another card. */
export async function moveTask(task: Task, status: TaskStatus, before: Task | null, column: Task[]): Promise<void> {
  const others = column.filter((t) => t.id !== task.id)
  let sort: number
  if (before) {
    const i = others.findIndex((t) => t.id === before.id)
    const prev = others[i - 1]
    sort = prev ? (prev.sort + before.sort) / 2 : before.sort - 1
  } else {
    sort = others.length ? others[others.length - 1].sort + 1 : 1
  }
  await db.update('tasks', task.id, {
    status,
    sort,
    completed_at: status === 'done' ? (task.completed_at ?? new Date().toISOString()) : null
  })
}

export function setDone(task: Task, done: boolean): Promise<unknown> {
  return db.update('tasks', task.id, {
    status: done ? 'done' : task.status === 'done' ? 'todo' : task.status,
    completed_at: done ? new Date().toISOString() : null
  })
}

/** Put a task into the first free Top 3 slot for today. Returns false if all 3 are taken. */
export async function addToTop3(task: Task): Promise<boolean> {
  const today = todayStr()
  const current = await api.list('tasks', { mode: task.mode, today_date: today })
  const used = new Set(current.filter((t) => t.id !== task.id).map((t) => t.today_rank))
  const rank = [1, 2, 3].find((r) => !used.has(r))
  if (!rank) return false
  await db.update('tasks', task.id, { today_date: today, today_rank: rank })
  return true
}

export const removeFromTop3 = (task: Task): Promise<unknown> =>
  db.update('tasks', task.id, { today_date: null, today_rank: null })

export const isTop3Today = (t: Task): boolean => t.today_date === todayStr()

// ---------- Which task is open in the side drawer ----------

let openId: string | null = null
const listeners = new Set<() => void>()
export function openTask(id: string | null): void {
  openId = id
  listeners.forEach((l) => l())
}
export function useOpenTaskId(): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => openId
  )
}
