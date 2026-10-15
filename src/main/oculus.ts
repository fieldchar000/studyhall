// Oculus Dei: God's Eye View (github.com/bilawalsidhu/gods-eye-view, MIT, by Bilawal Sidhu) —
// a live 3D globe of flights, satellites, earthquakes and more — inside Studyhall.
// It's a web app with its own small local server, so Studyhall keeps a private copy of it and
// of Node.js (the engine it runs on) in the app data folder, starts the server on this PC only
// (127.0.0.1), and shows it in a view laid over the Oculus Dei page. Nothing here is needed by
// the rest of the app; removing it frees the disk space again.

import { app, BrowserWindow, session, shell, WebContentsView, type Session } from 'electron'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import type { OculusRect, OculusState } from '@shared/types'
import { getSetting, setSetting } from './db'
import { applyPacks } from './oculusPacks'

const REPO = 'bilawalsidhu/gods-eye-view'
const PINNED = 'f0a1b22dc82c6c5cd9690d07c1cdb297818da86f' // the version tested with Studyhall (and its Singapore pack)
const NODE_VERSION = '24.19.0' // God's Eye View needs Node >=24.14 <25
const NODE_DIR = `node-v${NODE_VERSION}-win-x64`
const PARTITION = 'persist:oculus'

const root = (): string => join(app.getPath('userData'), 'oculus-dei')
const nodeExe = (): string => join(root(), NODE_DIR, 'node.exe')

let state: OculusState = { phase: 'absent' }
let listener: (s: OculusState) => void = () => {}
let server: ChildProcess | null = null
let view: WebContentsView | null = null
let attachedTo: BrowserWindow | null = null
let busy = false

function set(patch: Partial<OculusState> & { phase?: OculusState['phase'] }): void {
  state = { ...state, ...patch }
  listener(state)
}

interface Installed {
  sha: string
  dir: string
  at: string
}
async function installed(): Promise<Installed | null> {
  try {
    const i = JSON.parse(await readFile(join(root(), 'installed.json'), 'utf8')) as Installed
    return existsSync(join(root(), i.dir, 'node_modules', 'vite')) && existsSync(nodeExe()) ? i : null
  } catch {
    return null
  }
}

export async function initOculus(onChange: (s: OculusState) => void): Promise<void> {
  listener = onChange
  const i = await installed()
  state = i ? { phase: 'stopped', version: i.sha.slice(0, 7) } : { phase: 'absent' }
  state.ltaKey = !!getSetting<string>('oculus_lta_key')
}

export const oculusState = (): OculusState => state

// ---------- Install / update / remove ----------

async function download(url: string, file: string, label: string): Promise<void> {
  const res = await fetch(url, { headers: { 'user-agent': 'Studyhall' } })
  if (!res.ok || !res.body) throw new Error(`${label}: download failed (${res.status})`)
  const total = Number(res.headers.get('content-length')) || 0
  const chunks: Uint8Array[] = []
  let got = 0
  const reader = res.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    got += value.length
    set({ step: total ? `${label} — ${Math.round((got / total) * 100)}%` : `${label} — ${(got / 1e6).toFixed(0)} MB` })
  }
  await writeFile(file, Buffer.concat(chunks))
}

/** Unpack a .zip with Windows' own tar (bsdtar — a "tar" from Git on the PATH can't read zips),
 *  falling back to PowerShell's Expand-Archive. */
function unzip(file: string, dest: string): Promise<void> {
  const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
  const viaPowerShell = (): Promise<void> =>
    new Promise((ok, fail) =>
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath $env:SH_ZIP -DestinationPath $env:SH_DEST -Force'],
        { windowsHide: true, env: { ...process.env, SH_ZIP: file, SH_DEST: dest }, maxBuffer: 1 << 20 },
        (e) => (e ? fail(new Error(`Unpacking failed: ${e.message}`)) : ok())
      )
    )
  if (!existsSync(tar)) return viaPowerShell()
  return new Promise((ok, fail) =>
    execFile(tar, ['-xf', file, '-C', dest], { windowsHide: true, maxBuffer: 1 << 20 }, (e) => (e ? viaPowerShell().then(ok, fail) : ok()))
  )
}

async function ensureNode(): Promise<void> {
  if (existsSync(nodeExe())) return
  const zip = join(root(), `${NODE_DIR}.zip`)
  await download(`https://nodejs.org/dist/v${NODE_VERSION}/${NODE_DIR}.zip`, zip, 'Downloading Node.js')
  // Check it's the genuine file: compare with the checksum list nodejs.org publishes.
  set({ step: 'Checking Node.js' })
  const sums = await (await fetch(`https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt`)).text()
  const want = sums.split('\n').find((l) => l.trim().endsWith(`${NODE_DIR}.zip`))?.split(/\s+/)[0]
  const have = createHash('sha256').update(await readFile(zip)).digest('hex')
  if (!want || want !== have) {
    await rm(zip, { force: true })
    throw new Error('The Node.js download did not match its published checksum, so it was deleted.')
  }
  set({ step: 'Unpacking Node.js' })
  await unzip(zip, root())
  await rm(zip, { force: true })
}

