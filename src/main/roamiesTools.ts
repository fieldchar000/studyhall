// Roamies' own tools, running in Nova. tools.mjs (copied unchanged from Roamies) holds them: act_in_app (work your
// apps: click by words, fill fields by label, dropdowns and date pickers, scroll, keys), read_window, take_screenshot,
// list_windows, open (any app, file, folder or site), read_file, list_files, search_files, write_file, run_command
// (with Roamies' safety rules), draw (rings, labels, cards, walkthroughs that wait for your click, buttons, typing),
// see_photo, web_search, web_fetch, plan_steps, the promises list (remember_commitment, update_commitment,
// snooze_reminder, list_commitments, show_list), forget_fact and focus.
// This file is Studyhall's side: it gives tools.mjs what Roamies' app gives it (its hands helper, the overlay, a
// yes/no question, the promises store), and turns each tool into one of Nova's (Agent SDK) tools.

import { app, BrowserWindow, clipboard, desktopCapturer, nativeImage, shell, type WebContents } from 'electron'
import { fork } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { getPrefs } from './prefs'
import { get, getProfileId, getSetting, setSetting } from './db'
import { agentsUi, hiddenFromCaptures, inkAskMarks, inkBoardPic, inkLayer, orbPanel, inkClear, inkSnapshot, inkClick, inkHooks, inkPlay, inkReminders, inkStale, lookAtRect, orbEmote, setHandsActive, showCards } from './bauer'
import { reportClicks, voiceBusy, voiceConfirm, voiceSay } from './voice'
import { stageDone } from './novaStage'
import { lessonFetch } from './lessonReader'
import { illustration } from './illustrations'
import { findOnPage, lastLessonId, picture as lessonPicture, pictureReady } from './lessonReader'

// A slide on the study board: rings on words (text) or on part of its picture (area: fractions), and how each looks.
type BoardSlide = { page: number; label?: string; rings?: { id: string; text?: string; area?: number[]; style?: 'ring' | 'underline' | 'highlight'; label?: string }[] }
import { claudeAgentRoute, claudeBlocked, claudeModelId, claudeReady } from './claude'
import { buddyHooks, startFocus, stopFocus } from './buddy'
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
  plan: (_args: Any): void => {},
  /** Can Nova take a request now (its conversation is set up)? */
  ready: (): boolean => false
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

// ---------- Nova's page: the promises list ----------
export type PromiseItem = { id: string; text: string; due: number | null; when: string; done: boolean; overdue: boolean; kind: string; repeat: string | null }
/** Today (with what's done today) and later, as Roamies' list card shows them. */
export async function listPromises(): Promise<{ today: PromiseItem[]; later: PromiseItem[] }> {
  await roamies()
  const { today, later } = store.listItems()
  const shape = (i: Any): PromiseItem => ({ id: i.id, text: i.text, due: i.due ?? null, when: i.due ? fmtWhen(i.due) : '', done: !!i.done, overdue: !!i.overdue, kind: i.kind, repeat: i.repeat ? store.repeatLabel(i.repeat) : null })
  return { today: today.map(shape), later: later.map(shape) }
}
/** A button on the list: done / not done, drop it, snooze it (minutes, or 'tomorrow' for 9 am), a new time, new words. */
export async function changePromise(id: string, op: 'done' | 'open' | 'drop' | 'snooze' | 'due' | 'text', value?: string | number | null): Promise<boolean> {
  await roamies()
  const c = store.getCommitment(String(id))
  if (!c) return false
  if (op === 'done' || op === 'open') await store.updateCommitment(c.id, { status: op })
  else if (op === 'drop') await store.updateCommitment(c.id, { status: 'dropped' })
  else if (op === 'snooze') {
    const at = value === 'tomorrow' ? (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.getTime() })() : Date.now() + Math.max(1, Number(value) || 10) * 60_000
    await store.updateCommitment(c.id, { dueMs: at, keepSeries: true })
  } else if (op === 'due') await store.updateCommitment(c.id, { dueMs: value == null || value === '' ? null : new Date(String(value)).getTime() })
  else if (op === 'text') {
    const words = String(value ?? '').trim().slice(0, 200)
    if (words.length < 2 || words === c.text) return false
    // The store keeps each one's words fixed: a new entry with the new words, the same time and repeat, and the old one goes.
    await store.addCommitment(words, c.due ?? null, c.kind ?? 'commitment', c.repeat ?? null)
    await store.updateCommitment(c.id, { status: 'dropped' })
  }
  showList(0) // (refreshes the list card if it's open)
  return true
}
/** A new one from the page: words, and an optional time (local, YYYY-MM-DDTHH:mm). */
export async function addPromise(text: string, due: string | null): Promise<boolean> {
  await roamies()
  const words = String(text ?? '').trim().slice(0, 200)
  if (words.length < 2) return false
  const ms = due ? new Date(due).getTime() : null
  await store.addCommitment(words, Number.isFinite(ms) ? ms : null, ms ? 'reminder' : 'commitment')
  showList(0)
  return true
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
    orbEmote('remind', true)
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
  orbPanel('close')
}

