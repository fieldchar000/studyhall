// Small, offline language toolkit used by generated mindmaps and auto-notes.
//  • TextRank (the PageRank idea applied to sentences) finds the most central sentences.
//  • MMR (maximal marginal relevance) keeps picks from repeating each other.
//  • Names are sorted into people / places / organisations using cue words and lists.
//  • Simple patterns pull out definitions, numbers, dates, quotes and disagreements.
// No AI service and no internet: it's all statistics and patterns on the text itself.

export const STOPWORDS = new Set(
  `a about above after again against all also am an and any are aren't as at be because been before being below between both but by can can't cannot could couldn't did didn't do does doesn't doing don't down during each even ever every few for from further get gets got had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself him himself his how how's however i i'd i'll i'm i've if in into is isn't it it's its itself just let's like made make makes many may me might more most much must mustn't my myself new no nor not now of off often on once one only or other others ought our ours ourselves out over own per perhaps rather really said same say says see seen shall shan't she she'd she'll she's should shouldn't since so some still such than that that's the their theirs them themselves then there there's these they they'd they'll they're they've this those though through thus to too two under until up upon us use used using very via was wasn't way we we'd we'll we're we've well were weren't what what's when when's where where's whether which while who who's whom whose why why's will with within without won't would wouldn't yet you you'd you'll you're you've your yours yourself yourselves therefore although whereas first second third last next back today yesterday tomorrow year years time times week weeks day days people thing things lot lots ways part parts number old good great big small high low long short several various including include includes according mr mrs ms dr told tell asked`.split(/\s+/)
)

// ---------- Sentences ----------

const ABBREV = /\b(?:Mr|Mrs|Ms|Dr|Prof|St|Sr|Jr|vs|etc|e\.g|i\.e|U\.S|U\.K|Inc|Ltd|Co|No|Gen|Sen|Rep|Gov|Lt|Col|Capt|Mt|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|Fig|approx|Ph\.D|a\.m|p\.m)\.$/i

