// DevKit feeds: RSS / Atom fetched here (no CORS, no API keys), cached locally in
// feed_items. The feed list itself syncs; which articles you've read stays on this PC.

import { net } from 'electron'
import { createHash } from 'node:crypto'
import { XMLParser } from 'fast-xml-parser'
import type { Feed, FeedItem, FeedStatus, FeedTopic, RepoInfo } from '@shared/types'
import { create, getDb, getProfileId, list, now } from './db'

/** The built-in feed list (all free, all checked working). Politics leans are rough,
 *  AllSides-style labels so you can see how balanced your reading is. */
export const DEFAULT_FEEDS: { name: string; url: string; topic: FeedTopic; lean?: string; off?: boolean }[] = [
  // AI
  { name: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/', topic: 'ai' },
  { name: 'Import AI (Jack Clark)', url: 'https://importai.substack.com/feed', topic: 'ai' },
  { name: 'Interconnects (Nathan Lambert)', url: 'https://www.interconnects.ai/feed', topic: 'ai' },
  { name: 'One Useful Thing (Ethan Mollick)', url: 'https://www.oneusefulthing.org/feed', topic: 'ai' },
  { name: 'Latent Space', url: 'https://www.latent.space/feed', topic: 'ai' },
  { name: "Don't Worry About the Vase (Zvi)", url: 'https://thezvi.substack.com/feed', topic: 'ai' },
  { name: 'Epoch AI', url: 'https://epochai.substack.com/feed', topic: 'ai' },
  { name: 'OpenAI News', url: 'https://openai.com/news/rss.xml', topic: 'ai' },
  { name: 'Google DeepMind', url: 'https://deepmind.google/blog/rss.xml', topic: 'ai' },
  { name: 'Hugging Face Blog', url: 'https://huggingface.co/blog/feed.xml', topic: 'ai' },
  { name: 'MIT Technology Review — AI', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed', topic: 'ai' },
  { name: 'The Gradient', url: 'https://thegradient.pub/rss/', topic: 'ai' },
  { name: "Lil'Log (Lilian Weng)", url: 'https://lilianweng.github.io/index.xml', topic: 'ai' },
  { name: 'Berkeley AI Research', url: 'https://bair.berkeley.edu/blog/feed.xml', topic: 'ai' },
  { name: 'arXiv — cs.AI (very busy)', url: 'https://rss.arxiv.org/rss/cs.AI', topic: 'ai', off: true },
  // Geopolitics
  { name: 'Foreign Affairs', url: 'https://www.foreignaffairs.com/rss.xml', topic: 'geo' },
  { name: 'Foreign Policy', url: 'https://foreignpolicy.com/feed/', topic: 'geo' },
  { name: 'War on the Rocks', url: 'https://warontherocks.com/feed/', topic: 'geo' },
  { name: 'The Diplomat (Asia-Pacific)', url: 'https://thediplomat.com/feed/', topic: 'geo' },
  { name: 'International Crisis Group', url: 'https://www.crisisgroup.org/rss', topic: 'geo' },
  { name: 'The Economist — International', url: 'https://www.economist.com/international/rss.xml', topic: 'geo' },
  { name: 'BBC News — World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', topic: 'geo' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', topic: 'geo' },
  { name: 'Financial Times — World', url: 'https://www.ft.com/world?format=rss', topic: 'geo' },
  // Politics (a spread of perspectives)
  { name: 'AllSides — balanced news', url: 'https://www.allsides.com/rss/news', topic: 'politics', lean: 'mixed' },
  { name: 'The Economist — The world this week', url: 'https://www.economist.com/the-world-this-week/rss.xml', topic: 'politics', lean: 'centre' },
  { name: 'BBC News — Politics', url: 'https://feeds.bbci.co.uk/news/politics/rss.xml', topic: 'politics', lean: 'centre' },
  { name: 'The Guardian — Politics', url: 'https://www.theguardian.com/politics/rss', topic: 'politics', lean: 'left' },
  { name: 'NPR — Politics', url: 'https://feeds.npr.org/1014/rss.xml', topic: 'politics', lean: 'lean-left' },
  { name: 'Politico', url: 'https://rss.politico.com/politics-news.xml', topic: 'politics', lean: 'lean-left' },
  { name: 'Slow Boring', url: 'https://www.slowboring.com/feed', topic: 'politics', lean: 'lean-left' },
  { name: 'The Dispatch', url: 'https://thedispatch.com/feed/', topic: 'politics', lean: 'lean-right' },
  { name: 'RealClearPolitics', url: 'https://feeds.feedburner.com/realclearpolitics/qlMj', topic: 'politics', lean: 'lean-right' },
  { name: 'National Review', url: 'https://www.nationalreview.com/feed/', topic: 'politics', lean: 'right' },
  { name: 'Reason', url: 'https://reason.com/feed/', topic: 'politics', lean: 'libertarian' },
  { name: 'Noahpinion (economics)', url: 'https://www.noahpinion.blog/feed', topic: 'politics', lean: 'centre' },
  // Philosophy & ideas
  { name: 'Aeon', url: 'https://aeon.co/feed.rss', topic: 'philosophy' },
  { name: 'Psyche', url: 'https://psyche.co/feed', topic: 'philosophy' },
  { name: 'Stanford Encyclopedia of Philosophy — new', url: 'https://plato.stanford.edu/rss/sep.xml', topic: 'philosophy' },
  { name: '1000-Word Philosophy', url: 'https://1000wordphilosophy.com/feed/', topic: 'philosophy' },
  { name: "The Philosophers' Magazine", url: 'https://www.philosophersmag.com/feed', topic: 'philosophy' },
  { name: 'Daily Nous', url: 'https://dailynous.com/feed/', topic: 'philosophy' },
  { name: 'Astral Codex Ten', url: 'https://www.astralcodexten.com/feed', topic: 'philosophy' },
  { name: 'Philosophy Bites (podcast)', url: 'https://philosophybites.libsyn.com/rss', topic: 'philosophy' },
  // Science, tech, games
  { name: 'Quanta Magazine', url: 'https://www.quantamagazine.org/feed/', topic: 'science' },
  { name: 'Hacker News — front page', url: 'https://hnrss.org/frontpage', topic: 'tech' },
  { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', topic: 'tech' },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', topic: 'tech' },
  { name: 'Godot Engine news', url: 'https://godotengine.org/rss.xml', topic: 'games' },
  { name: 'Unity Blog', url: 'https://blog.unity.com/feed', topic: 'games' },
  { name: 'GamesIndustry.biz', url: 'https://www.gamesindustry.biz/feed', topic: 'games' },
  { name: '80 Level (game art & tech)', url: 'https://80.lv/feed/', topic: 'games' },
  { name: 'Rock Paper Shotgun', url: 'https://www.rockpapershotgun.com/feed', topic: 'games' }
]

let status: FeedStatus = { refreshing: false, lastRefresh: null, errors: {} }
let onChange: () => void = () => {}
export const feedStatus = (): FeedStatus => status

export function seedDefaultFeeds(): number {
  if (list<Feed>('feeds').length) return 0
  DEFAULT_FEEDS.forEach((f, i) => create('feeds', { name: f.name, url: f.url, topic: f.topic, lean: f.lean ?? '', enabled: f.off ? 0 : 1, sort: i }))
  return DEFAULT_FEEDS.length
}

// ---------- Parsing ----------

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', textNodeName: '#text', processEntities: true, htmlEntities: true })

const text = (v: unknown): string => {
  if (v == null) return ''
  if (typeof v === 'string' || typeof v === 'number') return String(v)
  if (Array.isArray(v)) return text(v[0])
  if (typeof v === 'object') return text((v as Record<string, unknown>)['#text'] ?? '')
  return ''
}
const strip = (html: string): string =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(rsquo|lsquo);/g, "'")
    .replace(/&(rdquo|ldquo);/g, '"')
    .replace(/&(mdash|ndash);/g, '—')
    .replace(/&hellip;/g, '…')
    .replace(/\s+/g, ' ')
    .trim()
const arr = <T>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v])