function npmCi(dir: string): Promise<void> {
  return new Promise((ok, fail) => {
    const npm = join(root(), NODE_DIR, 'node_modules', 'npm', 'bin', 'npm-cli.js')
    const p = spawn(nodeExe(), [npm, 'ci', '--no-audit', '--no-fund', '--loglevel=error'], {
      cwd: dir,
      windowsHide: true,
      env: { ...process.env, PATH: `${join(root(), NODE_DIR)};${process.env.PATH ?? ''}`, npm_config_update_notifier: 'false' }
    })
    let err = ''
    p.stderr.on('data', (d) => (err = (err + String(d)).slice(-2000)))
    const tick = setInterval(() => set({ step: `Installing its packages (about a minute)${'.'.repeat((Date.now() / 1000) % 4)}` }), 1000)
    p.on('close', (code) => {
      clearInterval(tick)
      if (code === 0) ok()
      else fail(new Error(`Installing packages failed. ${err.trim().split('\n').slice(-3).join(' ')}`))
    })
  })
}

async function installVersion(sha: string): Promise<void> {
  await mkdir(root(), { recursive: true })
  await ensureNode()
  const zip = join(root(), 'source.zip')
  await download(`https://codeload.github.com/${REPO}/zip/${sha}`, zip, 'Downloading God’s Eye View')
  set({ step: 'Unpacking God’s Eye View' })
  const tmp = join(root(), 'unpack')
  await rm(tmp, { recursive: true, force: true })
  await mkdir(tmp)
  await unzip(zip, tmp)
  await rm(zip, { force: true })
  const [top] = await readdir(tmp)
  const dir = `app-${sha.slice(0, 12)}`
  await rm(join(root(), dir), { recursive: true, force: true })
  await rename(join(tmp, top), join(root(), dir))
  await rm(tmp, { recursive: true, force: true })
  await npmCi(join(root(), dir))
  set({ step: 'Adding Singapore' })
  await usePacks(join(root(), dir))
  const before = await installed()
  await writeFile(join(root(), 'installed.json'), JSON.stringify({ sha, dir, at: new Date().toISOString() } satisfies Installed))
  if (before && before.dir !== dir) await rm(join(root(), before.dir), { recursive: true, force: true }).catch(() => {})
}

async function run(job: () => Promise<void>): Promise<OculusState> {
  if (busy) return state
  busy = true
  try {
    await job()
  } catch (e) {
    set({ phase: 'error', step: undefined, message: e instanceof Error ? e.message : String(e) })
  } finally {
    busy = false
  }
  return state
}

export const installOculus = (): Promise<OculusState> =>
  run(async () => {
    set({ phase: 'installing', step: 'Starting', message: undefined })
    await installVersion(PINNED)
    set({ phase: 'stopped', step: undefined, version: PINNED.slice(0, 7) })
  })

/** Is there a newer version on GitHub than the one installed? */
export async function checkOculusUpdate(): Promise<OculusState> {
  const i = await installed()
  if (!i) return state
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/commits/main`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'Studyhall' } })
    const latest = ((await r.json()) as { sha?: string }).sha
    set({ updateAvailable: !!latest && latest !== i.sha ? latest.slice(0, 7) : undefined })
  } catch {
    /* offline: try another time */
  }
  return state
}

export const updateOculus = (): Promise<OculusState> =>
  run(async () => {
    const r = await fetch(`https://api.github.com/repos/${REPO}/commits/main`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'Studyhall' } })
    const latest = ((await r.json()) as { sha?: string }).sha
    if (!latest) throw new Error('Couldn’t reach GitHub to update.')
    stopServer()
    set({ phase: 'installing', step: 'Updating', message: undefined })
    await installVersion(latest)
    set({ phase: 'stopped', step: undefined, version: latest.slice(0, 7), updateAvailable: undefined })
  })

export const removeOculus = (): Promise<OculusState> =>
  run(async () => {
    stopServer()
    await rm(root(), { recursive: true, force: true })
    set({ phase: 'absent', version: undefined, url: undefined, updateAvailable: undefined, message: undefined })
  })

// ---------- Studyhall's additions (Singapore) and your keys for them ----------

