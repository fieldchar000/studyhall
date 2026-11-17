// Settings → Voice: download the offline speech models, switch "Hey Bauer" on, sensitivity,
// Bauer's brain (the local AI on the PC) and how hands-free he is.

import { useEffect, useState } from 'react'
import type { AiStatus, Prefs, VoiceStatus } from '@shared/types'
import { api, notifyChanged, track, useLive } from '@/lib/data'
import { isPhoneApp } from '@/lib/platform'
import { startBrief } from '@/lib/voice'
import { navigate } from '@/lib/nav'
import { Bauer, type PhoneVoiceStatus } from '@/lib/voice/phone'
import { Icon } from './ui'

const EXAMPLES = [
  'Move my gym on Thursday to 7 pm',
  'I’ll send Sam the notes tomorrow morning',
  'Pull up Khan Academy on entropy',
  'Open my flashcards',
  'Add a task to finish the lab report by Friday',
  'Remind me to call Mum tomorrow at 5',
  'I studied anatomy for two hours',
  'I spent 12 dollars on lunch',
  'I have a dentist appointment on Thursday at 3:30',
  'Cancel my gym session tomorrow',
  'I finished the essay draft',
  'I went for a run',
  'Note that the placement starts in January'
]

interface Unified {
  installed: boolean
  downloading: boolean
  progress: number
  error: string | null
  running: boolean
  xiaomi: boolean
}

