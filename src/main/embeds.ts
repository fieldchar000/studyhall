// YouTube / Spotify link helpers. Both offer free "oEmbed" endpoints that return a
// title and thumbnail without any API key or account.

import { app, net, shell } from 'electron'
import { spotifyParts, youtubeParts } from '@shared/links'
import type { EmbedInfo } from '@shared/types'

export async function lookup(url: string): Promise<EmbedInfo | null> {
  let endpoint: string
  const yt = youtubeParts(url)
  if (yt) endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${yt.id}`)}`
  else if (spotifyParts(url)) endpoint = `https://open.spotify.com/oembed?url=${encodeURIComponent(url.trim())}`
  else return null
  try {
    const res = await net.fetch(endpoint, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return null
    const j = (await res.json()) as Record<string, unknown>
    const thumb = typeof j.thumbnail_url === 'string' && j.thumbnail_url.startsWith('https://') ? j.thumbnail_url : null
    return { title: String(j.title ?? ''), author: String(j.author_name ?? ''), thumbnail_url: thumb }
  } catch {
    return null // offline or blocked: the UI still saves the link
  }
}

/** Open in the Spotify desktop app if it's installed (full tracks with Premium), else the browser. */
export async function openSpotify(url: string): Promise<void> {
  const p = spotifyParts(url)
  if (!p) return
  if (app.getApplicationNameForProtocol('spotify://')) await shell.openExternal(`spotify:${p.type}:${p.id}`)
  else await shell.openExternal(`https://open.spotify.com/${p.type}/${p.id}`)
}
