// The lesson reader's PDF part (main/lessonReader.ts asks for it): every page's text, which pages have pictures, and
// one page drawn as a picture, with the same PDF library Studyhall uses to import study files.

import { pdfText } from '@/lib/importDoc'

async function open(data: Uint8Array): Promise<import('pdfjs-dist').PDFDocumentProxy> {
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  return pdfjs.getDocument({ data: data.slice() }).promise
}

/** [{ n, text, pictures }] as JSON: the text of every page, and how many pictures each page draws. */
export async function lessonPdfText(data: Uint8Array): Promise<string> {
  const { pages } = await pdfText(data)
  const pdfjs = await import('pdfjs-dist')
  const doc = await open(data)
  const out: { n: number; text: string; pictures: number; boxes: [number, number, number, number, string][] }[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    let pictures = 0
    let boxes: [number, number, number, number, string][] = []
    if (i <= 200) boxes = await pageBoxes(await doc.getPage(i)).catch(() => [])
    if (i <= 200) {
      const ops = await (await doc.getPage(i)).getOperatorList().catch(() => null)
      pictures = ops ? ops.fnArray.filter((f) => f === pdfjs.OPS.paintImageXObject || f === pdfjs.OPS.paintInlineImageXObject).length : 0
    }
    out.push({ n: i, text: pages[i - 1] ?? '', pictures, boxes })
  }
  await doc.cleanup().catch(() => {})
  return JSON.stringify(out)
}

/** Lines of text on a page with where they sit: [x, y, w, h] as fractions of the page, and the line's text (pieces on
 *  the same baseline and close together are one line). For the study board's rings. */
async function pageBoxes(page: import('pdfjs-dist').PDFPageProxy): Promise<[number, number, number, number, string][]> {
  const vp = page.getViewport({ scale: 1 })
  const W = vp.width
  const H = vp.height
  const tc = await page.getTextContent()
  type Piece = { x: number; y: number; w: number; h: number; s: string }
  const pieces: Piece[] = []
  for (const it of tc.items as { str?: string; transform?: number[]; width?: number; height?: number }[]) {
    if (!it.str?.trim() || !it.transform) continue
    const [, , , d, e, f] = it.transform
    const h = Math.abs(it.height || d || 10)
    pieces.push({ x: e, y: H - f - h, w: it.width ?? 0, h, s: it.str })
  }
  pieces.sort((a, b) => a.y - b.y || a.x - b.x)
  const lines: Piece[] = []
  for (const p of pieces) {
    const l = lines.find((q) => Math.abs(q.y - p.y) < Math.max(3, p.h * 0.4) && p.x - (q.x + q.w) < p.h * 2.5 && p.x >= q.x - 2)
    if (l) {
      l.s += (/\s$/.test(l.s) || /^\s/.test(p.s) ? '' : ' ') + p.s
      const right = Math.max(l.x + l.w, p.x + p.w)
      l.h = Math.max(l.h, p.h)
      l.w = right - l.x
    } else lines.push({ ...p })
  }
  const r = (v: number): number => Math.round(v * 10000) / 10000
  return lines.slice(0, 60).map((l) => [r(l.x / W), r(l.y / H), r(l.w / W), r(l.h / H), l.s.trim().slice(0, 160)])
}

// The lesson's PDF stays open while its pages are drawn (opening a big one again for every page was slow).
const docs = new Map<string, Promise<import('pdfjs-dist').PDFDocumentProxy>>()
function openKept(key: string | undefined, data: Uint8Array): Promise<import('pdfjs-dist').PDFDocumentProxy> {
  if (!key) return open(data)
  let d = docs.get(key)
  if (!d) {
    for (const [k, v] of docs) if (docs.size >= 2) {
      docs.delete(k)
      void v.then((x) => x.cleanup()).catch(() => {})
    }
    d = open(data)
    d.catch(() => docs.delete(key))
    docs.set(key, d)
  }
  return d
}

/** Page n drawn as a JPEG data URL, about `width` pixels wide. */
export async function lessonPdfPage(data: Uint8Array, n: number, width = 1280, key?: string): Promise<string> {
  const doc = await openKept(key, data)
  try {
    const page = await doc.getPage(Math.max(1, Math.min(doc.numPages, n)))
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: width / base.width })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    // 'print': drawn straight through. The usual way waits on the screen's refresh, which Windows pauses for a window
    // in the background (Studyhall behind Edge): pages took a minute or never came.
    await page.render({ canvasContext: ctx, canvas, viewport, intent: 'print' }).promise
    page.cleanup()
    return canvas.toDataURL('image/jpeg', 0.8)
  } finally {
    if (!key) await doc.cleanup().catch(() => {})
  }
}
