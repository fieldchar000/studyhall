// Nova's voice on the PC: Kokoro (82M, Apache-2.0) through sherpa-onnx, free and offline.
// Downloaded once (fingerprint-checked); only the English files are kept (~340 MB).
// The full-precision model is used on purpose: on a PC processor it makes speech about 3.5× faster
// than it plays, where the smaller "int8" one barely keeps up.

import { app } from 'electron'
import { speakable } from './speakable'
import { readdir, rm, stat, writeFile } from 'node:fs/promises'
import { cpus } from 'node:os'
import { join } from 'node:path'
import type { EarsStatus } from '@shared/types'
import { ADDON_PART, installParts, loadAddon, type Part } from './ears'

const DIR = (): string => join(app.getPath('userData'), 'nova', 'voice')
const MODEL_DIR = (): string => join(DIR(), 'kokoro')
const READY = (): string => join(DIR(), 'ready.json')
const KOKORO: Part = {
  key: 'kokoro',
  url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-multi-lang-v1_0.tar.bz2',
  hash: 'sha256:60703707bc05ccd48d60e1eb723f38b07d6e474795a0b6a588d7220400e0f7a4',
  bytes: 349_886_476,
  unpack: ['-xjf'],
  inside: 'kokoro-multi-lang-v1_0',
  dest: MODEL_DIR
}
const SIZE_MB = 350

/** The English voices offered on the Nova page (Kokoro speaker ids). */
export const VOICES: Record<string, number> = {
  af_heart: 3,
  af_bella: 2,
  af_nova: 7,
  bf_emma: 21,
  bf_isabella: 22,
  bm_george: 26,
  bm_daniel: 24,
  am_michael: 16,
  am_onyx: 17
}

const exists = async (p: string): Promise<boolean> => !!(await stat(p).catch(() => null))
let state: EarsStatus = { installed: false, downloading: false, progress: 0, sizeMb: SIZE_MB, error: null }
let onStatus: (s: EarsStatus) => void = () => {}
export function configureMouth(cb: (s: EarsStatus) => void): void {
  onStatus = cb
}
function set(patch: Partial<EarsStatus>): EarsStatus {
  state = { ...state, ...patch }
  onStatus(state)
  return state
}

export async function mouthStatus(): Promise<EarsStatus> {
  state.installed = await exists(READY())
  return state
}

export async function installMouth(): Promise<EarsStatus> {
  if (state.downloading || (await exists(READY()))) return mouthStatus()
  set({ downloading: true, progress: 0, error: null })
  try {
    await installParts([ADDON_PART, KOKORO], join(DIR(), 'download'), (progress) => set({ progress }))
    // Keep only what English speech needs.
    const keep = new Set(['model.onnx', 'voices.bin', 'tokens.txt', 'lexicon-us-en.txt', 'lexicon-gb-en.txt', 'LICENSE'])
    for (const f of await readdir(MODEL_DIR())) if (!keep.has(f)) await rm(join(MODEL_DIR(), f), { recursive: true, force: true })
    await writeFile(READY(), JSON.stringify({ at: new Date().toISOString() }))
    return set({ downloading: false, progress: 1, installed: true })
  } catch (e) {
    return set({ downloading: false, progress: 0, error: e instanceof Error ? e.message : String(e) })
  }
}

export async function removeMouth(): Promise<EarsStatus> {
  unloadMouth()
  await rm(DIR(), { recursive: true, force: true }).catch(() => {})
  return set({ installed: false, progress: 0 })
}

let tts: unknown = null
let ttsLoading: Promise<unknown> | null = null
export function unloadMouth(): void {
  tts = null
  ttsLoading = null
}

function loadTts(): Promise<unknown> {
  if (tts) return Promise.resolve(tts)
  ttsLoading ??= (async () => {
    const a = loadAddon()
    const k = MODEL_DIR()
    const t0 = Date.now()
    tts = await (a.createOfflineTtsAsync({
      model: {
        kokoro: {
          model: join(k, 'model.onnx'),
          voices: join(k, 'voices.bin'),
          tokens: join(k, 'tokens.txt'),
          lexicon: `${join(k, 'lexicon-us-en.txt')},${join(k, 'lexicon-gb-en.txt')}`,
          lengthScale: 1.0
        },
        numThreads: Math.max(2, Math.min(8, Math.floor(cpus().length / 2))),
        provider: 'cpu',
        debug: 0
      },
      maxNumSentences: 1
    }) as Promise<unknown>)
    console.info(`Nova voice: Kokoro ready in ${Date.now() - t0} ms`)
    return tts
  })().catch((e) => {
    ttsLoading = null
    throw e
  })
  return ttsLoading
}

/** Get the voice ready (e.g. while Nova is thinking). */
export function warmMouth(): void {
  void mouthStatus().then((s) => s.installed && loadTts().catch(() => {}))
}

/** Speak one short piece of text. Returns the audio (24 kHz mono). */
export async function speakMouth(text: string, voice: string, speed: number): Promise<{ samples: Float32Array; sampleRate: number }> {
  const h = await loadTts()
  const a = loadAddon()
  const t0 = Date.now()
  const out = (await (a.offlineTtsGenerateAsync(h, {
    text: speakable(text).slice(0, 600), // (numbers, symbols and Greek letters said as words: see speakable.ts)
    sid: VOICES[voice] ?? VOICES.af_heart,
    speed: Math.max(0.7, Math.min(1.5, speed || 1)),
    enableExternalBuffer: false // (Electron doesn't allow the add-on's own buffers)
  }) as Promise<{ samples: Float32Array; sampleRate: number }>)) ?? { samples: new Float32Array(0), sampleRate: 24000 }
  console.info(`Nova voice: ${(out.samples.length / out.sampleRate).toFixed(1)} s of speech in ${Date.now() - t0} ms`)
  return { samples: new Float32Array(out.samples), sampleRate: out.sampleRate }
}
