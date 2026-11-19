// Nova talking with its own voice (Kokoro, made on this PC by the main process).
// Text is spoken a sentence at a time: the next sentence is made while this one plays,
// so Nova starts talking almost at once. Starting to talk to Nova (or Esc) stops it.

import { api } from '@/lib/data'

let generation = 0
let ctx: AudioContext | null = null
let tap: MediaStreamAudioDestinationNode | null = null
/** Nova's voice as a stream (tutor mode records it with the screen). */
export function voiceStream(): MediaStream {
  ctx ??= new AudioContext()
  tap ??= ctx.createMediaStreamDestination()
  return tap.stream
}
let current: AudioBufferSourceNode | null = null
let speaking = false
const listeners = new Set<(on: boolean) => void>()
// Loudness of what's playing, every 40 ms (for the orb's ripples).
const STEP_MS = 40
let envelope: number[] = []
let envelopeStart = 0
/** How loud Nova is right now (0..1). */
export function voiceLevelNow(): number {
  if (!speaking) return 0
  return envelope[Math.floor((performance.now() - envelopeStart) / STEP_MS)] ?? 0
}
/** The same, shaped like a React ref for <NovaOrb level={…} />. */
export const voiceLevelRef = {
  get current(): number {
    return voiceLevelNow()
  }
}
function loudness(samples: Float32Array, sampleRate: number): number[] {
  const n = Math.max(1, Math.round((sampleRate * STEP_MS) / 1000))
  const out: number[] = []
  for (let i = 0; i < samples.length; i += n) {
    let sum = 0
    const end = Math.min(samples.length, i + n)
    for (let j = i; j < end; j++) sum += samples[j] * samples[j]
    out.push(Math.min(1, Math.sqrt(sum / (end - i)) * 5))
  }
  return out
}

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

/** Nova's words in the bubble above the globe, shown as each piece starts playing (in step with the voice). */
function bubble(text: string, append: boolean, done = false): void {
  try {
    api.bauer.bubble('nova', text, { append, done })
  } catch {
    /* no floating globe here (the pad) */
  }
}

