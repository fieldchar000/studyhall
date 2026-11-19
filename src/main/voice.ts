// "Hey Bauer" on the PC: a hidden window that listens for the wake word (Vosk, offline),
// records what you say, writes it down (Whisper, offline) and shows the review list.
// The speech models are downloaded once into the app's data folder (~120 MB) and served
// to that window from app://studyhall/voice-models/. Nothing you say leaves the PC.

import { app, BrowserWindow, desktopCapturer, screen, session } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, normalize } from 'node:path'
import { gzipSync } from 'node:zlib'
import JSZip from 'jszip'
import type { NovaName, VoiceCommand, VoiceState, VoiceStatus } from '@shared/types'
import { getPrefs } from './prefs'
import { earsStatus, unloadEars, warmEars } from './ears'
import { unloadMouth } from './mouth'

export const VOICE_DIR = (): string => join(app.getPath('userData'), 'voice')
export const VOSK_FILE = 'vosk-small-en.tar.gz'
export const WHISPER_MODEL = 'Xenova/whisper-base.en'
const WHISPER_FILES = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx'
]
const VOSK_ZIP = 'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip'
const VOSK_BYTES = 41_205_931
const WHISPER_BYTES = 23_200_856 + 53_707_027 + 2_500_000 // two models + small json files
const TOTAL = VOSK_BYTES + WHISPER_BYTES

// ---------- Model files ----------

const exists = async (p: string): Promise<boolean> => !!(await stat(p).catch(() => null))
async function installed(): Promise<boolean> {
  const dir = VOICE_DIR()
  if (!(await exists(join(dir, VOSK_FILE)))) return false
  for (const f of WHISPER_FILES) if (!(await exists(join(dir, WHISPER_MODEL, f)))) return false
  return true
}

let downloading = false
let progress = 0 // bytes
let error: string | null = null
let state: VoiceState = 'off'
let notify: (s: VoiceStatus) => void = () => {}

export async function voiceStatus(): Promise<VoiceStatus> {
  return {
    installed: await installed(),
    downloading,
    progress: downloading ? Math.min(1, progress / TOTAL) : 0,
    sizeMb: Math.round(TOTAL / 1e6),
    error,
    state
  }
}
const pushStatus = (): void => void voiceStatus().then(notify)

