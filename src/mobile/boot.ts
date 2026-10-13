// Phone start-up: make the phone look like the PC to the shared code (Buffer, files, SQLite),
// start the "main process" in this page, expose window.api exactly as the PC's preload does,
// then start the same React UI.

import { Buffer } from 'buffer'
;(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer
;(globalThis as unknown as { process: unknown }).process ??= { env: {}, platform: 'android', argv: [], versions: {}, nextTick: (f: () => void) => queueMicrotask(f) }

import { initStorage } from './storage'
import { initSqlite } from './shims/sqlite'

async function boot(): Promise<void> {
  const status = document.getElementById('boot-status')
  try {
    await initStorage()
    await initSqlite('/sh/studyhall.db')
    const { startMain } = await import('./main')
    startMain()
    await import('../preload/index') // window.api
    await import('../renderer/src/main') // the UI
    document.getElementById('boot')?.remove()
  } catch (e) {
    console.error(e)
    if (status) status.textContent = `Studyhall couldn’t start: ${e instanceof Error ? e.message : String(e)}`
  }
}

void boot()
