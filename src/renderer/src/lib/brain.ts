// The Brain: everything in Studyhall as one web of connected dots — modules, weeks, notes,
// files, assessments, people, memories, journal days — plus the ideas that run through them.
//
// How things get linked (all offline, no AI):
//  • Structure the app already knows: a note filed in a week, a detail saved on a person…
//  • Mentions: a journal day or note that names someone, or a module code, links to it.
//  • [[Double brackets]]: type [[Alex]] or [[Elasticity]] anywhere to link on purpose.
//  • Ideas: headings, bold text and slide titles that turn up in two or more places become
//    an idea dot joining them — that's how a lecture PDF, your notes and a flashcard deck
//    on "price elasticity" end up next to each other.
// Nothing new is stored or synced: the Brain is worked out on this PC from what's already here.

import type { Assessment, FlashcardDeck, FocusSession, Material, Module, Note, Person, PersonFact, RecallCard, Task, Week } from '@shared/types'
import { api } from './data'
import { docToText, pdfText } from './importDoc'
import { cleanPdfPages } from './recall'
import type { Route } from './nav'

export type Kind =
  | 'module'
  | 'week'
  | 'note'
  | 'material'
  | 'assessment'
  | 'task'
  | 'deck'
  | 'mindmap'
  | 'paper'
  | 'project'
  | 'video'
  | 'person'
  | 'fact'
  | 'moment'
  | 'plan'
  | 'journal'
  | 'language'
  | 'media'
  | 'idea'

export type Side = 'study' | 'life' | 'other'

export type Open = { route: Route; mode?: 'study' | 'life' } | { material: Material } | { task: string }

export interface BNode {
  id: string
  kind: Kind
  label: string
  sub: string // a short description ("Week 3 · EC1101", "Loves & likes")
  text: string // everything searchable
  color: string
  side: Side
  date: string | null
  open: Open | null
  degree: number
}

export interface BEdge {
  a: string
  b: string
  why: 'part' | 'mention' | 'link' | 'idea'
}

export interface Brain {
  nodes: Map<string, BNode>
  edges: BEdge[]
  adj: Map<string, Set<string>>
  // Raw rows the question answerer needs
  people: Person[]
  facts: PersonFact[]
  modules: Module[]
  weeks: Week[]
  assessments: Assessment[]
  tasks: Task[]
  notes: Note[]
  materials: Material[]
  decks: FlashcardDeck[]
  focus: FocusSession[]
  recall: RecallCard[]
  partnerId: string | null
  partnerLabel: string
  docText: Map<string, string> // node id → full text (notes, files, journal…)
  unread: number // files not read yet
}

export const KIND_LABEL: Record<Kind, string> = {
  module: 'Module',
  week: 'Week',
  note: 'Note',
  material: 'File',
  assessment: 'Assessment',
  task: 'Task',
  deck: 'Flashcard deck',
  mindmap: 'Mindmap',
  paper: 'Past paper',
  project: 'Project',
  video: 'Video',
  person: 'Person',
  fact: 'Detail',
  moment: 'Memory',
  plan: 'Plan',
  journal: 'Journal day',
  language: 'Language',
  media: 'Library',
  idea: 'Idea'
}

const IDEA_COLOR = '#9c7a3c' // brass
const JOURNAL_COLOR = '#8c2f45'
const NEUTRAL = '#707b7d'

// ---------- Reading files (cached on this PC between visits) ----------

interface FileText {
  v: string // updated_at when read
  text: string
  heads: string[]
}

const DB_NAME = 'studyhall-brain'
let opened: Promise<IDBDatabase> | null = null
function idb(): Promise<IDBDatabase> {
  opened ??= new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1)
    r.onupgradeneeded = () => r.result.createObjectStore('text')
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  }).catch((e) => {
    opened = null
    throw e
  })
  return opened
}
async function cacheGet(id: string): Promise<FileText | null> {
  try {
    const d = await idb()
    return await new Promise((res) => {
      const q = d.transaction('text').objectStore('text').get(id)
      q.onsuccess = () => res((q.result as FileText) ?? null)
      q.onerror = () => res(null)
    })
  } catch {
    return null
  }
}
async function cachePut(id: string, v: FileText): Promise<void> {
  try {
    const d = await idb()
    await new Promise<void>((res) => {
      const t = d.transaction('text', 'readwrite')
      t.objectStore('text').put(v, id)
      t.oncomplete = () => res()
      t.onerror = () => res()
    })
  } catch {
    /* optional cache */
  }
}