/** Download one file to `dest` (via a .part file), counting bytes into `progress`. */
async function fetchTo(url: string, dest: string): Promise<void> {
  await mkdir(dirname(dest), { recursive: true })
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}) for ${url.split('/').pop()}`)
  const part = `${dest}.part`
  const out = createWriteStream(part)
  let last = 0
  try {
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      progress += value.byteLength
      if (!out.write(value)) await new Promise<void>((r) => out.once('drain', () => r()))
      if (Date.now() - last > 250) {
        last = Date.now()
        pushStatus()
      }
    }
  } finally {
    await new Promise((r) => out.end(r))
  }
  await rename(part, dest)
}

/** A tar archive (ustar) of the given files, for the wake-word engine (it reads .tar.gz). */
function tar(entries: { name: string; data: Uint8Array }[]): Buffer {
  const blocks: Buffer[] = []
  // Folders first (the engine only creates folders that have their own entry).
  const dirs = new Set<string>()
  for (const e of entries) {
    const parts = e.name.split('/').slice(0, -1)
    for (let i = 1; i <= parts.length; i++) dirs.add(`${parts.slice(0, i).join('/')}/`)
  }
  const files = [...[...dirs].sort().map((name) => ({ name, data: new Uint8Array(0), dir: true })), ...entries.map((e) => ({ ...e, dir: false }))]
  for (const f of files) {
    const h = Buffer.alloc(512)
    let name = f.name
    let prefix = ''
    if (Buffer.byteLength(name) > 100) {
      const cut = name.lastIndexOf('/', 154)
      prefix = name.slice(0, cut)
      name = name.slice(cut + 1)
    }
    h.write(name, 0, 100)
    h.write(f.dir ? '0000755\0' : '0000644\0', 100)
    h.write('0000000\0', 108)
    h.write('0000000\0', 116)
    h.write(`${f.data.length.toString(8).padStart(11, '0')}\0`, 124)
    h.write(
      `${Math.floor(Date.now() / 1000)
        .toString(8)
        .padStart(11, '0')}\0`,
      136
    )
    h.write('        ', 148) // checksum placeholder
    h.write(f.dir ? '5' : '0', 156) // folder / regular file
    h.write('ustar\0', 257)
    h.write('00', 263)
    h.write(prefix, 345, 155)
    let sum = 0
    for (const b of h) sum += b
    h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148)
    blocks.push(h, Buffer.from(f.data))
    const padTo = (512 - (f.data.length % 512)) % 512
    if (padTo) blocks.push(Buffer.alloc(padTo))
  }
  blocks.push(Buffer.alloc(1024))
  return Buffer.concat(blocks)
}

/** The official Vosk model comes as a .zip; repack it as .tar.gz. */
async function installVosk(dir: string): Promise<void> {
  const zipPath = join(dir, 'vosk.zip')
  await fetchTo(VOSK_ZIP, zipPath)
  const zip = await JSZip.loadAsync(await readFile(zipPath))
  const files: { name: string; data: Uint8Array }[] = []
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || /(^|\/)\._|__MACOSX|\.DS_Store/.test(entry.name)) continue
    files.push({ name: entry.name, data: await entry.async('uint8array') })
  }
  if (!files.some((f) => f.name.endsWith('final.mdl'))) throw new Error('The wake-word model download looks broken. Try again.')
  await writeFile(join(dir, VOSK_FILE), gzipSync(tar(files), { level: 1 }))
  await rm(zipPath, { force: true })
}

export async function downloadVoice(): Promise<VoiceStatus> {
  if (downloading) return voiceStatus()
  downloading = true
  progress = 0
  error = null
  pushStatus()
  const dir = VOICE_DIR()
  try {
    await mkdir(dir, { recursive: true })
    if (!(await exists(join(dir, VOSK_FILE)))) await installVosk(dir)
    else progress += VOSK_BYTES
    for (const f of WHISPER_FILES) {
      const dest = join(dir, WHISPER_MODEL, f)
      if (await exists(dest)) {
        progress += (await stat(dest)).size
        continue
      }
      await fetchTo(`https://huggingface.co/${WHISPER_MODEL}/resolve/main/${f}`, dest)
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
    if (/fetch failed|ENOTFOUND|ECONNRESET|ETIMEDOUT/i.test(error)) error = 'No internet connection — try again when you’re online.'
  } finally {
    downloading = false
  }
  pushStatus()
  if (!error) syncVoiceWindow()
  return voiceStatus()
}

