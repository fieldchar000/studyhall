import { BrowserWindow, type WebContents, type WebFrameMain } from 'electron'
import { findCourse, LMS, lockDown, PART, schoolData, type SchoolCourse } from './politemall'
import type { SavedQuiz } from '@shared/types'
import { politeView, politeViewVisible } from './politePage'
import { upsertSavedQuiz } from './politeQuizStore'

let quizWin: BrowserWindow | null = null
let activeRecord: SavedQuiz | null = null
let lastScraped: ScrapedQuestion[] = []

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export type QuizImage = { label: string; data: string }
export type QuizResult = { text: string; images?: QuizImage[] }

function getQuizWin(): BrowserWindow {
  if (quizWin && !quizWin.isDestroyed()) return quizWin
  lockDown()
  const w = new BrowserWindow({
    width: 1180,
    height: 840,
    title: 'PoliteMall Quiz',
    autoHideMenuBar: true,
    webPreferences: {
      partition: PART,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(LMS)) void w.webContents.loadURL(url)
    return { action: 'deny' }
  })
  w.on('closed', () => {
    if (quizWin === w) quizWin = null
  })
  quizWin = w
  return w
}

function activeQuizWc(): WebContents | null {
  const pv = politeView()
  if (pv && !pv.webContents.isDestroyed() && pv.webContents.getURL().includes('/d2l/lms/quizzing/')) {
    return pv.webContents
  }
  if (quizWin && !quizWin.isDestroyed()) return quizWin.webContents
  return null
}

/** True while a PoliteMall quiz attempt is open (keeps Nova locked to Sonnet + High effort). */
export function currentPoliteQuizLabel(): string | null {
  return activeRecord?.title ?? null
}

export function isPoliteQuizActive(): boolean {
  const pv = politeView()
  if (pv && !pv.webContents.isDestroyed() && pv.webContents.getURL().includes('/d2l/lms/quizzing/user/attempt/')) {
    return true
  }
  return !!(quizWin && !quizWin.isDestroyed() && quizWin.webContents.getURL().includes('/d2l/lms/quizzing/'))
}

async function evalAllFrames<T>(wc: WebContents, buildCode: (frameIdx: number) => string): Promise<{ frame: WebFrameMain; result: T }[]> {
  const out: { frame: WebFrameMain; result: T }[] = []
  const frames = wc.mainFrame.framesInSubtree
  for (let i = 0; i < frames.length; i++) {
    try {
      const result = (await frames[i].executeJavaScript(buildCode(i), true)) as T
      out.push({ frame: frames[i], result })
    } catch {
      /* cross-origin or detached frame */
    }
  }
  return out
}

/** Captures a JPEG base64 screenshot directly from any Studyhall/PoliteMall WebContents. */
async function captureWcJpeg(wc: WebContents): Promise<string | null> {
  if (wc.isDestroyed()) return null
  try {
    const raw = await wc.capturePage()
    if (raw.isEmpty()) return null
    const { width } = raw.getSize()
    const img = width > 1280 ? raw.resize({ width: 1280 }) : raw
    return img.toJPEG(82).toString('base64')
  } catch {
    return null
  }
}

type ScrollMetric = { found: boolean; height: number; top: number; bottom: number; vh: number; scrollH: number }

async function scrollToQuestion(wc: WebContents, qid: string, block: 'start' | 'center' | 'end' = 'start'): Promise<ScrollMetric | null> {
  const js = `(() => {
    const findQ = (root) => {
      const direct = root.querySelector('[data-sh-q="' + ${JSON.stringify(qid)} + '"]')
      if (direct) return direct
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const hit = findQ(el.shadowRoot)
          if (hit) return hit
        }
      }
      return null
    }
    const el = findQ(document)
    if (!el) return { found: false, height: 0, top: 0, bottom: 0, vh: 0, scrollH: 0 }
    try { window.frameElement?.scrollIntoView({ block: ${JSON.stringify(block)}, inline: 'nearest' }) } catch {}
    el.scrollIntoView({ block: ${JSON.stringify(block)}, inline: 'nearest' })
    if (${JSON.stringify(block)} === 'end') {
      window.scrollBy(0, 160)
      let p = el.parentElement
      while (p) {
        if (p.scrollHeight > p.clientHeight + 4) {
          p.scrollTop += 160
          break
        }
        p = p.parentElement
      }
    }
    const r = el.getBoundingClientRect()
    return {
      found: true,
      height: Math.round(r.height),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      vh: Math.round(window.innerHeight || 0),
      scrollH: Math.round(document.documentElement?.scrollHeight || 0)
    }
  })()`
  const hits = await evalAllFrames<ScrollMetric>(wc, () => js)
  return hits.find((h) => h.result?.found)?.result ?? null
}

