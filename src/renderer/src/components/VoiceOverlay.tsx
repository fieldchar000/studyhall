// The phone/tablet voice briefing sheet. Opens when you tap the mic, when the "Hey Bauer"
// service hears you while Studyhall is open, or when you come back from a "Bauer heard you"
// notification. Listens with Android's own recogniser, then shows the list to check.

import { useCallback, useEffect, useRef, useState } from 'react'
import { parseBrief, type BriefAction } from '@/lib/brief'
import { applyBrief, loadBriefContext } from '@/lib/briefApply'
import { api } from '@/lib/data'
import { Bauer } from '@/lib/voice/phone'
import { BriefReview } from './BriefReview'
import { Icon } from './ui'

type Phase = 'closed' | 'listening' | 'thinking' | 'review' | 'done' | 'nothing' | 'error'

const symbol = (code: string): string => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? ''
  } catch {
    return ''
  }
}

export function VoiceOverlay(): React.JSX.Element | null {
  const [phase, setPhase] = useState<Phase>('closed')
  const [partial, setPartial] = useState('')
  const [level, setLevel] = useState(0)
  const [text, setText] = useState('')
  const [edited, setEdited] = useState(false)
  const [actions, setActions] = useState<BriefAction[]>([])
  const [message, setMessage] = useState('')
  const [count, setCount] = useState(0)
  const [currency, setCurrency] = useState('')
  const busy = useRef(false)

  const read = useCallback(async (t: string): Promise<void> => {
    setActions(parseBrief(t, await loadBriefContext()))
    setCurrency(symbol((await api.profile.get()).currency || ''))
  }, [])

  const review = useCallback(
    async (t: string): Promise<void> => {
      setText(t)
      setEdited(false)
      await read(t)
      setPhase('review')
    },
    [read]
  )

  const listen = useCallback(async (): Promise<void> => {
    if (busy.current) return
    busy.current = true
    setPartial('')
    setLevel(0)
    setPhase('listening')
    try {
      const { text: t } = await Bauer.listen()
      if (t.trim()) await review(t.trim())
      else {
        setMessage('I didn’t catch anything.')
        setPhase('nothing')
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      if (m === 'nothing') setMessage('I didn’t catch anything.')
      else if (m === 'no_recognizer') setMessage('This device has no speech recogniser. Install or update the Google app, then try again.')
      else setMessage(m)
      setPhase(m === 'nothing' ? 'nothing' : 'error')
    } finally {
      busy.current = false
    }
  }, [review])

  /** Briefings the service wrote down while Studyhall was closed. */
  const takePending = useCallback(async (): Promise<void> => {
    const { items } = await Bauer.pending().catch(() => ({ items: [] as { text: string }[] }))
    if (items.length) await review(items.map((i) => i.text).join('. '))
  }, [review])

  const close = useCallback((): void => {
    void Bauer.cancelListening().catch(() => {})
    void Bauer.resume().catch(() => {})
    setPhase('closed')
    setActions([])
  }, [])

  // Hook up the native side once.
  useEffect(() => {
    const subs = [
      Bauer.addListener('wake', () => void listen()),
      Bauer.addListener('pending', () => void takePending()),
      Bauer.addListener('partial', (e) => setPartial(e.text)),
      Bauer.addListener('level', (e) => setLevel((l) => l * 0.5 + e.level * 0.5)),
      Bauer.addListener('state', (e) => e.state === 'thinking' && setPhase((p) => (p === 'listening' ? 'thinking' : p)))
    ]
    const onBrief = (): void => void listen()
    window.addEventListener('studyhall:brief', onBrief)
    // Keep "Hey Bauer" running if it's switched on (Android may have stopped it).
    void api.prefs.get().then((p) => {
      if (p.voiceWake) void Bauer.start({ sensitivity: p.voiceSensitivity ?? 50 }).catch(() => {})
    })
    void takePending()
    return () => {
      window.removeEventListener('studyhall:brief', onBrief)
      subs.forEach((s) => void s.then((h) => h.remove()))
    }
  }, [listen, takePending])

  useEffect(() => {
    if (phase !== 'done' && phase !== 'nothing') return
    const t = setTimeout(close, phase === 'done' ? 1600 : 2400)
    return () => clearTimeout(t)
  }, [phase, close])

  // The phone's back button / Escape closes the sheet.
  useEffect(() => {
    if (phase === 'closed') return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [phase, close])

  const apply = async (): Promise<void> => {
    const p = await api.profile.get()
    setCount(await applyBrief(actions, p.mode))
    setPhase('done')
  }

  if (phase === 'closed') return null
  const ticked = actions.filter((a) => a.on).length

  return (
    <div data-modal className="fixed inset-0 z-[90] flex flex-col justify-end bg-black/40" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="mx-auto flex max-h-[88vh] w-full max-w-xl flex-col gap-3 rounded-t-2xl border border-line bg-panel p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="relative grid size-12 shrink-0 place-items-center">
            <span
              className={`absolute inset-0 rounded-full bg-accent/25 ${phase === 'listening' && !partial ? 'animate-ping' : ''} ${phase === 'thinking' ? 'animate-pulse' : ''}`}
              style={{ transform: `scale(${phase === 'listening' ? 1 + Math.min(0.45, level * 0.6) : 1})`, transition: 'transform 90ms linear' }}
            />
            <span className={`relative grid size-10 place-items-center rounded-full ${phase === 'error' ? 'bg-danger' : 'bg-accent'} text-on-accent`}>
              <Icon name={phase === 'done' ? 'check' : 'mic'} size={20} weight="fill" />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-serif text-lg leading-tight">
              {phase === 'listening' && (partial ? 'Listening…' : 'Go ahead — I’m listening')}
              {phase === 'thinking' && 'Writing it down…'}
              {phase === 'review' && 'Is this right?'}
              {phase === 'done' && `Done — ${count} change${count === 1 ? '' : 's'} made`}
              {phase === 'nothing' && 'Nothing heard'}
              {phase === 'error' && 'Something went wrong'}
            </div>
            <div className="line-clamp-2 text-xs text-muted">
              {phase === 'listening' && (partial || 'Pause for a moment when you’re done.')}
              {phase === 'review' && 'Untick anything wrong, fix any words, then Apply.'}
              {(phase === 'nothing' || phase === 'error') && message}
            </div>
          </div>
          <button className="grid size-10 shrink-0 place-items-center rounded-lg text-muted" onClick={close} aria-label="Close">
            <Icon name="x" size={20} />
          </button>
        </div>

        {phase === 'listening' && (
          <button className="rounded-lg border border-line py-2.5 text-sm" onClick={() => void Bauer.stopListening()}>
            Done talking
          </button>
        )}
        {phase === 'error' && (
          <button className="self-start rounded-lg border border-line px-4 py-2 text-sm" onClick={() => void listen()}>
            Try again
          </button>
        )}

        {phase === 'review' && (
          <>
            <div className="rounded-lg border border-line bg-canvas px-3 py-2">
              <div className="label-caps mb-1 flex items-center justify-between text-[10px] text-muted">
                <span>You said</span>
                {edited && (
                  <button
                    className="text-accent normal-case underline"
                    onClick={() => {
                      setEdited(false)
                      void read(text)
                    }}
                  >
                    Read it again
                  </button>
                )}
              </div>
              <textarea
                className="w-full resize-none bg-transparent text-sm leading-5 outline-none"
                rows={Math.min(5, Math.max(2, Math.ceil(text.length / 44)))}
                value={text}
                onChange={(e) => {
                  setText(e.target.value)
                  setEdited(true)
                }}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <BriefReview actions={actions} onChange={setActions} currency={currency} />
            </div>
            <div className="flex items-center gap-2">
              <button className="btn-primary flex-1 justify-center py-2.5" disabled={!ticked} onClick={() => void apply()}>
                Apply {ticked || ''} change{ticked === 1 ? '' : 's'}
              </button>
              <button className="rounded-lg border border-line px-4 py-2.5 text-sm" onClick={() => void listen()} aria-label="Say it again">
                <Icon name="mic" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
