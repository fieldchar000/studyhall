// Opening course materials inside the app: PDFs in Chromium's viewer, HTML in a locked-down
// sandbox, and Word / PowerPoint / Markdown / text converted to a clean reading view.

import { useEffect, useRef, useState } from 'react'
import { generateHTML, generateJSON } from '@tiptap/core'
import type { Material } from '@shared/types'
import { Icon, Modal } from '@/components/ui'
import { api } from '@/lib/data'
import { docToHtml, docToNote } from '@/lib/importDoc'
import { NOTE_EXTENSIONS } from '@/lib/noteSchema'
import { navigate } from '@/lib/nav'
import { fileSrc, isPhoneApp } from '@/lib/platform'
import { PdfPages } from './PdfPages'

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
  const src = fileSrc(m.id, m.file_name)
  const slides = type.label === 'Slides'
  // PDFs, web pages and slides open full screen; Word and text files in the reading pane.
  const full = m.kind === 'pdf' || m.kind === 'html' || slides
  const [doc, setDoc] = useState<{ html: string } | { error: string } | null>(null)
  // Slides: the real slides as a PDF (made by PowerPoint/LibreOffice on this PC) when possible.
  const [slidePdf, setSlidePdf] = useState<Uint8Array | 'loading' | 'none'>(slides && !isPhoneApp() ? 'loading' : 'none')
  const [saving, setSaving] = useState(false)
  // PDFs (often lecture slides) can also be shown one page at a time, like presenting.
  const [present, setPresent] = useState(false)

  useEffect(() => {
    if (slidePdf !== 'loading') return
    let live = true
    void api.materials
      .slidesPdf(m.id)
      .catch(() => null)
      .then((pdf) => live && setSlidePdf(pdf ?? 'none'))
    return () => {
      live = false
    }
  }, [m.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const wantsReader = type.view === 'doc' && (!slides || slidePdf === 'none')
  useEffect(() => {
    if (!wantsReader) return
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
  }, [m.id, wantsReader])

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

  const actions = (
    <>
      {type.view === 'doc' && (
        <button className={full ? 'rounded px-2.5 py-1 text-xs hover:bg-white/10' : 'btn-ghost'} disabled={saving} onClick={() => void saveAsNote()} title="Make an editable note from this file">
          <Icon name="note" /> {saving ? 'Saving…' : 'Save as note'}
        </button>
      )}
      {m.kind === 'pdf' && !isPhoneApp() && (
        <button className="rounded px-2.5 py-1 text-xs hover:bg-white/10" onClick={() => setPresent((p) => !p)} title="Show one page at a time, as large as fits (arrow keys to move)">
          <Icon name={present ? 'note' : 'play'} /> {present ? 'Scroll' : 'Present'}
        </button>
      )}
      {!isPhoneApp() && (
        <button className={full ? 'rounded px-2.5 py-1 text-xs hover:bg-white/10' : 'btn-ghost'} onClick={() => void api.materials.openExternal(m.id)}>
          <Icon name="external" /> Open in its app
        </button>
      )}
    </>
  )

  const reader = (
    <div className="min-h-0 flex-1 overflow-auto bg-canvas">
      {!doc ? (
        <p className="p-8 text-center text-sm text-muted">Opening…</p>
      ) : 'error' in doc ? (
        <p className="p-8 text-center text-sm text-muted">{doc.error}</p>
      ) : (
        <article className="reader mx-auto max-w-3xl px-8 py-6" dangerouslySetInnerHTML={{ __html: doc.html }} />
      )}
    </div>
  )

  if (!full) {
    return (
      <Modal wide title={m.title} onClose={onClose} actions={actions}>
        {reader}
      </Modal>
    )
  }

  return (
    <FullScreen title={m.title} onClose={onClose} actions={actions}>
      {slides ? (
        slidePdf === 'loading' ? (
          <p className="m-auto p-8 text-center text-sm text-white/70">Preparing the slides… (the first time, PowerPoint turns them into pages — a few seconds)</p>
        ) : slidePdf === 'none' ? (
          <div className="flex min-h-0 flex-1 flex-col">
            {!isPhoneApp() && (
              <p className="bg-amber-500/15 px-4 py-1.5 text-center text-xs text-amber-200">
                Showing the text and pictures only. Install PowerPoint or the free LibreOffice to see the real slides.
              </p>
            )}
            {reader}
          </div>
        ) : (
          <PdfPages slides load={async () => slidePdf} />
        )
      ) : m.kind === 'html' ? (
        // allow-scripts only: no same-origin, no popups, no top navigation, no forms.
        // The file is also served with a CSP that blocks all network access.
        <iframe title={m.title} src={src} sandbox="allow-scripts" className="h-full w-full flex-1 bg-white" />
      ) : isPhoneApp() || present ? (
        <PdfPages key={present ? 'present' : 'scroll'} slides={present} load={async () => (await api.materials.read(m.id))?.data ?? null} />
      ) : (
        // Fit the page width, thumbnails closed: more room for the page itself.
        <iframe title={m.title} src={`${src}#view=FitH&navpanes=0`} className="h-full w-full flex-1" />
      )}
    </FullScreen>
  )
}

/** A file filling the whole screen (the window goes full screen too); Esc or ✕ closes it. */
function FullScreen({ title, onClose, actions, children }: { title: string; onClose: () => void; actions: React.ReactNode; children: React.ReactNode }): React.JSX.Element {
  const close = useRef(onClose)
  close.current = onClose
  // Once per opening (a new onClose each render must not toggle full screen off and on).
  useEffect(() => {
    if (!isPhoneApp()) void api.app.setFullScreen(true)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (!isPhoneApp()) void api.app.setFullScreen(false)
    }
  }, [])
  return (
    <div data-modal className="fixed inset-0 z-[60] flex flex-col bg-[#111] text-white/90" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-white/10 bg-black/70 px-3">
        <div className="min-w-0 flex-1 truncate text-sm font-medium">{title}</div>
        {actions}
        <button className="flex items-center gap-1 rounded px-2.5 py-1 text-xs hover:bg-white/10" onClick={onClose} title="Close (Esc)">
          <Icon name="x" /> <span className="max-md:hidden">Esc</span>
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  )
}
