// node scripts/android-build.cjs <tag|branch> [--wait]
// Starts the "Android app" GitHub Actions workflow (.github/workflows/android.yml), which builds
// Studyhall.apk and attaches it to the release with that tag. With --wait, follows the run
// until it finishes and prints the result. Needs GITHUB_TOKEN in .env (never printed).

const { loadEnv } = require('./env.cjs')

const REPO = 'fieldchar000/studyhall'
const WORKFLOW = 'android.yml'

function github() {
  const { GITHUB_TOKEN } = loadEnv()
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN missing in .env')
  return async (path, init = {}) => {
    const r = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': 'studyhall-release', ...init.headers }
    })
    if (!r.ok && r.status !== 204) throw new Error(`GitHub ${init.method ?? 'GET'} ${path}: ${r.status} ${await r.text()}`)
    return r.status === 204 ? null : r.json()
  }
}

/** Start the build; resolves with the run once GitHub has created it. */
async function startAndroidBuild(tag) {
  const gh = github()
  const since = new Date(Date.now() - 5000).toISOString()
  await gh(`/actions/workflows/${WORKFLOW}/dispatches`, { method: 'POST', body: JSON.stringify({ ref: 'main', inputs: { tag } }) })
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 3000))
    const { workflow_runs: runs } = await gh(`/actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&per_page=5`)
    const run = runs.find((r) => r.created_at >= since)
    if (run) return run
  }
  throw new Error('The Android build did not start')
}

async function waitForRun(id) {
  const gh = github()
  for (;;) {
    const run = await gh(`/actions/runs/${id}`)
    if (run.status === 'completed') return run
    await new Promise((r) => setTimeout(r, 20000))
  }
}

module.exports = { startAndroidBuild, waitForRun }

if (require.main === module) {
  const [tag, flag] = process.argv.slice(2)
  if (!tag) {
    console.error('Usage: node scripts/android-build.cjs v1.2.3 [--wait]')
    process.exit(1)
  }
  startAndroidBuild(tag)
    .then(async (run) => {
      console.log(`Android build started: ${run.html_url}`)
      if (flag !== '--wait') return
      const done = await waitForRun(run.id)
      console.log(`Android build ${done.conclusion}: ${done.html_url}`)
      if (done.conclusion !== 'success') process.exit(1)
    })
    .catch((e) => {
      console.error(e.message)
      process.exit(1)
    })
}
