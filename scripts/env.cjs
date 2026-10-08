// Reads the project's .env without printing it. Used by the setup scripts.
const { readFileSync, existsSync } = require('node:fs')
const { join } = require('node:path')

function loadEnv() {
  const file = join(__dirname, '..', '.env')
  const out = {}
  if (!existsSync(file)) return out
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

/** "set (sbp_…, 44 chars)" — enough to check a value without revealing it. */
function describe(v) {
  return v ? `set (${v.slice(0, 4)}…, ${v.length} chars)` : 'MISSING'
}

module.exports = { loadEnv, describe }
