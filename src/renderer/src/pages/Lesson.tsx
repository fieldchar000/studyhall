// Tutor mode's lesson window (main/lessonWindow.ts): their slide, big, on the left; a column on the right that Nova's
// cards go in; the lesson's buttons along the bottom. Nova's rings, arrows and cards are drawn on its see-through layer
// over this window, so this page says where the slides are drawn (lesson.layout) whenever that changes.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { LessonWindowState } from '@shared/types'

const COLUMN = 540 // the card column's width (CSS px): a flow card is about 480 wide
const src = (id: string, n: number): string => `material://slide/${id}/${n}.jpg`

/** Where an image shown with object-fit: contain really is inside its box (CSS px in the window). */
function drawnRect(img: HTMLImageElement | null): number[] | null {
  if (!img || !img.naturalWidth || !img.naturalHeight) return null
  const b = img.getBoundingClientRect()
  const k = Math.min(b.width / img.naturalWidth, b.height / img.naturalHeight)
  const w = img.naturalWidth * k
  const h = img.naturalHeight * k
  return [b.left + (b.width - w) / 2, b.top + (b.height - h) / 2, w, h].map((v) => Math.round(v))
}

export function LessonWindow(): React.JSX.Element {
  const [s, setS] = useState<LessonWindowState | null>(null)
  const main = useRef<HTMLImageElement>(null)
  const side = useRef<HTMLImageElement>(null)
  const column = useRef<HTMLDivElement>(null)
  const top = useRef<HTMLDivElement>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => window.api.lesson.onState((x) => setS(x)), [])
  useEffect(() => {
    document.title = s ? `Lesson · ${s.title}` : 'Lesson'
  }, [s])

  // Tell the drawing where everything is: after each slide loads, and whenever the window changes size.
  const report = useCallback(() => {
    if (!s) return
    const box = (el: HTMLElement | null): number[] | null => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return [r.left, r.top, r.width, r.height].map((v) => Math.round(v))
    }
    const slide = drawnRect(main.current)
    if (!slide) return
    const sideRect = s.beside ? drawnRect(side.current) : null
    if (s.beside && !sideRect) return
    window.api.lesson.layout({ page: s.page, slide, side: sideRect, column: box(column.current), bars: [box(top.current), box(bottom.current)].filter((r): r is number[] => !!r) })
  }, [s])
  useLayoutEffect(() => {
    report()
  }, [report])
  useEffect(() => {
    const ro = new ResizeObserver(() => report())
    if (main.current?.parentElement) ro.observe(main.current.parentElement)
    addEventListener('resize', report)
    return () => {
      ro.disconnect()
      removeEventListener('resize', report)
    }
  }, [report])

  const cmd = (d: 'next' | 'back' | 'pause' | 'end' | 'goto', n?: number): void => window.api.lesson.cmd({ do: d, n })
  const word = s?.kind === 'slides' ? 'Slide' : 'Page'

  return (
    <div className="fixed inset-0 flex flex-col select-none overflow-hidden text-[#dce8ff]" style={{ background: 'radial-gradient(ellipse at 30% 20%, #10224d 0%, #081430 45%, #050b1e 100%)' }}>
      {/* the top line: what's being taught and where we are */}
      <div ref={top} className="flex h-11 shrink-0 items-center gap-3 border-b border-[#a8c8ff]/10 px-5 text-sm">
        <span className="truncate font-medium text-[#e4eeff]">{s?.title ?? 'Getting your lesson ready…'}</span>
        {s && (
          <span className="shrink-0 text-[#8aa4cc]">
            {word} {s.page} of {s.count}
          </span>
        )}
        {s?.paused && <span className="shrink-0 rounded-full bg-[#a8c8ff]/15 px-2.5 py-0.5 text-xs text-[#a8c8ff]">Paused</span>}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* the slides: the one being taught, and an earlier one beside it when Nova links back to it */}
        <div className="flex min-w-0 flex-1 items-stretch gap-4 p-5">
          {s?.beside != null && (
            <div className="relative flex w-[36%] shrink-0 flex-col">
              <span className="mb-2 self-start rounded-full bg-[#a8c8ff]/12 px-2.5 py-0.5 text-xs text-[#a8c8ff]">
                Earlier · {word} {s.beside}
              </span>
              <img ref={side} src={src(s.id, s.beside)} onLoad={report} alt={`${word} ${s.beside}`} className="min-h-0 w-full flex-1 object-contain opacity-90" draggable={false} />
            </div>
          )}
          <div className="relative flex min-w-0 flex-1 flex-col">
            {s?.beside != null && (
              <span className="mb-2 self-start rounded-full bg-[#a8c8ff]/20 px-2.5 py-0.5 text-xs text-[#e4eeff]">
                Now · {word} {s.page}
              </span>
            )}
            {s ? (
              <img
                ref={main}
                key={`${s.id}-${s.page}`}
                src={src(s.id, s.page)}
                onLoad={() => {
                  setMissing(false)
                  report()
                }}
                onError={() => setMissing(true)}
                alt={`${word} ${s.page}`}
                className="min-h-0 w-full flex-1 object-contain drop-shadow-[0_8px_28px_rgba(0,0,0,0.45)]"
                draggable={false}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center text-[#8aa4cc]">Nova is reading your slides…</div>
            )}
            {missing && <div className="absolute inset-0 flex items-center justify-center text-[#8aa4cc]">Drawing this {word.toLowerCase()}…</div>}
          </div>
        </div>
        {/* where Nova's cards go (drawn on its layer over this window) */}
        <div ref={column} className="shrink-0 border-l border-[#a8c8ff]/10 bg-[#a8c8ff]/[0.025]" style={{ width: COLUMN }} />
      </div>

      {/* the lesson's buttons, and the slides seen so far */}
      <div ref={bottom} className="flex h-16 shrink-0 items-center gap-2 border-t border-[#a8c8ff]/10 bg-[#050b1e]/60 px-4 backdrop-blur">
        <button className="rounded-lg px-3 py-2 text-sm text-[#a8c8ff] hover:bg-[#a8c8ff]/10" onClick={() => cmd('back')}>
          ‹ Back
        </button>
        <button className="rounded-lg px-3 py-2 text-sm text-[#a8c8ff] hover:bg-[#a8c8ff]/10" onClick={() => cmd('pause')}>
          {s?.paused ? 'Resume' : 'Pause'}
        </button>
        <button className="rounded-lg bg-[#a8c8ff]/20 px-5 py-2 text-sm font-medium text-[#e4eeff] ring-1 ring-[#a8c8ff]/40 hover:bg-[#a8c8ff]/30" onClick={() => cmd('next')}>
          Next ›
        </button>
        <div className="mx-3 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-1">
          {s?.seen.map((n) => (
            <button
              key={n}
              title={`${word} ${n}`}
              onClick={() => cmd('goto', n)}
              className={`relative h-10 w-16 shrink-0 overflow-hidden rounded border ${n === s.page ? 'border-[#a8c8ff]' : 'border-[#a8c8ff]/15 opacity-70 hover:opacity-100'}`}
            >
              <img src={src(s.id, n)} alt="" className="h-full w-full object-cover" draggable={false} />
              <span className="absolute bottom-0 right-0 bg-[#050b1e]/80 px-1 text-[10px] leading-tight">{n}</span>
            </button>
          ))}
        </div>
        <button className="rounded-lg px-3 py-2 text-sm text-[#8aa4cc] hover:bg-[#ff8a7a]/10 hover:text-[#ffb0a6]" onClick={() => cmd('end')}>
          End lesson
        </button>
      </div>
    </div>
  )
}