const READABLE = /\.(pdf|docx|pptx|odt|odp|md|markdown|txt|html?)$/i
const MAX_TEXT = 400_000

/** Lines that look like headings or slide titles: short, no full stop, starts with a capital. */
function headingLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length >= 3 && l.length <= 48 && /^[A-Z\p{Lu}]/u.test(l) && !/[.,;:!?)]$/.test(l) && l.split(/\s+/).length <= 6)
}

async function readFile(m: Material): Promise<FileText | null> {
  const doc = await api.materials.read(m.id).catch(() => null)
  if (!doc) return null
  if (doc.ext === 'pdf') {
    const pages = cleanPdfPages((await pdfText(doc.data)).pages)
    const text = pages.map((p) => p.text).join('\n')
    return { v: m.updated_at, text: text.slice(0, MAX_TEXT), heads: [...pages.map((p) => p.cue), ...headingLines(text)] }
  }
  const text = (await docToText(doc)).slice(0, MAX_TEXT)
  return { v: m.updated_at, text, heads: headingLines(text) }
}

/** Read any files not read yet (a few at a time), reporting progress. Returns how many were read. */
export async function readNewFiles(onProgress: (done: number, total: number) => void, cancelled: () => boolean): Promise<number> {
  const files = (await api.list('materials', {})).filter((m) => READABLE.test(m.file_name) && m.local_path)
  const todo: Material[] = []
  for (const m of files) {
    const c = await cacheGet(m.id)
    if (!c || c.v !== m.updated_at) todo.push(m)
  }
  let done = 0
  onProgress(0, todo.length)
  for (const m of todo) {
    if (cancelled()) break
    const t = await readFile(m).catch(() => null)
    await cachePut(m.id, t ?? { v: m.updated_at, text: '', heads: [] })
    onProgress(++done, todo.length)
  }
  return done
}

// ---------- Ideas: turning headings into shared concepts ----------

const GENERIC = new Set(
  `introduction intro summary overview outline agenda contents content table of contents references bibliography conclusion conclusions recap review questions question answer answers example examples exercise exercises practice tutorial tutorials lecture lectures notes note slides slide today thank you thanks objectives learning objectives learning outcomes key points key takeaways takeaways background discussion activity activities task tasks homework reading readings further reading appendix definition definitions figure table chart source sources solution solutions part section chapter module week page unit topic topics case study recap quiz test exam main points important note warning tip tips agenda for today what we covered next steps next week q&a qa any questions`.split(
    /\s+/
  )
)
const GENERIC_PHRASES = new Set(['table of contents', 'learning objectives', 'learning outcomes', 'key points', 'key takeaways', 'further reading', 'case study', 'main points', 'next steps', 'next week', 'any questions', 'thank you', 'for today', 'what we covered'])
const SMALL = new Set(['a', 'an', 'the', 'of', 'and', 'or', 'in', 'on', 'to', 'for', 'with', 'vs', 'versus', 'at', 'by', 'from', 'its', 'their', 'is', 'are'])

