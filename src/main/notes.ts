// Notes Nova writes into Studyhall's Notes (a revision sheet, notes from a video): Markdown turned into the
// editor's own format, so they open and edit like any note you wrote.

import { create, getDb, update } from './db'

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
    // A picture on a line of its own (a card Nova drew): ![what](data:image/png;base64,…)
    const img = /^!\[([^\]]*)\]\((data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+)\)$/.exec(line.trim())
    if (img) {
      content.push({ type: 'image', attrs: { src: img[2], alt: img[1], title: img[1] } })
      continue
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line)
    if (h) content.push({ type: 'heading', attrs: { level: h[1].length }, content: inline(h[2]) })
    else content.push({ type: 'paragraph', content: inline(line.trim()) })
  }
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }
}

const plainOf = (md: string): string =>
  md
    .replace(/!\[[^\]]*\]\(data:[^)]+\)/g, '')
    .replace(/[#*_`>]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
export function saveNote(title: string, markdown: string, moduleId?: string | null): { id: string; title: string } {
  const t = title.trim().slice(0, 120) || 'Notes from Nova'
  const row = create<{ id: string; title: string }>('notes', {
    title: t,
    content: JSON.stringify(markdownToDoc(markdown)),
    plain_text: plainOf(markdown).slice(0, 200_000),
    kind: 'note',
    mode: 'study',
    ...(moduleId ? { module_id: moduleId } : {})
  })
  return { id: row.id, title: row.title }
}
/** Adds to the end of a note (the day's "Nova notes" page), keeping what's there. */
export function appendToNote(id: string, markdown: string): void {
  const row = getDb().prepare('SELECT content, plain_text FROM notes WHERE id = ? AND deleted_at IS NULL').get(id) as { content: string; plain_text: string } | undefined
  if (!row) return
  let doc: Node
  try {
    doc = JSON.parse(row.content) as Node
  } catch {
    doc = { type: 'doc', content: [] }
  }
  const more = markdownToDoc(markdown).content ?? []
  update('notes', id, {
    content: JSON.stringify({ ...doc, content: [...(doc.content ?? []), { type: 'horizontalRule' }, ...more] }),
    plain_text: `${row.plain_text}\n\n${plainOf(markdown)}`.slice(0, 200_000)
  })
}
