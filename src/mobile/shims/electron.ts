// Electron on the phone. On the PC the UI and the "main process" are separate programs that
// talk over IPC; on the phone both run in the same page, so IPC is a direct function call.
// Only the pieces the shared code actually uses are here.

import { CapacitorHttp } from '@capacitor/core'
import { registerPicked } from '../storage'
import { fromFileUrl } from './netfile'

declare const __APP_VERSION__: string

type Fn = (...args: any[]) => any // eslint-disable-line @typescript-eslint/no-explicit-any

// ---------- IPC ----------

const handlers = new Map<string, Fn>()
const mainListeners = new Map<string, Set<Fn>>()
const uiListeners = new Map<string, Set<Fn>>()

const sender = {
  id: 1,
  send: (channel: string, ...args: unknown[]) => emitToUi(channel, ...args),
  isDestroyed: () => false,
  isLoading: () => false,
  session: {},
  ipc: { once: () => {} }
}
const event = (): { sender: typeof sender; senderFrame: { url: string; parent: null } } => ({ sender, senderFrame: { url: location.href, parent: null } })

function emitToUi(channel: string, ...args: unknown[]): void {
  const copy = structuredClone(args)
  queueMicrotask(() => uiListeners.get(channel)?.forEach((l) => l({}, ...copy)))
}

export const ipcMain = {
  handle(channel: string, fn: Fn): void {
    handlers.set(channel, fn)
  },
  removeHandler(channel: string): void {
    handlers.delete(channel)
  },
  on(channel: string, fn: Fn): void {
    ;(mainListeners.get(channel) ?? mainListeners.set(channel, new Set()).get(channel)!).add(fn)
  }
}

export const ipcRenderer = {
  async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    const h = handlers.get(channel)
    if (!h) throw new Error(`Not available on the phone (${channel})`)
    // Copy in and out, exactly like real IPC, so neither side can change the other's objects.
    const result = await h(event(), ...structuredClone(args))
    return result === undefined ? undefined : structuredClone(result)
  },
  send(channel: string, ...args: unknown[]): void {
    mainListeners.get(channel)?.forEach((l) => l(event(), ...structuredClone(args)))
  },
  on(channel: string, l: Fn): void {
    ;(uiListeners.get(channel) ?? uiListeners.set(channel, new Set()).get(channel)!).add(l)
  },
  removeListener(channel: string, l: Fn): void {
    uiListeners.get(channel)?.delete(l)
  }
}

export const contextBridge = {
  exposeInMainWorld(key: string, value: unknown): void {
    ;(window as unknown as Record<string, unknown>)[key] = value
  }
}

export const webUtils = {
  getPathForFile: (file: File): string => registerPicked(file)
}

// ---------- Windows (there's just the one screen) ----------

const theWindow = {
  webContents: sender,
  isDestroyed: () => false,
  isFocused: () => document.visibilityState === 'visible',
  show: () => {},
  focus: () => {}
}
export const BrowserWindow = {
  getAllWindows: () => [theWindow],
  fromWebContents: () => theWindow
}
export const broadcast = (channel: string, ...args: unknown[]): void => emitToUi(channel, ...args)

// ---------- App, shell, dialogs ----------

export const app = {
  getPath: (name: string): string => (name === 'temp' ? '/tmp' : '/sh'),
  getVersion: (): string => __APP_VERSION__,
  isPackaged: true,
  getApplicationNameForProtocol: (): string => '',
  setLoginItemSettings: (): void => {},
  on: (): void => {},
  quit: (): void => {}
}

/** Open a website (or app link) outside Studyhall, in the phone's browser / the right app. */
export function openOutside(url: string): void {
  const a = document.createElement('a')
  a.href = url
  a.target = '_blank'
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export const shell = {
  openExternal: async (url: string): Promise<void> => openOutside(url),
  openPath: async (_p: string): Promise<string> => 'Opening files in other apps isn’t available on the phone yet — view it here in Studyhall instead.',
  showItemInFolder: (): void => {}
}

interface OpenOpts {
  properties?: string[]
  filters?: { name: string; extensions: string[] }[]
}
export const dialog = {
  /** A file chooser. Picked files get pretend paths the shared import code understands. */
  showOpenDialog(_win: unknown, opts: OpenOpts = {}): Promise<{ canceled: boolean; filePaths: string[] }> {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.multiple = !!opts.properties?.includes('multiSelections')
      const exts = (opts.filters ?? []).flatMap((f) => f.extensions).filter((e) => e !== '*')
      if (exts.length) input.accept = exts.map((e) => `.${e}`).join(',')
      input.style.display = 'none'
      let done = false
      const finish = (paths: string[]): void => {
        if (done) return
        done = true
        input.remove()
        resolve({ canceled: !paths.length, filePaths: paths })
      }
      input.onchange = () => finish([...(input.files ?? [])].map(registerPicked))
      input.addEventListener('cancel', () => finish([]))
      document.body.appendChild(input)
      input.click()
    })
  }
}

export const safeStorage = {
  isEncryptionAvailable: (): boolean => false, // app-private storage on the phone instead
  encryptString: (s: string): Uint8Array => new TextEncoder().encode(s),
  decryptString: (b: Uint8Array): string => new TextDecoder().decode(b)
}

// ---------- Network: websites without the browser's cross-site limits ----------

function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

export const net = {
  /** Like Electron's net.fetch: native HTTP (no CORS) for websites, private storage for file:// */
  async fetch(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.startsWith('file://')) return fromFileUrl(url)
    const headers: Record<string, string> = {}
    new Headers(init.headers).forEach((v, k) => (headers[k] = v))
    const signal = init.signal
    const req = CapacitorHttp.request({ url, method: init.method ?? 'GET', headers, data: typeof init.body === 'string' ? init.body : undefined, responseType: 'arraybuffer', connectTimeout: 20_000, readTimeout: 30_000 })
    const res = await (signal
      ? Promise.race([req, new Promise<never>((_, rej) => signal.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError'))))])
      : req)
    const body = typeof res.data === 'string' ? base64ToBytes(res.data) : res.data instanceof ArrayBuffer ? new Uint8Array(res.data) : new TextEncoder().encode(JSON.stringify(res.data))
    const outHeaders = new Headers()
    for (const [k, v] of Object.entries(res.headers ?? {})) outHeaders.set(k, String(v))
    return new Response(res.status === 204 || res.status === 304 ? null : (body as BodyInit), { status: res.status, headers: outHeaders })
  }
}

// Types-only imports elsewhere (BrowserWindow, Session…) need nothing at runtime.
export const session = { defaultSession: {}, fromPartition: () => ({}) }
export const Notification = class {
  static isSupported = (): boolean => false
}

export default { ipcMain, ipcRenderer, contextBridge, webUtils, BrowserWindow, app, shell, dialog, safeStorage, net, session, Notification }