// News from the overlay (ink.js): a drawing started, a wait finished, a card closed or pinned, a button pressed…
inkHooks.event = (msg) => {
  if (!rt) return
  const t = String(msg.type ?? '')
  if (t === 'draw_started') rt.ink.started(msg.id, msg.seg)
  else if (t === 'draw_wait_done') rt.ink.waitDone(msg.id, msg.beat, msg.result)
  else if (t === 'ink_closed') {
    rt.ink.closed(msg.part)
    if (board?.part === msg.part) board = null
  } else if (t === 'board_gone') {
    board = null
    notes.push('The study board had been closed, so those rings weren\'t drawn. Show the board again with show_board (all of it) if it still helps.')
  }
  else if (t === 'ink_pinned') rt.ink.pinned(msg.part, !!msg.on)
  else if (t === 'ink_cleared') {
    rt.ink.cleared()
    board = null
  }
  else if (t === 'screen_marks') marksWaiters.get(String(msg.id))?.((msg.rects as number[][]) ?? [])
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
  // Copy on the answer card (a draft or code): to your clipboard.
  else if (t === 'copy_text' && typeof msg.text === 'string') clipboard.writeText(msg.text.slice(0, 50_000))
  else if (t === 'list_toggle' && store) {
    const c = store.getCommitment(String(msg.id))
    if (c) void store.updateCommitment(c.id, { status: c.status === 'done' ? 'open' : 'done' }).then(() => showList(0))
  } else if (t === 'card_images' && typeof msg.id === 'string') {
    snapshotWaiters.get(msg.id)?.(Array.isArray(msg.images) ? (msg.images as { title: string; data: string }[]) : [])
    snapshotWaiters.delete(msg.id)
  } else if (t === 'card_image' && typeof msg.data === 'string') {
    cardSaved() // ("Save" on a card: the explanation goes to Notes too)
    // "Save" on a card: a picture of it in Pictures\Nova cards.
    const dir = join(app.getPath('pictures'), 'Nova cards')
    const name = `${String(msg.title ?? 'card').replace(/[^\w -]+/g, '').slice(0, 50) || 'card'} ${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.png`
    void mkdir(dir, { recursive: true }).then(() => writeFile(join(dir, name), Buffer.from(String(msg.data).replace(/^data:image\/\w+;base64,/, ''), 'base64')))
  } else if (t === 'agents_ready') agents?.sync()
  else if (t === 'agent_stop') agents?.stop(String(msg.id))
  else if (t === 'agent_answer') agents?.answer(String(msg.id), msg.allow === true)
  else if (t === 'agent_open') agents?.openFile(String(msg.id), String(msg.path ?? '')).catch(() => {})
  else if (t === 'agent_folder') agents?.openFolder(String(msg.id), { files: msg.files === true }).catch(() => {})
  else if (t === 'agent_dismiss') agents?.dismiss(String(msg.id))
  else if (t === 'invoke' && msg.cmd === 'ink_wait') {
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
      aroundShot: hiddenFromCaptures,
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
      skipAllow: () => false,
      // Pictures of the lesson you have open (https://lesson.studyhall.app/…) come from Studyhall itself.
      photoFetch: lessonFetch,
      shotBusy: async (file: string) => busyCells(nativeImage.createFromPath(file)),
      iconFetch: (id: string) => illustration(id),
      // The study board: each slide's picture, and where the words to ring are on it (from the lesson reader).
      boardFetch: async (m: Any) => {
        const id = lastLessonId()
        if (!id) throw new Error('read the deck or PDF with read_lesson first')
        const slides = await Promise.all(
          ((m.slides ?? []) as BoardSlide[]).map(async (s) => {
            const buf = await lessonPicture(id, s.page)
            return { ...s, src: buf ? `data:image/jpeg;base64,${buf.toString('base64')}` : null, rings: (s.rings ?? []).map((r) => ({ ...r, rect: r.area ?? (r.text ? findOnPage(id, s.page, r.text) : null) })) }
          })
        )
        const missed = slides.flatMap((s) => s.rings.filter((r) => !r.rect).map((r) => `"${r.text ?? r.id}" on page ${s.page}`))
        if (missed.length) notes.push(`Couldn't find ${missed.join(', ')} (use words exactly as they are on the slide).`)
        return { slides }
      },
      // Automated tests: the screenshot is of a test window (placed, for drawing, as if at the top left of the main
      // screen), never your real screen.
      ...(OFFSCREEN
        ? {
            hostShot: async ({ file }: { file: string }) => {
              const shot = await testWindowShot()
              if (!shot) return { ok: false, error: 'Screen capture failed.' }
              await writeFile(file, Buffer.from(shot.data, 'base64'))
              const wa = screen.getPrimaryDisplay().workArea
              const img = nativeImage.createFromBuffer(Buffer.from(shot.data, 'base64')).getSize()
              return { ok: true, pixels: [img.width, img.height], bounds: [wa.x, wa.y, shot.width, shot.height], title: `"${shot.title}"` }
            }
          }
        : {})
    })
    setInterval(() => void reminderTick().catch(() => {}), 15_000).unref()
    buddyHooks.promises = () => store.openCommitments().map((c: Any) => ({ text: String(c.text), due: c.due ?? null }))
    await startAgents()
    return rt
  })()
  return booting
}

