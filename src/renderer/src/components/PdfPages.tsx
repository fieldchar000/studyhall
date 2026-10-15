// A simple scrolling PDF viewer (pdf.js), for the phone — Android's web view can't show PDFs
// itself. Pages are drawn as they scroll into view, at the width of the screen.

import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'

export function PdfPages({ load }: { load: () => Promise<Uint8Array | null> }): React.JSX.Element {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [error, setError] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    let live = true
    let task: { destroy: () => Promise<void> } | null = null
    void (async () => {
      try {
        const data = await load()
        if (!data) throw new Error('This file isn’t on this device yet. Open Studyhall on the PC it was added on, with Wi-Fi sharing on and both on the same Wi-Fi — or turn on “Sync file” there.')
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

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(Math.max(200, el.clientWidth - 16)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={box} className="h-full min-h-[60vh] w-full overflow-auto bg-line/40 py-2">
      {error ? (
        <p className="p-6 text-center text-sm text-muted">{error}</p>
      ) : !doc || !width ? (
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
