// Builds mindmaps from documents, notes and articles — on this PC, no AI service.
//  • "By source": each source's own outline (slide titles, headings, key points).
//  • "By theme": the key phrases and names several sources share, with what each says.
// Key phrases use RAKE (Rapid Automatic Keyword Extraction) plus a boost for names.

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

export interface GenNode {
  key: string
  parent: string | null
  label: string
  kind: 'center' | 'branch' | 'leaf' | 'source' | 'theme'
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

const PALETTE = ['#7357ff', '#0aa5c8', '#f59e0b', '#e8457a', '#10b981', '#3d8bff', '#f97316', '#8b5cf6', '#14b8a6', '#ef4444']

// ---------- Text helpers ----------

const STOP = new Set(
  `a about above after again against all also am an and any are aren't as at be because been before being below between both but by can can't cannot could couldn't did didn't do does doesn't doing don't down during each even ever every few for from further get gets got had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself him himself his how how's however i i'd i'll i'm i've if in into is isn't it it's its itself just let's like made make makes many may me might more most much must mustn't my myself new no nor not now of off often on once one only or other others ought our ours ourselves out over own per perhaps rather really said same say says see seen shall shan't she she'd she'll she's should shouldn't since so some still such than that that's the their theirs them themselves then there there's these they they'd they'll they're they've this those though through thus to too two under until up upon us use used using very via was wasn't way we we'd we'll we're we've well were weren't what what's when when's where where's whether which while who who's whom whose why why's will with within without won't would wouldn't yet you you'd you'll you're you've your yours yourself yourselves also however therefore although because while whereas first second third last next back today yesterday tomorrow year years time times week weeks day days people thing things lot lots way ways part parts number new old good great big small high low long short many much several various including include includes according mr mrs ms dr`.split(/\s+/)
)

export const sentences = (text: string): string[] =>
  text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"'(])/)
    .map((s) => s.trim())
    .filter((s) => s.split(' ').length >= 4 && s.length < 600)

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

/** Key phrases: repeated 1–3 word phrases (no stop words, within a line or sentence),
 *  with a boost for names (“European Union”, “NATO”). Two-word concepts score highest. */
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
  // Names: runs of Capitalised Words and acronyms.
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
  // Drop phrases that overlap a better one ("memory" under "working memory").
  const kept: Phrase[] = []
  for (const p of out) {
    if (kept.some((k) => k.key.includes(p.key) || p.key.includes(k.key))) continue
    kept.push(p)
    if (kept.length >= limit) break
  }
  return kept
}

const contains = (text: string, key: string): boolean => new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)

// ---------- Outlines ----------

/** Outline from cleaned HTML: headings (or bold heading-like lines) with their key points. */
export function outlineFromHtml(html: string, title: string): Section[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const sections: Section[] = []
  let cur: Section | null = null
  const blocks = doc.body.querySelectorAll('h1,h2,h3,h4,p,li,blockquote')
  for (const el of Array.from(blocks)) {
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
    const first = sentences(text)[0] ?? text
    if (first.split(' ').length >= 2) cur.points.push({ text: shorten(first), detail: text.slice(0, 600) })
  }
  return sections.filter((s) => s.title || s.points.length)
}

/** When a source has no usable headings, group its sentences around its key phrases. */
export function outlineFromPhrases(text: string, n = 6): Section[] {
  const sents = sentences(text)
  return keyPhrases(text, n)
    .map((p) => ({
      title: p.text,
      points: sents
        .filter((s) => contains(s, p.key))
        .slice(0, 4)
        .map((s) => ({ text: shorten(s), detail: s }))
    }))
    .filter((s) => s.points.length)
}

export function bestOutline(html: string, text: string, title: string): Section[] {
  const o = outlineFromHtml(html, title).filter((s) => s.title)
  return o.length >= 2 ? o : outlineFromPhrases(text)
}

// ---------- Building maps ----------

