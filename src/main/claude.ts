// Nova's brain: Claude, through Anthropic's own Claude Code program, signed in with your own Claude plan.
//  • Claude Code is downloaded once (the unmodified program Anthropic publishes on npm, checked
//    against its published fingerprint) into Studyhall's folder, with its own settings folder.
//  • Signing in happens on Anthropic's own page in your browser; Studyhall never sees your password.
//  • Each request picks a model + effort (Auto, or what you chose on the Nova page). Claude Code's
//    own tools are switched off, so it can only answer; Studyhall does the actions itself.
//  • Usage: Claude reports your plan's 5-hour and weekly usage after each request. Nova pauses
//    itself at your cap, and never runs on paid extra usage unless you allow it.

import { app, BrowserWindow, shell } from 'electron'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { AiMessage, AiPurpose, ClaudeStatus, NovaEffort, Prefs } from '@shared/types'
import { getSetting, setSetting } from './db'

// The Claude Code build that matches the SDK in package.json (@anthropic-ai/claude-agent-sdk 0.3.317).
const PKG_VERSION = '0.3.317'
const TARBALL = `https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk-win32-x64/-/claude-agent-sdk-win32-x64-${PKG_VERSION}.tgz`
const INTEGRITY = 'sha512-BPxd/DV67LOmPFcq9zrxvs0siTejMGuZDI4sisjFNTssl/Qqma26BXGdHejQlqJqksuzurx+MPq4Jxtzx5UIZw=='
const SIZE_MB = 150

const DIR = (): string => join(app.getPath('userData'), 'nova')
const EXE = (): string => join(DIR(), 'claude', PKG_VERSION, 'claude.exe')
const CONFIG = (): string => join(DIR(), 'claude-config')
const WORK = (): string => join(DIR(), 'work') // an empty folder, so Claude Code never reads a project

const MODEL_ID = { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5' } as const
type ModelKey = keyof typeof MODEL_ID

const exists = async (p: string): Promise<boolean> => !!(await stat(p).catch(() => null))
const env = (): Record<string, string | undefined> => ({ ...process.env, CLAUDE_CONFIG_DIR: CONFIG(), CLAUDE_AGENT_SDK_CLIENT_APP: 'studyhall', DISABLE_AUTOUPDATER: '1' })

let state: ClaudeStatus = {
  installed: false,
  downloading: false,
  progress: 0,
  sizeMb: SIZE_MB,
  signingIn: false,
  signedIn: false,
  plan: null,
  usage: null,
  paused: null,
  last: null,
  monthCostUsd: 0,
  error: null
}
let signInUrl: string | null = null

function push(): void {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('claude:status', state)
}
function set(patch: Partial<ClaudeStatus>): ClaudeStatus {
  state = { ...state, ...patch }
  push()
  return state
}

const monthKey = (): string => `nova_cost_${new Date().toISOString().slice(0, 7)}`

/** Run Claude Code with arguments and collect what it prints. */
function run(args: string[], timeoutMs = 20_000): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(EXE(), args, { env: env(), cwd: WORK(), windowsHide: true })
    let out = ''
    child.stdout.on('data', (d) => (out += String(d)))
    child.stderr.on('data', (d) => (out += String(d)))
    const t = setTimeout(() => child.kill(), timeoutMs)
    child.on('close', (code) => {
      clearTimeout(t)
      resolve({ code, out })
    })
    child.on('error', () => {
      clearTimeout(t)
      resolve({ code: -1, out })
    })
  })
}

async function checkAuth(): Promise<void> {
  if (!(await exists(EXE()))) return
  const r = await run(['auth', 'status'])
  try {
    const j = JSON.parse(r.out.slice(r.out.indexOf('{'))) as { loggedIn?: boolean; subscriptionType?: string | null }
    set({ signedIn: !!j.loggedIn, plan: j.subscriptionType ?? state.plan })
  } catch {
    set({ signedIn: false })
  }
}

