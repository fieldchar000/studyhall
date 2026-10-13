// Runs inside the Android emulator job (.github/workflows/android-smoke.yml): installs the debug
// app, drives its WebView over the DevTools protocol and checks the phone-only plumbing —
// start-up, saving to storage across a restart, photos on disk, native HTTP, the back button.
// Screenshots and a report go to ./smoke for the workflow to upload.

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

const APK = process.argv[2] ?? 'android/app/build/outputs/apk/debug/app-debug.apk'
const PKG = 'com.studyhall.app'
const OUT = 'smoke'
mkdirSync(OUT, { recursive: true })

const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
/** Like adb(), but "nothing found" (non-zero exit) is just an empty answer. */
const adbQuiet = (...args) => {
  try {
    return adb(...args)
  } catch (e) {
    return String(e.stdout ?? '')
  }
}
/** Android's log for the app and its web view (crashes, console messages). */
const saveLogcat = () => writeFileSync(`${OUT}/logcat.txt`, adbQuiet('logcat', '-d', '-v', 'brief', 'AndroidRuntime:E', 'Capacitor:*', 'Capacitor/Console:*', 'chromium:*', 'ActivityManager:I', '*:S'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const report = []
let failed = 0
const check = (name, ok, detail = '') => {
  report.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
  console.log(report.at(-1))
}
const shot = (name) => writeFileSync(`${OUT}/${name}.png`, execFileSync('adb', ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 }))

async function connect() {
  // The app's WebView exposes a DevTools socket named after its process id.
  for (let i = 0; i < 40; i++) {
    const pid = adbQuiet('shell', 'pidof', PKG).trim()
    if (!pid && i === 12) launch() // not started after ~20s: try once more
    const sockets = adbQuiet('shell', 'cat', '/proc/net/unix')
    const m = pid && new RegExp(`@(webview_devtools_remote_${pid})`).exec(sockets)
    if (m) {
      try {
        adb('forward', '--remove-all')
      } catch {}
      adb('forward', 'tcp:9229', `localabstract:${m[1]}`)
      for (let j = 0; j < 20; j++) {
        try {
          const pages = await (await fetch('http://127.0.0.1:9229/json')).json()
          const page = pages.find((p) => p.type === 'page')
          if (page) return cdp(page.webSocketDebuggerUrl)
        } catch {}
        await sleep(1000)
      }
    }
    await sleep(1500)
  }
  throw new Error('Could not reach the app’s WebView')
}

async function cdp(url) {
  const ws = new WebSocket(url)
  await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)))
  let id = 0
  const pending = new Map()
  const logs = []
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data)
    if (d.id && pending.has(d.id)) {
      pending.get(d.id)(d)
      pending.delete(d.id)
    } else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') logs.push(d.params.args.map((a) => a.value ?? a.description).join(' '))
    else if (d.method === 'Runtime.exceptionThrown') logs.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text)
  }
  const send = (method, params = {}) =>
    new Promise((r) => {
      const i = ++id
      pending.set(i, r)
      ws.send(JSON.stringify({ id: i, method, params }))
    })
  await send('Runtime.enable')
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'evaluation failed')
    return r.result?.result?.value
  }
  return { ev, logs, close: () => ws.close() }
}

const launch = () => adb('shell', 'am', 'start', '-n', `${PKG}/.MainActivity`)
const waitForApp = async (page) => {
  for (let i = 0; i < 60; i++) {
    const ok = await page.ev(`!!document.querySelector('main') && !document.getElementById('boot')`).catch(() => false)
    if (ok) return true
    await sleep(1000)
  }
  return false
}

