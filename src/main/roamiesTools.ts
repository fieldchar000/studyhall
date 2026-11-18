// Roamies' own tools, running in Nova. tools.mjs (copied unchanged from Roamies) holds them: act_in_app (work your
// apps: click by words, fill fields by label, dropdowns and date pickers, scroll, keys), read_window, take_screenshot,
// list_windows, open (any app, file, folder or site), read_file, list_files, search_files, write_file, run_command
// (with Roamies' safety rules), draw (rings, labels, cards, walkthroughs that wait for your click, buttons, typing),
// see_photo, web_search, web_fetch, plan_steps, the promises list (remember_commitment, update_commitment,
// snooze_reminder, list_commitments, show_list), forget_fact and focus.
// This file is Studyhall's side: it gives tools.mjs what Roamies' app gives it (its hands helper, the overlay, a
// yes/no question, the promises store), and turns each tool into one of Nova's (Agent SDK) tools.

import { app, clipboard, shell, type WebContents } from 'electron'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { getPrefs } from './prefs'
import { get, getProfileId, getSetting, setSetting } from './db'
import { inkClear, inkClick, inkHooks, inkPlay, inkReminders, inkStale, lookAtRect, orbEmote, setHandsActive, showCards } from './bauer'
import { reportClicks, voiceConfirm, voiceSay } from './voice'
import { startFocus, stopFocus } from './buddy'
import { screen } from 'electron'

type Any = any // eslint-disable-line @typescript-eslint/no-explicit-any
type Tool = typeof import('@anthropic-ai/claude-agent-sdk').tool

const OFFSCREEN = process.env.STUDYHALL_OFFSCREEN === '1'

/** Roamies' hands helper (Rust, built on GitHub: native/roamies-hands). */
export const handsHelper = (): string => (app.isPackaged ? join(process.resourcesPath, 'roamies-hands.exe') : join(app.getAppPath(), 'build', 'roamies-hands.exe'))

let rt: Any = null
let store: Any = null
let booting: Promise<Any> | null = null

// What the current request is (set by the conversation for each turn).
export const turnHooks = {
  /** Speak a drawing's line now (in order with the reply); false when nothing can be said. */
  speak: (_text: string): boolean => false,
  /** A drawn button was pressed that asks Nova something ("Quiz me on this"): a new request with these words. */
  ask: (_text: string): void => {},
  /** Something to hand to a background agent (a drawing's handoff). */
  handoff: (_task: string): void => {},
  /** The steps checklist (plan_steps). */
  plan: (_args: Any): void => {}
}

// Notes for the next request (a quiz answered on a drawn card, the drawing cleared), told to Nova once.
let notes: string[] = []
export function roamiesNotes(): string {
  const n = notes.join(' ')
  notes = []
  return n
}

const userName = (): string => {
  try {
    const p = get<{ name?: string; display_name?: string }>('profiles', getProfileId())
    return (p?.name || p?.display_name || '').split(' ')[0] || 'the user'
  } catch {
    return 'the user'
  }
}

const fmtWhen = (ms: number): string => {
  const d = new Date(ms)
  const now = new Date()
  const day = new Date(d)
  day.setHours(0, 0, 0, 0)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((day.getTime() - today.getTime()) / 864e5)
  const time = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(':00', '').replace(' ', '')
  const date = diff === 0 ? 'today' : diff === 1 ? 'tomorrow' : diff === -1 ? 'yesterday' : diff > 1 && diff < 7 ? d.toLocaleDateString('en-GB', { weekday: 'long' }) : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  return `${date} ${time}`
}

// The promises card (ink.js reminders): open it for a while, or just refresh it if it's open.
function showList(seconds = 20, flash: string | null = null): void {
  if (!store) return
  const { today, later } = store.listItems()
  inkReminders({ today, later, seconds, ...(flash ? { flash } : {}) })
}

function commitmentsText(): string {
  if (!store) return ''
  return store
    .openCommitments()
    .map((c: Any) => `${c.id} ${c.text}${c.due ? ` (due ${fmtWhen(c.due)})` : ''}${c.repeat ? ` [repeats ${store.repeatLabel(c.repeat)}]` : ''}`)
    .join('\n')
}

/** The memory part of <live-state>: open promises, what's done today, and lasting facts (with ids for forget_fact). */
export function memoryBlock(context: string): string {
  if (!store) return ''
  const { today } = store.listItems()
  const done = today.filter((i: Any) => i.done).map((i: Any) => i.text)
  const facts = store.pickFacts(context, 40)
  const open = commitmentsText()
  return [
    `Open commitments:${open ? `\n${open}` : ' none'}`,
    done.length ? `Done today: ${done.join('; ')}` : '',
    `What you remember about them:${facts.length ? `\n${facts.map((f: Any) => `${f.id} ${f.text}`).join('\n')}` : ' nothing yet'}`
  ]
    .filter(Boolean)
    .join('\n')
}

