// node scripts/check-tokens.cjs — verifies the .env tokens work (prints no secrets).
const { loadEnv, describe } = require('./env.cjs')

;(async () => {
  const env = loadEnv()
  console.log('SUPABASE_ACCESS_TOKEN:', describe(env.SUPABASE_ACCESS_TOKEN))
  console.log('GITHUB_TOKEN:', describe(env.GITHUB_TOKEN))
  console.log('SUPABASE_PROJECT_REF:', env.SUPABASE_PROJECT_REF || '(not set)')

  if (env.SUPABASE_ACCESS_TOKEN) {
    const h = { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` }
    const r = await fetch('https://api.supabase.com/v1/projects', { headers: h })
    console.log('Supabase list projects:', r.status)
    if (r.ok) {
      for (const p of await r.json()) console.log('  project:', p.name, '| ref', p.id ?? p.ref, '|', p.region, '|', p.status)
    } else console.log('  ', (await r.text()).slice(0, 200))
  }
  if (env.GITHUB_TOKEN) {
    const r = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'studyhall-setup' } })
    console.log('GitHub user:', r.status, r.ok ? (await r.json()).login : '', '| scopes:', r.headers.get('x-oauth-scopes'))
  }
})()
