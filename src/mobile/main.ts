// The phone's "main process": the same database, sync, timer and reminders as the PC
// (src/main), started in the order src/main/index.ts uses, minus the PC-only parts
// (tray, quick-capture shortcut, windows, auto-start).

import { App } from '@capacitor/app'
import { LocalNotifications } from '@capacitor/local-notifications'
import type { Material, Photo, ExamPaper } from '@shared/types'
import { SYNC_TABLES } from '@shared/sync'
import { get, onDbChange, openDb, setWriteGuard } from '../main/db'
import { cloudStatus, currentUserId, onAccountChange, restoreSession } from '../main/cloud/account'
import { describeMessage, guardWrite, publishPresence, startLive, stopLive } from '../main/cloud/social'
import { configureSync, ensureLocalFile, fetchMissingFiles, requestSync } from '../main/cloud/sync'
import { startFeedRefresh } from '../main/feeds'
import { refreshSubscriptions } from '../main/ics'
import { currentSenderId, registerIpc } from '../main/ipc'
import { getPrefs } from '../main/prefs'
import { checkDeadlines } from '../main/reminders'
import * as timer from '../main/timer'
import { initUpdater } from './overrides/updater'
import { broadcast } from './shims/electron'
import { flushAll } from './shims/sqlite'
import { exists, fileUrl } from './storage'

// ---------- Notifications ----------

let notifyId = 1
let asked = false
async function notify(title: string, body: string, page?: string): Promise<void> {
  try {
    if (!asked) {
      asked = true
      const p = await LocalNotifications.checkPermissions()
      if (p.display !== 'granted') await LocalNotifications.requestPermissions()
    }
    await LocalNotifications.schedule({ notifications: [{ id: notifyId++, title, body, extra: { page } }] })
  } catch {
    /* notifications are a nicety */
  }
}

// ---------- Files for <img>/<iframe> (the PC uses material:// for this) ----------

const fetching = new Set<string>()
function fileSrc(id: string): string {
  const photo = get<Photo>('photos', id)
  const material = photo ? null : get<Material>('materials', id)
  const paper = photo || material ? null : get<ExamPaper>('exam_papers', id)
  const row = photo ?? material ?? paper
  const table = photo ? 'photos' : material ? 'materials' : 'exam_papers'
  if (!row?.local_path) return ''
  if (exists(`/sh/${row.local_path}`)) return fileUrl(row.local_path)
  // Not on this phone yet: fetch it from the cloud, then tell the screen to look again.
  if (!fetching.has(id)) {
    fetching.add(id)
    void ensureLocalFile(row, table).then((ok) => {
      if (ok) broadcast('db:changed', table)
      else setTimeout(() => fetching.delete(id), 60_000)
    })
  }
  return ''
}

export function startMain(): void {
  openDb()

  registerIpc([location.origin], {
    onCalendarUpdated: () => broadcast('calendar:updated'),
    hideCapture: () => {},
    shortcutStatus: () => ({ accelerator: '', registered: false })
  })

  // Local edits to synced tables upload shortly; changes made elsewhere refresh the screen.
  onDbChange((table) => {
    if (currentUserId() && (table === '*' || (SYNC_TABLES as readonly string[]).includes(table))) requestSync()
    if (currentSenderId === null) broadcast('db:changed', table)
  })
  setWriteGuard(guardWrite)
  configureSync({
    onStatus: () => broadcast('cloud:status', cloudStatus()),
    onApplied: (tables) => tables.forEach((t) => broadcast('db:changed', t))
  })
  onAccountChange(() => {
    broadcast('cloud:status', cloudStatus())
    broadcast('db:changed', '*')
    if (currentUserId())
      startLive((table, payload) => {
        broadcast('cloud:event', table)
        if (table === 'messages' && payload.eventType === 'INSERT' && getPrefs().notifyMessages && document.visibilityState !== 'visible') {
          void describeMessage(payload.new).then((m) => m && notify(m.title, m.body, 'servers')).catch(() => {})
        }
      })
    else stopLive()
  })
  void restoreSession()

  startFeedRefresh(() => broadcast('feeds:changed'))
  initUpdater((s) => broadcast('app:update', s))

  timer.initTimer(
    (state, _remaining, changed) => {
      if (changed) {
        broadcast('timer:state', state)
        void publishPresence()
      }
    },
    (title, body) => {
      if (getPrefs().notifyTimer) void notify(title, body, 'focus')
    }
  )

  const refresh = (): void => void refreshSubscriptions().then(() => broadcast('calendar:updated'))
  setTimeout(refresh, 3000)
  setInterval(refresh, 30 * 60 * 1000)
  const remind = (): void => checkDeadlines((title, body) => void notify(title, body, 'home'))
  setTimeout(remind, 10_000)
  setInterval(remind, 60_000)

  // Course files and photos: copy any that are missing from your PC while on the same Wi-Fi.
  let fetching = false
  const fetchRound = async (): Promise<void> => {
    if (fetching || getPrefs().lanAutoFetch === false) return
    fetching = true
    try {
      const r = await fetchMissingFiles(25)
      if (r.fetched) ['materials', 'exam_papers', 'photos'].forEach((t) => broadcast('db:changed', t))
    } finally {
      fetching = false
    }
  }
  setTimeout(() => void fetchRound(), 15_000)
  setInterval(() => void fetchRound(), 2 * 60 * 1000)

  // Phone life cycle: save when leaving the app, catch up when coming back.
  void App.addListener('pause', () => void flushAll())
  void App.addListener('resume', () => {
    if (currentUserId()) requestSync()
    void fetchRound()
    broadcast('db:changed', '*')
  })
  void LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
    const page = (a.notification.extra as { page?: string } | undefined)?.page
    if (page) broadcast('app:navigate', page)
  })
  window.addEventListener('pagehide', () => void flushAll())
  // Android back button: the UI handles it (menu, dialogs, previous page); otherwise leave the app.
  void App.addListener('backButton', () => {
    const ev = new Event('studyhall:back', { cancelable: true })
    window.dispatchEvent(ev)
    if (!ev.defaultPrevented) void App.minimizeApp()
  })

  // What the screen needs that only the phone has.
  ;(window as unknown as { __studyhallMobile: unknown }).__studyhallMobile = { platform: 'android', fileSrc }
}
