/**
 * Reports player_profiles whose display_name looks like it was derived from the
 * owner's email local part — the leak fixed in the code by
 * PlayerProfileService.ensureProfile (audit finding F-05).
 *
 * READ-ONLY BY DEFAULT. It prints what it finds and changes nothing. Pass
 * --fix to replace each match with a neutral placeholder; those players are
 * then prompted to choose a real name the next time they open their profile.
 *
 * Usage (from the repo root):
 *   node scripts/find-email-derived-display-names.mjs
 *   node scripts/find-email-derived-display-names.mjs --fix
 *
 * Requires, in the environment:
 *   SUPABASE_URL                 your project URL
 *   SUPABASE_SERVICE_ROLE_KEY    service-role key (bypasses RLS — never commit)
 *
 * This is a data correction, not a schema change, so it is deliberately NOT a
 * Liquibase changeset.
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const APPLY = process.argv.includes('--fix')

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running.')
  process.exit(1)
}

const admin = createClient(url, key, { auth: { persistSession: false } })

const { data: profiles, error } = await admin
  .from('player_profiles')
  .select('id, user_id, display_name')

if (error) {
  console.error('Could not read player_profiles:', error.message)
  process.exit(1)
}

// Page through auth users to map user_id -> email.
const emailByUserId = new Map()
for (let page = 1; ; page++) {
  const { data, error: authError } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
  if (authError) {
    console.error('Could not list auth users:', authError.message)
    process.exit(1)
  }
  for (const u of data.users) emailByUserId.set(u.id, u.email ?? '')
  if (data.users.length < 1000) break
}

const suspects = []
for (const p of profiles ?? []) {
  const email = emailByUserId.get(p.user_id)
  if (!email) continue
  const localPart = email.split('@')[0]
  if (localPart && p.display_name === localPart) {
    suspects.push({ ...p, email })
  }
}

if (suspects.length === 0) {
  console.log('No email-derived display names found.')
  process.exit(0)
}

console.log(`Found ${suspects.length} profile(s) whose display_name equals their email local part:\n`)
for (const s of suspects) {
  console.log(`  ${s.id}  "${s.display_name}"  (${s.email})`)
}

if (!APPLY) {
  console.log('\nRead-only run. Re-run with --fix to replace these with a placeholder.')
  process.exit(0)
}

console.log('\nApplying...')
let changed = 0
for (const s of suspects) {
  const placeholder = `Player ${s.id.slice(0, 6)}`
  const { error: updateError } = await admin
    .from('player_profiles')
    .update({ display_name: placeholder, updated_at: new Date().toISOString() })
    .eq('id', s.id)

  if (updateError) console.error(`  FAILED ${s.id}: ${updateError.message}`)
  else {
    changed++
    console.log(`  ${s.id}  "${s.display_name}" -> "${placeholder}"`)
  }
}
console.log(`\nUpdated ${changed} of ${suspects.length}.`)
