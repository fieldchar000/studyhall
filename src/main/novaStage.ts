// What the globe acts out while Nova works, as Roamies' sidekick does (its sidekick.mjs, ported):
//  • anim(): each tool call as a little performance with a task tag under the globe ("searching · the web"), played
//    by Roamies' agent-tools.js. Roamies' own tools as Roamies maps them; Nova's study tools in the same style.
//  • the step trail: plan_steps' parts on a card beside the globe (agent-cards.js), each ticking off when that turn's
//    tool calls succeed, or showing the first error in plain words when one fails. No extra round trips.

import { orbAgent } from './bauer'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename } from 'node:path'

export type Anim = { tool: 'look' | 'read' | 'write' | 'run' | 'web'; variant: string; label: string; detail: string }

const base = (p: unknown): string => basename(String(p ?? ''))
const host = (u: unknown): string => {
  try {
    return new URL(String(u)).hostname.replace(/^www\./, '')
  } catch {
    return String(u ?? '')
  }
}
const expand = (p: string): string => p.replace(/^~(?=$|[\\/])/, homedir())

/** The performance for a tool call, or null for the ones with nothing to show (drawings, the step trail…). */
export function anim(name: string, args: Record<string, unknown> = {}): Anim | null {
  switch (name) {
    // ---- Roamies' tools, as Roamies maps them ----
    case 'take_screenshot': {
      const t = String(args.target ?? 'screen').trim()
      const app = t === 'screen' || t === 'front' || t.startsWith('window:') ? '' : t.slice(0, 24)
      return { tool: 'look', variant: app ? 'window' : 'screen', label: 'looking at', detail: app || 'your screen' }
    }
    case 'list_windows':
      return { tool: 'read', variant: 'many', label: 'checking', detail: 'your windows' }
    case 'read_window':
      return { tool: 'read', variant: 'search', label: 'reading', detail: String(args.target ?? 'front').slice(0, 24) }
    case 'act_in_app':
      return { tool: 'write', variant: 'edit', label: 'working in', detail: String(args.target ?? 'front').slice(0, 24) }
    case 'see_photo':
      return { tool: 'look', variant: 'window', label: 'looking at', detail: args.url ? host(args.url) : 'a picture' }
    case 'read_file':
      return { tool: 'read', variant: 'file', label: 'reading', detail: base(args.path) }
    case 'list_files':
      return { tool: 'read', variant: 'many', label: 'looking in', detail: `${base(args.dir)}/` }
    case 'search_files':
      return { tool: 'read', variant: 'search', label: 'searching for', detail: `"${String(args.pattern ?? '').slice(0, 24)}"` }
    case 'write_file': {
      const edit = existsSync(expand(String(args.path ?? '')))
      return { tool: 'write', variant: edit ? 'edit' : 'create', label: edit ? 'editing' : 'creating', detail: base(args.path) }
    }
    case 'run_command':
      return { tool: 'run', variant: 'progress', label: 'running', detail: String(args.command ?? '').slice(0, 40) }
    case 'web_fetch':
      return { tool: 'web', variant: 'fetch', label: 'reading', detail: host(args.url) }
    case 'web_search':
      return { tool: 'web', variant: 'search', label: 'searching', detail: 'the web' }
    case 'remember_commitment':
      return { tool: 'write', variant: 'create', label: 'saving', detail: 'a reminder' }
    case 'forget_fact':
      return { tool: 'write', variant: 'crumble', label: 'forgetting', detail: 'that' }
    case 'start_focus':
      return { tool: 'run', variant: 'progress', label: 'focusing', detail: `${args.minutes ?? 25} min` }
    case 'stop_focus':
      return { tool: 'run', variant: 'ok', label: 'ending', detail: 'focus' }
    case 'snooze_reminder':
      return { tool: 'write', variant: 'edit', label: 'snoozing', detail: String(args.until ?? '10 min').slice(0, 20) }
    case 'update_commitment':
      return { tool: 'write', variant: 'edit', label: 'updating', detail: 'a reminder' }
    case 'open': {
      const t = String(args.target ?? '')
      if (/^https?:\/\//i.test(t)) return { tool: 'web', variant: 'fetch', label: 'opening', detail: host(t) }
      return { tool: 'run', variant: 'ok', label: 'opening', detail: base(t).slice(0, 32) }
    }
    // ---- Nova's study tools, in the same style ----
    case 'youtube':
      return { tool: 'web', variant: 'search', label: 'searching', detail: 'YouTube' }
    case 'video_transcript':
      return { tool: 'web', variant: 'fetch', label: 'reading', detail: 'the video' }
    case 'find_material':
      return { tool: 'read', variant: 'search', label: 'searching', detail: 'your study files' }
    case 'read_material':
      return { tool: 'read', variant: 'file', label: 'reading', detail: 'your notes' }
    case 'my_studyhall':
    case 'my_day':
      return { tool: 'read', variant: 'many', label: 'checking', detail: 'Studyhall' }
    case 'studyhall_actions':
      return { tool: 'write', variant: 'edit', label: 'updating', detail: 'Studyhall' }
    case 'quiz_me':
      return { tool: 'write', variant: 'create', label: 'making', detail: 'your quiz' }
    case 'save_flashcards':
      return { tool: 'write', variant: 'create', label: 'saving', detail: 'flashcards' }
    case 'save_note':
      return { tool: 'write', variant: 'create', label: 'saving', detail: 'a note' }
    case 'draft_document':
      return { tool: 'write', variant: 'create', label: 'drafting', detail: 'it' }
    case 'play_music':
      return { tool: 'run', variant: 'ok', label: 'opening', detail: 'Spotify' }
    case 'arrange_windows':
      return { tool: 'run', variant: 'ok', label: 'arranging', detail: 'your windows' }
    case 'read_clipboard':
      return { tool: 'read', variant: 'file', label: 'reading', detail: 'what you copied' }
    case 'start_job':
      return { tool: 'run', variant: 'progress', label: 'starting', detail: 'a job' }
    case 'teach':
      return { tool: 'read', variant: 'search', label: 'getting ready', detail: 'a lesson' }
    default:
      return null
  }
}

// ---------- the step trail (plan_steps) ----------
type Step = { text: string; state: '' | 'now' | 'ok' | 'bad'; why?: string }
const trail = {
  steps: [] as Step[],
  open: new Set<number>(),
  errors: [] as string[],
  send(final: boolean): void {
    if (!this.steps.length) return
    const ok = this.steps.filter((s) => s.state === 'ok').length
    const bad = this.steps.filter((s) => s.state === 'bad').length
    const head = final ? (bad ? `${ok} DONE · ${bad} SKIPPED` : ok === this.steps.length ? 'ALL DONE' : `${ok} OF ${this.steps.length} DONE`) : 'YOUR REQUEST'
    orbAgent({ type: 'trail', steps: this.steps.map(({ text, state, why }) => ({ text, state, why })), head, final })
  },
  plan({ steps, now, skipped }: { steps?: string[]; now?: number[]; skipped?: { step: number; why: string }[] } = {}): void {
    if (steps?.length) {
      this.steps = steps.slice(0, 8).map((t) => ({ text: String(t).slice(0, 48), state: '' as const }))
      this.open.clear()
    }
    for (const n of now ?? []) {
      const s = this.steps[n - 1]
      if (s) {
        s.state = 'now'
        s.why = ''
        this.open.add(n - 1)
      }
    }
    for (const { step, why } of skipped ?? []) {
      const s = this.steps[step - 1]
      if (s) {
        s.state = 'bad'
        s.why = String(why).slice(0, 90)
        this.open.delete(step - 1)
      }
    }
    this.send(false)
  },
  /** A tool call of this turn failed: the first sentence of its error, without the asides meant for the model. */
  error(text: string): void {
    const first = String(text ?? '').replace(/\([^)]*\)/g, '').split(/(?<=[.!?])\s/)[0].replace(/\s+/g, ' ').trim()
    if (first) this.errors.push(first.slice(0, 90))
  },
  /** The model's turn ended (or the request did): the parts being done are settled. */
  settle(): void {
    if (!this.open.size) {
      this.errors = []
      return
    }
    for (const i of this.open) {
      const s = this.steps[i]
      if (s?.state === 'now') {
        s.state = this.errors.length ? 'bad' : 'ok'
        s.why = this.errors[0] ?? ''
      }
    }
    this.open.clear()
    this.errors = []
    this.send(false)
  },
  end(): void {
    this.settle()
    this.send(true)
    this.steps = []
    this.open.clear()
    this.errors = []
  }
}
export const trailPlan = (args: Parameters<typeof trail.plan>[0]): void => trail.plan(args)
export const trailError = (text: string): void => trail.error(text)
export const trailSettle = (): void => trail.settle()
export const trailEnd = (): void => trail.end()

// ---------- tool calls → performances ----------
let seq = 0
/** A tool started: its performance plays on the globe. Returns the id to end it with. */
export function stageTool(name: string, args: Record<string, unknown>): string {
  const id = `t${++seq}`
  const a = anim(name, args)
  if (a) orbAgent({ type: 'tool', id, anim: a })
  return id
}
export function stageToolEnd(id: string, isError: boolean, result = ''): void {
  orbAgent({ type: 'tool_end', id, isError })
  if (isError) trailError(result)
}
/** A request starts / ends (the globe settles any tool still showing). */
export const stageStart = (agentish = false): void => orbAgent({ type: 'start', agentish })
export const stageDone = (): void => orbAgent({ type: 'done' })
