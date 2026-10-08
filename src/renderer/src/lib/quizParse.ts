// Finds questions in the text of an exam paper, and answers in a mark scheme.
// No AI and no internet: it reads the usual exam layout —
//   "3 (a) Explain why … [4]", "Question 5", multiple choice "A … B … C … D …".
// The result is shown for review before anything is saved, because papers vary a lot.

export interface ParsedQuestion {
  number: string // "3(a)(ii)"
  prompt: string
  kind: 'mcq' | 'open'
  options: string[]
  marks: number | null
  answer: string
}

// Headers, footers and margin text that appear on every page.
const NOISE =
  /^(turn over\b.*|page \d+( of \d+)?|\d{1,3}|©.*|.*\bucles\b.*|.*\bpearson\b.*|.*\baqa\b.*|.*\bocr\b.*|blank page|do not write.*|.*\bthis margin\b.*|end of (the )?(paper|questions|test|exam).*|answer all (the )?questions.*|\[?total(\s+for\s+question\s+\d+)?\s*(is\s*)?\d*\s*marks?\]?|\*[a-z0-9 ]{6,}\*|[A-Z0-9]{10,}|please check the examination details.*|.*candidate (number|name).*|.*centre number.*)$/i

const MARKS = /\s*[[(]\s*(\d{1,2})\s*(?:marks?)?\s*[\])]\s*$/i
const LEADERS = /\.{4,}|_{4,}|…{2,}/g
const TOP = /^(?:Q(?:uestion)?\.?\s*)?(\d{1,2})\s*(?:[.):]\s*|\s+(?=\S))(.*)$/i
const PART = /^\(?([a-h])\)\s*(.*)$/
const SUB = /^\(?((?:i{1,3}|iv|v|vi{0,3}|ix|x))\)\s*(.*)$/
const OPTION = /^\(?([A-E])[).:]?\s+(.+)$/

interface Part {
  label: string
  lines: string[]
  options: string[]
  marks: number | null
}

const clean = (s: string): string =>
  s
    .replace(LEADERS, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Split "A 12 B 15 C 18 D 21" style lines into options. */
function inlineOptions(line: string): string[] | null {
  if (!/^\(?A[).:]?\s+\S/.test(line) || !/\s\(?B[).:]?\s+\S/.test(line)) return null
  const parts = line.split(/\s+(?=\(?[B-E][).:]?\s)/)
  if (parts.length < 3) return null
  return parts.map((p) => p.replace(/^\(?[A-E][).:]?\s+/, '').trim())
}

export function parseQuestions(text: string): ParsedQuestion[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/ /g, ' ').trim())
    .filter((l) => l && !NOISE.test(l))

  interface Top {
    num: number
    stem: string[]
    stemMarks: number | null
    options: string[]
    parts: Part[]
  }
  const tops: Top[] = []
  let top = null as Top | null
  let part: Part | null = null
  let lastLetter = ''
  let partContext: string[] = []

  const addTo = (line: string): void => {
    let marks: number | null = null
    const m = MARKS.exec(line)
    if (m) {
      marks = Number(m[1])
      line = line.slice(0, m.index)
    }
    const target = part ?? top
    if (!target) return
    const opts = inlineOptions(line)
    const opt = OPTION.exec(line)
    const options = part ? part.options : top!.options
    if (opts && options.length === 0) options.push(...opts)
    else if (opt && opt[1].charCodeAt(0) - 65 === options.length) options.push(opt[2].trim())
    else if (line.trim()) {
      if (part) part.lines.push(line)
      else top!.stem.push(line)
    }
    if (marks !== null) {
      if (part) part.marks = (part.marks ?? 0) + marks
      else top!.stemMarks = (top!.stemMarks ?? 0) + marks
    }
  }

  // Fewer than three "A …" lines weren't options after all ("A student placed…").
  const unOption = (x: { options: string[] }, lines: string[]): void => {
    if (x.options.length > 0 && x.options.length < 3) {
      lines.unshift(...x.options.map((o, i) => `${String.fromCharCode(65 + i)} ${o}`))
      x.options = []
    }
  }

  for (let line of lines) {
    const t = TOP.exec(line)
    const n = t ? Number(t[1]) : NaN
    const expected: number = top ? (top as Top).num + 1 : 1
    // A new question only if its number is the next one (avoids "20 cm" etc.).
    if (t && (n === expected || (!top && n <= 3)) && (t[2] === '' || /^[A-Z(“"'‘]/.test(t[2]) || PART.test(t[2]))) {
      top = { num: n, stem: [], stemMarks: null, options: [], parts: [] }
      tops.push(top)
      part = null
      lastLetter = ''
      line = t[2]
      if (!line) continue
    }
    if (!top) continue
    const p = PART.exec(line)
    if (p && (p[1] === 'a' ? true : p[1].charCodeAt(0) === lastLetter.charCodeAt(0) + 1)) {
      lastLetter = p[1]
      part = { label: `(${p[1]})`, lines: [], options: [], marks: null }
      partContext = []
      top.parts.push(part)
      line = p[2]
      const s2 = SUB.exec(line)
      if (s2) {
        part.label += `(${s2[1]})`
        line = s2[2]
      }
      if (line) addTo(line)
      continue
    }
    const s = SUB.exec(line)
    if (s && part) {
      // (i), (ii)… inside part (a): each becomes its own question, keeping (a)'s text as context
      if (!/\([ivx]+\)$/.test(part.label)) {
        unOption(part, part.lines)
        partContext = [...part.lines]
        top.parts.pop()
      }
      const fresh: Part = { label: `(${lastLetter})(${s[1]})`, lines: [...partContext], options: [], marks: null }
      top.parts.push(fresh)
      part = fresh
      if (s[2]) addTo(s[2])
      continue
    }
    addTo(line)
  }

  for (const q of tops) {
    unOption(q, q.stem)
    for (const p of q.parts) unOption(p, p.lines)
  }

  const out: ParsedQuestion[] = []
  for (const q of tops) {
    const stem = clean(q.stem.join(' '))
    if (q.parts.length === 0) {
      if (!stem && q.options.length < 2) continue
      out.push({
        number: String(q.num),
        prompt: stem,
        kind: q.options.length >= 3 ? 'mcq' : 'open',
        options: q.options.map(clean),
        marks: q.stemMarks,
        answer: ''
      })
      continue
    }
    for (const p of q.parts) {
      const body = clean(p.lines.join(' '))
      if (!body && p.options.length < 2) continue
      out.push({
        number: `${q.num}${p.label}`,
        prompt: stem ? `${stem}\n\n${body}` : body,
        kind: p.options.length >= 3 ? 'mcq' : 'open',
        options: p.options.map(clean),
        marks: p.marks,
        answer: ''
      })
    }
  }
  if (out.length >= 2) return out

  // Worksheets without numbering: every sentence ending in "?" becomes a question.
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=\?)\s+/)
    .map((s) => s.trim())
    .filter((s) => s.endsWith('?') && s.length > 12)
  return sentences.slice(0, 200).map((s, i) => ({ number: String(i + 1), prompt: s.slice(-400), kind: 'open', options: [], marks: null, answer: '' }))
}

