// Active recall: every day, a few "pages" from each module — a PDF page, a slide, or a
// section of a note or document. You try to remember what's on it, then look and grade
// yourself; a simple Leitner schedule brings back what you missed sooner. All offline.

import { generateHTML, generateJSON } from '@tiptap/core'
import type { Material, Note, RecallCard } from '@shared/types'
import { api, db } from './data'
import { addDays, localDate } from './dates'
import { docToHtml, pdfText } from './importDoc'
import { NOTE_EXTENSIONS } from './noteSchema'

export type Result = 'got' | 'partly' | 'missed'

/** One page to recall. PDFs keep their bytes so the real page can be drawn. */
export interface RecallPage {
  cue: string
  html: string // cleaned HTML (notes and documents), or the page text for PDFs
  text: string
  pdf?: { data: Uint8Array; page: number }
}

type Source = { table: 'notes'; row: Note } | { table: 'materials'; row: Material }

const RECALLABLE = /\.(pdf|docx?|pptx?|odt|odp|md|markdown|txt|html?|rtf)$/i
const today = (): string => localDate(new Date())
const store = {
  get<T>(key: string): T | null {
    try {
      const v = localStorage.getItem(key)
      return v ? (JSON.parse(v) as T) : null
    } catch {
      return null
    }
  },
  set(key: string, v: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(v))
    } catch {
      /* optional cache */
    }
  }
}

// ---------- Settings (this PC) ----------

export const perModule = (): number => store.get<number>('recall.perModule') ?? 10
export const setPerModule = (n: number): void => store.set('recall.perModule', n)
export const hiddenModules = (): string[] => store.get<string[]>('recall.hidden') ?? []
export const setHiddenModules = (ids: string[]): void => store.set('recall.hidden', ids)

// ---------- Turning sources into pages ----------

const words = (s: string, n: number): string => {
  const w = s.replace(/\s+/g, ' ').trim().split(' ')
  return w.length > n ? `${w.slice(0, n).join(' ')}…` : w.join(' ')
}
const sanitize = (html: string): string => generateHTML(generateJSON(html, NOTE_EXTENSIONS), NOTE_EXTENSIONS)

/** Split HTML into sections at headings; long sections are cut into readable pieces. */
export function splitHtml(html: string): RecallPage[] {
  const body = new DOMParser().parseFromString(html, 'text/html').body
  const pages: RecallPage[] = []
  let cue = ''
  let parts: Element[] = []
  const flush = (): void => {
    const text = parts.map((p) => p.textContent ?? '').join('\n').trim()
    if (text.length >= 60 || parts.some((p) => p.querySelector('img') || p.tagName === 'IMG')) {
      pages.push({ cue: cue || words(text, 9), html: parts.map((p) => p.outerHTML).join(''), text })
    }
    parts = []
  }
  for (const el of Array.from(body.children)) {
    if (/^H[1-3]$/.test(el.tagName)) {
      flush()
      cue = (el.textContent ?? '').trim().slice(0, 140)
      continue
    }
    parts.push(el)
    if (parts.map((p) => p.textContent ?? '').join('').length > 1400) {
      flush()
      cue = cue ? `${cue} (cont.)`.replace(/( \(cont\.\))+$/, ' (cont.)') : ''
    }
  }
  flush()
  return pages
}

const pageCache = new Map<string, Promise<RecallPage[]>>()

/** All pages of a note or file (cached for this session). */
export function sourcePages(src: Source): Promise<RecallPage[]> {
  const key = `${src.row.id}:${src.row.updated_at}`
  let p = pageCache.get(key)
  if (!p) {
    p = (async (): Promise<RecallPage[]> => {
      if (src.table === 'notes') {
        let html = ''
        try {
          html = generateHTML(JSON.parse(src.row.content), NOTE_EXTENSIONS)
        } catch {
          html = `<p>${src.row.plain_text}</p>`
        }
        return splitHtml(html)
      }
      const doc = await api.materials.read(src.row.id)
      if (!doc) return []
      if (doc.ext === 'pdf') {
        const { pages } = await pdfText(doc.data)
        return pages.map((text, i) => ({ cue: words(text.split('\n')[0] ?? '', 12) || `Page ${i + 1}`, html: '', text, pdf: { data: doc.data, page: i + 1 } }))
      }
      const { html } = await docToHtml(doc, true)
      return splitHtml(sanitize(html))
    })()
    p.catch(() => pageCache.delete(key))
    pageCache.set(key, p)
  }
  return p
}

/** How many pages a source has (remembered between days so it is only worked out once). */
async function pageCount(src: Source): Promise<number> {
  const key = `recall.count.${src.row.id}.${src.row.updated_at}`
  const known = store.get<number>(key)
  if (known != null) return known
  const n = (
    await sourcePages(src).catch((e) => {
      console.warn('Active recall could not read', src.row.id, e)
      return []
    })
  ).length
  if (n > 0) store.set(key, n)
  return n
}

async function sourcesOf(moduleId: string): Promise<Source[]> {
  const [notes, files] = await Promise.all([api.list('notes', { module_id: moduleId }), api.list('materials', { module_id: moduleId })])
  return [
    ...notes.filter((n) => n.plain_text.trim().length > 80).map((row) => ({ table: 'notes' as const, row })),
    ...files.filter((f) => RECALLABLE.test(f.file_name)).map((row) => ({ table: 'materials' as const, row }))
  ]
}

export async function sourceFor(card: RecallCard): Promise<Source | null> {
  if (card.source_table === 'notes') {
    const row = await api.get('notes', card.source_id)
    return row ? { table: 'notes', row } : null
  }
  const row = await api.get('materials', card.source_id)
  return row ? { table: 'materials', row } : null
}

