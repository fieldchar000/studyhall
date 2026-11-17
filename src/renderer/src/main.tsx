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
