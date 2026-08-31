/**
 * Creates (or removes) the 100 loginable Supabase auth users that back the
 * demo seed in database/seeds/demo/.
 *
 * SQL cannot own auth.users, so this script does that half and nothing else.
 * The .sql files find the rows it creates by email, so the two halves stay
 * decoupled — nothing here has to agree with a UUID generated over there.
 *
 * Demo accounts are identified purely by their reserved email domain:
 *
 *     demo.player001@demo.dinkandladder.test ... demo.player100@...
 *
 * so --purge is exact and cannot touch a real account.
 *
 * Usage (from the repo root):
 *   node scripts/demo/demo-users.mjs --seed
 *   node scripts/demo/demo-users.mjs --purge
 *
 * Requires, in the environment:
 *   SUPABASE_URL                 your DEV project URL
 *   SUPABASE_SERVICE_ROLE_KEY    service-role key (bypasses RLS — never commit)
 *   DEMO_EXPECTED_PROJECT_REF    the dev project ref; the script refuses to run
 *                                unless SUPABASE_URL contains it. This is the
 *                                guard that keeps demo data out of production,
 *                                mirroring the "Confirm target database" step
 *                                in .github/workflows/db-migrate.yml.
 *   DEMO_PASSWORD                optional, defaults to 'DemoPickle!2026'
 *
 * This is data, not schema, so it is deliberately NOT a Liquibase changeset
 * (same reasoning as scripts/find-email-derived-display-names.mjs).
 */
import { createClient } from '@supabase/supabase-js'

const DEMO_DOMAIN = '@demo.dinkandladder.test'
const PLAYER_COUNT = 100

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const expectedRef = process.env.DEMO_EXPECTED_PROJECT_REF
const password = process.env.DEMO_PASSWORD || 'DemoPickle!2026'

const SEED = process.argv.includes('--seed')
const PURGE = process.argv.includes('--purge')

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running.')
  process.exit(1)
}
if (SEED === PURGE) {
  console.error('Pass exactly one of --seed or --purge.')
  process.exit(1)
}

// --- Target confirmation -------------------------------------------------
// Never let this run against production by accident.
if (!expectedRef) {
  console.error(
    'Set DEMO_EXPECTED_PROJECT_REF to your DEV Supabase project ref.\n' +
      'This script refuses to run without it so it cannot hit production.'
  )
  process.exit(1)
}
if (!url.includes(expectedRef)) {
  console.error(
    `Refusing to run: SUPABASE_URL (${url}) does not contain the expected ` +
      `project ref "${expectedRef}".`
  )
  process.exit(1)
}
console.log(`Target: ${url} (ref ${expectedRef})`)

const admin = createClient(url, key, { auth: { persistSession: false } })

/** Every auth user whose email is in the reserved demo domain. */
async function listDemoAuthUsers() {
  const found = []
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) {
      console.error('Could not list auth users:', error.message)
      process.exit(1)
    }
    for (const u of data.users) {
      if ((u.email ?? '').toLowerCase().endsWith(DEMO_DOMAIN)) found.push(u)
    }
    if (data.users.length < 1000) break
  }
  return found
}

function emailFor(n) {
  return `demo.player${String(n).padStart(3, '0')}${DEMO_DOMAIN}`
}

if (SEED) {
  // Existing accounts are reused rather than re-created, so --seed is
  // idempotent and safe to re-run after a partial failure.
  const existing = new Map(
    (await listDemoAuthUsers()).map((u) => [u.email.toLowerCase(), u.id])
  )
  console.log(`Found ${existing.size} existing demo auth users.`)

  const rows = []
  let created = 0
  for (let n = 1; n <= PLAYER_COUNT; n++) {
    const email = emailFor(n)
    let id = existing.get(email)
    if (!id) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      if (error) {
        console.error(`createUser failed for ${email}: ${error.message}`)
        process.exit(1)
      }
      id = data.user.id
      created++
    }
    rows.push({
      id,
      email,
      status: 'active',
      email_verified_at: new Date().toISOString(),
    })
    if (n % 20 === 0) console.log(`  ...${n}/${PLAYER_COUNT}`)
  }

  // public.users mirrors auth.users by id; there is no FK between them and no
  // INSERT policy on users, so this has to go through the service role — the
  // same thing POST /api/v1/auth/session does on a real sign-in.
  const { error: upsertError } = await admin
    .from('users')
    .upsert(rows, { onConflict: 'id' })
  if (upsertError) {
    console.error('Could not upsert public.users rows:', upsertError.message)
    process.exit(1)
  }

  console.log(
    `\nDone. ${created} auth users created, ${rows.length} public.users rows upserted.`
  )
  console.log(`Sign in as ${emailFor(1)} with password: ${password}`)
  console.log('Next: run database/seeds/demo/00-config.sql, then 01..05.')
}

if (PURGE) {
  const users = await listDemoAuthUsers()
  console.log(`Deleting ${users.length} demo auth users...`)

  // public.users first: nothing FKs to auth.users, but player_profiles FKs to
  // public.users, so 99-rollback.sql must already have run.
  const { error: deleteRowsError } = await admin
    .from('users')
    .delete()
    .like('email', `%${DEMO_DOMAIN}`)
  if (deleteRowsError) {
    console.error(
      `Could not delete public.users rows: ${deleteRowsError.message}\n` +
        'Run database/seeds/demo/99-rollback.sql first — player_profiles ' +
        'references users.'
    )
    process.exit(1)
  }

  let deleted = 0
  for (const u of users) {
    const { error } = await admin.auth.admin.deleteUser(u.id)
    if (error) {
      console.error(`deleteUser failed for ${u.email}: ${error.message}`)
      process.exit(1)
    }
    deleted++
  }

  console.log(`Done. ${deleted} auth users and their public.users rows removed.`)
}