// Reminders: due promises are said out loud, the globe does its "remind" move and the list flashes the one that's due.
let fired: Any[] = []
async function reminderTick(): Promise<void> {
  if (!store) return
  const due: Any[] = await store.takeDueReminders(Date.now()).catch(() => [])
  for (const c of due) {
    fired = [...fired.filter((x) => x.id !== c.id), c].slice(-10)
    orbEmote('remind')
    voiceSay(`${c.kind === 'reminder' ? 'Reminder' : 'Hey'}: ${c.text}.`)
    showList(30, c.id)
  }
}

// Clicks from any app, while a drawing waits for one (a walkthrough step) or watches its window for a change.
let inkWaiting = false
let watchingClicks = false
const syncClicks = (): void => reportClicks(inkWaiting || watchingClicks)
export function roamiesClick(): void {
  const p = screen.getCursorScreenPoint()
  if (inkWaiting) inkClick(p)
  if (watchingClicks) rt?.ink.userClick({ x: p.x, y: p.y })
}

/** Esc anywhere: stop drawing (and the drawing goes), as Roamies does. */
export function roamiesEsc(): void {
  rt?.ink.stop(true)
  inkClear({ all: true, stop: true })
}

// News from the overlay (ink.js): a drawing started, a wait finished, a card closed or pinned, a button pressed…
inkHooks.event = (msg) => {
  if (!rt) return
  const t = String(msg.type ?? '')
  if (t === 'draw_started') rt.ink.started(msg.id, msg.seg)
  else if (t === 'draw_wait_done') rt.ink.waitDone(msg.id, msg.beat, msg.result)
  else if (t === 'ink_closed') rt.ink.closed(msg.part)
  else if (t === 'ink_pinned') rt.ink.pinned(msg.part, !!msg.on)
  else if (t === 'ink_cleared') rt.ink.cleared()
  else if (t === 'quiz_done') {
    const n = rt.ink.quizDone(msg.part, msg.picks)
    if (n) notes.push(n)
  } else if (t === 'ink_action') {
    const a = rt.ink.button(msg.part)
    if (!a) return
    if (a.do === 'ask') turnHooks.ask(String(a.value))
    else if (a.do === 'open' && /^https?:\/\//i.test(String(a.value))) void shell.openExternal(String(a.value))
    else if (a.do === 'copy') clipboard.writeText(String(a.value))
  } else if (t === 'open_link' && /^https?:\/\//i.test(String(msg.url))) void shell.openExternal(String(msg.url))
  else if (t === 'list_toggle' && store) {
    const c = store.getCommitment(String(msg.id))
    if (c) void store.updateCommitment(c.id, { status: c.status === 'done' ? 'open' : 'done' }).then(() => showList(0))
  } else if (t === 'card_image' && typeof msg.data === 'string') {
    // "Save" on a card: a picture of it in Pictures\Nova cards.
    const dir = join(app.getPath('pictures'), 'Nova cards')
    const name = `${String(msg.title ?? 'card').replace(/[^\w -]+/g, '').slice(0, 50) || 'card'} ${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.png`
    void mkdir(dir, { recursive: true }).then(() => writeFile(join(dir, name), Buffer.from(String(msg.data).replace(/^data:image\/\w+;base64,/, ''), 'base64')))
  } else if (t === 'invoke' && msg.cmd === 'ink_wait') {
    inkWaiting = !!(msg.args as Any)?.on
    syncClicks()
  }
}

/** Roamies' tools, made once (the promises store and the helper are shared by every conversation). */
export function roamies(): Promise<Any> {
  booting ??= (async () => {
    // Where Roamies keeps promises and facts: Studyhall's own Nova folder (a test copy uses its own data folder).
    // (A test copy keeps its own, separate from your real Nova folder.)
    process.env.ROAMIES_DATA_DIR = join(app.getPath('userData'), OFFSCREEN ? 'nova-test' : 'nova')
    // The hands helper: never in automated tests, which must not touch your real windows.
    if (!OFFSCREEN && existsSync(handsHelper())) process.env.ROAMIES_HANDS = handsHelper()
    store = await import('./roamies/store.mjs')
    // Facts Nova kept before (v0.40–v0.45) move into Roamies' memory once.
    const old = getSetting<{ text: string }[]>('nova_facts')
    if (old?.length) {
      for (const f of old) if (f?.text) await store.addFact(f.text)
      setSetting('nova_facts', null)
    }
    const { createTools } = await import('./roamies/tools.mjs')
    rt = createTools({
      allowActions: () => (getPrefs().novaHands ?? 'off') !== 'off',
      ui: (m: Any) => {
        if (m.kind === 'hands') {
          if (m.on === true) setHandsActive(true)
          else if (m.on === false) setHandsActive(false)
          if (m.step?.bounds) {
            const [x, y, w, h] = m.step.bounds
            lookAtRect({ x, y, width: w, height: h })
          }
        } else if (m.kind === 'agent') {
          const e = m.e ?? {}
          if (e.type === 'draw') {
            const first = (e.beats ?? []).flatMap((b: Any) => b.marks ?? []).find((x: Any) => x.at?.rect)
            const near = first ? { x: first.at.rect[0] + first.at.rect[2] / 2, y: first.at.rect[1] + first.at.rect[3] / 2 } : Array.isArray(e.win) ? { x: e.win[0] + e.win[2] / 2, y: e.win[1] + e.win[3] / 2 } : null
            inkPlay(e, near)
          } else if (e.type === 'ink_clear') inkClear({ screen: !!e.screen, stop: !!e.stop })
          else if (e.type === 'ink_stale') inkStale()
        }
      },
      ask: async (q: { placeholder?: string; choices?: string[] }) => ((await voiceConfirm(String(q?.placeholder ?? 'Allow this?'))) ? 'Allow' : "Don't allow"),
      openUrl: (u: string) => void shell.openExternal(u),
      onCommitments: () => showList(20),
      focus: { start: async (minutes?: number, task?: string) => startFocus(minutes ?? 25, task ?? 'your work'), stop: async () => stopFocus() },
      firedReminders: () => fired,
      showList: () => showList(20),
      fmtWhen,
      commitmentsText,
      userName: userName(),
      onPlan: (args: Any) => turnHooks.plan(args),
      speak: (text: string) => turnHooks.speak(text),
      onHandoff: (task: string) => turnHooks.handoff(task),
      watchClicks: (on: boolean) => {
        watchingClicks = on
        syncClicks()
      },
      onInkGone: (why: string) => notes.push(`The drawing on screen went away (${why}).`),
      workdir: homedir(),
      pointScale: () => 'pixels',
      skipAllow: () => false
    })
    setInterval(() => void reminderTick().catch(() => {}), 15_000).unref()
    return rt
  })()
  return booting
}

/** A new request starts (what was seen before may be another page by now) / ends (marks of a request that drew
 *  nothing go). */
export const roamiesTurnStart = (): void => void rt?.nextTurn()
export const roamiesTurnEnd = (): void => void rt?.ink.endRequest()

// ---------- Roamies' tools as Nova's tools ----------

let callSeq = 0
let abort = new AbortController()
/** Stop what's running (talking to Nova again, or Esc): a tool waiting on something ends at once. */
export function roamiesAbort(): void {
  abort.abort()
  abort = new AbortController()
}

const shapeOf = (t: Any, drawShape: Any): Any => t.parameters?.shape ?? (t.name === 'draw' ? drawShape : (t.parameters?.out ?? t.parameters?._def?.out)?.shape) ?? {}

/** Every Roamies tool except the ones named in skip, as Agent SDK tools. */
export async function roamiesSdkTools(tool: Tool, skip: Set<string>, onSlow: (name: string) => void): Promise<Any[]> {
  const r = await roamies()
  const { DrawShape } = await import('./roamies/draw.mjs')
  const SLOW = new Set(['web_search', 'web_fetch', 'see_photo', 'take_screenshot', 'read_window', 'act_in_app', 'run_command', 'search_files', 'list_windows'])
  return r.tools
    .filter((t: Any) => !skip.has(t.name))
    .map((t: Any) =>
      tool(t.name, t.description, shapeOf(t, DrawShape), async (args: Any) => {
        if (SLOW.has(t.name)) onSlow(t.name)
        // The full check Roamies' agent framework runs before a tool (it also tidies small slips in how a call is written).
        let input = args
        const parsed = t.parameters?.safeParse?.(args)
        if (parsed && !parsed.success) return { content: [{ type: 'text', text: `That call doesn't fit: ${parsed.error.issues.slice(0, 6).map((i: Any) => `${i.path.join('.')}: ${i.message}`).join('; ')}` }], isError: true }
        if (parsed?.success) input = parsed.data
        try {
          const out = await t.execute(input, { toolCallId: `r${++callSeq}`, signal: abort.signal })
          if (OFFSCREEN) console.info(`tool ${t.name}>`, typeof out === 'string' ? out.slice(0, 400) : '[content]')
          if (typeof out === 'string') return { content: [{ type: 'text', text: out }] }
          const content = (out?.content ?? []).map((c: Any) => (c.type === 'image' ? { type: 'image', data: c.data, mimeType: c.mediaType ?? c.mimeType ?? 'image/jpeg' } : { type: 'text', text: String(c.text ?? '') }))
          return { content: content.length ? content : [{ type: 'text', text: 'Done.' }] }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          if (OFFSCREEN) console.info(`tool ${t.name} error>`, msg.slice(0, 400))
          return { content: [{ type: 'text', text: msg }], isError: true }
        }
      })
    )
}

/** Promises → Studyhall tasks happen only when asked; this shows Nova's own steps checklist (plan_steps). */
export function showPlanCard(state: { id: string; title: string; steps: string[]; now: number[]; skipped: { step: number; why: string }[]; done: Set<number> }): void {
  showCards([
    {
      id: state.id,
      kind: 'steps',
      title: state.title,
      items: state.steps.map((s, i) => {
        const n = i + 1
        const skip = state.skipped.find((x) => x.step === n)
        return { label: s, detail: skip ? `✗ ${skip.why}` : state.done.has(n) ? '✓ done' : state.now.includes(n) ? '… now' : undefined }
      })
    }
  ])
}
