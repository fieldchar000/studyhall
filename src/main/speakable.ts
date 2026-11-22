// Text for Nova's voice. The voice (Kokoro) reads words from its dictionary and quietly skips anything else, so "slide
// 9", "20%" or "β1" came out as "slide", "", "": numbers, symbols and Greek letters are written out as words first,
// and quote marks or invisible characters stuck to a word (which made it unknown too) are taken off. What's shown on
// screen is untouched; only what's spoken goes through here.

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
const ORD: Record<string, string> = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' }

/** A whole number in words ("1,250" → "one thousand two hundred and fifty"). */
export function numberWords(n: number): string {
  if (!Number.isFinite(n)) return ''
  if (n < 0) return `minus ${numberWords(-n)}`
  n = Math.floor(n)
  if (n < 20) return ONES[n]
  if (n < 100) return `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10]}` : ''}`
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` and ${numberWords(n % 100)}` : ''}`
  for (const [size, name] of [
    [1e9, 'billion'],
    [1e6, 'million'],
    [1e3, 'thousand']
  ] as const) {
    if (n >= size) {
      const rest = n % size
      return `${numberWords(Math.floor(n / size))} ${name}${rest ? (rest < 100 ? ' and ' : ' ') + numberWords(rest) : ''}`
    }
  }
  return String(n)
}
const ordinal = (n: number): string => {
  const w = numberWords(n)
  const last = /(\w+)$/.exec(w)?.[1] ?? w
  const o = ORD[last] ?? (last.endsWith('y') ? `${last.slice(0, -1)}ieth` : `${last}th`)
  return w.slice(0, w.length - last.length) + o
}
/** "2.5" → "two point five"; "1,000" → "one thousand"; "2024" said like a year when it looks like one. */
function numeral(raw: string): string {
  const s = raw.replace(/,/g, '')
  if (/^\d+\.\d+$/.test(s)) {
    const [a, b] = s.split('.')
    return `${numberWords(Number(a))} point ${[...b].map((d) => ONES[Number(d)]).join(' ')}`
  }
  const n = Number(s)
  // Years (1100 to 2099, written without a comma): "nineteen ninety-nine", "twenty twenty-six".
  if (!raw.includes(',') && n >= 1100 && n <= 2099 && n % 100 !== 0 && !(n >= 2000 && n < 2010)) return `${numberWords(Math.floor(n / 100))} ${n % 100 < 10 ? `oh ${ONES[n % 100]}` : numberWords(n % 100)}`
  return numberWords(n)
}