function play(samples: Float32Array, sampleRate: number, gen: number, text?: string, append = false): Promise<void> {
  return new Promise((resolve) => {
    if (gen !== generation || !samples.length) return resolve()
    if (text) bubble(text, append)
    ctx ??= new AudioContext()
    const buf = ctx.createBuffer(1, samples.length, sampleRate)
    buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    if (tap) src.connect(tap) // (tutor mode is recording: its voice goes into the video too)
    src.onended = () => resolve()
    current = src
    envelope = loudness(samples, sampleRate)
    envelopeStart = performance.now()
    try {
      api.bauer.voiceLevels(envelope) // the floating orb ripples along
    } catch {
      /* no floating orb here (the pad) */
    }
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
      await play(audio.samples, audio.sampleRate, gen, parts[i], i > 0)
      if (gen !== generation) return true
    }
  } catch (e) {
    console.warn('Nova voice:', e)
  } finally {
    if (gen === generation) {
      setSpeaking(false)
      bubble('', true, true)
    }
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
  envelope = []
  try {
    api.bauer.voiceLevels([])
  } catch {
    /* no floating orb here */
  }
  setSpeaking(false)
}

/** Say this and resolve when it has finished (live lessons wait for each sentence before the next). */
export async function speakAndWait(text: string, voice?: string, speed?: number): Promise<void> {
  if (await speak(text, voice, speed)) return
  // No Kokoro voice: the one built into Windows / Android, waiting for it to finish.
  await new Promise<void>((resolve) => {
    try {
      if (!('speechSynthesis' in window) || !text) return resolve()
      const u = new SpeechSynthesisUtterance(text)
      const v = speechSynthesis.getVoices().find((x) => /^en/i.test(x.lang))
      if (v) u.voice = v
      u.rate = 1.04
      u.onend = () => resolve()
      u.onerror = () => resolve()
      speechSynthesis.speak(u)
      setTimeout(resolve, 3000 + text.length * 90) // never wait forever
    } catch {
      resolve()
    }
  })
}

// ---------- Speaking while the reply is still being written (Nova's conversation) ----------
// Text arrives a few words at a time. Each finished sentence is turned into speech straight away and plays in order,
// so Nova starts talking about a second after you stop, not after the whole reply. Before something slow starts,
// a short "beat" ("One sec.") plays at once; beats are made once and kept, so they play instantly.

// Roamies' 34 beats (speaker.mjs, by Ken Kai, AGPL-3.0): one or two words each, so a beat never sounds canned; any of
// them fits before a search, a page, the screen or a drawing.
const BEATS = [
  'One sec.', 'On it.', 'Hang on.', 'Hold on.', 'Got it.', 'Okay.', 'Sure.', 'Right.', 'Alright.', 'Gotcha.',
  'Checking.', "Let's see.", 'Sure thing.', 'Coming up.', 'One moment.', 'Hmm, okay.', 'Got you.',
  'Roger.', 'Yep.', 'Two secs.', 'Hold tight.', 'Mm-hmm.', 'Will do.', 'Righto.',
  'Moment.', 'Okay, checking.', 'Sure, checking.', 'Okie-dokie.'
]
const RECENT = 8 // a beat isn't picked again until this many others have played
const beatAudio = new Map<string, { samples: Float32Array; sampleRate: number }>()
let beatsMaking = false
let recentBeats: string[] = []
/** Make the beats in Nova's voice once (in the background), so they can play the moment they're needed. */
export async function warmBeats(): Promise<void> {
  if (beatsMaking || beatAudio.size >= BEATS.length) return
  beatsMaking = true
  try {
    if (!(await api.mouth.status()).installed) return
    for (const b of BEATS) if (!beatAudio.has(b)) beatAudio.set(b, await api.mouth.speak(b))
  } catch {
    /* no voice here */
  } finally {
    beatsMaking = false
  }
}

export interface SpeechStream {
  push(text: string): void
  /** Something slow is starting and nothing has been said yet. */
  beat(): void
  /** No more text: resolves when everything has been said. */
  end(): Promise<void>
  /** Everything said so far (and still to say). */
  readonly text: string
}

/** Start speaking a reply that is still being written. fallback(text) is used without Nova's own voice. */
export function speechStream(fallback: (text: string) => void): SpeechStream {
  stopSpeaking()
  const gen = ++generation
  let buf = ''
  let all = ''
  let ended = false
  let said = false
  const queue: Promise<{ samples: Float32Array; sampleRate: number } | null>[] = []
  const texts: string[] = [] // what each queued piece says (for the bubble)
  let wake: (() => void) | null = null
  const voiceOk = api.mouth
    .status()
    .then((s) => s.installed)
    .catch(() => false)
  // "[look N]" cues arrive inside the text (⁣N⁣): the globe floats to mark N as the piece holding it starts playing.
  const looks: number[][] = []
  let lookNext: number[] = []
  const enqueue = (piece: string): void => {
    for (const m of piece.matchAll(/⁣(\d)⁣/g)) lookNext.push(Number(m[1]))
    const p = piece
      .replace(/⁣\d⁣/g, ' ')
      .replace(/[*_#`>]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!p || !/[\p{L}\p{N}]/u.test(p)) return
    said = true
    looks[texts.length] = lookNext
    lookNext = []
    texts.push(p)
    queue.push(voiceOk.then((ok) => (ok && gen === generation ? api.mouth.speak(p).catch(() => null) : null)))
    wake?.()
  }
  /** Cut off every finished sentence (and very long runs at a comma or space). */
  const cut = (final: boolean): void => {
    for (;;) {
      const m = /[.!?…]+["'”’)\]]*\s/.exec(buf)
      if (m) {
        enqueue(buf.slice(0, m.index + m[0].length))
        buf = buf.slice(m.index + m[0].length)
        continue
      }
      if (buf.length > 180) {
        const at = Math.max(buf.lastIndexOf(', ', 170), buf.lastIndexOf('; ', 170))
        const sp = at > 40 ? at + 1 : buf.lastIndexOf(' ', 170)
        if (sp > 20) {
          enqueue(buf.slice(0, sp))
          buf = buf.slice(sp)
          continue
        }
      }
      break
    }
    if (final && buf.trim()) {
      enqueue(buf)
      buf = ''
    }
  }
  // The player: plays each piece in order as soon as it (and the one before) is ready.
  const done = (async () => {
    setSpeaking(true)
    let i = 0
    let shown = 0
    try {
      for (;;) {
        if (gen !== generation) return
        if (i < queue.length) {
          const audio = await queue[i++]
          if (gen !== generation) return
          for (const n of looks[i - 1] ?? []) {
            try {
              api.bauer.lookMark(n)
            } catch {
              /* no floating globe here */
            }
          }
          if (audio) await play(audio.samples, audio.sampleRate, gen, texts[i - 1], shown++ > 0)
          continue
        }
        if (ended) return
        await new Promise<void>((r) => (wake = r))
        wake = null
      }
    } finally {
      if (gen === generation) {
        setSpeaking(false)
        if (shown) bubble('', true, true)
      }
    }
  })()
  return {
    push(t) {
      if (gen !== generation) return
      buf += t
      all += t
      cut(false)
    },
    beat() {
      if (said || gen !== generation) return
      said = true
      const options = BEATS.filter((b) => !recentBeats.includes(b) && beatAudio.has(b))
      const b = options[Math.floor(Math.random() * options.length)]
      if (!b) return
      recentBeats = [...recentBeats, b].slice(-RECENT)
      texts.push(b)
      queue.push(Promise.resolve(beatAudio.get(b)!))
      wake?.()
    },
    async end() {
      cut(true)
      ended = true
      wake?.()
      if (!(await voiceOk)) {
        if (all.trim() && gen === generation) fallback(all.trim())
        return
      }
      await done
    },
    get text() {
      return all
    }
  }
}