/** Captures 1-3 overlapping views of a question so tall diagrams and bottom options are never cut off. */
async function captureQuestionShots(wc: WebContents, qid: string, prefix: string): Promise<QuizImage[]> {
  const out: QuizImage[] = []
  const mainH = Number(await wc.mainFrame.executeJavaScript('window.innerHeight', true).catch(() => 750)) || 750

  const top = await scrollToQuestion(wc, qid, 'start')
  await sleep(300)
  const first = await captureWcJpeg(wc)
  if (!first) return out

  const vh = top ? Math.min(top.vh || mainH, mainH) : mainH
  const cutOff = !top || top.bottom > vh - 90 || top.height > Math.max(360, vh - 160) || top.scrollH > vh + 80
  if (!cutOff) {
    out.push({ label: `${prefix} ${qid}`, data: first })
    return out
  }

  out.push({ label: `${prefix} ${qid} (top)`, data: first })

  if (top && top.height > Math.max(740, (vh - 120) * 1.65)) {
    await scrollToQuestion(wc, qid, 'center')
    await sleep(300)
    const mid = await captureWcJpeg(wc)
    if (mid) out.push({ label: `${prefix} ${qid} (middle)`, data: mid })
  }

  const botMetric = await scrollToQuestion(wc, qid, 'end')
  await sleep(300)
  if (!top || !botMetric || Math.abs(botMetric.top - top.top) > 30 || top.bottom > vh - 90) {
    const bot = await captureWcJpeg(wc)
    if (bot) out.push({ label: `${prefix} ${qid} (bottom)`, data: bot })
  }

  return out
}

async function clickButton(wc: WebContents, patterns: string[]): Promise<string | null> {
  const js = `(() => {
    const res = ${JSON.stringify(patterns)}.map((p) => new RegExp(p, 'i'))
    const walk = (root) => {
      const els = [...root.querySelectorAll('button, d2l-button, input[type="button"], input[type="submit"], a.d2l-button')]
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) els.push(...walk(el.shadowRoot))
      }
      return els
    }
    for (const el of walk(document)) {
      const label = (el.innerText || el.textContent || el.value || el.getAttribute('text') || el.getAttribute('aria-label') || '').trim()
      if (!label || el.disabled) continue
      if (res.some((r) => r.test(label))) {
        el.scrollIntoView({ block: 'center' })
        el.click()
        const inner = el.shadowRoot?.querySelector('button')
        if (inner) inner.click()
        return label
      }
    }
    return null
  })()`
  for (const { result } of await evalAllFrames<string | null>(wc, () => js)) {
    if (result) return result
  }
  return null
}

type ScrapedQuestion = {
  qid: string
  prompt: string
  kind: 'radio' | 'checkbox' | 'text' | 'select' | 'richtext'
  hasImage: boolean
  options?: { id: string; label: string; checked?: boolean }[]
  value?: string
}

