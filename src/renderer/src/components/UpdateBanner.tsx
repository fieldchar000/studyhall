// "Update ready — restart" banner (sidebar) and the Updates card (Settings).

import { useEffect, useState } from 'react'
import type { UpdateState } from '@shared/types'
import { api } from '@/lib/data'

function useUpdateState(): UpdateState | null {
  const [s, setS] = useState<UpdateState | null>(null)
  useEffect(() => {
    void api.app.updateState().then(setS)
    return api.app.onUpdate(setS)
  }, [])
  return s
}

export function UpdateBanner(): React.JSX.Element | null {
  const s = useUpdateState()
  if (s?.status !== 'ready') return null
  return (
    <button onClick={() => void api.app.installUpdate()} className="rounded-lg bg-accent px-2.5 py-2 text-left text-xs text-white hover:opacity-90" title="Saves everything, installs, and reopens Studyhall">
      <div className="font-semibold">Update {s.version} ready</div>
      <div className="opacity-90">Click to restart &amp; install</div>
    </button>
  )
}

export function UpdatesCard({ version }: { version?: string }): React.JSX.Element {
  const s = useUpdateState()
  const [checking, setChecking] = useState(false)
  const text = (): string => {
    switch (s?.status) {
      case 'dev':
        return 'Updates are installed automatically in the installed app.'
      case 'checking':
        return 'Checking for updates…'
      case 'none':
        return 'You have the latest version.'
      case 'downloading':
        return `Downloading version ${s.version}… ${s.percent}%`
      case 'ready':
        return `Version ${s.version} is ready to install.`
      case 'error':
        return `Couldn't check for updates (${s.message}). It will try again later.`
      default:
        return 'Updates download automatically from GitHub and install when you restart.'
    }
  }
  return (
    <section className="card p-5 text-sm">
      <h2 className="mb-1 font-semibold">Updates</h2>
      <p className="mb-3 text-muted">
        Studyhall {version} · {text()}
      </p>
      <div className="flex gap-2">
        {s?.status === 'ready' ? (
          <button className="btn-primary" onClick={() => void api.app.installUpdate()}>
            Restart &amp; install {s.version}
          </button>
        ) : (
          <button
            className="btn"
            disabled={checking || s?.status === 'dev' || s?.status === 'downloading'}
            onClick={() => {
              setChecking(true)
              void api.app.checkUpdates().finally(() => setChecking(false))
            }}
          >
            Check now
          </button>
        )}
        <button className="btn-ghost" onClick={() => window.open('https://github.com/fieldchar000/studyhall/releases')}>
          What's new
        </button>
      </div>
    </section>
  )
}
