// YouTube library: paste a link, get title + thumbnail automatically (no API key),
// watch it embedded, tag it, take notes, link it to a module.

import { useState } from 'react'
import { youtubeParts } from '@shared/links'
import type { Video } from '@shared/types'
import { AutoText } from '@/components/AutoField'
import { LabelInput } from '@/components/TaskDrawer'
import { Icon } from '@/components/ui'
import { api, db, track, useLive } from '@/lib/data'
import { navigate } from '@/lib/nav'
import { useMode } from '@/lib/profile'
import { parseLabels } from '@/lib/tasks'

const tagsOf = (v: Video): string[] => parseLabels({ labels: v.tags })
const thumb = (v: Video): string => v.thumbnail_url ?? `https://i.ytimg.com/vi/${v.youtube_id}/hqdefault.jpg`

export function VideosPage(): React.JSX.Element {
  const mode = useMode()
  const [link, setLink] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [tag, setTag] = useState('')
  const [q, setQ] = useState('')
  const { data } = useLive(
    ['videos', 'modules'],
    async () => {
      const [videos, modules] = await Promise.all([api.list('videos', { mode }, 'created_at'), api.list('modules')])
      return { videos: videos.reverse(), modules }
    },
    [mode]
  )

  const add = async (): Promise<void> => {
    const parts = youtubeParts(link)
    if (!parts) return setError("That doesn't look like a YouTube link.")
    setError('')
    setBusy(true)
    try {
      const info = await track(api.embed.lookup(link)) // null when offline: still save it
      const v = await db.create('videos', {
        url: link.trim(),
        youtube_id: parts.id,
        start_seconds: parts.start,
        title: info?.title || 'YouTube video',
        author: info?.author ?? '',
        thumbnail_url: info?.thumbnail_url ?? null,
        mode
      })
      setLink('')
      navigate({ name: 'video', id: v.id })
    } finally {
      setBusy(false)
    }
  }

  const allTags = [...new Set((data?.videos ?? []).flatMap(tagsOf))].sort()
  const lq = q.trim().toLowerCase()
  const shown = (data?.videos ?? []).filter(
    (v) => (!tag || tagsOf(v).includes(tag)) && (!lq || v.title.toLowerCase().includes(lq) || v.notes.toLowerCase().includes(lq))
  )

  return (
    <div className="mx-auto max-w-5xl p-8">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Videos</h1>
      <div className="card mb-5 flex flex-col gap-2 p-4">
        <div className="flex gap-2">
          <input
            className="field-boxed flex-1"
            placeholder="Paste a YouTube link (youtube.com/watch?v=…, youtu.be/…, shorts)"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void add()}
          />
          <button className="btn-primary" disabled={!link.trim() || busy} onClick={() => void add()}>
            <Icon name="plus" /> Add
          </button>
        </div>
        {error && <div className="text-xs text-danger">{error}</div>}
      </div>

      {(data?.videos.length ?? 0) > 0 && (
        <div className="mb-4 flex gap-2">
          <input className="field-boxed w-64" placeholder="Search videos…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="field-boxed w-auto" value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">All tags</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      )}

      {data?.videos.length === 0 && <div className="card p-10 text-center text-muted">Save lecture recordings, tutorials and talks here.</div>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
        {shown.map((v) => {
          const m = data?.modules.find((x) => x.id === v.module_id)
          return (
            <button key={v.id} className="card overflow-hidden text-left hover:shadow-md" onClick={() => navigate({ name: 'video', id: v.id })}>
              <div className="relative aspect-video bg-canvas">
                <img src={thumb(v)} alt="" className="h-full w-full object-cover" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                <span className="absolute inset-0 m-auto flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white">
                  <Icon name="play" />
                </span>
              </div>
              <div className="p-3">
                <div className="line-clamp-2 text-sm font-medium">{v.title}</div>
                <div className="mt-1 truncate text-xs text-muted">
                  {v.author}
                  {m && ` · ${m.code || m.name}`}
                </div>
                {tagsOf(v).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {tagsOf(v).map((t) => (
                      <span key={t} className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] text-accent">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function VideoPage({ id }: { id: string }): React.JSX.Element {
  const mode = useMode()
  const { data } = useLive(
    ['videos', 'modules'],
    async () => {
      const video = await api.get('videos', id)
      if (!video) return null
      const [modules, all] = await Promise.all([api.list('modules', { archived: 0 }, 'sort'), api.list('videos')])
      return { video, modules, knownTags: [...new Set(all.flatMap(tagsOf))].sort() }
    },
    [id]
  )
  if (data === undefined) return <div />
  if (data === null) return <div className="p-8 text-muted">This video was deleted.</div>
  const { video: v, modules, knownTags } = data
  const save = (patch: Partial<Video>): Promise<unknown> => db.update('videos', id, patch)
  const src = `https://www.youtube-nocookie.com/embed/${v.youtube_id}?rel=0&modestbranding=1${v.start_seconds ? `&start=${v.start_seconds}` : ''}`

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-8">
      <button className="btn-ghost -mb-1 -ml-2 self-start" onClick={() => navigate({ name: 'videos' })}>
        <Icon name="back" /> Videos
      </button>
      <div className="overflow-hidden rounded-xl border border-line bg-black">
        <iframe
          title={v.title}
          src={src}
          className="aspect-video w-full"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <AutoText value={v.title} onSave={(t) => save({ title: t || 'YouTube video' })} className="field text-xl font-semibold" />
          <div className="px-2 text-sm text-muted">{v.author}</div>
        </div>
        <button className="btn" onClick={() => window.open(`https://www.youtube.com/watch?v=${v.youtube_id}`)}>
          <Icon name="external" /> YouTube
        </button>
        <button className="btn-ghost hover:text-danger" title="Delete" onClick={() => confirm('Remove this video?') && void db.remove('videos', id).then(() => navigate({ name: 'videos' }))}>
          <Icon name="trash" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        {mode === 'study' && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Module</span>
            <select className="field-boxed" value={v.module_id ?? ''} onChange={(e) => void save({ module_id: e.target.value || null })}>
              <option value="">—</option>
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code ? `${m.code} · ` : ''}
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Tags</span>
          <LabelInput labels={tagsOf(v)} known={knownTags} onChange={(t) => void save({ tags: JSON.stringify(t) })} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-muted">Notes</span>
        <AutoText multiline rows={6} value={v.notes} onSave={(n) => save({ notes: n })} className="field-boxed" placeholder="Key points, timestamps…" />
      </label>
    </div>
  )
}
