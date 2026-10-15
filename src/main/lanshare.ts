// Wi-Fi file sharing (PC side): lets your phone fetch course files and photos straight from this
// PC over your home network, so they don't use the 1 GB cloud storage.
//  • Off until you switch it on in Settings (Windows then asks once to allow it through the firewall).
//  • This PC's network addresses and a private key go into your "devices" row, which only your own
//    devices can read; that's how your phone finds it.
//  • Every request must be signed with that key (and be recent), and every reply is encrypted
//    with it (AES-256-GCM), so nobody else on the network can ask for or read your files.

import { createServer, type Server } from 'node:http'
import { createCipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { hostname, networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'
import type { Device, ExamPaper, Material, Photo } from '@shared/types'
import { create, get, getSetting, setSetting, update } from './db'
import { getPrefs } from './prefs'

const BASE_PORT = 47720
const MAX_SKEW_MS = 2 * 60 * 1000
// Testing aid: share on this PC only (no firewall prompt), like STUDYHALL_DATA_DIR.
const TEST = process.env['STUDYHALL_LAN_TEST'] === '1'

let server: Server | null = null
let port: number | null = null
let refresh: ReturnType<typeof setInterval> | undefined

/** Private network IPv4 addresses (home Wi-Fi / Ethernet), not virtual or internet-facing ones. */
export function lanAddresses(): string[] {
  if (TEST) return ['127.0.0.1']
  const out: string[] = []
  for (const [name, list] of Object.entries(networkInterfaces())) {
    if (/vEthernet|VirtualBox|VMware|WSL|Hyper-V|Loopback|Tailscale|ZeroTier/i.test(name)) continue
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue
      if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) out.push(a.address)
    }
  }
  return out
}

function key(): Buffer {
  let k = getSetting<string>('lan_key')
  if (!k) {
    k = randomBytes(32).toString('base64')
    setSetting('lan_key', k)
  }
  return Buffer.from(k, 'base64')
}

/** This PC's row in "devices" (created the first time). */
function myDevice(): Device {
  const id = getSetting<string>('device_id')
  const existing = id ? get<Device>('devices', id) : null
  if (existing) return existing
  const d = create<Device>('devices', { name: hostname(), platform: 'windows' })
  setSetting('device_id', d.id)
  return d
}

/** Tell your other devices where to find this PC (only writes when something changed). */
function publish(sharing: boolean): void {
  const d = myDevice()
  const addresses = JSON.stringify(sharing ? lanAddresses() : [])
  const k = sharing ? key().toString('base64') : ''
  const p = sharing ? port : null
  const stale = !d.last_seen || Date.now() - Date.parse(d.last_seen) > 24 * 3600 * 1000
  if (d.lan_addresses !== addresses || d.lan_key !== k || d.lan_port !== p || d.name !== hostname() || stale) {
    update('devices', d.id, { lan_addresses: addresses, lan_key: k, lan_port: p, name: hostname(), last_seen: new Date().toISOString() })
  }
}

const sign = (k: Buffer, msg: string): Buffer => createHmac('sha256', k).update(msg).digest()

function encrypt(k: Buffer, data: Buffer): Buffer {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', k, iv)
  return Buffer.concat([iv, c.update(data), c.final(), c.getAuthTag()])
}

async function fileFor(id: string): Promise<Buffer | null> {
  const row = get<Photo>('photos', id) ?? get<Material>('materials', id) ?? get<ExamPaper>('exam_papers', id)
  if (!row?.local_path) return null
  return readFile(join(app.getPath('userData'), row.local_path)).catch(() => null)
}

async function handle(url: URL): Promise<{ status: number; body?: Buffer }> {
  const k = key()
  const t = Number(url.searchParams.get('t'))
  const s = Buffer.from(url.searchParams.get('s') ?? '', 'hex')
  const what = url.pathname
  if (!Number.isFinite(t) || Math.abs(Date.now() - t) > MAX_SKEW_MS) return { status: 401 }
  const expected = sign(k, `${what}|${t}`)
  if (s.length !== expected.length || !timingSafeEqual(s, expected)) return { status: 401 }
  if (what === '/sh/v1/hello') return { status: 200, body: encrypt(k, Buffer.from(JSON.stringify({ name: hostname(), device: getSetting<string>('device_id') }))) }
  const m = /^\/sh\/v1\/file\/([0-9a-f-]{36})$/.exec(what)
  if (!m) return { status: 404 }
  const data = await fileFor(m[1])
  return data ? { status: 200, body: encrypt(k, data) } : { status: 404 }
}

function listen(p: number): Promise<number> {
  return new Promise((ok, fail) => {
    const s = createServer((req, res) => {
      if (req.method !== 'GET') {
        res.writeHead(405).end()
        return
      }
      void handle(new URL(req.url ?? '/', 'http://x'))
        .then(({ status, body }) => {
          res.writeHead(status, { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' })
          res.end(body)
        })
        .catch(() => res.writeHead(500).end())
    })
    s.once('error', (e: NodeJS.ErrnoException) => (e.code === 'EADDRINUSE' && p < BASE_PORT + 10 ? ok(listen(p + 1)) : fail(e)))
    s.listen(p, TEST ? '127.0.0.1' : '0.0.0.0', () => {
      server = s
      ok(p)
    })
  })
}

/** Start or stop sharing to match the Settings switch. Safe to call any time. */
export async function applyLanShare(): Promise<void> {
  const on = !!getPrefs().lanShare
  if (on && !server) {
    port = await listen(BASE_PORT)
    publish(true)
    clearInterval(refresh)
    refresh = setInterval(() => publish(true), 5 * 60 * 1000) // Wi-Fi networks change
  } else if (!on && server) {
    clearInterval(refresh)
    server.close()
    server = null
    port = null
    publish(false)
  } else if (on) publish(true)
}

export function lanShareStatus(): { sharing: boolean; addresses: string[]; port: number | null } {
  return { sharing: !!server, addresses: server ? lanAddresses() : [], port }
}

export function stopLanShare(): void {
  clearInterval(refresh)
  server?.close()
  server = null
}
