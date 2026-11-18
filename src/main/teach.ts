// Nova teaches, live (the Roamies way): Claude writes a short lesson as a script, and Nova performs it
// while it's still being written: an answer card that fills in line by line, a pixel diagram, the key
// sentence underlined (on your own screen when you're reading about it, otherwise on a brief source page
// beside the cards), a timeline or steps, then a quick quiz. Each visual appears with the sentence about it.

import type { AiMessage, BauerCard, LiveOp, Prefs } from '@shared/types'
import { see, type SeenControl } from './eyes'

const SYSTEM = `You are Nova, teaching a topic live, like a friendly tutor drawing beside the student's screen.
Write the lesson as a script, one command per line, exactly in this format (no other text, no markdown, no blank lines):
SAY: <one or two short spoken sentences>
CARD <id> <answer|points|timeline|steps|chart> | <title>
ITEM <id> | <label, 2 to 6 words> | <detail: one short line, or empty> | <number for a chart, or empty>
DIAGRAM <id> | <title> | <svg on one line>
MARK <number> | <tag, 2 to 4 words>
QUIZ <id> | <question> | <option> | <option> | <option> | <index of the right option, 0 to 2> | <why, one short line>

How to teach:
- Open with SAY: a one-sentence hook. Then CARD c1 answer with the topic as title, and 3 or 4 ITEMs (short key facts). Put each SAY right before the visuals it talks about, so they appear together.
- Then a DIAGRAM: a simple labelled drawing of the idea. The svg: one line, viewBox="0 0 320 200", using only rect, circle, ellipse, line, polyline, polygon, path and text; colours #4f86f0, #a8c8ff, #e4eeff and #ffcf7a (for the one thing to notice); no background; text font-size 13 to 16 with short labels. Say what the drawing shows.
- If the request gives numbered text (a source page or the student's screen), MARK the number of the ONE line that is the key bit, right after a SAY that points to it ("See this line here: ...").
- Then, if it suits the topic, a timeline (dates in order) or steps (a process) card, with a SAY.
- Finish with a one-sentence SAY wrap-up, then one QUIZ.
- 6 to 9 SAY lines, under 130 spoken words in total. Plain language for a university student. Never invent facts, numbers or dates; leave out what you're not sure of.`

type Beat = { say: string | null; ops: (() => void)[] }

export const teachHooks = {
  ask: async (_m: AiMessage[], _onText: (t: string) => void): Promise<string> => '',
  prefs: (): Prefs => ({}) as Prefs,
  live: (_op: LiveOp): void => {},
  highlight: (_rect: Electron.Rectangle, _tag: string): void => {},
  hideHighlight: (): void => {},
  sayAndWait: async (_text: string): Promise<void> => {},
  source: async (_topic: string): Promise<{ title: string; url: string; image: string | null; text: string } | null> => null,
  /** (automated tests only) */
  seeOpts: undefined as undefined | { hwnd?: number; offscreen?: boolean; screenshot?: boolean }
}

let gen = 0
export function stopTeach(): void {
  gen++
  teachHooks.hideHighlight()
}

const sentencesOf = (text: string): string[] =>
  (text.replace(/\s+/g, ' ').match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length > 2)
    .slice(0, 16)