async function main() {
  // Wait for the emulator to finish booting and unlock its screen.
  for (let i = 0; i < 60 && adbQuiet('shell', 'getprop', 'sys.boot_completed').trim() !== '1'; i++) await sleep(2000)
  adbQuiet('shell', 'input', 'keyevent', '82')
  adb('install', '-r', APK)
  adbQuiet('logcat', '-c')
  launch()
  let page = await connect()
  check('App starts (database, UI)', await waitForApp(page), await page.ev(`document.getElementById('boot-status')?.textContent ?? ''`).catch(() => ''))
  await sleep(2000)
  shot('1-home')

  // Data: create rows, then restart the app and check they were saved to storage.
  const made = await page.ev(`(async () => {
    const m = await window.api.create('modules', { code: 'SMK101', name: 'Smoke test module', color: '#2f6b52', term: '', archived: 0, sort: 0 })
    await window.api.create('weeks', { module_id: m.id, number: 1, title: 'Week one' })
    await window.api.create('notes', { title: 'Phone note', content: '', plain_text: 'Written on the phone to check saving works across a restart.', kind: 'note', mode: 'study', module_id: m.id, pinned: 0, category: 'notes' })
    return (await window.api.list('notes', {})).length
  })()`)
  check('Can add notes and modules', made >= 1, `${made} note(s)`)

  // Photos: saved into private storage and shown through the WebView's file server.
  const photo = await page.ev(`(async () => {
    const c = new OffscreenCanvas(320, 240); const g = c.getContext('2d'); g.fillStyle = '#2f6b52'; g.fillRect(0, 0, 320, 240)
    const bytes = new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg' })).arrayBuffer())
    const saved = await window.api.photos.save(bytes)
    const day = await window.api.create('journal_entries', { date: '2026-01-01', content: 'smoke', title: 'Smoke', gratitude: '', tags: '[]', details: '{}' })
    const p = await window.api.create('photos', { parent_table: 'journal_entries', parent_id: day.id, local_path: saved.local_path, size_bytes: saved.size_bytes, width: 320, height: 240, sort: 0 })
    const src = window.__studyhallMobile.fileSrc(p.id)
    const img = new Image(); img.src = src
    const loaded = await new Promise((r) => { img.onload = () => r(img.naturalWidth); img.onerror = () => r(0); setTimeout(() => r(-1), 8000) })
    return { src, loaded }
  })()`)
  check('Photos save and display', photo?.loaded === 320, JSON.stringify(photo))

  // Native HTTP (feeds, calendars, update check) — no browser cross-site limits.
  const http = await page.ev(`(async () => { const s = await window.api.app.checkUpdates(); return s.status + (s.message ? ': ' + s.message : '') })()`)
  check('Internet + update check', /^(none|ready)/.test(http), http)

  // Menu and back button
  await page.ev(`document.querySelector('.mobile-bar button')?.click(); true`)
  await sleep(800)
  shot('2-menu')
  const opened = await page.ev(`document.documentElement.classList.contains('drawer-open')`)
  adb('shell', 'input', 'keyevent', '4') // Android back
  await sleep(800)
  const closed = await page.ev(`!document.documentElement.classList.contains('drawer-open')`)
  check('Menu opens, back button closes it', opened && closed)

  await page.ev(`[...document.querySelectorAll('aside nav button')].find(b => b.textContent.trim().startsWith('Notes'))?.click(); true`)
  await sleep(1500)
  shot('3-notes')
  await page.ev(`[...document.querySelectorAll('main li button')][0]?.click(); true`)
  await sleep(1500)
  shot('4-note')
  adb('shell', 'input', 'keyevent', '4')
  await sleep(800)
  const back = await page.ev(`!!document.querySelector('main input[placeholder^="Search notes"]')`)
  check('Back button returns to the previous page', back)

  // Restart: data must still be there (saved to storage, not just memory).
  await sleep(2500) // the save happens a moment after the last change
  adb('shell', 'input', 'keyevent', '3') // home (app goes to background → saves)
  await sleep(1500)
  adb('shell', 'am', 'force-stop', PKG)
  page.close()
  launch()
  page = await connect()
  await waitForApp(page)
  const after = await page.ev(`(async () => ({ notes: (await window.api.list('notes', {})).map(n => n.title), photos: (await window.api.list('photos', {})).length }))()`)
  check('Data survives closing the app', after?.notes?.includes('Phone note') && after.photos === 1, JSON.stringify(after))

  await page.ev(`[...document.querySelectorAll('aside nav button')].find(b => b.textContent.trim().startsWith('Brain'))?.click(); true`)
  await sleep(3000)
  shot('5-brain')
  await page.ev(`[...document.querySelectorAll('[role=tab]')].find(b => b.textContent === 'Life')?.click(); true`)
  await sleep(800)
  await page.ev(`[...document.querySelectorAll('aside nav button')].find(b => b.textContent.trim().startsWith('Daily journal'))?.click(); true`)
  await sleep(2000)
  shot('6-journal')
  await page.ev(`[...document.querySelectorAll('aside nav button')].find(b => b.textContent.trim().startsWith('Settings'))?.click(); true`)
  await sleep(1500)
  shot('7-settings')

  const errors = page.logs.filter((l) => !/favicon|ResizeObserver loop/i.test(l))
  check('No errors in the app’s console', errors.length === 0, errors.slice(0, 5).join(' | '))
  writeFileSync(`${OUT}/report.txt`, report.join('\n') + '\n')
  saveLogcat()
  page.close()
  if (failed) process.exit(1)
}

main().catch((e) => {
  report.push(`FAIL  crashed — ${e.message}`)
  writeFileSync(`${OUT}/report.txt`, report.join('\n') + '\n')
  try {
    shot('crash')
    saveLogcat()
  } catch {}
  console.error(e)
  process.exit(1)
})
