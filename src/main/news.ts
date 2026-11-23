// The news you watch: topics you pick ("NVIDIA", "GTA 6 jailbreak"), each either "alert me" (Nova speaks up when
// something big and not just a rumour lands) or "brief only" (it's in your briefs). Read from free feeds: Google News
// and Bing News (news sites, official newsrooms, some channels). X, TikTok and Reddit have no free way in (Reddit refuses
// automated reads); their big posts usually reach the news within hours. New headlines are sorted into stories by a small Claude call (Haiku), each
// labelled: confirmed (an official source, or two or more reliable outlets), reported (one outlet) or rumour (only
// social posts). Only your topics are sent out (to Google News and Bing News, as searches).
import { app, net } from 'electron'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { claudeChat } from './claude'
import { getSetting, setSetting } from './db'
import { getPrefs } from './prefs'

export type WatchLevel = 'alert' | 'brief'
export type Watch = { topic: string; level: WatchLevel; added: number }
export type Trust = 'confirmed' | 'reported' | 'rumour'
export type Story = { topic: string; headline: string; summary: string; trust: Trust; important: boolean; sources: string[]; url: string; at: number; alerted?: boolean }

export const newsHooks = {
  /** Something big on an "alert me" topic: Nova says it (watcher.ts decides when). */
  alert: (_s: Story): void => {}
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Studyhall/1.0'
const file = (): string => join(app.getPath('userData'), 'news.json')
let stories: Story[] | null = null
function all(): Story[] {
  if (stories) return stories
  try {
    stories = existsSync(file()) ? (JSON.parse(readFileSync(file(), 'utf8')) as Story[]) : []
  } catch {
    stories = []
  }
  return stories
}
function keep(): void {
  stories = all()
    .filter((s) => Date.now() - s.at < 7 * 864e5)
    .slice(0, 300)
  writeFileSync(file(), JSON.stringify(stories))
}

// ---------- What you watch ----------

export const watches = (): Watch[] => getSetting<Watch[]>('nova_news_topics') ?? []
export function setWatch(topic: string, level: WatchLevel | 'off'): string {
  const t = topic.trim().slice(0, 80)
  if (!t) return 'Which topic?'
  const ws = watches().filter((w) => w.topic.toLowerCase() !== t.toLowerCase())
  if (level !== 'off') ws.push({ topic: t, level, added: Date.now() })
  setSetting('nova_news_topics', ws.slice(-20))
  if (level !== 'off') void checkTopic({ topic: t, level, added: Date.now() }, true).catch(() => {})
  return level === 'off' ? `Stopped watching ${t}.` : level === 'alert' ? `Watching ${t} closely: anything big and confirmed, you'll hear straight away.` : `Watching ${t}: it'll be in your briefs.`
}

// ---------- Reading the feeds ----------

type Raw = { title: string; url: string; source: string; at: number; social: boolean }
const decode = (s: string): string =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim()
const tag = (xml: string, name: string): string => decode(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(xml)?.[1] ?? '')
async function get(url: string): Promise<string> {
  const r = await net.fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(12_000) }).catch(() => null)
  return r?.ok ? r.text() : ''
}
async function read(topic: string): Promise<Raw[]> {
  const q = encodeURIComponent(topic)
  const [gn, bn] = await Promise.all([get(`https://news.google.com/rss/search?q=${q}+when:2d&hl=en-SG&gl=SG&ceid=SG:en`), get(`https://www.bing.com/news/search?q=${q}&format=rss`)])
  const out: Raw[] = []
  for (const it of gn.split(/<item>/i).slice(1, 25)) {
    const title = tag(it, 'title')
    const source = tag(it, 'source') || 'news'
    out.push({
      title: title.replace(new RegExp(`\\s+-\\s+${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), ''),
      url: tag(it, 'link'),
      source,
      at: Date.parse(tag(it, 'pubDate')) || Date.now(),
      social: false
    })
  }
  // (Bing's source names say where a post came from: a channel on YouTube, X or Reddit counts as social)
  for (const it of bn.split(/<item>/i).slice(1, 15)) {
    const source = (tag(it, 'News:Source') || 'news').replace(/\s+on MSN$/i, '')
    out.push({
      title: tag(it, 'title'),
      url: tag(it, 'link'),
      source,
      at: Date.parse(tag(it, 'pubDate')) || Date.now(),
      social: /\b(youtube|reddit|twitter|tiktok|x\.com|facebook|instagram|forum)\b/i.test(source)
    })
  }
  return out.filter((x) => x.title && Date.now() - x.at < 3 * 864e5)
}
const idOf = (r: Raw): string => createHash('sha1').update(`${r.source}|${r.title}`.toLowerCase()).digest('hex').slice(0, 16)

/** New headlines on a topic, sorted into stories (a small Claude call, only when there's something new). */
async function checkTopic(w: Watch, quiet = false): Promise<Story[]> {
  const raw = await read(w.topic)
  const seen = new Set(getSetting<string[]>('nova_news_seen') ?? [])
  const fresh = raw.filter((r) => !seen.has(idOf(r)))
  if (!fresh.length) return []
  setSetting('nova_news_seen', [...seen, ...fresh.map(idOf)].slice(-3000))
  const lines = fresh
    .slice(0, 30)
    .map((r, i) => `[${i}] ${r.social ? 'SOCIAL' : 'NEWS'} | ${r.source} | ${new Date(r.at).toISOString().slice(0, 16)} | ${r.title}`)
    .join('\n')
  const out = await claudeChat(
    [
      {
        role: 'system',
        content: `Sort new headlines about "${w.topic}" for someone who follows it. Group headlines about the same development into one story (skip ones that aren't really about the topic, and old or evergreen pieces). For each story: headline (short, plain), summary (one spoken sentence saying what happened, no hype), items (the [numbers] in it), trust: "confirmed" if it comes from the official source itself (the company's own newsroom or account) or from two or more independent reliable news outlets, "reported" if from one reliable outlet, "rumour" if only social posts, forums, leakers or unknown sites. important: true only for a real development someone following this would want to hear about now (a launch, an announcement, a release, a confirmed date, a major exploit or fix), not opinion, previews, guides or deals.`
      },
      { role: 'user', content: lines }
    ],
    {
      type: 'object',
      properties: {
        stories: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              headline: { type: 'string' },
              summary: { type: 'string' },
              items: { type: 'array', items: { type: 'integer' } },
              trust: { type: 'string', enum: ['confirmed', 'reported', 'rumour'] },
              important: { type: 'boolean' }
            },
            required: ['headline', 'summary', 'items', 'trust', 'important']
          }
        }
      },
      required: ['stories']
    },
    { ...getPrefs(), novaBrain: 'haiku', novaEffort: 'low' },
    'chat'
  ).catch(() => '')
  let made: Story[] = []
  try {
    const j = JSON.parse(out) as { stories?: { headline: string; summary: string; items: number[]; trust: Trust; important: boolean }[] }
    made = (j.stories ?? [])
      .map((s) => {
        const its = (s.items ?? []).map((i) => fresh[i]).filter(Boolean)
        return {
          topic: w.topic,
          headline: String(s.headline ?? ''),
          summary: String(s.summary ?? ''),
          trust: (['confirmed', 'reported', 'rumour'].includes(s.trust) ? s.trust : 'rumour') as Trust,
          important: !!s.important,
          sources: [...new Set(its.map((r) => r.source))].slice(0, 5),
          url: its.find((r) => !r.social)?.url ?? its[0]?.url ?? '',
          at: Math.max(...its.map((r) => r.at), 0) || Date.now()
        }
      })
      .filter((s) => s.headline && s.sources.length)
  } catch {
    return []
  }
  all().unshift(...made)
  keep()
  // An "alert me" topic: a big development that isn't only a rumour is said now (not the first read of a new topic).
  if (!quiet && w.level === 'alert')
    for (const s of made.filter((x) => x.important && x.trust !== 'rumour').slice(0, 1)) {
      s.alerted = true
      keep()
      newsHooks.alert(s)
    }
  return made
}

// ---------- For briefs, Nova and the clock ----------

const BADGE: Record<Trust, string> = { confirmed: 'Confirmed', reported: 'Reported', rumour: 'Rumour' }
const trustSaid = (s: Story): string =>
  s.trust === 'confirmed'
    ? s.sources.length > 1
      ? `${s.sources.length} sources confirm it.`
      : `It's from ${s.sources[0]}.`
    : s.trust === 'reported'
      ? `Reported by ${s.sources[0]} so far.`
      : `Only a rumour so far, on ${s.sources[0]}.`
/** The stories for a brief: the last day's (half a day for a status report), confirmed and important first. */
export async function newsForBrief(kind: string): Promise<{ say: string; title: string; badge: string }[]> {
  if (!watches().length) return []
  const since = Date.now() - (kind === 'status' ? 12 : kind === 'weekly' ? 7 * 24 : 26) * 3600_000
  const rank = (s: Story): number => (s.trust === 'confirmed' ? 0 : s.trust === 'reported' ? 1 : 2) - (s.important ? 1 : 0)
  return all()
    .filter((s) => s.at > since && watches().some((w) => w.topic === s.topic))
    .sort((a, b) => rank(a) - rank(b) || b.at - a.at)
    .slice(0, 3)
    .map((s) => ({ say: `${s.topic}: ${s.summary} ${trustSaid(s)}`, title: `${s.topic}: ${s.headline}`, badge: BADGE[s.trust] }))
}
/** What Nova answers for "any news on X?" or "what's on my news watch?": checked now, then the latest stories. */
export async function newsText(topic?: string): Promise<string> {
  const ws = watches()
  const want = topic?.trim()
  const targets = want ? [ws.find((w) => w.topic.toLowerCase() === want.toLowerCase()) ?? { topic: want, level: 'brief' as const, added: 0 }] : ws
  if (!targets.length) return 'They watch no news topics yet. They can say "watch NVIDIA news" (or "closely", to hear about big news straight away).'
  await Promise.all(targets.map((w) => checkTopic(w, true).catch(() => [])))
  const out = targets.map((w) => {
    const ss = all()
      .filter((s) => s.topic.toLowerCase() === w.topic.toLowerCase())
      .slice(0, 5)
    return `${w.topic}${w.level === 'alert' ? ' (watched closely)' : ''}:\n${ss.length ? ss.map((s) => `• [${BADGE[s.trust]}${s.important ? ', big' : ''}] ${s.headline}: ${s.summary} (${s.sources.join(', ')}; ${new Date(s.at).toLocaleString('en-GB', { weekday: 'short', hour: 'numeric', minute: '2-digit' })})`).join('\n') : '• nothing in the last couple of days'}`
  })
  return `${out.join('\n\n')}\n(Say how sure each one is: confirmed, reported, or only a rumour.)`
}

let started = false
/** Checks the topics: "alert me" ones every half hour, the rest every three hours (while Studyhall is open). */
export function startNews(): void {
  if (started || process.env.STUDYHALL_OFFSCREEN === '1') return
  started = true
  let last: Record<string, number> = {}
  const tick = async (): Promise<void> => {
    if (getPrefs().novaNews === false) return
    for (const w of watches()) {
      const every = (w.level === 'alert' ? 30 : 180) * 60_000
      if (Date.now() - (last[w.topic] ?? 0) < every) continue
      last = { ...last, [w.topic]: Date.now() }
      await checkTopic(w).catch(() => [])
    }
  }
  setTimeout(() => void tick(), 90_000)
  setInterval(() => void tick(), 5 * 60_000).unref?.()
}
