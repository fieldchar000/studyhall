// DevKit → Reading list: articles saved for a proper read, with your notes. Also shows
// how balanced your politics reading has been (by rough source lean).

import { useEffect, useState } from 'react'
import type { FeedItem, SavedItem } from '@shared/types'
import { AutoText } from '@/components/AutoField'
import { Icon } from '@/components/ui'
import { api, db, useLive } from '@/lib/data'
import { LEANS, topicOf } from '@/lib/devContent'
import { LeanDot, Reader } from './Feeds'
import { MindmapGenerator } from '@/components/MindmapGenerator'

export function ReadingPage(): React.JSX.Element {
  const [status, setStatus] = useState<SavedItem['status']>('later')
  const [open, setOpen] = useState<SavedItem | null>(null)
  const [mapIt, setMapIt] = useState<'mindmap' | 'notes' | false>(false)
  const saved = useLive(['saved_items'], () => api.list('saved_items', {}, 'created_at'), []).data ?? []
  const shown = saved.filter((s) => s.status === status).reverse()

  if (open) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-line/70 px-6 py-2">
          <button className="btn-ghost" onClick={() => setOpen(null)}>
            <Icon name="back" /> Reading list
          </button>
          <div className="flex-1" />
          {open.status !== 'read' && (
            <button
              className="btn"
              onClick={() => {
                void db.update('saved_items', open.id, { status: 'read' })
                setOpen(null)
              }}
            >
              ✓ Done reading
            </button>
          )}
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[1fr_320px] overflow-hidden">
          <div className="overflow-auto">
            <Reader it={{ link: open.url, title: open.title, feed_name: open.source, topic: open.topic, lean: open.lean, summary: open.summary, published_at: open.published_at ?? open.created_at }} saved />
          </div>
          <aside className="flex flex-col gap-2 border-l border-line/70 p-4">
            <h2 className="text-sm font-bold">Your notes</h2>
            <AutoText multiline rows={18} value={open.notes} onSave={(v) => db.update('saved_items', open.id, { notes: v })} className="field-boxed text-sm" placeholder="Key claims, what you agree/disagree with, what to look into next…" />
          </aside>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-6 p-8 lg:grid-cols-[1fr_300px]">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl">Reading list</h1>
          <div className="flex gap-0.5 rounded-lg bg-line/50 p-0.5 text-sm">
            {(
              [
                ['later', 'To read'],
                ['read', 'Read'],
                ['archived', 'Archived']
              ] as const
            ).map(([k, label]) => (
              <button key={k} onClick={() => setStatus(k)} className={`rounded-md px-3 py-1 ${status === k ? 'bg-panel font-medium shadow-sm' : 'text-muted'}`}>
                {label} ({saved.filter((s) => s.status === k).length})
              </button>
            ))}
          </div>
        </div>
        {shown.length > 1 && (
          <div className="flex gap-2">
            <button className="btn" onClick={() => setMapIt('mindmap')}>
              <Icon name="mindmap" /> Mindmap these {shown.length}
            </button>
            <button className="btn" onClick={() => setMapIt('notes')}>
              📝 Make notes
            </button>
          </div>
        )}
        {mapIt && (
          <MindmapGenerator
            purpose={mapIt}
            onClose={() => setMapIt(false)}
            articles={shown.map((s) => ({ id: `saved:${s.id}`, feed_id: '', guid: s.url, title: s.title, link: s.url, author: '', summary: s.summary, published_at: s.published_at ?? s.created_at, fetched_at: s.created_at, read_at: null, feed_name: s.source, topic: s.topic, lean: s.lean }))}
          />
        )}
        {shown.length === 0 && <div className="card p-8 text-center text-sm text-muted">{status === 'later' ? 'Nothing waiting. Save articles from Feeds or the Briefing with the bookmark button.' : 'Nothing here yet.'}</div>}
        {shown.map((s) => {
          const t = topicOf(s.topic)
          return (
            <div key={s.id} className="card group flex gap-4 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg" style={{ background: t.color + '22' }}>
                {t.icon}
              </div>
              <div className="min-w-0 flex-1">
                <button className="text-left font-semibold hover:text-accent" onClick={() => setOpen(s)}>
                  {s.title}
                </button>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                  <LeanDot lean={s.lean} />
                  {s.source}
                  {s.notes && <span className="chip">📝 notes</span>}
                </div>
                {s.notes && <p className="mt-1 line-clamp-2 text-sm text-muted">{s.notes}</p>}
              </div>
              <div className="invisible flex items-start gap-1 group-hover:visible">
                {s.status !== 'read' && (
                  <button className="btn-ghost px-1.5" title="Mark read" onClick={() => void db.update('saved_items', s.id, { status: 'read' })}>
                    <Icon name="check" size={14} />
                  </button>
                )}
                {s.status !== 'archived' && (
                  <button className="btn-ghost px-1.5" title="Archive" onClick={() => void db.update('saved_items', s.id, { status: 'archived' })}>
                    <Icon name="folder" size={14} />
                  </button>
                )}
                <button className="btn-ghost px-1.5" title="Delete" onClick={() => void db.remove('saved_items', s.id)}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
      <Balance />
    </div>
  )
}

/** Politics reading over the last 30 days by rough source lean. */
function Balance(): React.JSX.Element {
  const [read, setRead] = useState<FeedItem[]>([])
  useEffect(() => {
    void api.feeds.items({ topic: 'politics', limit: 500 }).then((all) => setRead(all.filter((i) => i.read_at && Date.now() - Date.parse(i.read_at) < 30 * 864e5)))
  }, [])
  const counts = LEANS.map((l) => ({ ...l, n: read.filter((i) => i.lean === l.id).length })).filter((l) => l.n)
  const total = counts.reduce((a, b) => a + b.n, 0)
  const left = read.filter((i) => i.lean === 'left' || i.lean === 'lean-left').length
  const right = read.filter((i) => i.lean === 'right' || i.lean === 'lean-right' || i.lean === 'libertarian').length
  return (
    <aside className="card h-fit p-5">
      <h2 className="font-bold">Perspective balance</h2>
      <p className="mb-3 text-xs text-muted">Politics articles you opened in the last 30 days, by rough source lean.</p>
      {total === 0 ? (
        <p className="text-sm text-muted">Read a few politics articles in Feeds and your balance shows up here.</p>
      ) : (
        <>
          <div className="flex h-3 overflow-hidden rounded-full">
            {counts.map((c) => (
              <div key={c.id} style={{ width: `${(c.n / total) * 100}%`, background: c.color }} title={`${c.label}: ${c.n}`} />
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-1 text-xs">
            {counts.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                <span className="flex-1">{c.label}</span>
                <span className="text-muted">{c.n}</span>
              </div>
            ))}
          </div>
          {Math.abs(left - right) > Math.max(3, total * 0.4) && (
            <p className="mt-3 rounded-lg bg-accent-soft p-2 text-xs">
              Mostly {left > right ? 'left-leaning' : 'right-leaning'} sources lately — try reading the best case from the other side on the same story.
            </p>
          )}
        </>
      )}
    </aside>
  )
}
