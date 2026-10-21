// The Android app's web bundle: the same React UI plus the PC's "main process" code (database,
// sync, timer…) running in the page, with phone stand-ins for Electron and Node (src/mobile).
// Build: npm run build:mobile  →  out/mobile  (Capacitor wraps that folder into the APK)

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
const shim = (f: string): string => resolve('src/mobile/shims', f)

/** PC-only modules of src/main swapped for phone versions (updater, Spotify player, video windows). */
function phoneOverrides(): Plugin {
  const OVERRIDDEN = /^\.{1,2}\/(updater|spotify|video|oculus|lanshare|slides)$/
  return {
    name: 'studyhall-phone-overrides',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || !importer.replace(/\\/g, '/').includes('/src/main/')) return null
      const m = OVERRIDDEN.exec(source)
      return m ? resolve('src/mobile/overrides', `${m[1]}.ts`) : null
    }
  }
}

export default defineConfig({
  root: resolve('src/mobile'),
  base: './',
  publicDir: false,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [phoneOverrides(), react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^@shared\//, replacement: `${resolve('src/shared')}/` },
      { find: /^@\//, replacement: `${resolve('src/renderer/src')}/` },
      { find: /^electron$/, replacement: shim('electron.ts') },
      { find: /^electron-updater$/, replacement: shim('electron.ts') },
      { find: /^node:sqlite$/, replacement: shim('sqlite.ts') },
      { find: /^node:fs(\/promises)?$/, replacement: shim('fs.ts') },
      { find: /^node:path$/, replacement: shim('path.ts') },
      { find: /^node:crypto$/, replacement: shim('crypto.ts') },
      { find: /^node:(url|os|child_process)$/, replacement: shim('misc.ts') }
    ]
  },
  build: {
    outDir: resolve('out/mobile'),
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 8000
  }
})