/** app://studyhall/voice-models/... → the downloaded files. */
export async function serveVoiceModel(path: string): Promise<Response> {
  const root = VOICE_DIR()
  const file = normalize(join(root, decodeURIComponent(path)))
  if (!file.startsWith(root)) return new Response('Forbidden', { status: 403 })
  try {
    const body = await readFile(file)
    const type = file.endsWith('.json') ? 'application/json' : 'application/octet-stream'
    return new Response(body, {
      headers: {
        'content-type': type,
        'cross-origin-resource-policy': 'same-origin'
      }
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}

// ---------- The listening window ----------

let win: BrowserWindow | null = null
let ready = false
let pending: VoiceCommand[] = []
const W = 340
const H_SMALL = 236
let loadUrl: (hash: string) => string = (h) => h
let webPrefs: Electron.WebPreferences = {}

export function configureVoice(opts: { url: (hash: string) => string; webPreferences: Electron.WebPreferences; onStatus: (s: VoiceStatus) => void }): void {
  loadUrl = opts.url
  webPrefs = opts.webPreferences
  notify = opts.onStatus
}

export const isVoiceContents = (wc: Electron.WebContents): boolean => !!win && !win.isDestroyed() && win.webContents.id === wc.id

function ensureWindow(): BrowserWindow {
  if (win && !win.isDestroyed()) return win
  ready = false
  win = new BrowserWindow({
    width: W,
    height: H_SMALL,
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: 'Bauer',
    backgroundColor: '#070f2a',
    webPreferences: {
      ...webPrefs,
      backgroundThrottling: false,
      spellcheck: false
    }
  })
  win.setAlwaysOnTop(true, 'floating')
  win.on('close', (e) => {
    if (closingAll) return
    e.preventDefault()
    win?.hide()
  })
  win.on('closed', () => {
    win = null
    ready = false
  })
  win.webContents.on('did-start-loading', () => (ready = false))
  win.loadURL(loadUrl('?voice#voice'))
  return win
}

function send(cmd: VoiceCommand): void {
  if (!win || win.isDestroyed()) return
  if (!ready) {
    pending.push(cmd)
    return
  }
  win.webContents.send('voice:command', cmd)
}

/** True while Studyhall is closed to the tray and "Bauer only while Studyhall is open" is on. */
let suspended = false
/** Nova's new ears are installed (Parakeet + "Hey <name>"); kept up to date by syncVoiceWindow. */
let earsReady = false
const wakeConfig = (): {
  wake: boolean
  sensitivity: number
  ears: boolean
  name: NovaName
} => {
  const p = getPrefs()
  return {
    wake: !!p.voiceWake && !suspended,
    sensitivity: typeof p.voiceSensitivity === 'number' ? p.voiceSensitivity : 50,
    ears: earsReady,
    name: p.novaName ?? 'Nova'
  }
}

/** Studyhall closed (to the tray) or opened again: stop or restart listening for "Hey Bauer". */
export function setVoiceSuspended(on: boolean): void {
  if (suspended === on) return
  suspended = on
  if (on && win && !win.isDestroyed()) {
    send({ type: 'stop' })
    win.hide()
  }
  if (on) {
    stopKeys()
    unloadEars() // frees Parakeet's memory while Studyhall is closed
    unloadMouth()
  } else startKeys()
  syncVoiceWindow()
}

/** Start/stop the hidden listener to match the settings (called at start-up and on changes). */
export function syncVoiceWindow(): void {
  void Promise.all([installed(), earsStatus()]).then(([vosk, ears]) => {
    earsReady = ears.installed
    const ok = vosk || earsReady
    const { wake } = wakeConfig()
    if (ok && wake) {
      ensureWindow()
      send({ type: 'config', ...wakeConfig() })
    } else if (win && !win.isDestroyed()) {
      send({ type: 'config', ...wakeConfig() })
    }
  })
}

/** "Brief Bauer" button / tray item: show the panel and start listening straight away. */
export function startBrief(): void {
  ensureWindow()
  place(H_SMALL)
  win!.showInactive()
  send({ type: 'listen' })
}

/** Tutor mode: the voice window records the lesson (that screen and Nova's voice), or stops. */
export function voiceRecord(on: boolean, sourceId?: string): void {
  ensureWindow()
  send({ type: 'record', on, ...(sourceId ? { sourceId } : {}) })
}
/** A request to Nova as if you'd said it (tutor mode's opening question), through the voice window. */
/** Conversation mode on or off: the voice window listens hands-free after each reply, or stops. */
export function voiceConversation(on: boolean): void {
  ensureWindow()
  if (on) {
    place(H_SMALL)
    win!.showInactive()
  }
  send({ type: 'conversation', on })
}

export function voiceAsk(text: string): void {
  ensureWindow()
  const go = (): void => void (ready ? win?.webContents.send('nova:ask', text) : setTimeout(go, 300))
  go()
}

/** Esc anywhere: Nova stops talking (and stops looking or working the screen). */
export function voiceHush(): void {
  if (win && !win.isDestroyed()) send({ type: 'hush' })
}

/** Ask you something in Nova's panel (Allow / Skip). Resolves false on Skip, Esc or after a minute. */
let askSeq = 0
const answers = new Map<number, (ok: boolean) => void>()
export function voiceConfirm(question: string): Promise<boolean> {
  if (suspended) return Promise.resolve(false)
  ensureWindow()
  place(H_SMALL)
  win!.showInactive()
  const id = ++askSeq
  send({ type: 'confirm', id, question })
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      answers.delete(id)
      resolve(false)
    }, 60_000)
    answers.set(id, (ok) => {
      clearTimeout(t)
      resolve(ok)
    })
  })
}
export function voiceAnswer(id: number, ok: boolean): void {
  answers.get(id)?.(ok)
  answers.delete(id)
}

