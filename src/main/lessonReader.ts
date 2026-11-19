// The lesson reader: the whole document you have open, not just what's on screen, straight from where it is (no
// importing). A deck open in PowerPoint (Protected View too), a PDF open in Edge, Opera GX or Chrome (or one on your
// PC, or at a web address), and Nova can:
//  • read every slide or page's text (and a deck's speaker notes) in one go, cheaply, as text;
//  • see any slide or page as a picture when it has a diagram (on demand, kept on this PC so it's never made twice),
//    and show it on a card with labels (Roamies' photo cards fetch it from https://lesson.studyhall.app/…, an address
//    only Studyhall answers);
//  • turn to a slide or page in the app itself (or find a bit of a web page), so it can ring it on your real screen.
// It only reads: nothing is edited or saved, and PowerPoint is never closed (your own decks stay as they are).
// Turning pages needs "Turn pages and scroll" on (Nova's page).

import { app, BrowserWindow, ipcMain, net } from 'electron'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPrefs } from './prefs'
import { handsHelper } from './roamiesTools'

const OFFSCREEN = process.env.STUDYHALL_OFFSCREEN === '1'
export const LESSON_HOST = 'lesson.studyhall.app'

/** Where a line or paragraph of text sits on the page: x, y, width, height as fractions of the page, and the text. */
export type TextBox = [number, number, number, number, string]
export type LessonPage = { n: number; text: string; notes: string; pictures: number; shapes: number; boxes?: TextBox[] }
export type Lesson = {
  id: string
  kind: 'slides' | 'pdf'
  title: string
  source: string // the file's path, or the PDF's web address
  count: number
  current: number // the slide or page you're on (0 when it can't be told)
  pages: LessonPage[]
  app: string // where it's open (PowerPoint, msedge, opera…), or '' for a file read from disk
  window: string // that window's title (to bring it to the front for turning pages)
  url?: string // a browser's address (for turning a PDF's pages)
  protectedView?: boolean
}

const lessons = new Map<string, Lesson>()
const pdfBytes = new Map<string, Uint8Array>()
const cacheDir = (): string => join(app.getPath('userData'), 'cache', 'lessons')
// Studyhall's main window reads PDFs (its own PDF library runs there): main.tsx answers 'lesson:pdf'.
let pdfSeq = 0
const pdfWaiting = new Map<number, (r: string) => void>()
ipcMain.on('lesson:pdfDone', (_e, m: { id: number; result: string }) => {
  pdfWaiting.get(m.id)?.(String(m.result ?? ''))
  pdfWaiting.delete(m.id)
})
function pdfAsk(op: 'text' | 'page', payload: { data: Uint8Array; n?: number; width?: number }): Promise<string> {
  const w = BrowserWindow.getAllWindows().find((x) => !x.isDestroyed() && /index\.html$/.test(x.webContents.getURL()))
  if (!w) return Promise.resolve('error: Studyhall’s window isn’t open.')
  return new Promise((res) => {
    const id = ++pdfSeq
    const t = setTimeout(() => {
      pdfWaiting.delete(id)
      res('error: reading the PDF took too long.')
    }, 90_000)
    pdfWaiting.set(id, (r) => {
      clearTimeout(t)
      res(r)
    })
    w.webContents.send('lesson:pdf', { id, op, ...payload })
  })
}

// ---------- PowerShell, with values in the environment (never inside the script) ----------
function ps(script: string, env: Record<string, string>, timeout = 60_000): Promise<string> {
  const full = `[Console]::OutputEncoding = [Text.Encoding]::UTF8\n$ErrorActionPreference = 'Stop'\n${script}`
  return new Promise((res) =>
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(full, 'utf16le').toString('base64')],
      { env: { ...process.env, ...env }, timeout, windowsHide: true, maxBuffer: 64 << 20 },
      (_e, out) => res(String(out ?? '').trim())
    )
  )
}

