import { readFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#'))
    .map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()]}))
const U = env.NUXT_PUBLIC_SUPABASE_URL, S = env.NUXT_SUPABASE_SECRET_KEY
const r = await fetch(`${U}/rest/v1/databasechangelog?select=filename,id,dateexecuted&order=orderexecuted.desc&limit=12`,
  { headers:{apikey:S,Authorization:`Bearer ${S}`} })
if (!r.ok) { console.log('ERR', r.status, (await r.text()).slice(0,200)); process.exit(0) }
console.log('=== LAST 12 CHANGESETS APPLIED TO THE LIVE DB ===')
for (const row of await r.json()) {
  console.log(`${row.dateexecuted.slice(0,16).replace('T',' ')}  ${row.filename.split('/').pop().padEnd(46)} ${row.id}`)
}
