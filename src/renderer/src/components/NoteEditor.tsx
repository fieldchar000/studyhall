// Rich-text note editor (TipTap). The document autosaves ~1s after you stop
// typing, when you leave the note, and before the app closes.

import { useCallback, useEffect, useRef } from 'react'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extensions'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import type { Note } from '@shared/types'
import { db, registerFlusher } from '@/lib/data'
import { Icon } from './ui'

function parseContent(raw: string): object | string {
  if (!raw) return ''
  try {
    return JSON.parse(raw)
  } catch {
    return raw // plain text fallback
  }
}

export function NoteEditor({ note, compact = false }: { note: Note; compact?: boolean }): React.JSX.Element {
  const pending = useRef<{ content: string; plain: string } | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current)
    const p = pending.current
    if (!p) return
    pending.current = null
    await db.update('notes', note.id, { content: p.content, plain_text: p.plain })
  }, [note.id])

  const editor = useEditor(
    {
      extensions: [
        StarterKit, // headings, lists, bold/italic/underline, code, quotes, links, undo
        Placeholder.configure({ placeholder: 'Start writing… (# for a heading, - for a list, [] for a checklist)' }),
        TaskList,
        TaskItem.configure({ nested: true })
      ],
      content: parseContent(note.content),
      editorProps: { attributes: { class: 'note-content outline-none' } },
      onUpdate: ({ editor }) => {
        pending.current = { content: JSON.stringify(editor.getJSON()), plain: editor.getText() }
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => void flush(), 1000)
      },
      onBlur: () => void flush()
    },
    [note.id]
  )

  // Save when switching notes, leaving the page, or closing the app.
  useEffect(() => {
    const unregister = registerFlusher(flush)
    return () => {
      unregister()
      void flush()
    }
  }, [flush])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {editor && <Toolbar editor={editor} compact={compact} />}
      <div className={`min-h-0 flex-1 overflow-auto ${compact ? 'px-3 py-2' : 'px-8 py-5'}`} onClick={() => editor?.commands.focus()}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

function Toolbar({ editor, compact }: { editor: Editor; compact: boolean }): React.JSX.Element {
  // Re-render the toolbar when the selection's formatting changes.
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      task: e.isActive('taskList'),
      quote: e.isActive('blockquote'),
      code: e.isActive('codeBlock')
    })
  })
  const c = editor.chain().focus()
  const btn = (active: boolean, title: string, onClick: () => void, content: React.ReactNode): React.JSX.Element => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()} // keep the editor's selection
      onClick={onClick}
      className={`flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-sm ${active ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-line/60 hover:text-ink'}`}
    >
      {content}
    </button>
  )
  return (
    <div className={`flex flex-wrap items-center gap-0.5 border-b border-line ${compact ? 'px-2 py-1' : 'px-6 py-1.5'}`}>
      {btn(s.h1, 'Heading', () => c.toggleHeading({ level: 1 }).run(), <b>H1</b>)}
      {btn(s.h2, 'Subheading', () => c.toggleHeading({ level: 2 }).run(), <b>H2</b>)}
      <span className="mx-1 h-4 w-px bg-line" />
      {btn(s.bold, 'Bold (Ctrl+B)', () => c.toggleBold().run(), <Icon name="bold" size={14} />)}
      {btn(s.italic, 'Italic (Ctrl+I)', () => c.toggleItalic().run(), <Icon name="italic" size={14} />)}
      <span className="mx-1 h-4 w-px bg-line" />
      {btn(s.bullet, 'Bullet list', () => c.toggleBulletList().run(), <Icon name="list" size={15} />)}
      {btn(s.ordered, 'Numbered list', () => c.toggleOrderedList().run(), <Icon name="olist" size={15} />)}
      {btn(s.task, 'Checklist', () => c.toggleTaskList().run(), <Icon name="checklist" size={15} />)}
      {!compact && btn(s.quote, 'Quote', () => c.toggleBlockquote().run(), <Icon name="quote" size={15} />)}
      {!compact && btn(s.code, 'Code block', () => c.toggleCodeBlock().run(), <Icon name="code" size={15} />)}
    </div>
  )
}
