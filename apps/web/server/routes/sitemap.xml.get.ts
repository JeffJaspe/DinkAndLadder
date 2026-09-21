import { serverSupabaseServiceRole } from '#supabase/server'

const SITE_URL = 'https://dinkandladder.app'

interface SitemapUrl {
  loc: string
  lastmod?: string
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  priority?: number
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function buildSitemapXml(urls: SitemapUrl[]): string {
  const urlEntries = urls.map((u) => {
    let entry = `  <url>\n    <loc>${escapeXml(u.loc)}</loc>`
    if (u.lastmod) entry += `\n    <lastmod>${u.lastmod}</lastmod>`
    if (u.changefreq) entry += `\n    <changefreq>${u.changefreq}</changefreq>`
    if (u.priority !== undefined) entry += `\n    <priority>${u.priority.toFixed(1)}</priority>`
    entry += '\n  </url>'
    return entry
  })

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries.join('\n')}
</urlset>`
}

export default defineEventHandler(async (event) => {
  const client = serverSupabaseServiceRole(event)
  const now = new Date().toISOString().split('T')[0]

  const urls: SitemapUrl[] = []

  // Static pages
  urls.push(
    { loc: SITE_URL, changefreq: 'daily', priority: 1.0 },
    { loc: `${SITE_URL}/clubs`, changefreq: 'daily', priority: 0.9 },
    { loc: `${SITE_URL}/players`, changefreq: 'daily', priority: 0.9 },
    { loc: `${SITE_URL}/rankings`, changefreq: 'daily', priority: 0.9 },
    { loc: `${SITE_URL}/events`, changefreq: 'daily', priority: 0.9 },
    { loc: `${SITE_URL}/pricing`, changefreq: 'monthly', priority: 0.7 },
    { loc: `${SITE_URL}/legal/terms`, changefreq: 'monthly', priority: 0.3 },
    { loc: `${SITE_URL}/legal/privacy`, changefreq: 'monthly', priority: 0.3 },
    { loc: `${SITE_URL}/legal/cookies`, changefreq: 'monthly', priority: 0.3 }
  )

  // Clubs (public only)
  const { data: clubs } = await client
    .from('clubs')
    .select('id, updated_at')
    .neq('visibility', 'private')
    .order('updated_at', { ascending: false })
    .limit(5000)

  for (const club of clubs ?? []) {
    urls.push({
      loc: `${SITE_URL}/clubs/${club.id}`,
      lastmod: club.updated_at?.split('T')[0] ?? now,
      changefreq: 'weekly',
      priority: 0.7
    })
  }

  // Players (public profiles)
  const { data: players } = await client
    .from('player_profiles')
    .select('id, updated_at')
    .order('updated_at', { ascending: false })
    .limit(10000)

  for (const player of players ?? []) {
    urls.push({
      loc: `${SITE_URL}/players/${player.id}`,
      lastmod: player.updated_at?.split('T')[0] ?? now,
      changefreq: 'weekly',
      priority: 0.6
    })
  }

  // Events (published only, not drafts or cancelled)
  const { data: events } = await client
    .from('events')
    .select('id, updated_at')
    .eq('is_published', true)
    .neq('status', 'cancelled')
    .order('updated_at', { ascending: false })
    .limit(5000)

  for (const ev of events ?? []) {
    urls.push({
      loc: `${SITE_URL}/events/${ev.id}`,
      lastmod: ev.updated_at?.split('T')[0] ?? now,
      changefreq: 'weekly',
      priority: 0.6
    })
  }

  setHeader(event, 'Content-Type', 'application/xml; charset=utf-8')
  setHeader(event, 'Cache-Control', 'public, max-age=3600, s-maxage=3600')

  return buildSitemapXml(urls)
})
