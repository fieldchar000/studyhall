import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { QuickCapture } from './pages/QuickCapture'
import '@fontsource-variable/instrument-sans'
import '@fontsource/vt323/latin-400.css' // Nova's pixel cards
import '@fontsource/silkscreen/latin-400.css'
import '@fontsource-variable/eb-garamond'
import '@fontsource-variable/eb-garamond/wght-italic.css'
import './index.css'
import './lib/appearance' // theme + accent before the first paint

// The same bundle runs in three windows: the main app, the small quick-capture box,
// and the Bauer voice panel (PC only; its speech engines load only in that window).
const isCapture = location.hash === '#capture'
const isVoice = location.hash === '#voice'
if (isVoice) document.documentElement.classList.add('bauer-voice')
const VoicePanel = lazy(() => import('@/pages/Voice'))
// Bauer on the PC screen: the floating orb, cards beside your work, circle-to-ask.
const screenPart = ['#orb', '#cards', '#circle', '#point'].includes(location.hash) ? location.hash : null
const BauerScreen = lazy(async () => {
  const m = await import('@/pages/BauerScreen')
  return { default: screenPart === '#orb' ? m.OrbWindow : screenPart === '#cards' ? m.CardsWindow : screenPart === '#point' ? m.PointWindow : m.CircleWindow }
})
if (screenPart) document.documentElement.classList.add('bauer-overlay')
if (screenPart === '#cards') {
  // This see-through window catches clicks only while the mouse is over something of Nova's (checked on every move,
  // like Roamies does), so it can never get stuck blocking your screen.
  let hot = false
  const setHot = (h: boolean): void => {
    if (h === hot) return
    hot = h
    window.api.bauer.mouse(h)
    window.api.bauer.inkEvent({ type: 'mouse_trace', line: `mouse ${h ? 'OVER' : 'off'} a card` })
  }
  document.addEventListener('pointerdown', (e) => window.api.bauer.inkEvent({ type: 'mouse_trace', line: `press at ${e.clientX},${e.clientY} on <${(e.target as Element | null)?.tagName?.toLowerCase() ?? '?'}>${(e.target as Element | null)?.closest?.('[data-hot]') ? ' (a card)' : ''}` }), true)
  document.addEventListener('mousemove', (e) => setHot(!!(e.target as Element | null)?.closest?.('[data-hot]')), { passive: true })
  document.addEventListener('mouseleave', () => setHot(false))
  window.addEventListener('blur', () => setHot(false))
}

// The main window reads PDFs for Nova's lesson reader (main/lessonReader.ts), with Studyhall's own PDF library.
if (!screenPart && !isVoice && !isCapture)
  window.api.lesson?.onPdf(async (req) => {
    const { lessonPdfPage, lessonPdfText } = await import('./lib/bauer/pdfLesson')
    return req.op === 'text' ? lessonPdfText(req.data) : lessonPdfPage(req.data, req.n ?? 1, req.width ?? 1280, req.key)
  })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {screenPart ? (
      <Suspense fallback={null}>
        <BauerScreen />
      </Suspense>
    ) : isVoice ? (
      <Suspense fallback={null}>
        <VoicePanel />
      </Suspense>
    ) : isCapture ? (
      <QuickCapture />
    ) : (
      <App />
    )}
  </StrictMode>
)