// The deck you have open in PowerPoint (the one whose name is in the window's title), read through PowerPoint itself.
const PPT_FIND = `
try { $a = [Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application') } catch { '{"error":"PowerPoint isn''t open."}'; exit }
$cands = @()
foreach ($w in $a.ProtectedViewWindows) { try { $cands += [pscustomobject]@{ p = $w.Presentation; prot = $true } } catch {} }
foreach ($x in $a.Presentations) { try { $cands += [pscustomobject]@{ p = $x; prot = $false } } catch {} }
function Pick { $t = [string]$env:SH_TITLE; $m = $cands | Where-Object { $t -and $t.Contains([IO.Path]::GetFileNameWithoutExtension($_.p.Name)) } | Select-Object -First 1; if (-not $m) { $m = $cands | Where-Object { $env:SH_PATH -and $_.p.FullName -eq $env:SH_PATH } | Select-Object -First 1 }; if (-not $m) { $m = $cands | Select-Object -First 1 }; return $m }
`
const PPT_READ = `${PPT_FIND}
$pick = Pick
if (-not $pick) { '{"error":"No presentation is open in PowerPoint."}'; exit }
$p = $pick.p
$cur = 0
try { foreach ($w in $a.SlideShowWindows) { if ($w.Presentation.FullName -eq $p.FullName) { $cur = $w.View.Slide.SlideIndex } } } catch {}
if (-not $cur) { try { foreach ($w in $a.Windows) { if ($w.Presentation.FullName -eq $p.FullName) { $cur = $w.View.Slide.SlideIndex; break } } } catch {} }
$slides = @()
$sw = [double]$p.PageSetup.SlideWidth; $shh = [double]$p.PageSetup.SlideHeight
foreach ($s in $p.Slides) {
  $t = New-Object System.Collections.Generic.List[string]; $pics = 0; $shapes = 0; $bx = New-Object System.Collections.ArrayList
  $list = New-Object System.Collections.ArrayList; foreach ($sh in $s.Shapes) { [void]$list.Add($sh) }
  for ($i = 0; $i -lt $list.Count; $i++) { $sh = $list[$i]
    try { if ($sh.Type -eq 6) { foreach ($g in $sh.GroupItems) { [void]$list.Add($g) }; continue } } catch {}
    try { if ($sh.HasTextFrame -and $sh.TextFrame.HasText) { $t.Add($sh.TextFrame.TextRange.Text); $tr = $sh.TextFrame.TextRange; $pc = $tr.Paragraphs().Count; for ($k = 1; $k -le $pc -and $bx.Count -lt 40; $k++) { try { $pp = $tr.Paragraphs($k); $tx = $pp.Text.Trim(); if ($tx) { [void]$bx.Add(@([math]::Round($pp.BoundLeft / $sw, 4), [math]::Round($pp.BoundTop / $shh, 4), [math]::Round($pp.BoundWidth / $sw, 4), [math]::Round($pp.BoundHeight / $shh, 4), $tx.Substring(0, [math]::Min(160, $tx.Length)))) } } catch {} } } } catch {}
    try { if ($sh.HasTable) { foreach ($r in $sh.Table.Rows) { $c = @(); foreach ($cell in $r.Cells) { $c += $cell.Shape.TextFrame.TextRange.Text }; $t.Add(($c -join ' | ')) } } } catch {}
    try { if (@(3,11,13,21,24,28) -contains [int]$sh.Type -or $sh.HasChart -or $sh.HasSmartArt) { $pics++ } elseif (@(1,9,17) -contains [int]$sh.Type) { $shapes++ } } catch {}
  }
  $notes = ''; try { $notes = $s.NotesPage.Shapes.Placeholders(2).TextFrame.TextRange.Text } catch {}
  $slides += [pscustomobject]@{ n = $s.SlideIndex; text = ($t -join "\`n"); notes = $notes; pictures = $pics; shapes = $shapes; boxes = $bx }
}
[pscustomobject]@{ path = $p.FullName; name = $p.Name; count = $p.Slides.Count; current = $cur; protected = $pick.prot; ratio = ($p.PageSetup.SlideHeight / $p.PageSetup.SlideWidth); slides = $slides } | ConvertTo-Json -Depth 6 -Compress
`
// One slide as a picture. From the open deck; if PowerPoint won't export from it (some Protected View files), from a
// copy opened out of sight, which is then closed again. PowerPoint itself is never closed.
const PPT_EXPORT = `${PPT_FIND}
$pick = Pick; $done = $false; $w = [int]$env:SH_W; $h = [int]$env:SH_H; $n = [int]$env:SH_N
if ($pick) { try { $pick.p.Slides($n).Export($env:SH_OUT, 'JPG', $w, $h); $done = $true } catch {} }
if (-not $done -and $env:SH_PATH -and (Test-Path -LiteralPath $env:SH_PATH)) {
  $tmp = [IO.Path]::Combine($env:TEMP, 'studyhall-lesson-' + [guid]::NewGuid() + [IO.Path]::GetExtension($env:SH_PATH))
  Copy-Item -LiteralPath $env:SH_PATH -Destination $tmp
  try { $q = $a.Presentations.Open($tmp, $true, $false, $false); try { $q.Slides($n).Export($env:SH_OUT, 'JPG', $w, $h); $done = $true } finally { $q.Close() } } catch {} finally { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
}
if ($done) { 'ok' } else { 'fail' }
`
// Go to a slide in the open deck (a slide show, the normal view; Protected View has no "go to", so: the arrow keys).
const PPT_GOTO = `${PPT_FIND}
$pick = Pick; $n = [int]$env:SH_N
if (-not $pick) { 'fail'; exit }
foreach ($w in $a.SlideShowWindows) { try { if ($w.Presentation.FullName -eq $pick.p.FullName) { $w.View.GotoSlide($n); 'ok'; exit } } catch {} }
foreach ($w in $a.Windows) { try { if ($w.Presentation.FullName -eq $pick.p.FullName) { $w.Activate(); $w.View.GotoSlide($n); 'ok'; exit } } catch {} }
foreach ($w in $a.ProtectedViewWindows) { try { if ($w.Presentation.FullName -eq $pick.p.FullName) { $w.Activate(); Start-Sleep -Milliseconds 300; $sh = New-Object -ComObject WScript.Shell; $sh.SendKeys('{HOME}'); if ($n -gt 1) { $sh.SendKeys('{PGDN ' + ($n - 1) + '}') }; 'ok'; exit } } catch {} }
'fail'
`
// Keys to a window (brought to the front by its title): Ctrl+L and an address for a browser's PDF, Ctrl+F for a page.
const KEYS = `
$sh = New-Object -ComObject WScript.Shell
if (-not $sh.AppActivate($env:SH_TITLE)) { 'fail'; exit }
Start-Sleep -Milliseconds 350
foreach ($k in ($env:SH_KEYS -split [char]1)) { if ($k -like 'sleep:*') { Start-Sleep -Milliseconds ([int]$k.Substring(6)) } else { $sh.SendKeys($k) } }
'ok'
`
/** Text typed with SendKeys: its special characters are written as {c}. */
const literal = (s: string): string => s.replace(/[+^%~(){}[\]]/g, (c) => `{${c}}`)