export async function pageFor(card: RecallCard): Promise<RecallPage | null> {
  const src = await sourceFor(card)
  if (!src) return null
  const pages = await sourcePages(src)
  return pages[card.locator] ?? null
}

// ---------- Today's set ----------

/** A small seeded shuffle, so the same day gives the same picks. */
function shuffle<T>(xs: T[], seed: string): T[] {
  let h = 2166136261
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  const rnd = (): number => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296
  const out = [...xs]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const building = new Map<string, Promise<RecallCard[]>>()

/** Today's cards for a module: what's due first, then new pages spread across its notes and files. */
export function todaysCards(moduleId: string): Promise<RecallCard[]> {
  const day = today()
  const key = `recall.day.${day}.${moduleId}`
  let job = building.get(key)
  if (!job) {
    job = (async (): Promise<RecallCard[]> => {
      const cards = await api.list('recall_cards', { module_id: moduleId })
      const byId = new Map(cards.map((c) => [c.id, c]))
      const saved = store.get<string[]>(key)
      if (saved) {
        const kept = saved.map((id) => byId.get(id)).filter((c): c is RecallCard => !!c)
        if (kept.length) return kept
      }
      const want = perModule()
      const picked: RecallCard[] = cards
        .filter((c) => c.due_on && c.due_on <= day)
        .sort((a, b) => (a.due_on ?? '').localeCompare(b.due_on ?? '') || a.box - b.box)
        .slice(0, want)

      if (picked.length < want) {
        // New pages, taken in turn from each source so one long PDF doesn't fill the day.
        const used = new Set(cards.map((c) => `${c.source_id}:${c.locator}`))
        const queues: { src: Source; pages: number[] }[] = []
        for (const src of shuffle(await sourcesOf(moduleId), day + moduleId)) {
          const n = await pageCount(src)
          const free = shuffle(
            Array.from({ length: n }, (_, i) => i).filter((i) => !used.has(`${src.row.id}:${i}`)),
            day + src.row.id
          )
          if (free.length) queues.push({ src, pages: free })
        }
        while (picked.length < want && queues.some((q) => q.pages.length)) {
          for (const q of queues) {
            const locator = q.pages.shift()
            if (locator == null || picked.length >= want) continue
            const isPdf = q.src.table === 'materials' && /\.pdf$/i.test(q.src.row.file_name)
            const title = q.src.table === 'notes' ? q.src.row.title || 'Untitled note' : q.src.row.title
            picked.push(
              await db.create('recall_cards', {
                module_id: moduleId,
                source_table: q.src.table,
                source_id: q.src.row.id,
                locator,
                label: `${title} · ${isPdf ? 'page' : 'part'} ${locator + 1}`,
                box: 0,
                due_on: day
              })
            )
          }
        }
      }
      if (picked.length < want) {
        // Everything has been seen: bring back the ones reviewed longest ago.
        const chosen = new Set(picked.map((c) => c.id))
        const older = cards.filter((c) => !chosen.has(c.id)).sort((a, b) => (a.last_reviewed_at ?? '').localeCompare(b.last_reviewed_at ?? ''))
        picked.push(...older.slice(0, want - picked.length))
      }
      store.set(
        key,
        picked.map((c) => c.id)
      )
      return picked
    })()
    // Only share a build while it runs; afterwards localStorage keeps the day's set stable,
    // so a module that gets its first files later in the day still gets pages.
    building.set(key, job)
    job.finally(() => building.delete(key)).catch(() => {})
  }
  return job
}

/** Forget today's set for a module (e.g. after changing how many pages a day). */
export function resetToday(moduleId: string): void {
  building.delete(`recall.day.${today()}.${moduleId}`)
  try {
    localStorage.removeItem(`recall.day.${today()}.${moduleId}`)
  } catch {
    /* nothing to forget */
  }
}

const GAPS = [1, 2, 4, 8, 16, 32] // days until the next review, by box

/** Grade a card: got it → longer gap; partly → soon; missed → tomorrow. */
export async function grade(card: RecallCard, result: Result): Promise<RecallCard> {
  const box = result === 'got' ? Math.min(card.box + 1, GAPS.length - 1) : result === 'partly' ? Math.max(1, Math.min(card.box, 2)) : 0
  const gap = result === 'missed' ? 1 : result === 'partly' ? 2 : GAPS[box]
  return db.update('recall_cards', card.id, {
    box,
    due_on: addDays(today(), gap),
    last_result: result,
    reviews: card.reviews + 1,
    last_reviewed_at: new Date().toISOString()
  })
}

/** Reviewed today (on this PC's calendar day)? */
export const doneToday = (c: RecallCard): boolean => !!c.last_reviewed_at && localDate(new Date(c.last_reviewed_at)) === today()

// ---------- Drawing a PDF page ----------

export async function drawPdfPage(data: Uint8Array, page: number, canvas: HTMLCanvasElement, width: number): Promise<void> {
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const task = pdfjs.getDocument({ data: data.slice() })
  try {
    const doc = await task.promise
    const p = await doc.getPage(page)
    const base = p.getViewport({ scale: 1 })
    const ratio = window.devicePixelRatio || 1
    const vp = p.getViewport({ scale: (width / base.width) * ratio })
    canvas.width = vp.width
    canvas.height = vp.height
    canvas.style.width = `${width}px`
    canvas.style.height = `${vp.height / ratio}px`
    await p.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport: vp }).promise
  } finally {
    await task.destroy()
  }
}
