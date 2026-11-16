// The Bauer panel (PC): a small always-on-top card in the corner of the screen.
// Hidden while it waits for "Hey Bauer"; shows itself to listen, then to let you check
// the list of changes before anything is saved.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { VoiceState } from '@shared/types'
import { parseBrief, type BriefAction } from '@/lib/brief'
import { applyBrief, loadBriefContext } from '@/lib/briefApply'
import { api } from '@/lib/data'
import { chime, engine } from '@/lib/voice/engine'
import { BriefReview } from '@/components/BriefReview'
import { Icon } from '@/components/ui'

type Phase = 'idle' | 'starting' | 'listening' | 'thinking' | 'review' | 'done' | 'nothing' | 'error'

const currencySymbol = (code: string): string => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? ''
  } catch {
    return ''
  }
}

export default function VoicePanel(): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle')
  const [heard, setHeard] = useState(false)
  const [level, setLevel] = useState(0)
  const [text, setText] = useState('')
  const [edited, setEdited] = useState(false)
  const [actions, setActions] = useState<BriefAction[]>([])
  const [message, setMessage] = useState('')
  const [count, setCount] = useState(0)
  const [currency, setCurrency] = useState('')
  const card = useRef<HTMLDivElement>(null)
  const phaseRef = useRef<Phase>('idle')
  phaseRef.current = phase
  engine.held = phase !== 'idle' && phase !== 'nothing'

  useEffect(() => {
    ;(window as unknown as { __bauer: unknown }).__bauer = engine
  }, [])

  const read = useCallback(async (t: string): Promise<void> => {
    const ctx = await loadBriefContext()
    setActions(parseBrief(t, ctx))
  }, [])

  // What the engine hears.
  useEffect(
    () =>
      engine.on((e) => {
        if (e.type === 'wake') {
          chime()
          setHeard(false)
          setPhase('listening')
        } else if (e.type === 'heard') setHeard(true)
        else if (e.type === 'level') setLevel((l) => l * 0.5 + e.value * 0.5)
        else if (e.type === 'recorded') setPhase('thinking')
        else if (e.type === 'nothing') {
          if (phaseRef.current === 'review') return
          setMessage('I didn’t catch anything.')
          setPhase('nothing')
        } else if (e.type === 'transcript') {
          setText(e.text)
          setEdited(false)
          void read(e.text).then(() => setPhase('review'))
        } else if (e.type === 'error') {
          setMessage(e.message)
          setPhase('error')
        }
      }),
    [read]
  )

  const listen = useCallback(async (): Promise<void> => {
    setHeard(false)
    setPhase('starting')
    try {
      await engine.listen()
      chime()
      setPhase('listening')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }, [])

  // Commands from the main process (settings changed, "Brief Bauer" pressed).
  useEffect(
    () =>
      api.voice.onCommand((c) => {
        if (c.type === 'config') {
          engine
            .setWake(c.wake, c.sensitivity)
            .then(() => phaseRef.current === 'idle' && api.voice.report(engine.wake ? 'armed' : 'off'))
            .catch((e) => {
              setMessage(`“Hey Bauer” couldn’t start: ${e instanceof Error ? e.message : String(e)}`)
              setPhase('error')
            })
        } else if (c.type === 'listen') void listen()
        else if (c.type === 'stop') engine.cancel()
      }),
    [listen]
  )

  // Tell the main process what we're doing (tray tooltip, Settings).
  useEffect(() => {
    const map: Record<Phase, VoiceState> = {
      idle: engine.wake ? 'armed' : 'off',
      starting: 'loading',
      listening: 'listening',
      thinking: 'thinking',
      review: 'review',
      done: 'review',
      nothing: engine.wake ? 'armed' : 'off',
      error: 'error'
    }
    api.voice.report(map[phase])
    if (phase === 'review') void api.profile.get().then((p) => setCurrency(currencySymbol(p.currency || '')))
  }, [phase])

  // Size the window to the card; hide it when there's nothing to show.
  useLayoutEffect(() => {
    if (phase === 'idle') {
      api.voice.hide()
      return
    }
    const el = card.current
    if (!el) return
    const fit = (): void => api.voice.show(el.scrollHeight + 2, phase === 'review' || phase === 'error')
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [phase])

  // Little messages close themselves.
  useEffect(() => {
    if (phase !== 'done' && phase !== 'nothing') return
    const t = setTimeout(() => setPhase('idle'), phase === 'done' ? 1800 : 2600)
    return () => clearTimeout(t)
  }, [phase])

  const close = useCallback((): void => {
    engine.cancel()
    setPhase('idle')
    setActions([])
    setText('')
  }, [])

  const apply = useCallback(async (): Promise<void> => {
    const p = await api.profile.get()
    const n = await applyBrief(actions, p.mode)
    setCount(n)
    setPhase('done')
    chime(false)
  }, [actions])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && phaseRef.current === 'review') void apply()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close, apply])

  const ticked = actions.filter((a) => a.on).length

  return (
    <div ref={card} className="flex flex-col gap-3 bg-panel p-4 text-ink select-none" style={{ minHeight: 0 }}>
      <div className="flex items-center gap-2.5">
        <Orb phase={phase} level={level} heard={heard} />
        <div className="min-w-0 flex-1">
          <div className="font-serif text-[17px] leading-tight">
            {phase === 'starting' && 'Getting ready…'}
            {phase === 'listening' && (heard ? 'Listening…' : 'Go ahead — I’m listening')}
            {phase === 'thinking' && 'Writing it down…'}
            {phase === 'review' && 'Is this right?'}
            {phase === 'done' && `Done — ${count} change${count === 1 ? '' : 's'} made`}
            {(phase === 'nothing' || phase === 'error') && (phase === 'nothing' ? 'Nothing heard' : 'Something went wrong')}
          </div>
          <div className="truncate text-[12px] text-muted">
            {phase === 'listening' && 'Stop talking for a moment when you’re done.'}
            {phase === 'thinking' && 'On this PC — nothing is sent anywhere.'}
            {phase === 'review' && 'Untick anything wrong, fix any words, then Apply.'}
            {(phase === 'nothing' || phase === 'error') && message}
          </div>
        </div>
        <button className="btn-ghost -mr-1 shrink-0 p-1.5" onClick={close} title="Close (Esc)" aria-label="Close">
          <Icon name="x" />
        </button>
      </div>

      {phase === 'listening' && (
        <div className="flex gap-2">
          <button className="btn-ghost flex-1 justify-center rounded-lg border border-line py-1.5 text-sm" onClick={() => void engine.finish()}>
            Done
          </button>
          <button className="btn-ghost flex-1 justify-center rounded-lg border border-line py-1.5 text-sm" onClick={close}>
            Cancel
          </button>
        </div>
      )}

      {phase === 'error' && (
        <button className="btn-ghost self-start rounded-lg border border-line px-3 py-1.5 text-sm" onClick={() => void listen()}>
          Try again
        </button>
      )}

      {phase === 'review' && (
        <>
          <div className="select-text rounded-lg border border-line bg-canvas px-3 py-2">
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
              className="w-full resize-none bg-transparent text-[13px] leading-5 outline-none"
              rows={Math.min(5, Math.max(2, Math.ceil(text.length / 52)))}
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setEdited(true)
              }}
            />
          </div>
          <div className="max-h-[52vh] overflow-y-auto pr-1">
            <BriefReview actions={actions} onChange={setActions} currency={currency} />
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-primary px-4 py-2" disabled={!ticked} onClick={() => void apply()}>
              Apply {ticked || ''} change{ticked === 1 ? '' : 's'}
            </button>
            <button className="btn-ghost rounded-lg px-3 py-2 text-sm" onClick={() => void listen()}>
              <Icon name="mic" /> Say it again
            </button>
            <span className="ml-auto text-[11px] text-muted">Ctrl+Enter</span>
          </div>
        </>
      )}
    </div>
  )
}

/** The listening orb: breathes while waiting, swells with your voice. */
function Orb({ phase, level, heard }: { phase: Phase; level: number; heard: boolean }): React.JSX.Element {
  const live = phase === 'listening'
  const scale = live ? 1 + Math.min(0.45, level * 0.9) : 1
  return (
    <div className="relative grid size-11 shrink-0 place-items-center">
      <span
        className={`absolute inset-0 rounded-full bg-accent/25 ${live && !heard ? 'animate-ping' : ''} ${phase === 'thinking' || phase === 'starting' ? 'animate-pulse' : ''}`}
        style={{
          transform: `scale(${scale})`,
          transition: 'transform 90ms linear'
        }}
      />
      <span className={`relative grid size-9 place-items-center rounded-full ${phase === 'error' ? 'bg-danger' : 'bg-accent'} text-on-accent`}>
        <Icon name={phase === 'done' ? 'check' : 'mic'} size={18} weight="fill" />
      </span>
    </div>
  )
}