const GREEK: Record<string, string> = { α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', ε: 'epsilon', θ: 'theta', κ: 'kappa', λ: 'lambda', μ: 'micro', π: 'pi', σ: 'sigma', τ: 'tau', φ: 'phi', χ: 'chi', ψ: 'psi', ω: 'omega', Δ: 'delta', Σ: 'sigma', Ω: 'omega' }

const KEEP_UPPER = new Set([
  'AM', 'AN', 'AS', 'AT', 'BE', 'BY', 'DO', 'GO', 'HE', 'HI', 'IF', 'IN', 'IS', 'IT',
  'ME', 'MY', 'NO', 'OF', 'OH', 'OK', 'ON', 'OR', 'SO', 'TO', 'UP', 'US', 'WE',
  'ALL', 'AND', 'ARE', 'BUT', 'CAN', 'DID', 'FOR', 'GET', 'GOT', 'HAD', 'HAS', 'HER',
  'HIM', 'HIS', 'HOW', 'ITS', 'LET', 'MAY', 'NEW', 'NOT', 'NOW', 'OFF', 'OLD', 'ONE',
  'OUR', 'OUT', 'OWN', 'RUN', 'SAY', 'SEE', 'SET', 'SHE', 'THE', 'TOO', 'TRY', 'TWO',
  'USE', 'WAY', 'WHO', 'WHY', 'YES', 'YET', 'YOU', 'PIN', 'RAM', 'ROM', 'SIM',
  'AIDS', 'ASAP', 'BACK', 'BEST', 'BOTH', 'CARD', 'CODE', 'COPY', 'DATA', 'DAYS',
  'DONE', 'EACH', 'EDIT', 'EXAM', 'FAST', 'FILE', 'FREE', 'FROM', 'FULL', 'GERD',
  'GIVE', 'GOOD', 'HELP', 'HIDE', 'HIGH', 'HOUR', 'HUGE', 'INTO', 'JUST', 'KEEP',
  'LIKE', 'LINK', 'LIST', 'LOOK', 'MAKE', 'MERS', 'MORE', 'MOST', 'MUCH', 'MUTE',
  'NASA', 'NEED', 'NEXT', 'NONE', 'NOTE', 'NOVA', 'ONLY', 'OPEN', 'OVER', 'PAGE',
  'PART', 'PLAY', 'PLUS', 'QUIZ', 'RAAS', 'READ', 'REAL', 'SARS', 'SAVE', 'SEND',
  'SHOW', 'SKIP', 'SLOW', 'SOME', 'STEP', 'STOP', 'TAKE', 'TEST', 'TEXT', 'THAT',
  'THIS', 'TIME', 'TRUE', 'VERY', 'VIEW', 'WAIT', 'WEEK', 'WIFI', 'WITH', 'WORD',
  'WORK', 'YEAR', 'AUTO', 'COVID', 'FALSE', 'START', 'CHECK', 'RIGHT', 'WRONG', 'ISOBAR'
])

const PRONOUNCE: [RegExp, string][] = [
  [/\bC\+\+(?=\s|[.,!?;:)\]]|$)/g, 'C plus plus'],
  [/\bSpO2\b/g, 'S P O 2'],
  [/\bHbA1c\b/g, 'H B A 1 C'],
  [/\bH2O\b/g, 'H 2 O'],
  [/\bCO2\b/g, 'C O 2'],
  [/\bO2\b/g, 'O 2'],
  [/\bCa2\+(?=\s|[.,!?;:)\]]|$)/g, 'calcium 2 plus'],
  [/\bMg2\+(?=\s|[.,!?;:)\]]|$)/g, 'magnesium 2 plus'],
  [/\bNa\+(?=\s|[.,!?;:)\]]|$)/g, 'sodium plus'],
  [/\bK\+(?=\s|[.,!?;:)\]]|$)/g, 'potassium plus'],
  [/\bCl-(?=\s|[.,!?;:)\]]|$)/g, 'chloride minus'],
  [/\bH\+(?=\s|[.,!?;:)\]]|$)/g, 'H plus'],
  [/\bpH\b/g, 'P H'],
  [/\bmRNA\b/g, 'M R N A'],
  [/\btRNA\b/g, 'T R N A'],
  [/\brRNA\b/g, 'R R N A'],
  [/\bNSAIDs\b/g, 'N saids'],
  [/\bantidiuretic\b/gi, 'anti diuretic'],
  [/\bokey-?dokie\b/gi, 'okay'],
  [/\bdokie\b/gi, 'okay']
]

