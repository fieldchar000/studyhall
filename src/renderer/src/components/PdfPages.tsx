// PDF pages drawn with pdf.js. Two ways to read:
//  • scroll — every page down the screen at its width (the phone's PDF viewer: Android's web view
//    can't show PDFs itself), drawn as pages scroll into view;
//  • slides — one page at a time, as large as fits, like presenting (PowerPoint decks): arrow
//    keys, space, Page Up/Down or a click on either half to move.

import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'

const MISSING = 'This file isn’t on this device yet. Open Studyhall on the PC it was added on, with Wi-Fi sharing on and both on the same Wi-Fi — or turn on “Sync file” there.'

function usePdf(load: () => Promise<Uint8Array | null>): { doc: PDFDocumentProxy | null; error: string | null } {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    let task: { destroy: () => Promise<void> } | null = null
    void (async () => {
      try {
        const data = await load()
        if (!data) throw new Error(MISSING)
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
        const t = pdfjs.getDocument({ data: data.slice() })
        task = t
        const loaded = await t.promise
        if (live) setDoc(loaded)
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      live = false
      void task?.destroy()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return { doc, error }
}

function useBoxSize(): [React.RefObject<HTMLDivElement | null>, { w: number; h: number }] {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [box, size]
}

export function PdfPages({ load, slides = false }: { load: () => Promise<Uint8Array | null>; slides?: boolean }): React.JSX.Element {
  const { doc, error } = usePdf(load)
  return slides ? <SlideView doc={doc} error={error} /> : <ScrollView doc={doc} error={error} />
}

function ScrollView({ doc, error }: { doc: PDFDocumentProxy | null; error: string | null }): React.JSX.Element {
  const [box, size] = useBoxSize()
  const width = Math.max(200, size.w - 16)
  return (
    <div ref={box} className="h-full min-h-[60vh] w-full overflow-auto bg-line/40 py-2">
      {error ? (
        <p className="p-6 text-center text-sm text-muted">{error}</p>
      ) : !doc || !size.w ? (
        <p className="p-6 text-center text-sm text-muted">Opening…</p>
      ) : (
        Array.from({ length: doc.numPages }, (_, i) => <Page key={i} doc={doc} n={i + 1} width={width} />)
      )}
    </div>
  )
}

function Page({ doc, n, width }: { doc: PDFDocumentProxy; n: number; width: number }): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(n <= 2)
  const [height, setHeight] = useState(width * 1.3)

  useEffect(() => {
    const el = canvas.current
    if (!el || visible) return
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setVisible(true), { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [visible])

  useEffect(() => {
    if (!visible) return
    let task: { cancel: () => void } | null = null
    void (async () => {
      const page = await doc.getPage(n)
      const base = page.getViewport({ scale: 1 })
      const ratio = Math.min(2, window.devicePixelRatio || 1)
      const vp = page.getViewport({ scale: (width / base.width) * ratio })
      const c = canvas.current
      if (!c) return
      c.width = vp.width
      c.height = vp.height
      setHeight(vp.height / ratio)
      const r = page.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport: vp })
      task = r
      await r.promise.catch(() => {})
    })()
    return () => task?.cancel()
  }, [visible, width, doc, n])

  return <canvas ref={canvas} className="mx-auto mb-2 block bg-white shadow" style={{ width, height }} />
}

function SlideView({ doc, error }: { doc: PDFDocumentProxy | null; error: string | null }): React.JSX.Element {
  const [box, size] = useBoxSize()
  const [n, setN] = useState(1)
  const canvas = useRef<HTMLCanvasElement>(null)
  const total = doc?.numPages ?? 0
  const go = (d: number): void => setN((x) => Math.min(Math.max(1, x + d), Math.max(1, total)))

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) {
        e.preventDefault()
        go(1)
      } else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) {
        e.preventDefault()
        go(-1)
      } else if (e.key === 'Home') setN(1)
      else if (e.key === 'End') setN(Math.max(1, total))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [total]) // eslint-disable-line react-hooks/exhaustive-deps

  // Draw the current slide as large as fits; warm up the next one.
  useEffect(() => {
    if (!doc || !size.w || !size.h) return
    let task: { cancel: () => void } | null = null
    let live = true
    void (async () => {
      const page = await doc.getPage(n)
      const base = page.getViewport({ scale: 1 })
      const fit = Math.min((size.w - 32) / base.width, (size.h - 32) / base.height)
      const ratio = Math.min(2, window.devicePixelRatio || 1)
      const vp = page.getViewport({ scale: fit * ratio })
      const off = document.createElement('canvas')
      off.width = vp.width
      off.height = vp.height
      const r = page.render({ canvas: off, canvasContext: off.getContext('2d')!, viewport: vp })
      task = r
      await r.promise
      const c = canvas.current
      if (!live || !c) return
      // Pixels and on-screen size change together, so a slide is never shown at the wrong size.
      c.width = off.width
      c.height = off.height
      c.style.width = `${vp.width / ratio}px`
      c.style.height = `${vp.height / ratio}px`
      c.getContext('2d')!.drawImage(off, 0, 0)
      if (n < doc.numPages) void doc.getPage(n + 1)
    })().catch(() => {})
    return () => {
      live = false
      task?.cancel()
    }
  }, [doc, n, size.w, size.h])

  return (
    <div ref={box} className="relative h-full w-full select-none overflow-hidden bg-[#111]">
      {error ? (
        <p className="p-8 text-center text-sm text-white/70">{error}</p>
      ) : !doc ? (
        <p className="p-8 text-center text-sm text-white/70">Opening…</p>
      ) : (
        <>
          <div className="flex h-full w-full items-center justify-center">
            <canvas ref={canvas} className="max-h-full max-w-full bg-white shadow-2xl" />
          </div>
          {/* click the left or right half to move */}
          <button className="absolute inset-y-0 left-0 w-1/3 cursor-w-resize" aria-label="Previous slide" onClick={() => go(-1)} />
          <button className="absolute inset-y-0 right-0 w-2/3 cursor-e-resize" aria-label="Next slide" onClick={() => go(1)} />
          <div className="pointer-events-none absolute right-4 bottom-3 rounded-full bg-black/60 px-3 py-1 text-xs text-white/85 tabular-nums">
            {n} / {total}
          </div>
        </>
      )}
    </div>
  )
}
