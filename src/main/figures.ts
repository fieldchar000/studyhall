// Figure cards: real labelled diagrams (the heart, a nephron, a synapse…) from Wikimedia Commons, where most
// textbook-style figures are free to reuse with their author and licence shown. Nova looks at the best one
// (see_photo) and shows it on a photo card with pins and labels on the parts it's explaining; the card's credit line
// names the author and the licence. Free, no account, nothing about you is sent (only the topic).

import { photoCredits } from './roamies/draw.mjs'

const API = 'https://commons.wikimedia.org/w/api.php'
const UA = 'Studyhall/1.0 (desktop study app; figure search)'

export type Figure = { title: string; url: string; width: number; height: number; kind: string; credit: string }

const plain = (html: unknown): string =>
  String(html ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
// Licences that allow showing it with credit (the rest, e.g. "fair use" or unknown, are skipped).
const FREE = /\b(cc0|cc[ -]by|public domain|pd\b|pd-|attribution)/i
// A file named for another language ("…-es.svg", "… (de).png") has labels you can't read.
const OTHER_LANG = /[-_ (](es|fr|de|it|pt|ru|zh|ja|ar|pl|nl|ca|uk|tr|cs|sv|fi|hu|ro|ko|he|fa|el|vi|id)[)]?\.(svg|png|jpe?g)$/i
const GOOD = /\b(diagram|labell?ed|schematic|anatomy|structure|parts|cross[- ]section|illustration|mechanism|pathway)\b/i

/** The best few labelled diagrams for a topic, best first. */
export async function findFigures(topic: string): Promise<Figure[]> {
  const q = String(topic).trim().slice(0, 100)
  if (!q) return []
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: `${q} diagram filetype:bitmap|drawing`,
    gsrnamespace: '6',
    gsrlimit: '15',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|mime|size',
    iiurlwidth: '1024',
    origin: '*'
  })
  const r = await fetch(`${API}?${params}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(10_000) })
  if (!r.ok) throw new Error(`Wikimedia Commons said ${r.status}.`)
  type Info = { url: string; thumburl?: string; width: number; height: number; mime: string; extmetadata?: Record<string, { value?: unknown }> }
  const j = (await r.json()) as { query?: { pages?: Record<string, { title: string; index?: number; imageinfo?: Info[] }> } }
  const words = q
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2)
  const out: (Figure & { score: number })[] = []
  for (const p of Object.values(j.query?.pages ?? {})) {
    const ii = p.imageinfo?.[0]
    if (!ii?.thumburl || !/^image\/(svg\+xml|png|jpeg)$/.test(ii.mime)) continue
    const meta = ii.extmetadata ?? {}
    const licence = plain(meta.LicenseShortName?.value)
    if (!FREE.test(licence)) continue
    const title = p.title.replace(/^File:/, '')
    if (OTHER_LANG.test(title)) continue
    const name = title.replace(/\.(svg|png|jpe?g)$/i, '').replace(/[_-]+/g, ' ')
    const artist = plain(meta.Artist?.value).slice(0, 60) || 'unknown author'
    let score = 10 - (p.index ?? 10) * 0.4
    if (GOOD.test(name)) score += 3
    if (ii.mime === 'image/svg+xml') score += 2 // clean line drawings with readable labels
    score += words.filter((w) => name.toLowerCase().includes(w)).length * 1.5
    if (Math.min(ii.width, ii.height) < 300) score -= 3
    out.push({
      title: name,
      url: ii.thumburl,
      width: ii.width,
      height: ii.height,
      kind: ii.mime === 'image/svg+xml' ? 'drawing' : 'picture',
      credit: `${artist} · ${licence} · Wikimedia Commons`,
      score
    })
  }
  out.sort((a, b) => b.score - a.score)
  const best = out.slice(0, 4).map(({ score: _s, ...f }) => f)
  for (const f of best) photoCredits.set(f.url, f.credit)
  return best
}

/** What the find_figure tool says. */
export async function figureText(topic: string): Promise<string> {
  const figs = await findFigures(topic).catch((e: unknown) => {
    throw new Error(`Couldn't search for figures: ${e instanceof Error ? e.message : String(e)}`)
  })
  if (!figs.length) return `No good labelled figure of "${topic}" on Wikimedia Commons. Draw it instead (a flow, a model, or a labelled card), or try a broader topic.`
  return [
    `Labelled figures of "${topic}" (best first). Pick the clearest one for what you're explaining, call see_photo with its url to look at it, then show it on a photo card with that url (card_size large for a detailed one) and labels or pins on the parts you explain, read off the picture. Its credit shows on the card by itself.`,
    ...figs.map((f, i) => `${i + 1}. ${f.title} (${f.kind}, ${f.width}×${f.height}): ${f.url}`)
  ].join('\n')
}
