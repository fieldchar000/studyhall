// node scripts/android-build.cjs <tag|branch> [--wait]   build Studyhall.apk (attached to the release with that tag)
// node scripts/android-build.cjs <branch> --smoke [dir]     run the emulator test and download its screenshots + report
// Starts the GitHub Actions workflows in .github/workflows (android.yml, android-smoke.yml).
// Needs GITHUB_TOKEN in .env (never printed).

const { mkdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { loadEnv } = require('./env.cjs')

const REPO = 'fieldchar000/studyhall'

function github() {
  const { GITHUB_TOKEN } = loadEnv()
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN missing in .env')
  const headers = { authorization: `Bearer ${GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': 'studyhall-release' }
  const gh = async (path, init = {}) => {
    const r = await fetch(path.startsWith('http') ? path : `https://api.github.com/repos/${REPO}${path}`, { ...init, headers: { ...headers, ...init.headers } })
    if (!r.ok && r.status !== 204) throw new Error(`GitHub ${init.method ?? 'GET'} ${path}: ${r.status} ${await r.text()}`)
    return r.status === 204 ? null : r.json()
  }
  gh.raw = (url) => fetch(url, { headers, redirect: 'follow' })
  return gh
}

/** Start a workflow; resolves with the run once GitHub has created it. */
async function startWorkflow(file, inputs) {
  const gh = github()
  const since = new Date(Date.now() - 5000).toISOString()
  await gh(`/actions/workflows/${file}/dispatches`, { method: 'POST', body: JSON.stringify({ ref: 'main', inputs }) })
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 3000))
    const { workflow_runs: runs } = await gh(`/actions/workflows/${file}/runs?event=workflow_dispatch&per_page=5`)
    const run = runs.find((r) => r.created_at >= since)
    if (run) return run
  }
  throw new Error(`${file} did not start`)
}

const startAndroidBuild = (tag) => startWorkflow('android.yml', { tag })

async function waitForRun(id) {
  const gh = github()
  for (;;) {
    const run = await gh(`/actions/runs/${id}`)
    if (run.status === 'completed') return run
    await new Promise((r) => setTimeout(r, 20000))
  }
}

/** Download a run's artifact (a zip) and unpack it into dir. */
async function downloadArtifact(runId, name, dir) {
  const gh = github()
  const { artifacts } = await gh(`/actions/runs/${runId}/artifacts`)
  const a = artifacts.find((x) => x.name === name)
  if (!a) throw new Error(`No artifact called ${name}`)
  const res = await gh.raw(a.archive_download_url)
  const JSZip = require('jszip')
  const zip = await JSZip.loadAsync(Buffer.from(await res.arrayBuffer()))
  mkdirSync(dir, { recursive: true })
  const files = []
  for (const f of Object.values(zip.files)) {
    if (f.dir) continue
    writeFileSync(join(dir, f.name.replace(/[/\\]/g, '_')), await f.async('nodebuffer'))
    files.push(f.name)
  }
  return files
}

/** Why a run failed: the last lines of each failed step's log. */
async function failureLog(runId) {
  const gh = github()
  const { jobs } = await gh(`/actions/runs/${runId}/jobs`)
  const out = []
  for (const job of jobs.filter((j) => j.conclusion === 'failure')) {
    const steps = job.steps.filter((s) => s.conclusion === 'failure').map((s) => s.name)
    const log = await (await gh.raw(`https://api.github.com/repos/${REPO}/actions/jobs/${job.id}/logs`)).text()
    out.push(`Job "${job.name}" failed at: ${steps.join(', ')}\n${log.split('\n').slice(-80).join('\n')}`)
  }
  return out.join('\n\n')
}

module.exports = { startAndroidBuild, startWorkflow, waitForRun, downloadArtifact, failureLog }

if (require.main === module) {
  const [ref, flag, dir = 'smoke'] = process.argv.slice(2)
  if (!ref) {
    console.error('Usage: node scripts/android-build.cjs v1.2.3 [--wait]  |  node scripts/android-build.cjs main --smoke [dir]')
    process.exit(1)
  }
  const smoke = flag === '--smoke'
  ;(smoke ? startWorkflow('android-smoke.yml', { ref }) : startAndroidBuild(ref))
    .then(async (run) => {
      console.log(`${smoke ? 'Emulator test' : 'Android build'} started: ${run.html_url}`)
      if (flag !== '--wait' && !smoke) return
      const done = await waitForRun(run.id)
      console.log(`Finished: ${done.conclusion}`)
      if (smoke) console.log(`Downloaded: ${(await downloadArtifact(run.id, 'smoke', dir).catch((e) => [e.message])).join(', ')}`)
      if (done.conclusion !== 'success') {
        console.log(await failureLog(run.id).catch((e) => e.message))
        process.exit(1)
      }
    })
    .catch((e) => {
      console.error(e.message)
      process.exit(1)
    })
}
