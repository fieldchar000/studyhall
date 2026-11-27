// GK's space (the DevKit, renamed): a TL;DR of the last 24 hours at the top, written by Nova from what you follow:
// the news you watch (with how sure each story is), your feeds (articles, YouTube channels, subreddits), your projects'
// logs, and forecasts about to be decided. Made each morning and when you ask; kept until the next one.
// YouTube channels and subreddits are added as feeds (YouTube's own channel feed; Reddit's subreddit feed, which
// Reddit may refuse to automated readers: the feed then shows an error and is simply left out).
import { net } from 'electron'
import { claudeChat } from './claude'
import { create, getDb, getSetting, list, setSetting } from './db'
import { refreshFeeds } from './feeds'
import { recentStories } from './news'
import { getPrefs } from './prefs'

export type Tldr = { at: number; bullets: { text: string; source: string; link?: string }[] }
const DAY = 864e5

/** What happened in the last 24 hours, as plain lines for the summary (with links kept apart). */
function gather(): { lines: string[]; links: Map<number, string> } {
  const since = Date.now() - DAY
  const lines: string[] = []
  const links = new Map<number, string>()
  for (const s of recentStories(10).filter((x) => x.at > since)) {
    links.set(lines.length, s.url)
    lines.push(`[news · ${s.topic} · ${s.trust}] ${s.headline}: ${s.summary} (${s.sources.join(', ')})`)
  }
  const db = getDb()
  try {
    const items = db
      .prepare(
        `SELECT i.title, i.link, i.summary, f.name AS feed, f.url AS url FROM feed_items i JOIN feeds f ON f.id = i.feed_id
         WHERE f.deleted_at IS NULL AND f.enabled = 1 AND i.published_at >= ? ORDER BY i.published_at DESC LIMIT 40`
      )
      .all(new Date(since).toISOString()) as { title: string; link: string; summary: string; feed: string; url: string }[]
    for (const i of items) {
      const kind = /youtube\.com/i.test(i.url) ? 'youtube' : /reddit\.com/i.test(i.url) ? 'reddit' : 'feed'
      links.set(lines.length, i.link)
      lines.push(
        `[${kind} · ${i.feed}] ${i.title}${
          i.summary
            ? `: ${i.summary
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .slice(0, 220)}`
            : ''
        }`
      )
    }
  } catch {
    /* no feeds */
  }
  const projects = new Map(list<{ id: string; name: string }>('projects').map((p) => [p.id, p.name]))
  for (const d of list<{ project_id: string; date: string; kind: string; content: string }>('devlogs').filter((x) => Date.parse(x.date) >= since - DAY / 2))
    lines.push(`[project · ${projects.get(d.project_id) ?? 'project'}] ${d.kind}: ${d.content.slice(0, 220)}`)
  for (const p of list<{ question: string; probability: number; resolve_by: string | null; outcome: number | null }>('predictions').filter(
    (x) => x.outcome == null && x.resolve_by && Date.parse(x.resolve_by) - Date.now() < 3 * DAY && Date.parse(x.resolve_by) > Date.now() - DAY
  ))
    lines.push(`[forecast] "${p.question}" (you said ${Math.round(p.probability)}%) is due to be decided ${p.resolve_by}`)
  return { lines, links }
}

