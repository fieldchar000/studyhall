// Preload: the narrow, typed bridge between the sandboxed UI and the main process.
// The UI sees only window.api — no Node, no Electron, no raw IPC.

import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { Api } from '@shared/types'

/** Subscribe to a main->UI event; returns an unsubscribe function. */
function on(channel: string, cb: () => void): () => void {
  const listener = (): void => cb()
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: Api = {
  list: (table, where, orderBy) => ipcRenderer.invoke('db:list', table, where, orderBy),
  get: (table, id) => ipcRenderer.invoke('db:get', table, id),
  create: (table, values) => ipcRenderer.invoke('db:create', table, values),
  update: (table, id, patch) => ipcRenderer.invoke('db:update', table, id, patch),
  remove: (table, id) => ipcRenderer.invoke('db:remove', table, id),

  materials: {
    pickAndImport: (weekId) => ipcRenderer.invoke('materials:pick', weekId),
    importPaths: (weekId, paths) => ipcRenderer.invoke('materials:import', weekId, paths),
    openExternal: (id) => ipcRenderer.invoke('materials:open', id),
    showInFolder: (id) => ipcRenderer.invoke('materials:reveal', id),
    pathForFile: (file) => webUtils.getPathForFile(file)
  },
  calendar: {
    range: (start, end) => ipcRenderer.invoke('calendar:range', start, end),
    refreshSubscriptions: (id) => ipcRenderer.invoke('calendar:refresh', id),
    upcomingDeadlines: (limit) => ipcRenderer.invoke('calendar:deadlines', limit)
  },
  app: {
    dataPath: () => ipcRenderer.invoke('app:dataPath'),
    openDataFolder: () => ipcRenderer.invoke('app:openDataFolder'),
    version: () => ipcRenderer.invoke('app:version'),
    onFlushRequest: (cb) => on('app:flush-request', cb),
    flushed: () => ipcRenderer.send('app:flushed'),
    onCalendarUpdated: (cb) => on('calendar:updated', cb)
  }
}

contextBridge.exposeInMainWorld('api', api)
