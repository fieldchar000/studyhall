// Opening course materials inside the app: PDFs in Chromium's viewer, HTML in a locked-down
// sandbox, and Word / PowerPoint / Markdown / text converted to a clean reading view.

import { useEffect, useState } from 'react'
import { generateHTML, generateJSON } from '@tiptap/core'
import type { Material } from '@shared/types'
import { Icon, Modal } from '@/components/ui'
import { api } from '@/lib/data'
import { docToHtml, docToNote } from '@/lib/importDoc'
import { NOTE_EXTENSIONS } from '@/lib/noteSchema'
import { navigate } from '@/lib/nav'

export const extOf = (fileName: string): string => /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase() ?? ''

const DOC_EXTS = new Set(['docx', 'doc', 'pptx', 'ppt', 'odt', 'odp', 'md', 'markdown', 'txt', 'rtf'])

export type FileType = {
  label: string
  cls: string
  view: 'frame' | 'doc' | 'external'
}

/** Label, colour and how to open a file, from its extension. */
export function fileType(m: Pick<Material, 'kind' | 'file_name'>): FileType {
  const ext = extOf(m.file_name)
  if (m.kind === 'pdf')
    return {
      label: 'PDF',
      cls: 'bg-red-500/15 text-red-600 dark:text-red-400',
      view: 'frame'
    }
  if (m.kind === 'html')
    return {
      label: 'Web',
      cls: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
      view: 'frame'
    }
  if (['ppt', 'pptx', 'odp', 'pps', 'ppsx', 'key'].includes(ext))
    return {
      label: 'Slides',
      cls: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
      view: DOC_EXTS.has(ext) ? 'doc' : 'external'
    }
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext))
    return {
      label: 'Word',
      cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
      view: 'doc'
    }
  if (['md', 'markdown', 'txt'].includes(ext))
    return {
      label: 'Text',
      cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
      view: 'doc'
    }
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext))
    return {
      label: 'Sheet',
      cls: 'bg-green-500/15 text-green-700 dark:text-green-400',
      view: 'external'
    }
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext))
    return {
      label: 'Image',
      cls: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
      view: 'external'
    }
  return {
    label: ext ? ext.toUpperCase().slice(0, 5) : 'File',
    cls: 'bg-slate-500/15 text-slate-600 dark:text-slate-400',
    view: 'external'
  }
}

/** Open a material the best way available: in the app if we can show it, otherwise in its own app. */
export function openMaterial(m: Material, show: (m: Material) => void): void {
  if (fileType(m).view === 'external') void api.materials.openExternal(m.id).catch((e) => alert(`Couldn't open the file: ${e.message}`))
  else show(m)
}

export function MaterialViewer({ material: m, onClose }: { material: Material; onClose: () => void }): React.JSX.Element {
  const type = fileType(m)
  const src = `material://local/${m.id}/${encodeURIComponent(m.file_name)}`
  const [doc, setDoc] = useState<{ html: string } | { error: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (type.view !== 'doc') return
    let live = true
    void (async () => {
      try {
        const d = await api.materials.read(m.id)
        if (!d) throw new Error('This file can’t be shown here.')
        const { html } = await docToHtml(d)
        // Round-trip through the note schema: keeps headings, lists, tables and images, drops anything else.
        const clean = generateHTML(generateJSON(html, NOTE_EXTENSIONS), NOTE_EXTENSIONS)
        if (live) setDoc({ html: clean })
      } catch (e) {
        if (live) setDoc({ error: (e as Error).message })
      }
    })()
    return () => {
      live = false
    }
  }, [m.id, type.view])

  /** Keep an editable copy as a note, filed in the same module and week. */
  const saveAsNote = async (): Promise<void> => {
    setSaving(true)
    try {
      const d = await api.materials.read(m.id)
      if (!d) return
      const n = await docToNote(d)
      const note = await api.create('notes', {
        mode: 'study',
        title: m.title,
        content: n.content,
        plain_text: n.plain,
        module_id: m.module_id,
        week_id: m.week_id
      })
      onClose()
      navigate({ name: 'notes', id: note.id })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      wide
      title={m.title}
      onClose={onClose}
      actions={
        <>
          {type.view === 'doc' && (
            <button className="btn-ghost" disabled={saving} onClick={() => void saveAsNote()} title="Make an editable note from this file">
              <Icon name="note" /> {saving ? 'Saving…' : 'Save as note'}
            </button>
          )}
          <button className="btn-ghost" onClick={() => void api.materials.openExternal(m.id)}>
            <Icon name="external" /> Open in its app
          </button>
        </>
      }
    >
      {type.view === 'doc' ? (
        <div className="min-h-0 flex-1 overflow-auto">
          {!doc ? (
            <p className="p-8 text-center text-sm text-muted">Opening…</p>
          ) : 'error' in doc ? (
            <p className="p-8 text-center text-sm text-muted">{doc.error}</p>
          ) : (
            <article className="reader mx-auto max-w-3xl px-8 py-6" dangerouslySetInnerHTML={{ __html: doc.html }} />
          )}
        </div>
      ) : m.kind === 'html' ? (
        // allow-scripts only: no same-origin, no popups, no top navigation, no forms.
        // The file is also served with a CSP that blocks all network access.
        <iframe title={m.title} src={src} sandbox="allow-scripts" className="h-full w-full bg-white" />
      ) : (
        <iframe title={m.title} src={src} className="h-full w-full" />
      )}
    </Modal>
  )
}
