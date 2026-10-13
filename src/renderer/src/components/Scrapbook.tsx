// Scrapbook pieces: polaroid photos (with tape and a caption), an editable photo tray with
// drag-and-drop, and a full-size viewer. Used by the daily journal and shared memories.

import { useRef, useState } from 'react'
import type { Photo } from '@shared/types'
import { AutoText } from './AutoField'
import { Icon, Modal } from './ui'
import { db, track } from '@/lib/data'
import { addPhotos, photoSrc } from '@/lib/photos'

const TILT = [-2.6, 1.8, -1.2, 2.4, -0.6, 1.1]

/** Photos laid out like they were stuck into a book. */
export function Polaroids({ photos, size = 200 }: { photos: Photo[]; size?: number }): React.JSX.Element | null {
  const [open, setOpen] = useState<Photo | null>(null)
  if (!photos.length) return null
  return (
    <>
      <div className="flex flex-wrap gap-x-5 gap-y-6 py-2">
        {photos.map((p, i) => (
          <button
            key={p.id}
            onClick={() => setOpen(p)}
            className="polaroid relative shrink-0 transition-transform hover:z-10 hover:scale-[1.03] hover:rotate-0"
            style={{ width: size, transform: `rotate(${TILT[i % TILT.length]}deg)` }}
            title={p.caption || 'Open photo'}
          >
            <span className="polaroid-tape" aria-hidden />
            <img src={photoSrc(p)} alt={p.caption} loading="lazy" className="aspect-[4/5] w-full object-cover" />
            <span className="font-display block truncate px-1 pt-1.5 text-center text-[15px] italic">{p.caption || ' '}</span>
          </button>
        ))}
      </div>
      {open && (
        <Modal title={open.caption || 'Photo'} onClose={() => setOpen(null)} wide>
          <div className="flex h-full items-center justify-center bg-black/80 p-4">
            <img src={photoSrc(open)} alt={open.caption} className="max-h-full max-w-full object-contain" />
          </div>
        </Modal>
      )}
    </>
  )
}

/** Edit mode: thumbnails with captions, remove, and an "add photos" drop zone. */
export function PhotoTray({ photos, onNeedParent, parentTable }: { photos: Photo[]; parentTable: Photo['parent_table']; onNeedParent: () => Promise<string> }): React.JSX.Element {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const add = async (files: File[]): Promise<void> => {
    if (!files.length) return
    setBusy(true)
    try {
      const id = await onNeedParent()
      await track(addPhotos(files, parentTable, id, photos.length))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div
      className={`flex flex-wrap gap-3 rounded-lg border border-dashed p-3 transition-colors ${over ? 'border-accent bg-accent-soft' : 'border-line'}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          e.stopPropagation()
          setOver(true)
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setOver(false)
        void add([...e.dataTransfer.files])
      }}
    >
      {photos.map((p) => (
        <div key={p.id} className="group relative w-32">
          <img src={photoSrc(p)} alt="" className="aspect-square w-full rounded-md object-cover" />
          <button
            className="absolute top-1 right-1 hidden rounded-full bg-black/60 p-1 text-white group-hover:block"
            title="Remove photo"
            onClick={() => void db.remove('photos', p.id)}
          >
            <Icon name="x" size={12} />
          </button>
          <AutoText value={p.caption} onSave={(v) => db.update('photos', p.id, { caption: v })} placeholder="Caption…" className="field mt-1 text-xs" />
        </div>
      ))}
      <button
        className="flex aspect-square w-32 flex-col items-center justify-center gap-1 rounded-md border border-line bg-panel text-xs text-muted hover:border-brass/60 hover:text-ink"
        onClick={() => input.current?.click()}
        disabled={busy}
      >
        <Icon name="camera" size={22} />
        {busy ? 'Adding…' : photos.length ? 'Add more' : 'Add photos'}
        {!busy && <span className="text-[10px] opacity-70">or drop them here</span>}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          void add([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
    </div>
  )
}
