// A lesson recorded in the browser (MediaRecorder) is a WebM file without its length in it, so most players can't
// skip around in it, and some won't open it. This writes the length in: a Duration element added to the file's Info
// section (the file is copied once, with the slightly bigger Info). Free, no extra programs.

import { createReadStream, createWriteStream } from 'node:fs'
import { open, rename, unlink } from 'node:fs/promises'

const SEGMENT = 0x18538067
const INFO = 0x1549a966
const DURATION = 0x4489
const TIMECODE_SCALE = 0x2ad7b1

/** An EBML number at pos: its length in bytes and its value (marker bit kept for ids, dropped for sizes). */
function vint(b: Buffer, pos: number, id = false): { len: number; value: number; unknown: boolean } | null {
  const first = b[pos]
  if (first === undefined || first === 0) return null
  let len = 1
  while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++
  if (len > 8 || pos + len > b.length) return null
  let value = id ? first : first & (0xff >> len)
  let allOnes = value === 0xff >> len
  for (let i = 1; i < len; i++) {
    value = value * 256 + b[pos + i]
    if (b[pos + i] !== 0xff) allOnes = false
  }
  return { len, value, unknown: !id && allOnes }
}
/** A size written in 8 bytes (always fits, and keeps it simple). */
function size8(n: number): Buffer {
  const out = Buffer.alloc(8)
  out[0] = 0x01
  let v = n
  for (let i = 7; i >= 1; i--) {
    out[i] = v % 256
    v = Math.floor(v / 256)
  }
  return out
}

/** Writes how long the recording is (ms) into the WebM file. False when the file isn't laid out as expected (it's left
 *  as it was). */
export async function fixWebmDuration(file: string, ms: number): Promise<boolean> {
  const fh = await open(file, 'r')
  const head = Buffer.alloc(256 * 1024)
  const { bytesRead } = await fh.read(head, 0, head.length, 0)
  await fh.close()
  const b = head.subarray(0, bytesRead)
  // The EBML header, then the Segment.
  const h = vint(b, 0, true)
  const hs = h && vint(b, h.len)
  if (!h || !hs || h.value !== 0x1a45dfa3) return false
  let pos = h.len + hs.len + hs.value
  const seg = vint(b, pos, true)
  const segSize = seg && vint(b, pos + seg.len)
  if (!seg || !segSize || seg.value !== SEGMENT) return false
  const segSizeAt = pos + seg.len
  pos = segSizeAt + segSize.len
  // The Info section, the first thing (or nearly) in the Segment.
  while (pos < b.length) {
    const id = vint(b, pos, true)
    const sz = id && vint(b, pos + id.len)
    if (!id || !sz) return false
    const dataAt = pos + id.len + sz.len
    if (id.value === INFO) {
      if (dataAt + sz.value > b.length) return false
      const info = b.subarray(dataAt, dataAt + sz.value)
      let scale = 1_000_000
      let p = 0
      while (p < info.length) {
        const cid = vint(info, p, true)
        const csz = cid && vint(info, p + cid.len)
        if (!cid || !csz) return false
        const at = p + cid.len + csz.len
        if (cid.value === DURATION) return true // it already has one
        if (cid.value === TIMECODE_SCALE) {
          scale = 0
          for (let i = 0; i < csz.value; i++) scale = scale * 256 + info[at + i]
        }
        p = at + csz.value
      }
      const dur = Buffer.alloc(11)
      dur[0] = 0x44
      dur[1] = 0x89
      dur[2] = 0x88 // 8 bytes follow
      dur.writeDoubleBE((ms * 1_000_000) / (scale || 1_000_000), 3)
      const newInfo = Buffer.concat([b.subarray(pos, pos + id.len), size8(info.length + dur.length), info, dur])
      const grew = newInfo.length - (dataAt + sz.value - pos)
      const before = Buffer.from(b.subarray(0, pos))
      // A Segment of known size grows by as much (MediaRecorder's is "unknown", which stays as it is).
      if (!segSize.unknown) {
        const n = segSize.value + grew
        if (n >= 2 ** (7 * segSize.len) - 1) return false
        let v = n
        for (let i = segSize.len - 1; i >= 0; i--) {
          before[segSizeAt + i] = v % 256
          v = Math.floor(v / 256)
        }
        before[segSizeAt] |= 0x80 >> (segSize.len - 1)
      }
      const tmp = `${file}.part`
      await new Promise<void>((resolve, reject) => {
        const w = createWriteStream(tmp)
        w.on('error', reject)
        w.write(before)
        w.write(newInfo)
        const r = createReadStream(file, { start: dataAt + sz.value })
        r.on('error', reject)
        r.pipe(w)
        w.on('finish', () => resolve())
      }).catch(async (e) => {
        await unlink(tmp).catch(() => {})
        throw e
      })
      await rename(tmp, file)
      return true
    }
    if (sz.unknown) return false
    pos = dataAt + sz.value
  }
  return false
}
