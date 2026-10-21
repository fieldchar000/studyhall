// Slides as they really look: PowerPoint / Keynote-style files are turned into a PDF by Microsoft
// PowerPoint (or the free LibreOffice) on this PC, once per file, and kept in a cache so they
// open instantly afterwards. Nothing is uploaded. Without either program the app falls back
// to its own text-and-pictures reading view.

import { app } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm } from 'node:fs/promises'
import { extname, join } from 'node:path'
import type { Material } from '@shared/types'
import { get } from './db'
import { ensureLocalFile } from './cloud/sync'

const SOFFICE = ['C:\\Program Files\\LibreOffice\\program\\soffice.exe', 'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe']
const SLIDE_EXTS = new Set(['.pptx', '.ppt', '.pps', '.ppsx', '.odp', '.pptm'])

const cacheDir = (): string => join(app.getPath('userData'), 'cache', 'slides')

function run(cmd: string, args: string[], env: Record<string, string> = {}, timeout = 180_000): Promise<void> {
  return new Promise((ok, fail) => execFile(cmd, args, { timeout, windowsHide: true, env: { ...process.env, ...env } }, (e) => (e ? fail(e) : ok())))
}

// One conversion at a time (PowerPoint is a single program).
let queue: Promise<unknown> = Promise.resolve()
const serial = <T>(job: () => Promise<T>): Promise<T> => {
  const next = queue.then(job, job)
  queue = next.catch(() => {})
  return next
}

async function convert(src: string, out: string): Promise<boolean> {
  const tmp = `${out}.part.pdf`
  // 1) Microsoft PowerPoint, invisibly. Paths go in environment variables, never into the script.
  //    Only quits PowerPoint if it wasn't already open with your own presentations.
  const script =
    '$a = New-Object -ComObject PowerPoint.Application; ' +
    '$p = $a.Presentations.Open($env:SH_IN, $true, $false, $false); ' +
    '$p.SaveAs($env:SH_OUT, 32); $p.Close(); ' +
    'if ($a.Presentations.Count -eq 0) { $a.Quit() }'
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { SH_IN: src, SH_OUT: tmp }).catch(() => {})
  if (!existsSync(tmp)) {
    // 2) LibreOffice
    const soffice = SOFFICE.find((p) => existsSync(p))
    if (soffice) {
      const dir = `${out}.lo`
      await mkdir(dir, { recursive: true })
      await run(soffice, ['--headless', '--convert-to', 'pdf', '--outdir', dir, src]).catch(() => {})
      const made = (await readdir(dir).catch(() => [] as string[])).find((f) => f.toLowerCase().endsWith('.pdf'))
      if (made) await rename(join(dir, made), tmp)
      await rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  }
  if (!existsSync(tmp)) return false
  await rename(tmp, out)
  return true
}

/** The slides of a material as a PDF, or null when this PC can't make one (no PowerPoint / LibreOffice). */
export async function slidesPdf(id: string): Promise<Uint8Array | null> {
  const m = get<Material>('materials', id)
  if (!m?.local_path || !SLIDE_EXTS.has(extname(m.file_name).toLowerCase())) return null
  if (!(await ensureLocalFile(m))) return null
  const key = `${m.id}-${(m.sha256 ?? m.updated_at).replace(/[^a-z0-9]/gi, '').slice(0, 24)}.pdf`
  const out = join(cacheDir(), key)
  if (!existsSync(out)) {
    await mkdir(cacheDir(), { recursive: true })
    const made = await serial(() => (existsSync(out) ? Promise.resolve(true) : convert(join(app.getPath('userData'), m.local_path!), out)))
    if (!made) return null
  }
  return new Uint8Array(await readFile(out))
}
