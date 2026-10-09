// The secret DevKit category: type FCDEVKIT anywhere in the app to unlock it.
// Unlocking is saved on the profile, so it carries over to your other PCs.

import { useEffect, useRef, useState } from 'react'
import { api, notifyChanged, track } from '@/lib/data'
import { navigate } from '@/lib/nav'
import { enabledModes } from '@/lib/profile'

const CODE = 'FCDEVKIT'

export function DevKitUnlock(): React.JSX.Element | null {
  const buffer = useRef('')
  const [show, setShow] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.altKey || e.metaKey || e.key.length !== 1) return
      buffer.current = (buffer.current + e.key.toUpperCase()).slice(-CODE.length)
      if (buffer.current !== CODE) return
      buffer.current = ''
      void unlock()
    }
    const unlock = async (): Promise<void> => {
      const p = await api.profile.get()
      const modes = enabledModes(p)
      await track(api.profile.update({ devkit: 1, enabled_modes: JSON.stringify(modes.includes('dev') ? modes : [...modes, 'dev']), mode: 'dev' }))
      notifyChanged('*')
      setShow(true)
      navigate({ name: 'briefing' })
      if (await api.feeds.seedDefaults()) void api.feeds.refresh()
      setTimeout(() => setShow(false), 3200)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  if (!show) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="rounded-2xl border border-cyan-400/40 bg-[#05080f] px-10 py-8 font-mono text-cyan-300 shadow-[0_0_80px_-10px_rgba(34,211,238,0.6)]" style={{ animation: 'devkit-in 0.5s ease-out' }}>
        <div className="text-xs text-cyan-500/80">&gt; auth --key ********</div>
        <div className="mt-2 text-2xl font-bold tracking-widest">ACCESS GRANTED</div>
        <div className="mt-1 text-sm text-lime-300">DevKit unlocked — feeds, codex, forecasts &amp; your projects.</div>
        <div className="mt-3 h-1 overflow-hidden rounded bg-cyan-950">
          <div className="h-full bg-gradient-to-r from-cyan-400 to-lime-300" style={{ animation: 'devkit-bar 2.6s ease-out forwards' }} />
        </div>
      </div>
    </div>
  )
}