// ---------- Background agents (Roamies' agents.mjs + agentrun.mjs) ----------
// "Send an agent to make me a revision page": it works on its own, in its own process and its own folder in
// Documents\Nova Agents, while you carry on. Its row shows in the top-right corner (agent-home.js); when it's done,
// Nova tells you at the next quiet moment.

let agents: Any = null
let desk: Any = null
let requestNo = 0
/** The picture for this request, for send_agent's "snap" input (set by novaBrain.ts each request). */
export const agentPicture: { current: { type: 'image'; mediaType: string; data: string } | null } = { current: null }
/** A picture of the window in front (a test window in automated tests), for an agent asked to work from "this". */
export async function frontPicture(): Promise<{ type: 'image'; mediaType: string; data: string } | null> {
  if (OFFSCREEN) {
    const shot = await testWindowShot()
    return shot ? { type: 'image', mediaType: 'image/jpeg', data: shot.data } : null
  }
  const { see } = await import('./eyes')
  const seen = await see({ screenshot: true }).catch(() => null)
  const data = seen?.image?.replace(/^data:image\/\w+;base64,/, '')
  return data ? { type: 'image', mediaType: 'image/jpeg', data } : null
}
/** Is Nova answering something right now (set by novaBrain.ts)? */
export const agentGates = { busy: (): boolean => false }

/** Where agents work: Documents\Nova Agents (a test copy keeps its own, inside its data folder). */
export const agentsFolder = (): string => (OFFSCREEN ? join(app.getPath('userData'), 'nova-test', 'Nova Agents') : join(app.getPath('documents'), 'Nova Agents'))

