// Nova's eyes and pointing (PC). When you ask about the app you're using ("where's export?",
// "how do I save this as a PDF?", "what does this button do?"):
//  1. nova-eyes.exe reads that window's controls through Windows UI Automation (names + positions),
//  2. one screenshot of just that window is taken (Nova's own windows never appear in it),
//  3. Claude picks the control and says what to do; a ring appears around it,
//  4. walkthroughs: Nova waits for your click there, looks again, and shows the next step.
// Nothing is captured unless you ask; screenshots go only to Claude, with your request.

import { app, BrowserWindow, desktopCapturer, screen } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { AiMessage, Prefs } from '@shared/types'

const OFFSCREEN = process.env.STUDYHALL_OFFSCREEN === '1'

// ---------- The helper ----------

let proc: ChildProcess | null = null
let seq = 0
const waiting = new Map<number, (r: Record<string, unknown>) => void>()

const helperPath = (): string => (app.isPackaged ? join(process.resourcesPath, 'nova-eyes.exe') : join(app.getAppPath(), 'build', 'nova-eyes.exe'))

async function helper(): Promise<ChildProcess> {
  if (proc && proc.exitCode == null) return proc
  await stat(helperPath())
  const child = spawn(helperPath(), [], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] })
  let buf = ''
  child.stdout!.on('data', (d) => {
    buf += String(d)
    let i: number
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (!line) continue
      try {
        const r = JSON.parse(line) as Record<string, unknown>
        const cb = waiting.get(Number(r.seq))
        waiting.delete(Number(r.seq))
        cb?.(r)
      } catch {
        /* not ours */
      }
    }
  })
  child.on('exit', () => {
    if (proc === child) proc = null
    for (const cb of waiting.values()) cb({ ok: false, error: 'The eyes helper stopped' })
    waiting.clear()
  })
  proc = child
  return child
}

/** One request to nova-eyes. */
export async function eyes(req: Record<string, unknown>, timeoutMs = 10_000): Promise<Record<string, unknown>> {
  const p = await helper()
  const id = ++seq
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      waiting.delete(id)
      resolve({ ok: false, error: 'The app didn’t answer in time' })
    }, timeoutMs)
    waiting.set(id, (r) => {
      clearTimeout(t)
      resolve(r)
    })
    p.stdin!.write(JSON.stringify({ ...req, seq: id }) + '\n')
  })
}

export function stopEyes(): void {
  stopWalkthrough()
  proc?.stdin?.end()
  proc = null
}

// ---------- Seeing ----------

export interface SeenControl {
  id: number
  role: string
  name: string
  rect: Electron.Rectangle // screen position (DIP, like Electron windows)
  phys: [number, number, number, number] // the same in real pixels (for nova-eyes)
  actions: string[]
  enabled: boolean
  hint?: string
}
export interface Seen {
  window: { title: string; app: string; rect: Electron.Rectangle; pid: number }
  controls: SeenControl[]
  image: string | null // JPEG data URL of just that window
  scale: number // image pixels per DIP
}

const toDip = (r: number[]): Electron.Rectangle => {
  const rect = { x: r[0], y: r[1], width: r[2], height: r[3] }
  try {
    return screen.screenToDipRect(null, rect)
  } catch {
    return rect
  }
}

/** Look at the window you're using (or a given one, for tests). */
export async function see(opts: { hwnd?: number; offscreen?: boolean; screenshot?: boolean } = {}): Promise<Seen> {
  // Automated tests only ever look at Studyhall's own hidden window, never at your real ones.
  if (process.env.STUDYHALL_OFFSCREEN === '1' && !opts.hwnd) {
    const main = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('index.html'))
    if (!main) throw new Error('no test window to look at')
    const h = main.getNativeWindowHandle()
    opts = { ...opts, hwnd: Number(h.length >= 8 ? h.readBigUInt64LE(0) : h.readUInt32LE(0)), offscreen: true }
  }
  const req ={ cmd: 'snapshot', exclude: [process.pid], hwnd: opts.hwnd ?? 0, offscreen: !!opts.offscreen }
  let r = await eyes(req)
  // Chromium apps (browsers, Studyhall, Discord…) switch their accessibility on when first asked.
  if (r.ok && (r.elements as unknown[]).length < 15) {
    await new Promise((res) => setTimeout(res, 1200))
    r = await eyes(req)
  }
  if (!r.ok) throw new Error(String(r.error ?? 'Couldn’t look at that window'))
  const w = r.window as { title: string; app: string; pid: number; rect: number[] }
  const controls = (r.elements as { id: number; role: string; name: string; rect: number[]; actions: string[]; enabled: boolean; hint?: string }[]).map((e) => ({
    ...e,
    rect: toDip(e.rect),
    phys: e.rect as [number, number, number, number]
  }))
  const wrect = toDip(w.rect)
  let image: string | null = null
  let scale = 1
  if (opts.screenshot !== false && !OFFSCREEN) {
    const shot = await captureRect(wrect)
    image = shot?.image ?? null
    scale = shot?.scale ?? 1
  }
  return { window: { title: w.title, app: w.app, pid: w.pid, rect: wrect }, controls, image, scale }
}

