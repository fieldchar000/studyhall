import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { QuickCapture } from './pages/QuickCapture'
import '@fontsource-variable/instrument-sans'
import '@fontsource-variable/eb-garamond'
import '@fontsource-variable/eb-garamond/wght-italic.css'
import './index.css'
import './lib/appearance' // theme + accent before the first paint

// The same bundle runs in three windows: the main app, the small quick-capture box,
// and the Bauer voice panel (PC only; its speech engines load only in that window).
const isCapture = location.hash === '#capture'
const isVoice = location.hash === '#voice'
const VoicePanel = lazy(() => import('@/pages/Voice'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isVoice ? (
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