export const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[“”"‘’'`*_#:()[\]{}<>|•·–—-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** A heading made into an idea key, or null if it's furniture ("Week 3", "Summary", "1.2"). */
function ideaKey(raw: string): string | null {
  let s = norm(raw)
    .replace(/^(?:(?:week|lecture|lect|lec|tutorial|tut|lab|seminar|chapter|ch|unit|topic|part|section|session|slide|module)\s*\d+[a-z]?\b\s*)+/, '')
    .replace(/^\d+(?:\.\d+)*\s+/, '')
    .replace(/^(?:a|an|the)\s+/, '')
    .replace(/[.,;!?]+$/, '')
    .trim()
  if (s.length < 3 || s.length > 40) return null
  const words = s.split(' ')
  if (words.length > 5 || /^\d/.test(s) || /\d{3,}/.test(s)) return null
  if (GENERIC.has(s) || GENERIC_PHRASES.has(s)) return null
  if (words.every((w) => GENERIC.has(w) || SMALL.has(w))) return null
  if (SMALL.has(words[words.length - 1])) return null
  s = words.join(' ')
  return s
}

const TOKEN = /[\p{L}\p{N}][\p{L}\p{N}'’]*/gu
const tokens = (s: string): string[] => (s.toLowerCase().match(TOKEN) ?? []).map((t) => t.replace(/['’]s$/, ''))

/** Finds known phrases (ideas, names, module codes) inside text, in one pass over its words. */
class Matcher {
  private byFirst = new Map<string, { words: string[]; target: string }[]>()
  add(phrase: string, target: string): void {
    const words = tokens(phrase)
    if (!words.length) return
    const list = this.byFirst.get(words[0]) ?? []
    if (!list.some((p) => p.target === target && p.words.join(' ') === words.join(' '))) list.push({ words, target })
    this.byFirst.set(words[0], list)
  }
  find(text: string): Set<string> {
    const hits = new Set<string>()
    const t = tokens(text)
    for (let i = 0; i < t.length; i++) {
      const list = this.byFirst.get(t[i]) ?? this.byFirst.get(t[i].replace(/s$/, ''))
      if (!list) continue
      for (const p of list) {
        let ok = true
        for (let k = 1; k < p.words.length; k++) {
          const w = t[i + k]
          if (w !== p.words[k] && w?.replace(/s$/, '') !== p.words[k]) {
            ok = false
            break
          }
        }
        if (ok) hits.add(p.target)
      }
    }
    return hits
  }
}

// ---------- Notes: headings, bold text and plain text from the editor's JSON ----------

interface PMNode {
  type: string
  text?: string
  marks?: { type: string }[]
  attrs?: Record<string, unknown>
  content?: PMNode[]
}
function noteHeads(content: string): string[] {
  const out: string[] = []
  let doc: PMNode
  try {
    doc = JSON.parse(content)
  } catch {
    return out
  }
  const textOf = (n: PMNode): string => (n.text ?? '') + (n.content ?? []).map(textOf).join('')
  const walk = (n: PMNode): void => {
    if (n.type === 'heading') out.push(textOf(n))
    else if (n.type === 'text' && n.marks?.some((m) => m.type === 'bold') && n.text) out.push(n.text)
    for (const c of n.content ?? []) walk(c)
  }
  walk(doc)
  return out
}

const WIKI = /\[\[([^\]\n]{1,80})\]\]/g
const wikiLinks = (s: string): string[] => [...s.matchAll(WIKI)].map((m) => m[1].split('|')[0].trim()).filter(Boolean)

const short = (s: string, n = 46): string => {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}
const parseJson = <T>(s: string | null | undefined, fallback: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : fallback
  } catch {
    return fallback
  }
}
const dayLabel = (d: string): string => new Date(d + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

// ---------- Building the web ----------

export async function buildBrain(): Promise<Brain> {
  const [modules, weeks, notes, materials, assessments, tasks, decks, cards, mindmaps, mmNodes, papers, projects, videos, people, facts, moments, plans, journal, languages, media, focus, recall, profile] =
    await Promise.all([
      api.list('modules', {}),
      api.list('weeks', {}),
      api.list('notes', {}),
      api.list('materials', {}),
      api.list('assessments', {}),
      api.list('tasks', {}),
      api.list('flashcard_decks', {}),
      api.list('flashcards', {}),
      api.list('mindmaps', {}),
      api.list('mindmap_nodes', {}),
      api.list('exam_papers', {}),
      api.list('projects', {}),
      api.list('videos', {}),
      api.list('people', {}),
      api.list('person_facts', {}),
      api.list('moments', {}),
      api.list('plans', {}),
      api.list('journal_entries', {}),
      api.list('languages', {}),
      api.list('media_items', {}),
      api.list('focus_sessions', {}),
      api.list('recall_cards', {}),
      api.profile.get()
    ])

  const nodes = new Map<string, BNode>()
  const edges: BEdge[] = []
  const edgeKeys = new Set<string>()
  const docText = new Map<string, string>()
  const heads = new Map<string, string[]>() // node id → idea candidates
  const link = (a: string, b: string, why: BEdge['why']): void => {
    if (a === b || !nodes.has(a) || !nodes.has(b)) return
    const k = a < b ? `${a}|${b}` : `${b}|${a}`
    if (edgeKeys.has(k)) return
    edgeKeys.add(k)
    edges.push({ a, b, why })
  }
  const add = (n: Omit<BNode, 'degree'>): BNode => {
    const node = { ...n, degree: 0 }
    nodes.set(n.id, node)
    return node
  }

  const modById = new Map(modules.map((m) => [m.id, m]))
  const weekById = new Map(weeks.map((w) => [w.id, w]))
  const personById = new Map(people.map((p) => [p.id, p]))
  const partnerId = profile?.partner_id ?? null
  const personOpen = (id: string | null): Open | null =>
    !id ? null : id === partnerId ? { route: { name: 'partner' }, mode: 'life' } : { route: { name: 'people', id }, mode: 'life' }
  const modColor = (id: string | null | undefined): string => (id && modById.get(id)?.color) || NEUTRAL
  const modCode = (id: string | null | undefined): string => (id ? modById.get(id)?.code || modById.get(id)?.name || '' : '')
  /** Where a note / file / deck sits: its week if it has one, otherwise its module. */
  const homeOf = (moduleId: string | null, weekId?: string | null): string | null =>
    weekId && weekById.has(weekId) ? `week:${weekId}` : moduleId && modById.has(moduleId) ? `module:${moduleId}` : null

  // Study
  for (const m of modules) {
    if (m.archived) continue
    add({ id: `module:${m.id}`, kind: 'module', label: m.code || m.name, sub: m.code ? m.name : m.term, text: `${m.code} ${m.name} ${m.term}`, color: m.color, side: 'study', date: null, open: { route: { name: 'module', id: m.id }, mode: 'study' } })
  }
  for (const w of weeks) {
    if (!nodes.has(`module:${w.module_id}`)) continue
    add({ id: `week:${w.id}`, kind: 'week', label: `Week ${w.number}`, sub: [w.title, modCode(w.module_id)].filter(Boolean).join(' · '), text: `Week ${w.number} ${w.title}`, color: modColor(w.module_id), side: 'study', date: w.start_date, open: { route: { name: 'module', id: w.module_id, tab: 'weeks' }, mode: 'study' } })
    link(`week:${w.id}`, `module:${w.module_id}`, 'part')
  }
  for (const n of notes) {
    const id = `note:${n.id}`
    add({ id, kind: 'note', label: short(n.title || 'Untitled note'), sub: [n.category === 'worksheet' ? 'Worksheet' : n.kind === 'meeting' ? 'Meeting note' : 'Note', modCode(n.module_id)].filter(Boolean).join(' · '), text: `${n.title}\n${n.plain_text}`, color: modColor(n.module_id), side: n.mode === 'life' ? 'life' : n.module_id || n.mode === 'study' ? 'study' : 'other', date: n.updated_at.slice(0, 10), open: { route: { name: 'notes', id: n.id } } })
    docText.set(id, `${n.title}\n${n.plain_text}`)
    heads.set(id, [n.title, ...noteHeads(n.content)])
    const home = homeOf(n.module_id, n.week_id)
    if (home) link(id, home, 'part')
  }
  let unread = 0
  for (const m of materials) {
    const id = `material:${m.id}`
    add({ id, kind: 'material', label: short(m.title || m.file_name), sub: [m.file_name.split('.').pop()?.toUpperCase(), modCode(m.module_id)].filter(Boolean).join(' · '), text: `${m.title} ${m.file_name}`, color: modColor(m.module_id), side: m.module_id ? 'study' : 'other', date: m.created_at.slice(0, 10), open: { material: m } })
    const c = READABLE.test(m.file_name) ? await cacheGet(m.id) : null
    if (READABLE.test(m.file_name) && m.local_path && (!c || c.v !== m.updated_at)) unread++
    if (c?.text) {
      docText.set(id, `${m.title}\n${c.text}`)
      heads.set(id, [m.title, ...c.heads])
    } else heads.set(id, [m.title])
    const home = homeOf(m.module_id, m.week_id)
    if (home) link(id, home, 'part')
  }
  for (const a of assessments) {
    const id = `assessment:${a.id}`
    add({ id, kind: 'assessment', label: short(a.title), sub: [a.kind, modCode(a.module_id), a.due_at ? new Date(a.due_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''].filter(Boolean).join(' · '), text: `${a.title} ${a.kind}`, color: modColor(a.module_id), side: 'study', date: a.due_at?.slice(0, 10) ?? null, open: { route: { name: 'module', id: a.module_id, tab: 'assessments' }, mode: 'study' } })
    link(id, `module:${a.module_id}`, 'part')
  }
  const cardsByDeck = new Map<string, string[]>()
  for (const c of cards) cardsByDeck.set(c.deck_id, [...(cardsByDeck.get(c.deck_id) ?? []), c.front])
  for (const d of decks) {
    const id = `deck:${d.id}`
    const fronts = cardsByDeck.get(d.id) ?? []
    add({ id, kind: 'deck', label: short(d.name), sub: `${fronts.length} cards${d.module_id ? ` · ${modCode(d.module_id)}` : ''}`, text: `${d.name}\n${fronts.join('\n')}`, color: modColor(d.module_id), side: d.module_id ? 'study' : 'other', date: null, open: { route: { name: 'deck', id: d.id } } })
    docText.set(id, `${d.name}\n${(cards.filter((c) => c.deck_id === d.id).map((c) => `${c.front} — ${c.back}`)).join('\n')}`)
    heads.set(id, [d.name, ...fronts.filter((f) => f.split(/\s+/).length <= 4)])
    if (d.module_id) link(id, `module:${d.module_id}`, 'part')
  }
  const mmNodesBy = new Map<string, typeof mmNodes>()
  for (const n of mmNodes) mmNodesBy.set(n.mindmap_id, [...(mmNodesBy.get(n.mindmap_id) ?? []), n])
  for (const mm of mindmaps) {
    const id = `mindmap:${mm.id}`
    const ns = mmNodesBy.get(mm.id) ?? []
    add({ id, kind: 'mindmap', label: short(mm.title || 'Mindmap'), sub: `Mindmap${mm.module_id ? ` · ${modCode(mm.module_id)}` : ''}`, text: `${mm.title}\n${ns.map((n) => n.label).join('\n')}`, color: modColor(mm.module_id), side: mm.mode === 'life' ? 'life' : 'study', date: null, open: { route: { name: 'mindmap', id: mm.id } } })
    docText.set(id, `${mm.title}\n${ns.map((n) => `${n.label}${n.detail ? ` — ${n.detail}` : ''}`).join('\n')}`)
    heads.set(id, [mm.title, ...ns.filter((n) => n.kind !== 'leaf' && n.kind !== 'source').map((n) => n.label)])
    if (mm.module_id) link(id, `module:${mm.module_id}`, 'part')
  }
  for (const p of papers) {
    const id = `paper:${p.id}`
    add({ id, kind: 'paper', label: short(p.title), sub: [p.year, modCode(p.module_id)].filter(Boolean).join(' · '), text: `${p.title} ${p.year} ${p.notes}`, color: modColor(p.module_id), side: 'study', date: null, open: { route: { name: 'paper', id: p.id }, mode: 'study' } })
    if (p.module_id) link(id, `module:${p.module_id}`, 'part')
  }
  for (const p of projects) {
    const id = `project:${p.id}`
    add({ id, kind: 'project', label: short(p.title), sub: `Project · ${p.status}`, text: `${p.title}\n${p.description}`, color: p.color || NEUTRAL, side: p.mode === 'study' ? 'study' : p.mode === 'life' ? 'life' : 'other', date: p.deadline?.slice(0, 10) ?? null, open: { route: { name: 'project', id: p.id } } })
    docText.set(id, `${p.title}\n${p.description}`)
    if (p.module_id) link(id, `module:${p.module_id}`, 'part')
  }
  for (const t of tasks) {
    if (t.status === 'done' || t.parent_task_id) continue
    const id = `task:${t.id}`
    add({ id, kind: 'task', label: short(t.title), sub: ['Task', t.due_at ? `due ${new Date(t.due_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : '', modCode(t.module_id)].filter(Boolean).join(' · '), text: `${t.title}\n${t.notes}`, color: t.module_id ? modColor(t.module_id) : '#46587a', side: t.mode === 'life' ? 'life' : t.mode === 'study' ? 'study' : 'other', date: t.due_at?.slice(0, 10) ?? null, open: { task: t.id } })
    docText.set(id, `${t.title}\n${t.notes}`)
    if (t.assessment_id) link(id, `assessment:${t.assessment_id}`, 'part')
    else if (t.module_id) link(id, `module:${t.module_id}`, 'part')
    if (t.project_id) link(id, `project:${t.project_id}`, 'part')
  }
  for (const v of videos) {
    const id = `video:${v.id}`
    add({ id, kind: 'video', label: short(v.title || 'Video'), sub: `Video${v.author ? ` · ${v.author}` : ''}`, text: `${v.title} ${v.author}\n${v.notes}`, color: modColor(v.module_id), side: v.module_id ? 'study' : 'other', date: null, open: { route: { name: 'video', id: v.id } } })
    heads.set(id, parseJson<string[]>(v.tags, []))
    if (v.module_id) link(id, `module:${v.module_id}`, 'part')
  }

  // Life
  for (const p of people) {
    if (p.archived) continue
    const id = `person:${p.id}`
    add({ id, kind: 'person', label: p.name, sub: p.id === partnerId ? profile?.partner_label || 'Partner' : p.relation || p.kind, text: `${p.name} ${p.relation} ${p.how_met} ${p.notes}`, color: p.color || '#9c7a3c', side: 'life', date: p.birthday, open: personOpen(p.id) })
    docText.set(id, `${p.name}\n${p.relation}\n${p.how_met}\n${p.notes}`)
  }
  for (const f of facts) {
    if (!nodes.has(`person:${f.person_id}`)) continue
    const id = `fact:${f.id}`
    const p = personById.get(f.person_id)!
    add({ id, kind: 'fact', label: short(f.text, 36), sub: `${p.name} · ${f.category}`, text: f.text, color: p.color || '#9c7a3c', side: 'life', date: null, open: personOpen(p.id) })
    docText.set(id, f.text)
    link(id, `person:${f.person_id}`, 'part')
  }
  for (const m of moments) {
    const id = `moment:${m.id}`
    const p = m.person_id ? personById.get(m.person_id) : null
    const label = m.title || short(m.story, 36) || (m.kind === 'checkin' ? 'Check-in' : 'Appreciation')
    add({ id, kind: 'moment', label: short(label, 40), sub: [m.kind === 'memory' ? 'Memory' : m.kind === 'checkin' ? 'Check-in' : 'Appreciation', p?.name, m.date ? dayLabel(m.date) : ''].filter(Boolean).join(' · '), text: `${m.title}\n${m.story}\n${m.place}`, color: p?.color || JOURNAL_COLOR, side: 'life', date: m.date, open: personOpen(m.person_id) })
    docText.set(id, `${m.title}\n${m.story}\n${m.place}`)
    if (m.person_id) link(id, `person:${m.person_id}`, 'part')
  }
  for (const pl of plans) {
    const id = `plan:${pl.id}`
    const p = pl.person_id ? personById.get(pl.person_id) : null
    add({ id, kind: 'plan', label: short(pl.title, 40), sub: ['Plan', pl.status, p?.name, pl.date ? dayLabel(pl.date) : ''].filter(Boolean).join(' · '), text: `${pl.title}\n${pl.place}\n${pl.notes}`, color: p?.color || JOURNAL_COLOR, side: 'life', date: pl.date, open: personOpen(pl.person_id) })
    docText.set(id, `${pl.title}\n${pl.place}\n${pl.notes}`)
    if (pl.person_id) link(id, `person:${pl.person_id}`, 'part')
  }
  for (const j of journal) {
    if (!j.content && !j.title && !j.gratitude) continue
    const id = `journal:${j.id}`
    const text = `${j.title}\n${j.content}\n${j.gratitude}`
    add({ id, kind: 'journal', label: j.title ? short(j.title, 40) : dayLabel(j.date), sub: `Journal · ${dayLabel(j.date)}`, text, color: JOURNAL_COLOR, side: 'life', date: j.date, open: { route: { name: 'journal', date: j.date }, mode: 'life' } })
    docText.set(id, text)
    heads.set(id, parseJson<string[]>(j.tags, []))
  }
  for (const l of languages) {
    add({ id: `language:${l.id}`, kind: 'language', label: l.name, sub: `Learning · ${l.level}`, text: `${l.name} ${l.native_name}`, color: l.color || NEUTRAL, side: 'life', date: null, open: { route: { name: 'language', id: l.id }, mode: 'life' } })
  }
  for (const m of media) {
    const id = `media:${m.id}`
    add({ id, kind: 'media', label: short(m.title, 40), sub: [m.kind, m.creator].filter(Boolean).join(' · '), text: `${m.title} ${m.creator}\n${m.notes}`, color: m.color || '#6c4f80', side: 'life', date: m.finished_at, open: { route: { name: 'library' }, mode: 'life' } })
    docText.set(id, `${m.title} ${m.creator}\n${m.notes}`)
  }

  // Mindmap points that point at a note, module or task
  for (const n of mmNodes) {
    if (n.link_type && n.link_id) link(`mindmap:${n.mindmap_id}`, `${n.link_type}:${n.link_id}`, 'link')
  }

  // ---------- Mentions and [[links]] ----------
  const byLabel = new Map<string, string>()
  for (const n of nodes.values()) {
    if (n.kind === 'fact' || n.kind === 'task') continue
    const k = norm(n.label)
    if (k.length >= 2 && !byLabel.has(k)) byLabel.set(k, n.id)
  }
  for (const m of modules) {
    if (m.code) byLabel.set(norm(m.code), `module:${m.id}`)
    byLabel.set(norm(m.name), `module:${m.id}`)
  }
  // People by full name, and by first name when only one person has it ([[Jun]] → Jun Wei)
  const firstCount = new Map<string, number>()
  for (const p of people) {
    const f = norm(p.name).split(' ')[0]
    firstCount.set(f, (firstCount.get(f) ?? 0) + 1)
  }
  for (const p of people) {
    byLabel.set(norm(p.name), `person:${p.id}`)
    const f = norm(p.name).split(' ')[0]
    if (f.length >= 2 && firstCount.get(f) === 1 && !byLabel.has(f)) byLabel.set(f, `person:${p.id}`)
  }

  const names = new Matcher()
  const firstNames = new Map<string, number>()
  for (const p of people) {
    const f = tokens(p.name)[0]
    if (f) firstNames.set(f, (firstNames.get(f) ?? 0) + 1)
  }
  for (const p of people) {
    if (p.archived) continue
    names.add(p.name, `person:${p.id}`)
    const f = tokens(p.name)[0]
    if (f && f.length >= 3 && firstNames.get(f) === 1) names.add(f, `person:${p.id}`)
  }
  for (const m of modules) {
    if (m.archived) continue
    if (m.code && m.code.length >= 3) names.add(m.code, `module:${m.id}`)
    if (m.name.split(/\s+/).length >= 2) names.add(m.name, `module:${m.id}`)
  }

  // Ideas: candidates from headings, bold text, slide titles, tags and [[links]]
  const ideaLabel = new Map<string, string>() // key → nicest spelling seen
  const offer = (raw: string): void => {
    const k = ideaKey(raw)
    if (!k || byLabel.has(k)) return
    const pretty = raw.replace(/\s+/g, ' ').trim().replace(/^[\d.\s]+/, '')
    if (!ideaLabel.has(k) || (/^[A-Z]/.test(pretty) && !/^[A-Z]/.test(ideaLabel.get(k)!))) ideaLabel.set(k, pretty.length <= 40 ? pretty : k)
  }
  for (const hs of heads.values()) for (const h of hs) offer(h)

  const wiki = new Map<string, string[]>() // node id → [[targets]]
  for (const [id, text] of docText) {
    const ws = wikiLinks(text)
    if (!ws.length) continue
    wiki.set(id, ws)
    for (const w of ws) if (!byLabel.has(norm(w))) offer(w)
  }

  const ideas = new Matcher()
  for (const k of ideaLabel.keys()) ideas.add(k, `idea:${k}`)

  // One pass over every text: who and what it mentions
  const ideaHits = new Map<string, Set<string>>()
  const mentionEdges: [string, string][] = []
  for (const [id, text] of docText) {
    for (const t of names.find(text)) if (t !== id) mentionEdges.push([id, t])
    for (const t of ideas.find(text)) {
      const set = ideaHits.get(t) ?? new Set<string>()
      set.add(id)
      ideaHits.set(t, set)
    }
  }
  // Items whose title or headings name an idea count too (files not read yet, decks, videos)
  for (const [id, hs] of heads) {
    for (const h of hs) {
      const k = ideaKey(h)
      if (!k || !ideaLabel.has(k)) continue
      const set = ideaHits.get(`idea:${k}`) ?? new Set<string>()
      set.add(id)
      ideaHits.set(`idea:${k}`, set)
    }
  }

  // Keep ideas found in two or more places; the most widespread first.
  const wikiTargets = new Set([...wiki.values()].flat().map((w) => `idea:${ideaKey(w) ?? ''}`))
  const kept = [...ideaHits.entries()]
    .filter(([k, set]) => set.size >= 2 || wikiTargets.has(k))
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 450)
  for (const [k, set] of kept) {
    const key = k.slice(5)
    add({ id: k, kind: 'idea', label: ideaLabel.get(key) ?? key, sub: `Idea · in ${set.size} place${set.size === 1 ? '' : 's'}`, text: key, color: IDEA_COLOR, side: 'study', date: null, open: null })
    for (const id of [...set].slice(0, 120)) link(id, k, 'idea')
  }
  // An idea that lives entirely in one side takes that side
  for (const [k] of kept) {
    const sides = new Set([...(ideaHits.get(k) ?? [])].map((id) => nodes.get(id)?.side))
    const n = nodes.get(k)!
    n.side = sides.has('study') ? 'study' : sides.has('life') ? 'life' : 'other'
  }

  for (const [a, b] of mentionEdges) link(a, b, 'mention')
  for (const [id, ws] of wiki) {
    for (const w of ws) {
      const target = byLabel.get(norm(w)) ?? `idea:${ideaKey(w) ?? ''}`
      link(id, target, 'link')
    }
  }

  // Degrees and neighbours
  const adj = new Map<string, Set<string>>()
  for (const id of nodes.keys()) adj.set(id, new Set())
  for (const e of edges) {
    adj.get(e.a)!.add(e.b)
    adj.get(e.b)!.add(e.a)
  }
  for (const [id, s] of adj) nodes.get(id)!.degree = s.size

  return {
    nodes,
    edges,
    adj,
    people: people.filter((p) => !p.archived),
    facts,
    modules: modules.filter((m) => !m.archived),
    weeks,
    assessments,
    tasks,
    notes,
    materials,
    decks,
    focus,
    recall,
    partnerId,
    partnerLabel: profile?.partner_label || 'Partner',
    docText,
    unread
  }
}

export type { Module, Person, Task }
