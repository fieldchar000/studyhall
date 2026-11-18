// Nova on the web, the way Roamies does it:
//  • youtubeSearch: real videos and playlists from YouTube's own results page (free, no account, nothing sent but the
//    search words), so "pull up a video on beta blockers" opens an actual video.
//  • webSearch: Claude Code's own web search, on your Claude plan (the only paid thing Nova uses).
//  • readPage: the text of a public web page. Only public internet addresses: never your router, this PC or anything
//    on your home network, so a page can't steer Nova into them.

import { net } from 'electron'
import { claudeWebSearch, readPublicPage, setMainFetch, setMainSearch } from './ggweb'
import { claudeBase, claudeModelId, recordClaudeCost } from './claude'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

// ---------- YouTube ----------

export interface Found {
  title: string
  url: string
  by?: string
  length?: string
  views?: string
}

type Node = Record<string, unknown>
const txt = (v: unknown): string => {
  const o = v as { simpleText?: string; runs?: { text: string }[]; content?: string } | undefined
  return o?.simpleText ?? o?.content ?? o?.runs?.map((r) => r.text).join('') ?? ''
}

export async function youtubeSearch(query: string, playlists: boolean): Promise<Found[]> {
  const sp = playlists ? 'EgIQAw%3D%3D' : 'EgIQAQ%3D%3D'
  const res = await net.fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query.slice(0, 200))}&sp=${sp}`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9' }
  })
  if (!res.ok) throw new Error(`YouTube said ${res.status}`)
  const html = await res.text()
  const at = html.indexOf('ytInitialData = ')
  if (at < 0) throw new Error('YouTube’s page changed')
  const start = at + 'ytInitialData = '.length
  const end = html.indexOf(';</script>', start)
  const data = JSON.parse(html.slice(start, end)) as Node
  const out: Found[] = []
  const seen = new Set<string>()
  const walk = (n: unknown, depth: number): void => {
    if (!n || typeof n !== 'object' || depth > 40 || out.length >= 8) return
    if (Array.isArray(n)) {
      for (const x of n) walk(x, depth + 1)
      return
    }
    const o = n as Node
    const v = o.videoRenderer as Node | undefined
    if (v && typeof v.videoId === 'string' && !playlists) {
      const url = `https://www.youtube.com/watch?v=${v.videoId}`
      if (!seen.has(url)) {
        seen.add(url)
        out.push({ title: txt(v.title), url, by: txt(v.ownerText), length: txt(v.lengthText), views: txt(v.shortViewCountText) || txt(v.viewCountText) })
      }
      return
    }
    const p = o.playlistRenderer as Node | undefined
    if (p && typeof p.playlistId === 'string') {
      const url = `https://www.youtube.com/playlist?list=${p.playlistId}`
      if (!seen.has(url)) {
        seen.add(url)
        out.push({ title: txt(p.title), url, by: txt(p.shortBylineText), length: p.videoCount ? `${p.videoCount} videos` : undefined })
      }
      return
    }
    // Newer result cards (playlists, mixes).
    const l = o.lockupViewModel as Node | undefined
    if (l && typeof l.contentId === 'string') {
      const meta = (l.metadata as Node | undefined)?.lockupMetadataViewModel as Node | undefined
      const id = l.contentId
      const url = /^(PL|OL|RD|UU)/.test(id) ? `https://www.youtube.com/playlist?list=${id}` : `https://www.youtube.com/watch?v=${id}`
      if (!seen.has(url) && (playlists ? url.includes('list=') : url.includes('watch'))) {
        seen.add(url)
        out.push({ title: txt(meta?.title), url })
      }
      return
    }
    for (const k of Object.keys(o)) walk(o[k], depth + 1)
  }
  walk(data, 0)
  return out.filter((x) => x.title).slice(0, 6)
}

// ---------- Web search (Claude Code's own) ----------

export async function webSearch(query: string): Promise<string> {
  const started = Date.now()
  const r = await claudeWebSearch(query, { ...claudeBase(), model: claudeModelId('haiku') })
  recordClaudeCost('haiku', 'low', Date.now() - started, r.cost)
  return r.text
}
setMainSearch(webSearch)

// ---------- Reading a page (public internet only) ----------

type FetchFn = Parameters<typeof readPublicPage>[2]
const electronFetch = ((url: string, init: Parameters<NonNullable<FetchFn>>[1]) => net.fetch(url, init)) as NonNullable<FetchFn>
setMainFetch(electronFetch)
export const readPage = (url: string, offset = 0): Promise<string> => readPublicPage(url, offset, electronFetch)

// ---------- A YouTube video's subtitles ----------

/** The words spoken in a YouTube video, from its subtitles (English first). */
export async function youtubeTranscript(url: string): Promise<string> {
  const id = /(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/.exec(url)?.[1]
  if (!id) throw new Error('that isn’t a YouTube video link')
  const page = await (await net.fetch(`https://www.youtube.com/watch?v=${id}&hl=en`, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9' } })).text()
  const title = /<title>([^<]*)<\/title>/.exec(page)?.[1]?.replace(/ - YouTube$/, '') ?? 'the video'
  const at = page.indexOf('"captionTracks":')
  if (at < 0) throw new Error('this video has no subtitles')
  const start = page.indexOf('[', at)
  let depth = 0
  let end = start
  for (; end < page.length; end++) {
    if (page[end] === '[') depth++
    else if (page[end] === ']' && --depth === 0) break
  }
  const tracks = JSON.parse(page.slice(start, end + 1)) as { baseUrl: string; languageCode: string; kind?: string }[]
  const track = tracks.find((t) => t.languageCode.startsWith('en') && t.kind !== 'asr') ?? tracks.find((t) => t.languageCode.startsWith('en')) ?? tracks[0]
  if (!track) throw new Error('this video has no subtitles')
  const res = await net.fetch(`${track.baseUrl}&fmt=json3`, { headers: { 'User-Agent': UA } })
  const j = (await res.json()) as { events?: { segs?: { utf8: string }[] }[] }
  const text = (j.events ?? [])
    .map((e) => (e.segs ?? []).map((s) => s.utf8).join(''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) throw new Error('the subtitles were empty')
  return `Video: ${title}\n\n${text.slice(0, 60_000)}${text.length > 60_000 ? ' …(cut)' : ''}`
}