async function readQuizPage(wc: WebContents): Promise<{
  url: string
  questions: ScrapedQuestion[]
  hasNext: boolean
  hasSubmit: boolean
  fallbackText: string
}> {
  const buildScrapeJs = (frameIdx: number): string => `(() => {
    const clean = (s) => String(s || '').replace(/\\s+/g, ' ').trim()

    const walkAll = (root, sel) => {
      const out = []
      try { out.push(...root.querySelectorAll(sel)) } catch {}
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) out.push(...walkAll(el.shadowRoot, sel))
      }
      return out
    }

    // Deep text reader that pierces Brightspace Shadow DOM, <template>, and <d2l-html-block html="...">
    const deepText = (node, skipFn) => {
      if (!node) return ''
      if (node.nodeType === 3) return node.nodeValue || ''
      if (node.nodeType === 11) {
        let out = ''
        for (const ch of node.childNodes) out += deepText(ch, skipFn)
        return out
      }
      if (node.nodeType !== 1) return ''
      const tag = (node.tagName || '').toUpperCase()
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'SVG') return ''
      if (skipFn && skipFn(node)) return ''
      if (tag === 'D2L-HTML-BLOCK') {
        if (node.shadowRoot) {
          const st = deepText(node.shadowRoot, skipFn)
          if (clean(st)) return ' ' + st + ' '
        }
        const tpl = node.querySelector('template')
        if (tpl?.content) {
          const st = deepText(tpl.content, skipFn)
          if (clean(st)) return ' ' + st + ' '
        }
        const rawHtml = node.getAttribute('html')
        if (rawHtml) {
          try {
            const doc = new DOMParser().parseFromString(rawHtml, 'text/html')
            return ' ' + clean(doc.body?.textContent || '') + ' '
          } catch {}
        }
      }
      let out = ''
      if (node.shadowRoot) {
        for (const ch of node.shadowRoot.childNodes) out += deepText(ch, skipFn)
      }
      if (tag === 'SLOT' && typeof node.assignedNodes === 'function') {
        for (const ch of node.assignedNodes({ flatten: true })) out += deepText(ch, skipFn)
      } else {
        for (const ch of node.childNodes) out += deepText(ch, skipFn)
      }
      if (/^(P|DIV|BR|LI|TR|H[1-6]|LEGEND)$/.test(tag)) out += ' '
      return out
    }

    const hasControls = (el) => {
      if (walkAll(el, 'input[type="radio"], input[type="checkbox"], input[type="text"], textarea, select').length > 0) return true
      return [...el.querySelectorAll('iframe')].some((f) => {
        try { return !!f.contentDocument?.querySelector('[contenteditable="true"]') } catch { return false }
      })
    }

    // Prefer Brightspace's outer question wrapper (contains BOTH prompt + options).
    let containers = walkAll(document, '.d2l-quiz-question-autosave-container').filter(hasControls)
    if (!containers.length) {
      const generic = walkAll(document, '[class*="quiz-question"]').filter((el) => {
        const cls = String(el.className || '')
        return !/(header|number|points|saved|title)/i.test(cls) && hasControls(el)
      })
      containers = generic.filter((el) => !generic.some((other) => other !== el && el.contains(other)))
    }
    if (!containers.length) {
      const fields = walkAll(document, 'fieldset').filter(hasControls)
      containers = fields.map((fs) => {
        let cur = fs
        for (let step = 0; step < 3 && cur.parentElement; step++) {
          const parent = cur.parentElement
          if (parent.tagName === 'BODY' || parent.tagName === 'FORM') break
          if (walkAll(parent, 'fieldset').filter(hasControls).length > 1) break
          cur = parent
        }
        return cur
      })
      containers = [...new Set(containers)]
    }

    const findLabel = (inp) => {
      const labelledBy = (inp.getAttribute('aria-labelledby') || '').trim()
      if (labelledBy) {
        const parts = labelledBy
          .split(/\\s+/)
          .map((id) => clean(deepText(document.getElementById(id))))
          .filter(Boolean)
        if (parts.length) return parts.join(' ')
      }
      if (inp.id) {
        const l = walkAll(document, 'label').find((x) => x.getAttribute('for') === inp.id)
        if (l) {
          const t = clean(deepText(l))
          if (t) return t
        }
      }
      for (const sel of ['label', 'tr', 'li', '.d2l-rowshadeonhover-selected-static', '.d2l-quiz-answer-container']) {
        const wrap = inp.closest(sel)
        if (wrap) {
          const t = clean(deepText(wrap))
          if (t) return t
          if (walkAll(wrap, 'img, canvas, svg').some((e) => Math.max(e.naturalWidth || 0, e.getBoundingClientRect().width || 0) >= 40)) {
            return '[Image option - see attached screenshot]'
          }
        }
      }
      const sib = inp.parentElement?.nextElementSibling
      if (sib) {
        const t = clean(deepText(sib))
        if (t) return t
      }
      return clean(inp.getAttribute('aria-label') || inp.value)
    }

    const questions = []
    containers.forEach((box, idx) => {
      const qid = 'f${frameIdx}_q' + (idx + 1)
      box.setAttribute('data-sh-q', qid)

      const radios = walkAll(box, 'input[type="radio"]')
      const checks = walkAll(box, 'input[type="checkbox"]')
      const selects = walkAll(box, 'select')
      const texts = walkAll(box, 'input[type="text"], textarea')
      const richBody = [...box.querySelectorAll('iframe')]
        .map((f) => { try { return f.contentDocument?.querySelector('[contenteditable="true"]') || null } catch { return null } })
        .find(Boolean) || null

      // Detect real diagrams/photos/charts (>= 80x60), ignoring tiny Brightspace UI icons
      const hasImage = walkAll(box, 'img, canvas, svg').some((el) => {
        const tag = (el.tagName || '').toUpperCase()
        if (tag === 'IMG') {
          const src = String(el.getAttribute('src') || '')
          if (/\\/d2l\\/img\\/|\\/icons?\\//i.test(src)) return false
        }
        const rect = el.getBoundingClientRect()
        const w = Math.max(el.naturalWidth || 0, rect.width || 0)
        const h = Math.max(el.naturalHeight || 0, rect.height || 0)
        return w >= 80 && h >= 60
      })

      const skipOptions = (el) => {
        const tag = (el.tagName || '').toUpperCase()
        if (tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'D2L-BUTTON') return true
        if (tag === 'TR' && el.querySelector('input[type="radio"], input[type="checkbox"]')) return true
        if (tag === 'LABEL' && (el.querySelector('input[type="radio"], input[type="checkbox"]') || el.getAttribute('for'))) return true
        return false
      }
      let prompt = clean(deepText(box, skipOptions)).slice(0, 1500)
      if (prompt.length < 12) {
        prompt = clean(deepText(box)).slice(0, 1500)
      }

      if (radios.length) {
        const options = radios.map((inp, j) => {
          const id = qid + '_o' + j
          inp.setAttribute('data-sh-id', id)
          return { id, label: findLabel(inp), checked: inp.checked }
        })
        questions.push({ qid, prompt, kind: 'radio', hasImage, options })
      } else if (checks.length) {
        const options = checks.map((inp, j) => {
          const id = qid + '_o' + j
          inp.setAttribute('data-sh-id', id)
          return { id, label: findLabel(inp), checked: inp.checked }
        })
        questions.push({ qid, prompt, kind: 'checkbox', hasImage, options })
      } else if (selects.length) {
        const sel = selects[0]
        const id = qid + '_s0'
        sel.setAttribute('data-sh-id', id)
        const options = [...sel.options].map((o) => ({ id: o.value, label: clean(o.text), checked: o.selected }))
        questions.push({ qid, prompt, kind: 'select', hasImage, options })
      } else if (richBody) {
        const id = qid + '_r0'
        richBody.setAttribute('data-sh-id', id)
        questions.push({ qid, prompt, kind: 'richtext', hasImage, value: clean(richBody.innerText) })
      } else if (texts.length) {
        const inp = texts[0]
        const id = qid + '_t0'
        inp.setAttribute('data-sh-id', id)
        questions.push({ qid, prompt, kind: 'text', hasImage, value: inp.value })
      }
    })

    const hasBtn = (re) =>
      walkAll(document, 'button, d2l-button, input[type="button"], input[type="submit"]')
        .some((el) => !el.disabled && re.test((el.innerText || el.textContent || el.value || el.getAttribute('text') || '').trim()))

    const bodyText = questions.length === 0 || questions.some((q) => q.prompt.length < 15)
      ? clean(deepText(document.body)).slice(0, 6000)
      : ''

    return {
      questions,
      hasNext: hasBtn(/^next\\s*page$/i),
      hasSubmit: hasBtn(/^submit\\s*quiz$/i),
      bodyText
    }
  })()`

  const frames = await evalAllFrames<{ questions: ScrapedQuestion[]; hasNext: boolean; hasSubmit: boolean; bodyText: string }>(wc, buildScrapeJs)
  const questions = frames.flatMap((f) => f.result?.questions ?? [])
  const fallbackText = frames
    .map((f) => f.result?.bodyText ?? '')
    .filter((t) => t.length > 40)
    .join('\n---\n')
    .slice(0, 10_000)

  console.info(
    `[politeQuiz] url=${wc.getURL()} questions=${questions.length} diagrams=${questions.filter((q) => q.hasImage).length} sample="${(questions[0]?.prompt ?? '').slice(0, 90)}" opt0="${(questions[0]?.options?.[0]?.label ?? '').slice(0, 40)}"`
  )

  return {
    url: wc.getURL(),
    questions,
    hasNext: frames.some((f) => f.result?.hasNext),
    hasSubmit: frames.some((f) => f.result?.hasSubmit),
    fallbackText
  }
}

