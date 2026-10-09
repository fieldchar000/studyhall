// Builds mindmaps from documents, notes and articles — on this PC, no AI service.
//  • "Overview": a full picture — the gist, key ideas, key terms, people / places /
//    organisations, numbers, timeline, points of disagreement and the sources.
//  • "By source": each source's own outline (slide titles, headings, key points).
//  • "By theme": the ideas and names several sources share, with what each one says.
// Sentences are chosen with TextRank (see nlp.ts); key phrases are repeated 1–3 word
// phrases with extra weight for two-word concepts and names.

import { contentWords, definitions, entities, hasNumber, pick, rank, splitSentences, standsAlone, tensions, timeline, type Entity, type Ranked } from './nlp'

export interface Point {
  text: string // short label
  detail: string // the full sentence
}
export interface Section {
  title: string
  points: Point[]
}
export interface Source {
  title: string
  kind: 'file' | 'note' | 'article'
  text: string
  sections: Section[]
  url?: string
  noteId?: string
  noise?: string[] // e.g. the publisher's name — never a theme
}
export type Size = 'compact' | 'detailed'
export type Style = 'overview' | 'source' | 'theme'

export interface GenNode {
  key: string
  parent: string | null
  label: string
  kind: 'center' | 'branch' | 'leaf' | 'source' | 'theme' | 'group'
  detail: string
  url: string
  source: string
  color: string
  noteId?: string
  x: number
  y: number
}
export interface GenEdge {
  from: string
  to: string
  kind: '' | 'related'
  label: string
}
export interface GenMap {
  nodes: GenNode[]
  edges: GenEdge[]
}

const PALETTE = ['#7357ff', '#0aa5c8', '#f59e0b', '#e8457a', '#10b981', '#3d8bff', '#f97316', '#8b5cf6', '#14b8a6', '#ef4444']
const STOP = new Set(
  `a about above after again against all also am an and any are as at be because been before being below between both but by can cannot could did do does doing down during each even ever every few for from further get gets got had has have having he her here hers him his how however i if in into is it its just like made make makes many may me might more most much must my new no nor not now of off often on once one only or other our out over own per rather really said same say says see shall she should since so some still such than that the their them then there these they this those though through thus to too two under until up upon us use used using very via was way we well were what when where whether which while who whom whose why will with within without would yet you your therefore although whereas first second third last next back today yesterday tomorrow year years time times week weeks day days people thing things lot lots ways part parts number old good great big small high low long short several various including include includes according mr mrs ms dr told tell asked`.split(
    /\s+/
  )
)

// ---------- Text helpers ----------

export const sentences = (text: string): string[] => splitSentences(text)

export function shorten(s: string, max = 70): string {
  const t = s.replace(/\s+/g, ' ').replace(/^[•●▪◦\-–*\d.)\s]+/, '').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 15)).replace(/[,;:.\s]+$/, '') + '…'
}

export interface Phrase {
  key: string // lowercased
  text: string // display form
  score: number
}
interface Gram {
  count: number
  forms: Map<string, number>
  name: boolean
}

