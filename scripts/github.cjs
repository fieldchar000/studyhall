// node scripts/github.cjs <identity|create|push|run-keepalive|runs>
// GitHub helper using GITHUB_TOKEN from .env (never printed).
const { execFileSync } = require('node:child_process')
const { loadEnv } = require('./env.cjs')

const env = loadEnv()
const REPO = 'studyhall'
const gh = async (method, path, body) => {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'studyhall-setup', 'X-GitHub-Api-Version': '2022-11-28' },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await res.text()
  return { status: res.status, json: text ? JSON.parse(text) : null }
}
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()

;(async () => {
  const cmd = process.argv[2]
  const me = (await gh('GET', '/user')).json
  const noreply = `${me.id}+${me.login}@users.noreply.github.com`

  if (cmd === 'identity') {
    // Commits use GitHub's private noreply address, not your real email.
    git('config', 'user.name', me.login)
    git('config', 'user.email', noreply)
    console.log('git identity:', me.login, '<noreply address>')
  } else if (cmd === 'create') {
    const r = await gh('POST', '/user/repos', {
      name: REPO,
      description: 'Studyhall — local-first study & work planner for Windows (Electron + SQLite + Supabase)',
      private: false,
      has_wiki: false,
      has_projects: false
    })
    console.log(r.status === 201 ? 'created repo' : r.status === 422 ? 'repo already exists' : `create failed: ${r.status}`, `${me.login}/${REPO}`)
    try {
      git('remote', 'add', 'origin', `https://github.com/${me.login}/${REPO}.git`)
    } catch {
      git('remote', 'set-url', 'origin', `https://github.com/${me.login}/${REPO}.git`)
    }
  } else if (cmd === 'push') {
    const auth = Buffer.from(`x-access-token:${env.GITHUB_TOKEN}`).toString('base64')
    execFileSync('git', ['-c', `http.https://github.com/.extraheader=AUTHORIZATION: basic ${auth}`, 'push', '-u', 'origin', 'main', ...process.argv.slice(3)], { stdio: ['ignore', 'ignore', 'pipe'] })
    console.log('pushed to', `https://github.com/${me.login}/${REPO}`)
  } else if (cmd === 'run-keepalive') {
    const r = await gh('POST', `/repos/${me.login}/${REPO}/actions/workflows/keepalive.yml/dispatches`, { ref: 'main' })
    console.log('dispatch:', r.status === 204 ? 'started' : `failed ${r.status} ${JSON.stringify(r.json)}`)
  } else if (cmd === 'runs') {
    const r = await gh('GET', `/repos/${me.login}/${REPO}/actions/runs?per_page=3`)
    for (const run of r.json.workflow_runs ?? []) console.log(run.name, '|', run.event, '|', run.status, '|', run.conclusion)
  }
})().catch((e) => console.error('ERR', e.message))