export function VoiceCard(): React.JSX.Element {
  const phone = isPhoneApp()
  const { data: prefs } = useLive(['prefs'], () => api.prefs.get(), [])
  const [st, setSt] = useState<Unified | null>(null)
  const [sens, setSens] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const savePrefs = (patch: Partial<Prefs>): Promise<unknown> => track(api.prefs.set(patch)).then(() => notifyChanged('prefs'))

  // Status: the PC's main process, or the Android plugin.
  useEffect(() => {
    if (phone) {
      const refresh = (): void =>
        void Bauer.status()
          .then((s: PhoneVoiceStatus) => setSt((o) => ({ installed: s.modelReady, downloading: s.downloading, progress: s.progress, error: o?.error ?? null, running: s.running, xiaomi: s.xiaomi })))
          .catch(() => setSt({ installed: false, downloading: false, progress: 0, error: 'Voice isn’t available in this version of the app.', running: false, xiaomi: false }))
      refresh()
      const sub = Bauer.addListener('download', (e) => setSt((o) => (o ? { ...o, downloading: true, progress: e.progress } : o)))
      const t = setInterval(refresh, 3000)
      return () => {
        clearInterval(t)
        void sub.then((h) => h.remove())
      }
    }
    const take = (s: VoiceStatus): void => setSt({ installed: s.installed, downloading: s.downloading, progress: s.progress, error: s.error, running: s.state !== 'off', xiaomi: false })
    void api.voice.status().then(take)
    return api.voice.onStatus(take)
  }, [phone])

  const download = async (): Promise<void> => {
    setErr('')
    if (phone) {
      setSt((o) => (o ? { ...o, downloading: true, progress: 0 } : o))
      try {
        await Bauer.downloadModel()
        setSt((o) => (o ? { ...o, installed: true, downloading: false, progress: 1 } : o))
      } catch (e) {
        setSt((o) => (o ? { ...o, downloading: false } : o))
        setErr(e instanceof Error ? e.message : String(e))
      }
    } else await api.voice.download()
  }

  const setWake = async (on: boolean): Promise<void> => {
    setErr('')
    setBusy(true)
    try {
      if (phone) {
        if (on) await Bauer.start({ sensitivity: prefs?.voiceSensitivity ?? 50 })
        else await Bauer.stop()
      }
      await savePrefs({ voiceWake: on })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const sensitivity = sens ?? prefs?.voiceSensitivity ?? 50
  const commitSensitivity = (v: number): void => {
    void savePrefs({ voiceSensitivity: v })
    if (phone && prefs?.voiceWake) void Bauer.start({ sensitivity: v }).catch(() => {})
  }
  const sizeMb = phone ? 40 : 121

  return (
    <section className="card mb-4 p-5">
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <Icon name="mic" /> Voice — “Hey Bauer”
      </h2>
      <p className="mb-3 text-sm text-muted">
        Tell Studyhall what to add, move, cancel or log, in your own words. Bauer does it straight away and writes everything in the{' '}
        <button className="text-accent underline" onClick={() => navigate({ name: 'bauer' })}>
          Bauer log
        </button>
        , where you can undo it. {phone ? 'Speech is understood by Android on this device.' : 'Speech is understood on this PC — nothing you say is sent anywhere.'}
      </p>

      {!st ? null : !st.installed ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            First, a one-time download of the offline speech model{phone ? '' : 's'} ({sizeMb} MB{phone ? '' : ', about a minute on good Wi-Fi'}).
          </p>
          {st.downloading ? (
            <div className="h-2 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.round(st.progress * 100)}%` }} />
            </div>
          ) : (
            <button className="btn self-start" onClick={() => void download()}>
              Download ({sizeMb} MB)
            </button>
          )}
          {(st.error || err) && <p className="text-xs text-danger">{err || st.error}</p>}
          {phone && <p className="text-xs text-muted">You can already use the mic button at the top without it — the download is only for “Hey Bauer”.</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <button className="btn self-start" onClick={() => void startBrief()}>
            <Icon name="mic" /> Brief Bauer now
          </button>
          <label className="flex items-start gap-3 py-1">
            <input type="checkbox" className="mt-1" disabled={busy} checked={!!prefs?.voiceWake} onChange={(e) => void setWake(e.target.checked)} />
            <span>
              <span className="block text-sm">Listen for “Hey Bauer”</span>
              <span className="block text-xs text-muted">
                {phone
                  ? 'Keeps working when Studyhall is closed, with a small “Listening” notification (Android requires it). Tap the notification’s Stop to switch off.'
                  : 'Works while Studyhall is open or in the tray. Windows shows a microphone icon in the taskbar while it listens.'}
              </span>
            </span>
          </label>
          {prefs?.voiceWake && (
            <div className="flex flex-col gap-1 pl-7">
              <div className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0">Sensitivity</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  className="flex-1 accent-[var(--color-accent)]"
                  value={sensitivity}
                  onChange={(e) => setSens(+e.target.value)}
                  onPointerUp={() => commitSensitivity(sensitivity)}
                  onKeyUp={() => commitSensitivity(sensitivity)}
                  aria-label="Wake word sensitivity"
                />
                <span className="w-8 text-right text-xs text-muted">{sensitivity}</span>
              </div>
              <div className="flex justify-between pl-[108px] text-[11px] text-muted">
                <span>Fewer false alarms</span>
                <span>Hears you more easily</span>
              </div>
            </div>
          )}
          {phone && prefs?.voiceWake && (
            <div className="rounded-lg border border-line bg-canvas p-3 text-xs">
              <p className="mb-2">
                <strong>{st.xiaomi ? 'On your Xiaomi:' : 'If it stops listening:'}</strong> Xiaomi (HyperOS/MIUI) and some other phones stop apps in the background to save battery. Set Studyhall’s battery saver to <strong>No restrictions</strong> and turn on <strong>Autostart</strong>
                {st.xiaomi ? ' (Settings → Apps → Manage apps → Studyhall).' : '.'}
              </p>
              <button className="btn" onClick={() => void Bauer.openBatterySettings().catch(() => {})}>
                Open battery settings
              </button>
            </div>
          )}
          <label className="flex items-start gap-3 py-1">
            <input type="checkbox" className="mt-1" checked={prefs?.bauerTalk !== false} onChange={(e) => void savePrefs({ bauerTalk: e.target.checked })} />
            <span>
              <span className="block text-sm">Bauer talks back</span>
              <span className="block text-xs text-muted">He says out loud what he did, with the voice built into {phone ? 'your tablet' : 'Windows'}.</span>
            </span>
          </label>
          <label className="flex items-start gap-3 py-1">
            <input type="checkbox" className="mt-1" checked={!!prefs?.bauerConfirm} onChange={(e) => void savePrefs({ bauerConfirm: e.target.checked })} />
            <span>
              <span className="block text-sm">Ask before doing things</span>
              <span className="block text-xs text-muted">Off: Bauer just does it (you can undo). On: you get a checklist to tick first.</span>
            </span>
          </label>
          {!phone && <AiBrain />}
          {err && <p className="text-xs text-danger">{err}</p>}
          <details className="text-sm">
            <summary className="cursor-pointer text-muted">Things you can say</summary>
            <ul className="mt-2 flex flex-col gap-1 pl-1 text-[13px]">
              {EXAMPLES.map((x) => (
                <li key={x}>“{x}”</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">Say several in one go. Ask questions too: “when is my exam?”, “what does Alex like?”.</p>
          </details>
        </div>
      )}
    </section>
  )
}

/** PC only: download Bauer's brain, a small AI that runs on this computer. */
function AiBrain(): React.JSX.Element {
  const [st, setSt] = useState<AiStatus | null>(null)
  useEffect(() => {
    void api.ai.status().then(setSt)
    return api.ai.onStatus(setSt)
  }, [])
  if (!st) return <></>
  const gb = (st.sizeMb / 1000).toFixed(1)
  return (
    <div className="rounded-lg border border-line bg-canvas p-3 text-sm">
      <div className="mb-1 flex items-center gap-2 font-semibold">
        <Icon name="spark" size={15} className="text-brass" /> Bauer’s brain
        {st.installed && <span className="ml-auto text-xs font-normal text-muted">{st.running ? 'Awake' : 'Ready'}</span>}
      </div>
      {st.installed ? (
        <>
          <p className="text-xs text-muted">A small AI (Qwen3 4B) runs on this PC and understands how you normally talk. It wakes up when you say “Hey Bauer” and sleeps after 10 quiet minutes. Free, offline, nothing sent anywhere.</p>
          <button
            className="btn-ghost mt-2 -ml-2 text-xs"
            onClick={() => {
              if (confirm('Delete Bauer’s brain from this PC? He’ll go back to understanding only the usual phrases.')) void api.ai.remove()
            }}
          >
            Remove ({gb} GB)
          </button>
        </>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted">
            Without it Bauer understands the usual phrases. With it he understands normal speech: “push gym back an hour”, “I promised Sam I’d send the notes tomorrow”. One-time download of {gb} GB (free AI model + the open-source llama.cpp program). It uses your graphics card.
          </p>
          {st.downloading ? (
            <>
              <div className="h-2 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.round(st.progress * 100)}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted">{Math.round(st.progress * 100)}% · you can keep using Studyhall</p>
            </>
          ) : (
            <button className="btn" onClick={() => void api.ai.download()}>
              Download ({gb} GB)
            </button>
          )}
          {st.error && <p className="mt-1 text-xs text-danger">{st.error}</p>}
        </>
      )}
    </div>
  )
}
