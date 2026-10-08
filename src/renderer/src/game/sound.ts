// Tiny 8-bit sound effects made with the Web Audio API (no audio files).

let ctx: AudioContext | null = null
let muted = (() => {
  try {
    return localStorage.getItem('pq-muted') === '1'
  } catch {
    return false
  }
})()

export const isMuted = (): boolean => muted
export function setMuted(m: boolean): void {
  muted = m
  try {
    localStorage.setItem('pq-muted', m ? '1' : '0')
  } catch {
    /* private mode */
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'square', vol = 0.05, slideTo?: number): void {
  if (muted) return
  ctx ??= new AudioContext()
  const t = ctx.currentTime + start
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
  gain.gain.setValueAtTime(vol, t)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(gain).connect(ctx.destination)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

export const sfx = {
  tap: () => tone(520 + Math.random() * 80, 0, 0.06, 'square', 0.03, 260),
  kill: () => {
    tone(988, 0, 0.06, 'square', 0.035)
    tone(1319, 0.06, 0.1, 'square', 0.035)
  },
  level: () => [523, 659, 784].forEach((f, i) => tone(f, i * 0.05, 0.07, 'square', 0.03)),
  stage: () => [392, 523].forEach((f, i) => tone(f, i * 0.08, 0.1, 'triangle', 0.06)),
  bossStart: () => [196, 185, 175, 165].forEach((f, i) => tone(f, i * 0.12, 0.14, 'sawtooth', 0.04)),
  win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.12, 'square', 0.04)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, i * 0.12, 0.16, 'triangle', 0.06)),
  summon: () => tone(200, 0, 0.6, 'sawtooth', 0.03, 900),
  reveal: (rarity: number) => {
    const notes = rarity >= 4 ? [523, 659, 784, 1047, 1319, 1568] : rarity === 3 ? [523, 659, 784, 1047] : rarity === 2 ? [523, 784] : [440]
    notes.forEach((f, i) => tone(f, i * 0.06, 0.1, rarity >= 3 ? 'square' : 'triangle', 0.04))
  },
  error: () => tone(160, 0, 0.15, 'square', 0.04)
}
