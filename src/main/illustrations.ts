// The illustration kit for Nova's scene cards: Bioicons (https://bioicons.com, by Simon Dürr and contributors), about
// 2,800 free science drawings (cells, receptors, neurons, organs, drugs, lab things), each under CC0, MIT or a Creative
// Commons licence. Nothing is bundled: the list of drawings is read once from the project's GitHub and kept, and each
// drawing is fetched the first time Nova uses it and kept too (in Studyhall's data folder), so it works offline after.
// A CC BY drawing's author and licence show on the card. Drawings are only ever shown as pictures (an SVG in an
// <img> never runs code), and anything that could reach outside the file is stripped first.

import { app } from 'electron'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO = 'duerrsimon/bioicons'
const UA = 'Studyhall/1.0 (desktop study app; illustrations)'
type Icon = { id: string; name: string; category: string; author: string; license: string; path: string; words: string[] }

const dir = (): string => {
  const d = join(app.getPath('userData'), 'illustrations')
  mkdirSync(d, { recursive: true })
  return d
}
const tidy = (s: string): string => s.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
const toWords = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1)

let index: Icon[] | null = null
let loading: Promise<Icon[]> | null = null
/** The list of drawings: kept for a month, then read again from GitHub. */
async function icons(): Promise<Icon[]> {
  if (index) return index
  loading ??= (async () => {
    const file = join(dir(), 'index.json')
    let paths: string[] | null = null
    if (existsSync(file) && Date.now() - statSync(file).mtimeMs < 30 * 24 * 3_600_000) {
      try {
        paths = JSON.parse(readFileSync(file, 'utf8')) as string[]
      } catch {
        paths = null
      }
    }
    if (!paths) {
      const r = await fetch(`https://api.github.com/repos/${REPO}/git/trees/HEAD?recursive=1`, {
        headers: { 'user-agent': UA, accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(15_000)
      })
      if (!r.ok) throw new Error(`The illustration list couldn't be read (GitHub said ${r.status}).`)
      const j = (await r.json()) as { tree?: { path: string }[] }
      paths = (j.tree ?? []).map((t) => t.path).filter((p) => /^static\/icons\/.+\.svg$/i.test(p))
      writeFileSync(file, JSON.stringify(paths))
    }
    // static/icons/<licence>/<category>/<author>/<name>.svg
    index = paths.flatMap((p) => {
      const parts = p.split('/')
      if (parts.length < 6) return []
      const [, , license, category, author] = parts
      const name = tidy(parts[parts.length - 1].replace(/\.svg$/i, ''))
      return [{ id: `${category}/${name}`.replace(/\s+/g, '_'), name, category: tidy(category), author: tidy(author), license, path: p, words: toWords(`${name} ${category}`) }]
    })
    return index
  })().finally(() => (loading = null))
  return loading
}

/** The best drawings for some words ("beta receptor", "heart", "pill"). */
export async function findIllustrations(query: string, n = 8): Promise<Icon[]> {
  const want = toWords(query)
  if (!want.length) return []
  const all = await icons()
  return all
    .map((ic) => {
      let s = 0
      for (const w of want) {
        if (ic.words.includes(w)) s += 3
        else if (ic.words.some((x) => x.startsWith(w) || w.startsWith(x))) s += 1.5
        else if (ic.name.toLowerCase().includes(w)) s += 1
      }
      if (want.every((w) => ic.words.some((x) => x.startsWith(w)))) s += 2
      return { ic, s: s - ic.words.length * 0.05 }
    })
    .filter((x) => x.s >= 3)
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((x) => x.ic)
}

/** What the find_illustrations tool says, for a few searches at once. */
export async function illustrationsText(queries: string[]): Promise<string> {
  const lines: string[] = []
  for (const q of queries.slice(0, 6)) {
    const got = await findIllustrations(q, 6)
    lines.push(got.length ? `"${q}": ${got.map((ic) => `${ic.id} (${ic.name}, ${ic.category})`).join('; ')}` : `"${q}": nothing; try another word, or leave it out`)
  }
  return `Drawings for a scene card (use the id as a piece's icon):\n${lines.join('\n')}`
}

const credits = new Map<string, string>()
/** One drawing as a picture (data URL), fetched the first time and kept; with its credit line. */
export async function illustration(id: string): Promise<{ src: string; credit: string }> {
  const all = await icons()
  const ic = all.find((x) => x.id === id) ?? all.find((x) => x.id.toLowerCase() === String(id).toLowerCase())
  if (!ic) throw new Error(`No drawing "${id}": use an id from find_illustrations.`)
  const file = join(dir(), `${createHash('sha1').update(ic.path).digest('hex').slice(0, 16)}.svg`)
  let svg: string
  if (existsSync(file)) svg = readFileSync(file, 'utf8')
  else {
    const r = await fetch(`https://raw.githubusercontent.com/${REPO}/HEAD/${ic.path.split('/').map(encodeURIComponent).join('/')}`, {
      headers: { 'user-agent': UA },
      signal: AbortSignal.timeout(15_000)
    })
    if (!r.ok) throw new Error(`That drawing couldn't be fetched (${r.status}).`)
    svg = await r.text()
    if (svg.length > 600_000) throw new Error('That drawing is too big.')
    // Pictures only: no scripts, no event handlers, no links out of the file (fonts or images from elsewhere).
    svg = svg
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '')
      .replace(/(xlink:)?href\s*=\s*("(?!#|data:image)[^"]*"|'(?!#|data:image)[^']*')/gi, '')
      .replace(/@import[^;]+;/gi, '')
    writeFileSync(file, svg)
  }
  const credit = ic.license.startsWith('cc-by') ? `${ic.author} · ${ic.license.toUpperCase().replace(/-/g, ' ')} · Bioicons` : 'Bioicons'
  credits.set(id, credit)
  return { src: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, credit }
}
