// Course material files: copied into the app data folder so they survive the
// originals being moved/deleted, served to the UI via the material:// protocol.

import { app, dialog, net, shell, type BrowserWindow } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { create, get, list, update } from './db'
import { ensureLocalFile } from './cloud/sync'
import type { ExamPaper, Material, MaterialKind, PaperKind, PickedDoc, Week } from '@shared/types'
import { readDocs } from './docs'

const dataDir = (): string => app.getPath('userData')

// File types we never launch directly (they'd run code); we reveal them in Explorer instead.
const RISKY = new Set(['.exe', '.bat', '.cmd', '.com', '.msi', '.ps1', '.vbs', '.js', '.jse', '.wsf', '.scr', '.lnk', '.hta', '.reg'])

function kindFor(ext: string): MaterialKind {
  if (ext === '.pdf') return 'pdf'
  if (ext === '.html' || ext === '.htm') return 'html'
  if (['.ppt', '.pptx', '.pps', '.ppsx', '.odp', '.key'].includes(ext)) return 'slides'
  return 'other'
}

function hashFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256')
    createReadStream(path)
      .on('data', (chunk) => h.update(chunk))
      .on('end', () => resolve(h.digest('hex')))
      .on('error', reject)
  })
}

export function absolutePath(m: { local_path: string | null }): string {
  return join(dataDir(), m.local_path ?? '')
}

export async function importPaths(weekId: string, paths: string[]): Promise<Material[]> {
  const week = get<Week>('weeks', weekId)
  if (!week) throw new Error('Week not found')
  await mkdir(join(dataDir(), 'materials'), { recursive: true })

  let sort = list<Material>('materials', { week_id: weekId }).length
  const imported: Material[] = []
  for (const src of paths) {
    const info = await stat(src).catch(() => null)
    if (!info?.isFile()) continue // skip folders / missing files
    const ext = extname(src).toLowerCase()
    const rel = `materials/${randomUUID()}${ext}`
    const dest = join(dataDir(), rel)
    await copyFile(src, dest)
    const name = basename(src)
    imported.push(
      create<Material>('materials', {
        module_id: week.module_id,
        week_id: weekId,
        title: name.slice(0, name.length - ext.length) || name,
        kind: kindFor(ext),
        file_name: name,
        local_path: rel,
        size_bytes: info.size,
        sha256: await hashFile(dest),
        sort: sort++
      })
    )
  }
  return imported
}

export async function pickAndImport(win: BrowserWindow, weekId: string): Promise<Material[]> {
  const result = await dialog.showOpenDialog(win, {
    title: 'Add course materials',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Course materials', extensions: ['pdf', 'html', 'htm', 'ppt', 'pptx', 'odp', 'doc', 'docx'] },
      { name: 'All files', extensions: ['*'] }
    ]
  })
  if (result.canceled) return []
  return importPaths(weekId, result.filePaths)
}

/** Open in the default Windows app (PowerPoint for slides, etc.). */
export async function openExternal(id: string): Promise<void> {
  const m = get<Material>('materials', id)
  if (!m?.local_path) return
  if (!(await ensureLocalFile(m))) throw new Error('This file is only on the PC it was added on (turn on "Sync file" there).')
  const path = absolutePath(m)
  if (RISKY.has(extname(path).toLowerCase())) {
    shell.showItemInFolder(path)
    return
  }
  const error = await shell.openPath(path)
  if (error) throw new Error(error)
}

export function showInFolder(id: string): void {
  const m = get<Material>('materials', id)
  if (m?.local_path) shell.showItemInFolder(absolutePath(m))
}

const CONTENT_TYPES: Record<MaterialKind, string> = {
  pdf: 'application/pdf',
  html: 'text/html; charset=utf-8',
  slides: 'application/octet-stream',
  other: 'application/octet-stream'
}

// Uploaded HTML is untrusted: it may run its own inline scripts, but it can't
// load anything from the network and runs in an isolated, origin-less sandbox.
const HTML_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
  "img-src data: blob:; font-src data:; media-src data: blob:; sandbox allow-scripts"

// ---------- Exam papers ----------

/** Guess what a file is from its name: "2023 Paper 1 mark scheme.pdf" → mark scheme, 2023. */
function guessPaper(name: string): { kind: PaperKind; year: string; title: string } {
  const base = name.replace(/\.[^.]+$/, '')
  const lower = base.toLowerCase()
  const kind: PaperKind = /mark ?scheme|\bms\b|answers?|solutions?|markscheme|marking/.test(lower)
    ? 'mark_scheme'
    : /mock/.test(lower)
      ? 'mock'
      : /practice|worksheet|exercise|problem ?set/.test(lower)
        ? 'practice'
        : 'past_paper'
  const year = /(19|20)\d{2}/.exec(base)?.[0] ?? ''
  return { kind, year, title: base.replace(/[_]+/g, ' ').trim() || name }
}

