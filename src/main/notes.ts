// Notes Nova writes into Studyhall's Notes (a revision sheet, notes from a video): Markdown turned into the
// editor's own format, so they open and edit like any note you wrote.

import { create } from './db'

type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[]; text?: string; marks?: { type: string }[] }

/** **bold** and *italic* inside a line, as editor text with marks. */
function inline(line: string): Node[] {
  const out: Node[] = []
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g
  let at = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(line))) {
    if (m.index > at) out.push({ type: 'text', text: line.slice(at, m.index) })
    const bold = m[0].startsWith('**')
    out.push({ type: 'text', text: m[0].slice(bold ? 2 : 1, bold ? -2 : -1), marks: [{ type: bold ? 'bold' : 'italic' }] })
    at = m.index + m[0].length
  }
  if (at < line.length) out.push({ type: 'text', text: line.slice(at) })
  return out.filter((n) => n.text)
}

export function markdownToDoc(md: string): Node {
  const content: Node[] = []
  let list: Node | null = null
  for (const raw of md.replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd()
    const bullet = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line)
    if (bullet) {
      if (!list) {
        list = { type: /^\s*\d/.test(line) ? 'orderedList' : 'bulletList', content: [] }
        content.push(list)
      }
      list.content!.push({ type: 'listItem', content: [{ type: 'paragraph', content: inline(bullet[1]) }] })
      continue
    }
    list = null
    if (!line.trim()) continue
    const h = /^(#{1,3})\s+(.*)$/.exec(line)
    if (h) content.push({ type: 'heading', attrs: { level: h[1].length }, content: inline(h[2]) })
    else content.push({ type: 'paragraph', content: inline(line.trim()) })
  }
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }
}

export function saveNote(title: string, markdown: string): { id: string; title: string } {
  const t = title.trim().slice(0, 120) || 'Notes from Nova'
  const plain = markdown.replace(/[#*_`>]/g, '').replace(/\n{3,}/g, '\n\n').trim()
  const row = create<{ id: string; title: string }>('notes', { title: t, content: JSON.stringify(markdownToDoc(markdown)), plain_text: plain.slice(0, 200_000), kind: 'note', mode: 'study' })
  return { id: row.id, title: row.title }
}
