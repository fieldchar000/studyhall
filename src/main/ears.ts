// Nova's ears on the PC (free, offline, nothing leaves this computer):
//  • sherpa-onnx (Apache-2.0): the speech toolkit, a native add-on from npm (sherpa-onnx-win-x64).
//  • Parakeet TDT 0.6B v3 (NVIDIA, CC-BY-4.0): writes down what you say, with punctuation (~0.3 s).
//  • A 3 MB keyword spotter (zipformer, GigaSpeech): listens for "Hey <name>" all the time, cheaply.
// Everything is downloaded once into Studyhall's folder and checked against published fingerprints.

import { app, type WebContents } from 'electron'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import type { EarsStatus, NovaName } from '@shared/types'

const DIR = (): string => join(app.getPath('userData'), 'nova', 'ears')
const GH = 'https://github.com/k2-fsa/sherpa-onnx/releases/download'
const PARTS = [
  {
    key: 'addon',
    url: 'https://registry.npmjs.org/sherpa-onnx-win-x64/-/sherpa-onnx-win-x64-2.0.1.tgz',
    hash: 'sha512-7vwdAw9PGEb0JLSpK7UFxAdp1vabBHK9Nhw2jFRBWSFgtslUPHIB0T6syJfRgiUGyCeNW9fJvcFAk2F2u7hBEw==',
    bytes: 9_500_000,
    unpack: ['-xzf'],
    inside: 'package'
  },
  {
    key: 'kws',
    url: `${GH}/kws-models/sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01.tar.bz2`,
    hash: 'sha256:f170013b4716e41b62b9bfd809687c207cef798ef9bc6534d524e17af9b6561a',
    bytes: 17_626_723,
    unpack: ['-xjf'],
    inside: 'sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01'
  },
  {
    key: 'parakeet',
    url: `${GH}/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2`,
    hash: 'sha256:1495e91b59d7fc53ddca91f3431758ec99f8fa253fdb0e1e851be0f72b14b0f9',
    bytes: 487_211_443,
    unpack: ['-xjf'],
    inside: 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8'
  }
] as const
const SIZE_MB = Math.round(PARTS.reduce((n, p) => n + p.bytes, 0) / 1e6)
const partDir = (key: string): string => join(DIR(), key)
const READY = (): string => join(DIR(), 'ready.json')

// "Hey <name>" as the keyword spotter's word pieces (made with the model's own bpe.model).
const WAKE: Record<NovaName, string[]> = {
  Nova: ['▁HE Y ▁NO V A', '▁HI ▁NO V A', '▁OKAY ▁NO V A'],
  Atlas: ['▁HE Y ▁AT LA S', '▁HI ▁AT LA S', '▁OKAY ▁AT LA S'],
  Onyx: ['▁HE Y ▁ON Y X', '▁HI ▁ON Y X', '▁OKAY ▁ON Y X'],
  Bauer: ['▁HE Y ▁BA U ER', '▁HI ▁BA U ER', '▁OKAY ▁BA U ER']
}

const exists = async (p: string): Promise<boolean> => !!(await stat(p).catch(() => null))

let state: EarsStatus = { installed: false, downloading: false, progress: 0, sizeMb: SIZE_MB, error: null }
let onStatus: (s: EarsStatus) => void = () => {}
export function configureEars(cb: (s: EarsStatus) => void): void {
  onStatus = cb
}
function set(patch: Partial<EarsStatus>): EarsStatus {
  state = { ...state, ...patch }
  onStatus(state)
  return state
}

export async function earsStatus(): Promise<EarsStatus> {
  state.installed = await exists(READY())
  return state
}