/** Auto-captures screenshots of questions that contain diagrams/images so Nova can see them straight away. */
async function captureDiagrams(wc: WebContents, questions: ScrapedQuestion[]): Promise<QuizImage[]> {
  const withImg = questions.filter((q) => q.hasImage).slice(0, 4)
  const out: QuizImage[] = []
  for (const q of withImg) {
    out.push(...(await captureQuestionShots(wc, q.qid, 'Diagram for')))
  }
  return out
}

async function waitForQuestions(wc: WebContents, timeoutMs = 10_000): Promise<Awaited<ReturnType<typeof readQuizPage>>> {
  const deadline = Date.now() + timeoutMs
  let last = await readQuizPage(wc)
  while (!last.questions.length && Date.now() < deadline) {
    const extraStart = await clickButton(wc, ['^start\\s*quiz', '^continue\\s*quiz'])
    await sleep(extraStart ? 2000 : 800)
    last = await readQuizPage(wc)
  }
  return last
}

function findQuiz(courseQuery?: string, quizQuery?: string): { course: SchoolCourse; quiz: SchoolCourse['quizzes'][number] } | null {
  const d = schoolData()
  if (!d) return null
  const courses = courseQuery ? [findCourse(courseQuery)].filter((c): c is SchoolCourse => !!c) : d.courses
  const qn = norm(quizQuery ?? '')

  for (const c of courses) {
    if (!c.quizzes.length) continue
    if (!qn) {
      const next = c.quizzes.find((q) => !q.attempts) ?? c.quizzes[0]
      if (next) return { course: c, quiz: next }
    }
    const hit =
      c.quizzes.find((q) => norm(q.name) === qn) ??
      c.quizzes.find((q) => norm(q.name).includes(qn)) ??
      c.quizzes.find((q) => qn.split(' ').every((w) => norm(q.name).includes(w)))
    if (hit) return { course: c, quiz: hit }
  }
  return null
}

