// node scripts/release.cjs <version> ["release notes"]
// Bumps the version, commits + pushes, builds, castlabs-signs, and publishes the installer
// to GitHub Releases. Installed copies of Studyhall then update themselves.
// Needs GITHUB_TOKEN in .env (never printed).

const { execFileSync, spawnSync } = require('node:child_process')
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { loadEnv } = require('./env.cjs')

const root = join(__dirname, '..')
const env = loadEnv()
const [version, notes = ''] = process.argv.slice(2)
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error('Usage: node scripts/release.cjs 1.2.3 ["notes"]')
  process.exit(1)
}
if (!env.GITHUB_TOKEN) {
  console.error('GITHUB_TOKEN missing in .env')
  process.exit(1)
}
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim()
const run = (cmd, args, extraEnv = {}) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: true, env: { ...process.env, ...extraEnv } })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed`)
}

// 1. Version bump (no byte-order mark!) and commit
const pkgPath = join(root, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
pkg.version = version
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
git('add', '-A')
try {
  git('commit', '-m', `Release v${version}${notes ? `\n\n${notes}` : ''}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`)
} catch {
  /* nothing to commit */
}

// 2. Push the code first, so the release's tag points at it
const auth = Buffer.from(`x-access-token:${env.GITHUB_TOKEN}`).toString('base64')
execFileSync('git', ['-c', `http.https://github.com/.extraheader=AUTHORIZATION: basic ${auth}`, 'push', 'origin', 'main'], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] })
console.log(`Pushed v${version} source to GitHub`)

// 3. Build, sign (afterSign hook), and publish to GitHub Releases
run('npm', ['run', 'build'])
const notesArg = notes ? [`-c.releaseInfo.releaseNotes=${JSON.stringify(notes)}`] : []
run('npx', ['electron-builder', '--win', '--x64', '--publish', 'always', ...notesArg], { GH_TOKEN: env.GITHUB_TOKEN })
console.log(`Released v${version}: https://github.com/fieldchar000/studyhall/releases/tag/v${version}`)
