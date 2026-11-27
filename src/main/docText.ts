// The words in a course file, for making recall questions: a slide deck's slides (from the .pptx itself, no
// PowerPoint needed), a Word document's text, or a PDF's pages. Pictures are left out.
import JSZip from 'jszip'
import mammoth from 'mammoth'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { pdfPagesText } from './lessonReader'

const unxml = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')

/** The text, with "Slide n:" or "Page n:" before each part; '' when it can't be read. */
export async function docText(path: string, max = 60_000): Promise<string> {
  const ext = extname(path).toLowerCase()
  try {
    const data = await readFile(path)
    if (ext === '.pptx') {
      const zip = await JSZip.loadAsync(data)
      const slides = Object.keys(zip.files)
        .map((f) => [f, Number(/^ppt\/slides\/slide(\d+)\.xml$/.exec(f)?.[1])] as const)
        .filter(([, n]) => n > 0)
        .sort((a, b) => a[1] - b[1])
      const parts: string[] = []
      for (const [f, n] of slides) {
        const xml = await zip.file(f)!.async('string')
        // (each paragraph on its line: the runs in it joined)
        const paras = xml
          .split(/<\/a:p>/)
          .map((p) => [...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => unxml(m[1])).join(''))
          .map((t) => t.trim())
          .filter(Boolean)
        // Speaker notes, when there are any.
        const notesXml = await zip.file(`ppt/notesSlides/notesSlide${n}.xml`)?.async('string')
        const notes = notesXml
          ? [...notesXml.matchAll(/<a:t>([^<]*)<\/a:t>/g)]
              .map((m) => unxml(m[1]))
              .join(' ')
              .replace(/\s+/g, ' ')
              .trim()
          : ''
        if (paras.length || notes) parts.push(`Slide ${n}:\n${paras.join('\n')}${notes && !/^\d+$/.test(notes) ? `\n(Notes: ${notes.slice(0, 600)})` : ''}`)
      }
      return parts.join('\n\n').slice(0, max)
    }
    if (ext === '.docx') return (await mammoth.extractRawText({ buffer: data })).value.slice(0, max)
    if (ext === '.pdf')
      return (await pdfPagesText(new Uint8Array(data)))
        .map((t, i) => `Page ${i + 1}:\n${t.trim()}`)
        .filter((t) => t.length > 10)
        .join('\n\n')
        .slice(0, max)
  } catch (e) {
    console.warn('docText:', path, e instanceof Error ? e.message : e)
  }
  return ''
}