function formatPage(title: string, page: Awaited<ReturnType<typeof readQuizPage>>, capturedIds: Set<string>): string {
  const lines = page.questions.map((q) => {
    const imgNote = q.hasImage
      ? capturedIds.has(q.qid)
        ? ' [DIAGRAM ATTACHED BELOW]'
        : ' [CONTAINS IMAGE/DIAGRAM - call see_studyhall(target: "quiz", qid: "' + q.qid + '") to view it]'
      : ''
    if (q.kind === 'radio' || q.kind === 'checkbox' || q.kind === 'select') {
      const opts = (q.options ?? []).map((o) => `  - [${o.id}] ${o.label}`).join('\n')
      return `${q.qid} (${q.kind})${imgNote}: ${q.prompt}\n${opts}`
    }
    const tid = q.kind === 'richtext' ? `${q.qid}_r0` : `${q.qid}_t0`
    return `${q.qid} (${q.kind}, target_id: ${tid})${imgNote}: ${q.prompt}`
  })
  const parts = [
    `Quiz: ${title} (${page.questions.length} questions on this page)`,
    ...lines,
    `\nNavigation: ${page.hasNext ? 'Has Next Page (set next_page: true in polite_quiz_answer)' : page.hasSubmit ? 'Final page (call polite_quiz_submit after answering)' : 'Check page'}`
  ]
  if (page.fallbackText && page.questions.some((q) => q.prompt.length < 15)) {
    parts.push(`\nFull page text (fallback for any short prompts above):\n${page.fallbackText}`)
  }
  return parts.join('\n\n')
}