async function startAgents(): Promise<void> {
  const { createAgents, holdAfterLaunch, newsDesk, wantsAgent: wants } = await import('./roamies/agents.mjs')
  wantsAgentFull = wants
  const safety = await import('./roamies/safety.mjs')
  agents = createAgents({
    // Each agent is its own Node process (Studyhall's own runtime, as plain Node), so a heavy one never slows Nova.
    fork: (mod: string, args: string[], opts: Any) => fork(mod, args, { ...opts, env: { ...opts.env, ELECTRON_RUN_AS_NODE: '1' } }),
    ui: (m: Any) => {
      if (m.kind === 'agents') agentsUi(m.e)
    },
    root: agentsFolder(),
    userName: userName(),
    runner: join(__dirname, 'agentrun.js'),
    safety: { checkRead: safety.checkRead, checkWrite: safety.checkWrite, checkOpen: safety.checkOpen, checkLink: safety.checkLink },
    log: (kind: string, data: unknown) => {
      if (OFFSCREEN) console.info(`agents ${kind}>`, JSON.stringify(data))
    },
    config: {
      // Agents run on your Claude sign-in through Claude Code, like Nova: Sonnet (or the model you picked for Nova).
      model: async (type?: string) => {
        const p = getPrefs()
        const blocked = claudeBlocked(p)
        if (blocked) throw new Error(`Claude can't run an agent right now: ${blocked}.`)
        // Agents: Haiku finds things out and tidies (cheap and quick), Sonnet makes things (pages, documents, slides),
        // unless one model is picked for all of them on Nova's page.
        const choice = p.novaAgents ?? 'auto'
        const key = choice === 'haiku' || choice === 'sonnet' ? choice : type === 'maker' ? 'sonnet' : 'haiku'
        return { provider: 'anthropic', model: claudeModelId(key), route: 'claude-code', cc: claudeAgentRoute(), thinking: 'medium', budget: 120_000 }
      },
      creds: async () => ({}),
      allowActions: () => (getPrefs().novaHands ?? 'off') !== 'off',
      skipAllow: () => false,
      // "snap": the picture that goes with this request (what you circled, or the window in front).
      image: () => agentPicture.current,
      openUrl: (u: string) => shell.openExternal(u),
      open: async (p: string) => {
        await shell.openPath(p)
      },
      reveal: async (p: string) => shell.showItemInFolder(p)
    }
  })
  // deliver_to is for another folder they name ("put it on my Desktop"): never the agents' own folder (that made a
  // second copy), and in a test copy never anywhere outside it.
  const send = agents.tools.find((t: Any) => t.name === 'send_agent')
  const launch = send.execute
  send.execute = async (args: Any, ctx: Any) => {
    const a = { ...args }
    if (a.deliver_to) {
      const to = resolve(String(a.deliver_to).replace(/^~(?=$|[\\/])/, homedir())).toLowerCase()
      const own = [agentsFolder(), join(app.getPath('documents'), 'Nova Agents')].map((p) => resolve(p).toLowerCase())
      if (own.some((p) => to === p || to.startsWith(p + sep))) delete a.deliver_to
      else if (OFFSCREEN) throw new Error('This is a test copy: agents keep everything in their own folder.')
    }
    return launch(a, ctx)
  }
  rt.tools.push(...agents.tools)
  holdAfterLaunch(rt.tools, () => requestNo)
  // News from agents (done, stuck, waiting for a yes): Nova says it at the next quiet moment.
  desk = newsDesk({
    gates: () => ({ busy: agentGates.busy(), voice: voiceBusy() }),
    news: () => agents.news(),
    markTold: (ids: string[]) => agents.markTold(ids),
    userName: userName(),
    enqueue: (text: string, ids: string[]) => {
      agents.markTold(ids)
      turnHooks.ask(text)
    },
    say: (text: string) => voiceSay(text),
    signedIn: () => claudeReady() && turnHooks.ready()
  })
  setInterval(() => desk.tick(), 1000).unref()
  app.on('before-quit', () => agents?.stopAll())
}

/** "Send an agent to…" (Roamies' wantsAgent), checked without waiting for the agents to load. */
export const wantsAgent = (text: string): boolean => wantsAgentFull?.(String(text ?? '')) ?? false
let wantsAgentFull: ((t: string) => boolean) | null = null
/** The agents' corner hatches one while Nova writes the brief (on), or stops (off). */
export function agentsHatch(on: boolean): void {
  agentsUi({ type: on ? 'hatch' : 'hatch_off' })
}