/** Radial layout: each branch gets a slice of the circle sized by how many leaves it has. */
export function radialLayout(nodes: GenNode[]): void {
  const kids = new Map<string | null, GenNode[]>()
  for (const n of nodes) kids.set(n.parent, [...(kids.get(n.parent) ?? []), n])
  const leaves = (n: GenNode): number => {
    const k = kids.get(n.key) ?? []
    return k.length ? k.reduce((s, c) => s + leaves(c), 0) : 1
  }
  const RADII = [0, 250, 480, 700, 900]
  const place = (n: GenNode, depth: number, a0: number, a1: number): void => {
    const a = (a0 + a1) / 2
    const r = RADII[Math.min(depth, RADII.length - 1)]
    const w = Math.min(240, 60 + n.label.length * 6.2)
    n.x = Math.round(Math.cos(a) * r * 1.35 - w / 2) // wider than tall, like a screen
    n.y = Math.round(Math.sin(a) * r - 20)
    const k = kids.get(n.key) ?? []
    const total = k.reduce((s, c) => s + leaves(c), 0)
    let start = a0
    for (const c of k) {
      const span = ((a1 - a0) * leaves(c)) / Math.max(1, total)
      place(c, depth + 1, start, start + span)
      start += span
    }
  }
  const root = nodes.find((n) => n.parent === null)
  if (root) place(root, 0, -Math.PI / 2, (Math.PI * 3) / 2)
}

const CAPS: Record<Size, { sources: number; sections: number; points: number; themes: number; perTheme: number }> = {
  compact: { sources: 6, sections: 5, points: 2, themes: 6, perTheme: 3 },
  detailed: { sources: 10, sections: 9, points: 4, themes: 10, perTheme: 5 }
}

export function buildBySource(title: string, sources: Source[], size: Size): { nodes: GenNode[]; edges: GenEdge[] } {
  const cap = CAPS[size]
  const nodes: GenNode[] = []
  const edges: GenEdge[] = []
  const single = sources.length === 1
  const center: GenNode = { key: 'c', parent: null, label: title || sources[0]?.title || 'Mindmap', kind: 'center', detail: '', url: single ? (sources[0].url ?? '') : '', source: '', color: '', noteId: single ? sources[0].noteId : undefined, x: 0, y: 0 }
  nodes.push(center)
  const sectionNodes: { node: GenNode; text: string; src: number }[] = []
  sources.slice(0, cap.sources).forEach((s, si) => {
    const color = PALETTE[si % PALETTE.length]
    let parent = 'c'
    if (!single) {
      const sn: GenNode = { key: `s${si}`, parent: 'c', label: shorten(s.title, 60), kind: 'source', detail: '', url: s.url ?? '', source: s.title, color, noteId: s.noteId, x: 0, y: 0 }
      nodes.push(sn)
      parent = sn.key
    }
    s.sections.slice(0, cap.sections).forEach((sec, ci) => {
      const bcolor = single ? PALETTE[ci % PALETTE.length] : color
      const bn: GenNode = { key: `s${si}b${ci}`, parent, label: shorten(sec.title || sec.points[0]?.text || 'Section', 60), kind: 'branch', detail: '', url: s.url ?? '', source: s.title, color: bcolor, noteId: s.noteId, x: 0, y: 0 }
      nodes.push(bn)
      sectionNodes.push({ node: bn, text: `${sec.title} ${sec.points.map((p) => p.detail).join(' ')}`, src: si })
      sec.points.slice(0, cap.points).forEach((p, pi) => {
        nodes.push({ key: `${bn.key}p${pi}`, parent: bn.key, label: p.text, kind: 'leaf', detail: p.detail, url: s.url ?? '', source: s.title, color: bcolor, noteId: s.noteId, x: 0, y: 0 })
      })
    })
  })
  for (const n of nodes) if (n.parent) edges.push({ from: n.parent, to: n.key, kind: '', label: '' })
  // Cross-links: sections in different sources that talk about the same thing.
  if (!single) {
    const shared = sharedPhrases(sources, 10)
    let added = 0
    for (const ph of shared) {
      const hits = sectionNodes.filter((x) => contains(x.text, ph.key))
      const bySource = new Map<number, GenNode>()
      for (const h of hits) if (!bySource.has(h.src)) bySource.set(h.src, h.node)
      const list = [...bySource.values()]
      for (let i = 1; i < list.length && added < 14; i++, added++) edges.push({ from: list[i - 1].key, to: list[i].key, kind: 'related', label: ph.text })
    }
  }
  radialLayout(nodes)
  return { nodes, edges }
}

