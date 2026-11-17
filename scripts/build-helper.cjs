// Compiles Nova's small Windows helpers (native/*.cs) with the C# compiler that comes with Windows
// (.NET Framework 4), into build/. They ship next to the app (electron-builder extraResources).
const { execFileSync } = require('node:child_process')
const { existsSync, mkdirSync, statSync } = require('node:fs')
const { join } = require('node:path')

const root = join(__dirname, '..')
const csc = join(process.env.SystemRoot || 'C:\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe')
mkdirSync(join(root, 'build'), { recursive: true })
for (const name of ['nova-keys']) {
  const src = join(root, 'native', `${name}.cs`)
  const out = join(root, 'build', `${name}.exe`)
  if (existsSync(out) && statSync(out).mtimeMs > statSync(src).mtimeMs) continue
  if (!existsSync(csc)) throw new Error(`C# compiler not found at ${csc}`)
  execFileSync(csc, ['/nologo', '/optimize+', '/target:exe', `/out:${out}`, src], { stdio: 'inherit' })
  console.log(`built ${name}.exe`)
}