function recordPageQuestions(questions: ScrapedQuestion[], images: QuizImage[]): void {
  lastScraped = questions
  if (!activeRecord) return
  const now = new Date().toISOString()
  for (const q of questions) {
    const key = norm(q.prompt).slice(0, 140)
    if (!key) continue
    const opts = (q.options ?? []).map((o) => o.label).filter(Boolean)
    const qImgs = images
      .filter((img) => img.label.includes(q.qid))
      .slice(0, 2)
      .map((img) => `data:image/jpeg;base64,${img.data}`)
    const existing = activeRecord.questions.find(
      (item) => norm(item.prompt).slice(0, 140) === key
    )
    if (existing) {
      if (!existing.options.length && opts.length) existing.options = opts
      if (!existing.images.length && qImgs.length) existing.images = qImgs
    } else {
      activeRecord.questions.push({
        id: `item_${activeRecord.questions.length + 1}_${Math.random().toString(36).slice(2, 6)}`,
        prompt: q.prompt,
        kind: q.kind,
        options: opts,
        chosen: [],
        images: qImgs,
        note: '',
        ease: 2.5,
        repetitions: 0,
        interval_days: 0,
        due_at: now
      })
    }
  }
  void upsertSavedQuiz(activeRecord).catch(() => {})
}

function recordAppliedAnswers(answers: { target_id: string; text?: string }[]): void {
  if (!activeRecord || !lastScraped.length) return
  for (const a of answers) {
    for (const q of lastScraped) {
      let val: string | null = null
      if (q.kind === 'radio' || q.kind === 'checkbox') {
        const opt = q.options?.find((o) => o.id === a.target_id)
        if (opt) val = opt.label || a.target_id
      } else if (q.kind === 'select' && a.target_id === `${q.qid}_s0`) {
        const opt = q.options?.find((o) => o.id === (a.text ?? ''))
        val = opt?.label || a.text || ''
      } else if (a.target_id === `${q.qid}_t0` || a.target_id === `${q.qid}_r0`) {
        val = a.text ?? ''
      }
      if (val === null) continue
      const key = norm(q.prompt).slice(0, 140)
      const saved = activeRecord.questions.find(
        (item) => norm(item.prompt).slice(0, 140) === key
      )
      if (!saved) continue
      if (q.kind === 'checkbox') {
        if (val && !saved.chosen.includes(val)) saved.chosen.push(val)
      } else {
        saved.chosen = val ? [val] : []
      }
      break
    }
  }
  void upsertSavedQuiz(activeRecord).catch(() => {})
}

