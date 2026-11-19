// The pen on Nova's layer. The drawing itself is Roamies' Windows pen (roamies/pen.js), fed with your cursor's trail by
// Studyhall while you hold the talk keys (or after Ctrl+Alt+B), so it never depends on this layer getting the mouse.
// This only covers the screen while the pen is on, so a click doesn't land in the app underneath, and right-click
// takes the last mark back (Esc cancels them all).

import { useEffect, useState } from 'react'
import { api } from '@/lib/data'

export function NovaPen(): React.JSX.Element | null {
  const [on, setOn] = useState(false)
  useEffect(() => api.bauer.onPen((p) => setOn(p.on)), [])
  if (!on) return null
  return (
    <div
      className="fixed inset-0"
      style={{ zIndex: 5, cursor: 'crosshair' }}
      onContextMenu={(e) => e.preventDefault()} // (right-click undoes the last mark: Studyhall hears it from the key helper)
    />
  )
}
