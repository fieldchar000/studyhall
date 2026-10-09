// DevKit → Feeds: a calm RSS reader. Topics on the left, articles in the middle, and a
// clean reader view on the right (the article text only — no ads, no tracking scripts).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Readability } from '@mozilla/readability'
import type { Feed, FeedItem, FeedStatus, FeedTopic } from '@shared/types'
import { Icon, Modal } from '@/components/ui'
import { api, db, useLive } from '@/lib/data'
import { LEANS, topicOf, TOPICS } from '@/lib/devContent'
import { MindmapGenerator, quickArticleNotes } from '@/components/MindmapGenerator'
import { navigate } from '@/lib/nav'
import { useMode } from '@/lib/profile'

export const ago = (iso: string): string => {
  const s = (Date.now() - Date.parse(iso)) / 1000
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  if (s < 86400 * 7) return `${Math.round(s / 86400)}d`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** Live list of feed articles, refreshed when the main process fetches new ones. */
export function useFeedItems(opts: { topic?: string; unread?: boolean; q?: string; limit?: number }): { items: FeedItem[]; reload: () => void } {
  const [items, setItems] = useState<FeedItem[]>([])
  const key = JSON.stringify(opts)
  const reload = useCallback(() => void api.feeds.items(JSON.parse(key)).then(setItems), [key])
  useEffect(() => {
    reload()
    return api.feeds.onChange(reload)
  }, [reload])
  return { items, reload }
}

export function LeanDot({ lean }: { lean: string }): React.JSX.Element | null {
  const l = LEANS.find((x) => x.id === lean)
  if (!l) return null
  return <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: l.color }} title={`Lean: ${l.label}`} />
}

export async function saveForLater(it: Pick<FeedItem, 'link' | 'title' | 'feed_name' | 'topic' | 'lean' | 'summary' | 'published_at'>): Promise<void> {
  const existing = await api.list('saved_items', { url: it.link })
  if (existing.length) return
  await db.create('saved_items', { url: it.link, title: it.title, source: it.feed_name, topic: it.topic, lean: it.lean, summary: it.summary, published_at: it.published_at })
}

