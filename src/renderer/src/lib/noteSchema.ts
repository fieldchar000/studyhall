// The note document schema, shared by the editor and by document import
// (so imported HTML becomes exactly the nodes the editor understands).

import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { TaskItem, TaskList } from '@tiptap/extension-list'

export const NOTE_EXTENSIONS = [
  StarterKit, // headings, lists, bold/italic/underline, code, quotes, links, undo
  TaskList,
  TaskItem.configure({ nested: true }),
  Image.configure({ allowBase64: true }) // pictures from imported slides and documents
]

/** Searchable plain text of note HTML, one line per block (so headings don't run into the text after them). */
export function htmlToPlain(html: string): string {
  const body = new DOMParser().parseFromString(html, 'text/html').body
  body.querySelectorAll('h1,h2,h3,h4,p,li,blockquote,pre').forEach((el) => el.append('\n'))
  return (body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim()
}
