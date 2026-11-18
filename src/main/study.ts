// Nova and your study files (the HTML lessons, notes and quizzes in Studyhall's library):
//  • findMaterials: which file you mean ("my week 3 PNS notes")
//  • readMaterial: its text (slides and notes) and the quiz questions already in it
//  • saveFlashcards: questions you missed, as a deck
// Your HTML study files are little apps: their quizzes live as data inside the page's code. The questions are pulled
// out by reading that data as plain values (strings, numbers, lists): the file's code is never run here. The slide text
// is read in a hidden, sandboxed window with no internet and no Studyhall access, so the page builds itself as it
// does when you open it, and only its text comes back.

import { app, BrowserWindow, session } from 'electron'
import { stat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Material } from '@shared/types'
import { create, getDb, list } from './db'
import { ensureLocalFile } from './cloud/sync'
import { extractQuizzes, type QuizQ } from './quizExtract'

export type { QuizQ }

export interface FoundMaterial {
  id: string
  title: string
  kind: string
  module: string
  week: number | null
}

// ---------- Which file? ----------

export function findMaterials(query: string, max = 8): FoundMaterial[] {
  const rows = getDb()
    .prepare(
      `SELECT m.id, m.title, m.kind, m.file_name, m.updated_at, COALESCE(NULLIF(mo.code, ''), mo.name, '') AS module, mo.name AS module_name, w.number AS week
       FROM materials m LEFT JOIN modules mo ON mo.id = m.module_id LEFT JOIN weeks w ON w.id = m.week_id
       WHERE m.deleted_at IS NULL`
    )
    .all() as unknown as { id: string; title: string; kind: string; file_name: string; updated_at: string; module: string; module_name: string | null; week: number | null }[]
  const q = query.toLowerCase()
  const words = q.match(/[a-z0-9]{2,}/g) ?? []
  const wantWeek = Number(/\b(?:week|wk|w)\s*0?(\d{1,2})\b/.exec(q)?.[1] ?? 0)
  const scored = rows.map((r) => {
    const hay = `${r.title} ${r.file_name} ${r.module} ${r.module_name ?? ''} ${r.week ? `week ${r.week}` : ''}`.toLowerCase()
    let s = words.filter((w) => !['week', 'my', 'the', 'notes', 'on', 'for', 'from', 'me', 'quiz', 'teach'].includes(w) && hay.includes(w)).length
    if (wantWeek && (r.week === wantWeek || new RegExp(`\\bweek\\s*0?${wantWeek}\\b`).test(hay))) s += 2
    if (r.kind === 'html') s += 0.1
    return { r, s }
  })
  const hits = scored.filter((x) => x.s >= 1).sort((a, b) => b.s - a.s || b.r.updated_at.localeCompare(a.r.updated_at))
  const pick = (hits.length ? hits : scored.sort((a, b) => b.r.updated_at.localeCompare(a.r.updated_at))).slice(0, max)
  return pick.map(({ r }) => ({ id: r.id, title: r.title, kind: r.kind, module: r.module, week: r.week }))
}

// ---------- The page's text (slides and notes) ----------

let readerSession: Electron.Session | null = null
function reader(): Electron.Session {
  if (readerSession) return readerSession
  readerSession = session.fromPartition('nova-reader') // in memory only
  // No internet and nothing else: only the file itself and what's inside it.
  readerSession.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !/^(file|data|blob|about):/i.test(d.url) }))
  readerSession.setPermissionRequestHandler((_wc, _p, cb) => cb(false))
  return readerSession
}

async function pageText(path: string): Promise<{ title: string; heads: string[]; text: string }> {
  const w = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: { session: reader(), sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: true, offscreen: true, backgroundThrottling: false, spellcheck: false }
  })
  w.webContents.setAudioMuted(true)
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  w.webContents.on('will-navigate', (e) => e.preventDefault())
  try {
    await Promise.race([w.loadFile(path), new Promise((_, rej) => setTimeout(() => rej(new Error('took too long')), 15_000))])
    await new Promise((r) => setTimeout(r, 1200)) // the page builds its slides
    const raw = await w.webContents.executeJavaScript(
      `(() => {
        const b = document.body.cloneNode(true)
        b.querySelectorAll('script,style,noscript,svg,canvas,template,iframe').forEach((e) => e.remove())
        b.querySelectorAll('p,div,li,h1,h2,h3,h4,h5,h6,section,article,br,tr,td,th,dt,dd,button,label').forEach((e) => e.append('\\n'))
        const heads = [...document.querySelectorAll('h1,h2,h3')].map((h) => h.textContent.trim()).filter(Boolean).slice(0, 120)
        return JSON.stringify({ title: document.title, heads, text: b.textContent })
      })()`
    )
    const j = JSON.parse(String(raw)) as { title: string; heads: string[]; text: string }
    const text = j.text
      .split('\n')
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter((l, i, a) => l && l !== a[i - 1])
      .join('\n')
    return { title: j.title, heads: [...new Set(j.heads)], text }
  } finally {
    w.destroy()
  }
}

