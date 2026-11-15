// Reading study content out of files and finding the phrases that matter in it — offline, no AI.
//
//  • htmlStudyText: interactive HTML notes (3D labs, quizzes…) keep most of their real content in
//    their scripts (lecture notes, key points, quiz questions) and their visible page is mostly
//    buttons. This pulls out the readable sentences and titles from both and skips the furniture
//    and any bundled libraries.
//  • corpusPhrases: key phrases per document ("sympathetic nervous system", "action potential"),
//    ranked by how much more a document uses them than everything else does (TF-IDF), so a whole
//    page about biology gives its specific terms rather than "cell" or "skin".

// ---------- Reading HTML notes ----------

/** Words that give a string away as program text rather than study notes. */
const TECH_HARD = /THREE\.|WebGL|webgl|\bglTF\b|KHR_|EXT_|Draco|\bshader|framebuffer|\brenderer\b|deprecated|unsupported|\.prototype|localStorage|innerHTML|addEventListener|\bgl_|#define|precision (?:high|medium|low)p|\bvec[234]\b|https?:\/\//i
const TECH_SOFT =
  /\b(error|warning|invalid|undefined|null|cannot|failed|texture|attribute|uniform|geometry|mesh|extension|parameter|argument|async|promise|json|mime|worker|canvas|pixel|vertex|array|object|function|callback|property|method|instance|loader|browser|webkit|polyfill|config|render|scene|camera|material|bitmap|sampler|ignored|supported|maximum|minimum|clip|latitudinal|longitudinal|component|index|range|requested|value|values|type|types)\b/gi

const stripTags = (s: string): string =>
  s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')

