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
 * Usage (from anywhere in the repo):
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
 * Deliberately talks to the Auth Admin and PostgREST endpoints with the global
 * fetch rather than @supabase/supabase-js: this is a pnpm workspace and that
 * package is only installed under apps/web, so a bare import here fails to
 * resolve. Adding a workspace-root dependency for six HTTP calls is not worth
 * it. (The same trap applies to scripts/find-email-derived-display-names.mjs,
 * which does import it and therefore only runs from inside apps/web.)
 *
 * This is data, not schema, so it is deliberately NOT a Liquibase changeset.
 */

const DEMO_DOMAIN = '@demo.dinkandladder.test'
const PLAYER_COUNT = 100
const PAGE_SIZE = 1000

const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
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

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json'
}

async function api(path, init = {}) {
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) }
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${init.method || 'GET'} ${path} -> ${res.status} ${res.statusText} ${body}`)
  }
  // 204 and Prefer: return=minimal give an empty body.
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

/** Every auth user whose email is in the reserved demo domain. */
async function listDemoAuthUsers() {
  const found = []
  for (let page = 1; ; page++) {
    const data = await api(`/auth/v1/admin/users?page=${page}&per_page=${PAGE_SIZE}`)
    const users = data?.users ?? []
    for (const u of users) {
      if ((u.email ?? '').toLowerCase().endsWith(DEMO_DOMAIN)) found.push(u)
    }
    if (users.length < PAGE_SIZE) break
  }
  return found
}

function emailFor(n) {
  return `demo.player${String(n).padStart(3, '0')}${DEMO_DOMAIN}`
}

try {
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
        const user = await api('/auth/v1/admin/users', {
          method: 'POST',
          body: JSON.stringify({ email, password, email_confirm: true })
        })
        id = user.id
        created++
      }
      rows.push({
        id,
        email,
        status: 'active',
        email_verified_at: new Date().toISOString()
      })
      if (n % 20 === 0) console.log(`  ...${n}/${PLAYER_COUNT}`)
    }

    // public.users mirrors auth.users by id; there is no FK between them and no
    // INSERT policy on users, so this goes through the service role — the same
    // thing POST /api/v1/auth/session does on a real sign-in.
    await api('/rest/v1/users?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows)
    })

    console.log(
      `\nDone. ${created} auth users created, ${rows.length} public.users rows upserted.`
    )
    console.log(`Sign in as ${emailFor(1)} with password: ${password}`)
    console.log('Next: run database/seeds/demo/00-config.sql, then 01..06.')
  }

  if (PURGE) {
    const users = await listDemoAuthUsers()
    console.log(`Deleting ${users.length} demo auth users...`)

    // public.users first: nothing FKs to auth.users, but player_profiles FKs to
    // public.users, so 99-rollback.sql must already have run.
    const pattern = encodeURIComponent(`*${DEMO_DOMAIN}`)
    await api(`/rest/v1/users?email=like.${pattern}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' }
    })

    let deleted = 0
    for (const u of users) {
      await api(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE' })
      deleted++
    }

    console.log(`Done. ${deleted} auth users and their public.users rows removed.`)
  }
} catch (err) {
  console.error(`\nFailed: ${err.message}`)
  if (String(err.message).includes('/rest/v1/users')) {
    console.error(
      'If this was the purge, run database/seeds/demo/99-rollback.sql first — ' +
        'player_profiles references users.'
    )
  }
  process.exit(1)
}