/** Say something and wait until it has been said (live lessons). Gives up after a generous time. */
let saySeq = 0
const saying = new Map<number, () => void>()
export function voiceSayAndWait(text: string): Promise<void> {
  if (suspended || !text) return Promise.resolve()
  ensureWindow()
  const id = ++saySeq
  send({ type: 'say', text, id })
  return new Promise((resolve) => {
    const t = setTimeout(
      () => {
        saying.delete(id)
        resolve()
      },
      4000 + text.length * 110
    )
    saying.set(id, () => {
      clearTimeout(t)
      resolve()
    })
  })
}
export function voiceSaid(id: number): void {
  saying.get(id)?.()
  saying.delete(id)
}

/** Say something (e.g. the next step of a walkthrough), with Nova's voice. */
export function voiceSay(text: string): void {
  if (suspended || !text) return
  ensureWindow()
  send({ type: 'say', text })
}

// ---------- Talk keys (hold Ctrl + Alt to talk, tap Ctrl + Shift to type) ----------

let keys: ChildProcess | null = null
let keysWanted = false
/** Start the small helper that notices the talk keys (PC app only; never in automated tests). */
/** The talk keys going down and up (the pen draws while they are held). */
export const talkKeyHooks = {
  down: (): void => {},
  up: (): void => {},
  esc: (): void => {},
  click: (): void => {},
  lmb: (_down: boolean): void => {},
  rmb: (): void => {}
}
let clicksWanted = false
/** The pen is on: the key helper reports the mouse buttons (it draws while the left one is held). */
/** Other apps' sound quieter while you hold the talk key (nova-keys does it with Windows' per-app volume and puts
 *  every volume back when you let go, or if Studyhall closes). Never in automated tests. */
let ducked = false
function duck(on: boolean): void {
  if (on && (getPrefs().novaDuck === false || process.env.STUDYHALL_OFFSCREEN === '1')) return
  if (on === ducked) return
  ducked = on
  try {
    keys?.stdin?.write(on ? 'duck on Studyhall,electron\n' : 'duck off\n')
  } catch {
    /* the helper isn't running */
  }
}

/** The voice window may record the PC's sound (Windows loopback) while you hold Ctrl+Alt+Shift; nothing else in the
 *  app can capture the screen or its sound this way. */
let loopbackReady = false
function allowLoopback(): void {
  if (loopbackReady) return
  loopbackReady = true
  session.defaultSession.setDisplayMediaRequestHandler((req, cb) => {
    // (never in automated tests: they hand in a recording instead of the PC's real sound)
    if (process.env.STUDYHALL_OFFSCREEN === '1' || !hearing || !String(req.frame?.url ?? '').includes('#voice')) return cb({})
    desktopCapturer
      .getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
      .then((s) => (s[0] ? cb({ video: s[0], audio: 'loopback' }) : cb({})))
      .catch(() => cb({}))
  })
}
let hearing = false

export function reportPen(on: boolean): void {
  penWanted = on
  try {
    keys?.stdin?.write(on ? 'pen on\n' : 'pen off\n')
  } catch {
    /* the helper isn't running */
  }
}
let penWanted = false
/** Report left clicks from any app (a drawn walkthrough waiting for your click; the mouse over Nova's layer), or
 *  stop. Each reason asks separately; they're heard while any of them wants them. */
const clickReasons = new Set<string>()
export function reportClicks(on: boolean, why = 'walkthrough'): void {
  if (on) clickReasons.add(why)
  else clickReasons.delete(why)
  if (clickReasons.size > 0 === clicksWanted) return
  clicksWanted = clickReasons.size > 0
  try {
    keys?.stdin?.write(clicksWanted ? 'clicks on\n' : 'clicks off\n')
  } catch {
    /* the helper isn't running */
  }
}

