import type { H3Event } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import { createBrandingAssetRepository } from '~/server/domains/platform/repositories/branding-asset.repository'
import { createBrandingRepository } from '~/server/domains/platform/repositories/branding.repository'
import { createPlatformConfigRepository } from '~/server/domains/platform/repositories/platform-config.repository'
import { createBrandingService } from '~/server/domains/platform/services/branding.service'
import { createPlatformAdminService } from '~/server/domains/platform/services/platform-admin.service'
import {
  DEFAULT_APP_NAME,
  DEFAULT_OVERLAY_COLOR,
  DEFAULT_OVERLAY_OPACITY,
  type BrandingDto
} from '~/server/domains/platform/dto/branding.dto'

/**
 * Branding is read on every page render, so it is cached like the flags and the
 * palette. The TTL is shorter than the signed-URL lifetime on purpose: a cached
 * URL must never outlive its own signature.
 */
const TTL_MS = 30_000

let cache: { branding: BrandingDto; expiresAt: number } | null = null

export function invalidateBrandingCache(): void {
  cache = null
}

export function createBrandingServiceFor(event: H3Event) {
  // Service role: platform_config has no RLS policies, and the bucket has no
  // anon write access or signing rights.
  const client = serverSupabaseServiceRole(event)
  return createBrandingService(
    createBrandingRepository(client),
    createBrandingAssetRepository(client),
    createPlatformAdminService(createPlatformConfigRepository(client))
  )
}

export async function getBranding(event: H3Event): Promise<BrandingDto> {
  if (cache && cache.expiresAt > Date.now()) return cache.branding

  try {
    const branding = await createBrandingServiceFor(event).getBranding()
    cache = { branding, expiresAt: Date.now() + TTL_MS }
    return branding
  } catch (err) {
    // Never fail a page render over a logo. The built-in name and monogram are
    // a complete brand on their own.
    console.error('[branding] could not read platform branding, using built-in:', err)
    return {
      app_name: DEFAULT_APP_NAME,
      logo_url: null,
      favicon_url: null,
      hero: {
        title: null,
        subtitle: null,
        background_url: null,
        overlay_color: DEFAULT_OVERLAY_COLOR,
        overlay_opacity: DEFAULT_OVERLAY_OPACITY
      }
    }
  }
}
