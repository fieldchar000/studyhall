// Turns the Brain (everything you've saved, see lib/brain.ts) into galaxy stars, and works out
// the extra Brain views: fading stars, exam gaps, hidden links and the time-lapse order.

import type { Brain, BNode, Kind } from '@/lib/brain'
import type { Cat, GStar, Lobe } from './scene'

const DAY = 86400000
const MAX_STARS = 2400

const LOBE: Record<Kind, Lobe> = {
  module: 'parietal',
  week: 'parietal',
  note: 'temporal',
  idea: 'temporal',
  deck: 'temporal',
  mindmap: 'temporal',
  material: 'occipital',
  paper: 'occipital',
  video: 'occipital',
  person: 'frontal',
  fact: 'frontal',
  moment: 'frontal',
  plan: 'frontal',
  journal: 'frontal',
  assessment: 'prefrontal',
  task: 'motor',
  project: 'motor',
  language: 'cerebellum',
  media: 'cerebellum'
}

const daysFromNow = (iso: string | null): number | null => {
  if (!iso) return null
  const t = Date.parse(iso.length === 10 ? iso + 'T00:00' : iso)
  return Number.isNaN(t) ? null : (t - Date.now()) / DAY
}

function catOf(n: BNode): Cat {
  const d = daysFromNow(n.date)
  if (n.kind === 'assessment' && d != null && d > -1 && d < 60) return 'due'
  if (n.kind === 'task' && d != null && d > -1 && d < 21) return 'due'
  if (n.kind === 'project') return 'proj'
  return n.side === 'study' ? 'study' : n.side === 'life' ? 'life' : 'proj'
}

export function starsFromBrain(b: Brain): { stars: GStar[]; links: [string, string][] } {
  // Keep the busiest things if there are a great many (ideas are the first to go).
  let nodes = [...b.nodes.values()]
  if (nodes.length > MAX_STARS) nodes = nodes.sort((x, y) => Number(x.kind === 'idea') - Number(y.kind === 'idea') || y.degree - x.degree).slice(0, MAX_STARS)
  const dated = nodes.filter((n) => n.date).sort((x, y) => (x.date! < y.date! ? -1 : 1))
  const rank = new Map(dated.map((n, i) => [n.id, i]))
  const stars: GStar[] = nodes.map((n) => {
    const r = rank.get(n.id)
    return {
      id: n.id,
      label: n.label,
      sub: n.sub,
      cat: catOf(n),
      lobe: n.kind === 'task' && catOf(n) === 'due' ? 'prefrontal' : LOBE[n.kind],
      big: n.kind === 'module' || n.kind === 'person' || n.kind === 'project',
      born: r == null ? 0.05 + (n.degree % 7) / 30 : 0.1 + (0.88 * r) / Math.max(1, dated.length - 1)
    }
  })
  const keep = new Set(stars.map((s) => s.id))
  const links = b.edges.filter((e) => keep.has(e.a) && keep.has(e.b)).map((e) => [e.a, e.b] as [string, string])
  return { stars, links }
}

/** Notes and decks you haven't touched in the longest time, among study things. */
export function fadingStars(b: Brain, limit = 6): BNode[] {
  return [...b.nodes.values()]
    .filter((n) => (n.kind === 'note' || n.kind === 'deck' || n.kind === 'mindmap') && n.side === 'study' && n.date)
    .map((n) => ({ n, age: -(daysFromNow(n.date) ?? 0) }))
    .filter((x) => x.age > 10)
    .sort((x, y) => y.age - x.age)
    .slice(0, limit)
    .map((x) => x.n)
}

export interface Gap {
  module: BNode
  exam: BNode
  daysLeft: number
  weeks: BNode[] // weeks with no notes or files yet
}

/** For each assessment in the next 45 days: the weeks of that module you have nothing saved for. */
export function examGaps(b: Brain): Gap[] {
  const out: Gap[] = []
  for (const a of b.assessments) {
    const d = daysFromNow(a.due_at)
    if (d == null || d < 0 || d > 45) continue
    const exam = b.nodes.get(`assessment:${a.id}`)
    const module = b.nodes.get(`module:${a.module_id}`)
    if (!exam || !module) continue
    const weeks = b.weeks
      .filter((w) => w.module_id === a.module_id)
      .map((w) => b.nodes.get(`week:${w.id}`))
      .filter((w): w is BNode => !!w)
      .filter((w) => ![...(b.adj.get(w.id) ?? [])].some((id) => ['note', 'material', 'deck', 'mindmap', 'video'].includes(b.nodes.get(id)?.kind ?? '')))
    if (weeks.length) out.push({ module, exam, daysLeft: Math.ceil(d), weeks })
  }
  return out.sort((x, y) => x.daysLeft - y.daysLeft)
}

export interface Hidden {
  a: BNode
  b: BNode
  via: string[]
}

/** Notes and files that share two or more ideas but aren't linked, best first. */
export function hiddenLinks(b: Brain, limit = 6): Hidden[] {
  const docKinds = new Set(['note', 'material', 'deck', 'mindmap', 'video', 'paper'])
  const pairs = new Map<string, { a: string; b: string; via: string[] }>()
  for (const n of b.nodes.values()) {
    if (n.kind !== 'idea') continue
    const docs = [...(b.adj.get(n.id) ?? [])].filter((id) => docKinds.has(b.nodes.get(id)?.kind ?? ''))
    if (docs.length < 2 || docs.length > 12) continue
    for (let i = 0; i < docs.length; i++)
      for (let j = i + 1; j < docs.length; j++) {
        const [x, y] = docs[i] < docs[j] ? [docs[i], docs[j]] : [docs[j], docs[i]]
        const k = `${x}|${y}`
        const p = pairs.get(k) ?? { a: x, b: y, via: [] }
        p.via.push(n.label)
        pairs.set(k, p)
      }
  }
  const sameModule = (x: BNode, y: BNode): boolean => !!x.sub && x.sub.split(' · ').pop() === y.sub.split(' · ').pop()
  return [...pairs.values()]
    .filter((p) => p.via.length >= 2 && !b.adj.get(p.a)?.has(p.b))
    .map((p) => ({ a: b.nodes.get(p.a)!, b: b.nodes.get(p.b)!, via: p.via }))
    .sort((x, y) => Number(sameModule(x.a, x.b)) - Number(sameModule(y.a, y.b)) || y.via.length - x.via.length)
    .slice(0, limit)
}
