// The Bauer log: everything Bauer did on his own, newest first, each with Undo.
// You can also type to Bauer here — same as saying it.

import { useEffect, useState } from 'react'
import type { AiStatus, BauerLogEntry } from '@shared/types'
import { answerQuestion, isQuestion, runBauer, say, undoLog } from '@/lib/bauer/agent'
import { api, useLive, useRows } from '@/lib/data'
import { navigate } from '@/lib/nav'
import { useMode } from '@/lib/profile'
import { isPhoneApp } from '@/lib/platform'
import { Icon } from '@/components/ui'

type Desc = { icon: string; verb: string; text: string; detail: string }

const when = (iso: string): string => {
  const d = new Date(iso)
  const today = new Date().toDateString() === d.toDateString()
  const y = new Date(Date.now() - 864e5).toDateString() === d.toDateString()
  const t = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return today ? `Today ${t}` : y ? `Yesterday ${t}` : `${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} ${t}`
}

export function BauerLogPage(): React.JSX.Element {
  const mode = useMode()
  const rows = useRows('bauer_log')
  const { data: prefs } = useLive(['prefs'], () => api.prefs.get(), [])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [reply, setReply] = useState('')
  const [ai, setAi] = useState<AiStatus | null>(null)

  useEffect(() => {
    if (isPhoneApp()) return
    void api.ai.status().then(setAi).catch(() => {})
    return api.ai.onStatus(setAi)
  }, [])

  const send = async (): Promise<void> => {
    const t = text.trim()
    if (!t || busy) return
    setBusy(true)
    setReply('')
    try {
      const r = isQuestion(t) ? await answerQuestion(t, 'typed') : (await runBauer(t, { source: 'typed', mode })).reply
      setReply(r)
      setText('')
      if (prefs?.bauerTalk !== false) say(r)
    } catch (e) {
      setReply(`Something went wrong: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const list = [...(rows ?? [])].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-8 py-7">
      <header>
        <div className="label-caps">Hands-free</div>
        <h1 className="font-display text-3xl font-semibold">Bauer log</h1>
        <p className="mt-1 text-sm text-muted">Everything Bauer did on his own, newest first. Anything wrong? Undo it.</p>
      </header>

      <section className="card p-4">
        <div className="flex gap-2">
          <input
            className="field-boxed flex-1"
            placeholder="Tell Bauer… “move gym to 7 tomorrow”, “when is my exam?”"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void send()}
            disabled={busy}
          />
          <button className="btn-primary" onClick={() => void send()} disabled={busy || !text.trim()}>
            {busy ? 'Thinking…' : 'Send'}
          </button>
        </div>
        {reply && (
          <p className="mt-3 flex items-start gap-2 text-sm">
            <Icon name="spark" size={16} className="mt-0.5 shrink-0 text-brass" /> {reply}
          </p>
        )}
        <p className="mt-2 text-[11.5px] text-muted">
          {isPhoneApp()
            ? 'On the pad Bauer understands the common ways of saying things. The smarter AI runs on your PC.'
            : ai?.installed
              ? `Understood by Bauer’s brain, the AI on this PC${ai.running ? ' (awake)' : ''}. Nothing is sent anywhere.`
              : 'Bauer understands the common ways of saying things. For normal speech, download his brain in Settings → Voice.'}{' '}
          {!isPhoneApp() && !ai?.installed && (
            <button className="text-accent underline" onClick={() => navigate({ name: 'settings' })}>
              Open Settings
            </button>
          )}
        </p>
      </section>

      {list.length === 0 && <p className="text-sm text-muted">Nothing yet. Say “Hey Bauer” or type above.</p>}
      <ol className="flex flex-col gap-3">
        {list.map((e) => (
          <LogItem key={e.id} e={e} />
        ))}
      </ol>
    </div>
  )
}

function LogItem({ e }: { e: BauerLogEntry }): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  let acts: Desc[] = []
  let steps = 0
  try {
    acts = JSON.parse(e.actions) as Desc[]
    steps = (JSON.parse(e.undo) as unknown[]).length
  } catch {
    /* old row */
  }
  const undone = !!e.undone_at
  return (
    <li className={`card p-4 ${undone ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-muted">
            {when(e.created_at)} · {e.source === 'typed' ? 'typed' : 'said'}
            {e.brain === 'ai' ? ' · AI' : ''}
            {undone ? ' · undone' : ''}
          </div>
          <p className="mt-0.5 text-[13px] text-muted italic">“{e.said}”</p>
          {acts.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {acts.map((a, i) => (
                <li key={i} className={`flex items-baseline gap-2 text-sm ${undone ? 'line-through' : ''}`}>
                  <span className="w-5 shrink-0 text-center">{a.icon}</span>
                  <span className="font-semibold">{a.verb}</span>
                  <span className="min-w-0 truncate">{a.text}</span>
                  {a.detail && <span className="shrink-0 text-xs text-muted">{a.detail}</span>}
                </li>
              ))}
            </ul>
          )}
          {e.reply && <p className="mt-2 text-sm">{e.reply}</p>}
        </div>
        {steps > 0 && (
          <button
            className="btn shrink-0"
            disabled={undone || busy}
            onClick={async () => {
              setBusy(true)
              await undoLog(e)
              setBusy(false)
            }}
          >
            <Icon name="reset" size={14} /> {undone ? 'Undone' : 'Undo'}
          </button>
        )}
      </div>
    </li>
  )
}
