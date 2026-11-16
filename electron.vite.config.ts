import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'

/** The "Hey Bauer" wake-word engine (vosk-browser) caches its unpacked model in IndexedDB,
 *  which fails for a model this size. The model file is already on the PC, so skip that
 *  cache: the engine unpacks it into memory at start-up instead (a couple of seconds). */
function voskNoCache(): Plugin {
  return {
    name: 'studyhall-vosk-no-cache',
    transform(code, id) {
      if (!id.replace(/\\/g, '/').includes('vosk-browser/dist/vosk.js') || !code.includes("createBase64WorkerFactory('")) return null
      const start = code.indexOf("createBase64WorkerFactory('") + "createBase64WorkerFactory('".length
      const end = code.indexOf("'", start)
      let worker = Buffer.from(code.slice(start, end), 'base64').toString('latin1')
      const swaps: [string, string][] = [
        ['this.Vosk.FS.mount(this.Vosk.IDBFS, {}, storagePath);', '/* no IndexedDB cache */'],
        ['return this.Vosk.syncFilesystem(true);', 'return true;'],
        ['return this.Vosk.syncFilesystem(false);', 'return true;']
      ]
      for (const [a, b] of swaps) {
        if (!worker.includes(a)) throw new Error(`vosk-browser changed; can't find: ${a}`)
        worker = worker.replace(a, b)
      }
      return { code: code.slice(0, start) + Buffer.from(worker, 'latin1').toString('base64') + code.slice(end), map: null }
    }
  }
}

// Three separate bundles: main process (Node), preload (bridge), renderer (React UI).
// Every package is a devDependency, so Vite bundles everything and the
// installed app needs no node_modules at all.
export default defineConfig({
  main: {
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  preload: {
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  renderer: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss(), voskNoCache()]
  }
})
