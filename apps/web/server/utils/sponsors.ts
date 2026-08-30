import type { H3Event } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import { createSponsorRepository } from '~/server/domains/platform/repositories/sponsor.repository'
import { createBrandingAssetRepository } from '~/server/domains/platform/repositories/branding-asset.repository'
import { createPlatformConfigRepository } from '~/server/domains/platform/repositories/platform-config.repository'
import { createPlatformAdminService } from '~/server/domains/platform/services/platform-admin.service'
import { createSponsorService } from '~/server/domains/platform/services/sponsor.service'
import type { SponsorDto } from '~/server/domains/platform/dto/sponsor.dto'

/**
 * Wiring for the sponsor service, plus a short read cache.
 *
 * Same shape and the same reasoning as server/utils/feature-flags.ts and
 * server/utils/branding.ts: sponsors are read on every landing-page render for
 * a handful of rows that change when an operator clicks something, so a
 * database round trip per visitor buys nothing.
 *
 * The TTL is short enough that an edit is visible while the operator is still
 * looking at the page, and it is deliberately not longer than a signed image
 * URL's lifetime — a cached URL must never outlive its own signature.
 */
const TTL_MS = 30_000

let cache: { sponsors: SponsorDto[]; expiresAt: number } | null = null

export function invalidateSponsorCache(): void {
  cache = null
}

export function createSponsorServiceFor(event: H3Event) {
  // Service role: platform_sponsors has no write policy at all, and signing an
  // image URL requires the same key.
  const client = serverSupabaseServiceRole(event)
  return createSponsorService(
    createSponsorRepository(client),
    createBrandingAssetRepository(client),
    createPlatformAdminService(createPlatformConfigRepository(client))
  )
}

export async function getPublicSponsors(event: H3Event): Promise<SponsorDto[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.sponsors

  try {
    const sponsors = await createSponsorServiceFor(event).listPublic()
    cache = { sponsors, expiresAt: Date.now() + TTL_MS }
    return sponsors
  } catch (err) {
    // A sponsor strip must never take the landing page down with it. An empty
    // list hides the section, which is the same thing a platform with no
    // sponsors shows.
    console.error('[sponsors] could not read sponsors, hiding the section:', err)
    return []
  }
}