// ---------- What's in front ----------
type Front = { app: string; exe: string; title: string; url?: string }
async function front(): Promise<Front | null> {
  if (OFFSCREEN || !existsSync(handsHelper())) return null
  const out = await new Promise<string>((res) => execFile(handsHelper(), ['front'], { timeout: 4000, windowsHide: true }, (_e, o) => res(String(o ?? ''))))
  try {
    const f = JSON.parse(out.trim().split('\n').pop() || '{}')
    return f.app ? { app: String(f.app), exe: String(f.exe ?? ''), title: String(f.title ?? ''), url: f.url ? String(f.url) : undefined } : null
  } catch {
    return null
  }
}

const idOf = (s: string): string => createHash('sha1').update(s).digest('hex').slice(0, 12)
const isPdfUrl = (u: string): boolean => /\.pdf(?:$|[?#])/i.test(u)

async function readSlides(title: string, path = ''): Promise<Lesson | string> {
  const raw = await ps(PPT_READ, { SH_TITLE: title, SH_PATH: path }, 90_000)
  let j: { error?: string; path: string; name: string; count: number; current: number; protected: boolean; ratio: number; slides: LessonPage[] | LessonPage }
  try {
    j = JSON.parse(raw)
  } catch {
    return 'PowerPoint didn’t answer (it may be busy with a dialog box).'
  }
  if (j.error) return j.error
  const st = await stat(j.path).catch(() => null)
  const id = idOf(`${j.path}|${st?.mtimeMs ?? ''}`)
  const pages = (Array.isArray(j.slides) ? j.slides : [j.slides]).map((s) => ({ n: Number(s.n), text: String(s.text ?? '').trim(), notes: String(s.notes ?? '').trim(), pictures: Number(s.pictures) || 0, shapes: Number(s.shapes) || 0, boxes: Array.isArray(s.boxes) ? (s.boxes as unknown[]).filter((b): b is TextBox => Array.isArray(b) && b.length === 5) : [] }))
  const lesson: Lesson = { id, kind: 'slides', title: j.name.replace(/\.(pptx?|ppsx?|pptm)$/i, ''), source: j.path, count: j.count, current: j.current, pages, app: 'PowerPoint', window: title, protectedView: j.protected }
  ;(lesson as Lesson & { ratio?: number }).ratio = j.ratio || 0.5625
  return lesson
}

async function pdfFrom(source: string): Promise<Uint8Array | string> {
  if (/^file:/i.test(source)) source = fileURLToPath(source)
  if (/^https?:/i.test(source)) {
    const res = await net.fetch(source, { headers: { 'User-Agent': 'Mozilla/5.0 Studyhall' } }).catch(() => null)
    if (!res?.ok) return `Couldn’t download that PDF${res ? ` (${res.status})` : ''}.`
    if (!/pdf/i.test(res.headers.get('content-type') ?? '') && !isPdfUrl(source)) return 'That address isn’t a PDF (it may need a login).'
    return new Uint8Array(await res.arrayBuffer())
  }
  if (!existsSync(source)) return `There’s no file at ${source}.`
  return new Uint8Array(await readFile(source))
}

async function readPdf(source: string, fr: Front | null): Promise<Lesson | string> {
  const data = await pdfFrom(source)
  if (typeof data === 'string') return data
  const id = idOf(`${source}|${data.length}|${createHash('sha1').update(data.subarray(0, 65536)).digest('hex')}`)
  pdfBytes.set(id, data)
  const out = await pdfAsk('text', { data })
  let pages: LessonPage[]
  try {
    pages = (JSON.parse(out) as { n: number; text: string; pictures: number; boxes?: TextBox[] }[]).map((p) => ({ n: p.n, text: p.text.trim(), notes: '', pictures: p.pictures, shapes: 0, boxes: p.boxes ?? [] }))
  } catch {
    return `Couldn’t read that PDF: ${out.slice(0, 120)}`
  }
  const name = decodeURIComponent(source.split(/[\\/]/).pop() ?? 'PDF').replace(/[?#].*$/, '').replace(/\.pdf$/i, '')
  const page = Number(/[#&]page=(\d+)/i.exec(fr?.url ?? '')?.[1] ?? 0)
  return { id, kind: 'pdf', title: name, source, count: pages.length, current: page, pages, app: fr?.app ?? '', window: fr?.title ?? '', url: fr?.url }
}

/** The document: what's in front (PowerPoint or a PDF in a browser), or a file path or PDF address you name. */
export async function readLesson(target = 'front'): Promise<Lesson | string> {
  const t = String(target || 'front').trim()
  if (t !== 'front') {
    if (/\.(pptx?|ppsx?|pptm)$/i.test(t)) return remember(await readSlides('', t))
    if (/\.pdf$/i.test(t) || isPdfUrl(t) || /^file:/i.test(t)) return remember(await readPdf(t, null))
    return 'Give a .pptx or .pdf file (or a PDF’s web address), or leave it out for what you have open.'
  }
  const fr = await front()
  if (!fr) return OFFSCREEN ? '(Automated test: give the file instead of "front".)' : 'I can’t tell which window is in front.'
  if (/powerpnt/i.test(fr.exe) || /powerpoint/i.test(fr.app)) return remember(await readSlides(fr.title))
  if (fr.url && (isPdfUrl(fr.url) || /^file:/i.test(fr.url))) return remember(await readPdf(fr.url, fr))
  if (/\.pdf\b/i.test(fr.title) && fr.url) return remember(await readPdf(fr.url, fr))
  if (fr.url) return `That's a web page (${fr.app}), not a PDF or slide deck: read it with read_window instead (it gives the whole page).`
  return `${fr.app} isn't a slide deck or a PDF I can read. Open the deck in PowerPoint, or the PDF in Edge, Opera GX or Chrome.`
}
/** The deck or PDF read most recently (in the last two hours), for "quiz me on this". */
let lastRead: { l: Lesson; at: number } | null = null
export function lastLesson(): Lesson | null {
  return lastRead && Date.now() - lastRead.at < 2 * 3_600_000 ? lastRead.l : null
}
/** A lesson's text for writing quiz questions: the pages about the topic first (all of it when no topic). */
export function lessonQuizText(l: Lesson, topic: string, budget = 9000): string {
  const on = topic ? topicPages(l, topic) : []
  const pages = on.length ? l.pages.filter((p) => on.includes(p.n)) : l.pages
  const label = l.kind === 'slides' ? 'Slide' : 'Page'
  let out = ''
  for (const p of pages) {
    const t = `${label} ${p.n}: ${p.text}${p.notes ? ` (notes: ${p.notes})` : ''}\n`
    if (out.length + t.length > budget) break
    out += t
  }
  return out
}
function remember(l: Lesson | string): Lesson | string {
  if (typeof l !== 'string') lastRead = { l, at: Date.now() }
  if (typeof l !== 'string') lessons.set(l.id, l)
  return l
}

// ---------- The lesson map (made here from the deck's own words: no AI, no cost) ----------
// Like the index at the back of a textbook: the key terms, where each first comes up and where it comes back, and which
// earlier slides each slide builds on. Nova uses it to connect the slide you're on to the rest of the deck.
const STOP = new Set('a an the and or but of to in on at for from by with as is are was were be been being it its this that these those which who what when where why how than then so such not no can may will would should could do does did has have had into onto over under about between within without also more most less least very each other some any all both one two three four five six seven eight nine ten per via e.g i.e eg ie vs slide slides page pages week lecture figure fig table see note notes chapter section learning objectives objective outcome outcomes summary overview introduction key points'.split(' '))
const words = (t: string): string[] =>
  t
    .toLowerCase()
    .replace(/[^\p{L}\p{N}α-ωβ+\-/ ]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
function lessonMap(l: Lesson): { terms: { term: string; pages: number[] }[]; builds: Map<number, { from: number; via: string[] }[]> } {
  const pagesOf = new Map<string, Set<number>>()
  for (const p of l.pages) {
    const w = words(`${p.text} ${p.notes}`)
    const seen = new Set<string>()
    for (let i = 0; i < w.length; i++)
      for (let n = 1; n <= 3 && i + n <= w.length; n++) {
        const g = w.slice(i, i + n)
        if (STOP.has(g[0]) || STOP.has(g[g.length - 1]) || g.some((x) => /^\d+$/.test(x))) continue
        const term = g.join(' ')
        if (term.length < (n === 1 ? 5 : 6)) continue
        seen.add(term)
      }
    for (const t of seen) (pagesOf.get(t) ?? pagesOf.set(t, new Set()).get(t)!).add(p.n)
  }
  const most = Math.max(2, Math.ceil(l.count * 0.6))
  let terms = [...pagesOf.entries()]
    .filter(([, s]) => s.size >= 2 && s.size <= most)
    .map(([term, s]) => ({ term, pages: [...s].sort((a, b) => a - b), score: s.size * Math.min(3, term.split(' ').length) + term.length / 20 }))
  // A shorter term found on exactly the same slides as a longer one is the same idea: keep the longer.
  terms = terms.filter((t) => !terms.some((o) => o !== t && o.term.length > t.term.length && o.term.includes(t.term) && o.pages.join() === t.pages.join()))
  terms.sort((a, b) => b.score - a.score)
  const top = terms.slice(0, 45).sort((a, b) => a.pages[0] - b.pages[0])
  const builds = new Map<number, { from: number; via: string[] }[]>()
  for (const p of l.pages) {
    const links = new Map<number, string[]>()
    for (const t of top) if (t.pages.includes(p.n) && t.pages[0] < p.n) (links.get(t.pages[0]) ?? links.set(t.pages[0], []).get(t.pages[0])!).push(t.term)
    const list = [...links.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 3).map(([from, via]) => ({ from, via: via.slice(0, 3) }))
    if (list.length) builds.set(p.n, list)
  }
  return { terms: top.map(({ term, pages }) => ({ term, pages })), builds }
}
function mapText(l: Lesson): string {
  if (l.count < 3) return ''
  const label = l.kind === 'slides' ? 'slide' : 'page'
  const m = lessonMap(l)
  if (!m.terms.length) return ''
  const terms = m.terms.map((t) => `${t.term}: ${t.pages[0]}${t.pages.length > 1 ? ` → ${t.pages.slice(1).join(', ')}` : ''}`).join('; ')
  const builds = [...m.builds.entries()]
    .slice(0, 40)
    .map(([n, b]) => `${n} ← ${b.map((x) => `${x.from} (${x.via.join(', ')})`).join(', ')}`)
    .join('; ')
  return `\n\nLesson map (made from the deck's own words; use it to connect the ${label} they're on to the rest, like a teacher: "remember ${label} 4…", "this is why ${label} 12 matters"):\nKey terms, first ${label} → where they come back: ${terms}${builds ? `\nBuilds on (${label} ← earlier ${label}s it uses): ${builds}` : ''}
To show how a ${label} connects to another, use show_board (the ${label}s side by side, rings and an arrow), not a table.`
}
/** The pages about a topic, in order (for "teach me X" from the deck): the ones whose words match it most. */
function topicPages(l: Lesson, topic: string): number[] {
  const want = words(topic).filter((w) => !STOP.has(w) && w.length > 2)
  if (!want.length) return []
  return l.pages
    .map((p) => {
      const text = ` ${words(`${p.text} ${p.notes}`).join(' ')} `
      return { n: p.n, hits: want.filter((w) => text.includes(` ${w}`) || text.includes(w)).length }
    })
    .filter((x) => x.hits >= Math.max(1, Math.ceil(want.length / 2)))
    .map((x) => x.n)
}

/** The lesson as text for Nova: a header, then each page (trimmed), from..to, then the lesson map. With a topic, the
 *  pages about it come first, in order. Diagram pages carry their picture's address. */
export function lessonText(l: Lesson, from = 1, to = l.count, budget = 16_000, topic?: string): string {
  const label = l.kind === 'slides' ? 'Slide' : 'Page'
  const head = `${l.kind === 'slides' ? 'Slide deck' : 'PDF'} "${l.title}" (${l.count} ${l.kind === 'slides' ? 'slides' : 'pages'}${l.app ? `, open in ${l.app}${l.protectedView ? ' (Protected View)' : ''}` : ''}${l.current ? `, they're on ${label.toLowerCase()} ${l.current}` : ''}).`
  const parts: string[] = []
  let used = head.length
  let last = from - 1
  const onTopic = topic ? topicPages(l, topic) : []
  const order = [...l.pages.filter((x) => onTopic.includes(x.n)), ...l.pages.filter((x) => !onTopic.includes(x.n))]
  if (onTopic.length) parts.push(`(The ${l.kind === 'slides' ? 'slides' : 'pages'} about "${topic}" come first, in order: ${onTopic.join(', ')}. Teach them as one story, in that order.)`)
  for (const p of order.filter((x) => x.n >= from && x.n <= to)) {
    const pic = p.pictures || p.shapes >= 4 ? ` [has a diagram or picture: https://${LESSON_HOST}/${l.id}/${p.n}.jpg]` : ''
    const body = `${label} ${p.n}${pic}:\n${p.text.slice(0, 900) || '(no text)'}${p.notes ? `\nSpeaker notes: ${p.notes.slice(0, 500)}` : ''}`
    if (used + body.length > budget && parts.length) break
    parts.push(body)
    used += body.length
    last = p.n
  }
  const more = !onTopic.length && last < to ? `\n(${label}s ${last + 1}–${to} not shown: read_lesson again with from: ${last + 1}.)` : ''
  return `${head}\n\n${parts.join('\n\n')}${more}${mapText(l)}`
}

// ---------- Pictures of pages (Roamies' photo cards and see_photo fetch them from https://lesson.studyhall.app/…) ----------
export async function picture(id: string, n: number): Promise<Buffer | null> {
  const l = lessons.get(id)
  if (!l || n < 1 || n > l.count) return null
  const file = join(cacheDir(), id, `${n}.jpg`)
  if (existsSync(file)) return readFile(file)
  await mkdir(join(cacheDir(), id), { recursive: true })
  if (l.kind === 'slides') {
    const ratio = (l as Lesson & { ratio?: number }).ratio ?? 0.5625
    const r = await ps(PPT_EXPORT, { SH_TITLE: l.window, SH_PATH: l.source, SH_N: String(n), SH_OUT: file, SH_W: '1280', SH_H: String(Math.round(1280 * ratio)) }, 90_000)
    return r.endsWith('ok') && existsSync(file) ? readFile(file) : null
  }
  const data = pdfBytes.get(id)
  if (!data) return null
  const url = await pdfAsk('page', { data, n, width: 1280 })
  const m = /^data:image\/jpeg;base64,(.+)$/s.exec(url)
  if (!m) return null
  const buf = Buffer.from(m[1], 'base64')
  await writeFile(file, buf)
  return buf
}
/** A fetch that answers https://lesson.studyhall.app/<lesson>/<page>.jpg itself, and passes everything else on. */
export async function lessonFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  if (url.hostname !== LESSON_HOST) return fetch(input, init)
  const m = /^\/([0-9a-f]{12})\/(\d+)\.jpg$/.exec(url.pathname)
  const buf = m ? await picture(m[1], Number(m[2])).catch(() => null) : null
  if (!buf) return new Response('not found', { status: 404 })
  return new Response(new Uint8Array(buf), { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': String(buf.length) } })
}

// ---------- Turning pages ----------
/** Go to a page or slide in the app it's open in, or find a bit of a web page (Ctrl+F). */
export async function goToPage(o: { page?: number; find?: string; lessonId?: string }): Promise<string> {
  if (getPrefs().novaPages === false) return 'Turning pages is switched off ("Turn pages and scroll" on Nova’s page). Tell them which page to go to instead.'
  if (OFFSCREEN) return '(Automated test: no pages were turned.)'
  const l = o.lessonId ? lessons.get(o.lessonId) : [...lessons.values()].at(-1)
  if (o.find) {
    const fr = await front()
    if (!fr) return 'I can’t tell which window is in front.'
    const r = await ps(KEYS, { SH_TITLE: fr.title, SH_KEYS: ['^f', 'sleep:250', literal(o.find.slice(0, 80)), '{ENTER}', 'sleep:150', '{ESC}'].join('\u0001') })
    return r.endsWith('ok') ? `Found "${o.find}" on the page (it scrolled there). Take a screenshot before pointing at it.` : 'Couldn’t bring that window to the front.'
  }
  const n = Math.round(Number(o.page))
  if (!l || !n || n < 1 || n > l.count) return l ? `Pick a page from 1 to ${l.count}.` : 'Read the lesson first (read_lesson).'
  if (l.kind === 'slides') {
    const r = await ps(PPT_GOTO, { SH_TITLE: l.window, SH_PATH: l.source, SH_N: String(n) })
    if (!r.endsWith('ok')) return 'PowerPoint wouldn’t go to that slide.'
  } else if (l.url) {
    const base = l.url.replace(/#.*$/, '')
    const r = await ps(KEYS, { SH_TITLE: l.window, SH_KEYS: ['^l', 'sleep:200', literal(`${base}#page=${n}`), '{ENTER}'].join('\u0001') })
    if (!r.endsWith('ok')) return 'Couldn’t bring the PDF’s window to the front.'
    l.url = `${base}#page=${n}`
  } else return 'That PDF isn’t open in a window I can turn; show its page on a card instead.'
  l.current = n
  await new Promise((res) => setTimeout(res, 900)) // (the page draws)
  return `Now on ${l.kind === 'slides' ? 'slide' : 'page'} ${n}. Take a screenshot of it before pointing at anything.`
}

/** Where some words sit on a page of a lesson read earlier: [x, y, w, h] as fractions of the page, or null. Matched on
 *  the words (any case, ignoring punctuation): the box holding all of them, else the one holding the most. */
export function findOnPage(lessonId: string, page: number, words: string): [number, number, number, number] | null {
  const l = lessons.get(lessonId) ?? (lastLesson()?.id === lessonId ? lastLesson() : null)
  const p = l?.pages.find((x) => x.n === page)
  if (!p?.boxes?.length) return null
  const norm = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  const want = norm(words)
  if (!want) return null
  const w = want.split(' ')
  let best: { b: TextBox; score: number } | null = null
  for (const b of p.boxes) {
    const t = norm(b[4])
    const score = t.includes(want) ? 100 - t.length / 100 : w.filter((x) => t.includes(x)).length / w.length
    if (!best || score > best.score) best = { b, score }
  }
  if (!best || best.score < 0.6) return null
  const [x, y, bw, bh, s] = best.b
  // The words are part of a single line: just them (by where they fall along it), not the whole line. Lines are
  // told from paragraphs by shape: about 0.4 of the height per character across for one line, half that for two.
  const t = norm(s)
  const at = t.indexOf(want)
  // (Boxes are fractions of the page: its height over width, from PowerPoint; 16:9 otherwise.)
  const ratio = (l as Lesson & { ratio?: number }).ratio ?? 0.5625
  if (at >= 0 && want.length < t.length * 0.8 && bh > 0 && bw / (bh * ratio) > t.length * 0.3) {
    const nx = x + (bw * at) / t.length
    const nw = (bw * want.length) / t.length
    const pad = bw * 0.01
    return [Math.max(x, nx - pad), y, Math.min(nw + pad * 2, x + bw - Math.max(x, nx - pad)), bh]
  }
  return [x, y, bw, bh]
}
/** The id of the lesson read most recently (for the study board). */
export const lastLessonId = (): string | null => lastLesson()?.id ?? null