/** The agents part of <live-state>, and news that rides along with what they just said. */
export function agentsBlock(said: string): string {
  if (!agents) return ''
  return [agents.liveText(), desk?.along(said) ?? ''].filter(Boolean).join('\n')
}

/** Stop what's showing: the globe's tool performances end (talking to Nova again, Esc). */
export function toolsStopped(): void {
  stageDone()
}

/** A new request starts (what was seen before may be another page by now) / ends (marks of a request that drew
 *  nothing go). */
export const roamiesTurnStart = (): void => {
  requestNo++
  void rt?.nextTurn()
}
export const roamiesTurnEnd = (): void => {
  void rt?.ink.endRequest()
  setHandsActive(false) // (never left on after a request, or the globe couldn't be grabbed)
}

// ---------- Roamies' tools as Nova's tools ----------

let callSeq = 0
let abort = new AbortController()
// ---------- Pictures of the cards on screen (saving an explanation as a note) ----------
const snapshotWaiters = new Map<string, (images: { title: string; data: string }[]) => void>()
let snapSeq = 0
export function cardSnapshots(): Promise<{ title: string; data: string }[]> {
  const id = `s${++snapSeq}`
  return new Promise((resolve) => {
    snapshotWaiters.set(id, resolve)
    inkSnapshot(id)
    setTimeout(() => {
      if (snapshotWaiters.delete(id)) resolve([])
    }, 3000)
  })
}
/** Someone pressed Save on a card (explanations.ts listens). */
export const cardSavedHooks = { saved: (): void => {} }
const cardSaved = (): void => cardSavedHooks.saved()

/** Stop what's running (talking to Nova again, or Esc): a tool waiting on something ends at once. */
export function roamiesAbort(): void {
  setHandsActive(false)
  abort.abort()
  abort = new AbortController()
  toolsStopped()
}

/** Automated tests: a picture of the test slide window (if a test opened one) or Studyhall's own hidden window. */
export async function testWindowShot(): Promise<{ data: string; title: string; width: number; height: number } | null> {
  const wins = BrowserWindow.getAllWindows()
  const w = wins.find((x) => x.getTitle().startsWith('Nova test')) ?? wins.find((x) => x.webContents.getURL().endsWith('index.html'))
  const img = w ? await w.webContents.capturePage().catch(() => null) : null
  if (!w || !img || img.isEmpty()) return null
  const b = w.getContentBounds()
  return { data: img.resize({ width: Math.min(1568, img.getSize().width) }).toJPEG(80).toString('base64'), title: w.getTitle(), width: b.width, height: b.height }
}

