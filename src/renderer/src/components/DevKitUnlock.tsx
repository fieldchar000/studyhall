// The secret DevKit category: type FCDEVKIT anywhere to unlock it, LOCKFCDEVKIT to hide
// it again. Saved on the profile, so it carries over to your other PCs. Locking only hides
// DevKit — your feeds, forecasts, projects and notes stay and come back when unlocked.
// Also: OCULUSDEI unlocks the Oculus Dei tab (God's Eye View) on this PC, LOCKOCULUSDEI hides it.

import { useEffect, useRef, useState } from 'react'
import { api, notifyChanged, track } from '@/lib/data'
import { navigate } from '@/lib/nav'
import { enabledModes } from '@/lib/profile'
import { isPhoneApp } from '@/lib/platform'
import { setPrefs } from '@/lib/prefs'

const UNLOCK = 'FCDEVKIT'
const LOCK = 'LOCKFCDEVKIT'
const OCULUS = 'OCULUSDEI'
const OCULUS_LOCK = 'LOCKOCULUSDEI'

type Flash = 'unlocked' | 'locked' | 'oculus' | 'oculus-locked' | 'oculus-phone'

export function DevKitUnlock(): React.JSX.Element | null {
  const buffer = useRef('')
  const [show, setShow] = useState<Flash | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.altKey || e.metaKey || e.key.length !== 1) return
      buffer.current = (buffer.current + e.key.toUpperCase()).slice(-OCULUS_LOCK.length)
      // The lock codes end with the unlock codes, so check them first.
      if (buffer.current.endsWith(OCULUS_LOCK)) {
        buffer.current = ''
        void setPrefs({ oculusDei: false }).then(() => api.oculus.stop())
        flash('oculus-locked')
        navigate({ name: 'home' })
      } else if (buffer.current.endsWith(OCULUS)) {
        buffer.current = ''
        if (isPhoneApp()) flash('oculus-phone')
        else {
          void setPrefs({ oculusDei: true })
          flash('oculus')
          navigate({ name: 'oculus' })
        }
      } else if (buffer.current.endsWith(LOCK)) {
        buffer.current = ''
        void lock()
      } else if (buffer.current.endsWith(UNLOCK)) {
        buffer.current = ''
        void unlock()
      }
    }
    const flash = (s: Flash): void => {
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
  if (show.startsWith('oculus')) {
    const text =
      show === 'oculus'
        ? ['auth --oculus-dei', 'OCULUS DEI', 'God’s Eye View unlocked — live aircraft, satellites and launches on a 3D globe.']
        : show === 'oculus-locked'
          ? ['oculus --lock', 'OCULUS DEI SEALED', 'The tab is hidden. Type OCULUSDEI to bring it back.']
          : ['auth --oculus-dei', 'PC ONLY', 'Oculus Dei runs a globe server on your laptop — type it there.']
    return (
      <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm">
        <div className="rounded-full border border-cyan-300/40 bg-[#03060b] px-12 py-10 text-center font-mono text-cyan-200 shadow-[0_0_120px_-10px_rgba(103,232,249,0.55)]" style={{ animation: 'devkit-in 0.5s ease-out' }}>
          <div className="text-xs text-cyan-500/80">&gt; {text[0]}</div>
          <div className="mt-2 text-2xl font-bold tracking-[0.35em]">{text[1]}</div>
          <div className="mx-auto mt-1 max-w-xs text-xs text-cyan-100/70">{text[2]}</div>
        </div>
      </div>
    )
  }
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