/** Sentences, respecting line breaks (slides, bullets) and common abbreviations. */
export function splitSentences(text: string): string[] {
  const out: string[] = []
  for (const line of text.split(/\n+/)) {
    const parts = line.replace(/\s+/g, ' ').trim().split(/(?<=[.!?…])\s+(?=[A-Z0-9“"'‘(])/)
    let buf = ''
    for (const p of parts) {
      buf = buf ? `${buf} ${p}` : p
      if (ABBREV.test(buf) || /\b[A-Z]\.$/.test(buf)) continue // "U.S." / "J. Smith"
      out.push(buf.trim())
      buf = ''
    }
    if (buf) out.push(buf.trim())
  }
  return out.filter((s) => s.split(' ').length >= 4 && s.length <= 700)
}

const stem = (w: string): string => w.replace(/(?:ies)$/, 'y').replace(/(?:ing|ed|es|s)$/, (m) => (w.length > m.length + 3 ? '' : m))

export function contentWords(s: string): string[] {
  return (s.toLowerCase().match(/[a-zà-ÿ][a-zà-ÿ'’-]+/g) ?? []).filter((w) => w.length > 2 && !STOPWORDS.has(w)).map(stem)
}

// ---------- TextRank ----------

export interface Ranked {
  text: string
  score: number
  index: number // position in the original text
  src: number // which source it came from
}

type Vec = Map<string, number>
const cosine = (a: Vec, b: Vec): number => {
  let dot = 0
  for (const [k, v] of a) dot += v * (b.get(k) ?? 0)
  if (!dot) return 0
  let na = 0
  let nb = 0
  for (const v of a.values()) na += v * v
  for (const v of b.values()) nb += v * v
  return dot / Math.sqrt(na * nb)
}

/** Score sentences by how central they are (TextRank over TF-IDF similarity). */
export function rank(sentences: { text: string; src: number }[], opts: { leadBias?: boolean } = {}): Ranked[] {
  const list = sentences.slice(0, 450)
  const words = list.map((s) => contentWords(s.text))
  const df = new Map<string, number>()
  for (const ws of words) for (const w of new Set(ws)) df.set(w, (df.get(w) ?? 0) + 1)
  const N = list.length
  const vecs: Vec[] = words.map((ws) => {
    const v: Vec = new Map()
    for (const w of ws) v.set(w, (v.get(w) ?? 0) + 1)
    for (const [k, tf] of v) v.set(k, tf * Math.log((N + 1) / (df.get(k) ?? 1)))
    return v
  })
  const sim: number[][] = vecs.map(() => new Array<number>(N).fill(0))
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) sim[i][j] = sim[j][i] = cosine(vecs[i], vecs[j])
  const out = sim.map((row) => row.reduce((a, b) => a + b, 0) || 1)
  let pr = new Array<number>(N).fill(1 / Math.max(1, N))
  for (let it = 0; it < 30; it++) {
    const next = new Array<number>(N).fill((1 - 0.85) / Math.max(1, N))
    for (let j = 0; j < N; j++) {
      if (!pr[j]) continue
      for (let i = 0; i < N; i++) if (sim[j][i]) next[i] += (0.85 * pr[j] * sim[j][i]) / out[j]
    }
    pr = next
  }
  // News puts the most important facts first; a small bonus for opening sentences.
  const firstOf = new Map<number, number>()
  list.forEach((s, i) => !firstOf.has(s.src) && firstOf.set(s.src, i))
  return list.map((s, i) => {
    const pos = i - (firstOf.get(s.src) ?? 0)
    const lead = opts.leadBias && pos < 3 ? 1.25 - pos * 0.08 : 1
    const len = s.text.split(' ').length
    const lengthFit = len < 8 ? 0.7 : len > 45 ? 0.8 : 1
    return { text: s.text, src: s.src, index: i, score: pr[i] * lead * lengthFit, _v: vecs[i] } as Ranked & { _v: Vec }
  })
}

/** The n best sentences, avoiding near-duplicates (MMR), returned in reading order. */
export function pick(ranked: Ranked[], n: number, lambda = 0.72): Ranked[] {
  const pool = [...ranked].sort((a, b) => b.score - a.score).slice(0, 80) as (Ranked & { _v?: Vec })[]
  const max = pool[0]?.score || 1
  const chosen: typeof pool = []
  while (chosen.length < n && pool.length) {
    let best = 0
    let bestVal = -Infinity
    pool.forEach((c, i) => {
      const redundancy = chosen.length ? Math.max(...chosen.map((s) => (c._v && s._v ? cosine(c._v, s._v) : 0))) : 0
      const val = lambda * (c.score / max) - (1 - lambda) * redundancy
      if (val > bestVal) {
        bestVal = val
        best = i
      }
    })
    chosen.push(pool.splice(best, 1)[0])
  }
  return chosen.sort((a, b) => a.index - b.index)
}

// ---------- Names: people, places, organisations ----------

// Countries, regions and major cities (enough to tell places from people and organisations).
const PLACES = new Set(
  [
    'Afghanistan,Albania,Algeria,Andorra,Angola,Argentina,Armenia,Australia,Austria,Azerbaijan,Bahamas,Bahrain,Bangladesh,Barbados,Belarus,Belgium,Belize,Benin,Bhutan,Bolivia,Bosnia,Botswana,Brazil,Brunei,Bulgaria,Burkina Faso,Burundi,Cambodia,Cameroon,Canada,Chad,Chile,China,Colombia,Comoros,Congo,Costa Rica,Croatia,Cuba,Cyprus,Czechia,Czech Republic,Denmark,Djibouti,Dominica,Dominican Republic,Ecuador,Egypt,El Salvador,Eritrea,Estonia,Eswatini,Ethiopia,Fiji,Finland,France,Gabon,Gambia,Georgia,Germany,Ghana,Greece,Grenada,Guatemala,Guinea,Guyana,Haiti,Honduras,Hungary,Iceland,India,Indonesia,Iran,Iraq,Ireland,Israel,Italy,Ivory Coast,Jamaica,Japan,Jordan,Kazakhstan,Kenya,Kosovo,Kuwait,Kyrgyzstan,Laos,Latvia,Lebanon,Lesotho,Liberia,Libya,Liechtenstein,Lithuania,Luxembourg,Madagascar,Malawi,Malaysia,Maldives,Mali,Malta,Mauritania,Mauritius,Mexico,Moldova,Monaco,Mongolia,Montenegro,Morocco,Mozambique,Myanmar,Namibia,Nepal,Netherlands,New Zealand,Nicaragua,Niger,Nigeria,North Korea,North Macedonia,Norway,Oman,Pakistan,Palestine,Panama,Papua New Guinea,Paraguay,Peru,Philippines,Poland,Portugal,Qatar,Romania,Russia,Rwanda,Saudi Arabia,Senegal,Serbia,Seychelles,Sierra Leone,Singapore,Slovakia,Slovenia,Somalia,South Africa,South Korea,South Sudan,Spain,Sri Lanka,Sudan,Suriname,Sweden,Switzerland,Syria,Taiwan,Tajikistan,Tanzania,Thailand,Togo,Tonga,Trinidad and Tobago,Tunisia,Turkey,Türkiye,Turkmenistan,Uganda,Ukraine,United Arab Emirates,UAE,United Kingdom,UK,Britain,Great Britain,England,Scotland,Wales,Northern Ireland,United States,US,USA,America,Uruguay,Uzbekistan,Vanuatu,Venezuela,Vietnam,Yemen,Zambia,Zimbabwe',
    'Europe,Asia,Africa,Antarctica,Arctic,Middle East,Gulf,Persian Gulf,Red Sea,Black Sea,Baltic,Mediterranean,Caribbean,Pacific,Atlantic,Indo-Pacific,South China Sea,East China Sea,Taiwan Strait,Strait of Hormuz,Suez Canal,Panama Canal,Horn of Africa,Sahel,Balkans,Caucasus,Central Asia,Latin America,South America,North America,Southeast Asia,East Asia,South Asia,West Africa,East Africa,Scandinavia,Gaza,West Bank,Crimea,Donbas,Kashmir,Tibet,Xinjiang,Hong Kong,Silicon Valley,Darfur,Kurdistan,Siberia,Patagonia',
    'Washington,London,Paris,Berlin,Brussels,Moscow,Beijing,Shanghai,Tokyo,Seoul,Pyongyang,Taipei,Kyiv,Kiev,Tehran,Jerusalem,Tel Aviv,Riyadh,Dubai,Abu Dhabi,Doha,Ankara,Istanbul,Cairo,Beirut,Damascus,Baghdad,Kabul,Islamabad,Karachi,Delhi,New Delhi,Mumbai,Dhaka,Bangkok,Jakarta,Manila,Hanoi,Sydney,Canberra,Ottawa,Toronto,Mexico City,Brasilia,Buenos Aires,Lagos,Nairobi,Addis Ababa,Khartoum,Johannesburg,Cape Town,Geneva,Davos,Vienna,Rome,Madrid,Lisbon,Warsaw,Budapest,Prague,Stockholm,Oslo,Helsinki,Copenhagen,Amsterdam,Dublin,Edinburgh,Athens,New York,San Francisco,Los Angeles,Chicago,Boston,Seattle,Houston,Sana,Aden,Odesa,Kharkiv,El Fasher,Rafah'
  ]
    .join(',')
    .split(',')
    .map((x) => x.toLowerCase())
)
const ORG_WORDS =
  /\b(Union|Council|Ministry|Department|Agency|Bank|Fund|Group|Party|Organi[sz]ation|Committee|Commission|Court|Parliament|Congress|Senate|Assembly|Institute|University|College|Corporation|Company|Inc|Ltd|Forces|Army|Navy|Air Force|Guard|Front|Movement|Association|Federation|Alliance|Coalition|Office|Board|Authority|Service|Network|Foundation|Labs?|Times|Post|Journal|News|Reuters|Agency|Cabinet|Government|Administration|Pentagon|Kremlin|Hamas|Hezbollah|Houthis|Taliban|OpenAI|Anthropic|DeepMind|Google|Microsoft|Apple|Amazon|Meta|Nvidia|Tesla|Samsung|TSMC|Intel|IBM|Netflix|Spotify|Nintendo|Sony|Valve|Unity|Epic Games)\b/
const PERSON_TITLES =
  /\b(?:President|Vice President|Prime Minister|Minister|Chancellor|Secretary|Senator|Sen\.|Rep\.|Governor|Gov\.|Mayor|King|Queen|Prince|Princess|Pope|General|Gen\.|Admiral|Dr\.?|Professor|Prof\.|Mr\.?|Ms\.?|Mrs\.?|CEO|chief executive|founder|leader|spokesperson|spokesman|spokeswoman|Ambassador|Judge|Justice|Commissioner|Chairman|Chair|Director|author|philosopher|scientist|researcher|economist)\s+((?:[A-Z][a-zà-ÿ'’-]+\s?){1,3})/g
const SAID = /\b((?:[A-Z][a-zà-ÿ'’-]+\s){1,2}[A-Z][a-zà-ÿ'’-]+),?\s+(?:said|says|told|wrote|argued|added|announced|warned|claimed|noted|explained|insisted)\b/g
/** Study material: "Baddeley and Hitch (1974) proposed…", "Ebbinghaus showed…" */
const RESEARCHER =
  /\b([A-Z][a-zà-ÿ'’-]{2,})(?:\s+(?:and|&)\s+([A-Z][a-zà-ÿ'’-]{2,}))?(?:\s+et al\.?)?(?:\s+\(\d{4}\))?\s+(?:proposed|argued|showed|found|suggested|developed|described|demonstrated|discovered|theori[sz]ed|introduced|coined|concluded|observed)\b/g

export type EntityType = 'person' | 'place' | 'org' | 'other'
export interface Entity {
  name: string
  type: EntityType
  count: number
  sources: Set<number>
}

const NAME_RUN = /\b([A-Z][a-zà-ÿ'’-]+(?:\s+(?:of\s+(?:the\s+)?|al-|bin\s+)?[A-Z][a-zà-ÿ'’-]+){0,3}|[A-Z]{2,6})\b/g
const NOT_NAMES = new Set(
  'The A An In On At But And For After Before When While If As This That These Those It Its He She They We I You There Here However Meanwhile Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December Mr Mrs Ms Dr Read More Photo Image Subscribe Sign Getty Images AP AFP Reuters Advertisement Also Today Yesterday Now Then Still Yet Some Many Most Both Each Every Other According Under Over During Since Until Despite With Without Between'.split(
    ' '
  )
)

/** Job titles that look like names ("Program Director", "Chief Executive"). */
const ROLE_WORDS = /\b(?:Director|Manager|Officer|Spokes(?:man|woman|person)|Chief|Head|Editor|Analyst|Researcher|Fellow|Correspondent|Advis[eo]r|Professor|Chair(?:man|woman)?|Executive|Founder|Reporter|Producer|Host|Coordinator|Consultant|Associate|Lead)$/
const ROLE_PREFIX = new RegExp(`^(?:[A-Z][a-z]+\\s+){0,2}${ROLE_WORDS.source.slice(0, -1)}\\s+(?=[A-Z])`)

/** People, places and organisations across sources (counted, with which sources mention them). */
export function entities(texts: string[]): Entity[] {
  const people = new Set<string>()
  // "Research showed…" — a word that also appears in lower case is an ordinary noun, not a name
  const commonWord = (w: string): boolean => /^(?:Research|Evidence|Studies|Study|Analysis|Experiments?|Results?|Data|Scientists|Researchers|Psychologists|Work|Theory|Findings|Reviews?|Reports?|Surveys?|Tests?|Trials?)$/.test(w) || texts.some((x) => x.includes(' ' + w.toLowerCase() + ' '))
  for (const t of texts) {
    for (const m of t.matchAll(PERSON_TITLES)) people.add(m[1].trim())
    for (const m of t.matchAll(SAID)) people.add(m[1].replace(/^(?:The|A|An)\s+/, '').trim())
    for (const m of t.matchAll(/\baccording to ([A-Z][a-zà-ÿ'’-]{2,})(?:\s+(?:and|&)\s+([A-Z][a-zà-ÿ'’-]{2,}))?/g)) for (const n of [m[1], m[2]]) if (n && !PLACES.has(n.toLowerCase()) && !ORG_WORDS.test(n) && !commonWord(n)) people.add(n)
    for (const m of t.matchAll(RESEARCHER)) for (const n of [m[1], m[2]]) if (n && !NOT_NAMES.has(n) && !STOPWORDS.has(n.toLowerCase()) && !commonWord(n)) people.add(n)
  }
  for (const p of [...people]) if (ORG_WORDS.test(p) || PLACES.has(p.toLowerCase()) || NOT_NAMES.has(p) || ROLE_WORDS.test(p)) people.delete(p)
  const surnames = new Map<string, string>() // "Trump" → "Donald Trump"
  for (const p of people) if (p.includes(' ')) surnames.set(p.split(' ').pop()!, p)
  const found = new Map<string, Entity>()
  texts.forEach((t, si) => {
    for (const m of t.matchAll(NAME_RUN)) {
      let name = m[1]
        .replace(/^(?:The|A|An)\s+/, '')
        .replace(/^(?:President|Vice President|Prime Minister|Minister|Chancellor|Secretary|Senator|Governor|Mayor|King|Queen|Prince|Princess|Pope|General|Admiral|Professor|Judge|Justice|Ambassador|Mr|Ms|Mrs|Dr)\s+/, '')
        .split(/['’]s\b/)[0]
        .replace(ROLE_PREFIX, '')
        .trim()
      if (!name || NOT_NAMES.has(name) || name.length < 3 || ROLE_WORDS.test(name)) continue
      if (/^[A-Z][a-z]+$/.test(name) && m.index !== undefined && /(?:^|[.!?]\s+|\n)$/.test(t.slice(Math.max(0, m.index - 3), m.index)) && !surnames.has(name) && !people.has(name) && !PLACES.has(name.toLowerCase())) continue // sentence-initial word
      if (surnames.has(name)) name = surnames.get(name)!
      const lower = name.toLowerCase()
      const type: EntityType = PLACES.has(lower) ? 'place' : ORG_WORDS.test(name) || /^[A-Z]{2,6}$/.test(name) ? 'org' : people.has(name) ? 'person' : 'other'
      if (type === 'other' && !name.includes(' ')) continue // lone capitalised words are too noisy
      const e = found.get(lower) ?? { name, type, count: 0, sources: new Set<number>() }
      e.count++
      e.sources.add(si)
      found.set(lower, e)
    }
  })
  return [...found.values()].sort((a, b) => b.sources.size - a.sources.size || b.count - a.count)
}

// ---------- Patterns ----------

/** A sentence that makes sense on its own: a statement, long enough, not leaning on the one before. */
export const standsAlone = (t: string): boolean =>
  !/\?\s*$/.test(t) &&
  t.split(/\s+/).length >= 10 &&
  !/^(but|and|so|yet|also|however|meanwhile|still|this|that|these|those|it|they|he|she|there|here|then|farther|further|furthermore|moreover|instead|again|similarly)\b/i.test(t)

export interface Definition {
  term: string
  definition: string
  sentence: string
}

/** "Working memory is a system that…", "X refers to…", "X means…" */
export function definitions(sents: string[]): Definition[] {
  const out: Definition[] = []
  const seen = new Set<string>()
  for (const s of sents) {
    const m = /^(?:An?\s+|The\s+)?([A-Za-zÀ-ÿ][\w'’ -]{1,50}?)\s+(?:is defined as|can be defined as|is known as|is called|refers to|means|describes|is|are)\s+((?:an?|the)\s+)?(.{12,260})$/i.exec(s.replace(/\s*\[\d+\]/g, ''))
    if (!m) continue
    const term = m[1].trim()
    if (term.split(' ').length > 5 || /^(it|its|this|that|these|those|there|he|his|she|her|they|their|we|our|i|my|you|your|which|what|one|another|here|yet|but|and|so|as|such|all|some|many|most|much|each|every|both|now|then|still|also|who|why|how|where|when)$/i.test(term.split(' ')[0])) continue
    // "X is using / is expected to / is that / is not…" are statements, not definitions
    if (!m[2] && /^(?:\w+ing|\w+ed|\w+ly|that|not|also|still|now|likely|unlikely|due|set|about|to|in|on|at|for|from|by|with|being|already|just|very|more|less|so|too|here|there|no|yet|clear|unclear|true|false|possible|important|necessary|expected|thought|said|believed|thus|therefore|hence|whether|why|how|what|where|when|if|because|only|even|often|never|always|sometimes|rarely|mostly|largely|as|than|much|such|its|their|his|her|our|my|your|this|these|those|one|all|both|each|sceptical|skeptical|aware|able|unable|willing|ready|keen|right|wrong|sure|afraid)\b/i.test(m[3])) continue
    // "Even those who are…", "Departing from Iraq is…" — the subject isn't a term
    if (/\b(?:who|which|that|what|whom|whose)$/i.test(term) || /^(?:even|only|just|perhaps|maybe)\b/i.test(term)) continue
    const key = term.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ term: term.charAt(0).toUpperCase() + term.slice(1), definition: (m[2] ?? '') + m[3].replace(/\.$/, ''), sentence: s })
  }
  return out
}

const NUMBER = /(?:[$£€¥]\s?\d[\d,.]*|\b\d[\d,.]*\s?(?:%|(?:percent|per cent|million|billion|trillion|bn|km|miles|kg|tonnes|tons|barrels|years?|months?|days?|hours?|people|troops|soldiers|votes|seats|deaths|users|jobs|points)\b)|\b\d{1,3}(?:,\d{3})+\b)/i
export const hasNumber = (s: string): boolean => NUMBER.test(s)

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
/** Sentences tied to a year (and month if given), oldest first. */
export function timeline(sents: string[]): { when: string; sort: number; sentence: string }[] {
  const out: { when: string; sort: number; sentence: string }[] = []
  for (const s of sents) {
    const y = /\b(1[5-9]\d{2}|20\d{2})s?\b/.exec(s)
    if (!y) continue
    const month = new RegExp(`\\b(${MONTHS.join('|')})\\b`, 'i').exec(s)
    const mi = month ? MONTHS.indexOf(month[1].toLowerCase()) : -1
    out.push({ when: month ? `${month[1].charAt(0).toUpperCase() + month[1].slice(1)} ${y[1]}` : y[0], sort: Number(y[1]) * 12 + Math.max(0, mi), sentence: s })
  }
  return out.sort((a, b) => a.sort - b.sort)
}

export interface Quote {
  quote: string
  speaker: string
  sentence: string
}
export function quotes(sents: string[]): Quote[] {
  const out: Quote[] = []
  for (const s of sents) {
    const q = /[“"]([^”"]{25,320})[”"]/.exec(s)
    if (!q) continue
    const who = /(?:said|says|told|wrote|added|argued)\s+((?:[A-Z][\w'’-]+\s?){1,3})|((?:[A-Z][\w'’-]+\s?){1,3})\s+(?:said|says|told|wrote|added|argued)/.exec(s)
    out.push({ quote: q[1].trim(), speaker: (who?.[1] ?? who?.[2] ?? '').trim(), sentence: s })
  }
  return out
}

/** Disagreement, caveats and pushback — "however", "critics say", "denied"… */
export function tensions(sents: string[]): string[] {
  return sents.filter(
    (s) =>
      /^(However|But|Yet|Still|Critics|Opponents|Sceptics|Skeptics|On the other hand|In contrast|Despite|Although|Others argue|Some argue)\b/i.test(s) ||
      /\b(critics (say|argue|warn)|disputed|denied|rejected|disagree[sd]?|pushed back|condemned|contested|opposition to|warned that|concerns? (about|that|over))\b/i.test(s)
  )
}
