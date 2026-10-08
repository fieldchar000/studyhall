// The quick-capture box (its own small window, opened with the global shortcut).
// Type a thought, press Enter: it lands in the Inbox to sort out later.

import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/data'

export function QuickCapture(): React.JSX.Element {
  const [text, setText] = useState('')
  const [saved, setSaved] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
    return api.app.onCaptureShow(() => {
      setSaved(false)
      input.current?.focus()
      input.current?.select()
    })
  }, [])

  const save = async (): Promise<void> => {
    const t = text.trim()
    if (!t) return api.capture.hide()
    await api.create('inbox_items', { text: t })
    setText('')
    setSaved(true)
    setTimeout(() => api.capture.hide(), 450)
  }

  return (
    <div className="flex h-full items-center gap-3 border border-line bg-panel px-4">
      <span className="text-xl">{saved ? '✅' : '📥'}</span>
      <input
        ref={input}
        className="min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-muted"
        placeholder={saved ? 'Saved to Inbox' : 'Capture a thought, task or link…'}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setSaved(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save()
          if (e.key === 'Escape') api.capture.hide()
        }}
      />
      <span className="shrink-0 text-[11px] text-muted">Enter to save · Esc to close</span>
    </div>
  )
}
