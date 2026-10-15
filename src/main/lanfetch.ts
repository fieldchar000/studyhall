// Wi-Fi file sharing (the fetching side, e.g. your phone): finds your PC on the same network via
// your "devices" rows and downloads a stored file from it, if it's there. Requests are signed and
// replies decrypted with that PC's key (see lanshare.ts). Uses Web Crypto, so it runs on the
// phone too; net.fetch there is the phone's own HTTP (local addresses work without the browser).

import { net } from 'electron'
import type { Device } from '@shared/types'
import { getSetting, list } from './db'

const TIMEOUT_MS = 4000
let lastGood: string | null = null // "http://ip:port" that answered last time
let unreachableUntil = 0 // after a full miss, don't keep knocking for a minute

interface Peer {
  base: string
  key: Uint8Array
  name: string
}

const fromB64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const hex = (b: ArrayBuffer): string => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('')

/** Your other devices that share files over Wi-Fi, as addresses to try (last working first). */
function peers(): Peer[] {
  const me = getSetting<string>('device_id')
  const out: Peer[] = []
  for (const d of list<Device>('devices', {})) {
    if (d.id === me || !d.lan_key || !d.lan_port) continue
    let addrs: string[] = []
    try {
      addrs = JSON.parse(d.lan_addresses) as string[]
    } catch {
      /* none */
    }
    for (const a of addrs) out.push({ base: `http://${a}:${d.lan_port}`, key: fromB64(d.lan_key), name: d.name })
  }
  return out.sort((a, b) => (a.base === lastGood ? -1 : b.base === lastGood ? 1 : 0))
}

async function call(peer: Peer, path: string): Promise<Uint8Array | null> {
  const t = Date.now()
  const hmacKey = await crypto.subtle.importKey('raw', peer.key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = hex(await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(`${path}|${t}`)))
  const res = await net.fetch(`${peer.base}${path}?t=${t}&s=${sig}`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) return null
  const buf = new Uint8Array(await res.arrayBuffer())
  if (buf.length < 28) return null
  const aesKey = await crypto.subtle.importKey('raw', peer.key as BufferSource, 'AES-GCM', false, ['decrypt'])
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.subarray(0, 12) }, aesKey, buf.subarray(12))
  return new Uint8Array(plain)
}

/** A stored file (material, exam paper or photo) from a PC on this network, or null. */
export async function fetchFromLan(id: string): Promise<Uint8Array | null> {
  if (Date.now() < unreachableUntil) return null
  const list = peers()
  if (!list.length) return null
  let anyAnswered = false
  for (const p of list) {
    try {
      const data = await call(p, `/sh/v1/file/${id}`)
      anyAnswered = true
      if (data) {
        lastGood = p.base
        return data
      }
    } catch {
      /* not reachable at this address */
    }
  }
  if (!anyAnswered) unreachableUntil = Date.now() + 60_000
  return null
}

/** Which of your PCs answer right now (for Settings). */
export async function lanPeers(): Promise<{ name: string; reachable: boolean }[]> {
  unreachableUntil = 0
  const byName = new Map<string, boolean>()
  for (const p of peers()) {
    if (byName.get(p.name)) continue
    const ok = await call(p, '/sh/v1/hello').then(
      (r) => !!r,
      () => false
    )
    if (ok) lastGood = p.base
    byName.set(p.name, ok)
  }
  return [...byName].map(([name, reachable]) => ({ name, reachable }))
}
