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
  const out: { n: number; text: string; pictures: number }[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    let pictures = 0
    if (i <= 200) {
      const ops = await (await doc.getPage(i)).getOperatorList().catch(() => null)
      pictures = ops ? ops.fnArray.filter((f) => f === pdfjs.OPS.paintImageXObject || f === pdfjs.OPS.paintInlineImageXObject).length : 0
    }
    out.push({ n: i, text: pages[i - 1] ?? '', pictures })
  }
  await doc.cleanup().catch(() => {})
  return JSON.stringify(out)
}

/** Page n drawn as a JPEG data URL, about `width` pixels wide. */
export async function lessonPdfPage(data: Uint8Array, n: number, width = 1280): Promise<string> {
  const doc = await open(data)
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
    await page.render({ canvasContext: ctx, canvas, viewport }).promise
    return canvas.toDataURL('image/jpeg', 0.8)
  } finally {
    await doc.cleanup().catch(() => {})
  }
}