// What the tools that reach your real PC answer in an automated test copy (see roamiesSdkTools).
const TEST_STUB: Record<string, string> = {
  open: 'Opened it. (Automated test: nothing was really opened.)',
  run_command: '(Automated test: commands are not run.)',
  read_file: '(Automated test: your files are not read.)',
  list_files: '(Automated test: your files are not read.)',
  search_files: '(Automated test: your files are not searched.)',
  write_file: '(Automated test: nothing was written.)',
  read_window: '(Automated test: your windows are not read.)',
  list_windows: '(Automated test: your windows are not read.)',
  act_in_app: '(Automated test: nothing was clicked or typed.)'
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
        if (parsed && !parsed.success && OFFSCREEN) console.info(`tool ${t.name} invalid>`, JSON.stringify(parsed.error.issues.slice(0, 6)).slice(0, 600))
        if (parsed && !parsed.success) return { content: [{ type: 'text', text: `That call doesn't fit: ${parsed.error.issues.slice(0, 6).map((i: Any) => `${i.path.join('.')}: ${i.message}`).join('; ')}` }], isError: true }
        if (parsed?.success) input = parsed.data
        // Automated tests never touch your real PC: nothing is opened, run, read from your files or captured from
        // your screen (a screenshot shows Studyhall's own hidden test window instead).
        // (Automated tests: read_window reads only a hidden test page of the test's own, titled "Nova test…", never yours.)
        if (OFFSCREEN && t.name === 'read_window') {
          const tw = BrowserWindow.getAllWindows().find((w) => w.getTitle().startsWith('Nova test'))
          if (tw) return { content: [{ type: 'text', text: `Window "${tw.getTitle()}":\n${String(await tw.webContents.executeJavaScript('document.body.innerText')).slice(0, 8000)}` }] }
        }
        if (OFFSCREEN && TEST_STUB[t.name]) return { content: [{ type: 'text', text: TEST_STUB[t.name] }] }
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

/** Where a screenshot is busy (text, lines, pictures), as [x, y, w, h] in its pixels: small cells whose brightness
 *  varies, merged into runs along each row. Cards are placed on the rest (ink.js), so they don't cover the slide. */
function busyCells(img: Electron.NativeImage): number[][] {
  const { width: W, height: H } = img.getSize()
  if (!W || !H) return []
  const px = img.toBitmap() // BGRA
  const cell = Math.max(12, Math.round(W / 110))
  const out: number[][] = []
  for (let cy = 0; cy + cell <= H; cy += cell) {
    let run = -1
    for (let cx = 0; cx <= W; cx += cell) {
      let busy = false
      if (cx + cell <= W) {
        let n = 0
        let sum = 0
        let sq = 0
        let lo = 255
        let hi = 0
        for (let y = cy; y < cy + cell; y += 2)
          for (let x = cx; x < cx + cell; x += 2) {
            const i = (y * W + x) * 4
            const l = 0.114 * px[i] + 0.587 * px[i + 1] + 0.299 * px[i + 2]
            sum += l
            sq += l * l
            n++
            if (l < lo) lo = l
            if (l > hi) hi = l
          }
        const mean = sum / n
        busy = Math.sqrt(Math.max(0, sq / n - mean * mean)) > 12 || hi - lo > 70
      }
      if (busy && run < 0) run = cx
      if (!busy && run >= 0) {
        out.push([run, cy, cx - run, cell])
        run = -1
      }
    }
  }
  return out
}

// ---------- The study board as a tool of its own ----------
// The board that's up: it covers their slide, so rings for that slide go on the board's copy of it (add).
let board: { part: string; pages: number[]; notes: boolean } | null = null
/** The pages on the study board that's up now (null when there's none). */
export const boardOnScreen = (): number[] | null => board?.pages ?? null
/** Shows the study board now: the slides side by side, rings on the words, arrows between them. What it couldn't find. */
export async function showBoard(a: { title?: string; add?: boolean; slides: BoardSlide[]; links?: { from: string; to: string; label?: string; flow?: boolean }[]; notes?: { ring?: string; title: string; text: string }[] }): Promise<string> {
  const id = lastLessonId()
  if (!id) return 'Read the deck or PDF with read_lesson first.'
  // More rings (and arrows, notes) on the board that's up, without opening a new one.
  if (a.add) {
    if (!board) return 'There is no study board up now. Show one with show_board (without add).'
    const off = a.slides.filter((s) => !board!.pages.includes(s.page)).map((s) => s.page)
    const slides = a.slides
      .filter((s) => board!.pages.includes(s.page))
      .map((s) => ({ page: s.page, rings: (s.rings ?? []).map((r) => ({ ...r, rect: r.area ?? (r.text ? findOnPage(id, s.page, r.text) : null) })) }))
    if (OFFSCREEN) console.info('board+>', JSON.stringify({ slides: slides.map((s) => ({ page: s.page, rings: s.rings.map((r) => [r.id, r.text ?? r.area, r.style ?? 'ring', !!r.rect]) })), links: a.links, notes: a.notes }))
    inkPlay({ id: `board-${board.part}-${Date.now().toString(36)}`, seg: 0, beats: [{ n: 1, say: '', caption: '', voiced: false, marks: [{ kind: 'board', add: true, part: board.part, slides, links: a.links ?? [], notes: a.notes ?? [] }] }], last: true, win: null, busy: [] })
    const missed = slides.flatMap((s) => s.rings.filter((r) => !r.rect).map((r) => `"${r.text ?? r.id}" (slide ${s.page})`))
    return `Added to the study board${missed.length ? `, but couldn't find ${missed.join(', ')} (use the words exactly as written there)` : ''}${off.length ? `. Slide ${off.join(' and ')} isn't on the board (it shows ${board.pages.join(', ')}): show a new board for it` : ''}${a.notes?.length && !board.notes ? '. This board has no room for notes (it opened without any): say it, or draw a small card' : ''}.`
  }
  // The board opens at once: pictures already made go in now, the others fill in as they're made (one at a time,
  // the big slide first), so nothing waits on them.
  const slides = await Promise.all(
    a.slides.slice(0, 3).map(async (s) => {
      const buf = pictureReady(id, s.page) ? await lessonPicture(id, s.page) : null
      return { ...s, src: buf ? `data:image/jpeg;base64,${buf.toString('base64')}` : null, rings: (s.rings ?? []).map((r) => ({ ...r, rect: r.area ?? (r.text ? findOnPage(id, s.page, r.text) : null) })) }
    })
  )
  if (OFFSCREEN) console.info('board>', JSON.stringify({ slides: slides.map((s) => ({ page: s.page, rings: s.rings.map((r) => [r.id, r.text ?? r.area, r.style ?? 'ring', !!r.rect]) })), links: a.links, notes: a.notes }))
  const part = `b${Date.now().toString(36)}`
  board = { part, pages: slides.map((s) => s.page), notes: (a.notes ?? []).length > 0 }
  inkPlay({ id: `board-${part}`, seg: 0, beats: [{ n: 1, say: '', caption: '', voiced: false, marks: [{ kind: 'board', part, title: a.title, slides, links: a.links ?? [], notes: a.notes ?? [] }] }], last: true, win: null, busy: [] })
  void (async () => {
    for (const s of slides.filter((q) => !q.src)) {
      const buf = await lessonPicture(id, s.page)
      if (board?.part !== part) return
      if (buf) inkBoardPic(part, s.page, `data:image/jpeg;base64,${buf.toString('base64')}`)
    }
  })()
  const missed = slides.flatMap((s) => s.rings.filter((r) => !r.rect).map((r) => `"${r.text ?? r.id}" (slide ${s.page}${r.text ? '' : ': give text or area'})`))
  const ringIds = new Set(slides.flatMap((s) => s.rings.filter((r) => r.rect).map((r) => r.id)))
  const drawn = (a.links ?? []).filter((q) => ringIds.has(q.from) && ringIds.has(q.to)).length
  if (slides.length > 1 && !drawn) missed.push(`no arrow (give each slide a ring and link a ring on one to a ring on another by id)`)
  return `The study board is up: slides ${slides.map((s) => s.page).join(' and ')} side by side${missed.length ? `. Couldn't find ${missed.join(', ')} on the slide (use the words exactly as written there)` : ', rings and arrows drawn'}. Now say the link out loud in a sentence or two (and add a small card with draw if it helps).`
}

// ---------- Rings that outlive their page ----------
// A slide deck or PDF doesn't say when its page turns (PowerPoint's title stays the same; a PDF's address only changes
// after the #), so the rings would stay on the next slide. Every 1.5 s while something's marked on the screen, a small
// picture of the screen is taken (Nova's own drawings aren't in it) and what's under each mark is compared with how it
// looked: when most of them changed (a new slide, a scroll), the marks fade. Local and free; nothing leaves the PC.
const marksWaiters = new Map<string, (rects: number[][]) => void>()
function screenMarks(): Promise<number[][]> {
  const id = Math.random().toString(36).slice(2)
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      marksWaiters.delete(id)
      resolve([])
    }, 600)
    marksWaiters.set(id, (r) => {
      clearTimeout(t)
      marksWaiters.delete(id)
      resolve(r)
    })
    inkAskMarks(id)
  })
}
/** A half-size picture of the screen the layer is on, and how many of its pixels per DIP. Tests: their own window. */
async function screenThumb(layer: Electron.Rectangle): Promise<{ img: Electron.NativeImage; k: number; origin: { x: number; y: number } } | null> {
  if (OFFSCREEN) {
    const tw = BrowserWindow.getAllWindows().find((w) => w.getTitle().startsWith('Nova test'))
    const img = tw ? await tw.webContents.capturePage().catch(() => null) : null
    if (!img || img.isEmpty()) return null
    const small = img.resize({ width: Math.max(1, Math.round(img.getSize().width / 2)) })
    return { img: small, k: small.getSize().width / tw!.getContentBounds().width, origin: layer }
  }
  const d = screen.getDisplayMatching(layer)
  const w = Math.round(d.bounds.width / 2)
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: w, height: Math.round(d.bounds.height / 2) } }).catch(() => [])
  const src = sources.find((s) => s.display_id === String(d.id)) ?? sources[0]
  if (!src || src.thumbnail.isEmpty()) return null
  return { img: src.thumbnail, k: src.thumbnail.getSize().width / d.bounds.width, origin: d.bounds }
}
/** How each marked spot looks: the grey of 32×8 points across it (a little inside its edge, where a ring's own line
 *  would be). Points, not averages: one line of text and another look the same on average (mostly white page). */
