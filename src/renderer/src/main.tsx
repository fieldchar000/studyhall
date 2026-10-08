import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { QuickCapture } from './pages/QuickCapture'
import './index.css'

// The same bundle runs in two windows: the main app, and the small quick-capture box.
const isCapture = location.hash === '#capture'

createRoot(document.getElementById('root')!).render(<StrictMode>{isCapture ? <QuickCapture /> : <App />}</StrictMode>)
