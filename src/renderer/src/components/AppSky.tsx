// The live sky behind every page except Home and the Brain (they have the 3D galaxy), plus the
// command bar and quick-action dock that sit at the top of those pages.

import { useEffect, useRef, useState } from 'react'
import type { Mode } from '@shared/types'
import { api, useLive } from '@/lib/data'
import { navigate, useRoute } from '@/lib/nav'
import { useMode } from '@/lib/profile'
import { isPhoneApp, isNarrow } from '@/lib/platform'
import { Sky, type SkyKind } from '@/lib/sky/sky'
import { createTask, openTask } from '@/lib/tasks'
import { startBrief } from '@/lib/voice'
import { openSearch } from './SearchPalette'
import { Icon } from './ui'

const OWN_SKY = new Set(['home', 'brain'])

export function AppSky(): React.JSX.Element | null {
  const route = useRoute()
  const mode = useMode()
  const { data: prefs } = useLive(['prefs'], () => api.prefs.get(), [])
  const c2 = useRef<HTMLCanvasElement>(null)
  const glc = useRef<HTMLCanvasElement>(null)
  const sky = useRef<Sky | null>(null)
  const kind: SkyKind = (prefs?.sky as SkyKind) ?? 'nebula'
  const hidden = OWN_SKY.has(route.name) || kind === 'off'

  useEffect(() => {
    if (!c2.current || !glc.current) return
    const s = new Sky(c2.current, glc.current, { lowPower: isPhoneApp() })
    sky.current = s
    // Glow blue while Bauer listens (PC).
    let unsub = (): void => {}
    try {
      unsub = api.voice.onStatus((st) => (s.listen = st.state === 'listening' ? 1 : 0))
    } catch {
      /* the pad has no PC voice window */
    }
    return () => {
      unsub()
      s.dispose()
    }
  }, [])
  useEffect(() => {
    if (sky.current) sky.current.kind = hidden ? 'off' : kind
  }, [kind, hidden])
  useEffect(() => {
    if (sky.current) sky.current.mode = (mode as Mode) === 'life' ? 'life' : mode === 'dev' ? 'dev' : mode === 'work' ? 'work' : 'study'
  }, [mode])

  return (
    <div className="pointer-events-none fixed inset-0 z-0" aria-hidden style={{ display: hidden ? 'none' : undefined }}>
      <canvas ref={c2} className="absolute inset-0 block h-full w-full" />
      <canvas ref={glc} className="absolute inset-0 block h-full w-full" hidden />
    </div>
  )
}

/** One command bar (search, ask Bauer, jump anywhere) and the things you do most, at the top of pages. */
export function PageDock(): React.JSX.Element | null {
  const route = useRoute()
  const mode = useMode()
  const [busy, setBusy] = useState(false)
  const name = useLive(['prefs'], () => api.prefs.get(), []).data?.novaName ?? 'Nova'
  if (OWN_SKY.has(route.name) || route.name === 'focus') return null
  const phone = isPhoneApp()
  const newTask = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const t = await createTask(mode, { title: 'New task' })
      openTask(t.id)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="page-dock sticky top-0 z-20 flex flex-wrap items-center gap-2 px-6 pt-4 pb-2 max-sm:px-3">
      <button className="dock-cmd glass min-w-0 flex-1" onClick={() => openSearch(true)} title="Search everything, or jump to a page (Ctrl+K)">
        <Icon name="search" size={15} className="shrink-0 text-muted" />
        <span className="truncate text-muted">Search, or jump to a page…</span>
        {!isNarrow() && <span className="dock-kbd ml-auto">Ctrl K</span>}
      </button>
      <button className="dock-act dock-main" onClick={() => void newTask()}>
        <Icon name="plus" size={15} /> New task
      </button>
      <button className="dock-act glass" onClick={() => void startBrief()}>
        <Icon name="mic" size={15} /> Talk to {name}
      </button>
      <button className="dock-act glass max-sm:hidden" onClick={() => navigate({ name: 'focus' })}>
        <Icon name="focus" size={15} /> Focus
      </button>
      {!phone && (
        <button className="dock-act glass max-md:hidden" onClick={() => void api.bauer.circle().catch(() => {})} title="Circle something on screen and ask Bauer (Ctrl+Alt+B)">
          <Icon name="target" size={15} /> Circle screen
        </button>
      )}
    </div>
  )
}
