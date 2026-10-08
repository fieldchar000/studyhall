// Data layer for the UI: wraps window.api so every write
//  1) updates the "Saving… / Saved" indicator, and
//  2) tells any on-screen lists reading that table to reload.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Api, TableMap, TableName, Where } from '@shared/types'

declare global {
  interface Window {
    api: Api
  }
}
export const api = window.api

// ---------- Save status (drives the indicator in the sidebar) ----------

type SaveState = { pending: number; lastSavedAt: number | null; error: string | null }
let saveState: SaveState = { pending: 0, lastSavedAt: null, error: null }
const saveListeners = new Set<() => void>()
function setSaveState(patch: Partial<SaveState>): void {
  saveState = { ...saveState, ...patch }
  saveListeners.forEach((l) => l())
}

/** Wrap any write so the indicator shows Saving… then Saved (or the error). */
export async function track<T>(work: Promise<T>): Promise<T> {
  setSaveState({ pending: saveState.pending + 1 })
  try {
    const result = await work
    setSaveState({ pending: saveState.pending - 1, lastSavedAt: Date.now(), error: null })
    return result
  } catch (err) {
    setSaveState({ pending: saveState.pending - 1, error: err instanceof Error ? err.message : String(err) })
    throw err
  }
}

export function useSaveState(): SaveState {
  return useSyncExternalStore(
    (l) => {
      saveListeners.add(l)
      return () => saveListeners.delete(l)
    },
    () => saveState
  )
}

// ---------- Change notifications ----------

const changeListeners = new Set<(table: string) => void>()
export function notifyChanged(table: string): void {
  changeListeners.forEach((l) => l(table))
}

// ---------- Writes ----------

export const db = {
  async create<T extends TableName>(table: T, values: Partial<TableMap[T]>): Promise<TableMap[T]> {
    const row = await track(api.create(table, values))
    notifyChanged(table)
    return row
  },
  async update<T extends TableName>(table: T, id: string, patch: Partial<TableMap[T]>): Promise<TableMap[T]> {
    const row = await track(api.update(table, id, patch))
    notifyChanged(table)
    return row
  },
  async remove(table: TableName, id: string): Promise<void> {
    await track(api.remove(table, id))
    // Deletes cascade to child rows in other tables, so refresh everything.
    notifyChanged('*')
  }
}

// ---------- Live reads ----------

/**
 * Load data and reload it whenever one of `tables` changes.
 *   const { data } = useLive(['modules'], () => api.list('modules'), [])
 */
export function useLive<T>(tables: string[], load: () => Promise<T>, deps: unknown[]): { data: T | undefined; reload: () => void } {
  const [data, setData] = useState<T>()
  const loadRef = useRef(load)
  loadRef.current = load
  const seq = useRef(0)

  const reload = useCallback(() => {
    const mine = ++seq.current
    loadRef.current().then((d) => {
      if (mine === seq.current) setData(d) // ignore out-of-order results
    })
  }, [])

  useEffect(reload, deps) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onChange = (t: string): void => {
      if (t === '*' || tables.includes(t)) reload()
    }
    changeListeners.add(onChange)
    return () => {
      changeListeners.delete(onChange)
    }
  }, [tables.join(','), reload]) // eslint-disable-line react-hooks/exhaustive-deps

  return { data, reload }
}

/** Shortcut for "all live rows of a table matching where". */
export function useRows<T extends TableName>(table: T, where: Where = {}, orderBy?: string): TableMap[T][] | undefined {
  const key = JSON.stringify(where)
  return useLive([table], () => api.list(table, where, orderBy), [table, key, orderBy]).data
}

// ---------- Flush pending edits before the window closes ----------

const flushers = new Set<() => Promise<void>>()
/** Debounced fields register here so closing the app never loses the last keystrokes. */
export function registerFlusher(fn: () => Promise<void>): () => void {
  flushers.add(fn)
  return () => flushers.delete(fn)
}
export async function flushAll(): Promise<void> {
  await Promise.allSettled([...flushers].map((f) => f()))
}
// ICS feeds were re-downloaded in the background: refresh anything showing them.
api.app.onCalendarUpdated(() => notifyChanged('calendar_subscriptions'))

// Data changed in another window or in the main process (timer, quick capture).
api.onDbChanged((table) => notifyChanged(table))

api.app.onFlushRequest(() => {
  flushAll().finally(() => api.app.flushed())
})
