// node scripts/upload-stable.cjs <version>
// Adds a copy of the installer named "Studyhall-Setup.exe" to the GitHub release, so this
// link always downloads the newest version (handy to give to friends):
//   https://github.com/fieldchar000/studyhall/releases/latest/download/Studyhall-Setup.exe
// Needs GITHUB_TOKEN in .env (never printed).

const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { loadEnv } = require('./env.cjs')

const REPO = 'fieldchar000/studyhall'
const NAME = 'Studyhall-Setup.exe'

async function uploadStable(version) {
  const { GITHUB_TOKEN } = loadEnv()
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN missing in .env')
  const headers = { authorization: `Bearer ${GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': 'studyhall-release' }
  const gh = async (url, init = {}) => {
    const r = await fetch(url, { ...init, headers: { ...headers, ...init.headers } })
    if (!r.ok && r.status !== 204) throw new Error(`GitHub ${init.method ?? 'GET'} ${new URL(url).pathname}: ${r.status}`)
    return r.status === 204 ? null : r.json()
  }
  const release = await gh(`https://api.github.com/repos/${REPO}/releases/tags/v${version}`)
  for (const a of release.assets.filter((x) => x.name === NAME)) await gh(`https://api.github.com/repos/${REPO}/releases/assets/${a.id}`, { method: 'DELETE' })
  const file = readFileSync(join(__dirname, '..', 'dist', `Studyhall-Setup-${version}.exe`))
  await gh(`https://uploads.github.com/repos/${REPO}/releases/${release.id}/assets?name=${NAME}`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: file
  })
  console.log(`Uploaded ${NAME} (${(file.length / 1e6).toFixed(0)} MB) to v${version}`)
}

module.exports = { uploadStable }

if (require.main === module) {
  uploadStable(process.argv[2]).catch((e) => {
    console.error('FAILED:', e.message)
    process.exit(1)
  })
}
