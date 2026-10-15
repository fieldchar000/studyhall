// Settings: course files between your PC and phone over home Wi-Fi (no cloud storage used).
// On the PC: a switch to share. On the phone: which PCs answer, and a way to fetch now.

import { useEffect, useState } from 'react'
import { api } from '@/lib/data'
import { isPhoneApp } from '@/lib/platform'
import { setPrefs, usePrefs } from '@/lib/prefs'
import { useCloud } from '@/lib/cloud'

export function WifiShareCard(): React.JSX.Element {
  return isPhoneApp() ? <PhoneSide /> : <PcSide />
}

function PcSide(): React.JSX.Element {
  const prefs = usePrefs()
  const cloud = useCloud()
  const [status, setStatus] = useState<{ sharing: boolean; addresses: string[]; port: number | null } | null>(null)
  const on = !!prefs?.lanShare
  useEffect(() => {
    let live = true
    const load = (): void => void api.lan.status().then((s) => live && setStatus(s))
    load()
    const t = setTimeout(load, 1500) // after switching on
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [on])
  return (
    <section className="card mb-4 p-5">
      <h2 className="mb-1 font-semibold">Files to your phone over Wi-Fi</h2>
      <p className="mb-3 text-sm text-muted">
        Your phone copies course files and photos straight from this PC when both are on the same Wi-Fi — free, no size limit, and none of the 1 GB cloud space.
      </p>
      <label className="flex items-start gap-3 py-1.5">
        <input type="checkbox" className="mt-1" checked={on} onChange={(e) => void setPrefs({ lanShare: e.target.checked })} />
        <span>
          <span className="block text-sm">Let my phone fetch files from this PC</span>
          <span className="block text-xs text-muted">The first time, Windows asks whether to allow Studyhall on your network — choose Allow (private networks).</span>
        </span>
      </label>
      {on && status?.sharing && (
        <p className="mt-2 text-xs text-ok">
          ✓ Sharing on {status.addresses.length ? status.addresses.join(', ') : 'this network'} · files are encrypted and only your own devices can ask for them.
        </p>
      )}
      {on && status && !status.sharing && <p className="mt-2 text-xs text-danger">Couldn’t start sharing. Restart Studyhall and try again.</p>}
      {on && !cloud?.signedIn && <p className="mt-2 text-xs text-muted">Sign in (Account &amp; sync above) on both devices — that’s how your phone finds this PC.</p>}
    </section>
  )
}

function PhoneSide(): React.JSX.Element {
  const prefs = usePrefs()
  const [peers, setPeers] = useState<{ name: string; reachable: boolean }[] | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const check = (): void => {
    setPeers(null)
    void api.lan.peers().then(setPeers)
  }
  useEffect(check, [])
  const fetchNow = async (): Promise<void> => {
    setBusy(true)
    setMsg(null)
    try {
      const r = await api.lan.fetchNow()
      setMsg(r.fetched ? `Got ${r.fetched} file${r.fetched === 1 ? '' : 's'}.${r.missing ? ` ${r.missing} still missing.` : ''}` : r.missing ? `${r.missing} file${r.missing === 1 ? ' is' : 's are'} missing — is your PC on, with Studyhall open, on this Wi-Fi?` : 'You have every file already.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="card mb-4 p-5">
      <h2 className="mb-1 font-semibold">Files from your PC over Wi-Fi</h2>
      <p className="mb-3 text-sm text-muted">When your phone and PC are on the same Wi-Fi, course files and photos come straight from the PC — free, and they stay on the phone for offline use.</p>
      <div className="mb-3 flex flex-col gap-1 text-sm">
        {peers === null ? (
          <span className="text-muted">Looking for your PC…</span>
        ) : peers.length === 0 ? (
          <span className="text-muted">No PC is sharing yet. On your PC: Settings → “Let my phone fetch files from this PC”.</span>
        ) : (
          peers.map((p) => (
            <span key={p.name} className={p.reachable ? 'text-ok' : 'text-muted'}>
              {p.reachable ? '●' : '○'} {p.name} — {p.reachable ? 'connected' : 'not reachable (different Wi-Fi, or Studyhall closed)'}
            </span>
          ))
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn" onClick={check}>
          Check again
        </button>
        <button className="btn-primary" disabled={busy} onClick={() => void fetchNow()}>
          {busy ? 'Copying…' : 'Get missing files now'}
        </button>
      </div>
      {msg && <p className="mt-2 text-xs text-muted">{msg}</p>}
      <label className="mt-3 flex items-start gap-3 py-1.5">
        <input type="checkbox" className="mt-1" checked={prefs?.lanAutoFetch !== false} onChange={(e) => void setPrefs({ lanAutoFetch: e.target.checked })} />
        <span className="text-sm">Copy new files automatically when I’m on the same Wi-Fi</span>
      </label>
    </section>
  )
}