/** Phrases that come up in several sources (or the strongest ones if there's just one). */
export function sharedPhrases(sources: Source[], n: number): Phrase[] {
  if (sources.length < 2) return keyPhrases(sources[0]?.text ?? '', n)
  const per = sources.map((src) => grams(src.text))
  const all = new Map<string, { g: Gram; df: number; total: number }>()
  for (const m of per) {
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
    .filter((e) => e.df >= 2 && (e.key.includes(' ') || e.g.name || (e.key.length >= 5 && e.total >= 3)))
    .filter((e) => !sources.some((src) => src.noise?.some((x) => x.toLowerCase().includes(e.key) || e.key.includes(x.toLowerCase()))))
    .map((e) => ({ key: e.key, text: formOf(e.g), score: e.df * 4 + e.total * nWeight(e.key.split(' ').length) * (e.g.name ? 1.5 : 1) }))
    .sort((x, y) => y.score - x.score)
  const kept: Phrase[] = []
  for (const p of ranked) {
    if (kept.some((k) => k.key.includes(p.key) || p.key.includes(k.key))) continue
    kept.push(p)
    if (kept.length >= n) break
  }
  // Too little in common: fall back to each source's strongest phrases.
  if (kept.length < 3) for (const p of keyPhrases(sources.map((x) => x.text).join(' . '), n)) if (kept.length < n && !kept.some((k) => k.key === p.key)) kept.push(p)
  return kept
}

export function buildByTheme(title: string, sources: Source[], size: Size): { nodes: GenNode[]; edges: GenEdge[] } {
  const cap = CAPS[size]
  const nodes: GenNode[] = [{ key: 'c', parent: null, label: title || 'What these sources share', kind: 'center', detail: '', url: '', source: '', color: '', x: 0, y: 0 }]
  const edges: GenEdge[] = []
  const themes = sharedPhrases(sources, cap.themes)
  const themeSources = new Map<string, Set<number>>()
  themes.forEach((t, ti) => {
    const color = PALETTE[ti % PALETTE.length]
    const tn: GenNode = { key: `t${ti}`, parent: 'c', label: t.text.charAt(0).toUpperCase() + t.text.slice(1), kind: 'theme', detail: '', url: '', source: '', color, x: 0, y: 0 }
    nodes.push(tn)
    const used = new Set<number>()
    let count = 0
    sources.forEach((s, si) => {
      if (count >= cap.perTheme) return
      const sent = sentences(s.text).find((x) => contains(x, t.key))
      if (!sent) return
      used.add(si)
      count++
      nodes.push({ key: `t${ti}s${si}`, parent: tn.key, label: shorten(sent, 80), kind: 'leaf', detail: sent, url: s.url ?? '', source: s.title, color, noteId: s.noteId, x: 0, y: 0 })
    })
    themeSources.set(tn.key, used)
  })
  for (const n of nodes) if (n.parent) edges.push({ from: n.parent, to: n.key, kind: '', label: '' })
  // Themes discussed by the same sources are linked.
  const keys = [...themeSources.keys()]
  let added = 0
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length && added < 8; j++) {
      const a = themeSources.get(keys[i])!
      const b = themeSources.get(keys[j])!
      const both = [...a].filter((x) => b.has(x)).length
      if (both >= 2) {
        edges.push({ from: keys[i], to: keys[j], kind: 'related', label: `${both} sources` })
        added++
      }
    }
  }
  radialLayout(nodes)
  return { nodes, edges }
}