/** A download that must match its published fingerprint ("sha256:hex" or npm's "sha512-base64"). */
export async function fetchChecked(url: string, file: string, hash: string, bytes: number, done: number, total: number, onProgress: (p: number) => void): Promise<void> {
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`)
  const [algo, want] = hash.split(/[-:]/, 2) as ['sha256' | 'sha512', string]
  const h = createHash(algo)
  const ws = createWriteStream(file)
  let got = 0
  let last = 0
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    h.update(chunk)
    got += chunk.length
    if (!ws.write(chunk)) await new Promise<void>((r) => ws.once('drain', () => r()))
    if (Date.now() - last > 300) {
      last = Date.now()
      onProgress(Math.min(0.99, (done + Math.min(got, bytes)) / total))
    }
  }
  await new Promise<void>((r, j) => ws.end((e?: Error | null) => (e ? j(e) : r())))
  const got64 = h.digest(algo === 'sha512' ? 'base64' : 'hex')
  if (got64 !== want) throw new Error('A download didn’t match its published fingerprint, so it was thrown away. Try again.')
}

const untar = (args: readonly string[], file: string, to: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const t = spawn(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe'), [...args, file, '-C', to], { windowsHide: true })
    t.on('close', (c) => (c === 0 ? resolve() : reject(new Error('Couldn’t unpack a download'))))
    t.on('error', reject)
  })

export interface Part {
  key: string
  url: string
  hash: string
  bytes: number
  unpack: readonly string[]
  inside: string
  dest: () => string
}

/** The speech toolkit itself, shared by the ears and the voice. */
export const SHERPA_DIR = (): string => join(app.getPath('userData'), 'nova', 'sherpa')
export const ADDON_PART: Part = { ...PARTS[0], dest: SHERPA_DIR }

/** Download, check and unpack the parts that aren't there yet. */
export async function installParts(parts: Part[], tmp: string, onProgress: (p: number) => void): Promise<void> {
  await rm(tmp, { recursive: true, force: true })
  await mkdir(tmp, { recursive: true })
  try {
    const total = parts.reduce((n, p) => n + p.bytes, 0)
    let done = 0
    for (const p of parts) {
      const dest = p.dest()
      if (!(await exists(dest))) {
        const file = join(tmp, `${p.key}.download`)
        await fetchChecked(p.url, file, p.hash, p.bytes, done, total, onProgress)
        const out = join(tmp, p.key)
        await mkdir(out, { recursive: true })
        await untar(p.unpack, file, out)
        await rm(file, { force: true })
        await mkdir(join(dest, '..'), { recursive: true })
        await rename(join(out, p.inside), dest)
      }
      done += p.bytes
    }
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
}

/** Download the ears (once). */
export async function installEars(): Promise<EarsStatus> {
  if (state.downloading || (await exists(READY()))) return earsStatus()
  set({ downloading: true, progress: 0, error: null })
  const tmp = join(DIR(), 'download')
  try {
    await installParts(
      [ADDON_PART, ...PARTS.slice(1).map((p) => ({ ...p, dest: () => partDir(p.key) }))],
      tmp,
      (progress) => set({ progress })
    )
    // The model's own test recordings aren't needed.
    await rm(join(partDir('parakeet'), 'test_wavs'), { recursive: true, force: true }).catch(() => {})
    await rm(join(partDir('kws'), 'test_wavs'), { recursive: true, force: true }).catch(() => {})
    await writeFile(READY(), JSON.stringify({ at: new Date().toISOString() }))
    await rm(tmp, { recursive: true, force: true })
    return set({ downloading: false, progress: 1, installed: true })
  } catch (e) {
    await rm(tmp, { recursive: true, force: true }).catch(() => {})
    return set({ downloading: false, progress: 0, error: e instanceof Error ? e.message : String(e) })
  }
}

export async function removeEars(): Promise<EarsStatus> {
  unloadEars()
  await rm(DIR(), { recursive: true, force: true }).catch(() => {})
  return set({ installed: false, progress: 0 })
}

// ---------- Running ----------

type Addon = Record<string, (...a: unknown[]) => unknown>
let addon: Addon | null = null
let spotter: unknown = null
let spotStream: unknown = null
let spotKey = ''
let recognizer: unknown = null
let recognizerLoading: Promise<unknown> | null = null

/** The speech toolkit (in nova/sherpa; v0.31.0 kept it inside the ears folder). */
export function loadAddon(): Addon {
  if (!addon) {
    const req = createRequire(__filename)
    try {
      addon = req(join(SHERPA_DIR(), 'sherpa-onnx.node')) as Addon
    } catch {
      addon = req(join(partDir('addon'), 'sherpa-onnx.node')) as Addon
    }
  }
  return addon
}

/** Free the models (Studyhall closed to the tray, or ears removed). */
export function unloadEars(): void {
  spotter = null
  spotStream = null
  spotKey = ''
  recognizer = null
  recognizerLoading = null
}

/** The wake word listener for this name and sensitivity (0 strict … 100 eager). */
async function ensureSpotter(name: NovaName, sensitivity: number): Promise<boolean> {
  if (!state.installed && !(await earsStatus()).installed) return false
  const key = `${name}:${sensitivity}`
  if (spotter && spotKey === key) return true
  const a = loadAddon()
  const k = partDir('kws')
  const kwFile = join(DIR(), 'wake.txt')
  await writeFile(kwFile, (WAKE[name] ?? WAKE.Nova).map((t) => `${t} @${name.toUpperCase()}`).join('\n') + '\n')
  const s = Math.max(0, Math.min(100, sensitivity))
  spotter = a.createKeywordSpotter({
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      transducer: {
        encoder: join(k, 'encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx'),
        decoder: join(k, 'decoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx'),
        joiner: join(k, 'joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx')
      },
      tokens: join(k, 'tokens.txt'),
      numThreads: 1,
      provider: 'cpu',
      debug: 0
    },
    keywordsFile: kwFile,
    // Tested with "Hey/Hi/Okay <name>" against near misses ("supernova", "Hey, nobody…"):
    // the default (50) catches all three phrasings with no false wakes.
    keywordsScore: 1.15 + s / 200, // 1.15 strict … 1.65 eager
    keywordsThreshold: 0.28 - (s / 100) * 0.16, // 0.28 strict … 0.12 eager (0.20 at the default)
    maxActivePaths: 4,
    numTrailingBlanks: 1
  })
  spotStream = a.createKeywordStream(spotter)
  spotKey = key
  return true
}

let wakeTarget: WebContents | null = null
let lastWake = 0
/** A slice of microphone audio (16 kHz) from the listening window, while it waits for the wake word. */
export async function feedEars(sender: WebContents, samples: Float32Array, name: NovaName, sensitivity: number): Promise<void> {
  if (!(await ensureSpotter(name, sensitivity))) return
  wakeTarget = sender
  const a = addon!
  a.acceptWaveformOnline(spotStream, { samples, sampleRate: 16000 })
  while (a.isKeywordStreamReady(spotter, spotStream)) {
    a.decodeKeywordStream(spotter, spotStream)
    const r = JSON.parse(String(a.getKeywordResultAsJson(spotter, spotStream))) as { keyword?: string }
    if (r.keyword) {
      a.resetKeywordStream(spotter, spotStream)
      if (Date.now() - lastWake > 2500 && !wakeTarget.isDestroyed()) {
        lastWake = Date.now()
        wakeTarget.send('voice:command', { type: 'wake' })
      }
    }
  }
}

function loadRecognizer(): Promise<unknown> {
  if (recognizer) return Promise.resolve(recognizer)
  recognizerLoading ??= (async () => {
    const a = loadAddon()
    const p = partDir('parakeet')
    const t0 = Date.now()
    recognizer = await (a.createOfflineRecognizerAsync({
      featConfig: { sampleRate: 16000, featureDim: 80 },
      modelConfig: {
        transducer: { encoder: join(p, 'encoder.int8.onnx'), decoder: join(p, 'decoder.int8.onnx'), joiner: join(p, 'joiner.int8.onnx') },
        tokens: join(p, 'tokens.txt'),
        numThreads: 4,
        provider: 'cpu',
        debug: 0,
        modelType: 'nemo_transducer'
      }
    }) as Promise<unknown>)
    console.info(`Nova ears: Parakeet ready in ${Date.now() - t0} ms`)
    return recognizer
  })().catch((e) => {
    recognizerLoading = null
    throw e
  })
  return recognizerLoading
}

/** Get Parakeet ready while you talk. */
export function warmEars(): void {
  void earsStatus().then((s) => s.installed && loadRecognizer().catch(() => {}))
}

/** Write down a recording (16 kHz). */
export async function transcribeEars(samples: Float32Array): Promise<string> {
  const rec = await loadRecognizer()
  const a = addon!
  const t0 = Date.now()
  const stream = a.createOfflineStream(rec)
  a.acceptWaveformOffline(stream, { samples, sampleRate: 16000 })
  const r = JSON.parse(String(await (a.decodeOfflineStreamAsync(rec, stream) as Promise<string>))) as { text?: string }
  console.info(`Nova ears: ${(samples.length / 16000).toFixed(1)} s written down in ${Date.now() - t0} ms`)
  return (r.text ?? '').trim()
}
