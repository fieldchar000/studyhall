// Small Node modules the shared code imports but barely uses on the phone.

// node:url
export const pathToFileURL = (p: string): URL => new URL(`file://${encodeURI(p)}`)
export const fileURLToPath = (u: string | URL): string => decodeURI(new URL(String(u)).pathname)

// node:os
export const tmpdir = (): string => '/tmp'
export const homedir = (): string => '/sh'

// node:child_process — there are no other programs to run on the phone
export function execFile(_cmd: string, _args: string[], _opts: unknown, cb: (err: Error | null) => void): void {
  setTimeout(() => cb(new Error('Not available on the phone')), 0)
}

export default { pathToFileURL, fileURLToPath, tmpdir, homedir, execFile }