export function FeedsPage(): React.JSX.Element {
  const [topic, setTopic] = useState<string>('')
  const [unread, setUnread] = useState(true)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<FeedItem | null>(null)
  const [manage, setManage] = useState(false)
  const [mapIt, setMapIt] = useState<'mindmap' | 'notes' | false>(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const togglePick = (id: string): void =>
    setPicked((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const [status, setStatus] = useState<FeedStatus | null>(null)
  const { items, reload } = useFeedItems({ topic: topic || undefined, unread, q: q || undefined, limit: 200 })
  const pickedItems = items.filter((i) => picked.has(i.id))
  const [counts, setCounts] = useState<Record<string, number>>({})
  const feeds = useLive(['feeds'], () => api.list('feeds', {}, 'sort'), []).data ?? []
  const saved = useLive(['saved_items'], () => api.list('saved_items'), []).data ?? []
  const savedUrls = new Set(saved.map((s) => s.url))

  const loadCounts = useCallback(() => void api.feeds.unreadCounts().then(setCounts), [])
  useEffect(() => {
    loadCounts()
    void api.feeds.status().then(setStatus)
    return api.feeds.onChange(() => {
      loadCounts()
      void api.feeds.status().then(setStatus)
    })
  }, [loadCounts])

  const refresh = async (): Promise<void> => {
    setStatus((s) => (s ? { ...s, refreshing: true } : s))
    setStatus(await api.feeds.refresh())
    reload()
    loadCounts()
  }
  const open = (it: FeedItem): void => {
    setSel(it)
    if (!it.read_at) void api.feeds.markRead([it.id], true).then(loadCounts)
  }
  const markAll = async (): Promise<void> => {
    await api.feeds.markRead(
      items.filter((i) => !i.read_at).map((i) => i.id),
      true
    )
    reload()
    loadCounts()
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const errors = status ? Object.keys(status.errors).length : 0

  if (!feeds.length) {
    return (
      <div className="m-auto flex max-w-md flex-col items-center gap-4 p-10 text-center">
        <div className="text-4xl">📡</div>
        <h1 className="text-2xl">Your feeds</h1>
        <p className="text-sm text-muted">Start with a hand-picked set of free sources on AI, geopolitics, politics (from across the spectrum), philosophy, science and games. You can change any of them.</p>
        <button className="btn-primary" onClick={() => void api.feeds.seedDefaults().then(() => refresh())}>
          Add the starter feeds
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* Topics */}
      <aside className="flex w-52 shrink-0 flex-col gap-1 border-r border-line/70 p-3">
        <div className="mb-2 flex items-center gap-2 px-1">
          <h1 className="flex-1 text-lg">Feeds</h1>
          <button className="btn-ghost px-1.5" title="Refresh now" disabled={status?.refreshing} onClick={() => void refresh()}>
            <Icon name="refresh" className={status?.refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
        {[{ id: '', label: 'Everything', icon: '✨' }, ...TOPICS.filter((t) => feeds.some((f) => f.topic === t.id && f.enabled))].map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTopic(t.id)
              setSel(null)
            }}
            className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm ${topic === t.id ? 'bg-accent-soft font-semibold' : 'text-muted hover:bg-line/50 hover:text-ink'}`}
          >
            <span>{t.icon}</span>
            <span className="flex-1">{t.label}</span>
            {(t.id ? counts[t.id] : total) ? <span className="text-[11px] text-muted">{t.id ? counts[t.id] : total}</span> : null}
          </button>
        ))}
        <div className="mt-auto flex flex-col gap-2 px-1 pt-3 text-[11px] text-muted">
          {status?.lastRefresh && <span>Updated {ago(status.lastRefresh)} ago</span>}
          {errors > 0 && <span className="text-amber-600">{errors} feed{errors === 1 ? '' : 's'} didn’t load</span>}
          <button className="btn justify-center" onClick={() => setManage(true)}>
            <Icon name="settings" /> Manage feeds
          </button>
        </div>
      </aside>

      {/* Articles */}
      <section className="flex w-[380px] shrink-0 flex-col border-r border-line/70">
        <div className="flex flex-col gap-2 border-b border-line/70 p-3">
          <input className="field-boxed" placeholder="Search articles…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="flex items-center gap-2 text-xs">
            <div className="flex gap-0.5 rounded-lg bg-line/50 p-0.5">
              {[true, false].map((u) => (
                <button key={String(u)} onClick={() => setUnread(u)} className={`rounded-md px-2.5 py-0.5 ${unread === u ? 'bg-panel font-medium shadow-sm' : 'text-muted'}`}>
                  {u ? 'Unread' : 'All'}
                </button>
              ))}
            </div>
            <div className="flex-1" />
            {items.length > 1 && (
              <button className="text-muted hover:text-ink" onClick={() => setPicked(picked.size ? new Set() : new Set(items.slice(0, 20).map((i) => i.id)))} title="Select articles to mindmap or make notes from">
                {picked.size ? 'Clear' : 'Select'}
              </button>
            )}
            {items.length > 1 && (
              <button className="text-muted hover:text-ink" onClick={() => setMapIt('mindmap')} title="Mindmap of the themes in these articles">
                🧠 Map
              </button>
            )}
            {items.some((i) => !i.read_at) && (
              <button className="text-muted hover:text-ink" onClick={() => void markAll()}>
                Mark all read
              </button>
            )}
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-auto">
          {items.length === 0 && (
            <li className="p-6 text-center text-sm text-muted">
              {status?.refreshing ? 'Fetching the latest…' : unread ? 'All caught up. ☕' : 'Nothing here yet — try Refresh.'}
            </li>
          )}
          {items.map((it) => (
            <li key={it.id} className="group relative">
              <input
                type="checkbox"
                className={`absolute top-3.5 left-1.5 z-10 ${picked.size ? '' : 'opacity-0 group-hover:opacity-100'}`}
                checked={picked.has(it.id)}
                onChange={() => togglePick(it.id)}
                title="Select"
              />
              <button
                onClick={() => (picked.size ? togglePick(it.id) : open(it))}
                className={`flex w-full flex-col gap-1 border-b border-line/50 py-3 pr-4 pl-6 text-left transition-colors ${picked.has(it.id) ? 'bg-accent-soft/70' : sel?.id === it.id ? 'bg-accent-soft' : 'hover:bg-line/30'}`}
              >
                <div className="flex items-center gap-1.5 text-[11px] text-muted">
                  <span>{topicOf(it.topic).icon}</span>
                  <LeanDot lean={it.lean} />
                  <span className="truncate">{it.feed_name}</span>
                  <span>· {ago(it.published_at)}</span>
                  {savedUrls.has(it.link) && <Icon name="bookmark" size={11} className="text-accent" />}
                </div>
                <div className={`line-clamp-2 text-sm ${it.read_at ? 'text-muted' : 'font-semibold'}`}>{it.title}</div>
                {it.summary && <div className="line-clamp-2 text-xs text-muted">{it.summary}</div>}
              </button>
            </li>
          ))}
        </ul>
        {picked.size > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-line/70 bg-panel/90 p-2.5 text-xs backdrop-blur">
            <span className="mr-1 font-semibold">{picked.size} selected</span>
            <button className="btn-primary px-2.5 py-1 text-xs" onClick={() => setMapIt('mindmap')}>
              🧠 Mindmap
            </button>
            <button className="btn px-2.5 py-1 text-xs" onClick={() => setMapIt('notes')}>
              📝 Notes
            </button>
            <button className="btn px-2.5 py-1 text-xs" onClick={() => void Promise.all(pickedItems.map(saveForLater))}>
              🔖 Save
            </button>
            <button
              className="btn px-2.5 py-1 text-xs"
              onClick={() =>
                void api.feeds.markRead([...picked], true).then(() => {
                  reload()
                  loadCounts()
                  setPicked(new Set())
                })
              }
            >
              ✓ Read
            </button>
            <button className="btn-ghost px-1.5 py-1 text-xs" onClick={() => setPicked(new Set())}>
              ✕
            </button>
          </div>
        )}
      </section>

      {/* Reader */}
      <section className="min-w-0 flex-1 overflow-auto">
        {sel ? (
          <Reader key={sel.id} it={sel} saved={savedUrls.has(sel.link)} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-10 text-center text-sm text-muted">
            <div className="text-3xl">📰</div>
            Pick an article. Tip: save the good ones to your reading list and come back to them properly.
          </div>
        )}
      </section>
      {manage && <ManageFeeds feeds={feeds} status={status} onClose={() => setManage(false)} />}
      {mapIt && (
        <MindmapGenerator
          purpose={mapIt}
          articles={pickedItems.length ? pickedItems : items.slice(0, 12)}
          onClose={() => {
            setMapIt(false)
            setPicked(new Set())
          }}
        />
      )}
    </div>
  )
}

// ---------- Reader view ----------

const ALLOWED = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE', 'EM', 'STRONG', 'B', 'I', 'A', 'BR', 'HR', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'FIGCAPTION', 'SUP', 'SUB'])

/** Keep only plain text formatting and links (no images, scripts, styles or embeds). */
function sanitize(html: string, base: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const walk = (el: Element): void => {
    for (const child of Array.from(el.children)) {
      walk(child)
      if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'IMG', 'PICTURE', 'VIDEO', 'AUDIO', 'FORM', 'BUTTON', 'INPUT', 'NOSCRIPT', 'SOURCE'].includes(child.tagName)) {
        child.remove()
      } else if (!ALLOWED.has(child.tagName)) {
        child.replaceWith(...Array.from(child.childNodes)) // unwrap, keep text
      } else {
        for (const a of Array.from(child.attributes)) if (!(child.tagName === 'A' && a.name === 'href')) child.removeAttribute(a.name)
        if (child.tagName === 'A') {
          try {
            const u = new URL(child.getAttribute('href') ?? '', base)
            if (/^https?:$/.test(u.protocol)) child.setAttribute('href', u.toString())
            else child.removeAttribute('href')
          } catch {
            child.removeAttribute('href')
          }
        }
      }
    }
  }
  walk(doc.body)
  return doc.body.innerHTML
}

export function Reader({ it, saved }: { it: Pick<FeedItem, 'link' | 'title' | 'feed_name' | 'topic' | 'lean' | 'summary' | 'published_at'> & { author?: string }; saved: boolean }): React.JSX.Element {
  const [full, setFull] = useState<{ html: string; minutes: number } | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'failed'>('idle')
  const [noting, setNoting] = useState(false)
  const mode = useMode()
  const makeNote = async (): Promise<void> => {
    setNoting(true)
    try {
      const id = await quickArticleNotes([{ ...it, id: it.link, feed_id: '', guid: it.link, author: it.author ?? '', fetched_at: it.published_at, read_at: null }], mode)
      if (id) navigate({ name: 'notes', id })
    } finally {
      setNoting(false)
    }
  }
  const load = async (): Promise<void> => {
    setState('loading')
    try {
      const page = await api.feeds.article(it.link)
      const doc = new DOMParser().parseFromString(page, 'text/html')
      const article = new Readability(doc, { charThreshold: 400 }).parse()
      if (!article?.content || (article.textContent ?? '').length < 400) throw new Error('no article text')
      setFull({ html: sanitize(article.content, it.link), minutes: Math.max(1, Math.round((article.textContent ?? '').split(/\s+/).length / 230)) })
      setState('idle')
    } catch {
      setState('failed')
    }
  }
  const t = topicOf(it.topic)
  const words = useMemo(() => it.summary.split(/\s+/).length, [it.summary])
  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-4 px-8 py-8">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="chip" style={{ background: t.color + '22', color: t.color }}>
          {t.icon} {t.label}
        </span>
        <LeanDot lean={it.lean} />
        <span>{it.feed_name}</span>
        {it.author && <span>· {it.author}</span>}
        <span>· {new Date(it.published_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
      </div>
      <h1 className="text-3xl leading-tight">{it.title}</h1>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={() => window.open(it.link)}>
          <Icon name="external" /> Open article
        </button>
        <button className="btn" disabled={saved} onClick={() => void saveForLater(it)}>
          <Icon name="bookmark" /> {saved ? 'Saved' : 'Save for later'}
        </button>
        <button className="btn" disabled={noting} onClick={() => void makeNote()} title="Make a structured note: summary, key points, who & where, numbers, quotes">
          📝 {noting ? 'Writing…' : 'Make notes'}
        </button>
        {!full && (
          <button className="btn" disabled={state === 'loading'} onClick={() => void load()}>
            <Icon name="note" /> {state === 'loading' ? 'Loading…' : 'Reader view'}
          </button>
        )}
      </div>
      {full ? (
        <>
          <div className="text-xs text-muted">{full.minutes} min read · text only</div>
          <div
            className="note-content reader"
            onClick={(e) => {
              const a = (e.target as HTMLElement).closest('a')
              if (a?.getAttribute('href')) {
                e.preventDefault()
                window.open(a.getAttribute('href')!)
              }
            }}
            dangerouslySetInnerHTML={{ __html: full.html }}
          />
        </>
      ) : (
        <>
          {it.summary && <p className="text-[15px] leading-relaxed">{it.summary}{words > 90 ? '…' : ''}</p>}
          {state === 'failed' && <p className="text-sm text-muted">This site doesn’t allow a reader view (paywall or app-only page) — open it in your browser instead.</p>}
        </>
      )}
    </article>
  )
}

// ---------- Manage feeds ----------

function ManageFeeds({ feeds, status, onClose }: { feeds: Feed[]; status: FeedStatus | null; onClose: () => void }): React.JSX.Element {
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [topic, setTopic] = useState<FeedTopic>('ai')
  const add = async (): Promise<void> => {
    let u = url.trim()
    if (!u) return
    if (!/^https?:\/\//i.test(u)) u = `https://${u}`
    await db.create('feeds', { url: u, name: name.trim() || new URL(u).hostname.replace(/^www\./, ''), topic, sort: feeds.length })
    setUrl('')
    setName('')
    void api.feeds.refresh()
  }
  return (
    <Modal title="Manage feeds" onClose={onClose} wide>
      <div className="flex flex-col gap-4 p-5">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void add()
          }}
        >
          <input className="field-boxed min-w-60 flex-1" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="RSS / Atom feed link (most blogs and Substacks: add /feed)" />
          <input className="field-boxed w-48" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" />
          <select className="field-boxed w-auto" value={topic} onChange={(e) => setTopic(e.target.value as FeedTopic)}>
            {TOPICS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.icon} {t.label}
              </option>
            ))}
          </select>
          <button className="btn-primary" disabled={!url.trim()}>
            <Icon name="plus" /> Add feed
          </button>
        </form>
        {TOPICS.filter((t) => feeds.some((f) => f.topic === t.id)).map((t) => (
          <div key={t.id}>
            <h3 className="mb-1 text-sm font-semibold">
              {t.icon} {t.label}
            </h3>
            <div className="divide-y divide-line/60 rounded-xl border border-line">
              {feeds
                .filter((f) => f.topic === t.id)
                .map((f) => (
                  <div key={f.id} className="group flex items-center gap-3 px-3 py-2 text-sm">
                    <input type="checkbox" checked={!!f.enabled} onChange={(e) => void db.update('feeds', f.id, { enabled: e.target.checked ? 1 : 0 })} title="Show this feed" />
                    <span className={`min-w-0 flex-1 truncate ${f.enabled ? '' : 'text-muted line-through'}`} title={f.url}>
                      {f.name}
                    </span>
                    {status?.errors[f.id] && <span className="text-xs text-amber-600" title={status.errors[f.id]}>⚠ not loading</span>}
                    {t.id === 'politics' && (
                      <select className="bg-transparent text-xs text-muted" value={f.lean} onChange={(e) => void db.update('feeds', f.id, { lean: e.target.value })} title="Rough political lean">
                        <option value="">no lean</option>
                        {LEANS.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.label}
                          </option>
                        ))}
                      </select>
                    )}
                    <select className="bg-transparent text-xs text-muted" value={f.topic} onChange={(e) => void db.update('feeds', f.id, { topic: e.target.value as FeedTopic })}>
                      {TOPICS.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.label}
                        </option>
                      ))}
                    </select>
                    <button className="btn-ghost invisible px-1 group-hover:visible" onClick={() => confirm(`Remove ${f.name}?`) && void db.remove('feeds', f.id)}>
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                ))}
            </div>
          </div>
        ))}
        <p className="text-xs text-muted">Political leans are rough labels (in the spirit of AllSides ratings) to help you notice how balanced your reading is. Change them if you disagree.</p>
      </div>
    </Modal>
  )
}