/** A JPEG of one area of the screen (Nova's own windows are hidden from capture). */
/** A close-up of part of the screen (JPEG data URL), e.g. what you circled. Never in automated tests. */
export async function captureArea(rect: Electron.Rectangle): Promise<string | null> {
  // (Automated tests: only a hidden test page of the test's own, titled "Nova test…", never your screen.)
  if (OFFSCREEN) {
    const tw = BrowserWindow.getAllWindows().find((w) => w.getTitle().startsWith('Nova test'))
    if (!tw) return null
    const img = await tw.webContents.capturePage({ x: Math.max(0, Math.round(rect.x)), y: Math.max(0, Math.round(rect.y)), width: Math.round(rect.width), height: Math.round(rect.height) }).catch(() => null)
    return img && !img.isEmpty() ? `data:image/jpeg;base64,${img.toJPEG(85).toString('base64')}` : null
  }
  return (await captureRect(rect).catch(() => null))?.image ?? null
}

/** The text you've highlighted in the app you're using, and where it is on screen (DIP). */
export async function selectionNow(): Promise<{ text: string; rect: Electron.Rectangle | null } | null> {
  if (OFFSCREEN) return null
  const r = await eyes({ cmd: 'selection', exclude: [process.pid] }, 1500).catch(() => null)
  const text = r?.ok ? String(r.text ?? '').trim() : ''
  if (!text) return null
  return { text: text.slice(0, 4000), rect: Array.isArray(r!.rect) ? toDip(r!.rect as number[]) : null }
}

async function captureRect(rect: Electron.Rectangle): Promise<{ image: string; scale: number } | null> {
  const display = screen.getDisplayMatching(rect)
  const sf = display.scaleFactor
  const { width, height } = display.bounds
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.round(width * sf), height: Math.round(height * sf) } })
  const src = sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
  if (!src) return null
  const img = src.thumbnail
  const k = img.getSize().width / width // thumbnail pixels per DIP
  const x = Math.max(0, Math.round((rect.x - display.bounds.x) * k))
  const y = Math.max(0, Math.round((rect.y - display.bounds.y) * k))
  const crop = img.crop({ x, y, width: Math.min(img.getSize().width - x, Math.round(rect.width * k)), height: Math.min(img.getSize().height - y, Math.round(rect.height * k)) })
  // At most 1400 px wide: plenty to read, and lighter on your Claude plan.
  const out = crop.getSize().width > 1400 ? crop.resize({ width: 1400 }) : crop
  return { image: `data:image/jpeg;base64,${out.toJPEG(72).toString('base64')}`, scale: (out.getSize().width / Math.max(1, rect.width)) }
}

/** The controls as short lines for Claude (positions in screenshot pixels, so they match the picture). */
export function describeControls(seen: Seen, max = 260): string {
  const { rect: w } = seen.window
  return seen.controls
    .slice(0, max)
    .map((c) => {
      const x = Math.round((c.rect.x - w.x) * seen.scale)
      const y = Math.round((c.rect.y - w.y) * seen.scale)
      const acts = c.actions.length ? ` [${c.actions.join(',')}]` : ''
      return `${c.id} ${c.role} "${c.name.replace(/"/g, "'")}" at ${x},${y} ${Math.round(c.rect.width * seen.scale)}x${Math.round(c.rect.height * seen.scale)}${acts}${c.enabled ? '' : ' (disabled)'}`
    })
    .join('\n')
}

// ---------- Pointing and walkthroughs ----------

