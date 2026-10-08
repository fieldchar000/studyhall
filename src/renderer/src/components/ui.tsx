// Small shared UI pieces: icons, modal, colour picker, save indicator.

import { useEffect, useState, type ReactNode } from 'react'
import { useSaveState } from '@/lib/data'
import { timeAgo, useCloud } from '@/lib/cloud'

// ---------- Icons (inline SVG, 24x24 stroke icons) ----------

const paths: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  modules: 'M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2zM4 21V5M8 7h6',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  x: 'M6 6l12 12M18 6 6 18',
  back: 'M15 18l-6-6 6-6',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  check: 'M5 12.5 10 17l9-10',
  file: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5',
  chevron: 'M9 6l6 6-6 6',
  tasks: 'M4 5h16v14H4zM8 12l3 3 5-6',
  projects: 'M12 3 3 8l9 5 9-5zM3 13l9 5 9-5',
  clients: 'M4 8h16v11H4zM9 8V5h6v3M4 13h16',
  focus: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.5 2M10 2h4',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  play: 'M7 4.5v15l12-7.5z',
  pause: 'M7 4h3.5v16H7zM13.5 4H17v16h-3.5z',
  skip: 'M5 5v14l9-7zM17 5v14',
  reset: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  note: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5',
  mindmap: 'M12 12m-2.5 0a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0M5 5m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0M19 5m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0M12 20m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0M6.5 6.5l3.6 3.6M17.5 6.5l-3.6 3.6M12 14.5V18',
  cards: 'M7 4h12v14H7zM4 7v13h12',
  grades: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  bold: 'M7 4h6a4 4 0 0 1 0 8H7zM7 12h7a4 4 0 0 1 0 8H7z',
  italic: 'M14 4h-4M14 20h-4M14 4l-4 16',
  list: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  olist: 'M10 6h10M10 12h10M10 18h10M4 4v4M3 18h3l-3 3h3',
  checklist: 'M3 6l2 2 3-3M3 16l2 2 3-3M11 7h10M11 17h10',
  quote: 'M6 17c-2 0-3-1.5-3-4 0-3 2-6 5-7M16 17c-2 0-3-1.5-3-4 0-3 2-6 5-7',
  code: 'M8 7l-5 5 5 5M16 7l5 5-5 5',
  pencil: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  game: 'M6 8h12a4 4 0 0 1 4 4v1a4 4 0 0 1-7 2.6L14 14h-4l-1 1.6A4 4 0 0 1 2 13v-1a4 4 0 0 1 4-4zM7 10.5v3M5.5 12h3M16 11h.01M18 13h.01',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3.5 9h17M3.5 15h17M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z',
  flame: 'M12 21c-4 0-6.5-2.6-6.5-6 0-3.5 2.5-5.5 3.5-8.5 2 1.5 2.5 3.5 2.5 5 1-1 1.5-2.5 1.5-4 2.5 1.5 5.5 4.5 5.5 8 0 3-2.5 5.5-6.5 5.5z',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01'
}

export function Icon({ name, size = 16, className = '' }: { name: string; size?: number; className?: string }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden
    >
      <path d={paths[name]} />
    </svg>
  )
}

// ---------- Modal ----------

export function Modal({
  title,
  onClose,
  children,
  wide = false,
  actions
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  wide?: boolean
  actions?: ReactNode
}): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onMouseDown={onClose}>
      <div
        className={`card flex max-h-full flex-col shadow-2xl ${wide ? 'h-full w-full max-w-6xl' : 'w-full max-w-lg'}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <div className="min-w-0 flex-1 truncate font-semibold">{title}</div>
          {actions}
          <button className="btn-ghost" onClick={onClose} title="Close (Esc)">
            <Icon name="x" />
          </button>
        </div>
        <div className={`min-h-0 flex-1 overflow-auto ${wide ? '' : 'p-4'}`}>{children}</div>
      </div>
    </div>
  )
}

// ---------- Colour picker ----------

export const PALETTE = ['#5b5bd6', '#0ea5e9', '#10b981', '#84cc16', '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#a855f7', '#64748b']

export function ColorPicker({ value, onChange }: { value: string | null; onChange: (c: string) => void }): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          title={c}
          onClick={() => onChange(c)}
          className={`h-6 w-6 rounded-full ring-offset-2 ring-offset-panel ${value === c ? 'ring-2 ring-ink' : ''}`}
          style={{ background: c }}
        />
      ))}
    </div>
  )
}

// ---------- Save indicator ----------

/** Subtle status: "Saving…" while writing, "Saved" briefly after, errors stay visible. */
export function SaveIndicator(): React.JSX.Element {
  const { pending, lastSavedAt, error } = useSaveState()
  const [fresh, setFresh] = useState(false)

  useEffect(() => {
    if (!lastSavedAt) return
    setFresh(true)
    const t = setTimeout(() => setFresh(false), 2000)
    return () => clearTimeout(t)
  }, [lastSavedAt])

  if (error) {
    return (
      <div className="text-xs text-danger" title={error}>
        ⚠ Couldn't save — {error}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-0.5">
      {pending > 0 ? (
        <div className="text-xs text-muted">Saving…</div>
      ) : (
        <div className={`flex items-center gap-1 text-xs transition-colors ${fresh ? 'text-ok' : 'text-muted'}`}>
          <Icon name="check" size={13} />
          {fresh ? 'Saved' : 'All changes saved'}
        </div>
      )}
      <SyncLine />
    </div>
  )
}

/** Cloud sync state under "Saved" (only when signed in). */
function SyncLine(): React.JSX.Element | null {
  const c = useCloud()
  if (!c?.signedIn) return null
  const text: Record<string, [string, string]> = {
    synced: ['Synced', 'text-muted'],
    syncing: ['Syncing…', 'text-muted'],
    offline: ['Offline — will sync later', 'text-amber-600'],
    error: ['Sync problem — see Settings', 'text-danger'],
    off: ['Sync off', 'text-muted']
  }
  const [label, tone] = text[c.sync] ?? text.off
  return (
    <div className={`flex items-center gap-1 text-xs ${tone}`} title={c.error ?? (c.lastSyncAt ? `Last sync ${timeAgo(c.lastSyncAt)}` : '')}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M7 18a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.5 1.5A4 4 0 0 1 17 18z" />
      </svg>
      {label}
      {c.pending > 0 && c.sync !== 'syncing' && <span>· {c.pending} waiting</span>}
    </div>
  )
}
