// node:crypto on the phone: random ids and the two hashes the app uses (SHA-1 for feed item
// ids, SHA-256 for file fingerprints). Synchronous, like Node's, so the shared code runs as-is.

export const randomUUID = (): string => crypto.randomUUID()

type Bytes = Uint8Array

function toBytes(data: string | Bytes | ArrayBuffer): Bytes {
  if (typeof data === 'string') return new TextEncoder().encode(data)
  return data instanceof Uint8Array ? data : new Uint8Array(data)
}

const rotl = (x: number, n: number): number => (x << n) | (x >>> (32 - n))
const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n))

/** Pad a message the way SHA-1 and SHA-256 both do: 0x80, zeros, 64-bit big-endian bit length. */
function pad(msg: Bytes): DataView {
  const len = msg.length
  const total = Math.ceil((len + 9) / 64) * 64
  const buf = new Uint8Array(total)
  buf.set(msg)
  buf[len] = 0x80
  const view = new DataView(buf.buffer)
  const bits = len * 8
  view.setUint32(total - 8, Math.floor(bits / 0x100000000))
  view.setUint32(total - 4, bits >>> 0)
  return view
}

function sha1(msg: Bytes): Bytes {
  const v = pad(msg)
  let h0 = 0x67452301,
    h1 = 0xefcdab89,
    h2 = 0x98badcfe,
    h3 = 0x10325476,
    h4 = 0xc3d2e1f0
  const w = new Uint32Array(80)
  for (let off = 0; off < v.byteLength; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = v.getUint32(off + i * 4)
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1)
    let a = h0,
      b = h1,
      c = h2,
      d = h3,
      e = h4
    for (let i = 0; i < 80; i++) {
      const [f, k] = i < 20 ? [(b & c) | (~b & d), 0x5a827999] : i < 40 ? [b ^ c ^ d, 0x6ed9eba1] : i < 60 ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc] : [b ^ c ^ d, 0xca62c1d6]
      const t = (rotl(a, 5) + f + e + k + w[i]) | 0
      e = d
      d = c
      c = rotl(b, 30)
      b = a
      a = t
    }
    h0 = (h0 + a) | 0
    h1 = (h1 + b) | 0
    h2 = (h2 + c) | 0
    h3 = (h3 + d) | 0
    h4 = (h4 + e) | 0
  }
  const out = new DataView(new ArrayBuffer(20))
  ;[h0, h1, h2, h3, h4].forEach((h, i) => out.setUint32(i * 4, h >>> 0))
  return new Uint8Array(out.buffer)
}

const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
])

function sha256(msg: Bytes): Bytes {
  const v = pad(msg)
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  const w = new Uint32Array(64)
  for (let off = 0; off < v.byteLength; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = v.getUint32(off + i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0
    }
    let [a, b, c, d, e, f, g, hh] = h
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (hh + S1 + ch + K256[i] + w[i]) | 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) | 0
      hh = g
      g = f
      f = e
      e = (d + t1) | 0
      d = c
      c = b
      b = a
      a = (t1 + t2) | 0
    }
    h[0] += a
    h[1] += b
    h[2] += c
    h[3] += d
    h[4] += e
    h[5] += f
    h[6] += g
    h[7] += hh
  }
  const out = new DataView(new ArrayBuffer(32))
  h.forEach((x, i) => out.setUint32(i * 4, x))
  return new Uint8Array(out.buffer)
}

const hex = (b: Bytes): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')

class Hash {
  private parts: Bytes[] = []
  constructor(private alg: string) {
    if (alg !== 'sha1' && alg !== 'sha256') throw new Error(`Hash ${alg} is not available on the phone`)
  }
  update(data: string | Bytes | ArrayBuffer): this {
    this.parts.push(toBytes(data))
    return this
  }
  digest(enc?: 'hex' | 'base64'): string {
    const size = this.parts.reduce((n, p) => n + p.length, 0)
    const all = new Uint8Array(size)
    let o = 0
    for (const p of this.parts) {
      all.set(p, o)
      o += p.length
    }
    const d = this.alg === 'sha1' ? sha1(all) : sha256(all)
    return enc === 'base64' ? btoa(String.fromCharCode(...d)) : hex(d)
  }
}

export const createHash = (alg: string): Hash => new Hash(alg)
export default { randomUUID, createHash }

/** Random bytes, as a Buffer-like Uint8Array with Node's toString('hex' | 'base64'). */
export function randomBytes(n: number): Uint8Array & { toString(enc?: string): string } {
  const b = crypto.getRandomValues(new Uint8Array(n)) as Uint8Array & { toString(enc?: string): string }
  b.toString = (enc?: string) => {
    if (enc !== 'base64' && enc !== 'base64url') return hex(b)
    const s = btoa(String.fromCharCode(...b))
    return enc === 'base64' ? s : s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }
  return b
}
