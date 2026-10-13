// Files on the phone: everything lives in the app's private storage (Capacitor Filesystem,
// "Data" directory), addressed by the same relative paths the PC uses ("materials/…pdf").
// Reads go through the WebView's local file server (fast, no base64); writes are chunked.

import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'

/** The fake root folder the shared code sees as app.getPath('userData'). */
export const ROOT = '/sh'
const native = Capacitor.isNativePlatform()

let baseUri = '' // file:///data/user/0/<app>/files
const known = new Set<string>() // relative paths that exist (so existsSync can be synchronous)

export const rel = (p: string): string => {
  const n = p.replace(/\\/g, '/')
  return n.startsWith(`${ROOT}/`) ? n.slice(ROOT.length + 1) : n.replace(/^\/+/, '')
}

/** Remember what's on disk, so checks like existsSync can answer straight away. */
export async function initStorage(): Promise<void> {
  baseUri = (await Filesystem.getUri({ directory: Directory.Data, path: '' })).uri.replace(/\/$/, '')
  const walk = async (dir: string): Promise<void> => {
    const r = await Filesystem.readdir({ directory: Directory.Data, path: dir }).catch(() => null)
    for (const f of r?.files ?? []) {
      const p = dir ? `${dir}/${f.name}` : f.name
      if (f.type === 'directory') await walk(p)
      else known.add(p)
    }
  }
  for (const d of ['materials', 'papers', 'photos']) await walk(d)
  for (const f of ['studyhall.db', 'studyhall.db.tmp']) if (await Filesystem.stat({ directory: Directory.Data, path: f }).catch(() => null)) known.add(f)
}

export const exists = (p: string): boolean => known.has(rel(p))

/** An address the WebView can load directly (images, PDFs) — the phone's equivalent of material://. */
export function fileUrl(p: string): string {
  return native ? Capacitor.convertFileSrc(`${baseUri}/${rel(p)}`) : ''
}

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
function fromBase64(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

export async function readBytes(p: string): Promise<Uint8Array> {
  const r = rel(p)
  if (native) {
    const res = await fetch(fileUrl(r))
    if (!res.ok) throw Object.assign(new Error(`ENOENT: ${r}`), { code: 'ENOENT' })
    return new Uint8Array(await res.arrayBuffer())
  }
  const f = await Filesystem.readFile({ directory: Directory.Data, path: r }).catch(() => {
    throw Object.assign(new Error(`ENOENT: ${r}`), { code: 'ENOENT' })
  })
  return typeof f.data === 'string' ? fromBase64(f.data) : new Uint8Array(await (f.data as Blob).arrayBuffer())
}

const CHUNK = 3 * 1024 * 1024 // bytes per bridge call (multiple of 3 so base64 chunks join cleanly)

export async function writeBytes(p: string, data: Uint8Array): Promise<void> {
  const r = rel(p)
  await Filesystem.writeFile({ directory: Directory.Data, path: r, data: toBase64(data.subarray(0, CHUNK)), recursive: true })
  for (let o = CHUNK; o < data.length; o += CHUNK) {
    await Filesystem.appendFile({ directory: Directory.Data, path: r, data: toBase64(data.subarray(o, o + CHUNK)) })
  }
  known.add(r)
}

export async function remove(p: string): Promise<void> {
  const r = rel(p)
  await Filesystem.deleteFile({ directory: Directory.Data, path: r }).catch(() => {})
  known.delete(r)
}

export async function rename(from: string, to: string): Promise<void> {
  const a = rel(from)
  const b = rel(to)
  await Filesystem.rename({ directory: Directory.Data, from: a, to: b, toDirectory: Directory.Data })
  known.delete(a)
  known.add(b)
}

export async function size(p: string): Promise<number | null> {
  const s = await Filesystem.stat({ directory: Directory.Data, path: rel(p) }).catch(() => null)
  return s ? Number(s.size) : null
}

export async function mkdirp(p: string): Promise<void> {
  await Filesystem.mkdir({ directory: Directory.Data, path: rel(p), recursive: true }).catch(() => {})
}

// ---------- Files picked by the user (they have no path on the phone) ----------

const picked = new Map<string, File>()
let pickSeq = 0

/** Give a picked File a pretend path the shared code can pass around. */
export function registerPicked(file: File): string {
  const p = `/picked/${++pickSeq}/${file.name}`
  picked.set(p, file)
  return p
}
export const pickedFile = (p: string): File | undefined => picked.get(p.replace(/\\/g, '/'))
