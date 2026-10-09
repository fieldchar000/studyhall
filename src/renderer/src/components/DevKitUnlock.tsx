// The secret DevKit category: type FCDEVKIT anywhere to unlock it, LOCKFCDEVKIT to hide
// it again. Saved on the profile, so it carries over to your other PCs. Locking only hides
// DevKit — your feeds, forecasts, projects and notes stay and come back when unlocked.

import { useEffect, useRef, useState } from 'react'
import { api, notifyChanged, track } from '@/lib/data'
import { navigate } from '@/lib/nav'
import { enabledModes } from '@/lib/profile'

const UNLOCK = 'FCDEVKIT'
const LOCK = 'LOCKFCDEVKIT'

export function DevKitUnlock(): React.JSX.Element | null {
  const buffer = useRef('')
  const [show, setShow] = useState<'unlocked' | 'locked' | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.altKey || e.metaKey || e.key.length !== 1) return
      buffer.current = (buffer.current + e.key.toUpperCase()).slice(-LOCK.length)
      // LOCKFCDEVKIT also ends in FCDEVKIT, so check the longer code first.
      if (buffer.current.endsWith(LOCK)) {
        buffer.current = ''
        void lock()
      } else if (buffer.current.endsWith(UNLOCK)) {
        buffer.current = ''
        void unlock()
      }
    }
    const flash = (s: 'unlocked' | 'locked'): void => {
      setShow(s)
      setTimeout(() => setShow(null), 3000)
    }
    const unlock = async (): Promise<void> => {
      const p = await api.profile.get()
      const modes = enabledModes(p)
      await track(api.profile.update({ devkit: 1, enabled_modes: JSON.stringify(modes.includes('dev') ? modes : [...modes, 'dev']), mode: 'dev' }))
      notifyChanged('*')
      flash('unlocked')
      navigate({ name: 'briefing' })
      if (await api.feeds.seedDefaults()) void api.feeds.refresh()
    }
    const lock = async (): Promise<void> => {
      const p = await api.profile.get()
      const modes = enabledModes(p).filter((m) => m !== 'dev')
      const rest = modes.length ? modes : ['study']
      await track(api.profile.update({ devkit: 0, enabled_modes: JSON.stringify(rest), mode: rest[0] as 'study' }))
      notifyChanged('*')
      flash('locked')
      navigate({ name: 'home' })
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  if (!show) return null
  const locked = show === 'locked'
  return (
    <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div
        className={`rounded-2xl border bg-[#05080f] px-10 py-8 font-mono shadow-[0_0_80px_-10px_rgba(34,211,238,0.6)] ${locked ? 'border-rose-400/40 text-rose-300' : 'border-cyan-400/40 text-cyan-300'}`}
        style={{ animation: 'devkit-in 0.5s ease-out' }}
      >
        <div className={`text-xs ${locked ? 'text-rose-500/80' : 'text-cyan-500/80'}`}>&gt; {locked ? 'devkit --lock' : 'auth --key ********'}</div>
        <div className="mt-2 text-2xl font-bold tracking-widest">{locked ? 'DEVKIT LOCKED' : 'ACCESS GRANTED'}</div>
        <div className={`mt-1 text-sm ${locked ? 'text-rose-200/80' : 'text-lime-300'}`}>
          {locked ? 'Hidden. Your DevKit data is kept — type FCDEVKIT to bring it back.' : 'DevKit unlocked — feeds, codex, forecasts & your projects.'}
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded bg-white/10">
          <div className={`h-full bg-gradient-to-r ${locked ? 'from-rose-400 to-orange-300' : 'from-cyan-400 to-lime-300'}`} style={{ animation: 'devkit-bar 2.6s ease-out forwards' }} />
        </div>
      </div>
    </div>
  )
}