export async function openPoliteQuiz(courseQuery?: string, quizQuery?: string): Promise<QuizResult> {
  let wc: WebContents
  let title = 'Current Quiz'
  let courseName = 'PoliteMall'

  const existing = activeQuizWc()
  if (!courseQuery && !quizQuery && existing) {
    wc = existing
    const dt = await wc.mainFrame
      .executeJavaScript('document.title', true)
      .catch(() => '')
    if (typeof dt === 'string' && dt.trim()) {
      title = dt.replace(/\s*-\s*PoliteMall.*$/i, '').trim()
    }
  } else {
    const hit = findQuiz(courseQuery, quizQuery)
    if (!hit) {
      return { text: `Couldn't find a matching quiz${quizQuery ? ` for "${quizQuery}"` : ''}. Call school first to check the exact course and quiz name.` }
    }
    courseName = hit.course.code || hit.course.name || 'PoliteMall'
    title = `${hit.quiz.name} (${courseName})`
    const w = getQuizWin()
    w.show()
    w.focus()
    wc = w.webContents
    const url = `${LMS}/d2l/lms/quizzing/user/quiz_summary.d2l?qi=${hit.quiz.id}&ou=${hit.course.id}`
    await w.loadURL(url)
    await sleep(2000)
  }

  if (!wc.getURL().startsWith(LMS)) {
    return { text: 'PoliteMall redirected away from the LMS (your Microsoft sign-in probably expired). Sign in again in Settings → PoliteMall first.' }
  }

  const started = await clickButton(wc, ['^start\\s*quiz', '^continue\\s*quiz'])
  if (started) await sleep(2000)

  const page = await waitForQuestions(wc, 10_000)
  if (!page.questions.length) {
    const shot = await captureWcJpeg(wc)
    return {
      text: `Opened "${title}" at ${page.url}, but no questions were detected (it may need a password, LockDown Browser, or clicking Start manually).${page.fallbackText ? `\n\nVisible page text:\n${page.fallbackText.slice(0, 2000)}` : ''}`,
      images: shot ? [{ label: `Current view of ${title}`, data: shot }] : undefined
    }
  }

  const images = await captureDiagrams(wc, page.questions)
  if (!activeRecord || activeRecord.url !== page.url) {
    activeRecord = {
      id: `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      title,
      course: courseName,
      url: page.url,
      startedAt: new Date().toISOString(),
      questions: []
    }
  }
  recordPageQuestions(page.questions, images)
  const capturedIds = new Set(page.questions.filter((q) => q.hasImage).slice(0, images.length).map((q) => q.qid))
  return { text: formatPage(title, page, capturedIds), images }
}

export async function answerPoliteQuiz(
  answers: { target_id: string; text?: string }[],
  nextPage = false
): Promise<QuizResult> {
  const wc = activeQuizWc()
  if (!wc) return { text: 'No PoliteMall quiz is open. Call polite_quiz_open first.' }
  const applied: string[] = []

  for (const a of answers) {
    const js = `(() => {
      const findTarget = (root) => {
        const direct = root.querySelector('[data-sh-id="' + ${JSON.stringify(a.target_id)} + '"]')
        if (direct) return direct
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) {
            const hit = findTarget(el.shadowRoot)
            if (hit) return hit
          }
        }
        return null
      }
      const el = findTarget(document)
      if (!el) return false
      el.scrollIntoView({ block: 'center' })
      if (el.isContentEditable) {
        el.focus()
        el.innerText = ${JSON.stringify(a.text ?? '')}
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
        el.blur()
      } else if (el.tagName === 'SELECT') {
        el.value = ${JSON.stringify(a.text ?? '')}
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      } else if (el.type === 'radio' || el.type === 'checkbox') {
        if (!el.checked) el.click()
        if (!el.checked && el.id) {
          const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]')
          if (l) l.click()
        }
        el.dispatchEvent(new Event('change', { bubbles: true }))
      } else {
        el.focus()
        el.value = ${JSON.stringify(a.text ?? '')}
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
        el.blur()
      }
      return true
    })()`
    const hits = await evalAllFrames<boolean>(wc, () => js)
    if (hits.some((h) => h.result)) applied.push(a.target_id)
    await sleep(600 + Math.floor(Math.random() * 600))
  }

  recordAppliedAnswers(answers)
  await sleep(1200)

  if (nextPage) {
    const clicked = await clickButton(wc, ['^next\\s*page$'])
    if (clicked) {
      await sleep(2000)
      const next = await waitForQuestions(wc, 8000)
      const images = await captureDiagrams(wc, next.questions)
      recordPageQuestions(next.questions, images)
      const capturedIds = new Set(next.questions.filter((q) => q.hasImage).slice(0, images.length).map((q) => q.qid))
      return {
        text: `Saved ${applied.length}/${answers.length} answers and moved to the next page.\n\n${formatPage('Next Page', next, capturedIds)}`,
        images
      }
    }
  }

  const state = await readQuizPage(wc)
  return {
    text: `Saved ${applied.length}/${answers.length} answers on this page. ${state.hasNext ? 'There is a Next Page.' : state.hasSubmit ? 'Ready to submit with polite_quiz_submit.' : ''}`
  }
}

export async function submitPoliteQuiz(): Promise<{ ok: boolean; text: string }> {
  const wc = activeQuizWc()
  if (!wc) return { ok: false, text: 'No PoliteMall quiz is open.' }

  const first = await clickButton(wc, ['^submit\\s*quiz$'])
  if (!first) return { ok: false, text: 'Could not find the "Submit Quiz" button on the current page.' }
  await sleep(2500)

  const confirm = await clickButton(wc, ['^submit\\s*quiz$', '^yes,?\\s*submit'])
  await sleep(3000)

  const summary = await evalAllFrames<string>(
    wc,
    () => `(() => (document.body?.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 800))()`
  )
  const pageText = summary.map((s) => s.result).filter(Boolean).join('\n').slice(0, 800)
  if (activeRecord) {
    activeRecord.submittedAt = new Date().toISOString()
    const m = /(\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*%)/.exec(pageText)
    if (m) activeRecord.score = m[1].replace(/\s+/g, ' ').trim()
    await upsertSavedQuiz(activeRecord).catch(() => {})
  }
  return confirm
    ? { ok: true, text: `Quiz submitted (confirmed "${confirm}"). Page says:\n${pageText}` }
    : { ok: false, text: `Clicked "${first}", but did not see a second confirmation button. Page says:\n${pageText}` }
}

/** Captures a live screenshot from inside Studyhall itself (bypasses the screen-helper blindspot). */
export async function seeStudyhall(target: 'auto' | 'quiz' | 'politemall' | 'app' = 'auto', qid?: string): Promise<QuizResult> {
  const pv = politeView()
  const mainWin = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.getTitle() === 'Studyhall')
  const qWc = activeQuizWc()

  if (qid && qWc) {
    const images = await captureQuestionShots(qWc, qid, 'Quiz')
    return images.length
      ? { text: `Captured Studyhall quiz scrolled to ${qid} (${images.length} view${images.length > 1 ? 's' : ''}).`, images }
      : { text: `Could not capture the quiz window for ${qid}.` }
  }

  let wc: WebContents | null = null
  let label = 'Studyhall'

  if (target === 'quiz') {
    wc = qWc
    label = 'PoliteMall Quiz'
  } else if (target === 'politemall') {
    wc = qWc ?? (pv && !pv.webContents.isDestroyed() ? pv.webContents : null)
    label = 'PoliteMall in Studyhall'
  } else if (target === 'app') {
    wc = mainWin?.webContents ?? null
    label = 'Studyhall main window'
  } else {
    if (quizWin && !quizWin.isDestroyed() && quizWin.isVisible()) {
      wc = quizWin.webContents
      label = 'PoliteMall Quiz'
    } else if (politeViewVisible() && pv && !pv.webContents.isDestroyed()) {
      wc = pv.webContents
      label = 'PoliteMall in Studyhall'
    } else if (mainWin) {
      wc = mainWin.webContents
      label = 'Studyhall main window'
    }
  }

  if (!wc) return { text: `No matching Studyhall window (${target}) is open right now.` }
  if (wc === qWc) {
    const firstQ = await evalAllFrames<string | null>(
      wc,
      () => `document.querySelector('[data-sh-q]')?.getAttribute('data-sh-q') || null`
    )
    const foundQid = firstQ.find((f) => f.result)?.result
    if (foundQid) {
      const images = await captureQuestionShots(wc, foundQid, label)
      if (images.length) {
        return { text: `Captured ${label} (${images.length} view${images.length > 1 ? 's' : ''}).`, images }
      }
    }
  }
  const data = await captureWcJpeg(wc)
  if (!data) return { text: `Could not capture ${label} (it may be minimized or hidden).` }
  return { text: `Captured ${label} (${wc.getURL()}).`, images: [{ label, data }] }
}