// Small helper for the Supabase Management API (uses the token in .env, prints no secrets).
const { loadEnv } = require('./env.cjs')

const env = loadEnv()
const REF = env.SUPABASE_PROJECT_REF
const BASE = 'https://api.supabase.com/v1'

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path.replace('{ref}', REF)}`, {
    method,
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    const err = new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 20000)}`)
    err.status = res.status
    throw err
  }
  return json
}

/** Run SQL on the project database (needs the "Database: read-write" permission). */
const sql = (query) => api('POST', '/projects/{ref}/database/query', { query })

module.exports = { api, sql, REF, env }