/** The TL;DR: kept from this morning (or the last hour, when asked again), or made now. */
export async function tldr(fresh = false): Promise<Tldr> {
  const kept = getSetting<Tldr>('gk_tldr')
  if (kept && !fresh && Date.now() - kept.at < 6 * 3600_000) return kept
  if (kept && fresh && Date.now() - kept.at < 15 * 60_000) return kept
  const { lines, links } = gather()
  if (!lines.length) return { at: Date.now(), bullets: [] }
  const raw = await claudeChat(
    [
      {
        role: 'system',
        content:
          "Write a TL;DR of the last 24 hours for one person from what they follow: 5 to 8 bullets, the most important or interesting first. Each bullet: one plain sentence (what happened and why it matters to them), and source (news, youtube, reddit, feed, project or forecast). For news, say if it's only a rumour. item: the [number] of the line it's mostly from. Group repeats into one bullet; skip filler."
      },
      { role: 'user', content: lines.map((l, i) => `[${i}] ${l}`).join('\n') }
    ],
    {
      type: 'object',
      properties: {
        bullets: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, source: { type: 'string' }, item: { type: 'integer' } }, required: ['text', 'source'] } }
      },
      required: ['bullets']
    },
    { ...getPrefs(), novaBrain: 'haiku', novaEffort: 'low' },
    'chat'
  ).catch(() => '')
  try {
    const j = JSON.parse(raw) as { bullets?: { text: string; source: string; item?: number }[] }
    // (one bullet per story: a second from the same link is dropped)
    const seen = new Set<string>()
    const bullets = (j.bullets ?? [])
      .map((b) => ({ text: String(b.text), source: String(b.source), link: b.item != null ? links.get(b.item) : undefined }))
      .filter((b) => !b.link || (!seen.has(b.link) && !!seen.add(b.link)))
    const out: Tldr = { at: Date.now(), bullets: bullets.slice(0, 8) }
    setSetting('gk_tldr', out)
    return out
  } catch {
    return kept ?? { at: Date.now(), bullets: [] }
  }
}
/** The TL;DR in words, for Nova. */
export async function tldrText(): Promise<string> {
  const t = await tldr()
  return t.bullets.length ? t.bullets.map((b) => `• ${b.text} (${b.source})`).join('\n') : 'Nothing new in the last 24 hours from what they follow.'
}

/** A YouTube channel (its @handle, link or channel id) or a subreddit (r/name), added as a feed. */
export async function addSource(kind: 'youtube' | 'reddit', value: string): Promise<string> {
  const v = value.trim()
  if (kind === 'reddit') {
    const name = v
      .replace(/^https?:\/\/(www\.|old\.)?reddit\.com\//i, '')
      .replace(/^\/?r\//i, '')
      .split(/[/?#]/)[0]
    if (!/^[A-Za-z0-9_]{2,30}$/.test(name)) return 'That doesn’t look like a subreddit name.'
    // (tried first: Reddit often refuses automated readers, and a feed that never works is no use)
    const url = `https://www.reddit.com/r/${name}/new/.rss`
    const r = await net.fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Studyhall/1.0 (feed reader)' }, signal: AbortSignal.timeout(12_000) }).catch(() => null)
    if (!r?.ok)
      return `Reddit refused (${r ? `it answered ${r.status}` : 'no answer'}): it blocks automated readers, so r/${name} can't be followed this way. Its big posts usually reach the news you watch.`
    create('feeds', { name: `r/${name}`, url, topic: 'other' })
    void refreshFeeds().catch(() => {})
    return `Added r/${name}.`
  }
  let id = /\b(UC[\w-]{22})\b/.exec(v)?.[1] ?? null
  let name = v
  if (!id) {
    const handle = v
      .replace(/^https?:\/\/(www\.)?youtube\.com\//i, '')
      .replace(/^@?/, '@')
      .split(/[/?#]/)[0]
    const r = await net
      .fetch(`https://www.youtube.com/${handle}`, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Studyhall/1.0 (feed reader)' }, signal: AbortSignal.timeout(12_000) })
      .catch(() => null)
    const html = r?.ok ? await r.text() : ''
    id = /"(?:channelId|externalId)":"(UC[\w-]{22})"/.exec(html)?.[1] ?? /<meta itemprop="identifier" content="(UC[\w-]{22})"/.exec(html)?.[1] ?? null
    name = /<meta property="og:title" content="([^"]+)"/.exec(html)?.[1] ?? handle
  }
  if (!id) return 'Couldn’t find that channel. Try its link (youtube.com/@name, or youtube.com/channel/UC…).'
  create('feeds', { name: `${name} (YouTube)`, url: `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, topic: 'other' })
  void refreshFeeds().catch(() => {})
  return `Added ${name}'s new videos.`
}
