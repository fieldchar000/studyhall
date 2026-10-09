// "Generate a mindmap" / "Make notes": pick any mix of files (PDF, Word, PowerPoint,
// HTML…), notes and news articles; Studyhall builds an interactive map or structured notes
// from their structure, most central sentences and shared ideas (offline, no AI service).

import { useMemo, useState } from 'react'
import { generateHTML, generateJSON } from '@tiptap/core'
import { Readability } from '@mozilla/readability'
import type { FeedItem, Mode, Note, PickedDoc } from '@shared/types'
import { api, notifyChanged, useLive } from '@/lib/data'
import { docToHtml, docToNote } from '@/lib/importDoc'
import { bestOutline, buildMap, sharedPhrases, type Size, type Source, type Style } from '@/lib/mindgen'
import { makeNotes, type AutoNote } from '@/lib/autonotes'
import { navigate } from '@/lib/nav'
import { NOTE_EXTENSIONS, htmlToPlain } from '@/lib/noteSchema'
import { useMode, useProfile } from '@/lib/profile'
import { topicOf } from '@/lib/devContent'
import { Icon, Modal } from './ui'

type Tab = 'files' | 'notes' | 'articles'

const errText = (e: unknown): string => String(e instanceof Error ? e.message : e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

/** Full article text via the reader view; falls back to the feed summary. */
export async function articleSource(it: { link: string; title: string; summary: string; feed_name: string }): Promise<Source> {
  let html = `<p>${it.summary}</p>`
  let text = it.summary
  try {
    const doc = new DOMParser().parseFromString(await api.feeds.article(it.link), 'text/html')
    const a = new Readability(doc).parse()
    if (a?.content && (a.textContent ?? '').length > 400) {
      html = a.content
      text = a.textContent ?? text
    }
  } catch {
    /* paywalled or offline: use the summary */
  }
  // The publisher's own name turns up in every article; it's not a theme.
  const site = it.feed_name.replace(/^📌\s*/, '').split(/\s+[—–-]\s+/)[0]
  let host = ''
  try {
    host = new URL(it.link).hostname.replace(/^www\./, '').split('.')[0]
  } catch {
    /* not a URL */
  }
  const noise = [site, site.replace(/^(The|International)\s+/, ''), host].filter(Boolean)
  return { title: it.title, kind: 'article', text, sections: bestOutline(html, text, it.title), url: it.link, noise }
}

/** Save auto-notes as real notes (and flashcards if asked). Returns the first note's id. */
export async function saveAutoNotes(list: AutoNote[], mode: Mode, flashcards: boolean): Promise<string | null> {
  let first: string | null = null
  for (const n of list) {
    const json = generateJSON(n.html, NOTE_EXTENSIONS)
    const plain = htmlToPlain(n.html)
    const note = await api.create('notes', { mode, title: n.title.slice(0, 200), content: JSON.stringify(json), plain_text: plain })
    first ??= note.id
    if (flashcards && n.flashcards.length) {
      const deck = await api.create('flashcard_decks', { name: `${n.title.slice(0, 80)} — auto flashcards` })
      for (const c of n.flashcards) await api.create('flashcards', { deck_id: deck.id, front: c.front, back: c.back })
    }
  }
  notifyChanged('*')
  return first
}

/** One click: notes for one or more articles (used by the reader and Feeds). */
export async function quickArticleNotes(items: FeedItem[], mode: Mode, combine = true): Promise<string | null> {
  const sources: Source[] = []
  for (const it of items) sources.push(await articleSource(it))
  return saveAutoNotes(makeNotes(sources, { combine }), mode, false)
}

export function MindmapGenerator({
  onClose,
  articles: preset,
  purpose = 'mindmap'
}: {
  onClose: () => void
  articles?: FeedItem[]
  purpose?: 'mindmap' | 'notes'
}): React.JSX.Element {
  const mode = useMode()
  const [combine, setCombine] = useState(true)
  const [cards, setCards] = useState(true)
  const profile = useProfile()
  const [tab, setTab] = useState<Tab>(preset?.length ? 'articles' : 'files')
  const [title, setTitle] = useState('')
  const [files, setFiles] = useState<PickedDoc[]>([])
  const [saveNotes, setSaveNotes] = useState(purpose === 'mindmap')
  const [noteIds, setNoteIds] = useState<Set<string>>(new Set())
  const [articleIds, setArticleIds] = useState<Set<string>>(new Set(preset?.map((p) => p.id)))
  const [style, setStyle] = useState<Style>('overview')
  const [size, setSize] = useState<Size>('compact')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')

  const notes = useLive(['notes'], () => api.list('notes', { mode }, 'updated_at'), [mode]).data ?? []
  const [feedItems, setFeedItems] = useState<FeedItem[] | null>(null)
  const saved = useLive(['saved_items'], () => api.list('saved_items'), []).data ?? []
  const showArticles = !!profile?.devkit || !!preset?.length
  const loadArticles = (): void => {
    if (feedItems) return
    void api.feeds.items({ limit: 300 }).then(setFeedItems)
  }
  const articleList: FeedItem[] = useMemo(() => {
    const fromSaved: FeedItem[] = saved.map((s) => ({
      id: `saved:${s.id}`,
      feed_id: '',
      guid: s.url,
      title: s.title,
      link: s.url,
      author: '',
      summary: s.summary,
      published_at: s.published_at ?? s.created_at,
      fetched_at: s.created_at,
      read_at: null,
      feed_name: `📌 ${s.source}`,
      topic: s.topic,
      lean: s.lean
    }))
    const all = [...(preset ?? []), ...fromSaved, ...(feedItems ?? [])]
    const seen = new Set<string>()
    return all.filter((a) => (seen.has(a.link) ? false : (seen.add(a.link), true)))
  }, [saved, feedItems, preset])

  const count = files.length + noteIds.size + articleIds.size
  const toggle = (set: Set<string>, id: string, fn: (s: Set<string>) => void): void => {
    const s = new Set(set)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    fn(s)
  }

  const generate = async (): Promise<void> => {
    setError(null)
    try {
      const sources: Source[] = []
      for (const [i, f] of files.entries()) {
        setBusy(`Reading ${f.name} (${i + 1}/${files.length})…`)
        const doc = await docToHtml(f, false)
        let noteId: string | undefined
        if (saveNotes) {
          const n = await docToNote(f)
          noteId = (await api.create('notes', { mode, title: n.title, content: n.content, plain_text: n.plain })).id
        }
        sources.push({ title: doc.title, kind: 'file', text: doc.text, sections: bestOutline(doc.html, doc.text, doc.title), noteId })
      }
      for (const id of noteIds) {
        const n = notes.find((x) => x.id === id)
        if (!n) continue
        let html = `<p>${n.plain_text}</p>`
        try {
          html = generateHTML(JSON.parse(n.content), NOTE_EXTENSIONS)
        } catch {
          /* plain-text note */
        }
        sources.push({ title: n.title, kind: 'note', text: n.plain_text, sections: bestOutline(html, n.plain_text, n.title), noteId: n.id })
      }
      const picked = articleList.filter((a) => articleIds.has(a.id))
      for (const [i, a] of picked.entries()) {
        setBusy(`Reading article ${i + 1}/${picked.length}…`)
        sources.push(await articleSource(a))
      }
      if (!sources.length) return
      if (purpose === 'notes') {
        setBusy('Writing notes…')
        const id = await saveAutoNotes(makeNotes(sources, { title: title.trim() || undefined, combine }), mode, cards)
        onClose()
        if (id) navigate({ name: 'notes', id })
        return
      }
      setBusy('Building the map…')
      const themes = sharedPhrases(sources, 3).map((t) => t.text.charAt(0).toUpperCase() + t.text.slice(1))
      const name = title.trim() || (sources.length === 1 ? sources[0].title : themes.length ? themes.join(' · ') : style === 'theme' ? 'What these sources share' : `${sources.length} sources`)
      const built = buildMap(style, name, sources, size)
      if (built.nodes.length < 2) throw new Error('Couldn’t find enough structure or shared ideas in these sources — try another style, or add more text.')
      // Keep the sources' text (trimmed) so the map can show everything said about an idea.
      let budget = 300_000
      const kept = sources.map((s) => {
        const text = s.text.slice(0, Math.min(25_000, Math.max(0, budget)))
        budget -= text.length
        return { title: s.title, kind: s.kind, url: s.url ?? '', noteId: s.noteId ?? null, text }
      })
      const map = await api.create('mindmaps', { title: name.slice(0, 200), mode, sources: JSON.stringify(kept) })
      const ids = new Map<string, string>()
      for (const n of built.nodes) {
        const row = await api.create('mindmap_nodes', {
          mindmap_id: map.id,
          label: n.label,
          x: n.x,
          y: n.y,
          color: n.color || null,
          kind: n.kind,
          detail: n.detail,
          url: n.url,
          source: n.source,
          link_type: n.noteId ? 'note' : null,
          link_id: n.noteId ?? null,
          collapsed: size === 'detailed' && n.kind === 'branch' ? 1 : 0
        })
        ids.set(n.key, row.id)
      }
      for (const e of built.edges) {
        const a = ids.get(e.from)
        const b = ids.get(e.to)
        if (a && b) await api.create('mindmap_edges', { mindmap_id: map.id, source_node_id: a, target_node_id: b, kind: e.kind, label: e.label })
      }
      notifyChanged('*')
      onClose()
      navigate({ name: 'mindmap', id: map.id })
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(null)
    }
  }

  const filteredNotes = notes.filter((n: Note) => !q || n.title.toLowerCase().includes(q.toLowerCase())).reverse()
  const filteredArticles = articleList.filter((a) => !q || a.title.toLowerCase().includes(q.toLowerCase())).slice(0, 150)

  return (
    <Modal title={purpose === 'notes' ? '📝 Make notes automatically' : '✨ Generate a mindmap'} onClose={onClose} wide>
      <div className="grid h-full min-h-0 grid-cols-[1fr_300px]">
        <div className="flex min-h-0 flex-col gap-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-0.5 rounded-lg bg-line/50 p-0.5 text-sm">
              {(
                [
                  ['files', `📁 Files${files.length ? ` (${files.length})` : ''}`],
                  ['notes', `📝 Notes${noteIds.size ? ` (${noteIds.size})` : ''}`],
                  ...(showArticles ? [['articles', `📰 Articles${articleIds.size ? ` (${articleIds.size})` : ''}`]] : [])
                ] as [Tab, string][]
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => {
                    setTab(k)
                    if (k === 'articles') loadArticles()
                  }}
                  className={`rounded-md px-3 py-1 ${tab === k ? 'bg-panel font-medium shadow-sm' : 'text-muted'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {tab !== 'files' && <input className="field-boxed ml-auto w-56" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />}
          </div>

          {tab === 'files' && (
            <div
              className="flex min-h-0 flex-1 flex-col gap-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const paths = [...e.dataTransfer.files].map((f) => api.materials.pathForFile(f)).filter(Boolean)
                if (paths.length) void api.docs.read(paths).then((d) => setFiles((fs) => [...fs, ...d])).catch((er) => setError(errText(er)))
              }}
            >
              <button
                className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line p-8 text-sm text-muted hover:border-accent hover:text-ink"
                onClick={() => void api.docs.pick('Files for the mindmap').then((d) => setFiles((fs) => [...fs, ...d])).catch((er) => setError(errText(er)))}
              >
                <Icon name="upload" size={22} />
                Choose or drop lecture slides, PDFs, Word, HTML or Markdown files
                <span className="text-xs">Several at once is fine — each becomes a branch, linked where they overlap.</span>
              </button>
              <ul className="flex flex-col gap-1 overflow-auto text-sm">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 rounded-lg bg-canvas/60 px-3 py-1.5">
                    <Icon name="file" size={14} className="text-muted" />
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <button className="btn-ghost px-1" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                      <Icon name="x" size={13} />
                    </button>
                  </li>
                ))}
              </ul>
              {files.length > 0 && purpose === 'mindmap' && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={saveNotes} onChange={(e) => setSaveNotes(e.target.checked)} />
                  Also save each file as a note (map ideas link back to it)
                </label>
              )}
            </div>
          )}

          {tab === 'notes' && (
            <ul className="min-h-0 flex-1 overflow-auto rounded-xl border border-line">
              {filteredNotes.length === 0 && <li className="p-4 text-sm text-muted">No notes in this category yet.</li>}
              {filteredNotes.map((n) => (
                <li key={n.id}>
                  <label className="flex cursor-pointer items-center gap-3 border-b border-line/50 px-3 py-2 text-sm hover:bg-line/30">
                    <input type="checkbox" checked={noteIds.has(n.id)} onChange={() => toggle(noteIds, n.id, setNoteIds)} />
                    <span className="min-w-0 flex-1 truncate font-medium">{n.title}</span>
                    <span className="text-xs text-muted">{Math.round(n.plain_text.length / 5)} words</span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          {tab === 'articles' && (
            <ul className="min-h-0 flex-1 overflow-auto rounded-xl border border-line">
              {!feedItems && !preset?.length && saved.length === 0 && <li className="p-4 text-sm text-muted">Loading…</li>}
              {filteredArticles.map((a) => (
                <li key={a.id}>
                  <label className="flex cursor-pointer items-start gap-3 border-b border-line/50 px-3 py-2 text-sm hover:bg-line/30">
                    <input type="checkbox" className="mt-1" checked={articleIds.has(a.id)} onChange={() => toggle(articleIds, a.id, setArticleIds)} />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 font-medium">{a.title}</span>
                      <span className="text-xs text-muted">
                        {topicOf(a.topic).icon} {a.feed_name}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
        </div>

        <aside className="flex flex-col gap-4 border-l border-line p-5 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Title (optional)</span>
            <input className="field-boxed" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Week 4 — Memory" />
          </label>
          {purpose === 'mindmap' ? (
            <>
              <div className="flex flex-col gap-2">
                <span className="text-xs text-muted">Style</span>
                {(
                  [
                    ['overview', '✨ Overview', 'The full picture: the gist, key ideas, key terms, people / places / organisations, numbers, timeline, debate and sources.'],
                    ['source', '📂 By source', 'Each file / note / article as a branch with its headings and best points. Great for lecture slides.'],
                    ['theme', '🔗 Shared themes', 'The ideas and names your sources share, with what each one says. Great for comparing news.']
                  ] as const
                ).map(([k, label, hint]) => (
                  <button key={k} onClick={() => setStyle(k)} className={`rounded-xl border p-3 text-left ${style === k ? 'border-accent bg-accent-soft' : 'border-line hover:border-accent/40'}`}>
                    <div className="font-semibold">{label}</div>
                    <div className="text-xs text-muted">{hint}</div>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">Size</span>
                <div className="flex gap-0.5 rounded-lg bg-line/50 p-0.5">
                  {(['compact', 'detailed'] as Size[]).map((sz) => (
                    <button key={sz} onClick={() => setSize(sz)} className={`rounded-md px-3 py-1 capitalize ${size === sz ? 'bg-panel font-medium shadow-sm' : 'text-muted'}`}>
                      {sz}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <span className="text-xs text-muted">Notes</span>
                {(
                  [
                    [true, 'One combined note', 'A briefing (articles) or revision notes (files) covering everything you picked.'],
                    [false, 'One note per source', 'A separate note for each file, note or article.']
                  ] as const
                ).map(([k, label, hint]) => (
                  <button key={String(k)} onClick={() => setCombine(k)} className={`rounded-xl border p-3 text-left ${combine === k ? 'border-accent bg-accent-soft' : 'border-line hover:border-accent/40'}`}>
                    <div className="font-semibold">{label}</div>
                    <div className="text-xs text-muted">{hint}</div>
                  </button>
                ))}
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={cards} onChange={(e) => setCards(e.target.checked)} />
                <span>
                  Also make flashcards
                  <span className="block text-xs text-muted">From key terms and section headings in study material.</span>
                </span>
              </label>
              <p className="text-xs text-muted">
                Notes include a summary, key points, key terms, who &amp; where, numbers, quotes, a timeline and questions to test yourself — whatever the sources contain.
              </p>
            </div>
          )}
          <div className="mt-auto flex flex-col gap-2">
            <button className="btn-primary justify-center py-2" disabled={!count || !!busy} onClick={() => void generate()}>
              <Icon name="spark" /> {busy ?? (count ? `${purpose === 'notes' ? 'Make notes from' : 'Generate from'} ${count} source${count === 1 ? '' : 's'}` : 'Pick some sources')}
            </button>
            <p className="text-[11px] text-muted">Built on this PC from the sources’ structure, most central sentences (TextRank) and shared phrases — no AI service. Everything stays editable.</p>
          </div>
        </aside>
      </div>
    </Modal>
  )
}
