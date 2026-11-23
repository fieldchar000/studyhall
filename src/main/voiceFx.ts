// Nova's Jarvis voice: a voice of its own blended from Kokoro's British men, and a finish on the finished audio.
// Both leave the words alone: what's said (and how each word is pronounced, speakable.ts and Kokoro's word lists) is
// decided before any of this, so every pronunciation fix still holds.
// • The blend: Kokoro keeps each voice as a "style" (510 × 256 numbers). A weighted mix of George, Fable and Lewis is
//   a new, calmer voice that is none of them. It's written into a copy of the voices file, in a slot no English voice
//   uses, so the original file stays as downloaded.
// • The finish: a little lower (spoken a touch faster, then stretched back to the same length, which lowers the
//   pitch), warmth and presence (filters), even loudness (a gentle compressor) and a faint room (a few short echoes).
import { existsSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const STYLE = 510 * 256 // numbers in one voice's style
/** The slot the blended voice goes in (the last voice in the file, a Chinese one no English setting offers). */
export const BLEND_SLOT = 53
// Kokoro's British men, by slot.
const BRITISH = { bm_daniel: 24, bm_fable: 25, bm_george: 26, bm_lewis: 27 } as const
/** The mix (by weight). */
export const BLENDS: Record<string, Partial<Record<keyof typeof BRITISH, number>>> = {
  jarvis: { bm_george: 0.5, bm_fable: 0.3, bm_lewis: 0.2 },
  jarvis_deep: { bm_george: 0.45, bm_lewis: 0.4, bm_daniel: 0.15 },
  jarvis_crisp: { bm_fable: 0.5, bm_george: 0.35, bm_daniel: 0.15 }
}

/** The voices file with the blend in it (made once, beside the original); the original's path if it can't be made. */
export async function blendedVoices(dir: string, blend = 'jarvis'): Promise<string> {
  const src = join(dir, 'voices.bin')
  const out = join(dir, `voices-${blend}.bin`)
  if (existsSync(out)) return out
  try {
    const buf = await readFile(src)
    const all = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
    if (all.length < (BLEND_SLOT + 1) * STYLE) return src
    const mix = new Float32Array(STYLE)
    const w = BLENDS[blend] ?? BLENDS.jarvis
    const total = Object.values(w).reduce((a, b) => a + (b ?? 0), 0) || 1
    for (const [name, weight] of Object.entries(w)) {
      const at = BRITISH[name as keyof typeof BRITISH] * STYLE
      for (let i = 0; i < STYLE; i++) mix[i] += (all[at + i] * (weight ?? 0)) / total
    }
    const copy = new Float32Array(all)
    copy.set(mix, BLEND_SLOT * STYLE)
    await writeFile(out, Buffer.from(copy.buffer))
    // (only the mix in use is kept: the others are 28 MB each)
    for (const other of Object.keys(BLENDS)) if (other !== blend) await rm(join(dir, `voices-${other}.bin`), { force: true }).catch(() => {})
    return out
  } catch (e) {
    console.warn('Nova voice blend:', e)
    return src
  }
}

// ---------- The finish ----------

/** How much faster it's spoken before being stretched back (1.06 ≈ one semitone lower). */
export const LOWER = 1.06

type Biquad = { b0: number; b1: number; b2: number; a1: number; a2: number }
// (the usual audio-EQ cookbook filters)
function biquad(kind: 'highpass' | 'lowshelf' | 'peak' | 'highshelf' | 'lowpass', f: number, sr: number, gainDb = 0, q = 0.707): Biquad {
  const A = Math.pow(10, gainDb / 40)
  const w = (2 * Math.PI * f) / sr
  const cos = Math.cos(w)
  const sin = Math.sin(w)
  const alpha = sin / (2 * q)
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number
  if (kind === 'highpass' || kind === 'lowpass') {
    const s = kind === 'highpass' ? 1 : -1
    b0 = (1 + s * cos) / 2
    b1 = -s * (1 + s * cos)
    b2 = b0
    a0 = 1 + alpha
    a1 = -2 * cos
    a2 = 1 - alpha
  } else if (kind === 'peak') {
    b0 = 1 + alpha * A
    b1 = -2 * cos
    b2 = 1 - alpha * A
    a0 = 1 + alpha / A
    a1 = -2 * cos
    a2 = 1 - alpha / A
  } else {
    const s = kind === 'lowshelf' ? -1 : 1
    const r = 2 * Math.sqrt(A) * alpha
    b0 = A * (A + 1 + s * (A - 1) * cos + r)
    b1 = -2 * s * A * (A - 1 + s * (A + 1) * cos)
    b2 = A * (A + 1 + s * (A - 1) * cos - r)
    a0 = A + 1 - s * (A - 1) * cos + r
    a1 = 2 * s * (A - 1 - s * (A + 1) * cos)
    a2 = A + 1 - s * (A - 1) * cos - r
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 }
}
function filter(x: Float32Array, c: Biquad): Float32Array {
  const y = new Float32Array(x.length)
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0
  for (let i = 0; i < x.length; i++) {
    const v = c.b0 * x[i] + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2
    x2 = x1
    x1 = x[i]
    y2 = y1
    y1 = v
    y[i] = v
  }
  return y
}
/** Stretched by a factor (longer, and lower). */
function stretch(x: Float32Array, k: number): Float32Array {
  const y = new Float32Array(Math.floor(x.length * k))
  for (let i = 0; i < y.length; i++) {
    const p = i / k
    const j = Math.floor(p)
    const t = p - j
    y[i] = (x[j] ?? 0) * (1 - t) + (x[j + 1] ?? 0) * t
  }
  return y
}
/** Even loudness: quiet syllables come up, loud ones don't jump out. */
function compress(x: Float32Array, sr: number, thresholdDb = -20, ratio = 3): Float32Array {
  const y = new Float32Array(x.length)
  const att = Math.exp(-1 / (0.005 * sr))
  const rel = Math.exp(-1 / (0.09 * sr))
  let env = 0
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i])
    env = a > env ? att * env + (1 - att) * a : rel * env + (1 - rel) * a
    const db = 20 * Math.log10(env + 1e-9)
    const over = db - thresholdDb
    const gain = over > 0 ? Math.pow(10, (-over * (1 - 1 / ratio)) / 20) : 1
    y[i] = x[i] * gain
  }
  return y
}
/** A faint room: a few short, darker echoes, as if it were speaking in the room rather than in your ear. */
function room(x: Float32Array, sr: number, wet = 0.16): Float32Array {
  const dark = filter(x, biquad('lowpass', 3500, sr))
  const taps: [number, number][] = [
    [0.011, 0.5],
    [0.017, 0.38],
    [0.024, 0.3],
    [0.033, 0.22],
    [0.045, 0.15],
    [0.061, 0.1]
  ]
  const y = new Float32Array(x.length + Math.round(0.07 * sr))
  y.set(x)
  for (const [t, g] of taps) {
    const d = Math.round(t * sr)
    for (let i = 0; i < dark.length; i++) y[i + d] += dark[i] * g * wet
  }
  return y
}

/** The Jarvis finish on a piece of speech (spoken LOWER times faster than wanted): the same length, a little lower,
 *  warmer and clearer, even, and in the room. */
export function jarvisFinish(samples: Float32Array, sr: number): Float32Array {
  let x = stretch(samples, LOWER)
  x = filter(x, biquad('highpass', 75, sr))
  x = filter(x, biquad('lowshelf', 170, sr, 2.5))
  x = filter(x, biquad('peak', 450, sr, -1.5, 1))
  x = filter(x, biquad('peak', 3200, sr, 2.5, 0.9))
  x = filter(x, biquad('highshelf', 8000, sr, 1.5))
  x = compress(x, sr)
  x = room(x, sr)
  // As loud as the voice was before (the other voices stay level with it), never clipping.
  const rms = (a: Float32Array): number => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / Math.max(1, a.length))
  let g = rms(x) > 0 ? rms(samples) / rms(x) : 1
  let peak = 0
  for (const v of x) peak = Math.max(peak, Math.abs(v) * g)
  if (peak > 0.95) g *= 0.95 / peak
  for (let i = 0; i < x.length; i++) x[i] *= g
  return x
}