// ---------- Reading a material ----------

const cache = new Map<string, { at: number; title: string; heads: string[]; text: string; quiz: QuizQ[] }>()

/** The file's text and its quiz questions. otherText: how to get text from a PDF/Word file (the renderer does that). */
export async function readMaterial(id: string, otherText: (id: string) => Promise<string>): Promise<{ title: string; heads: string[]; text: string; quiz: QuizQ[] }> {
  const m = list<Material & { local_path: string | null; kind: string; file_name: string }>('materials').find((x) => x.id === id)
  if (!m) throw new Error('No such file in your library.')
  if (!(await ensureLocalFile(m as never))) throw new Error('That file isn’t on this PC yet.')
  const path = join(app.getPath('userData'), m.local_path ?? '')
  const info = await stat(path)
  const hit = cache.get(id)
  if (hit && hit.at === info.mtimeMs) return hit
  let out: { title: string; heads: string[]; text: string; quiz: QuizQ[] }
  if (/\.html?$/i.test(path)) {
    const html = await readFile(path, 'utf8')
    const quiz = extractQuizzes(html)
    const page = await pageText(path).catch(() => ({ title: m.title, heads: [] as string[], text: html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, '\n').replace(/\n\s*\n+/g, '\n') }))
    out = { title: m.title || page.title, heads: page.heads, text: page.text, quiz }
  } else {
    const text = await otherText(id)
    out = { title: m.title, heads: [], text, quiz: [] }
  }
  cache.set(id, { at: info.mtimeMs, ...out })
  if (cache.size > 12) cache.delete(cache.keys().next().value!)
  return out
}

/** The part of a long text most about a topic (paragraphs scored by its words), up to max characters. */
export function focusText(text: string, topic: string, max = 14_000): string {
  if (text.length <= max || !topic.trim()) return text.slice(0, max)
  const words = (topic.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((w) => !['the', 'and', 'how', 'what', 'about', 'teach', 'explain', 'week', 'notes'].includes(w))
  const paras = text.split('\n')
  const score = paras.map((p, i) => ({ i, s: words.reduce((n, w) => n + (p.toLowerCase().includes(w) ? 1 : 0), 0) }))
  const keep = new Set<number>()
  let size = 0
  for (const { i } of score.filter((x) => x.s > 0).sort((a, b) => b.s - a.s)) {
    for (let j = Math.max(0, i - 2); j <= Math.min(paras.length - 1, i + 4); j++) {
      if (keep.has(j)) continue
      keep.add(j)
      size += paras[j].length + 1
    }
    if (size > max) break
  }
  if (!keep.size) return text.slice(0, max)
  return [...keep]
    .sort((a, b) => a - b)
    .map((i) => paras[i])
    .join('\n')
    .slice(0, max)
}

// ---------- Flashcards ----------

export function saveFlashcards(deckName: string, cards: { front: string; back: string }[], moduleId: string | null = null): { deck: string; count: number } {
  const name = deckName.trim().slice(0, 80) || 'Nova quiz'
  const deck = (list<{ id: string; name: string }>('flashcard_decks').find((d) => d.name === name) ?? create<{ id: string; name: string }>('flashcard_decks', { name, module_id: moduleId })) as { id: string; name: string }
  let n = 0
  for (const c of cards.slice(0, 100)) {
    if (!c.front?.trim() || !c.back?.trim()) continue
    create('flashcards', { deck_id: deck.id, front: c.front.trim().slice(0, 1000), back: c.back.trim().slice(0, 2000), ease: 2.5, interval_days: 0, repetitions: 0, due_at: null })
    n++
  }
  return { deck: deck.name, count: n }
}

/** Questions from your flashcards (a deck by name, or the ones due first). */
export function flashcardQuestions(deckQuery: string, max = 20): { deck: string; quiz: QuizQ[] } {
  const decks = list<{ id: string; name: string }>('flashcard_decks')
  const q = deckQuery.toLowerCase()
  const deck = decks.find((d) => d.name.toLowerCase().includes(q)) ?? decks.find((d) => (q.match(/[a-z0-9]{3,}/g) ?? []).some((w) => d.name.toLowerCase().includes(w)))
  const cards = list<{ deck_id: string; front: string; back: string; due_at: string | null }>('flashcards').filter((c) => !deck || c.deck_id === deck.id)
  cards.sort((a, b) => (a.due_at ?? '').localeCompare(b.due_at ?? ''))
  return { deck: deck?.name ?? 'all your flashcards', quiz: cards.slice(0, max).map((c) => ({ q: c.front, answerText: c.back })) }
}
