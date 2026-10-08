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
    range: (start, end, mode) => ipcRenderer.invoke('calendar:range', start, end, mode),
    refreshSubscriptions: (id) => ipcRenderer.invoke('calendar:refresh', id),
    upcomingDeadlines: (limit, mode) => ipcRenderer.invoke('calendar:deadlines', limit, mode)
  },
  profile: {
    get: () => ipcRenderer.invoke('profile:get'),
    update: (patch) => ipcRenderer.invoke('profile:update', patch)
  },
  timer: {
    state: () => ipcRenderer.invoke('timer:state'),
    start: () => ipcRenderer.invoke('timer:start'),
    pause: () => ipcRenderer.invoke('timer:pause'),
    reset: () => ipcRenderer.invoke('timer:reset'),
    skip: () => ipcRenderer.invoke('timer:skip'),
    setContext: (ctx) => ipcRenderer.invoke('timer:context', ctx),
    settings: () => ipcRenderer.invoke('timer:settings'),
    setSettings: (patch) => ipcRenderer.invoke('timer:setSettings', patch),
    onState: (cb) => {
      const listener = (_e: unknown, s: Parameters<typeof cb>[0]): void => cb(s)
      ipcRenderer.on('timer:state', listener)
      return () => ipcRenderer.removeListener('timer:state', listener)
    }
  },
  prefs: {
    get: () => ipcRenderer.invoke('prefs:get'),
    set: (patch) => ipcRenderer.invoke('prefs:set', patch)
  },
  embed: {
    lookup: (url) => ipcRenderer.invoke('embed:lookup', url),
    openSpotify: (url) => ipcRenderer.invoke('embed:openSpotify', url),
    openPlayer: (url) => ipcRenderer.invoke('embed:openPlayer', url)
  },
  search: (q) => ipcRenderer.invoke('search', q),
  capture: {
    hide: () => void ipcRenderer.invoke('capture:hide'),
    shortcutStatus: () => ipcRenderer.invoke('capture:status')
  },
  game: {
    get: () => ipcRenderer.invoke('game:get'),
    act: (action) => ipcRenderer.invoke('game:act', action)
  },
  cloud: {
    status: () => ipcRenderer.invoke('cloud:status'),
    onStatus: (cb) => {
      const l = (_e: unknown, s: Parameters<typeof cb>[0]): void => cb(s)
      ipcRenderer.on('cloud:status', l)
      return () => ipcRenderer.removeListener('cloud:status', l)
    },
    signUp: (p) => ipcRenderer.invoke('cloud:signUp', p),
    signIn: (u, pw) => ipcRenderer.invoke('cloud:signIn', u, pw),
    signOut: () => ipcRenderer.invoke('cloud:signOut'),
    changePassword: (c, n) => ipcRenderer.invoke('cloud:changePassword', c, n),
    adminResetPassword: (u) => ipcRenderer.invoke('cloud:adminResetPassword', u),
    setDisplayName: (n) => ipcRenderer.invoke('cloud:setDisplayName', n),
    syncNow: () => ipcRenderer.invoke('cloud:syncNow'),
    checkInvite: (code) => ipcRenderer.invoke('cloud:checkInvite', code),
    createInvite: (o) => ipcRenderer.invoke('cloud:createInvite', o),
    myInvites: () => ipcRenderer.invoke('cloud:myInvites'),
    revokeInvite: (code) => ipcRenderer.invoke('cloud:revokeInvite', code),
    redeem: (code) => ipcRenderer.invoke('cloud:redeem', code),
    friends: () => ipcRenderer.invoke('cloud:friends'),
    removeFriend: (u) => ipcRenderer.invoke('cloud:removeFriend', u),
    leaderboard: (since) => ipcRenderer.invoke('cloud:leaderboard', since),
    sharesFor: (t, id) => ipcRenderer.invoke('cloud:sharesFor', t, id),
    share: (t, id, u, perm) => ipcRenderer.invoke('cloud:share', t, id, u, perm),
    unshare: (sid) => ipcRenderer.invoke('cloud:unshare', sid),
    sharedWithMe: () => ipcRenderer.invoke('cloud:sharedWithMe'),
    servers: () => ipcRenderer.invoke('cloud:servers'),
    server: (id) => ipcRenderer.invoke('cloud:server', id),
    createServer: (name) => ipcRenderer.invoke('cloud:createServer', name),
    renameServer: (id, name) => ipcRenderer.invoke('cloud:renameServer', id, name),
    deleteServer: (id) => ipcRenderer.invoke('cloud:deleteServer', id),
    leaveServer: (id) => ipcRenderer.invoke('cloud:leaveServer', id),
    kick: (s, u) => ipcRenderer.invoke('cloud:kick', s, u),
    setRole: (s, u, r) => ipcRenderer.invoke('cloud:setRole', s, u, r),
    createChannel: (s, n, k) => ipcRenderer.invoke('cloud:createChannel', s, n, k),
    renameChannel: (c, n) => ipcRenderer.invoke('cloud:renameChannel', c, n),
    deleteChannel: (c) => ipcRenderer.invoke('cloud:deleteChannel', c),
    messages: (c, before) => ipcRenderer.invoke('cloud:messages', c, before),
    send: (c, body) => ipcRenderer.invoke('cloud:send', c, body),
    deleteMessage: (id) => ipcRenderer.invoke('cloud:deleteMessage', id),
    markRead: (c) => ipcRenderer.invoke('cloud:markRead', c),
    setMuted: (c, m) => ipcRenderer.invoke('cloud:setMuted', c, m),
    sharedTimer: (c) => ipcRenderer.invoke('cloud:sharedTimer', c),
    timerAction: (c, a, s) => ipcRenderer.invoke('cloud:timerAction', c, a, s),
    recordSharedFocus: (m) => ipcRenderer.invoke('cloud:recordSharedFocus', m),
    joinRoom: (c, title) => ipcRenderer.invoke('cloud:joinRoom', c, title),
    roomParticipants: (c) => ipcRenderer.invoke('cloud:roomParticipants', c),
    storageUsed: () => ipcRenderer.invoke('cloud:storageUsed'),
    onEvent: (cb) => {
      const l = (_e: unknown, t: string): void => cb(String(t))
      ipcRenderer.on('cloud:event', l)
      return () => ipcRenderer.removeListener('cloud:event', l)
    },
    onDeepLink: (cb) => {
      const l = (_e: unknown, link: Parameters<typeof cb>[0]): void => cb(link)
      ipcRenderer.on('app:deeplink', l)
      return () => ipcRenderer.removeListener('app:deeplink', l)
    }
  },
  onDbChanged: (cb) => {
    const listener = (_e: unknown, table: string): void => cb(String(table))
    ipcRenderer.on('db:changed', listener)
    return () => ipcRenderer.removeListener('db:changed', listener)
  },
  app: {
    dataPath: () => ipcRenderer.invoke('app:dataPath'),
    openDataFolder: () => ipcRenderer.invoke('app:openDataFolder'),
    version: () => ipcRenderer.invoke('app:version'),
    onFlushRequest: (cb) => on('app:flush-request', cb),
    flushed: () => ipcRenderer.send('app:flushed'),
    onCalendarUpdated: (cb) => on('calendar:updated', cb),
    onCaptureShow: (cb) => on('capture:show', cb),
    updateState: () => ipcRenderer.invoke('app:updateState'),
    checkUpdates: () => ipcRenderer.invoke('app:checkUpdates'),
    installUpdate: () => ipcRenderer.invoke('app:installUpdate'),
    onUpdate: (cb) => {
      const l = (_e: unknown, s: Parameters<typeof cb>[0]): void => cb(s)
      ipcRenderer.on('app:update', l)
      return () => ipcRenderer.removeListener('app:update', l)
    },
    onNavigate: (cb) => {
      const listener = (_e: unknown, page: string): void => cb(String(page))
      ipcRenderer.on('app:navigate', listener)
      return () => ipcRenderer.removeListener('app:navigate', listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
