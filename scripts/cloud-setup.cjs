// node scripts/cloud-setup.cjs — creates/updates everything in the Supabase project.
// Safe to re-run after app updates (adds new columns/tables, refreshes policies).
// Needs SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF in .env. Prints no secrets.

const { writeFileSync, readFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')
const { buildSync } = require('esbuild')
const { api, sql, REF } = require('./supabase-api.cjs')

const root = join(__dirname, '..')

function generatePersonalSql() {
  // Bundle the TypeScript generator (it imports the app's migrations) and run it.
  const outfile = join(root, 'scripts', '.out', 'personal-schema.cjs')
  mkdirSync(join(root, 'scripts', '.out'), { recursive: true })
  buildSync({ entryPoints: [join(root, 'scripts', 'personal-schema.ts')], bundle: true, platform: 'node', format: 'cjs', outfile, logLevel: 'error' })
  delete require.cache[outfile]
  return require(outfile).personalSql()
}

;(async () => {
  console.log('Project:', REF)

  console.log('1/5 Personal tables (generated from the app migrations)…')
  const personal = generatePersonalSql()
  writeFileSync(join(root, 'supabase', 'personal.sql'), personal)
  await sql(personal)

  console.log('2/5 Social tables, security rules, sign-up check, storage…')
  await sql(readFileSync(join(root, 'supabase', 'social.sql'), 'utf8'))

  console.log('3/5 Auth settings: no email confirmation, 8+ character passwords…')
  try {
    await api('PATCH', '/projects/{ref}/config/auth', {
      mailer_autoconfirm: true, // no emails are ever sent
      password_min_length: 8,
      disable_signup: false, // sign-up stays open but the database trigger demands an invite code
      external_email_enabled: true,
      site_url: 'studyhall://auth'
    })
  } catch (e) {
    if (e.status !== 403) throw e
    // A scoped token without "Project Settings: Read-write" can't change this; check it instead.
    const cfg = await api('GET', '/projects/{ref}/config/auth')
    console.log(
      cfg.mailer_autoconfirm
        ? '   Email confirmation is already OFF ✓'
        : '   (Confirm email is on — fine: accounts are created by signup_with_invite(), already confirmed.)'
    )
  }

  console.log('4/5 Bootstrap invite for the first account…')
  const [{ n: accounts }] = await sql('select count(*)::int as n from auth.users')
  if (accounts > 0) {
    // Accounts exist: never leave an extra admin-level invite lying around.
    await sql('delete from public.invites where created_by is null and use_count < max_uses')
    console.log('   Not needed (accounts exist); new people join with invites made in the app.')
  } else {
  const [existing] = await sql(
    `select code from public.invites where created_by is null and revoked_at is null and use_count < max_uses and (expires_at is null or expires_at > now()) limit 1`
  )
  let code = existing?.code
  if (!code) {
    const [row] = await sql(
      `insert into public.invites (code, kind, created_by, max_uses, expires_at)
       values (upper(encode(extensions.gen_random_bytes(5), 'hex')), 'friend', null, 1, now() + interval '14 days') returning code`
    )
    code = row.code
  }
  console.log('   First-account invite code:', code)
  }

  console.log('5/5 Public app config (URL + publishable key; safe to ship, RLS protects the data)…')
  const keys = await api('GET', '/projects/{ref}/api-keys?reveal=false')
  const publishable = keys.find((k) => k.type === 'publishable' && k.api_key && !k.api_key.includes('·'))
  const anon = keys.find((k) => k.name === 'anon')
  const key = publishable?.api_key ?? anon?.api_key
  if (!key) throw new Error('Could not read a publishable/anon key')
  const config = { url: `https://${REF}.supabase.co`, publishableKey: key }
  writeFileSync(join(root, 'src', 'main', 'cloud', 'project.json'), JSON.stringify(config, null, 2) + '\n')
  console.log('   Wrote src/main/cloud/project.json (key type:', publishable ? 'publishable' : 'anon (legacy)', ')')
  console.log('Done.')
})().catch((e) => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