export async function importPapers(moduleId: string | null, paths: string[]): Promise<ExamPaper[]> {
  await mkdir(join(dataDir(), 'papers'), { recursive: true })
  const out: ExamPaper[] = []
  for (const src of paths.slice(0, 100)) {
    const info = await stat(src).catch(() => null)
    if (!info?.isFile()) continue
    const ext = extname(src).toLowerCase()
    const rel = `papers/${randomUUID()}${ext}`
    const dest = join(dataDir(), rel)
    await copyFile(src, dest)
    const name = basename(src)
    const g = guessPaper(name)
    out.push(
      create<ExamPaper>('exam_papers', {
        module_id: moduleId,
        title: g.title,
        kind: g.kind,
        year: g.year,
        file_name: name,
        local_path: rel,
        size_bytes: info.size,
        sha256: await hashFile(dest)
      })
    )
  }
  // Pair mark schemes with papers of the same module + year + similar name.
  const all = list<ExamPaper>('exam_papers', moduleId ? { module_id: moduleId } : { module_id: null })
  const norm = (t: string): string => t.toLowerCase().replace(/mark ?scheme|markscheme|\bms\b|answers?|solutions?|question ?paper|\bqp\b|[^a-z0-9]/g, '')
  for (const p of out) {
    if (p.paired_id) continue
    const want = p.kind === 'mark_scheme' ? (k: PaperKind) => k !== 'mark_scheme' : (k: PaperKind) => k === 'mark_scheme'
    const match = all.find((o) => o.id !== p.id && !o.paired_id && want(o.kind) && o.year === p.year && norm(o.title) === norm(p.title))
    if (match) {
      update('exam_papers', p.id, { paired_id: match.id })
      update('exam_papers', match.id, { paired_id: p.id })
    }
  }
  return out
}

export async function pickPapers(win: BrowserWindow, moduleId: string | null): Promise<ExamPaper[]> {
  const result = await dialog.showOpenDialog(win, {
    title: 'Add past papers, mark schemes and practice sheets',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Papers', extensions: ['pdf', 'docx', 'doc', 'pptx', 'ppt', 'html', 'htm', 'txt', 'md', 'odt'] },
      { name: 'All files', extensions: ['*'] }
    ]
  })
  if (result.canceled) return []
  return importPapers(moduleId, result.filePaths)
}

/** The paper's file, read (and converted if it's an old Office format) for question finding. */
export async function paperDoc(id: string): Promise<PickedDoc | null> {
  const p = get<ExamPaper>('exam_papers', id)
  if (!p?.local_path) return null
  if (!(await ensureLocalFile(p, 'exam_papers'))) throw new Error('This file is only on the PC it was added on (turn on "Sync file" there).')
  const [doc] = await readDocs([absolutePath(p)])
  return doc ? { ...doc, name: p.file_name } : null
}

export async function openPaperExternal(id: string): Promise<void> {
  const p = get<ExamPaper>('exam_papers', id)
  if (!p?.local_path) return
  if (!(await ensureLocalFile(p, 'exam_papers'))) throw new Error('This file is only on the PC it was added on (turn on "Sync file" there).')
  const path = absolutePath(p)
  if (RISKY.has(extname(path).toLowerCase())) return shell.showItemInFolder(path)
  const error = await shell.openPath(path)
  if (error) throw new Error(error)
}

/** Handler for material://local/<id>/<file name> — streams a material (or exam paper) file to the UI.
 *  (The file name is only there so the PDF viewer shows it.) */
export async function serveMaterial(request: Request): Promise<Response> {
  const id = new URL(request.url).pathname.split('/')[1] ?? ''
  const paper = get<ExamPaper>('exam_papers', id)
  const m: Material | null =
    get<Material>('materials', id) ??
    (paper ? ({ ...paper, kind: kindFor(extname(paper.local_path ?? '').toLowerCase()) } as unknown as Material) : null)
  if (!m?.local_path) return new Response('Not found', { status: 404 })
  if (!(await ensureLocalFile(m, paper ? 'exam_papers' : 'materials'))) {
    return new Response('This file is only on the PC it was added on. Turn on "Sync file" there to see it here.', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    })
  }
  const file = await net.fetch(pathToFileURL(absolutePath(m)).toString())
  if (!file.ok) return new Response('Missing file', { status: 404 })
  const headers: Record<string, string> = {
    'content-type': CONTENT_TYPES[m.kind],
    'x-content-type-options': 'nosniff'
  }
  if (m.kind === 'html') headers['content-security-policy'] = HTML_CSP
  return new Response(file.body, { headers })
}