export const normLabel = (s: string): string => s.toLowerCase().replace(/question|q|\s|\.|:/g, '')

/** Answers in a mark scheme, keyed by normalised question number ("3(a)(ii)"). */
export function parseAnswers(text: string): Map<string, string> {
  const answers = new Map<string, string>()
  const LABEL = /^(?:Q(?:uestion)?\.?\s*)?(\d{1,2})\s*(?:\(?([a-h])\)?)?\s*(?:\(?((?:i{1,3}|iv|vi{0,3}|ix|x))\))?[.):]?\s+(.*)$/i
  let key: string | null = null
  let buf: string[] = []
  const save = (): void => {
    if (key && buf.length) answers.set(key, clean(buf.join(' ')))
    buf = []
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || NOISE.test(line)) continue
    // Answer grids: "1 B  2 D  3 A …"
    const pairs = [...line.matchAll(/(?:^|\s)(\d{1,2})\s*[.)]?\s*([A-E])(?=\s|$)/g)]
    if (pairs.length >= 2 && line.replace(/(?:^|\s)(\d{1,2})\s*[.)]?\s*([A-E])(?=\s|$)/g, '').trim() === '') {
      save()
      key = null
      for (const p of pairs) answers.set(p[1], p[2])
      continue
    }
    const m = LABEL.exec(line)
    if (m) {
      save()
      key = `${m[1]}${m[2] ? `(${m[2].toLowerCase()})` : ''}${m[3] ? `(${m[3].toLowerCase()})` : ''}`
      buf = [m[4]]
      continue
    }
    if (key) buf.push(line)
  }
  save()
  return answers
}

/** Fill in answers from a mark scheme. */
export function attachAnswers(qs: ParsedQuestion[], answers: Map<string, string>): ParsedQuestion[] {
  return qs.map((q) => {
    const k = normLabel(q.number)
    const a = answers.get(k) ?? answers.get(k.replace(/\([ivx]+\)$/, '')) ?? (q.kind === 'mcq' ? answers.get(k.replace(/\(.*$/, '')) : undefined) ?? ''
    return { ...q, answer: a }
  })
}

/** For multiple choice: which option an answer refers to ("B" / "B 42" → 1). */
export function correctOption(q: { answer: string; options: string }): number | null {
  const m = /^\s*\(?([A-E])\b/.exec(q.answer)
  if (m) return m[1].charCodeAt(0) - 65
  try {
    const opts = JSON.parse(q.options) as string[]
    const i = opts.findIndex((o) => o.trim().toLowerCase() === q.answer.trim().toLowerCase())
    return i >= 0 ? i : null
  } catch {
    return null
  }
}