/** A sentence or note a person wrote, not code, CSS, a file path or an error message. */
export function looksLikeProse(raw: string): boolean {
  const s = raw.trim()
  if (s.length < 12 || s.length > 4000) return false
  if (!/\s/.test(s)) return false
  if (/[{};]|=>|==|\|\||&&|\(\)|\$\{|\\[nt]/.test(s)) return false
  if (TECH_HARD.test(s)) return false
  if ((s.match(TECH_SOFT) ?? []).length >= 2) return false
  const words = s.split(/\s+/)
  if (words.length < 3) return false
  // fragments of program messages: "will be ignored.", ", using", "index is out of range:"
  if (/^[^\p{L}\p{N}]/u.test(s) || /:$/.test(s) || (/^\p{Ll}/u.test(s) && words.length < 6)) return false
  if (/PMREM/.test(s)) return false
  // mostly real words: letters, few identifiers like fooBar / foo_bar / a.b.c
  const odd = words.filter((w) => /[a-z][A-Z]|_|\w\.\w|^[#.$@]|^-{1,2}\w|\d+px|%$/.test(w)).length
  if (odd > words.length * 0.2) return false
  const letters = (s.match(/\p{L}/gu) ?? []).length
  return letters >= s.length * 0.55
}

/** A short title ("Fight or flight", "Cranial nerves") — no code, no CamelCase identifiers. */
function looksLikeTitle(raw: string): boolean {
  const s = raw.trim()
  if (s.length < 4 || s.length > 64) return false
  if (/[a-z][A-Z]|[_{};=<>\\/@#$]|\d{3,}|\p{L}\.\p{L}/u.test(s)) return false
  if (TECH_HARD.test(s)) return false
  if (!/^[\p{Lu}\p{N}]/u.test(s)) return false
  const words = s.split(/\s+/)
  if (words.length > 8) return false
  if (words.length === 1 && s.length < 5) return false
  return (s.match(/\p{L}/gu) ?? []).length >= s.length * 0.6
}

const unescape = (s: string): string =>
  s
    .replace(/\\u\{([0-9a-f]+)\}/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\x([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, ' ')
    .replace(/\\(.)/g, '$1')

const REGEX_BEFORE = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^'])
const TITLE_KEY = /\b(?:title|heading|term|topic|name|label|h)["']?\s*:\s*$/

/** Every string in a script, with whether it sits after a title-like key (title:"…"). Handles
 *  comments, regular expressions and template literals so quotes inside them don't throw it off. */
export function scriptStrings(code: string): { text: string; title: boolean }[] {
  const out: { text: string; title: boolean }[] = []
  const n = code.length
  let i = 0
  let lastSig = ''
  let lastWord = ''
  // Strings inside console.warn(…) / new Error(…) are a program's messages, never study notes.
  let quoteAt = 0
  const inMessage = (at: number): boolean => {
    const back = code.slice(Math.max(0, at - 240), at)
    const k = Math.max(back.lastIndexOf('console.'), back.lastIndexOf('Error('), back.lastIndexOf('.warn('), back.lastIndexOf('.error('))
    return k >= 0 && !/[;}]/.test(back.slice(k).replace(/"[^"\n]*"|'[^'\n]*'|`[^`]*`/g, ''))
  }
  const push = (start: number, end: number): void => {
    if (end - start < 4 || end - start > 6000) return
    if (inMessage(quoteAt)) return
    const before = code.slice(Math.max(0, start - 24), start - 1)
    out.push({ text: unescape(code.slice(start, end)), title: TITLE_KEY.test(before) })
  }
  while (i < n) {
    const c = code[i]
    if (c === '"' || c === "'" || c === '`') quoteAt = i
    if (c === '"' || c === "'") {
      const start = i + 1
      i++
      while (i < n && code[i] !== c && code[i] !== '\n') i += code[i] === '\\' ? 2 : 1
      push(start, i)
      i++
      lastSig = c
      continue
    }
    if (c === '`') {
      // template literal: keep the plain parts, skip ${…}
      let start = i + 1
      i++
      while (i < n && code[i] !== '`') {
        if (code[i] === '\\') i += 2
        else if (code[i] === '$' && code[i + 1] === '{') {
          push(start, i)
          let depth = 1
          i += 2
          while (i < n && depth > 0) {
            const d = code[i]
            if (d === '{') depth++
            else if (d === '}') depth--
            else if (d === '"' || d === "'") {
              i++
              while (i < n && code[i] !== d && code[i] !== '\n') i += code[i] === '\\' ? 2 : 1
            }
            i++
          }
          start = i
        } else i++
      }
      push(start, i)
      i++
      lastSig = '`'
      continue
    }
    if (c === '/') {
      const d = code[i + 1]
      if (d === '/') {
        while (i < n && code[i] !== '\n') i++
        continue
      }
      if (d === '*') {
        const e = code.indexOf('*/', i + 2)
        i = e < 0 ? n : e + 2
        continue
      }
      if (!lastSig || REGEX_BEFORE.has(lastSig) || /^(?:return|typeof|case|do|else|in|of|void|throw|delete|new|yield|await)$/.test(lastWord)) {
        // a regular expression literal
        i++
        let cls = false
        while (i < n && code[i] !== '\n') {
          const e = code[i]
          if (e === '\\') i++
          else if (e === '[') cls = true
          else if (e === ']') cls = false
          else if (e === '/' && !cls) break
          i++
        }
        i++
        while (i < n && /[a-z]/i.test(code[i])) i++
        lastSig = ')'
        continue
      }
    }
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (/[\w$]/.test(c)) {
      const s = i
      while (i < n && /[\w$]/.test(code[i])) i++
      lastWord = code.slice(s, i)
      lastSig = 'a'
      continue
    }
    lastSig = c
    lastWord = ''
    i++
  }
  return out
}

const CHROME = 'script,style,noscript,svg,canvas,template,button,nav,select,option,input,textarea,iframe,video,audio,[aria-hidden="true"],[role="button"],[role="toolbar"],[role="tablist"]'
const BLOCKS = 'p,li,h1,h2,h3,h4,h5,h6,dt,dd,tr,td,th,div,section,article,aside,summary,blockquote,figcaption,caption,br'
const SKIP_JSON = /gltf|model|curve|path|img|image|mesh|geom|anim|vert|font|texture|wsimg/i

/** The study content of an HTML file: readable text plus heading-like titles. */
export function htmlStudyText(html: string): { text: string; heads: string[] } {
  // Embedded pictures and 3D models are huge and never words.
  const src = html.replace(/data:[\w/+.-]+;base64,[A-Za-z0-9+/=\s]{200,}/g, 'data:')
  const dom = new DOMParser().parseFromString(src, 'text/html')
  const heads: string[] = []
  const lines: string[] = []
  const seen = new Set<string>()
  const keep = (s: string, title = false): void => {
    const t = stripTags(s).replace(/\s+/g, ' ').trim()
    if (!t || seen.has(t)) return
    if (title ? looksLikeTitle(t) : looksLikeProse(t)) {
      seen.add(t)
      lines.push(t)
      if (title) heads.push(t)
    } else if (!title && looksLikeTitle(t) && t.split(' ').length >= 2) {
      seen.add(t)
      lines.push(t)
    }
  }

  // 1. Scripts: data blocks (JSON) and the page's own code.
  for (const sc of [...dom.querySelectorAll('script')]) {
    const type = (sc.getAttribute('type') ?? '').toLowerCase()
    const body = sc.textContent ?? ''
    if (!body.trim()) continue
    if (type.includes('json')) {
      if (type.includes('gltf') || type === 'importmap' || SKIP_JSON.test(sc.id)) continue
      try {
        const walk = (v: unknown, key = ''): void => {
          if (typeof v === 'string') keep(v, /^(title|heading|name|label|term|topic)$/i.test(key))
          else if (Array.isArray(v)) v.forEach((x) => walk(x, key))
          else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k)
        }
        walk(JSON.parse(body))
      } catch {
        /* not JSON after all */
      }
      continue
    }
    if (type && !/javascript|module|ecmascript|babel|jsx/.test(type)) continue
    for (const s of scriptStrings(body)) keep(s.text, s.title)
  }

  // 2. The visible page, minus buttons, menus and media.
  const body = dom.body
  if (body) {
    for (const h of body.querySelectorAll('h1,h2,h3,h4,strong,b,dt,th,summary,caption')) {
      const t = (h.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (looksLikeTitle(t)) heads.push(t)
    }
    for (const el of [...body.querySelectorAll(CHROME)]) el.remove()
    for (const el of body.querySelectorAll(BLOCKS)) el.append('\n')
    for (const raw of (body.textContent ?? '').split('\n')) {
      const t = raw.replace(/\s+/g, ' ').trim()
      if (t.length >= 4 && !seen.has(t) && /\p{L}{3}/u.test(t) && t.split(' ').length >= 2) {
        seen.add(t)
        lines.unshift(t)
      }
    }
  }
  const title = dom.querySelector('title')?.textContent?.trim()
  if (title && looksLikeTitle(title)) heads.unshift(title)
  return { text: lines.join('\n'), heads: [...new Set(heads)].slice(0, 400) }
}

// ---------- Key phrases ----------

// Common English words that never make a key phrase on their own or at a phrase's edge.
const STOP = new Set(
  `a about above across after again against all almost alone along already also although always am among an and another any anyone anything anyway are aren't around as at away back be became because become becomes been before being below between both but by can cannot can't could couldn't did didn't do does doesn't doing don't done down during each either else enough etc even ever every everything few first for from further get gets getting give given gives go goes going good got great had has hasn't have haven't having he her here hers herself him himself his how however i if in into is isn't it it's its itself just keep kind last least less let like likely made main make makes making many may maybe me might more most mostly much must my myself near need needs never new next no nor not now of off often on once one only onto or other others otherwise our ours out over own part per perhaps put quite rather really same see seen several shall she should shouldn't show shows since so some something sometimes still such take takes than that that's the their theirs them themselves then there there's therefore these they they're thing things this those though through thus to together too toward towards two three under until up upon us use used uses using usually very via want was wasn't way ways we well were weren't what when where whereas whether which while who whom whose why will with within without won't would wouldn't yet you your yours yourself also eg ie e.g i.e vs versus each per within around called known mean means meaning example examples note notes slide slides page pages week weeks lecture lectures click tap press show hide open close back next previous start stop reset try view mode tab tabs menu button select toggle score correct wrong answer answers question questions quiz review true false yes no left right top bottom side front off full point points total marks mark level item items step steps case cases type types form forms list section chapter topic topics figure table see also include includes including increase increases increased decrease decreases decreased high higher low lower large small big different same important common normal number numbers time times day days year years`.split(
    /\s+/
  )
)

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’+-]*/gu
const ROMAN = /^(?:i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)$/
const CHUNK = /[\n.,;:!?()[\]{}"“”‘’|•·–—\/=<>*#]+|\s-\s/

export interface CorpusPhrases {
  /** document id → its top key phrases (keys), best first */
  perDoc: Map<string, string[]>
  /** key → the nicest spelling seen */
  labels: Map<string, string>
  /** key → how many documents have it among their top phrases */
  keyed: Map<string, number>
}

/** Key phrases for each document, ranked against all the others. */
export function corpusPhrases(docs: Map<string, string>, perDocLimit = 25): CorpusPhrases {
  const tfs = new Map<string, Map<string, number>>()
  const df = new Map<string, number>()
  const surface = new Map<string, Map<string, number>>()

  for (const [id, raw] of docs) {
    const text = raw.slice(0, 250_000)
    const tf = new Map<string, number>()
    for (const chunk of text.split(CHUNK)) {
      const words = chunk.match(WORD)
      if (!words) continue
      // runs of non-stop words
      let run: string[] = []
      const flush = (): void => {
        for (let len = 1; len <= Math.min(4, run.length); len++) {
          for (let s = 0; s + len <= run.length; s++) {
            const orig = run.slice(s, s + len)
            const key = orig
              .map((w, i) => {
                const l = w.toLowerCase().replace(/['’]s$/, '')
                // one key for "pressure ulcer" and "pressure ulcers"
                return i === orig.length - 1 && l.length > 4 && /[^su]s$/.test(l) ? l.slice(0, -1) : l
              })
              .join(' ')
            if (len === 1) {
              const w = orig[0]
              const acronym = /^[\p{Lu}]{3,6}s?$/u.test(w) && !ROMAN.test(w.toLowerCase())
              if (!acronym && (key.length < 5 || /\d/.test(key))) continue
            } else if (/^\d/.test(key) || /\d$/.test(key)) continue
            tf.set(key, (tf.get(key) ?? 0) + 1)
            const sf = surface.get(key) ?? new Map<string, number>()
            const pretty = orig.join(' ')
            sf.set(pretty, (sf.get(pretty) ?? 0) + 1)
            surface.set(key, sf)
          }
        }
        run = []
      }
      for (const w of words) {
        const lw = w.toLowerCase()
        if (STOP.has(lw) || lw.length < 2 || /^\d+$/.test(lw) || lw.length > 28 || ROMAN.test(lw)) flush()
        else run.push(w)
      }
      flush()
    }
    tfs.set(id, tf)
    for (const k of tf.keys()) df.set(k, (df.get(k) ?? 0) + 1)
  }

  const N = Math.max(1, docs.size)
  const LEN_W = [0, 0.6, 2.3, 2.7, 2.9]
  const perDoc = new Map<string, string[]>()
  const keyed = new Map<string, number>()
  for (const [id, tf] of tfs) {
    const scored: [string, number][] = []
    for (const [k, n] of tf) {
      const words = k.split(' ').length
      if (n < 2 && words === 1) continue
      const d = df.get(k) ?? 1
      // a phrase most of your documents use isn't telling you anything
      if (N >= 6 && d > N * 0.5) continue
      scored.push([k, n * Math.log(1 + N / d) * LEN_W[words] * (n >= 2 ? 1 : 0.6)])
    }
    scored.sort((a, b) => b[1] - a[1])
    // drop a shorter phrase when a longer one containing it accounts for most of its uses
    const top: string[] = []
    for (const [k] of scored.slice(0, perDocLimit * 4)) {
      const n = tf.get(k)!
      if (top.some((t) => t.includes(k) && t !== k && (tf.get(t) ?? 0) >= n * 0.7)) continue
      const longer = scored.find(([t]) => t !== k && (t.includes(` ${k}`) || t.startsWith(`${k} `)))
      if (longer && (tf.get(longer[0]) ?? 0) >= n * 0.7 && longer[0].split(' ').length <= 4) continue
      top.push(k)
      if (top.length >= perDocLimit) break
    }
    perDoc.set(id, top)
    for (const k of top) keyed.set(k, (keyed.get(k) ?? 0) + 1)
  }

  const labels = new Map<string, string>()
  for (const k of keyed.keys()) {
    const sf = [...(surface.get(k) ?? new Map<string, number>())].sort((a, b) => b[1] - a[1])
    let best = sf[0]?.[0] ?? k
    // prefer the capitalised spelling if it's used about as often
    const cap = sf.find(([s]) => /^\p{Lu}/u.test(s))
    if (cap && cap[1] >= (sf[0]?.[1] ?? 0) * 0.5) best = cap[0]
    labels.set(k, best.charAt(0).toUpperCase() + best.slice(1))
  }
  return { perDoc, labels, keyed }
}