export function startKeys(): void {
  keysWanted = true
  if (keys || suspended || process.env.STUDYHALL_OFFSCREEN === '1') return
  const exe = app.isPackaged ? join(process.resourcesPath, 'nova-keys.exe') : join(app.getAppPath(), 'build', 'nova-keys.exe')
  void stat(exe)
    .then(() => {
      if (keys || !keysWanted || suspended) return
      const child = spawn(exe, [], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'ignore']
      })
      keys = child
      let buf = ''
      child.stdout?.on('data', (d) => {
        buf += String(d)
        let i: number
        while ((i = buf.indexOf(String.fromCharCode(10))) >= 0) {
          const line = buf.slice(0, i).trim()
          buf = buf.slice(i + 1)
          onKey(line)
        }
      })
      if (clicksWanted) child.stdin?.write('clicks on\n')
      if (penWanted) child.stdin?.write('pen on\n')
      child.on('exit', () => {
        if (keys === child) keys = null
      })
    })
    .catch(() => console.warn('Nova: talk-key helper not found at', exe))
}
export function stopKeys(): void {
  keysWanted = false
  keys?.stdin?.end() // the helper quits when its input closes
  keys = null
}
function onKey(e: string): void {
  if (suspended) return
  if (e === 'esc') return talkKeyHooks.esc()
  if (e === 'click') return talkKeyHooks.click()
  if (e === 'lmb-down' || e === 'lmb-up') return talkKeyHooks.lmb(e === 'lmb-down')
  if (e === 'rmb-down') return talkKeyHooks.rmb()
  if (e === 'hear-down') {
    // Ctrl+Alt+Shift: you, and what the PC is playing, each written down separately.
    hearing = true
    allowLoopback()
    talkKeyHooks.down()
    ensureWindow()
    place(H_SMALL)
    win!.showInactive()
    send({ type: 'listen', ptt: true, hear: true })
    if (earsReady) warmEars()
    return
  }
  if (e === 'hear-up') {
    talkKeyHooks.up()
    send({ type: 'finish' })
    setTimeout(() => (hearing = false), 3000)
    return
  }
  if (e === 'ptt-down') {
    duck(true)
    talkKeyHooks.down()
    ensureWindow()
    place(H_SMALL)
    win!.showInactive()
    send({ type: 'listen', ptt: true })
    if (earsReady) warmEars()
  } else if (e === 'ptt-up') {
    duck(false)
    talkKeyHooks.up()
    send({ type: 'finish' })
  } else if (e === 'ptt-cancel') {
    duck(false)
    talkKeyHooks.up()
    send({ type: 'cancel' })
  } else if (e === 'type') {
    // The ask bar: a small box right beside your cursor (like Roamies'), to type to Nova.
    ensureWindow()
    placeAtCursor(H_SMALL)
    win!.show()
    win!.focus()
    send({ type: 'type' })
  }
}

/** The typing box beside your marks (Ctrl+Alt+B): to the right of them, or below if there's no room. */
export function askBeside(r: Electron.Rectangle): void {
  ensureWindow()
  atCursor = true
  const area = screen.getDisplayMatching(r).workArea
  const h = H_SMALL
  const right = r.x + r.width + 16 + W <= area.x + area.width
  const x = right ? r.x + r.width + 16 : Math.max(area.x + 8, Math.min(r.x, area.x + area.width - W - 8))
  const y = right ? Math.max(area.y + 8, Math.min(r.y, area.y + area.height - h - 8)) : Math.min(r.y + r.height + 12, area.y + area.height - h - 8)
  if (process.env.STUDYHALL_OFFSCREEN === '1') {
    // (automated tests: never on screen, never taking the keyboard)
    win!.setBounds({ x: -30000, y: -30000, width: W, height: h })
    win!.showInactive()
  } else {
    win!.setBounds({ x: Math.round(x), y: Math.round(y), width: W, height: h })
    win!.show()
    win!.focus()
  }
  send({ type: 'type' })
}