/** Every 1–3 word phrase without stop words (within a line/sentence), plus names. */
export function grams(text: string): Map<string, Gram> {
  const grams = new Map<string, Gram>()
  const add = (form: string, name: boolean): void => {
    const key = form.toLowerCase()
    const g = grams.get(key) ?? { count: 0, forms: new Map<string, number>(), name: false }
    g.count++
    g.name ||= name
    g.forms.set(form, (g.forms.get(form) ?? 0) + 1)
    grams.set(key, g)
  }
  for (const piece of text.split(/[.!?;:()[\]"“”\n•|,]+/)) {
    const words = piece.split(/[^A-Za-zÀ-ÿ0-9'’-]+/).filter(Boolean)
    let run: string[] = []
    const flush = (): void => {
      for (let n = 1; n <= 3; n++) for (let i = 0; i + n <= run.length; i++) add(run.slice(i, i + n).join(' '), false)
      run = []
    }
    for (const w of words) {
      const lw = w.toLowerCase().replace(/[’']s$/, '')
      if (STOP.has(lw) || /^\d+$/.test(lw) || (lw.length < 3 && !/^[A-Z]{2}$/.test(w))) flush()
      else run.push(w.replace(/[’']s$/, ''))
    }
    flush()
  }
  for (const m of text.matchAll(/\b([A-Z][a-zA-Z]+(?:\s+(?:of\s+(?:the\s+)?)?[A-Z][a-zA-Z]+){1,3}|[A-Z]{2,6})\b/g)) {
    const form = m[1].replace(/^(The|A|An|In|On|At|But|And|For|After|Before|When|While|If|As)\s+/, '')
    if (!form.includes(' ') && !/^[A-Z]{2,6}$/.test(form)) continue
    if (form.toLowerCase().split(' ').every((w) => STOP.has(w))) continue
    const g = grams.get(form.toLowerCase())
    if (g) g.name = true
    else add(form, true)
  }
  return grams
}

const formOf = (g: Gram): string => [...g.forms.entries()].sort((a, b) => b[1] - a[1])[0][0]
const nWeight = (n: number): number => (n === 1 ? 1 : n === 2 ? 2.4 : 2.8)

/** Prefer "working memory" over "memory": drop single words inside a repeated multi-word phrase. */
function dropInner<T extends { key: string; ok: boolean }>(list: T[]): T[] {
  const multi = list.filter((x) => x.ok && x.key.includes(' '))
  return list.filter((x) => x.key.includes(' ') || !multi.some((m) => m.key.split(' ').includes(x.key)))
}

/** Key phrases of one text: repeated phrases, two-word concepts and names first. */
export function keyPhrases(text: string, limit = 15): Phrase[] {
  const all = [...grams(text).entries()].map(([key, g]) => ({ key, g, ok: g.count >= 2 }))
  const out: Phrase[] = []
  for (const { key, g } of dropInner(all)) {
    const n = key.split(' ').length
    if (g.count < 2) continue
    if (n === 1 && !g.name && (g.count < 3 || key.length < 5)) continue
    out.push({ key, text: formOf(g), score: g.count * nWeight(n) * (g.name ? 1.5 : 1) })
  }
  out.sort((a, b) => b.score - a.score)
  const kept: Phrase[] = []
  for (const p of out) {
    if (kept.some((k) => k.key.includes(p.key) || p.key.includes(k.key))) continue
    kept.push(p)
    if (kept.length >= limit) break
  }
  return kept
}

export const contains = (text: string, key: string): boolean => new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)

// ---------- Analysis (shared by mindmaps and auto-notes) ----------

export interface Analysis {
  ranked: Ranked[] // every sentence of every source, scored
  scoreOf: Map<string, number>
  best: (filter: (r: Ranked) => boolean, n: number) => Ranked[]
  /** Like best, but spread across sources so one long source can't crowd out the rest. */
  fair: (filter: (r: Ranked) => boolean, n: number) => Ranked[]
  entities: Entity[]
}

export function analyse(sources: Source[]): Analysis {
  const all = sources.flatMap((s, src) => splitSentences(s.text).map((text) => ({ text, src })))
  const news = sources.some((s) => s.kind === 'article')
  const ranked = rank(all, { leadBias: news })
  const scoreOf = new Map(ranked.map((r) => [r.text, r.score]))
  const fair = (filter: (r: Ranked) => boolean, n: number): Ranked[] => {
    const cap = Math.max(1, Math.ceil(n / sources.length))
    const per = new Map<number, number>()
    const out: Ranked[] = []
    for (const r of pick(ranked.filter(filter), n * 4).sort((x, y) => y.score - x.score)) {
      if ((per.get(r.src) ?? 0) >= cap) continue
      per.set(r.src, (per.get(r.src) ?? 0) + 1)
      out.push(r)
      if (out.length >= n) break
    }
    return out.sort((x, y) => x.src - y.src || x.index - y.index)
  }
  return {
    ranked,
    scoreOf,
    best: (filter, n) => pick(ranked.filter(filter), n),
    fair,
    entities: entities(sources.map((s) => s.text)).filter((e) => !sources.some((s) => s.noise?.some((x) => x.toLowerCase() === e.name.toLowerCase())))
  }
}

/** The most informative sentence of a block of text. */
const bestSentence = (block: string, scoreOf?: Map<string, number>): string => {
  const sents = splitSentences(block)
  if (!sents.length) return block
  if (!scoreOf) return sents[0]
  return sents.reduce((a, b) => ((scoreOf.get(b) ?? 0) > (scoreOf.get(a) ?? 0) ? b : a))
}

// ---------- Outlines ----------

/** Outline from cleaned HTML: headings (or bold heading-like lines) with their key points. */
export function outlineFromHtml(html: string, title: string): Section[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const sections: Section[] = []
  let cur: Section | null = null
  for (const el of Array.from(doc.body.querySelectorAll('h1,h2,h3,h4,p,li,blockquote'))) {
    if (el.tagName === 'LI' && el.querySelector('li')) continue
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (!text) continue
    const strongOnly = el.tagName === 'P' && el.children.length === 1 && el.firstElementChild?.tagName === 'STRONG' && text.length < 80
    if (/^H[1-4]$/.test(el.tagName) || strongOnly) {
      if (/^(page|slide) \d+$/i.test(text) || text.toLowerCase() === title.toLowerCase()) continue
      cur = { title: text, points: [] }
      sections.push(cur)
      continue
    }
    if (el.tagName === 'BLOCKQUOTE') continue // speaker notes etc.
    if (!cur) {
      cur = { title: '', points: [] }
      sections.push(cur)
    }
    if (text.split(' ').length >= 2) cur.points.push({ text: shorten(splitSentences(text)[0] ?? text), detail: text.slice(0, 800) })
  }
  return sections.filter((s) => s.title || s.points.length)
}

/** When a source has no usable headings, group its sentences around its key phrases. */
export function outlineFromPhrases(text: string, n = 6): Section[] {
  const sents = splitSentences(text)
  return keyPhrases(text, n)
    .map((p) => ({
      title: p.text,
      points: sents
        .filter((s) => contains(s, p.key))
        .slice(0, 5)
        .map((s) => ({ text: shorten(s), detail: s }))
    }))
    .filter((s) => s.points.length)
}

export function bestOutline(html: string, text: string, title: string): Section[] {
  const o = outlineFromHtml(html, title).filter((s) => s.title)
  return o.length >= 2 ? o : outlineFromPhrases(text)
}

/** A section's points, best first (each reduced to its most informative sentence). */
export function rankedPoints(sec: Section, a: Analysis, n: number): Point[] {
  return sec.points
    .map((p) => {
      const s = bestSentence(p.detail, a.scoreOf)
      return { text: shorten(s, 80), detail: p.detail, score: a.scoreOf.get(s) ?? 0 }
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, n)
}

// ---------- Layout ----------

const boxOf = (n: GenNode): { w: number; h: number } => {
  const w = n.kind === 'center' ? Math.min(300, 80 + n.label.length * 8) : n.kind === 'leaf' ? 250 : Math.min(240, 70 + n.label.length * 6.8)
  const perLine = n.kind === 'leaf' ? 40 : 28
  return { w, h: 30 + 15 * Math.ceil(n.label.length / perLine) }
}

/** Radial layout: each branch gets a slice of the circle sized by how many leaves it has,
 *  then a few passes push apart any boxes that still overlap. */
export function radialLayout(nodes: GenNode[]): void {
  const kids = new Map<string | null, GenNode[]>()
  for (const n of nodes) kids.set(n.parent, [...(kids.get(n.parent) ?? []), n])
  const leaves = (n: GenNode): number => {
    const k = kids.get(n.key) ?? []
    return k.length ? k.reduce((s, c) => s + leaves(c), 0) : 1
  }
  const total = nodes.length
  const scale = total > 60 ? 1.25 : 1
  const RADII = [0, 270, 520, 760, 980].map((r) => r * scale)
  const place = (n: GenNode, depth: number, a0: number, a1: number): void => {
    const a = (a0 + a1) / 2
    const r = RADII[Math.min(depth, RADII.length - 1)]
    const { w, h } = boxOf(n)
    n.x = Math.round(Math.cos(a) * r * 1.4 - w / 2)
    n.y = Math.round(Math.sin(a) * r - h / 2)
    const k = kids.get(n.key) ?? []
    const sum = k.reduce((s, c) => s + leaves(c), 0)
    let start = a0
    for (const c of k) {
      const span = ((a1 - a0) * leaves(c)) / Math.max(1, sum)
      place(c, depth + 1, start, start + span)
      start += span
    }
  }
  const root = nodes.find((n) => n.parent === null)
  if (!root) return
  place(root, 0, -Math.PI / 2, (Math.PI * 3) / 2)
  // Overlap removal
  const PAD = 14
  const boxes = nodes.map((n) => ({ n, ...boxOf(n) }))
  for (let it = 0; it < 60; it++) {
    let moved = false
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const A = boxes[i]
        const B = boxes[j]
        const dx = B.n.x + B.w / 2 - (A.n.x + A.w / 2)
        const dy = B.n.y + B.h / 2 - (A.n.y + A.h / 2)
        const ox = (A.w + B.w) / 2 + PAD - Math.abs(dx)
        const oy = (A.h + B.h) / 2 + PAD - Math.abs(dy)
        if (ox <= 0 || oy <= 0) continue
        moved = true
        const fixedA = A.n.parent === null
        const fixedB = B.n.parent === null
        const share = fixedA ? [0, 1] : fixedB ? [1, 0] : [0.5, 0.5]
        if (oy < ox) {
          const s = dy >= 0 ? 1 : -1
          A.n.y -= s * oy * share[0]
          B.n.y += s * oy * share[1]
        } else {
          const s = dx >= 0 ? 1 : -1
          A.n.x -= s * ox * share[0]
          B.n.x += s * ox * share[1]
        }
      }
    }
    if (!moved) break
  }
  for (const n of nodes) {
    n.x = Math.round(n.x)
    n.y = Math.round(n.y)
  }
}

const CAPS: Record<Size, { sources: number; sections: number; points: number; themes: number; perTheme: number; list: number }> = {
  compact: { sources: 6, sections: 5, points: 2, themes: 6, perTheme: 3, list: 4 },
  detailed: { sources: 12, sections: 10, points: 4, themes: 10, perTheme: 5, list: 7 }
}

const finish = (nodes: GenNode[], edges: GenEdge[]): GenMap => {
  // Tree edges first and in creation order, so branches keep the order they were built in.
  edges.unshift(...nodes.filter((n) => n.parent).map((n): GenEdge => ({ from: n.parent!, to: n.key, kind: '', label: '' })))
  radialLayout(nodes)
  return { nodes, edges }
}
const cap1 = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

// ---------- By source ----------

export function buildBySource(title: string, sources: Source[], size: Size, a = analyse(sources)): GenMap {
  const cap = CAPS[size]
  const nodes: GenNode[] = []
  const edges: GenEdge[] = []
  const single = sources.length === 1
  nodes.push({ key: 'c', parent: null, label: title || sources[0]?.title || 'Mindmap', kind: 'center', detail: '', url: single ? (sources[0].url ?? '') : '', source: '', color: '', noteId: single ? sources[0].noteId : undefined, x: 0, y: 0 })
  const sectionNodes: { node: GenNode; text: string; src: number }[] = []
  sources.slice(0, cap.sources).forEach((s, si) => {
    const color = PALETTE[si % PALETTE.length]
    let parent = 'c'
    if (!single) {
      const gist = a.best((r) => r.src === si, 1)[0]
      nodes.push({ key: `s${si}`, parent: 'c', label: shorten(s.title, 60), kind: 'source', detail: gist?.text ?? '', url: s.url ?? '', source: s.title, color, noteId: s.noteId, x: 0, y: 0 })
      parent = `s${si}`
    }
    s.sections.slice(0, cap.sections).forEach((sec, ci) => {
      const bcolor = single ? PALETTE[ci % PALETTE.length] : color
      const key = `s${si}b${ci}`
      nodes.push({ key, parent, label: shorten(sec.title || sec.points[0]?.text || 'Section', 60), kind: 'branch', detail: '', url: s.url ?? '', source: s.title, color: bcolor, noteId: s.noteId, x: 0, y: 0 })
      sectionNodes.push({ node: nodes[nodes.length - 1], text: `${sec.title} ${sec.points.map((p) => p.detail).join(' ')}`, src: si })
      rankedPoints(sec, a, cap.points).forEach((p, pi) => {
        nodes.push({ key: `${key}p${pi}`, parent: key, label: p.text, kind: 'leaf', detail: p.detail, url: s.url ?? '', source: s.title, color: bcolor, noteId: s.noteId, x: 0, y: 0 })
      })
    })
  })
  if (!single) {
    let added = 0
    for (const ph of sharedPhrases(sources, 10)) {
      const bySource = new Map<number, GenNode>()
      for (const h of sectionNodes.filter((x) => contains(x.text, ph.key))) if (!bySource.has(h.src)) bySource.set(h.src, h.node)
      const list = [...bySource.values()]
      for (let i = 1; i < list.length && added < 14; i++, added++) edges.push({ from: list[i - 1].key, to: list[i].key, kind: 'related', label: ph.text })
    }
  }
  return finish(nodes, edges)
}

// ---------- By theme ----------

/** Phrases that come up in several sources (or the strongest ones if there's just one). */
export function sharedPhrases(sources: Source[], n: number): Phrase[] {
  const noisy = (key: string): boolean => sources.some((src) => src.noise?.some((x) => x.toLowerCase().includes(key) || key.includes(x.toLowerCase())))
  if (sources.length < 2) return keyPhrases(sources[0]?.text ?? '', n * 2).filter((p) => !noisy(p.key)).slice(0, n)
  const all = new Map<string, { g: Gram; df: number; total: number }>()
  for (const m of sources.map((src) => grams(src.text))) {
    for (const [key, g] of m) {
      const e = all.get(key) ?? { g, df: 0, total: 0 }
      e.df++
      e.total += g.count
      if (g.name) e.g.name = true
      all.set(key, e)
    }
  }
  const list = [...all.entries()].map(([key, e]) => ({ key, ...e, ok: e.df >= 2 }))
  const ranked = dropInner(list)
    .filter((e) => e.df >= 2 && (e.key.includes(' ') || e.g.name || (e.key.length >= 5 && e.total >= 3)) && !noisy(e.key))
    .map((e) => ({ key: e.key, text: formOf(e.g), score: e.df * 4 + e.total * nWeight(e.key.split(' ').length) * (e.g.name ? 1.5 : 1) }))
    .sort((x, y) => y.score - x.score)
  const kept: Phrase[] = []
  for (const p of ranked) {
    if (kept.some((k) => k.key.includes(p.key) || p.key.includes(k.key))) continue
    kept.push(p)
    if (kept.length >= n) break
  }
  if (kept.length < 3) for (const p of keyPhrases(sources.map((x) => x.text).join(' . '), n)) if (kept.length < n && !noisy(p.key) && !kept.some((k) => k.key === p.key)) kept.push(p)
  return kept
}

export function buildByTheme(title: string, sources: Source[], size: Size, a = analyse(sources)): GenMap {
  const cap = CAPS[size]
  const nodes: GenNode[] = [{ key: 'c', parent: null, label: title || 'What these sources share', kind: 'center', detail: '', url: '', source: '', color: '', x: 0, y: 0 }]
  const edges: GenEdge[] = []
  const themeSources = new Map<string, Set<number>>()
  sharedPhrases(sources, cap.themes).forEach((t, ti) => {
    const color = PALETTE[ti % PALETTE.length]
    const key = `t${ti}`
    nodes.push({ key, parent: 'c', label: cap1(t.text), kind: 'theme', detail: '', url: '', source: '', color, x: 0, y: 0 })
    // The best sentence about this theme from each source (most informative first).
    const evidence = sources
      .map((s, si) => a.ranked.filter((r) => r.src === si && contains(r.text, t.key)).sort((x, y) => y.score - x.score)[0])
      .filter((r): r is Ranked => !!r)
      .sort((x, y) => y.score - x.score)
      .slice(0, cap.perTheme)
    themeSources.set(key, new Set(evidence.map((r) => r.src)))
    evidence.forEach((r) => {
      const s = sources[r.src]
      nodes.push({ key: `${key}s${r.src}`, parent: key, label: shorten(r.text, 90), kind: 'leaf', detail: r.text, url: s.url ?? '', source: s.title, color, noteId: s.noteId, x: 0, y: 0 })
    })
  })
  const keys = [...themeSources.keys()]
  let added = 0
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length && added < 8; j++) {
      const both = [...themeSources.get(keys[i])!].filter((x) => themeSources.get(keys[j])!.has(x)).length
      if (both >= 2) {
        edges.push({ from: keys[i], to: keys[j], kind: 'related', label: `${both} sources` })
        added++
      }
    }
  }
  return finish(nodes, edges)
}

// ---------- Overview ----------

export function buildOverview(title: string, sources: Source[], size: Size, a = analyse(sources)): GenMap {
  const cap = CAPS[size]
  const nodes: GenNode[] = [{ key: 'c', parent: null, label: title || (sources.length === 1 ? sources[0].title : 'Overview'), kind: 'center', detail: '', url: sources.length === 1 ? (sources[0].url ?? '') : '', source: '', color: '', noteId: sources.length === 1 ? sources[0].noteId : undefined, x: 0, y: 0 }]
  const edges: GenEdge[] = []
  let g = 0
  const group = (label: string, icon: string): string => {
    const key = `g${g}`
    nodes.push({ key, parent: 'c', label: `${icon} ${label}`, kind: 'group', detail: '', url: '', source: '', color: PALETTE[g % PALETTE.length], x: 0, y: 0 })
    g++
    return key
  }
  const leaf = (parent: string, label: string, r: { text: string; src: number } | null, extra: Partial<GenNode> = {}): void => {
    const s = r ? sources[r.src] : undefined
    const color = nodes.find((n) => n.key === parent)?.color ?? ''
    nodes.push({ key: `${parent}l${nodes.length}`, parent, label, kind: 'leaf', detail: r?.text ?? '', url: s?.url ?? '', source: s?.title ?? '', color, noteId: s?.noteId, x: 0, y: 0, ...extra })
  }
  const allSents = a.ranked.map((r) => r.text)
  // Each sentence appears once on the map, under the first group that claims it.
  const used = new Set<string>()
  const fresh = (r: { text: string }): boolean => !used.has(r.text)
  const claim = <T extends { text: string }>(list: T[]): T[] => (list.forEach((r) => used.add(r.text)), list)

  // 1. The gist (self-contained sentences, spread across sources)
  const nGist = size === 'compact' ? 3 : 5
  let gist = a.fair((r) => standsAlone(r.text), nGist)
  if (gist.length < 2) gist = a.fair(() => true, nGist)
  if (gist.length) {
    const k = group('In short', '💡')
    claim(gist).forEach((r) => leaf(k, shorten(r.text, 95), r))
  }
  // 2. Key ideas (shared themes, each with its best sentence)
  const ideas = sharedPhrases(sources, cap.list)
  if (ideas.length) {
    const k = group('Key ideas', '🔑')
    ideas.forEach((p) => {
      const r = a.ranked.filter((x) => contains(x.text, p.key)).sort((x, y) => y.score - x.score)[0]
      leaf(k, cap1(p.text), r ?? null)
    })
  }
  // 3. Key terms (definitions) — mostly from study material
  const defs = definitions(allSents).slice(0, cap.list)
  if (defs.length) {
    const k = group('Key terms', '📖')
    defs.forEach((d) => {
      const r = a.ranked.find((x) => x.text === d.sentence) ?? null
      leaf(k, `${d.term}: ${shorten(d.definition, 70)}`, r)
    })
  }
  // 4. Who and where
  const entityNode = new Map<string, string>()
  for (const [type, label, icon] of [
    ['person', 'People', '👤'],
    ['org', 'Organisations', '🏛️'],
    ['place', 'Places', '📍']
  ] as const) {
    const strong = (e: Entity): boolean => e.count >= 2 || e.sources.size >= 2
    const list = a.entities.filter((e) => e.type === type).slice(0, cap.list)
    if (list.length < 2 || (!list.some(strong) && list.length < 3)) continue
    const k = group(label, icon)
    list.forEach((e) => {
      const r = a.ranked.filter((x) => x.text.includes(e.name) || x.text.includes(e.name.split(' ').pop()!)).sort((x, y) => y.score - x.score)[0]
      leaf(k, e.sources.size > 1 ? `${e.name} · ${e.sources.size} sources` : e.name, r ?? null)
      entityNode.set(e.name, nodes[nodes.length - 1].key)
    })
  }
  // Names mentioned together in a sentence are linked.
  const names = [...entityNode.keys()]
  let links = 0
  for (let i = 0; i < names.length && links < 10; i++) {
    for (let j = i + 1; j < names.length && links < 10; j++) {
      const together = allSents.filter((s) => s.includes(names[i]) && s.includes(names[j])).length
      if (together >= 1 && nodes.find((n) => n.key === entityNode.get(names[i]))?.parent !== nodes.find((n) => n.key === entityNode.get(names[j]))?.parent) {
        edges.push({ from: entityNode.get(names[i])!, to: entityNode.get(names[j])!, kind: 'related', label: '' })
        links++
      }
    }
  }
  // 5. Numbers & facts
  const facts = a.fair((r) => hasNumber(r.text) && fresh(r), cap.list - 1)
  if (facts.length >= 2) {
    const k = group('Numbers & facts', '🔢')
    claim(facts).forEach((r) => leaf(k, shorten(r.text, 90), r))
  }
  // 6. Timeline
  const tl = timeline(allSents.filter((s) => !used.has(s)))
  if (tl.length >= 2) {
    const k = group('Timeline', '🗓️')
    const seen = new Set<string>()
    tl.filter((t) => (seen.has(t.sentence) ? false : (seen.add(t.sentence), true)))
      .slice(0, cap.list)
      .forEach((t) => {
        used.add(t.sentence)
        leaf(k, `${t.when} — ${shorten(t.sentence, 70)}`, a.ranked.find((x) => x.text === t.sentence) ?? null)
      })
  }
  // 7. Debate & tensions
  const tens = new Set(tensions(allSents.filter((s) => !used.has(s))))
  if (tens.size) {
    const k = group('Debate & tensions', '⚖️')
    claim(a.fair((r) => tens.has(r.text), Math.min(cap.list - 2, tens.size))).forEach((r) => leaf(k, shorten(r.text, 90), r))
  }
  // 8. Sources
  if (sources.length > 1) {
    const k = group('Sources', '📚')
    sources.slice(0, cap.sources).forEach((s, si) => {
      const best = a.best((r) => r.src === si, 1)[0]
      leaf(k, shorten(s.title, 70), best ?? null, { kind: 'source', url: s.url ?? '', source: s.title, noteId: s.noteId })
    })
  }
  return finish(nodes, edges)
}

export function buildMap(style: Style, title: string, sources: Source[], size: Size): GenMap {
  const a = analyse(sources)
  return style === 'theme' ? buildByTheme(title, sources, size, a) : style === 'source' ? buildBySource(title, sources, size, a) : buildOverview(title, sources, size, a)
}

/** Words that matter in a label (for "everything said about this" searches). */
export const labelTerms = (label: string): string[] => contentWords(label.replace(/^[^\p{L}]+/u, '').split(/[:·—]/)[0])
