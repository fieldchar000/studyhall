// The pen on Nova's layer: while it's on (you hold the talk keys, or after Ctrl+Alt+B), dragging draws glowing blue
// marks over your live screen to show Nova what you mean. When it goes off (or after one circle with Ctrl+Alt+B) the
// box around the marks goes to Nova and the marks fade. Right-click cancels.

import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/data'

type Box = { x0: number; y0: number; x1: number; y1: number }

export function NovaPen(): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [mode, setMode] = useState<{ on: boolean; once: boolean }>({ on: false, once: false })
  const [fading, setFading] = useState(false)
  const box = useRef<Box | null>(null)
  const sent = useRef(false)
  const drawing = useRef<{ x: number; y: number } | null>(null)

  const clear = (): void => {
    const c = canvas.current
    c?.getContext('2d')?.clearRect(0, 0, c.width, c.height)
  }
  const send = (): void => {
    if (sent.current) return
    sent.current = true
    const b = box.current
    api.bauer.penDone(b ? { x: b.x0, y: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0 } : null)
    // The marks fade away (Nova rings what you circled instead).
    setFading(true)
    setTimeout(() => {
      clear()
      setFading(false)
    }, 1300)
  }

  useEffect(
    () =>
      api.bauer.onPen((p) => {
        setMode(p)
        if (p.on) {
          const c = canvas.current
          if (c) {
            const dpr = window.devicePixelRatio || 1
            c.width = Math.round(innerWidth * dpr)
            c.height = Math.round(innerHeight * dpr)
            c.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0)
          }
          clear()
          setFading(false)
          box.current = null
          sent.current = false
        } else if (!sent.current) send()
      }),
    []
  )

  const down = (e: React.PointerEvent): void => {
    if (e.button !== 0) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drawing.current = { x: e.clientX, y: e.clientY }
    grow(e.clientX, e.clientY)
  }
  const grow = (x: number, y: number): void => {
    const b = box.current
    box.current = b ? { x0: Math.min(b.x0, x), y0: Math.min(b.y0, y), x1: Math.max(b.x1, x), y1: Math.max(b.y1, y) } : { x0: x, y0: y, x1: x, y1: y }
  }
  const move = (e: React.PointerEvent): void => {
    const from = drawing.current
    const ctx = canvas.current?.getContext('2d')
    if (!from || !ctx) return
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    // A dark edge so it reads on white pages, then the glowing light-blue line.
    for (const [w, colour, blur] of [
      [7, 'rgba(8, 22, 51, 0.55)', 0],
      [4, '#a8c8ff', 12]
    ] as const) {
      ctx.lineWidth = w
      ctx.strokeStyle = colour
      ctx.shadowColor = '#4f86f0'
      ctx.shadowBlur = blur
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(e.clientX, e.clientY)
      ctx.stroke()
    }
    drawing.current = { x: e.clientX, y: e.clientY }
    grow(e.clientX, e.clientY)
  }
  const up = (): void => {
    if (!drawing.current) return
    drawing.current = null
    if (mode.once) send() // Ctrl+Alt+B: one circle, then ask
  }

  return (
    <canvas
      ref={canvas}
      className="fixed inset-0"
      style={{
        width: '100vw',
        height: '100vh',
        zIndex: 5,
        pointerEvents: mode.on ? 'auto' : 'none',
        cursor: mode.on ? 'crosshair' : 'default',
        opacity: fading ? 0 : 1,
        transition: fading ? 'opacity 1.2s ease' : 'none'
      }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onContextMenu={(e) => {
        e.preventDefault()
        if (mode.on) {
          sent.current = true
          clear()
          api.bauer.penCancel()
        }
      }}
    />
  )
}