/** Text the voice can say in full. */
export function speakable(text: string): string {
  let t = text
    // invisible characters (markers, zero-width spaces) and quote marks or brackets stuck to words
    .replace(/[​-‏⁠-⁯﻿]/g, '')
    .replace(/[“”"«»„]/g, '')
    .replace(/(^|\s)['‘’(\[{]+(?=\w)/g, '$1')
    .replace(/(\w)['‘’)\]}]+(?=\s|[.,!?;:]|$)/g, '$1')
    // Greek letters, with a number straight after ("β1" → "beta 1", then the number in words)
    .replace(/[αβγδεθκλμπστφχψωΔΣΩ]/g, (g) => ` ${GREEK[g]} `)
  for (const [re, rep] of PRONOUNCE) t = t.replace(re, rep)
  t = t
    // grades, blood types, and ions with stuck +/- (A+, B-, O-, AB+, 10+)
    .replace(/\b([A-Za-z]+|\d+)\+(?=\s|[.,!?;:)\]]|$)/g, '$1 plus')
    .replace(/\b(AB|[A-DFO])-(?=\s|[.,!?;:)\]]|$)/g, '$1 minus')
    // letter+digit codes (T3, T4, B12, Q1 -> T 3, B 12, Q 1)
    .replace(/\b([A-Z]{1,3})(\d+)\b/g, (_m, a: string, b: string) => `${a.split('').join(' ')} ${b}`)
  t = t
    // times: 4:30 → four thirty, 9:05 → nine oh five, 10:00 → ten o'clock
    .replace(/\b(\d{1,2}):(\d{2})\b/g, (_m, h, m) => `${numberWords(Number(h))} ${m === '00' ? "o'clock" : Number(m) < 10 ? `oh ${ONES[Number(m)]}` : numberWords(Number(m))}`)
    // ordinals: 1st, 22nd, 3rd, 4th
    .replace(/\b(\d+)(st|nd|rd|th)\b/gi, (_m, n) => ordinal(Number(n)))
    // ranges: 3-4, 10–12 → "three to four"
    .replace(/\b(\d+(?:\.\d+)?)\s?[-–—]\s?(\d+(?:\.\d+)?)\b/g, (_m, a, b) => `${numeral(a)} to ${numeral(b)}`)
    // scores and fractions: 9/10 → nine out of ten
    .replace(/\b(\d+)\s?\/\s?(\d+)\b/g, (_m, a, b) => `${numeral(a)} out of ${numeral(b)}`)
    // money and percentages
    .replace(/\$\s?(\d[\d,]*)(?:\.(\d{2}))?\b/g, (_m, d, c) => `${numberWords(Number(String(d).replace(/,/g, '')))} dollars${c && c !== '00' ? ` ${numberWords(Number(c))}` : ''}`)
    .replace(/(\d[\d,]*(?:\.\d+)?)\s?%/g, (_m, n) => `${numeral(n)} percent`)
    .replace(/(\d[\d,]*(?:\.\d+)?)\s?°\s?C\b/g, (_m, n) => `${numeral(n)} degrees Celsius`)
    .replace(/°/g, ' degrees')
    // any other number
    .replace(/\d[\d,]*(?:\.\d+)?/g, (n) => ` ${numeral(n)} `)
    // symbols the voice can't say
    .replace(/\s&\s/g, ' and ')
    .replace(/\s\+\s/g, ' plus ')
    .replace(/\s=\s/g, ' equals ')
    .replace(/\s?[→⇒]\s?/g, ' to ')
    .replace(/\s?[↑]\s?/g, ' up ')
    .replace(/\s?[↓]\s?/g, ' down ')
    .replace(/~\s?/g, 'about ')
    .replace(/\s×\s/g, ' times ')
  t = t
    // slash-separated terms (D/calcium, T3/T4, and/or) and underscores
    .replace(/\band\s*\/\s*or\b/gi, 'and or')
    .replace(/([A-Za-z]+)\s*\/\s*([A-Za-z]+)/g, '$1 or $2')
    .replace(/([A-Za-z]+)\s*\/\s*([A-Za-z]+)/g, '$1 or $2')
    .replace(/(^|\s)\/+(?=[A-Za-z0-9])/g, '$1')
    .replace(/_+/g, ' ')
    // spell out 2-5 letter ALL-CAPS acronyms Kokoro's lexicon doesn't know (TSH, PTH, ACTH, ADH, HBS, GX)
    .replace(/\b([A-Z]{2,5})\b/g, (w) => (KEEP_UPPER.has(w) ? w : w.split('').join(' ')))
  return t.replace(/\s+([.,!?;:])/g, '$1').replace(/\s+/g, ' ').trim()
}
