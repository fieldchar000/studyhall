// node:path on the phone: POSIX paths inside the app's private storage.

export const sep = '/'

export function normalize(p: string): string {
  const abs = p.startsWith('/')
  const out: string[] = []
  for (const part of p.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return (abs ? '/' : '') + out.join('/')
}

export const join = (...parts: string[]): string => normalize(parts.filter((x) => x !== '').join('/'))
export const resolve = (...parts: string[]): string => {
  let p = ''
  for (const part of parts) p = part.startsWith('/') ? part : `${p}/${part}`
  return normalize(p.startsWith('/') ? p : `/${p}`)
}
export const isAbsolute = (p: string): boolean => p.startsWith('/')
export function dirname(p: string): string {
  const n = normalize(p)
  const i = n.lastIndexOf('/')
  return i <= 0 ? (n.startsWith('/') ? '/' : '.') : n.slice(0, i)
}
export function basename(p: string, ext?: string): string {
  const b = p.replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop() ?? ''
  return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b
}
export function extname(p: string): string {
  const b = basename(p)
  const i = b.lastIndexOf('.')
  return i <= 0 ? '' : b.slice(i)
}

export default { sep, normalize, join, resolve, isAbsolute, dirname, basename, extname }
