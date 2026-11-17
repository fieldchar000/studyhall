// Bauer's brain on the PC: a small AI model that runs on this computer, free and offline.
// One-time download (~2.5 GB) of llama.cpp's server (open source) and the Qwen3 4B model.
// The server only listens on 127.0.0.1, starts when Bauer needs it and stops after a while
// of quiet so the graphics card is free again. Nothing you say leaves the PC.

import { app } from 'electron'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { basename, dirname, join } from 'node:path'
import JSZip from 'jszip'
import type { AiStatus } from '@shared/types'

const AI_DIR = (): string => join(app.getPath('userData'), 'ai')
const SERVER_DIR = (): string => join(AI_DIR(), 'llama')
const SERVER_EXE = (): string => join(SERVER_DIR(), 'llama-server.exe')
const PID_FILE = (): string => join(AI_DIR(), 'server.pid')
const MODEL = (): string => join(AI_DIR(), 'qwen3-4b-instruct-2507-q4_k_m.gguf')
const MODEL_URL = 'https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf'
const MODEL_BYTES = 2_497_281_120
const SERVER_BYTES_GUESS = 45_000_000
const IDLE_MS = 10 * 60_000

const exists = async (p: string): Promise<boolean> => !!(await stat(p).catch(() => null))
async function installed(): Promise<boolean> {
  const m = await stat(MODEL()).catch(() => null)
  return !!m && m.size === MODEL_BYTES && (await exists(SERVER_EXE()))
}

let downloading = false
let got = 0
let total = MODEL_BYTES + SERVER_BYTES_GUESS
let error: string | null = null
let proc: ChildProcess | null = null
let port = 0
let starting: Promise<number> | null = null
let idleTimer: NodeJS.Timeout | null = null
let notify: (s: AiStatus) => void = () => {}

export function configureAi(onStatus: (s: AiStatus) => void): void {
  notify = onStatus
  app.on('will-quit', stopAi)
  void killLeftover()
}

/** If Studyhall crashed while the AI was awake, its server may still be holding the graphics card. */
async function killLeftover(): Promise<void> {
  const pid = Number((await readFile(PID_FILE(), 'utf8').catch(() => '')).trim())
  if (!pid) return
  execFile('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { windowsHide: true }, (_e, out) => {
    if (/llama-server.exe/i.test(String(out))) {
      try {
        process.kill(pid)
      } catch {
        /* already gone */
      }
    }
  })
  await rm(PID_FILE(), { force: true })
}

export async function aiStatus(): Promise<AiStatus> {
  return { installed: await installed(), downloading, progress: downloading ? Math.min(1, got / total) : 0, sizeMb: Math.round((MODEL_BYTES + SERVER_BYTES_GUESS) / 1e6), error, running: !!proc && port > 0 }
}
const push = (): void => void aiStatus().then(notify)

