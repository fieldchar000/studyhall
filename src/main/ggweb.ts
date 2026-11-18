// Stand-in for '@kenkaiiii/ggcoder/web' (GG Coder's web tools, which Roamies' tools.mjs imports). Roamies' web_search
// and web_fetch come from that package; here they're Nova's own (main/web.ts): Claude Code's web search on your plan,
// and public pages read as text. Same names and the same argument shapes, so tools.mjs stays unchanged.
// (electron.vite.config.ts points the package name at this file.)

import { z } from 'zod'
import { readPage, webSearch } from './web'

export function createWebSearchTool(_cwd?: unknown, _side?: unknown): unknown {
  return {
    name: 'web_search',
    description: 'Search the web. Returns the best results (title, link, what it says). For facts that change, recent things, or finding a page.',
    parameters: z.object({ query: z.string().min(1).max(300) }),
    execute: async ({ query }: { query: string }) => webSearch(query)
  }
}

export function createWebFetchTool(_cwd?: unknown, opts?: { guardUrl?: (url: string) => Promise<string | null> }): unknown {
  return {
    name: 'web_fetch',
    description: 'Read a web page as text (public pages only). offset continues a long page from where the last read stopped.',
    parameters: z.object({ url: z.string().min(1).max(2000), offset: z.number().int().min(0).optional() }),
    execute: async ({ url, offset }: { url: string; offset?: number }) => {
      const blocked = await opts?.guardUrl?.(url)
      if (blocked) throw new Error(blocked)
      return readPage(url, offset ?? 0)
    }
  }
}

// Roamies' side searches (another provider's search for a model without one): not used here.
export const runSideWebSearch = async (): Promise<null> => null
export const runSideWebSearchViaClaudeCode = async (): Promise<null> => null