interface Parsed {
  guid: string
  title: string
  link: string
  author: string
  summary: string
  published: string
}

function atomLink(l: unknown): string {
  const links = arr(l as Record<string, string> | Record<string, string>[])
  const alt = links.find((x) => typeof x === 'object' && (!x['@rel'] || x['@rel'] === 'alternate')) ?? links[0]
  return typeof alt === 'string' ? alt : (alt?.['@href'] ?? '')
}

export function parseFeed(xml: string): Parsed[] {
  const doc = parser.parse(xml) as Record<string, any>
  const out: Parsed[] = []
  const iso = (d: string): string => {
    const t = Date.parse(d)
    return Number.isFinite(t) ? new Date(t).toISOString() : now()
  }
  if (doc.rss?.channel) {
    for (const it of arr(doc.rss.channel.item)) {
      const link = text(it.link)
      out.push({
        guid: text(it.guid) || link || text(it.title),
        title: strip(text(it.title)),
        link,
        author: strip(text(it['dc:creator'] ?? it.author)),
        summary: strip(text(it.description ?? it['content:encoded'])).slice(0, 600),
        published: iso(text(it.pubDate ?? it['dc:date']))
      })
    }
  } else if (doc.feed) {
    for (const it of arr(doc.feed.entry)) {
      const link = atomLink(it.link)
      out.push({
        guid: text(it.id) || link,
        title: strip(text(it.title)),
        link,
        author: strip(text(arr(it.author)[0]?.name ?? '')),
        summary: strip(text(it.summary ?? it.content)).slice(0, 600),
        published: iso(text(it.published ?? it.updated))
      })
    }
  } else if (doc['rdf:RDF']) {
    for (const it of arr(doc['rdf:RDF'].item)) {
      const link = text(it.link)
      out.push({ guid: link, title: strip(text(it.title)), link, author: strip(text(it['dc:creator'])), summary: strip(text(it.description)).slice(0, 600), published: iso(text(it['dc:date'])) })
    }
  }
  return out.filter((p) => p.title && p.guid)
}

