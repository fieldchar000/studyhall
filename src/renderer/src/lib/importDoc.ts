// Turns documents into note content (or plain text for quiz generation), on this PC:
//  .docx (via the main process), .pptx / .odt / .odp (unzipped here), .pdf (pdf.js),
//  .html, .md, .txt. Old .doc / .ppt / .rtf are converted to .docx / .pptx first.

import { generateJSON } from '@tiptap/core'
import type { PickedDoc } from '@shared/types'
import { api } from './data'
import { NOTE_EXTENSIONS } from './noteSchema'

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const xml = (s: string): Document => new DOMParser().parseFromString(s, 'application/xml')
const titleOf = (name: string): string => name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || 'Imported'

// ---------- PowerPoint ----------

const MEDIA_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp' }

async function pptx(data: Uint8Array, withImages: boolean): Promise<{ html: string; text: string }> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(data)
  const slides = Object.keys(zip.files)
    .map((f) => /^ppt\/slides\/slide(\d+)\.xml$/.exec(f))
    .filter((m): m is RegExpExecArray => !!m)
    .sort((a, b) => Number(a[1]) - Number(b[1]))
  const html: string[] = []
  const text: string[] = []
  for (const [path, n] of slides) {
    const doc = xml(await zip.file(path)!.async('string'))
    const relsFile = zip.file(`ppt/slides/_rels/slide${n}.xml.rels`)
    const rels = new Map<string, { target: string; type: string }>()
    if (relsFile) {
      for (const r of Array.from(xml(await relsFile.async('string')).getElementsByTagName('Relationship'))) {
        rels.set(r.getAttribute('Id') ?? '', { target: r.getAttribute('Target') ?? '', type: r.getAttribute('Type') ?? '' })
      }
    }
    let title = ''
    const body: string[] = []
    // Shapes in document order: text boxes and pictures
    const tree = doc.getElementsByTagName('p:spTree')[0]
    const walk = async (el: Element): Promise<void> => {
      for (const child of Array.from(el.children)) {
        if (child.tagName === 'p:sp') {
          const ph = child.getElementsByTagName('p:ph')[0]
          const isTitle = !!ph && /title/i.test(ph.getAttribute('type') ?? '')
          const paras = Array.from(child.getElementsByTagName('a:p'))
            .map((p) => ({
              text: Array.from(p.getElementsByTagName('a:t'))
                .map((t) => t.textContent ?? '')
                .join('')
                .trim(),
              level: Number(p.getElementsByTagName('a:pPr')[0]?.getAttribute('lvl') ?? 0)
            }))
            .filter((p) => p.text)
          if (!paras.length) continue
          if (isTitle && !title) title = paras.map((p) => p.text).join(' ')
          else if (paras.length === 1 && !ph) body.push(`<p>${esc(paras[0].text)}</p>`)
          else body.push(`<ul>${paras.map((p) => `<li>${p.level > 0 ? '&nbsp;&nbsp;'.repeat(p.level) : ''}${esc(p.text)}</li>`).join('')}</ul>`)
          text.push(...paras.map((p) => p.text))
        } else if (child.tagName === 'p:pic' && withImages) {
          const id = child.getElementsByTagName('a:blip')[0]?.getAttribute('r:embed') ?? ''
          const target = rels.get(id)?.target ?? ''
          const file = zip.file(`ppt/${target.replace(/^\.\.\//, '')}`)
          const ext = target.split('.').pop()?.toLowerCase() ?? ''
          if (file && MEDIA_TYPES[ext]) body.push(`<img src="data:${MEDIA_TYPES[ext]};base64,${await file.async('base64')}">`)
        } else if (child.tagName === 'p:grpSp') await walk(child)
      }
    }
    if (tree) await walk(tree)
    // Speaker notes
    let notes = ''
    for (const r of rels.values()) {
      if (!r.type.endsWith('/notesSlide')) continue
      const nf = zip.file(`ppt/${r.target.replace(/^\.\.\//, '')}`)
      if (!nf) continue
      const nd = xml(await nf.async('string'))
      notes = Array.from(nd.getElementsByTagName('p:sp'))
        .filter((sp) => (sp.getElementsByTagName('p:ph')[0]?.getAttribute('type') ?? '') === 'body')
        .flatMap((sp) => Array.from(sp.getElementsByTagName('a:p')).map((p) => Array.from(p.getElementsByTagName('a:t')).map((t) => t.textContent).join('')))
        .filter(Boolean)
        .join(' ')
    }
    html.push(`<h2>${esc(title || `Slide ${n}`)}</h2>`, ...body)
    if (notes) {
      html.push(`<blockquote><p>${esc(notes)}</p></blockquote>`)
      text.push(notes)
    }
  }
  return { html: html.join('\n'), text: text.join('\n') }
}

