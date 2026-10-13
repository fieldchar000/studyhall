// Asking the Brain things in plain words — "what does Alex like", "when is my EC1101 exam",
// "what is elasticity", "what's due this week". No AI: a handful of question shapes, matched
// with patterns, answered straight from what you've saved. Anything else becomes a search.

import type { Brain, BNode } from './brain'
import { norm } from './brain'
import { definitions, splitSentences } from './nlp'
import { FACT_CATEGORIES } from './peopleContent'
import { fmtPct, summarize } from './grades'
import type { Module, Person } from '@shared/types'

export interface AnswerLine {
  text: string
  sub?: string
  node?: string // click to jump to this dot
}

export interface Answer {
  title: string
  lines: AnswerLine[]
  focus: string[] // dots to light up
  empty?: string // shown when there are no lines
  hint?: string
}

const catLabel = (id: string): string => FACT_CATEGORIES.find((c) => c.id === id)?.label ?? id
const PARTNER_WORDS = /\b(?:my\s+)?(?:girlfriend|boyfriend|partner|gf|bf|wife|husband|fianc[eé]e?|bae|babe|love|other half|significant other)\b/

const DAY = 86400000
const fmtDay = (iso: string): string => new Date(iso.length === 10 ? iso + 'T00:00' : iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
const daysUntil = (iso: string): number => Math.round((new Date(iso.length === 10 ? iso + 'T00:00' : iso).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / DAY)
const inDays = (n: number): string => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : n === -1 ? 'yesterday' : n > 0 ? `in ${n} days` : `${-n} days ago`)

// ---------- Finding who / what a question is about ----------

function findPerson(b: Brain, text: string): Person | null {
  const t = norm(text)
  if (!t) return null
  const label = norm(b.partnerLabel)
  if (b.partnerId && (PARTNER_WORDS.test(t) || (label && t.includes(label)))) return b.people.find((p) => p.id === b.partnerId) ?? null
  const words = new Set(t.split(' ').map((w) => w.replace(/s$/, '')))
  const exact = b.people.find((p) => t.includes(norm(p.name)))
  if (exact) return exact
  const first = b.people.filter((p) => {
    const f = norm(p.name).split(' ')[0]
    return f.length >= 2 && (words.has(f) || words.has(f.replace(/s$/, '')))
  })
  if (first.length) return first[0]
  return b.people.find((p) => norm(p.name).startsWith(t)) ?? null
}

function findModule(b: Brain, text: string): Module | null {
  const t = norm(text)
  const squash = t.replace(/\s+/g, '')
  return (
    b.modules.find((m) => m.code && squash.includes(m.code.toLowerCase().replace(/\s+/g, ''))) ??
    b.modules.find((m) => t.includes(norm(m.name))) ??
    b.modules.find((m) => {
      const words = norm(m.name)
        .split(' ')
        .filter((w) => w.length > 3)
      return words.length > 0 && words.some((w) => t.split(' ').includes(w))
    }) ??
    null
  )
}

// ---------- People ----------

function factsAbout(b: Brain, p: Person, cats: string[] | null, title: string, empty: string, extra?: (text: string) => boolean): Answer {
  const facts = b.facts.filter((f) => f.person_id === p.id && ((cats && cats.includes(f.category)) || (extra && extra(f.text))))
  return {
    title,
    lines: facts.map((f) => ({ text: f.text, sub: catLabel(f.category), node: `fact:${f.id}` })),
    focus: [`person:${p.id}`, ...facts.map((f) => `fact:${f.id}`)],
    empty
  }
}

function nextDate(mmdd: string): { date: Date; days: number } {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const [m, d] = mmdd.split('-').map(Number)
  let next = new Date(now.getFullYear(), m - 1, d)
  if (next < now) next = new Date(now.getFullYear() + 1, m - 1, d)
  return { date: next, days: Math.round((next.getTime() - now.getTime()) / DAY) }
}

function personSummary(b: Brain, p: Person): Answer {
  const lines: AnswerLine[] = []
  const pid = `person:${p.id}`
  if (p.relation) lines.push({ text: p.relation, sub: 'Who' })
  if (p.birthday) {
    const n = nextDate(p.birthday.slice(5))
    lines.push({ text: `${n.date.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })} — ${inDays(n.days)}`, sub: 'Birthday' })
  }
  if (p.how_met) lines.push({ text: p.how_met, sub: 'How you met' })
  const byCat = new Map<string, string[]>()
  for (const f of b.facts.filter((f) => f.person_id === p.id)) byCat.set(f.category, [...(byCat.get(f.category) ?? []), f.text])
  for (const [c, list] of byCat) lines.push({ text: list.slice(0, 4).join(' · ') + (list.length > 4 ? ` +${list.length - 4}` : ''), sub: catLabel(c) })
  const moments = [...(b.adj.get(pid) ?? [])].map((id) => b.nodes.get(id)!).filter((n) => n.kind === 'moment')
  if (moments.length) lines.push({ text: `${moments.length} saved memor${moments.length === 1 ? 'y' : 'ies'}`, sub: 'Together' })
  return { title: p.name, lines, focus: [pid, ...(b.adj.get(pid) ?? [])], empty: `Nothing saved about ${p.name} yet.` }
}

function askPerson(b: Brain, q: string): Answer | null {
  const p = findPerson(b, q)
  if (!p) return null
  const n = p.name.split(' ')[0]
  const add = `Add details on ${p.name}’s page and they’ll show up here.`
  if (/\b(?:allerg|can'?t eat|cannot eat)/.test(q)) return factsAbout(b, p, null, `${n}’s allergies`, `No allergies saved for ${n}. ${add}`, (t) => /allerg|intoleran|can'?t eat|no (?:nuts|peanuts|dairy|gluten|seafood|shellfish)/i.test(t))
  if (/\b(?:hate|hates|dislike|dislikes|doesn'?t like|does not like|don'?t like|not a fan)\b/.test(q)) return factsAbout(b, p, ['dislikes'], `What ${n} doesn’t like`, `No dislikes saved for ${n}. ${add}`)
  if (/\b(?:gift|gifts|present|presents|buy|get (?:her|him|them))\b/.test(q)) {
    const a = factsAbout(b, p, ['gifts'], `Gift ideas for ${n}`, `No gift ideas saved for ${n} yet.`)
    const likes = b.facts.filter((f) => f.person_id === p.id && f.category === 'likes')
    if (likes.length) {
      a.lines.push(...likes.map((f) => ({ text: f.text, sub: 'Things they love (for inspiration)', node: `fact:${f.id}` })))
      a.focus.push(...likes.map((f) => `fact:${f.id}`))
    }
    return a
  }
  if (/\b(?:eat|drink|food|foods|hungry|order|kopi|coffee|tea|restaurant|cuisine)\b/.test(q)) return factsAbout(b, p, ['food'], `${n}’s food & drinks`, `No food details saved for ${n}. ${add}`)
  if (/\b(?:size|sizes|ring|shoe|shirt|dress)\b/.test(q)) return factsAbout(b, p, ['sizes'], `${n}’s sizes`, `No sizes saved for ${n}. ${add}`)
  if (/\b(?:birthday|bday|born)\b/.test(q)) {
    if (!p.birthday) return { title: `${n}’s birthday`, lines: [], focus: [`person:${p.id}`], empty: `No birthday saved for ${n}. ${add}` }
    const nx = nextDate(p.birthday.slice(5))
    const year = Number(p.birthday.slice(0, 4))
    const age = year > 1900 ? nx.date.getFullYear() - year : null
    return { title: `${n}’s birthday`, lines: [{ text: nx.date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }), sub: `${inDays(nx.days)}${age ? ` · turning ${age}` : ''}`, node: `person:${p.id}` }], focus: [`person:${p.id}`] }
  }
  if (/\banniversary\b/.test(q)) {
    if (!p.anniversary) return { title: 'Anniversary', lines: [], focus: [`person:${p.id}`], empty: `No anniversary saved for ${n}.` }
    const nx = nextDate(p.anniversary.slice(5))
    const years = nx.date.getFullYear() - Number(p.anniversary.slice(0, 4))
    return { title: 'Your anniversary', lines: [{ text: nx.date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }), sub: `${inDays(nx.days)} · ${years} year${years === 1 ? '' : 's'}`, node: `person:${p.id}` }], focus: [`person:${p.id}`] }
  }
  if (/\b(?:going on|up to|doing lately|how is|how's|news|what'?s new)\b/.test(q)) return factsAbout(b, p, ['life'], `What’s going on with ${n}`, `Nothing saved under “What’s going on” for ${n}.`)
  if (/\b(?:important|remember|know about|need to know|pet|siblings?)\b/.test(q) && !/\bnotes?\b/.test(q)) return factsAbout(b, p, ['important', 'dates'], `Important to remember about ${n}`, `Nothing saved under “Important to know” for ${n}.`)
  if (/\b(?:memor(?:y|ies)|did we|we did|dates? with|together|went|been)\b/.test(q)) {
    const ms = [...(b.adj.get(`person:${p.id}`) ?? [])].map((id) => b.nodes.get(id)!).filter((x) => x.kind === 'moment' || x.kind === 'plan' || x.kind === 'journal')
    ms.sort((x, y) => (y.date ?? '').localeCompare(x.date ?? ''))
    return { title: `With ${n}`, lines: ms.slice(0, 12).map((m) => ({ text: m.label, sub: m.sub, node: m.id })), focus: [`person:${p.id}`, ...ms.map((m) => m.id)], empty: `No memories with ${n} yet.` }
  }
  if (/\b(?:like|likes|love|loves|enjoy|enjoys|into|favou?rites?|prefer|want|wants|happy)\b/.test(q)) {
    return factsAbout(b, p, ['likes', 'food'], `What ${n} likes`, `Nothing saved under “Loves & likes” for ${n}. ${add}`)
  }
  if (/^(?:who(?:'s| is)|tell me about|about)\b/.test(q) || norm(q) === norm(p.name) || norm(q) === norm(n)) return personSummary(b, p)
  return null
}

// ---------- Studies ----------

function upcoming(b: Brain, within: number, moduleId: string | null): Answer {
  const lines: (AnswerLine & { at: number })[] = []
  for (const a of b.assessments) {
    if (!a.due_at || (moduleId && a.module_id !== moduleId)) continue
    const d = daysUntil(a.due_at)
    if (d < 0 || d > within) continue
    const m = b.modules.find((x) => x.id === a.module_id)
    lines.push({ text: a.title, sub: `${m?.code || m?.name || ''} · ${a.kind} · ${fmtDay(a.due_at)} (${inDays(d)})`, node: `assessment:${a.id}`, at: d })
  }
  for (const t of b.tasks) {
    if (t.status === 'done' || !t.due_at || (moduleId && t.module_id !== moduleId)) continue
    const d = daysUntil(t.due_at)
    if (d < -7 || d > within) continue
    lines.push({ text: t.title, sub: `Task · ${d < 0 ? 'overdue' : fmtDay(t.due_at)} (${inDays(d)})`, node: `task:${t.id}`, at: d })
  }
  lines.sort((x, y) => x.at - y.at)
  return {
    title: within <= 1 ? 'Due today' : within <= 7 ? 'Due this week' : within <= 14 ? 'Due in the next two weeks' : 'Coming up',
    lines,
    focus: lines.map((l) => l.node!).filter(Boolean),
    empty: 'Nothing due — enjoy it.'
  }
}

function moduleStats(b: Brain, m: Module): Answer {
  const as = b.assessments.filter((a) => a.module_id === m.id)
  const g = summarize(as, m.target_grade)
  const focus = b.focus.filter((f) => f.module_id === m.id).reduce((s, f) => s + (f.focused_seconds || 0), 0)
  const cards = b.recall.filter((c) => c.module_id === m.id && c.reviews > 0)
  const got = cards.filter((c) => c.last_result === 'got').length
  const lines: AnswerLine[] = [
    { text: g.average == null ? 'No marks yet' : `${fmtPct(g.average)} average so far`, sub: g.needed != null ? `Need ${fmtPct(g.needed)} on ${g.neededLabel} for your ${m.target_grade}% target` : 'Grades' },
    { text: focus ? `${Math.floor(focus / 3600)}h ${Math.round((focus % 3600) / 60)}m focused` : 'No focus sessions yet', sub: 'Focus time' },
    { text: cards.length ? `${Math.round((got / cards.length) * 100)}% remembered on the last try` : 'No active recall yet', sub: `${cards.length} pages reviewed` }
  ]
  const next = as.filter((a) => a.due_at && daysUntil(a.due_at) >= 0).sort((x, y) => x.due_at!.localeCompare(y.due_at!))[0]
  if (next) lines.push({ text: next.title, sub: `Next up · ${fmtDay(next.due_at!)} (${inDays(daysUntil(next.due_at!))})`, node: `assessment:${next.id}` })
  return { title: `How you’re doing in ${m.code || m.name}`, lines, focus: [`module:${m.id}`] }
}

function weekContents(b: Brain, m: Module, n: number): Answer {
  const w = b.weeks.find((x) => x.module_id === m.id && x.number === n)
  if (!w) return { title: `${m.code || m.name} · Week ${n}`, lines: [], focus: [`module:${m.id}`], empty: `There’s no Week ${n} in ${m.code || m.name}.` }
  const items = [...(b.adj.get(`week:${w.id}`) ?? [])].map((id) => b.nodes.get(id)!).filter((x) => x.kind !== 'module')
  return { title: `${m.code || m.name} · Week ${n}${w.title ? ` — ${w.title}` : ''}`, lines: items.map((x) => ({ text: x.label, sub: x.sub, node: x.id })), focus: [`week:${w.id}`, ...items.map((x) => x.id)], empty: 'Nothing filed in this week yet.' }
}

function askStudy(b: Brain, q: string): Answer | null {
  const m = findModule(b, q)
  const weekN = /\bweek\s*(\d{1,2})\b/.exec(q)
  if (m && weekN) return weekContents(b, m, Number(weekN[1]))
  if (/\b(?:how am i doing|how'?m i doing|my grades?|my marks?|average|on track|stats?|progress)\b/.test(q) && m) return moduleStats(b, m)
  if (/\b(?:due|deadlines?|upcoming|coming up|to do|todo|what'?s next)\b/.test(q)) {
    const within = /\btoday\b/.test(q) ? 0 : /\btomorrow\b/.test(q) ? 1 : /\bnext week\b|\btwo weeks\b|\bfortnight\b/.test(q) ? 14 : /\bmonth\b/.test(q) ? 31 : 7
    return upcoming(b, within, m?.id ?? null)
  }
  if (/\b(?:when|what time|what day)\b/.test(q) && /\b(?:exam|exams|final|finals|midterm|midterms|test|tests|quiz|quizzes|assignment|essay|presentation|lab|due)\b/.test(q)) {
    const kind = /quiz/.test(q) ? 'quiz' : /assignment|essay/.test(q) ? 'assignment' : /presentation/.test(q) ? 'presentation' : /\blab\b/.test(q) ? 'lab' : /exam|final|midterm|test/.test(q) ? 'exam' : null
    const as = b.assessments
      .filter((a) => (!m || a.module_id === m.id) && (!kind || a.kind === kind || (kind === 'exam' && /exam|final|midterm|test/i.test(a.title))) && a.due_at)
      .sort((x, y) => x.due_at!.localeCompare(y.due_at!))
    const future = as.filter((a) => daysUntil(a.due_at!) >= 0)
    const shown = future.length ? future : as.slice(-3)
    return {
      title: `${m ? `${m.code || m.name} ` : ''}${kind ? `${kind}s` : 'deadlines'}`.replace(/^./, (c) => c.toUpperCase()),
      lines: shown.map((a) => {
        const mm = b.modules.find((x) => x.id === a.module_id)
        const d = daysUntil(a.due_at!)
        return { text: a.title, sub: `${m ? '' : `${mm?.code || mm?.name} · `}${new Date(a.due_at!).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · ${inDays(d)}${a.weight_pct ? ` · ${a.weight_pct}%` : ''}`, node: `assessment:${a.id}` }
      }),
      focus: [...(m ? [`module:${m.id}`] : []), ...shown.map((a) => `assessment:${a.id}`)],
      empty: `No ${kind ?? 'assessment'} dates saved${m ? ` for ${m.code || m.name}` : ''}. Add them under the module’s Assessments tab.`
    }
  }
  if (m && /^(?:what'?s in|show(?: me)?|open|about|tell me about)?\s*\S+(?:\s+\S+){0,5}$/.test(q) && norm(q).replace(/^(?:what s in|show me|show|open|about|tell me about)\s*/, '').length <= norm(m.name).length + 2) {
    const id = `module:${m.id}`
    const weeks = b.weeks.filter((w) => w.module_id === m.id).sort((x, y) => x.number - y.number)
    return {
      title: `${m.code ? `${m.code} — ` : ''}${m.name}`,
      lines: weeks.map((w) => ({ text: `Week ${w.number}${w.title ? ` — ${w.title}` : ''}`, sub: ((n) => `${n} item${n === 1 ? '' : 's'}`)((b.adj.get(`week:${w.id}`)?.size ?? 1) - 1), node: `week:${w.id}` })),
      focus: [id, ...(b.adj.get(id) ?? [])],
      empty: 'No weeks in this module yet.'
    }
  }
  return null
}

// ---------- Knowledge: "what is X", "notes about X" ----------

function snippet(text: string, term: string): string | null {
  const lower = text.toLowerCase()
  const i = lower.indexOf(term)
  if (i < 0) return null
  let s = Math.max(0, lower.lastIndexOf('\n', i), ...['. ', '? ', '! '].map((p) => lower.lastIndexOf(p, i) + 1))
  let e = text.length
  for (const p of ['. ', '? ', '! ', '\n']) {
    const k = text.indexOf(p, i + term.length)
    if (k >= 0) e = Math.min(e, k + 1)
  }
  // A bare heading ("Price elasticity of demand") says little: take the line(s) after it too.
  while (e - s < 45 && e < text.length) {
    let next = text.length
    for (const p of ['. ', '? ', '! ', '\n']) {
      const k = text.indexOf(p, e + 1)
      if (k >= 0) next = Math.min(next, k + 1)
    }
    if (next - s > 300) break
    e = next
  }
  if (e - s > 260) {
    s = Math.max(s, i - 110)
    e = Math.min(e, i + term.length + 140)
  }
  return text.slice(s, e).replace(/\s+/g, ' ').trim()
}

function knowledge(b: Brain, term: string, wantDefinition: boolean, title?: string): Answer | null {
  const t = norm(term).replace(/^(?:a|an|the)\s+/, '')
  if (t.length < 2) return null
  const hits: { node: BNode; snip: string | null; score: number }[] = []
  for (const [id, text] of b.docText) {
    const node = b.nodes.get(id)
    if (!node) continue
    const inLabel = norm(node.label).includes(t)
    const snip = snippet(text, t)
    if (!inLabel && !snip) continue
    const count = text.toLowerCase().split(t).length - 1
    hits.push({ node, snip, score: (inLabel ? 20 : 0) + Math.min(count, 15) + (node.side === 'study' ? 1 : 0) })
  }
  const idea = b.nodes.get(`idea:${t}`) ?? [...b.nodes.values()].find((n) => n.kind === 'idea' && norm(n.label) === t)
  if (!hits.length && !idea) return null
  hits.sort((x, y) => y.score - x.score)
  const lines: AnswerLine[] = []
  if (wantDefinition) {
    // Sentences shaped like a definition ("Elasticity is…", "X refers to…") from your own notes and files
    const sents: string[] = []
    for (const h of hits.slice(0, 25)) {
      const text = b.docText.get(h.node.id) ?? ''
      const lower = text.toLowerCase()
      let from = 0
      for (let k = 0; k < 6; k++) {
        const i = lower.indexOf(t, from)
        if (i < 0) break
        sents.push(...splitSentences(text.slice(Math.max(0, i - 40), i + 320)))
        from = i + t.length
      }
    }
    const defs = definitions(sents).filter((d) => norm(d.term).includes(t) || t.includes(norm(d.term)))
    const src = (s: string): BNode | undefined => hits.find((h) => (b.docText.get(h.node.id) ?? '').includes(s.slice(0, 40)))?.node
    for (const d of defs.slice(0, 3)) {
      const n = src(d.sentence)
      lines.push({ text: d.sentence, sub: n ? `Definition · from ${n.label}` : 'Definition', node: n?.id })
    }
  }
  for (const h of hits.slice(0, 10)) {
    if (lines.some((l) => l.node === h.node.id && l.sub?.startsWith('Definition'))) continue
    lines.push({ text: h.snip ?? h.node.label, sub: `${h.node.label} · ${h.node.sub}`, node: h.node.id })
  }
  return {
    title: title ?? (wantDefinition ? `What is ${term.trim()}?` : `“${term.trim()}” in your brain`),
    lines,
    focus: [...(idea ? [idea.id] : []), ...hits.slice(0, 40).map((h) => h.node.id)],
    hint: hits.length > 10 ? `Found in ${hits.length} places — the closest are shown.` : undefined
  }
}

// ---------- Plain search ----------

export function search(b: Brain, q: string): Answer {
  const words = norm(q)
    .split(' ')
    .filter((w) => w.length > 1 && !['the', 'a', 'an', 'of', 'my', 'and', 'in', 'on', 'to', 'for', 'is', 'what', 'about'].includes(w))
  const scored: { n: BNode; s: number }[] = []
  for (const n of b.nodes.values()) {
    const label = norm(n.label)
    const text = norm(n.text)
    let s = 0
    for (const w of words) {
      if (label.startsWith(w)) s += 6
      else if (label.includes(w)) s += 4
      else if (text.includes(w)) s += 1
      else s -= 2
    }
    if (s > 0) scored.push({ n, s: s + Math.min(n.degree, 10) / 10 })
  }
  scored.sort((x, y) => y.s - x.s)
  return {
    title: `Results for “${q.trim()}”`,
    lines: scored.slice(0, 12).map(({ n }) => ({ text: n.label, sub: n.sub, node: n.id })),
    focus: scored.slice(0, 60).map(({ n }) => n.id),
    empty: 'Nothing matches that yet.'
  }
}

// ---------- The front door ----------

export function ask(b: Brain, question: string): Answer {
  const q = question
    .toLowerCase()
    .replace(/[?!.]+$/, '')
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
  if (!q) return { title: '', lines: [], focus: [] }

  const study = askStudy(b, q)
  if (study) return study

  const person = askPerson(b, q)
  if (person) return person

  const def = /^(?:what(?:'s| is| are| was| were)|define|definition of|meaning of|explain|whats)\s+(.+)$/.exec(q)
  if (def) {
    const k = knowledge(b, def[1], true, question.trim().replace(/^./, (c) => c.toUpperCase()).replace(/\??$/, '?'))
    if (k) return k
  }
  const about = /^(?:(?:notes?|files?|everything|stuff|things)\s+(?:about|on)|what do i know about|where (?:did|have) i (?:learn|learned|learnt|write|written|wrote|read)(?: about)?|find|search(?: for)?|look up)\s+(.+)$/.exec(q)
  if (about) {
    const k = knowledge(b, about[1], false)
    if (k) return k
  }
  // A bare word or phrase: an idea or text that appears in your notes, else a plain search.
  if (q.split(' ').length <= 5) {
    const exactNode = [...b.nodes.values()].find((n) => norm(n.label) === norm(q))
    if (!exactNode || exactNode.kind === 'idea') {
      const k = knowledge(b, q, true, question.trim().replace(/^./, (c) => c.toUpperCase()))
      if (k && k.lines.length) return k
    }
  }
  return search(b, q)
}

export const EXAMPLES = (b: Brain): string[] => {
  const out: string[] = []
  const partner = b.people.find((p) => p.id === b.partnerId)
  const friend = b.people.find((p) => p.id !== b.partnerId)
  if (partner) out.push(`What does my ${b.partnerLabel.toLowerCase()} like?`)
  else if (friend) out.push(`What does ${friend.name.split(' ')[0]} like?`)
  const m = b.modules[0]
  if (m) out.push(`When is my ${m.code || m.name} exam?`)
  out.push('What’s due this week?')
  const idea = [...b.nodes.values()].filter((n) => n.kind === 'idea').sort((x, y) => y.degree - x.degree)[0]
  if (idea) out.push(`What is ${idea.label.toLowerCase()}?`)
  if (m) out.push(`How am I doing in ${m.code || m.name}?`)
  if (friend) out.push(`${friend.name.split(' ')[0]}’s birthday`)
  return out.slice(0, 5)
}
