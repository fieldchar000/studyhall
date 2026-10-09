// Auto-notes: turns files, notes or articles into a structured note (and optionally
// flashcards) using the same offline analysis as generated mindmaps (see nlp.ts).
//  • Study material → revision notes: summary, each section's key points, key terms,
//    key facts, timeline and "test yourself" questions.
//  • One article → article notes: in short, key points, who & where, numbers, quotes,
//    debate, questions to think about.
//  • Several articles → a briefing: overview, themes with what each source says,
//    who & where, numbers, where they differ, and the sources.

import { definitions, hasNumber, pick, quotes, splitSentences, standsAlone, tensions, timeline } from './nlp'
import { analyse, sharedPhrases, contains, type Analysis, type Section, type Source } from './mindgen'

export interface AutoNote {
  title: string
  html: string
  flashcards: { front: string; back: string }[]
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const ul = (items: string[]): string => (items.length ? `<ul>${items.map((i) => `<li><p>${i}</p></li>`).join('')}</ul>` : '')
const tasks = (items: string[]): string =>
  items.length ? `<ul data-type="taskList">${items.map((i) => `<li data-type="taskItem" data-checked="false"><p>${esc(i)}</p></li>`).join('')}</ul>` : ''
const sourceLink = (s: Source): string => (s.url ? `<a href="${esc(s.url)}">${esc(s.title)}</a>` : esc(s.title))

function whoAndWhere(a: Analysis, max = 8): string {
  const line = (type: string, label: string): string => {
    const names = a.entities.filter((e) => e.type === type).slice(0, max)
    return names.length ? `<p><strong>${label}:</strong> ${names.map((e) => esc(e.name) + (e.sources.size > 1 ? ` <em>(${e.sources.size})</em>` : '')).join(', ')}</p>` : ''
  }
  const body = line('person', 'People') + line('org', 'Organisations') + line('place', 'Places')
  return body ? `<h2>Who &amp; where</h2>${body}` : ''
}

/** The key sentences of a section, whole and in reading order: short bullets are kept as they are,
 *  long paragraphs are cut down to their most central sentences. */
function keySentences(sec: Section, a: Analysis, max = 5): string[] {
  const all: { text: string; score: number; i: number }[] = []
  for (const p of sec.points) {
    const parts = p.detail.length <= 220 ? [p.detail] : splitSentences(p.detail)
    for (const t of parts) if (t.trim().length > 15) all.push({ text: t.trim(), score: a.scoreOf.get(t.trim()) ?? 0, i: all.length })
  }
  const n = Math.max(2, Math.min(max, Math.ceil(all.length * 0.6)))
  return all
    .sort((x, y) => y.score - x.score)
    .slice(0, n)
    .sort((x, y) => x.i - y.i)
    .map((x) => x.text)
}

/** "Lecture 3 - Memory" → "Memory" */
const topicOf = (t: string): string => t.replace(/^(?:lecture|week|chapter|unit|topic|lesson|module|session|part|lec|wk|ch)\.?\s*\d+[a-z]?\s*[-:–—.]?\s*/i, '').trim() || t
const same = (x: string, y: string): boolean => x.toLowerCase().replace(/[^a-z0-9]/g, '') === y.toLowerCase().replace(/[^a-z0-9]/g, '')

function revision(sources: Source[], givenTitle?: string): AutoNote {
  const topics = [...new Set(sources.map((s) => topicOf(s.title)))]
  const title = givenTitle || (sources.length === 1 ? sources[0].title : `Revision notes — ${topics.length <= 3 ? topics.join(', ').replace(/, ([^,]*)$/, ' & $1') : `${topics.slice(0, 2).join(', ')} + ${topics.length - 2} more`}`)
  const a = analyse(sources)
  const sents = a.ranked.map((r) => r.text)
  const defs = definitions(sents).slice(0, 15)
  const facts = a.best((r) => hasNumber(r.text), 8)
  const tl = timeline(sents)
  let html = `<h1>${esc(title)}</h1><p><em>Auto-notes from ${sources.map(sourceLink).join(', ')} — check and add your own understanding.</em></p>`
  const gist = a.best((r) => standsAlone(r.text), 4)
  if (gist.length) html += `<h2>Summary</h2>${ul(gist.map((r) => esc(r.text)))}`
  const questions: string[] = []
  const cards: AutoNote['flashcards'] = []
  for (const s of sources) {
    if (sources.length > 1) html += `<h2>${esc(s.title)}</h2>`
    for (const sec of s.sections.slice(0, 14)) {
      const pts = keySentences(sec, a)
      if (!pts.length) continue // empty headings (often just the document's own title)
      const heading = sec.title && !same(sec.title, s.title) && !same(topicOf(sec.title), topicOf(s.title)) ? sec.title : ''
      if (heading) html += `<${sources.length > 1 ? 'h3' : 'h2'}>${esc(heading)}</${sources.length > 1 ? 'h3' : 'h2'}>`
      html += ul(pts.map(esc))
      if (heading) {
        questions.push(`Explain: ${heading}`)
        cards.push({ front: `Explain: ${heading}`, back: pts.map((p) => `• ${p}`).join('\n') })
      }
    }
  }
  if (defs.length) {
    html += `<h2>Key terms</h2>${ul(defs.map((d) => `<strong>${esc(d.term)}</strong> — ${esc(d.definition)}`))}`
    for (const d of defs) {
      questions.unshift(`What is ${d.term.toLowerCase().startsWith('the ') ? d.term : d.term}?`)
      cards.unshift({ front: d.term, back: d.definition })
    }
  }
  if (facts.length >= 2) html += `<h2>Key facts</h2>${ul(facts.map((r) => esc(r.text)))}`
  if (tl.length >= 2) html += `<h2>Timeline</h2>${ul(tl.slice(0, 10).map((t) => `<strong>${esc(t.when)}</strong> — ${esc(t.sentence)}`))}`
  if (questions.length) html += `<h2>Test yourself</h2>${tasks(questions.slice(0, 12))}`
  html += `<h2>My questions</h2><p></p>`
  return { title, html, flashcards: cards }
}

function article(s: Source): AutoNote {
  const a = analyse([s])
  const sents = a.ranked.map((r) => r.text)
  const gist = a.best((r) => standsAlone(r.text), 3)
  const points = pick(
    a.ranked.filter((r) => !gist.some((g) => g.text === r.text)),
    6
  )
  const facts = a.best((r) => hasNumber(r.text), 5)
  const qs = quotes(sents).slice(0, 4)
  const tens = tensions(sents).slice(0, 5)
  const top = a.entities.filter((e) => e.type !== 'place').slice(0, 2)
  let html = `<h1>${esc(s.title)}</h1><p><em>Source:</em> ${sourceLink(s)}</p>`
  if (gist.length) html += `<h2>In short</h2><p>${gist.map((r) => esc(r.text)).join(' ')}</p>`
  if (points.length) html += `<h2>Key points</h2>${ul(points.map((r) => esc(r.text)))}`
  html += whoAndWhere(a)
  if (facts.length) html += `<h2>Numbers</h2>${ul(facts.map((r) => esc(r.text)))}`
  if (qs.length) html += `<h2>Quotes</h2>${qs.map((q) => `<blockquote><p>“${esc(q.quote)}”${q.speaker ? ` — ${esc(q.speaker)}` : ''}</p></blockquote>`).join('')}`
  if (tens.length) html += `<h2>Debate &amp; tensions</h2>${ul(tens.map(esc))}`
  html += `<h2>Questions to think about</h2>${ul(
    [
      ...top.map((e) => `What does ${esc(e.name)} want here, and what are they able to do about it?`),
      'Who benefits and who loses if this goes ahead?',
      'What would change my mind about this story?'
    ].slice(0, 4)
  )}<h2>My take</h2><p></p>`
  return { title: s.title, html, flashcards: [] }
}

function briefing(sources: Source[], givenTitle?: string): AutoNote {
  const a = analyse(sources)
  const sents = a.ranked.map((r) => r.text)
  const by = (r: { src: number }): string => ` <em>— ${esc(sources[r.src].title)}</em>`
  const themes = sharedPhrases(sources, 6)
  const cap = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1)
  const title = givenTitle || `Briefing — ${themes.length ? themes.slice(0, 3).map((t) => cap(t.text)).join(', ') : new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
  let html = `<h1>${esc(title)}</h1><p><em>Briefing from ${sources.length} sources, ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}.</em></p>`
  // One line per source: the gist of each article, side by side.
  const gists = sources
    .map((src, si) => {
      const mine = a.ranked.filter((r) => r.src === si).sort((x, y) => y.score - x.score)
      return { src, top: mine.slice(0, 6).find((r) => standsAlone(r.text)) ?? mine[0] }
    })
    .filter((g) => g.top)
  if (gists.length) html += `<h2>At a glance</h2>${ul(gists.map((g) => `<strong>${esc(g.src.title)}:</strong> ${esc(g.top.text)}`))}`
  const glanced = new Set(gists.map((g) => g.top.text))
  const overview = a.fair((r) => !glanced.has(r.text), Math.min(8, Math.max(5, sources.length * 2)))
  if (overview.length) html += `<h2>Overview</h2>${ul(overview.map((r) => esc(r.text) + by(r)))}`
  if (themes.length) {
    html += `<h2>Themes</h2>`
    for (const t of themes) {
      const ev = sources
        .map((_, si) => a.ranked.filter((r) => r.src === si && contains(r.text, t.key)).sort((x, y) => y.score - x.score)[0])
        .filter(Boolean)
        .sort((x, y) => y.score - x.score)
        .slice(0, 4)
      if (!ev.length) continue
      html += `<h3>${esc(cap(t.text))}</h3>${ul(ev.map((r) => esc(r.text) + by(r)))}`
    }
  }
  html += whoAndWhere(a)
  const facts = a.fair((r) => hasNumber(r.text), 6)
  if (facts.length) html += `<h2>Numbers</h2>${ul(facts.map((r) => esc(r.text) + by(r)))}`
  const tens = new Set(tensions(sents))
  const diff = pick(
    a.ranked.filter((r) => tens.has(r.text)),
    6
  )
  if (diff.length) html += `<h2>Where they differ</h2>${ul(diff.map((r) => esc(r.text) + by(r)))}`
  html += `<h2>Sources</h2>${ul(sources.map(sourceLink))}<h2>My take</h2><p></p>`
  return { title, html, flashcards: [] }
}

/** One note for all sources (combine) or one per source. */
export function makeNotes(sources: Source[], opts: { title?: string; combine: boolean }): AutoNote[] {
  const build = (list: Source[], title?: string): AutoNote => {
    const study = list.every((s) => s.kind !== 'article')
    if (study) return revision(list, title)
    if (list.length === 1) return article(list[0])
    return briefing(list, title)
  }
  return opts.combine || sources.length === 1 ? [build(sources, opts.title)] : sources.map((s) => build([s]))
}