// ---------- OpenDocument (.odt / .odp) ----------

async function odf(data: Uint8Array): Promise<{ html: string; text: string }> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(data)
  const doc = xml((await zip.file('content.xml')?.async('string')) ?? '<x/>')
  const html: string[] = []
  const text: string[] = []
  const all = doc.getElementsByTagName('*')
  for (const el of Array.from(all)) {
    if (el.tagName === 'text:h' || el.tagName === 'text:p') {
      // skip paragraphs nested in another paragraph (rare) to avoid duplicates
      if (el.parentElement?.tagName === 'text:p') continue
      const t = (el.textContent ?? '').trim()
      if (!t) continue
      text.push(t)
      html.push(el.tagName === 'text:h' ? `<h2>${esc(t)}</h2>` : el.parentElement?.tagName === 'text:list-item' ? `<ul><li>${esc(t)}</li></ul>` : `<p>${esc(t)}</p>`)
    }
  }
  return { html: html.join('\n'), text: text.join('\n') }
}

// ---------- PDF ----------

async function pdfText(data: Uint8Array): Promise<{ pages: string[] }> {
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const task = pdfjs.getDocument({ data: data.slice() })
  const doc = await task.promise
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    // Rebuild lines from text runs (same baseline = same line).
    const lines: { y: number; x: number; s: string }[] = []
    for (const item of content.items) {
      if (!('str' in item) || !item.str) continue
      const y = Math.round(item.transform[5])
      const x = item.transform[4]
      const line = lines.find((l) => Math.abs(l.y - y) <= 2)
      if (line) {
        line.s += (x > line.x + 1 && !line.s.endsWith(' ') && !item.str.startsWith(' ') ? ' ' : '') + item.str
        line.x = x + item.width
      } else lines.push({ y, x: x + item.width, s: item.str })
    }
    lines.sort((a, b) => b.y - a.y)
    pages.push(
      lines
        .map((l) => l.s.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join('\n')
    )
  }
  await task.destroy() // frees the worker
  return { pages }
}

function linesToHtml(text: string): string {
  // Join wrapped lines into paragraphs; keep bullets and short heading-like lines separate.
  const out: string[] = []
  let para: string[] = []
  const flush = (): void => {
    if (para.length) out.push(`<p>${esc(para.join(' '))}</p>`)
    para = []
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) {
      flush()
      continue
    }
    if (/^[•●▪◦\-–*]\s+/.test(line)) {
      flush()
      out.push(`<ul><li>${esc(line.replace(/^[•●▪◦\-–*]\s+/, ''))}</li></ul>`)
    } else if (line.length < 60 && !/[.,;:]$/.test(line) && para.length === 0) {
      out.push(`<p><strong>${esc(line)}</strong></p>`)
    } else {
      para.push(line)
      if (/[.!?:]$/.test(line)) flush()
    }
  }
  flush()
  return out.join('\n')
}

// ---------- HTML clean-up ----------

/** Remove anything active; keep only images that are embedded (data:). */
function cleanHtml(html: string): { html: string; text: string; title: string } {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script,style,iframe,object,embed,link,meta,form,input,button,noscript,svg,video,audio,canvas').forEach((e) => e.remove())
  doc.querySelectorAll('img').forEach((img) => {
    if (!(img.getAttribute('src') ?? '').startsWith('data:image/')) img.remove()
  })
  doc.querySelectorAll('*').forEach((el) => {
    for (const a of Array.from(el.attributes)) if (a.name.startsWith('on') || a.name === 'style') el.removeAttribute(a.name)
    if (el.tagName === 'A' && !/^https?:|^mailto:/i.test(el.getAttribute('href') ?? '')) el.removeAttribute('href')
  })
  const title = doc.querySelector('title')?.textContent?.trim() || doc.querySelector('h1')?.textContent?.trim() || ''
  return { html: doc.body.innerHTML, text: doc.body.textContent ?? '', title }
}

