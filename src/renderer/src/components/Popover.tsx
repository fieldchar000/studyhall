// A small floating panel (menus, pickers) that always stays on screen: it opens below its button,
// or above when there's no room below, and never past the screen's edges. On phones it becomes a
// panel that slides up from the bottom. Clicking outside, Esc or Android's back button closes it.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNarrow } from '@/lib/platform'

export function Popover({
  anchor,
  onClose,
  children,
  className = '',
  align = 'right'
}: {
  /** The element the panel belongs to (usually the button's wrapper). */
  anchor: React.RefObject<HTMLElement | null>
  onClose: () => void
  children: React.ReactNode
  className?: string
  /** Line the panel up with the anchor's right or left edge. */
  align?: 'left' | 'right'
}): React.JSX.Element {
  const narrow = useNarrow()
  const panel = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null)

  // Where to put it: below if it fits, else above, else as much as fits; clamped to the screen.
  const place = (): void => {
    const a = anchor.current?.getBoundingClientRect()
    const p = panel.current
    if (!a || !p) return
    const margin = 8
    const w = p.offsetWidth
    const h = p.scrollHeight
    const below = window.innerHeight - a.bottom - margin
    const above = a.top - margin
    let top: number
    let maxHeight: number
    if (h + 4 <= below) {
      top = a.bottom + 4
      maxHeight = below - 4
    } else if (h + 4 <= above) {
      top = a.top - h - 4
      maxHeight = above - 4
    } else if (below >= above) {
      top = a.bottom + 4
      maxHeight = below - 4
    } else {
      maxHeight = above - 4
      top = margin
    }
    const left = Math.min(Math.max(margin, align === 'right' ? a.right - w : a.left), window.innerWidth - w - margin)
    setPos({ top, left, maxHeight: Math.max(120, maxHeight) })
  }

  useLayoutEffect(() => {
    if (!narrow) place()
  }, [narrow]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onDown = (e: Event): void => {
      const t = e.target as Node
      if (panel.current?.contains(t) || anchor.current?.contains(t)) return
      close.current()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close.current()
    }
    // Android back closes the panel only (caught before the app's own back handling).
    const onBack = (e: Event): void => {
      e.preventDefault()
      e.stopImmediatePropagation()
      close.current()
    }
    const reflow = (): void => {
      if (!narrow) place()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('touchstart', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('studyhall:back', onBack, true)
    window.addEventListener('resize', reflow)
    window.addEventListener('scroll', reflow, true)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('touchstart', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('studyhall:back', onBack, true)
      window.removeEventListener('resize', reflow)
      window.removeEventListener('scroll', reflow, true)
    }
  }, [narrow]) // eslint-disable-line react-hooks/exhaustive-deps

  if (narrow) {
    return createPortal(
      <>
        <div className="fixed inset-0 z-[80] bg-black/40" />
        <div
          ref={panel}
          className={`card fixed inset-x-0 bottom-0 z-[81] flex max-h-[75vh] flex-col overflow-auto rounded-t-2xl rounded-b-none p-3 shadow-2xl ${className}`}
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))', width: 'auto' }}
        >
          <div className="mx-auto mb-2 h-1 w-10 shrink-0 rounded-full bg-line" />
          {children}
        </div>
      </>,
      document.body
    )
  }
  return createPortal(
    <div
      ref={panel}
      className={`card fixed z-[80] flex flex-col overflow-auto shadow-xl ${className}`}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, maxHeight: pos?.maxHeight, visibility: pos ? 'visible' : 'hidden' }}
    >
      {children}
    </div>,
    document.body
  )
}
