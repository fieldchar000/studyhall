// Nova talking with its own voice (Kokoro, made on this PC by the main process).
// Text is spoken a sentence at a time: the next sentence is made while this one plays,
// so Nova starts talking almost at once. Starting to talk to Nova (or Esc) stops it.

import { api } from '@/lib/data'

let generation = 0
let ctx: AudioContext | null = null
let current: AudioBufferSourceNode | null = null
let speaking = false
const listeners = new Set<(on: boolean) => void>()

/** Is Nova talking right now? (The wake word ignores the microphone meanwhile, so Nova never wakes itself.) */
export const isSpeaking = (): boolean => speaking
export function onSpeaking(cb: (on: boolean) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
function setSpeaking(on: boolean): void {
  if (speaking === on) return
  speaking = on
  listeners.forEach((l) => l(on))
}

/** Pieces that sound natural on their own (split at sentence ends and commas), growing in size:
 *  the voice makes speech ~3.5× faster than it plays, so a piece up to ~3× longer than the one
 *  playing is always ready in time, with no gaps. The first piece is short, so Nova starts at once. */
export function pieces(text: string): string[] {
  const clean = text
    .replace(/[*_#`>]+/g, ' ') // no markdown read out loud
    .replace(/\s+/g, ' ')
    .trim()
  if (!clean) return []
  // Clauses: sentences, then commas/semicolons inside long ones (punctuation kept).
  const clauses: string[] = []
  for (const s of clean.split(/(?<=[.!?…])\s+/)) {
    if (s.length <= 60) clauses.push(s)
    else clauses.push(...s.split(/(?<=[,;:])\s+/))
  }
  // Very long clauses (no commas) are cut at a word.
  const atoms: string[] = []
  for (const c of clauses) {
    let rest = c
    while (rest.length > 160) {
      const at = rest.lastIndexOf(' ', 150)
      atoms.push(rest.slice(0, at > 40 ? at : 150).trim())
      rest = rest.slice(at > 40 ? at : 150).trim()
    }
    if (rest) atoms.push(rest)
  }
  const out: string[] = []
  let cur = ''
  for (const a of atoms) {
    const limit = Math.min(160, Math.max(30, 3 * (out[out.length - 1]?.length ?? 10)))
    if (cur && cur.length + 1 + a.length > limit) {
      out.push(cur)
      cur = a
    } else cur = cur ? `${cur} ${a}` : a
  }
  if (cur) out.push(cur)
  return out
}

function play(samples: Float32Array, sampleRate: number, gen: number): Promise<void> {
  return new Promise((resolve) => {
    if (gen !== generation || !samples.length) return resolve()
    ctx ??= new AudioContext()
    const buf = ctx.createBuffer(1, samples.length, sampleRate)
    buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    src.onended = () => resolve()
    current = src
    src.start()
  })
}

/** Say this with Nova's voice. Returns false if the voice isn't installed (so the caller can fall back). */
export async function speak(text: string, voice?: string, speed?: number): Promise<boolean> {
  const parts = pieces(text)
  if (!parts.length) return true
  try {
    if (!(await api.mouth.status()).installed) return false
  } catch {
    return false // the pad has no Kokoro voice
  }
  stopSpeaking()
  const gen = ++generation
  setSpeaking(true)
  try {
    let next = api.mouth.speak(parts[0], voice, speed)
    for (let i = 0; i < parts.length; i++) {
      const audio = await next
      if (gen !== generation) return true
      if (i + 1 < parts.length) next = api.mouth.speak(parts[i + 1], voice, speed)
      await play(audio.samples, audio.sampleRate, gen)
      if (gen !== generation) return true
    }
  } catch (e) {
    console.warn('Nova voice:', e)
  } finally {
    if (gen === generation) setSpeaking(false)
  }
  return true
}

/** Stop talking now. */
export function stopSpeaking(): void {
  generation++
  try {
    current?.stop()
  } catch {
    /* already stopped */
  }
  current = null
  setSpeaking(false)
}
