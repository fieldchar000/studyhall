// Tutor mode's split screen (Nova's page: Lesson layout → Split screen): the window with their slides moves to the left
// part of the screen for the lesson, so Nova's cards fit beside it without covering it, and goes back to where it was
// (maximised again if it was) when tutor mode ends. Windows' own calls (SetWindowPos) through PowerShell: free, nothing
// installed. Never in automated tests: they must not touch your real windows.

import { screen } from 'electron'
import { spawn } from 'node:child_process'

const OFFSCREEN = process.env.STUDYHALL_OFFSCREEN === '1'

const SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class SW {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
  public struct RECT { public int L, T, R, B; }
  public static IntPtr Find(string part) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      var sb = new StringBuilder(512); GetWindowText(h, sb, 512);
      if (sb.ToString().IndexOf(part, StringComparison.OrdinalIgnoreCase) >= 0) { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@
[void][SW]::SetThreadDpiAwarenessContext([IntPtr](-4))
if ($env:SH_HWND) { $h = [IntPtr][long]$env:SH_HWND } else { $h = [SW]::Find($env:SH_TITLE) }
if ($h -eq [IntPtr]::Zero) { '{"error":"window not found"}'; exit }
$r = New-Object SW+RECT; [void][SW]::GetWindowRect($h, [ref]$r)
$was = @{ hwnd = [long]$h; x = $r.L; y = $r.T; w = $r.R - $r.L; h = $r.B - $r.T; zoomed = [SW]::IsZoomed($h) }
if ($env:SH_MODE -eq 'restore') {
  [void][SW]::ShowWindow($h, 9)
  [void][SW]::SetWindowPos($h, [IntPtr]::Zero, [int]$env:SH_X, [int]$env:SH_Y, [int]$env:SH_W, [int]$env:SH_H, 0x0044)
  if ($env:SH_ZOOMED -eq 'True') { [void][SW]::ShowWindow($h, 3) }
} else {
  [void][SW]::ShowWindow($h, 9)
  [void][SW]::SetWindowPos($h, [IntPtr]::Zero, [int]$env:SH_X, [int]$env:SH_Y, [int]$env:SH_W, [int]$env:SH_H, 0x0044)
}
$was | ConvertTo-Json -Compress
`

function run(env: Record<string, string>, detached = false): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT], { env: { ...process.env, ...env }, windowsHide: true, detached })
    if (detached) {
      p.unref()
      resolve(null)
      return
    }
    let out = ''
    p.stdout.on('data', (d) => (out += String(d)))
    const t = setTimeout(() => p.kill(), 15_000)
    p.on('close', () => {
      clearTimeout(t)
      try {
        resolve(JSON.parse(out.trim().split('\n').pop() || 'null'))
      } catch {
        resolve(null)
      }
    })
    p.on('error', () => resolve(null))
  })
}

let moved: { hwnd: number; x: number; y: number; w: number; h: number; zoomed: boolean } | null = null

/** Their slides' window (by its title) to the left 60% of the screen it's on, remembering where it was. */
export async function splitForLesson(title: string): Promise<string> {
  if (OFFSCREEN) return '(automated test: no window was moved)'
  if (!title || moved) return ''
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const k = d.scaleFactor
  const wa = d.workArea
  const r = await run({ SH_TITLE: title.slice(0, 120), SH_MODE: 'split', SH_X: String(Math.round(wa.x * k)), SH_Y: String(Math.round(wa.y * k)), SH_W: String(Math.round(wa.width * 0.6 * k)), SH_H: String(Math.round(wa.height * k)) })
  if (!r || r.error) return ''
  moved = { hwnd: Number(r.hwnd), x: Number(r.x), y: Number(r.y), w: Number(r.w), h: Number(r.h), zoomed: r.zoomed === true }
  return 'Their slides are on the left of the screen now (split screen): ring things on them with draw as usual, and cards go on the right.'
}
/** Tutor mode ended (or Studyhall is quitting: then it finishes on its own): the window goes back to where it was. */
export async function restoreAfterLesson(quitting = false): Promise<void> {
  const m = moved
  moved = null
  if (!m || OFFSCREEN) return
  await run({ SH_HWND: String(m.hwnd), SH_MODE: 'restore', SH_X: String(m.x), SH_Y: String(m.y), SH_W: String(m.w), SH_H: String(m.h), SH_ZOOMED: m.zoomed ? 'True' : 'False' }, quitting)
}
