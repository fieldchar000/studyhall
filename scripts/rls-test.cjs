// node scripts/rls-test.cjs — runs supabase/rls-test.sql (fully rolled back) and prints PASS/FAIL.
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { sql } = require('./supabase-api.cjs')

;(async () => {
  try {
    await sql(readFileSync(join(__dirname, '..', 'supabase', 'rls-test.sql'), 'utf8'))
    console.log('Unexpected: test did not report results')
  } catch (e) {
    const m = /RESULTS([\s\S]*?)(?:","|\\n\s*CONTEXT|$)/.exec(e.message)
    if (!m) return console.log('ERROR:', e.message.slice(0, 800))
    const lines = m[1].split(/\\n|\n/).filter((l) => l.trim())
    for (const l of lines) console.log(l.replace(/\\"/g, '"'))
    const fails = lines.filter((l) => l.startsWith('FAIL')).length
    console.log(`\n${lines.length - fails} passed, ${fails} failed`)
    process.exitCode = fails ? 1 : 0
  }
})()
