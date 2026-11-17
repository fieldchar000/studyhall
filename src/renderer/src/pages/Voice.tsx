// The Bauer panel (PC): a small always-on-top card in the corner of the screen.
// Hidden while it waits for "Hey Bauer"; shows itself to listen, then to let you check
// what Bauer did (with Undo). With "Ask before doing things" on, the old checklist comes back.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { VoiceState } from '@shared/types'
import { describe, parseBrief, type BriefAction } from '@/lib/brief'
import { handleSpeech, say, undoLog } from '@/lib/bauer/agent'
import { wakeWordHeard } from '@/lib/bauer/heard'
import { applyBrief, loadBriefContext } from '@/lib/briefApply'
import { api } from '@/lib/data'
import { chime, engine } from '@/lib/voice/engine'
import { stopSpeaking } from '@/lib/voice/speak'
import { BriefReview } from '@/components/BriefReview'
import { Icon } from '@/components/ui'

type Phase = 'idle' | 'starting' | 'listening' | 'typing' | 'thinking' | 'review' | 'done' | 'did' | 'nothing' | 'error'

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
  const [did, setDid] = useState<{ reply: string; actions: BriefAction[]; logId: string | null; undone: boolean } | null>(null)
  const [hover, setHover] = useState(false)
  const card = useRef<HTMLDivElement>(null)
  const phaseRef = useRef<Phase>('idle')
  const woke = useRef(false) // this recording started from "Hey Bauer" (not a button)
  phaseRef.current = phase
  engine.held = phase !== 'idle' && phase !== 'nothing'

  useEffect(() => {
    ;(window as unknown as { __bauer: unknown }).__bauer = engine
  }, [])

  const read = useCallback(async (t: string): Promise<void> => {
    const ctx = await loadBriefContext()
    setActions(parseBrief(t, ctx))
  }, [])

  // Hands-free: do it now (or show the checklist if you asked for one).
  const act = useCallback(
    async (t: string): Promise<void> => {
      const [prefs, profile] = await Promise.all([api.prefs.get(), api.profile.get()])
      if (prefs.bauerConfirm) {
        await read(t)
        setPhase('review')
        return
      }
      // Woken by something that only sounded like "Hey Bauer"? Quietly go back to waiting.
      if (woke.current && !wakeWordHeard(t)) {
        console.info('Bauer: no wake word in', JSON.stringify(t))
        setPhase('idle')
        return
      }
      setPhase('thinking')
      try {
        const r = await handleSpeech(t, 'voice', profile.mode)
        if (r.ignored) {
          setPhase('idle')
          return
        }
        api.bauer.orb('done', r.reply)
        setCurrency(currencySymbol(profile.currency || ''))
        setDid({ reply: r.reply, actions: r.actions, logId: r.logId, undone: false })
        setPhase('did')
        chime(false)
        if (prefs.bauerTalk !== false) say(r.reply)
      } catch (e) {
        setMessage(e instanceof Error ? e.message : String(e))
        setPhase('error')
      }
    },
    [read]
  )

  // What the engine hears.
  useEffect(
    () =>
      engine.on((e) => {
        if (e.type === 'wake') {
          woke.current = true
          void api.ai.warm().catch(() => {}) // wake the AI up while you talk
          chime()
          setHeard(false)
          setPhase('listening')
        } else if (e.type === 'heard') setHeard(true)
        else if (e.type === 'level') setLevel((l) => l * 0.5 + e.value * 0.5)
        else if (e.type === 'recorded') {
          setPhase('thinking')
          try {
            void api.mouth.warm().catch(() => {}) // get the voice ready while Nova thinks
          } catch {
            /* no voice model on this device */
          }
        }
        else if (e.type === 'nothing') {
          if (phaseRef.current === 'review') return
          setMessage('I didn’t catch anything.')
          setPhase('nothing')
        } else if (e.type === 'transcript') {
          setText(e.text)
          setEdited(false)
          void act(e.text)
        } else if (e.type === 'error') {
          setMessage(e.message)
          setPhase('error')
        }
      }),
    [act]
  )

  const [name, setName] = useState('Nova')
  const [typed, setTyped] = useState('')
  const listen = useCallback(async (pushToTalk = false): Promise<void> => {
    setHeard(false)
    woke.current = false
    setPhase('starting')
    try {
      void api.ai.warm().catch(() => {})
      await engine.listen(pushToTalk)
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
          if (c.name) setName(c.name)
          engine
            .setWake(c.wake, c.sensitivity, !!c.ears)
            .then(() => phaseRef.current === 'idle' && api.voice.report(engine.wake ? 'armed' : 'off'))
            .catch((e) => {
              setMessage(`“Hey ${c.name ?? 'Nova'}” couldn’t start: ${e instanceof Error ? e.message : String(e)}`)
              setPhase('error')
            })
        } else if (c.type === 'listen') void listen(!!c.ptt)
        else if (c.type === 'stop') engine.cancel()
        else if (c.type === 'wake') engine.externalWake()
        else if (c.type === 'finish') void engine.finish()
        else if (c.type === 'cancel') {
          engine.cancel()
          setPhase('idle')
        } else if (c.type === 'type') {
          engine.cancel()
          setTyped('')
          setPhase('typing')
        }
      }),
    [listen]
  )

  // Tell the main process what we're doing (tray tooltip, Settings).
  useEffect(() => {
    const map: Record<Phase, VoiceState> = {
      idle: engine.wake ? 'armed' : 'off',
      starting: 'loading',
      listening: 'listening',
      typing: 'review',
      thinking: 'thinking',
      review: 'review',
      done: 'review',
      did: 'review',
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
    const fit = (): void => api.voice.show(el.scrollHeight + 2, phase === 'review' || phase === 'error' || phase === 'typing')
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [phase])

  // Little messages close themselves (not while your mouse is on the card).
  useEffect(() => {
    if ((phase !== 'done' && phase !== 'nothing' && phase !== 'did') || hover) return
    const t = setTimeout(() => setPhase('idle'), phase === 'done' ? 1800 : phase === 'did' ? 9000 : 2600)
    return () => clearTimeout(t)
  }, [phase, hover])

  const close = useCallback((): void => {
    engine.cancel()
    setPhase('idle')
    setActions([])
    setText('')
  }, [])

  const apply = useCallback(async (): Promise<void> => {
    const p = await api.profile.get()
    const { count: n } = await applyBrief(actions, p.mode)
    setCount(n)
    setPhase('done')
    chime(false)
  }, [actions])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        stopSpeaking()
        close()
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && phaseRef.current === 'review') void apply()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close, apply])

  const ticked = actions.filter((a) => a.on).length

  return (
    <div ref={card} className="flex flex-col gap-2.5 p-3.5 text-ink select-none" style={{ minHeight: 0 }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="flex items-center gap-2.5">
        <Orb phase={phase} level={level} heard={heard} />
        <div className="min-w-0 flex-1">
          <div className="font-serif text-[15px] leading-tight">
            {phase === 'starting' && 'Getting ready…'}
            {phase === 'listening' && (heard ? 'Listening…' : 'Go ahead — I’m listening')}
            {phase === 'typing' && `Ask ${name}`}
            {phase === 'thinking' && 'On it…'}
            {phase === 'did' && (did?.undone ? 'Undone' : did?.actions.length ? 'Done' : `${name} says`)}
            {phase === 'review' && 'Is this right?'}
            {phase === 'done' && `Done — ${count} change${count === 1 ? '' : 's'} made`}
            {(phase === 'nothing' || phase === 'error') && (phase === 'nothing' ? 'Nothing heard' : 'Something went wrong')}
          </div>
          <div className="truncate text-[12px] text-muted">
            {phase === 'listening' && (engine.pushToTalk ? 'Let go of Ctrl + Alt when you’re done.' : 'Stop talking for a moment when you’re done.')}
            {phase === 'typing' && 'Type, then press Enter. Esc closes.'}
            {phase === 'thinking' && 'Thinking…'}
            {phase === 'did' && (did?.actions.length ? `Undo it here or in ${name}’s log.` : '')}
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

      {phase === 'typing' && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const t = typed.trim()
            if (!t) return
            woke.current = false
            setText(t)
            void act(t)
          }}
        >
          <input
            autoFocus
            className="w-full select-text rounded-lg border border-line bg-canvas px-3 py-2 text-[14px] outline-none"
            placeholder="Add milk to my tasks for tomorrow…"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        </form>
      )}

      {phase === 'error' && (
        <button className="btn-ghost self-start rounded-lg border border-line px-3 py-1.5 text-sm" onClick={() => void listen()}>
          Try again
        </button>
      )}

      {phase === 'did' && did && (
        <>
          <p className="select-text text-[14px] leading-snug">{did.reply}</p>
          {did.actions.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-lg border border-line bg-canvas px-3 py-2">
              {did.actions.map((a) => {
                const d = describe(a, currency)
                return (
                  <li key={a.key} className={`flex items-baseline gap-2 text-[13px] ${did.undone ? 'line-through opacity-60' : ''}`}>
                    <span className="w-5 shrink-0 text-center">{d.icon}</span>
                    <span className="font-semibold">{d.verb}</span>
                    <span className="min-w-0 truncate">{d.text}</span>
                    {d.detail && <span className="ml-auto shrink-0 text-[11px] text-muted">{d.detail}</span>}
                  </li>
                )
              })}
            </ul>
          )}
          <div className="flex items-center gap-2">
            {did.logId && did.actions.length > 0 && (
              <button
                className="btn px-3 py-1.5"
                disabled={did.undone}
                onClick={async () => {
                  const e = did.logId ? await api.get('bauer_log', did.logId) : null
                  if (e) await undoLog(e)
                  setDid({ ...did, undone: true })
                }}
              >
                <Icon name="reset" /> {did.undone ? 'Undone' : 'Undo'}
              </button>
            )}
            <button className="btn-ghost rounded-lg px-3 py-1.5 text-sm" onClick={() => void api.app.goto('nova')}>
              {name}’s log
            </button>
            <button className="btn-ghost ml-auto rounded-lg px-3 py-1.5 text-sm" onClick={() => void listen()}>
              <Icon name="mic" /> More
            </button>
          </div>
        </>
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
        <Icon name={phase === 'done' || phase === 'did' ? 'check' : 'mic'} size={18} weight="fill" />
      </span>
    </div>
  )
}