/** Just below-right of the mouse (kept on its screen). */
let atCursor = false // the ask bar is open beside the mouse: it stays there while it grows
let resizes: number[] = [] // when the panel last asked to be resized (a runaway loop is cut off)
function placeAtCursor(height: number): void {
  if (!win) return
  atCursor = true
  const p = screen.getCursorScreenPoint()
  const area = screen.getDisplayNearestPoint(p).workArea
  const h = Math.min(height, area.height - 32)
  if (process.env.STUDYHALL_OFFSCREEN === '1') return void win.setBounds({ x: -30000, y: -30000, width: W, height: h }) // automated tests
  const x = Math.min(Math.max(area.x + 8, p.x + 18), area.x + area.width - W - 8)
  const y = Math.min(Math.max(area.y + 8, p.y + 22), area.y + area.height - h - 8)
  win.setBounds({ x: Math.round(x), y: Math.round(y), width: W, height: h })
}

/** Bottom-right corner of the screen the mouse is on. */
function place(height: number): void {
  if (!win) return
  atCursor = false
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
  const h = Math.min(height, area.height - 32)
  if (process.env.STUDYHALL_OFFSCREEN === '1') return void win.setBounds({ x: -30000, y: -30000, width: W, height: h }) // automated tests
  const x = Math.round(area.x + area.width - W - 16)
  const b = win.getBounds()
  if (b.x === x && b.width === W && Math.abs(b.height - h) <= 2 && win.isVisible()) return // (already there)
  win.setBounds({
    x,
    y: Math.round(area.y + area.height - h - 16),
    width: W,
    height: h
  })
}

/** Messages from the listening window itself. */
/** Listening, thinking or asking something right now (agent news waits for a quiet moment). */
export const voiceBusy = (): boolean => state === 'listening' || state === 'thinking' || state === 'review'

export function voiceFromWindow(msg: { type: 'show'; height: number; focus?: boolean } | { type: 'hide' } | { type: 'state'; state: VoiceState } | { type: 'ready' }): void {
  if (!win || win.isDestroyed()) return
  if (msg.type === 'ready') {
    // The panel is listening for commands now: send the settings, then anything waiting.
    ready = true
    const queue = pending
    pending = []
    send({ type: 'config', ...wakeConfig() })
    queue.forEach(send)
    return
  }
  if (msg.type === 'show') {
    const h = Math.max(72, Math.min(900, Math.round(msg.height)))
    // A box that keeps asking to be resized (it would run away down the screen): stop following it for a moment.
    const t = Date.now()
    resizes = resizes.filter((x) => t - x < 2000)
    resizes.push(t)
    if (resizes.length > 30) return
    if (atCursor && win.isVisible() && process.env.STUDYHALL_OFFSCREEN !== '1') {
      // Beside the mouse: keep its spot, just fit the height (moving up if it would run off the screen). The width is
      // always set exactly, never read back: at 125% / 150% display scaling Windows can hand back a pixel more, and
      // the box then grew a little with every fit, for ever.
      const b = win.getBounds()
      const area = screen.getDisplayMatching(b).workArea
      const hh = Math.min(h, area.height - 32)
      if (Math.abs(b.height - hh) <= 2 && b.width === W) return
      win.setBounds({ x: b.x, y: Math.min(b.y, area.y + area.height - hh - 8), width: W, height: hh })
    } else place(h)
    if (msg.focus && process.env.STUDYHALL_OFFSCREEN !== '1') {
      win.show()
      win.focus()
    } else if (!win.isVisible()) win.showInactive()
  } else if (msg.type === 'hide') {
    atCursor = false
    win.hide()
  } else if (msg.type === 'state') {
    state = msg.state
    pushStatus()
  }
}

let closingAll = false
export function closeVoice(): void {
  stopKeys()
  closingAll = true
  win?.destroy()
  win = null
}

if (process.env.STUDYHALL_OFFSCREEN === '1') (globalThis as unknown as { __voiceKey: unknown }).__voiceKey = (e: string) => onKey(e)
