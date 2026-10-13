// file:// URLs (the shared code reads its own files that way) answered from private storage.

import { readBytes } from '../storage'

const TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  html: 'text/html',
  htm: 'text/html'
}

export async function fromFileUrl(url: string): Promise<Response> {
  const path = decodeURI(new URL(url).pathname)
  try {
    const bytes = await readBytes(path)
    const ext = path.split('.').pop()?.toLowerCase() ?? ''
    return new Response(bytes as BodyInit, { status: 200, headers: { 'content-type': TYPES[ext] ?? 'application/octet-stream' } })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