export async function claudeStatus(): Promise<ClaudeStatus> {
  const installed = await exists(EXE())
  state.installed = installed
  state.monthCostUsd = getSetting<number>(monthKey()) ?? 0
  state.usage = getSetting<ClaudeStatus['usage']>('nova_usage') ?? null
  if (installed && !state.signingIn) await checkAuth()
  return state
}

/** Download Claude Code (once). */
export async function installClaude(): Promise<ClaudeStatus> {
  if (state.downloading || (await exists(EXE()))) return claudeStatus()
  set({ downloading: true, progress: 0, error: null })
  const tmp = join(DIR(), 'download')
  try {
    await rm(tmp, { recursive: true, force: true })
    await mkdir(tmp, { recursive: true })
    await mkdir(WORK(), { recursive: true })
    const res = await fetch(TARBALL)
    if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`)
    const total = Number(res.headers.get('content-length')) || SIZE_MB * 1e6
    const hash = createHash('sha512')
    const file = join(tmp, 'claude.tgz')
    const ws = createWriteStream(file)
    let got = 0
    let lastPush = 0
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      hash.update(chunk)
      got += chunk.length
      if (!ws.write(chunk)) await new Promise<void>((r) => ws.once('drain', () => r()))
      if (Date.now() - lastPush > 300) {
        lastPush = Date.now()
        set({ progress: Math.min(0.99, got / total) })
      }
    }
    await new Promise<void>((r, j) => ws.end((e?: Error | null) => (e ? j(e) : r())))
    if (`sha512-${hash.digest('base64')}` !== INTEGRITY) throw new Error('The download didn’t match Anthropic’s published fingerprint, so it was thrown away')
    // Windows' own tar unpacks it.
    await new Promise<void>((resolve, reject) => {
      const t = spawn(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe'), ['-xzf', file, '-C', tmp, 'package/claude.exe'], { windowsHide: true })
      t.on('close', (c) => (c === 0 ? resolve() : reject(new Error('Couldn’t unpack Claude Code'))))
      t.on('error', reject)
    })
    await mkdir(join(DIR(), 'claude', PKG_VERSION), { recursive: true })
    await rename(join(tmp, 'package', 'claude.exe'), EXE())
    await rm(tmp, { recursive: true, force: true })
    set({ downloading: false, progress: 1, installed: true })
    await checkAuth()
    return state
  } catch (e) {
    await rm(tmp, { recursive: true, force: true }).catch(() => {})
    return set({ downloading: false, progress: 0, error: e instanceof Error ? e.message : String(e) })
  }
}

/** Sign in on Anthropic's own page (opens in your browser). Resolves when you've finished or given up. */
export async function signInClaude(): Promise<ClaudeStatus> {
  if (!(await exists(EXE()))) await installClaude()
  if (!(await exists(EXE())) || state.signingIn) return state
  set({ signingIn: true, error: null })
  signInUrl = null
  await new Promise<void>((resolve) => {
    const child = spawn(EXE(), ['auth', 'login', '--claudeai'], { env: env(), cwd: WORK(), windowsHide: true })
    let out = ''
    let opened = false
    const look = (d: Buffer): void => {
      out += String(d)
      const url = /https:\/\/\S+/.exec(out)?.[0]
      if (url && !signInUrl) signInUrl = url
      if (/opening|opened|browser/i.test(out)) opened = true
    }
    child.stdout.on('data', look)
    child.stderr.on('data', look)
    // If Claude Code printed the link but didn't open a browser itself, open it for you.
    setTimeout(() => {
      if (!opened && signInUrl) void shell.openExternal(signInUrl)
    }, 2500)
    const t = setTimeout(() => child.kill(), 10 * 60_000)
    child.on('close', () => {
      clearTimeout(t)
      resolve()
    })
    child.on('error', () => resolve())
  })
  set({ signingIn: false })
  await checkAuth()
  if (!state.signedIn) set({ error: 'Not signed in yet. Try again, and finish signing in on the page that opens in your browser.' })
  return state
}

export async function signOutClaude(): Promise<ClaudeStatus> {
  if (await exists(EXE())) await run(['auth', 'logout'])
  return set({ signedIn: false, plan: null, usage: null })
}

/** Is Claude usable right now, under your settings? (null = yes, otherwise why not) */
export function claudeBlocked(prefs: Prefs): string | null {
  if (!state.installed || !state.signedIn) return 'not connected'
  const u = state.usage
  const cap = prefs.novaCap ?? 80
  const now = Date.now()
  if (u?.sevenDay != null && u.sevenDay >= cap && (!u.sevenDayResets || Date.parse(u.sevenDayResets) > now)) return `your weekly Claude usage is at ${Math.round(u.sevenDay)}% (your cap is ${cap}%)`
  if (state.paused && pausedUntil > now) return state.paused
  return null
}
let pausedUntil = 0

/** Which model + effort a request gets. */
export function pickModel(prefs: Prefs, purpose: AiPurpose): { model: ModelKey; effort: NovaEffort } {
  const brain = prefs.novaBrain ?? 'auto'
  if (brain !== 'auto') return { model: brain, effort: prefs.novaEffort ?? 'medium' }
  switch (purpose) {
    case 'act':
      return { model: 'haiku', effort: 'low' }
    case 'chat':
      return { model: 'haiku', effort: 'medium' }
    case 'explain':
    case 'look':
      return { model: 'sonnet', effort: 'medium' }
  }
}

type Block = { type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'; data: string } }

/** One request to Claude. With a JSON schema, the answer is JSON matching it. */
export async function claudeChat(messages: AiMessage[], schema: object | undefined, prefs: Prefs, purpose: AiPurpose): Promise<string> {
  const { query } = await import('@anthropic-ai/claude-agent-sdk')
  const { model, effort } = pickModel(prefs, purpose)
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => (typeof m.content === 'string' ? m.content : m.content.map((p) => (p.type === 'text' ? p.text : '')).join('\n')))
    .join('\n\n')
  // Earlier user/assistant pairs were worked examples for the small offline model; Claude gets them as notes.
  const chat = messages.filter((m) => m.role !== 'system')
  const last = chat[chat.length - 1]
  const examples = chat
    .slice(0, -1)
    .map((m) => `${m.role === 'user' ? 'Request' : 'Answer'}: ${typeof m.content === 'string' ? m.content : '[picture]'}`)
    .join('\n')
  const blocks: Block[] = []
  if (last) {
    if (typeof last.content === 'string') blocks.push({ type: 'text', text: last.content })
    else
      for (const p of last.content) {
        if (p.type === 'text') blocks.push({ type: 'text', text: p.text })
        else {
          const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/.exec(p.image_url.url)
          if (m) blocks.push({ type: 'image', source: { type: 'base64', media_type: m[1] as 'image/png', data: m[2] } })
        }
      }
  }
  async function* prompt(): AsyncGenerator<{ type: 'user'; message: { role: 'user'; content: Block[] }; parent_tool_use_id: null }> {
    yield { type: 'user', message: { role: 'user', content: blocks }, parent_tool_use_id: null }
  }
  const started = Date.now()
  const q = query({
    prompt: prompt() as never,
    options: {
      pathToClaudeCodeExecutable: EXE(),
      cwd: WORK(),
      env: env(),
      model: MODEL_ID[model],
      effort,
      systemPrompt: examples ? `${system}\n\nWorked examples of good answers:\n${examples}` : system,
      tools: [],
      settingSources: [],
      persistSession: false,
      maxTurns: 4,
      ...(schema ? { outputFormat: { type: 'json_schema' as const, schema: schema as Record<string, unknown> } } : {})
    }
  })
  let text = ''
  let structured: unknown
  let cost = 0
  try {
    for await (const m of q) {
      if (m.type === 'rate_limit_event') noteLimit(m.rate_limit_info, prefs)
      else if (m.type === 'assistant' && m.error === 'authentication_failed') set({ signedIn: false })
      else if (m.type === 'assistant' && (m.error === 'billing_error' || m.error === 'rate_limit')) {
        pausedUntil = Date.now() + 15 * 60_000
        set({ paused: 'your Claude usage limit was reached' })
      } else if (m.type === 'result') {
        cost = m.total_cost_usd ?? 0
        if (m.subtype === 'success') {
          text = m.result
          structured = m.structured_output
        } else throw new Error(`Claude couldn’t finish (${m.subtype})`)
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/rate.?limit|usage limit|429/i.test(msg)) {
      pausedUntil = Date.now() + 15 * 60_000
      set({ paused: 'your Claude usage limit was reached' })
    }
    throw e
  }
  const month = (getSetting<number>(monthKey()) ?? 0) + cost
  setSetting(monthKey(), month)
  set({ last: { model, effort, ms: Date.now() - started, costUsd: cost, at: new Date().toISOString() }, monthCostUsd: month, error: null })
  console.info(`Nova: ${model}/${effort} ${purpose} in ${Date.now() - started} ms`)
  return structured !== undefined ? JSON.stringify(structured) : text
}

interface LimitInfo {
  status: 'allowed' | 'allowed_warning' | 'rejected'
  resetsAt?: number
  rateLimitType?: string
  utilization?: number
  isUsingOverage?: boolean
  overageInUse?: boolean
}
/** Claude tells us about your plan's limits as they change. */
function noteLimit(info: LimitInfo, prefs: Prefs): void {
  const u = state.usage ?? { fiveHour: null, sevenDay: null, fiveHourResets: null, sevenDayResets: null, at: '' }
  const resets = info.resetsAt ? new Date(info.resetsAt * (info.resetsAt < 1e12 ? 1000 : 1)).toISOString() : null
  if (info.utilization != null) {
    const pct = info.utilization <= 1 ? info.utilization * 100 : info.utilization
    if (info.rateLimitType === 'five_hour') Object.assign(u, { fiveHour: pct, fiveHourResets: resets })
    if (info.rateLimitType === 'seven_day') Object.assign(u, { sevenDay: pct, sevenDayResets: resets })
  }
  u.at = new Date().toISOString()
  setSetting('nova_usage', u)
  let paused: string | null = null
  if (info.status === 'rejected') paused = 'your Claude usage limit was reached'
  else if ((info.isUsingOverage || info.overageInUse) && prefs.novaNoExtra !== false) paused = 'your plan is used up and only paid extra usage is left'
  if (paused) pausedUntil = resets ? Date.parse(resets) : Date.now() + 60 * 60_000
  set({ usage: { ...u }, paused })
}

/** Ask Claude for the latest usage numbers (shown on the Nova page). */
export async function refreshClaudeUsage(prefs: Prefs): Promise<ClaudeStatus> {
  await claudeStatus()
  if (!state.signedIn) return state
  try {
    const { query } = await import('@anthropic-ai/claude-agent-sdk')
    const q = query({ prompt: (async function* () {})() as never, options: { pathToClaudeCodeExecutable: EXE(), cwd: WORK(), env: env(), tools: [], settingSources: [], persistSession: false } })
    const r = await (q as unknown as { usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET(o: { skipBehaviors: boolean }): Promise<{ subscription_type: string | null; rate_limits: { five_hour?: { utilization: number | null; resets_at: string | null } | null; seven_day?: { utilization: number | null; resets_at: string | null } | null } | null }> }).usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true })
    q.close?.()
    const rl = r.rate_limits
    const u = {
      fiveHour: rl?.five_hour?.utilization ?? null,
      sevenDay: rl?.seven_day?.utilization ?? null,
      fiveHourResets: rl?.five_hour?.resets_at ?? null,
      sevenDayResets: rl?.seven_day?.resets_at ?? null,
      at: new Date().toISOString()
    }
    setSetting('nova_usage', u)
    set({ usage: u, plan: r.subscription_type ?? state.plan })
    void prefs
  } catch (e) {
    console.warn('Nova: couldn’t read Claude usage', e)
  }
  return state
}
