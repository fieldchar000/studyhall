// Nova teaches, live (the Roamies way): Claude writes a short lesson as a script, and Nova performs it
// while it's still being written: an answer card that fills in line by line, a pixel diagram, the key
// sentence underlined (on your own screen when you're reading about it, otherwise on a brief source page
// beside the cards), a timeline or steps, then a quick quiz. Each visual appears with the sentence about it.

import type { AiMessage, BauerCard, LiveOp, Prefs } from '@shared/types'
import { see, type SeenControl } from './eyes'

const SYSTEM = `You are Nova, a friendly tutor and lab assistant floating beside the student's screen. You teach out loud while your cards and drawings appear beside you, the way a good teacher talks at a whiteboard: the board holds the notes, your voice does the explaining.
Write the lesson as a script, one command per line, exactly in this format (no other text, no markdown, no blank lines):
SAY: <one or two short spoken sentences>
CARD <id> <answer|points|timeline|steps|chart> | <title>
ITEM <card id> | <label, 2 to 6 words> | <detail: one short line, or empty> | <number for a chart, or empty>
DIAGRAM <id> | <title> | <svg on one line>
LOOK <id>
MARK <number> | <tag, 2 to 4 words>
QUIZ <quiz id> | <question> | <option> | <option> | <option> | <index of the right option, 0 to 2> | <why, one short line>

How to teach (this matters most):
- Your voice explains; the cards are the notes. Never read a card out or repeat its words. The cards hold the terse facts (names, numbers, dates, labels); your SAY lines give the why and the how, the cause and effect, an everyday comparison ("think of it like a drain in a bathtub…"), and what to notice.
- Talk to the student, warm and natural: "you", "we", "imagine…", "notice how…", "here's the clever bit…", "so what does that mean?". Contractions, plain words, short sentences. Sound like a person thinking it through with them, not an encyclopedia.
- Point at what you're talking about: refer to your visuals as you go ("see the bright ring on the drawing? that's…", "look at the second step…"). Put LOOK <id> right before a SAY to float over to that card or drawing while you say it (useful when you come back to an earlier one; a new card is looked at automatically).
- Build it up in order: a hook or a question first, then the core idea with a simple picture, then how it works step by step, then why it matters or a surprising fact, then a one-line recap and a check.

The script:
- Open with SAY: a hook (a question, or something vivid). Then CARD c1 answer with the topic as title and 3 or 4 ITEMs: short key facts (the notes), each followed or preceded by a SAY that explains it in your own words.
- A DIAGRAM: a simple labelled drawing of the idea. The svg: one line, viewBox="0 0 320 200", using only rect, circle, ellipse, line, polyline, polygon, path and text; colours #4f86f0, #a8c8ff, #e4eeff and #ffcf7a (for the one thing to notice); no background; text font-size 13 to 16 with short labels. Walk them round it in SAY lines: what each part is and what happens there.
- If the request gives numbered text (a source page or the student's screen), MARK the number of the ONE line that is the key bit, right after a SAY that points to it ("See this line here: it's saying…") and explain it in plainer words.
- If it suits the topic, a timeline (dates in order) or steps (a process) card, explained as a story, not read out.
- Finish with a one-sentence SAY recap, then one QUIZ, then a SAY inviting them to try it.
- 8 to 12 SAY lines, about 140 to 200 spoken words in total. For a university student. Never invent facts, numbers or dates; leave out what you're not sure of.`

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
export async function teach(topic: string, onScreen: boolean, wiki = '', notes?: { title: string; text: string }): Promise<{ started: boolean; first: string }> {
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
  if (!screenLines.length && notes) {
    // Your own study file: its lines are the source page (the key one gets underlined).
    const lines = notes.text
      .split('\n')
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter((l) => l.length > 3)
      .flatMap((l) => (l.length > 240 ? sentencesOf(l) : [l]))
      .slice(0, 40)
    if (lines.length) source = { title: notes.title, url: '', image: null, sentences: lines }
  } else if (!screenLines.length && prefs.novaSource !== 'none') {
    const page = (wiki ? await teachHooks.source(wiki).catch(() => null) : null) ?? (await teachHooks.source(topic).catch(() => null))
    if (page) source = { title: page.title, url: page.url, image: page.image, sentences: sentencesOf(page.text) }
  }
  if (my !== gen) return { started: false, first: '' }
  teachHooks.live({ op: 'start', source })

  const context = screenLines.length
    ? `\n\nNumbered text on the student's screen:\n${screenLines.map((c) => `${c.id}: ${c.name}`).join('\n')}`
    : source
      ? `\n\n${notes ? `The student's own study notes ("${source.title}"): teach from these, using their wording for key terms and saying it's from their notes. Numbered lines` : `Source page (${source.title}), numbered sentences`}:\n${source.sentences.map((s, i) => `${i + 1}: ${s}`).join('\n')}`
      : ''

  // ----- Performing the script while it streams in -----
  const beats: Beat[] = [{ say: null, ops: [] }]
  let playing = -1 // index of the beat being performed
  let streamDone = false
  let wake: () => void = () => {}
  const cards = new Map<string, BauerCard['kind']>()
  let firstSay = ''
  let lastCard = '' // the latest points/timeline/steps/chart card

  const addOp = (op: () => void): void => {
    const b = beats[beats.length - 1]
    if (beats.length - 1 === playing) op() // this beat is being said right now: show it straight away
    else b.ops.push(op)
  }
  const handleLine = (raw: string): void => {
    const line = raw.trim()
    if (!line) return
    if (process.env.STUDYHALL_OFFSCREEN === '1') console.info('teach>', line.slice(0, 160)) // (automated tests read the script)
    let m: RegExpExecArray | null
    if ((m = /^SAY:\s*(.+)$/i.exec(line))) {
      beats.push({ say: m[1].trim(), ops: [] })
      if (!firstSay) firstSay = m[1].trim()
      wake()
    } else if ((m = /^CARD\s+(\S+)\s+(answer|points|timeline|steps|chart)\s*\|\s*(.+)$/i.exec(line))) {
      const [, id, kind, title] = m
      const k = (kind.toLowerCase() === 'answer' ? 'points' : kind.toLowerCase()) as BauerCard['kind']
      cards.set(id, k)
      lastCard = id
      const card: BauerCard = { id, kind: k, title: title.trim(), items: [], source: source ? 'Wikipedia + Claude' : 'Claude', link: source?.url }
      addOp(() => {
        teachHooks.live({ op: 'card', card })
        teachHooks.live({ op: 'look', id })
      })
    } else if ((m = /^ITEM\s+(\S+)\s*\|\s*([^|]*)\|?\s*([^|]*)\|?\s*([^|]*)$/i.exec(line))) {
      const [, given, label, detail, num] = m
      // (ITEM lines name their card; one that names something else goes on the latest card.)
      const id = cards.has(given) ? given : lastCard
      if (!id) return
      const value = Number(String(num).replace(/[^0-9.-]/g, ''))
      const item = { label: label.trim(), detail: detail.trim() || undefined, value: Number.isFinite(value) && String(num).trim() ? value : undefined }
      if (item.label) addOp(() => teachHooks.live({ op: 'item', id, item }))
    } else if ((m = /^DIAGRAM\s+(\S+)\s*\|\s*([^|]*)\|\s*(<svg[\s\S]*<\/svg>)\s*$/i.exec(line))) {
      const [, id, title, svg] = m
      const card: BauerCard = { id, kind: 'diagram', title: title.trim() || topic, svg: svg.slice(0, 20000), source: 'Claude' }
      addOp(() => {
        teachHooks.live({ op: 'card', card })
        teachHooks.live({ op: 'look', id })
      })
    } else if ((m = /^LOOK\s+(\S+)\s*$/i.exec(line))) {
      const id = m[1]
      addOp(() => teachHooks.live({ op: 'look', id }))
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
