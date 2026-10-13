// node:fs and node:fs/promises on the phone, for the handful of calls the shared code makes.
// Paths under /sh are the app's private storage; /picked/… are files the user just chose.

import { Buffer } from 'buffer'
import { exists, mkdirp, pickedFile, readBytes, remove, size, writeBytes } from '../storage'

const missing = (p: string): Error => Object.assign(new Error(`ENOENT: no such file, '${p}'`), { code: 'ENOENT' })

export function existsSync(p: string): boolean {
  return !!pickedFile(p) || exists(p)
}

export async function readFile(p: string): Promise<Buffer> {
  const f = pickedFile(p)
  if (f) return Buffer.from(await f.arrayBuffer())
  return Buffer.from(await readBytes(p))
}

export async function writeFile(p: string, data: Uint8Array | string): Promise<void> {
  await writeBytes(p, typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
}

export async function copyFile(src: string, dest: string): Promise<void> {
  await writeFile(dest, await readFile(src))
}

export async function mkdir(p: string, _opts?: unknown): Promise<void> {
  await mkdirp(p)
}

export async function stat(p: string): Promise<{ size: number; isFile: () => boolean; isDirectory: () => boolean }> {
  const f = pickedFile(p)
  const n = f ? f.size : exists(p) ? await size(p) : null
  if (n == null) throw missing(p)
  return { size: n, isFile: () => true, isDirectory: () => false }
}

export async function unlink(p: string): Promise<void> {
  await remove(p)
}
export async function rm(p: string, _opts?: unknown): Promise<void> {
  await remove(p)
}
export async function readdir(_p: string): Promise<string[]> {
  return []
}
export async function mkdtemp(prefix: string): Promise<string> {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}`
}

/** Just enough of a read stream for hashing a file (one chunk, then end). */
export function createReadStream(p: string): { on: (ev: string, fn: (x?: unknown) => void) => ReturnType<typeof createReadStream> } {
  const handlers: Record<string, ((x?: unknown) => void)[]> = {}
  const stream = {
    on(ev: string, fn: (x?: unknown) => void) {
      ;(handlers[ev] ??= []).push(fn)
      return stream
    }
  }
  setTimeout(() => {
    readFile(p).then(
      (buf) => {
        handlers.data?.forEach((h) => h(buf))
        handlers.end?.forEach((h) => h())
      },
      (e) => handlers.error?.forEach((h) => h(e))
    )
  }, 0)
  return stream
}

export const promises = { readFile, writeFile, copyFile, mkdir, stat, unlink, rm, readdir, mkdtemp }
export default { existsSync, createReadStream, promises, readFile, writeFile, copyFile, mkdir, stat, unlink, rm, readdir, mkdtemp }