/** Teach a topic. Resolves once the lesson has started (it carries on, spoken, in the background). */
export async function teach(topic: string, onScreen: boolean, wiki = ''): Promise<{ started: boolean; first: string }> {
  stopTeach()
  const my = gen
  const prefs = teachHooks.prefs()

  // What to underline: a line on your screen (when you're reading about it) or on a source page.
  let screenLines: SeenControl[] = []
  let source: { title: string; url: string; image: string | null; sentences: string[] } | null = null
  if (onScreen) {
    try {
      const seen = await see({ ...(teachHooks.seeOpts ?? {}), screenshot: false })
      screenLines = seen.controls.filter((c) => c.role === 'Text' && c.name.length >= 25 && c.rect.width > 40).slice(0, 70)
    } catch {
      screenLines = []
    }
  }
  if (!screenLines.length && prefs.novaSource !== 'none') {
    const page = (wiki ? await teachHooks.source(wiki).catch(() => null) : null) ?? (await teachHooks.source(topic).catch(() => null))
    if (page) source = { title: page.title, url: page.url, image: page.image, sentences: sentencesOf(page.text) }
  }
  if (my !== gen) return { started: false, first: '' }
  teachHooks.live({ op: 'start', source })

  const context = screenLines.length
    ? `\n\nNumbered text on the student's screen:\n${screenLines.map((c) => `${c.id}: ${c.name}`).join('\n')}`
    : source
      ? `\n\nSource page (${source.title}), numbered sentences:\n${source.sentences.map((s, i) => `${i + 1}: ${s}`).join('\n')}`
      : ''

  // ----- Performing the script while it streams in -----
  const beats: Beat[] = [{ say: null, ops: [] }]
  let playing = -1 // index of the beat being performed
  let streamDone = false
  let wake: () => void = () => {}
  const cards = new Map<string, BauerCard['kind']>()
  let firstSay = ''

  const addOp = (op: () => void): void => {
    const b = beats[beats.length - 1]
    if (beats.length - 1 === playing) op() // this beat is being said right now: show it straight away
    else b.ops.push(op)
  }
  const handleLine = (raw: string): void => {
    const line = raw.trim()
    if (!line) return
    let m: RegExpExecArray | null
    if ((m = /^SAY:\s*(.+)$/i.exec(line))) {
      beats.push({ say: m[1].trim(), ops: [] })
      if (!firstSay) firstSay = m[1].trim()
      wake()
    } else if ((m = /^CARD\s+(\S+)\s+(answer|points|timeline|steps|chart)\s*\|\s*(.+)$/i.exec(line))) {
      const [, id, kind, title] = m
      const k = (kind.toLowerCase() === 'answer' ? 'points' : kind.toLowerCase()) as BauerCard['kind']
      cards.set(id, k)
      const card: BauerCard = { id, kind: k, title: title.trim(), items: [], source: source ? 'Wikipedia + Claude' : 'Claude', link: source?.url }
      addOp(() => teachHooks.live({ op: 'card', card }))
    } else if ((m = /^ITEM\s+(\S+)\s*\|\s*([^|]*)\|?\s*([^|]*)\|?\s*([^|]*)$/i.exec(line))) {
      const [, id, label, detail, num] = m
      const value = Number(String(num).replace(/[^0-9.-]/g, ''))
      const item = { label: label.trim(), detail: detail.trim() || undefined, value: Number.isFinite(value) && String(num).trim() ? value : undefined }
      if (item.label) addOp(() => teachHooks.live({ op: 'item', id, item }))
    } else if ((m = /^DIAGRAM\s+(\S+)\s*\|\s*([^|]*)\|\s*(<svg[\s\S]*<\/svg>)\s*$/i.exec(line))) {
      const [, id, title, svg] = m
      const card: BauerCard = { id, kind: 'diagram', title: title.trim() || topic, svg: svg.slice(0, 20000), source: 'Claude' }
      addOp(() => teachHooks.live({ op: 'card', card }))
    } else if ((m = /^MARK\s+(\d+)\s*\|\s*(.+)$/i.exec(line))) {
      const n = Number(m[1])
      const tag = m[2].trim().slice(0, 40)
      const target = screenLines.find((c) => c.id === n)
      if (target) addOp(() => teachHooks.highlight(target.rect, tag))
      else if (source && n >= 1 && n <= source.sentences.length) addOp(() => teachHooks.live({ op: 'mark', n: n - 1, tag }))
    } else if ((m = /^QUIZ\s+(\S+)\s*\|(.+)$/i.exec(line))) {
      const parts = m[2].split('|').map((p) => p.trim())
      if (parts.length >= 5) {
        const why = parts.length >= 6 ? parts[parts.length - 1] : ''
        const answer = Number(parts[parts.length - (parts.length >= 6 ? 2 : 1)])
        const options = parts.slice(1, parts.length - (parts.length >= 6 ? 2 : 1)).filter(Boolean)
        const id = m[1]
        if (options.length >= 2 && answer >= 0 && answer < options.length) {
          const q = { q: parts[0], options, answer, why }
          addOp(() => {
            if (!cards.has(id)) {
              cards.set(id, 'quiz')
              teachHooks.live({ op: 'card', card: { id, kind: 'quiz', title: `Quick check: ${topic}`, quiz: [], source: 'Claude' } })
            }
            teachHooks.live({ op: 'quiz', id, q })
          })
        }
      }
    }
  }

  let buf = ''
  const request = teachHooks
    .ask(
      [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Teach: ${topic}${context}` }
      ],
      (chunk) => {
        if (my !== gen) return
        buf += chunk
        let i: number
        while ((i = buf.indexOf('\n')) >= 0) {
          handleLine(buf.slice(0, i))
          buf = buf.slice(i + 1)
        }
      }
    )
    .then(() => {
      if (buf.trim()) handleLine(buf)
      buf = ''
    })
    .catch((e) => console.warn('Nova teach:', e))
    .finally(() => {
      streamDone = true
      wake()
    })

  // The performer: beat after beat, each sentence spoken with its visuals.
  let started: (v: boolean) => void = () => {}
  const startedP = new Promise<boolean>((r) => (started = r))
  void (async () => {
    for (let i = 0; ; i++) {
      while (i >= beats.length && !streamDone) await new Promise<void>((r) => (wake = r))
      if (i >= beats.length || my !== gen) break
      // Don't start a sentence until the visuals written right after it have had a moment to arrive.
      if (i === beats.length - 1 && !streamDone) await Promise.race([new Promise((r) => setTimeout(r, 350)), request])
      playing = i
      const b = beats[i]
      for (const op of b.ops.splice(0)) if (my === gen) op()
      if (b.say) {
        started(true)
        await teachHooks.sayAndWait(b.say)
      }
    }
    started(beats.length > 1)
    if (my === gen) teachHooks.live({ op: 'end' })
  })()
  const ok = await startedP
  return { started: ok, first: firstSay }
}