const POINT_SCHEMA = {
  type: 'object',
  properties: {
    say: { type: 'string' },
    point: { type: 'integer' },
    label: { type: 'string' },
    more: { type: 'boolean' }
  },
  required: ['say', 'point', 'label', 'more'],
  additionalProperties: false
}

const POINT_SYSTEM = `You help the user with the app that's on their screen. You get the window's title and app, a numbered list of its controls (id, kind, name, position in the screenshot, what can be done with it), and a screenshot of the window.
Answer with:
- say: what to tell the user out loud. One or two short, friendly sentences of plain speech (no lists, no markdown).
- point: the id of the ONE control to point at right now: the next thing to click, or the thing they asked about. 0 if nothing fits.
- label: 2 to 5 words shown next to the pointer, like "Click File" or "Export is here".
- more: true if more steps are needed after this click, false if this is the last step or the request was just a question.
Only use ids from the list, never guess one. If the goal is already done, say so with point 0. If the screen doesn't show a way to do it, say what to open first.`

let walkGen = 0
export function stopWalkthrough(): void {
  walkGen++
  pointerHooks.hide()
}

/** What eyes.ts needs from the rest of the app (set up by index.ts). */
export const pointerHooks = {
  show: (_rect: Electron.Rectangle, _label: string, _step: string): void => {},
  hide: (): void => {},
  say: (_text: string): void => {},
  ask: async (_messages: AiMessage[], _schema: object): Promise<string> => '',
  prefs: (): Prefs => ({}) as Prefs,
  /** (automated tests only) look at a given hidden window, with no screenshot */
  seeOpts: undefined as undefined | { hwnd?: number; offscreen?: boolean; screenshot?: boolean }
}

/** Help with what's on screen: answers straight away with the first thing to say (and points), then
 *  (walkthroughs) keeps going in the background, one step per click, speaking each step. */
export async function helpOnScreen(goal: string): Promise<string> {
  stopWalkthrough()
  const gen = walkGen
  const done: string[] = []
  const step = async (n: number): Promise<{ say: string; target: SeenControl | null; more: boolean; label: string }> => {
    const seen = await see(pointerHooks.seeOpts)
    const content = [
      ...(seen.image ? [{ type: 'image_url' as const, image_url: { url: seen.image } }] : []),
      {
        type: 'text' as const,
        text: `Goal: ${goal}\n${done.length ? `Done so far:\n${done.map((d, i) => `${i + 1}. ${d}`).join('\n')}\n` : ''}Window: "${seen.window.title}" (${seen.window.app})\nControls:\n${describeControls(seen)}`
      }
    ]
    const raw = await pointerHooks.ask([{ role: 'system', content: POINT_SYSTEM }, { role: 'user', content }], POINT_SCHEMA)
    const a = JSON.parse(raw) as { say: string; point: number; label: string; more: boolean }
    const target = seen.controls.find((c) => c.id === a.point) ?? null
    if (gen === walkGen) {
      if (target) pointerHooks.show(target.rect, a.label || 'Here', n > 1 || a.more ? `Step ${n}` : '')
      else pointerHooks.hide()
    }
    return { say: a.say, target, more: !!a.more, label: a.label }
  }
  const first = await step(1)
  const walk = pointerHooks.prefs().novaWalk !== false
  if (!first.target || !first.more || !walk) {
    // Just an answer: the ring stays for a few seconds.
    if (first.target) setTimeout(() => gen === walkGen && pointerHooks.hide(), 9000)
    return first.say
  }
  // Walkthrough: wait for each click, then look again.
  void (async () => {
    let cur = first
    for (let n = 2; n <= 8 && gen === walkGen && cur.target && cur.more; n++) {
      const r = await eyes({ cmd: 'waitClick', rect: cur.target.phys, timeoutMs: 120_000 }, 125_000)
      if (gen !== walkGen) return
      if (!r.clicked) {
        pointerHooks.hide()
        return
      }
      done.push(`Clicked "${cur.target.name || cur.label}"`)
      pointerHooks.hide()
      await new Promise((res) => setTimeout(res, 700)) // let the app react
      if (gen !== walkGen) return
      try {
        cur = await step(n)
        if (gen === walkGen) pointerHooks.say(cur.say)
      } catch (e) {
        console.warn('Nova eyes:', e)
        pointerHooks.hide()
        return
      }
    }
    if (gen === walkGen && cur.target && !cur.more) setTimeout(() => gen === walkGen && pointerHooks.hide(), 9000)
  })()
  return first.say
}