function looks(t: { img: Electron.NativeImage; k: number; origin: { x: number; y: number } }, layer: Electron.Rectangle, rects: number[][]): number[][] {
  const { width: iw, height: ih } = t.img.getSize()
  const px = t.img.toBitmap() // BGRA
  return rects.map(([x, y, w, h]) => {
    const gx = (x + layer.x - t.origin.x + w * 0.08) * t.k
    const gy = (y + layer.y - t.origin.y + h * 0.15) * t.k
    const gw = w * 0.84 * t.k
    const gh = h * 0.7 * t.k
    const out: number[] = []
    for (let cy = 0; cy < 8; cy++)
      for (let cx = 0; cx < 32; cx++) {
        const xx = Math.round(gx + (gw * (cx + 0.5)) / 32)
        const yy = Math.round(gy + (gh * (cy + 0.5)) / 8)
        if (xx < 0 || yy < 0 || xx >= iw || yy >= ih) {
          out.push(-1)
          continue
        }
        const i = (yy * iw + xx) * 4
        out.push(px[i] * 0.11 + px[i + 1] * 0.59 + px[i + 2] * 0.3)
      }
    return out
  })
}
let marksBase: { key: string; looks: number[][] | null; seen: number } | null = null
let marksBusy = false
setInterval(async () => {
  if (marksBusy || !rt?.ink?.screenCount?.()) {
    if (!marksBusy) marksBase = null
    return
  }
  marksBusy = true
  try {
    const layer = inkLayer()
    const rects = layer ? (await screenMarks()).filter((r) => r[2] > 4 && r[3] > 4) : []
    if (!layer || !rects.length) return
    const key = JSON.stringify(rects)
    // New or moved marks: wait one round (they may still be drawing in), then remember how it looks under them.
    if (marksBase?.key !== key) {
      marksBase = { key, looks: null, seen: 0 }
      return
    }
    const t = await screenThumb(layer)
    if (!t) return
    const now = looks(t, layer, rects)
    if (!marksBase.looks) {
      marksBase.looks = now
      return
    }
    const changed = now.filter((g, i) => {
      const was = marksBase!.looks![i]
      // changed: more than 1 in 12 of its points look clearly different
      const n = g.filter((v, j) => v >= 0 && was[j] >= 0 && Math.abs(v - was[j]) > 45).length
      return n > g.length / 12
    }).length
    if (OFFSCREEN && changed) console.info(`marks> ${changed} of ${rects.length} spots look different`)
    if (changed * 2 >= rects.length && changed > 0) {
      marksBase = null
      if (rt.ink.pageTurned?.('page')) mouseLike(`screen marks faded: ${changed} of ${rects.length} spots changed under them`)
    }
  } finally {
    marksBusy = false
  }
}, 1500).unref?.()
const mouseLike = (s: string): void => {
  if (OFFSCREEN) console.info('marks>', s)
}
/** Nova turned the page itself (go_to_page): what it marked on the old one goes. */
export function pageTurnedByNova(): void {
  rt?.ink?.pageTurned?.('Nova turned the page')
}

/** What they circled is this request's screenshot (see tools.mjs useShot): bounds on screen, the picture's size. */
export function useCircleShot(bounds: [number, number, number, number], iw: number, ih: number): void {
  rt?.useShot?.(bounds, iw, ih)
}
