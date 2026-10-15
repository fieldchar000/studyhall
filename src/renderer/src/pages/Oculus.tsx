// Oculus Dei: God's Eye View — a live 3D globe of flights, satellites, launches, earthquakes and
// more — inside Studyhall. The globe itself is a separate view laid over this page by the main
// process (it can't be framed), so this page only measures where it goes and shows the
// install/start screens around it.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { OculusState } from '@shared/types'
import { api } from '@/lib/data'
import { isPhoneApp } from '@/lib/platform'
import { searchIsOpen, subscribeSearch } from '@/components/SearchPalette'
import { Modal } from '@/components/ui'

function useOculus(): OculusState | null {
  const [s, setS] = useState<OculusState | null>(null)
  useEffect(() => {
    void api.oculus.state().then(setS)
    return api.oculus.onState(setS)
  }, [])
  return s
}

export function OculusPage(): React.JSX.Element {
  const s = useOculus()
  const box = useRef<HTMLDivElement>(null)
  const searchOpen = useSyncExternalStore(subscribeSearch, searchIsOpen)
  const [checked, setChecked] = useState(false)
  const [sgOpen, setSgOpen] = useState(false)

  // Start the globe as soon as the page opens; look for a newer version once.
  useEffect(() => {
    if (s?.phase === 'stopped') void api.oculus.start()
    if (s && s.phase !== 'absent' && !checked) {
      setChecked(true)
      void api.oculus.checkUpdate()
    }
  }, [s?.phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the globe view exactly over the page; hide it when anything needs to sit on top.
  useEffect(() => {
    const el = box.current
    if (!el || s?.phase !== 'running') return
    const place = (): void => {
      if (sgOpen || searchOpen || document.querySelector('[data-modal]')) {
        void api.oculus.hide()
        return
      }
      const r = el.getBoundingClientRect()
      void api.oculus.show({ x: r.left, y: r.top, width: r.width, height: r.height })
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(el)
    window.addEventListener('resize', place)
    const mo = new MutationObserver(place) // dialogs opening/closing
    mo.observe(document.body, { childList: true, subtree: false })
    return () => {
      ro.disconnect()
      mo.disconnect()
      window.removeEventListener('resize', place)
      void api.oculus.hide()
    }
  }, [s?.phase, searchOpen, sgOpen])

  if (isPhoneApp()) {
    return (
      <Shell>
        <p className="text-sm text-cyan-100/70">Oculus Dei runs a live globe server on your laptop, so it lives in Studyhall on your PC.</p>
      </Shell>
    )
  }
  if (!s) return <Shell />

  if (s.phase === 'running') {
    return (
      <div className="flex h-full flex-col bg-[#05070b]">
        <div className="flex items-center gap-2 border-b border-cyan-400/15 px-4 py-1.5 font-mono text-[11px] text-cyan-200/70">
          <span className="text-cyan-300">OCULUS DEI</span>
          <span className="text-cyan-200/40">· God’s Eye View {s.version}</span>
          <span className="flex-1" />
          {s.updateAvailable && (
            <button className="rounded border border-lime-300/40 px-2 py-0.5 text-lime-200 hover:bg-lime-300/10" onClick={() => void api.oculus.update()}>
              Update to {s.updateAvailable}
            </button>
          )}
          <button className="rounded px-2 py-0.5 text-lime-200/90 hover:bg-lime-300/10" onClick={() => setSgOpen(true)} title="Singapore cameras and live feeds">
            🇸🇬 Singapore
          </button>
          <button className="rounded px-2 py-0.5 hover:bg-cyan-300/10" onClick={() => void api.oculus.openInBrowser()} title="Some graphics cards run it more smoothly in your normal browser">
            Open in browser
          </button>
          <button className="rounded px-2 py-0.5 hover:bg-cyan-300/10" onClick={() => void api.oculus.stop()} title="Stop the globe and its server">
            Stop
          </button>
        </div>
        <div ref={box} className="min-h-0 flex-1" />
        {sgOpen && <SingaporePanel s={s} onClose={() => setSgOpen(false)} />}
      </div>
    )
  }

  return (
    <Shell>
      {s.phase === 'absent' && (
        <>
          <p className="max-w-xl text-sm leading-relaxed text-cyan-100/75">
            A spy-satellite view of the real world: live aircraft, satellites, rocket launches, earthquakes and fires on a 3D globe. It’s{' '}
            <span className="text-cyan-200">God’s Eye View</span> by Bilawal Sidhu, free and open source (MIT), running privately on this PC.
          </p>
          <ul className="max-w-xl list-disc pl-5 text-xs leading-relaxed text-cyan-100/55">
            <li>Downloads God’s Eye View and its own copy of Node.js — about 650 MB on disk once set up.</li>
            <li>Works without any keys. Optional extras (Google 3D buildings, voice) need paid keys and stay off.</li>
            <li>You can remove it any time here, which frees the space again.</li>
          </ul>
          <button className="mt-2 self-start rounded-md border border-cyan-300/50 bg-cyan-300/10 px-5 py-2 font-mono text-sm tracking-widest text-cyan-100 hover:bg-cyan-300/20" onClick={() => void api.oculus.install()}>
            INSTALL
          </button>
        </>
      )}
      {(s.phase === 'installing' || s.phase === 'starting') && (
        <div className="flex flex-col gap-3">
          <p className="font-mono text-sm text-cyan-200">&gt; {s.step ?? 'Working'}…</p>
          <div className="h-1 w-80 max-w-full overflow-hidden rounded bg-white/10">
            <div className="h-full w-1/3 animate-[oculus-scan_1.6s_ease-in-out_infinite] bg-gradient-to-r from-cyan-400 to-lime-300" />
          </div>
          {s.phase === 'installing' && <p className="text-xs text-cyan-100/50">This takes a few minutes the first time. You can keep using Studyhall meanwhile.</p>}
        </div>
      )}
      {s.phase === 'stopped' && <p className="font-mono text-sm text-cyan-200">&gt; Starting…</p>}
      {s.phase === 'error' && (
        <div className="flex flex-col gap-3">
          <p className="max-w-xl font-mono text-sm text-rose-300">&gt; {s.message}</p>
          <div className="flex gap-2">
            <button className="rounded-md border border-cyan-300/40 px-4 py-1.5 font-mono text-xs text-cyan-100 hover:bg-cyan-300/10" onClick={() => void (s.version ? api.oculus.start() : api.oculus.install())}>
              TRY AGAIN
            </button>
          </div>
        </div>
      )}
      {(s.phase === 'stopped' || s.phase === 'error') && s.version && (
        <button className="mt-6 self-start text-xs text-cyan-100/40 underline hover:text-rose-300" onClick={() => void api.oculus.remove()}>
          Remove Oculus Dei from this PC
        </button>
      )}
    </Shell>
  )
}

/** Singapore extras: which are on, and your free LTA DataMall key for every camera. */
function SingaporePanel({ s, onClose }: { s: OculusState; onClose: () => void }): React.JSX.Element {
  const [key, setKey] = useState('')
  const [saved, setSaved] = useState<string | null>(null)
  const cams = s.packs?.includes('Singapore traffic cameras')
  return (
    <Modal title="Singapore" onClose={onClose}>
      <div className="flex flex-col gap-4 text-sm">
        <div>
          <div className="font-semibold">Traffic cameras {cams ? <span className="text-ok">· on</span> : <span className="text-danger">· not available in this version</span>}</div>
          <p className="mt-1 text-muted">
            {s.ltaKey
              ? 'All of LTA’s expressway cameras, refreshed every few minutes.'
              : 'Right now: the Woodlands Causeway and Tuas Second Link checkpoint cameras (the free feed, updated about hourly). Add a free LTA DataMall key below for all ~90 expressway cameras, refreshed every few minutes.'}{' '}
            Turn on <b>CCTV</b> in Data layers, then fly to Singapore (LOCATION → “Singapore”).
          </p>
          {s.packsSkipped?.length ? <p className="mt-1 text-xs text-danger">This version of God’s Eye View changed where cameras are added, so Studyhall left it alone. Update Studyhall to get them back.</p> : null}
        </div>
        <div>
          <div className="font-semibold">LTA DataMall key {s.ltaKey && <span className="text-ok">· saved</span>}</div>
          <p className="mt-1 text-xs text-muted">
            Free: sign up at datamall.lta.gov.sg (“Request for API Access”); the key arrives by email. It’s kept on this PC only and used only to ask LTA for camera pictures.
          </p>
          <div className="mt-2 flex gap-2">
            <input className="field-boxed min-w-0 flex-1" type="password" autoComplete="off" placeholder={s.ltaKey ? 'Replace your saved key' : 'Paste your AccountKey'} value={key} onChange={(e) => setKey(e.target.value)} />
            <button
              className="btn-primary"
              disabled={!key.trim()}
              onClick={() =>
                void api.oculus.setLtaKey(key).then(() => {
                  setKey('')
                  setSaved('Saved — the globe restarts to load every camera.')
                })
              }
            >
              Save
            </button>
            {s.ltaKey && (
              <button className="btn-ghost" onClick={() => void api.oculus.setLtaKey('').then(() => setSaved('Key removed.'))}>
                Remove
              </button>
            )}
          </div>
          {saved && <p className="mt-1 text-xs text-ok">{saved}</p>}
        </div>
        <div>
          <div className="font-semibold">Already live over Singapore</div>
          <p className="mt-1 text-muted">Aircraft around Changi (Live contacts), satellites and the ISS overhead (Space missions), weather and wind, haze-season fires in the region (with a free NASA FIRMS key), and local radio stations. Ships in the Singapore Strait need a free AISStream key (POWER UP → Provider Settings).</p>
        </div>
      </div>
    </Modal>
  )
}

function Shell({ children }: { children?: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex h-full flex-col justify-center gap-4 bg-[radial-gradient(ellipse_at_30%_20%,#0d2733,#05070b_60%)] px-10 py-10">
      <div className="font-mono text-[11px] tracking-[0.3em] text-cyan-400/70">// OCULUS DEI</div>
      <h1 className="font-mono text-3xl font-bold tracking-widest text-cyan-100">GOD’S EYE VIEW</h1>
      {children}
    </div>
  )
}