async function usePacks(dir: string): Promise<void> {
  const r = await applyPacks(dir).catch(() => ({ applied: [] as string[], skipped: ['Singapore traffic cameras'] }))
  set({ packs: r.applied, packsSkipped: r.skipped })
}

/** Your free LTA DataMall key (all Singapore cameras). Kept on this PC only, never synced. */
export function setOculusLtaKey(key: string): OculusState {
  const k = String(key ?? '').trim().slice(0, 200)
  setSetting('oculus_lta_key', k)
  set({ ltaKey: !!k })
  if (server) {
    stopServer()
    void startOculus() // restart so the globe picks the key up
  }
  return state
}

// ---------- The local server ----------

function freePort(from: number): Promise<number> {
  return new Promise((ok) => {
    const s = createServer()
    s.once('error', () => ok(freePort(from + 1)))
    s.listen(from, '127.0.0.1', () => s.close(() => ok(from)))
  })
}

function stopServer(): void {
  if (server?.pid) execFile('taskkill', ['/pid', String(server.pid), '/T', '/F'], { windowsHide: true }, () => {})
  server = null
  if (state.phase === 'running' || state.phase === 'starting') set({ phase: 'stopped', url: undefined })
}

export const startOculus = (): Promise<OculusState> =>
  run(async () => {
    if (server && state.url) return
    const i = await installed()
    if (!i) {
      set({ phase: 'absent' })
      return
    }
    set({ phase: 'starting', step: 'Starting the globe', message: undefined })
    const port = await freePort(4173)
    const dir = join(root(), i.dir)
    await usePacks(dir) // copies installed before a pack existed get it now
    const proc = spawn(nodeExe(), [join(dir, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
      cwd: dir,
      windowsHide: true,
      env: {
        ...process.env,
        PATH: `${join(root(), NODE_DIR)};${process.env.PATH ?? ''}`,
        BROWSER: 'none',
        NODE_ENV: 'development',
        LTA_DATAMALL_KEY: getSetting<string>('oculus_lta_key') ?? ''
      }
    })
    server = proc
    let log = ''
    proc.stdout.on('data', (d) => (log = (log + String(d)).slice(-3000)))
    proc.stderr.on('data', (d) => (log = (log + String(d)).slice(-3000)))
    proc.on('exit', () => {
      if (server === proc) {
        server = null
        if (state.phase === 'running' || state.phase === 'starting') set({ phase: 'stopped', url: undefined })
      }
    })
    const url = `http://127.0.0.1:${port}/`
    for (let t = 0; t < 120; t++) {
      if (server !== proc) throw new Error(`The globe stopped while starting. ${log.trim().split('\n').slice(-3).join(' ')}`)
      const ok = await fetch(url).then((r) => r.ok, () => false)
      if (ok) {
        set({ phase: 'running', step: undefined, url, version: i.sha.slice(0, 7) })
        return
      }
      await new Promise((r) => setTimeout(r, 1000))
    }
    stopServer()
    throw new Error('The globe took too long to start.')
  })

export function stopOculus(): void {
  hideOculus()
  view?.webContents.close()
  view = null
  stopServer()
}

// ---------- The view over the page ----------

export const isOculusContents = (s: Session): boolean => s === session.fromPartition(PARTITION)

function makeView(): WebContentsView {
  const ses = session.fromPartition(PARTITION)
  // The globe needs no camera, microphone or location here.
  ses.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'fullscreen' || permission === 'clipboard-sanitized-write'))
  ses.setPermissionCheckHandler((_wc, permission) => permission === 'fullscreen' || permission === 'clipboard-sanitized-write')
  const v = new WebContentsView({ webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false } })
  v.setBackgroundColor('#05070b')
  // Stay on the local globe; anything else (sources, credits) opens in the normal browser.
  const local = (u: string): boolean => !!state.url && u.startsWith(state.url.replace(/\/$/, ''))
  v.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url) && !local(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  v.webContents.on('will-navigate', (e, url) => {
    if (!local(url)) {
      e.preventDefault()
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    }
  })
  return v
}

export function showOculus(win: BrowserWindow, rect: OculusRect): void {
  if (state.phase !== 'running' || !state.url) return
  if (!view) {
    view = makeView()
    void view.webContents.loadURL(state.url)
  }
  if (attachedTo !== win) {
    attachedTo?.contentView.removeChildView(view)
    win.contentView.addChildView(view)
    attachedTo = win
  }
  view.setBounds({ x: Math.round(rect.x), y: Math.round(rect.y), width: Math.max(0, Math.round(rect.width)), height: Math.max(0, Math.round(rect.height)) })
  view.setVisible(true)
}

export function hideOculus(): void {
  view?.setVisible(false)
}

export function openOculusInBrowser(): void {
  if (state.url) void shell.openExternal(state.url)
}
