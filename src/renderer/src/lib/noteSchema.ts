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
