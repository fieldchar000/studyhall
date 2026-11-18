// Quiz questions pulled out of a study page's own data, read as plain values (never run). See study.ts.

export interface QuizQ {
  q: string
  options?: string[]
  answer?: number // index into options
  answerText?: string // for written answers (no options)
  why?: string
}

// ---------- Quiz questions from the page's data ----------

/** Reads one JS value as plain data (strings, numbers, true/false/null, lists, objects). Anything else (a function, an
 *  expression, a template with ${…}) fails, so nothing is ever run or guessed. */
class Literal {
  i = 0
  constructor(private s: string) {}
  private ws(): void {
    for (;;) {
      const c = this.s[this.i]
      if (c === ' ' || c === '\n' || c === '\r' || c === '\t') this.i++
      else if (c === '/' && this.s[this.i + 1] === '/') {
        const n = this.s.indexOf('\n', this.i)
        this.i = n < 0 ? this.s.length : n
      } else if (c === '/' && this.s[this.i + 1] === '*') {
        const n = this.s.indexOf('*/', this.i + 2)
        this.i = n < 0 ? this.s.length : n + 2
      } else return
    }
  }
  value(depth = 0): unknown {
    if (depth > 12) throw 0
    this.ws()
    const c = this.s[this.i]
    if (c === '{') return this.object(depth)
    if (c === '[') return this.array(depth)
    if (c === '"' || c === "'" || c === '`') return this.string()
    const m = /^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i.exec(this.s.slice(this.i, this.i + 40))
    if (m) {
      this.i += m[0].length
      return Number(m[0])
    }
    for (const [w, v] of [['true', true], ['false', false], ['null', null], ['undefined', undefined]] as const)
      if (this.s.startsWith(w, this.i) && !/[\w$]/.test(this.s[this.i + w.length] ?? '')) {
        this.i += w.length
        return v
      }
    throw 0
  }
  string(): string {
    const quote = this.s[this.i++]
    let out = ''
    for (;;) {
      if (this.i >= this.s.length) throw 0
      const c = this.s[this.i++]
      if (c === quote) return out
      if (quote === '`' && c === '$' && this.s[this.i] === '{') throw 0
      if (c === '\n' && quote !== '`') throw 0
      if (c === '\\') {
        const e = this.s[this.i++]
        if (e === 'n') out += '\n'
        else if (e === 't') out += '\t'
        else if (e === 'u') {
          const h = this.s[this.i] === '{' ? /^\{([0-9a-f]+)\}/i.exec(this.s.slice(this.i)) : /^([0-9a-f]{4})/i.exec(this.s.slice(this.i))
          if (!h) throw 0
          out += String.fromCodePoint(parseInt(h[1], 16))
          this.i += h[0].length
        } else if (e === 'x') {
          out += String.fromCharCode(parseInt(this.s.slice(this.i, this.i + 2), 16))
          this.i += 2
        } else if (e === '\n') {
          /* line continuation */
        } else out += e
      } else out += c
      if (out.length > 20_000) throw 0
    }
  }
  array(depth: number): unknown[] {
    this.i++
    const out: unknown[] = []
    for (;;) {
      this.ws()
      if (this.s[this.i] === ']') {
        this.i++
        return out
      }
      out.push(this.value(depth + 1))
      this.ws()
      if (this.s[this.i] === ',') this.i++
      else if (this.s[this.i] !== ']') throw 0
      if (out.length > 2000) throw 0
    }
  }
  object(depth: number): Record<string, unknown> {
    this.i++
    const out: Record<string, unknown> = {}
    for (;;) {
      this.ws()
      if (this.s[this.i] === '}') {
        this.i++
        return out
      }
      let key: string
      const c = this.s[this.i]
      if (c === '"' || c === "'") key = this.string()
      else {
        const m = /^[A-Za-z_$][\w$]*/.exec(this.s.slice(this.i, this.i + 64))
        if (!m) throw 0
        key = m[0]
        this.i += key.length
      }
      this.ws()
      if (this.s[this.i] !== ':') throw 0
      this.i++
      out[key] = this.value(depth + 1)
      this.ws()
      if (this.s[this.i] === ',') this.i++
      else if (this.s[this.i] !== '}') throw 0
    }
  }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : null)
const strs = (v: unknown): string[] | null => (Array.isArray(v) && v.length >= 2 && v.length <= 8 && v.every((x) => typeof x === 'string' && x.trim()) ? v.map((x) => str(x)!) : null)

/** One question from an object like {q:"…", options:[…], correct:1, why:"…"} (many spellings), or a flashcard. */
function toQuestion(o: Record<string, unknown>): QuizQ | null {
  const q = str(o.q ?? o.question ?? o.prompt ?? o.stem ?? o.front ?? o.term)
  if (!q || q.length < 8) return null
  const why = str(o.why ?? o.explanation ?? o.explain ?? o.rationale ?? o.exp ?? o.feedback ?? o.reason) ?? undefined
  const options = strs(o.options ?? o.choices ?? o.opts ?? o.answers) ?? strs(o.a)
  if (options) {
    const raw = o.correct ?? o.answer ?? o.ans ?? o.correctIndex ?? o.correctAnswer ?? o.c ?? o.key
    let answer = -1
    if (typeof raw === 'number' && Number.isInteger(raw)) answer = raw
    else if (typeof raw === 'string') {
      const t = raw.trim().toLowerCase()
      answer = options.findIndex((x) => x.toLowerCase() === t)
      if (answer < 0 && /^[a-h]$/.test(t)) answer = t.charCodeAt(0) - 97
    }
    if (answer >= 0 && answer < options.length) return { q, options, answer, why }
    // (index 1-based in some files: only trust it when 0 is impossible)
    return null
  }
  const answerText = str(o.answer ?? o.a ?? o.ans ?? o.model ?? o.expected ?? o.back ?? o.definition ?? o.def)
  return answerText ? { q, answerText: answerText.slice(0, 600), why } : null
}

export function extractQuizzes(html: string): QuizQ[] {
  const out: QuizQ[] = []
  const seen = new Set<string>()
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1])
  const started = Date.now()
  for (const js of scripts) {
    // Only look where a question-like key appears, and parse the object that holds it.
    const key = /[{,]\s*["']?(q|question|prompt|stem|front|term)["']?\s*:\s*["'`]/g
    let m: RegExpExecArray | null
    while ((m = key.exec(js))) {
      if (Date.now() - started > 4000 || out.length >= 400) return out
      // The { that opens the object holding this key (skipping objects that open and close before it).
      let open = -1
      if (js[m.index] === '{') open = m.index
      else
        for (let i = m.index - 1, depth = 0; i >= 0 && m.index - i < 20_000; i--) {
          const c = js[i]
          if (c === '}' || c === ']') depth++
          else if (c === '{' || c === '[') {
            if (depth === 0) {
              if (c === '{') open = i
              break
            }
            depth--
          }
        }
      if (open < 0) continue
      try {
        const p = new Literal(js)
        p.i = open
        const v = p.value()
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          const qq = toQuestion(v as Record<string, unknown>)
          if (qq && !seen.has(qq.q)) {
            seen.add(qq.q)
            out.push(qq)
          }
        }
      } catch {
        /* not plain data: skip it */
      }
    }
  }
  return out
}