async function fetchText(url: string, limit = 5_000_000): Promise<string> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), 25_000)
  try {
    const res = await net.fetch(url, { signal: ctl.signal, headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Studyhall/1.0 (feed reader)', accept: '*/*' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = await res.arrayBuffer()
    if (buf.byteLength > limit) throw new Error('too large')
    return new TextDecoder().decode(buf)
  } finally {
    clearTimeout(t)
  }
}

// ---------- Refresh ----------

export async function refreshFeeds(): Promise<FeedStatus> {
  if (status.refreshing) return status
  const feeds = list<Feed>('feeds', { owner_id: getProfileId() }).filter((f) => f.enabled)
  if (!feeds.length) return status
  status = { ...status, refreshing: true }
  const errors: Record<string, string> = {}
  const db = getDb()
  const insert = db.prepare(
    `INSERT OR IGNORE INTO feed_items (id, feed_id, guid, title, link, author, summary, published_at, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const queue = [...feeds]
  const worker = async (): Promise<void> => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      try {
        const items = parseFeed(await fetchText(f.url)).slice(0, 60)
        const t = now()
        for (const it of items) {
          const id = createHash('sha1').update(`${f.id}|${it.guid}`).digest('hex')
          insert.run(id, f.id, it.guid.slice(0, 500), it.title.slice(0, 400), it.link.slice(0, 1000), it.author.slice(0, 200), it.summary, it.published > t ? t : it.published, t)
        }
      } catch (e) {
        errors[f.id] = e instanceof Error ? e.message : String(e)
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  // Keep the cache small: drop old read articles and anything older than 90 days.
  db.prepare(`DELETE FROM feed_items WHERE published_at < ? OR (read_at IS NOT NULL AND published_at < ?)`).run(
    new Date(Date.now() - 90 * 864e5).toISOString(),
    new Date(Date.now() - 21 * 864e5).toISOString()
  )
  db.prepare(`DELETE FROM feed_items WHERE feed_id NOT IN (SELECT id FROM feeds WHERE deleted_at IS NULL)`).run()
  status = { refreshing: false, lastRefresh: now(), errors }
  onChange()
  return status
}

/** Refresh soon after launch and every 45 minutes (only once DevKit is in use). */
export function startFeedRefresh(changed: () => void): void {
  onChange = changed
  const tick = (): void => {
    if (list<Feed>('feeds').some((f) => f.enabled)) void refreshFeeds()
  }
  setTimeout(tick, 20_000)
  setInterval(tick, 45 * 60_000)
}

// ---------- Queries ----------

export function feedItems(opts: { topic?: string; feedId?: string; unread?: boolean; limit?: number; q?: string }): FeedItem[] {
  const where = ['f.deleted_at IS NULL', 'f.enabled = 1']
  const params: (string | number)[] = []
  if (opts.topic) {
    where.push('f.topic = ?')
    params.push(opts.topic)
  }
  if (opts.feedId) {
    where.push('f.id = ?')
    params.push(opts.feedId)
  }
  if (opts.unread) where.push('i.read_at IS NULL')
  if (opts.q) {
    where.push('(i.title LIKE ? OR i.summary LIKE ?)')
    params.push(`%${opts.q}%`, `%${opts.q}%`)
  }
  params.push(Math.min(500, Math.max(1, opts.limit ?? 150)))
  return getDb()
    .prepare(
      `SELECT i.*, f.name AS feed_name, f.topic AS topic, f.lean AS lean FROM feed_items i JOIN feeds f ON f.id = i.feed_id
       WHERE ${where.join(' AND ')} ORDER BY i.published_at DESC LIMIT ?`
    )
    .all(...params)
    .map((r) => ({ ...(r as object) }) as FeedItem)
}

export function unreadCounts(): Record<string, number> {
  const rows = getDb()
    .prepare(
      `SELECT f.topic AS topic, COUNT(*) AS n FROM feed_items i JOIN feeds f ON f.id = i.feed_id
       WHERE f.deleted_at IS NULL AND f.enabled = 1 AND i.read_at IS NULL GROUP BY f.topic`
    )
    .all() as { topic: string; n: number }[]
  return Object.fromEntries(rows.map((r) => [r.topic, r.n]))
}

export function markRead(ids: string[], read: boolean): void {
  const stmt = getDb().prepare('UPDATE feed_items SET read_at = ? WHERE id = ?')
  const t = read ? now() : null
  for (const id of ids.slice(0, 2000)) stmt.run(t, id)
}

/** The article page for the reader view (http(s) only, size-limited). */
export async function fetchArticle(url: string): Promise<string> {
  if (!/^https?:\/\//i.test(url)) throw new Error('Not a web link')
  return fetchText(url, 4_000_000)
}

// ---------- GitHub (public repos, no account needed) ----------

const repoCache = new Map<string, { at: number; info: RepoInfo }>()

export async function repoInfo(url: string): Promise<RepoInfo> {
  const m = /github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/#?].*)?$/i.exec(url.trim())
  if (!m) throw new Error('Not a GitHub repository link')
  const key = `${m[1]}/${m[2]}`.toLowerCase()
  const hit = repoCache.get(key)
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.info
  const get = async (path: string): Promise<any> => {
    const res = await net.fetch(`https://api.github.com/repos/${m[1]}/${m[2]}${path}`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'Studyhall' } })
    if (res.status === 404) throw new Error('Repository not found (is it private?)')
    if (!res.ok) throw new Error(`GitHub says ${res.status}`)
    return res.json()
  }
  const [r, commits] = await Promise.all([get(''), get('/commits?per_page=5').catch(() => [])])
  const info: RepoInfo = {
    full_name: r.full_name,
    description: r.description ?? '',
    stars: r.stargazers_count ?? 0,
    forks: r.forks_count ?? 0,
    open_issues: r.open_issues_count ?? 0,
    language: r.language ?? '',
    pushed_at: r.pushed_at ?? '',
    html_url: r.html_url,
    commits: (Array.isArray(commits) ? commits : []).map((c: any) => ({
      sha: String(c.sha).slice(0, 7),
      message: String(c.commit?.message ?? '').split('\n')[0].slice(0, 140),
      date: c.commit?.author?.date ?? '',
      url: c.html_url
    }))
  }
  repoCache.set(key, { at: Date.now(), info })
  return info
}
