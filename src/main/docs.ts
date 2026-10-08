// Reading documents for import (notes, exam papers). Most formats are converted in the
// UI; here we pick/read files, turn Word documents into HTML (mammoth), and turn old
// binary .doc / .ppt / .rtf into .docx / .pptx with Microsoft Office or LibreOffice if
// one is installed (both are optional; nothing is uploaded anywhere).

import { dialog, type BrowserWindow } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import mammoth from 'mammoth'

export const IMPORT_EXTS = ['docx', 'doc', 'pptx', 'ppt', 'pdf', 'html', 'htm', 'md', 'markdown', 'txt', 'odt', 'odp', 'rtf']
const MAX_BYTES = 80 * 1024 * 1024

export interface PickedDoc {
  name: string // original file name
  ext: string // after conversion: docx | pptx | pdf | html | md | txt | odt | odp
  data: Uint8Array
}

function run(cmd: string, args: string[], env: Record<string, string> = {}, timeout = 120_000): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, windowsHide: true, env: { ...process.env, ...env } }, (err) => (err ? reject(err) : resolve()))
  })
}

const SOFFICE = ['C:\\Program Files\\LibreOffice\\program\\soffice.exe', 'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe']

/** .doc/.rtf → .docx and .ppt → .pptx using Office (COM) or LibreOffice. */
async function convertLegacy(path: string): Promise<{ data: Uint8Array; ext: string }> {
  const src = extname(path).toLowerCase()
  const target = src === '.ppt' ? 'pptx' : 'docx'
  const dir = await mkdtemp(join(tmpdir(), 'studyhall-'))
  const out = join(dir, `converted.${target}`)
  try {
    // 1) Microsoft Office. Paths go in environment variables, never into the script text.
    const script =
      target === 'pptx'
        ? '$a = New-Object -ComObject PowerPoint.Application; $p = $a.Presentations.Open($env:SH_IN, $true, $false, $false); $p.SaveAs($env:SH_OUT, 24); $p.Close(); $a.Quit()'
        : '$a = New-Object -ComObject Word.Application; $a.Visible = $false; $d = $a.Documents.Open($env:SH_IN, $false, $true); $d.SaveAs2($env:SH_OUT, 16); $d.Close($false); $a.Quit()'
    try {
      await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { SH_IN: path, SH_OUT: out })
    } catch {
      /* no Office — try LibreOffice */
    }
    // 2) LibreOffice
    if (!existsSync(out)) {
      const soffice = SOFFICE.find((p) => existsSync(p))
      if (soffice) {
        await run(soffice, ['--headless', '--convert-to', target, '--outdir', dir, path]).catch(() => {})
        const made = (await readdir(dir)).find((f) => f.toLowerCase().endsWith(`.${target}`))
        if (made) return { data: new Uint8Array(await readFile(join(dir, made))), ext: target }
      }
    }
    if (!existsSync(out)) {
      throw new Error(
        `“${basename(path)}” is an old ${src} file. Open it in ${target === 'pptx' ? 'PowerPoint' : 'Word'} and “Save as” .${target}, or install the free LibreOffice, then import again.`
      )
    }
    return { data: new Uint8Array(await readFile(out)), ext: target }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

export async function readDocs(paths: string[]): Promise<PickedDoc[]> {
  const out: PickedDoc[] = []
  for (const p of paths.slice(0, 50)) {
    const ext = extname(p).slice(1).toLowerCase()
    if (!IMPORT_EXTS.includes(ext)) continue
    const info = await stat(p).catch(() => null)
    if (!info?.isFile()) continue
    if (info.size > MAX_BYTES) throw new Error(`“${basename(p)}” is over 80 MB.`)
    if (ext === 'doc' || ext === 'ppt' || ext === 'rtf') {
      const c = await convertLegacy(p)
      out.push({ name: basename(p), ext: c.ext, data: c.data })
    } else out.push({ name: basename(p), ext: ext === 'htm' ? 'html' : ext === 'markdown' ? 'md' : ext, data: new Uint8Array(await readFile(p)) })
  }
  return out
}

export async function pickDocs(win: BrowserWindow, title: string): Promise<PickedDoc[]> {
  const r = await dialog.showOpenDialog(win, {
    title,
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Documents', extensions: IMPORT_EXTS },
      { name: 'All files', extensions: ['*'] }
    ]
  })
  return r.canceled ? [] : readDocs(r.filePaths)
}

/** Word → HTML (headings, lists, tables, bold/italic, images inline). */
export async function docxToHtml(data: Uint8Array): Promise<string> {
  const result = await mammoth.convertToHtml(
    { buffer: Buffer.from(data) },
    {
      convertImage: mammoth.images.imgElement(async (img) => ({ src: `data:${img.contentType};base64,${await img.readAsBase64String()}` }))
    }
  )
  return result.value
}

/** Plain text of a Word document (for finding questions in exam papers). */
export async function docxToText(data: Uint8Array): Promise<string> {
  return (await mammoth.extractRawText({ buffer: Buffer.from(data) })).value
}
