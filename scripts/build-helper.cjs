// Compiles Nova's small Windows helpers (native/*.cs) with the C# compiler that comes with Windows
// (.NET Framework 4), into build/. They ship next to the app (electron-builder extraResources).
const { execFileSync } = require('node:child_process')
const { existsSync, mkdirSync, statSync } = require('node:fs')
const { join } = require('node:path')

const root = join(__dirname, '..')
const csc = join(process.env.SystemRoot || 'C:\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe')
mkdirSync(join(root, 'build'), { recursive: true })
const fw = join(process.env.SystemRoot || 'C:\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319')
const REFS = {
  'nova-keys': [],
  'nova-eyes': ['WPF/UIAutomationClient.dll', 'WPF/UIAutomationTypes.dll', 'WPF/WindowsBase.dll', 'System.Web.Extensions.dll'].map((r) => '/r:' + join(fw, r))
}
for (const name of Object.keys(REFS)) {
  const src = join(root, 'native', `${name}.cs`)
  const out = join(root, 'build', `${name}.exe`)
  if (existsSync(out) && statSync(out).mtimeMs > statSync(src).mtimeMs) continue
  if (!existsSync(csc)) throw new Error(`C# compiler not found at ${csc}`)
  execFileSync(csc, ['/nologo', '/optimize+', '/target:exe', `/out:${out}`, ...REFS[name], src], { stdio: 'inherit' })
  console.log(`built ${name}.exe`)
}