/** data: URL → Blob without fetch() (the app's security policy doesn't allow fetching data: URLs). */
function dataUrlToBlob(src: string): Blob {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(src)
  if (!m) throw new Error('not a data URL')
  if (!m[2]) return new Blob([decodeURIComponent(m[3])], { type: m[1] })
  const bin = atob(m[3])
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: m[1] })
}

/** Shrink embedded images (max 1000px, JPEG) so notes stay small enough to sync. */
async function shrinkImages(html: string, budget = 4_000_000): Promise<{ html: string; skipped: number }> {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  let used = 0
  let skipped = 0
  for (const img of Array.from(doc.querySelectorAll('img'))) {
    const src = img.getAttribute('src') ?? ''
    try {
      const blob = dataUrlToBlob(src)
      if (blob.size < 1500) {
        img.remove() // bullets, tiny icons
        continue
      }
      const bmp = await createImageBitmap(blob)
      const k = Math.min(1, 1000 / Math.max(bmp.width, bmp.height))
      const c = document.createElement('canvas')
      c.width = Math.max(1, Math.round(bmp.width * k))
      c.height = Math.max(1, Math.round(bmp.height * k))
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.drawImage(bmp, 0, 0, c.width, c.height)
      const out = c.toDataURL('image/jpeg', 0.75)
      if (used + out.length > budget) {
        img.remove()
        skipped++
        continue
      }
      used += out.length
      img.setAttribute('src', out)
    } catch {
      img.remove() // a format the browser can't draw (EMF/WMF/TIFF)
      skipped++
    }
  }
  return { html: doc.body.innerHTML, skipped }
}

// ---------- Public ----------

export interface ImportedNote {
  title: string
  content: string // TipTap JSON
  plain: string
  skippedImages: number
}

/** A document as cleaned HTML (headings, lists, paragraphs) — for notes and mindmaps. */
export async function docToHtml(d: PickedDoc, withImages = true): Promise<{ title: string; html: string; text: string }> {
  let html = ''
  let title = titleOf(d.name)
  const text = new TextDecoder()
  switch (d.ext) {
    case 'docx':
      html = await api.docs.docxToHtml(d.data)
      break
    case 'pptx':
      html = (await pptx(d.data, withImages)).html
      break
    case 'odt':
    case 'odp':
      html = (await odf(d.data)).html
      break
    case 'pdf': {
      const { pages } = await pdfText(d.data)
      html = pages.map((p, i) => (pages.length > 1 ? `<h3>Page ${i + 1}</h3>` : '') + linesToHtml(p)).join('\n')
      if (!pages.join('').trim()) html = '<p>(This PDF has no selectable text — it is probably a scan.)</p>'
      break
    }
    case 'html': {
      const c = cleanHtml(text.decode(d.data))
      html = c.html
      if (c.title) title = c.title
      break
    }
    case 'md': {
      const { marked } = await import('marked')
      html = await marked.parse(text.decode(d.data))
      break
    }
    default:
      html = text
        .decode(d.data)
        .split(/\n\s*\n/)
        .map((p) => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`)
        .join('')
  }
  // (a line break after each block so the searchable plain text keeps its lines)
  const clean = cleanHtml(html.replace(/<\/(p|h[1-6]|li|blockquote|tr|div)>/gi, '$&\n'))
  return { title: title.slice(0, 200), html: clean.html, text: clean.text.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim() }
}

export async function docToNote(d: PickedDoc): Promise<ImportedNote> {
  const doc = await docToHtml(d)
  const shrunk = await shrinkImages(doc.html)
  const json = generateJSON(shrunk.html, NOTE_EXTENSIONS)
  return { title: doc.title, content: JSON.stringify(json), plain: doc.text, skippedImages: shrunk.skipped }
}

/** Plain text with line breaks (used to find questions in exam papers). */
export async function docToText(d: PickedDoc): Promise<string> {
  const dec = new TextDecoder()
  switch (d.ext) {
    case 'docx':
      return api.docs.docxToText(d.data)
    case 'pptx':
      return (await pptx(d.data, false)).text
    case 'odt':
    case 'odp':
      return (await odf(d.data)).text
    case 'pdf':
      return (await pdfText(d.data)).pages.join('\n')
    case 'html':
      return new DOMParser().parseFromString(dec.decode(d.data), 'text/html').body.innerText
    default:
      return dec.decode(d.data)
  }
}