/** Download to `dest`, resuming a half-finished .part file, counting bytes into `got`. */
async function fetchTo(url: string, dest: string, expected?: number): Promise<void> {
  await mkdir(dirname(dest), { recursive: true })
  const part = `${dest}.part`
  const have = (await stat(part).catch(() => null))?.size ?? 0
  const res = await fetch(url, { redirect: 'follow', headers: have ? { Range: `bytes=${have}-` } : {} })
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}) for ${basename(dest)}`)
  const resumed = res.status === 206
  got += resumed ? have : 0
  const out = createWriteStream(part, { flags: resumed ? 'a' : 'w' })
  let last = 0
  const reader = res.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    got += value.byteLength
    if (!out.write(value)) await new Promise<void>((r) => out.once('drain', () => r()))
    if (Date.now() - last > 400) {
      last = Date.now()
      push()
    }
  }
  await new Promise<void>((r, j) => out.end((e?: Error | null) => (e ? j(e) : r())))
  if (expected && (await stat(part)).size !== expected) throw new Error(`${basename(dest)} didn’t finish downloading. Try again to carry on where it stopped.`)
  await rename(part, dest)
}

/** The newest llama.cpp Windows build that uses the graphics card (Vulkan), else the plain one. */
async function serverZipUrl(): Promise<{ url: string; size: number }> {
  const res = await fetch('https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=12', { headers: { Accept: 'application/vnd.github+json' } })
  if (!res.ok) throw new Error(`Couldn’t look up the AI program (${res.status})`)
  const releases = (await res.json()) as { assets: { name: string; browser_download_url: string; size: number }[] }[]
  for (const pattern of [/-bin-win-vulkan-x64\.zip$/, /-bin-win-cpu-x64\.zip$/]) {
    for (const r of releases) {
      const a = r.assets.find((x) => pattern.test(x.name))
      if (a) return { url: a.browser_download_url, size: a.size }
    }
  }
  throw new Error('Couldn’t find the AI program for Windows')
}

export async function downloadAi(): Promise<AiStatus> {
  if (downloading || (await installed())) return aiStatus()
  downloading = true
  error = null
  got = 0
  push()
  try {
    if (!(await exists(SERVER_EXE()))) {
      const { url, size } = await serverZipUrl()
      total = MODEL_BYTES + size
      const zipPath = join(AI_DIR(), 'llama.zip')
      await rm(`${zipPath}.part`, { force: true })
      await fetchTo(url, zipPath, size)
      const zip = await JSZip.loadAsync(await readFile(zipPath))
      await rm(SERVER_DIR(), { recursive: true, force: true })
      await mkdir(SERVER_DIR(), { recursive: true })
      for (const f of Object.values(zip.files)) {
        if (f.dir) continue
        await writeFile(join(SERVER_DIR(), basename(f.name)), await f.async('nodebuffer'))
      }
      await rm(zipPath, { force: true })
      if (!(await exists(SERVER_EXE()))) throw new Error('The AI program download looks incomplete')
    } else got += SERVER_BYTES_GUESS
    if (!(await installed())) await fetchTo(MODEL_URL, MODEL(), MODEL_BYTES)
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  } finally {
    downloading = false
    push()
  }
  return aiStatus()
}

export async function removeAi(): Promise<AiStatus> {
  stopAi()
  await rm(AI_DIR(), { recursive: true, force: true })
  push()
  return aiStatus()
}

// ---------- The server ----------

let device: string | null | undefined
/** The best graphics chip: a proper card (NVIDIA, Radeon RX, Arc) over the built-in one; most memory wins. */
async function pickDevice(): Promise<string | null> {
  if (device !== undefined) return device
  const out = await new Promise<string>((resolve) => {
    execFile(SERVER_EXE(), ['--list-devices'], { cwd: SERVER_DIR(), windowsHide: true, timeout: 20_000 }, (_e, stdout, stderr) => resolve(`${stdout}\n${stderr}`))
  })
  const devs = [...out.matchAll(/^\s*(\w+\d+):\s*(.+?)\s*\((\d+) MiB/gm)].map((m) => ({ id: m[1], name: m[2], mib: Number(m[3]) }))
  const real = (n: string): boolean => /nvidia|geforce|rtx|gtx|radeon\s+rx|\barc\b/i.test(n)
  devs.sort((a, b) => Number(real(b.name)) - Number(real(a.name)) || b.mib - a.mib)
  device = devs[0]?.id ?? null
  return device
}

const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const s = createServer()
    s.once('error', reject)
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port
      s.close(() => resolve(p))
    })
  })

export function stopAi(): void {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = null
  proc?.kill()
  proc = null
  port = 0
  starting = null
}

function touch(): void {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(stopAi, IDLE_MS)
}

/** Start the server (if it isn't already) and wait until it's ready. Returns its port. */
export async function warmAi(): Promise<number> {
  if (proc && port) {
    touch()
    return port
  }
  if (starting) return starting
  starting = (async () => {
    if (!(await installed())) throw new Error('Bauer’s brain isn’t downloaded yet (Settings → Voice)')
    const p = await freePort()
    const dev = await pickDevice()
    // One conversation at a time (-np 1) keeps it fast; on laptops with two graphics chips, use the real one.
    const args = ['-m', MODEL(), '--host', '127.0.0.1', '--port', String(p), '-c', '8192', '-np', '1', '-ngl', '99', ...(dev ? ['--device', dev] : [])]
    const child = spawn(SERVER_EXE(), args, {
      cwd: SERVER_DIR(),
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe']
    })
    let log = ''
    child.stderr?.on('data', (d: Buffer) => (log = (log + d.toString()).slice(-4000)))
    child.on('exit', () => {
      if (proc === child) {
        proc = null
        port = 0
        starting = null
        push()
      }
    })
    proc = child
    void writeFile(PID_FILE(), String(child.pid ?? '')).catch(() => {})
    const until = Date.now() + 120_000
    for (;;) {
      if (child.exitCode != null) throw new Error(`The AI stopped while starting: ${log.split('\n').filter(Boolean).slice(-2).join(' ')}`)
      const ok = await fetch(`http://127.0.0.1:${p}/health`)
        .then((r) => r.ok)
        .catch(() => false)
      if (ok) break
      if (Date.now() > until) {
        child.kill()
        throw new Error('The AI took too long to start')
      }
      await new Promise((r) => setTimeout(r, 500))
    }
    port = p
    touch()
    push()
    return p
  })()
  try {
    return await starting
  } catch (e) {
    stopAi()
    throw e
  } finally {
    starting = null
  }
}

/** One chat turn. With a JSON schema the answer is guaranteed to match it. */
export async function aiChat(messages: { role: 'system' | 'user' | 'assistant'; content: string }[], schema?: object): Promise<string> {
  const p = await warmAi()
  const body: Record<string, unknown> = { messages, temperature: 0.2, max_tokens: 900 }
  if (schema) body.response_format = { type: 'json_schema', json_schema: { name: 'bauer', schema, strict: true } }
  const res = await fetch(`http://127.0.0.1:${p}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`The AI couldn’t answer (${res.status}): ${(await res.text()).slice(0, 200)}`)
  const data = (await res.json()) as { choices: { message: { content: string } }[] }
  touch()
  return data.choices[0]?.message?.content ?? ''
}

