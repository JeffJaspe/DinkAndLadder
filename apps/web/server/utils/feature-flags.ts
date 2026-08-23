import type { H3Event } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import { createFeatureFlagRepository } from '~/server/domains/platform/repositories/feature-flag.repository'
import { createPlatformConfigRepository } from '~/server/domains/platform/repositories/platform-config.repository'
import { createFeatureFlagService } from '~/server/domains/platform/services/feature-flag.service'
import { createPlatformAdminService } from '~/server/domains/platform/services/platform-admin.service'
import { isEnabledIn, type FeatureFlagMap } from '~/server/domains/platform/dto/feature-flag.dto'

/**
 * Reading the catalog per request would put a database round trip in front of
 * every endpoint that consults a flag, for a handful of rows that change when a
 * SuperAdmin clicks a toggle. Thirty seconds is short enough that a toggle takes
 * effect while the admin is still looking at the page, and the write path clears
 * this cache in its own process immediately.
 *
 * The cache is per server instance. On a multi-instance deployment another
 * instance can be up to the TTL behind — fine for showing or hiding a feature,
 * and the reason this must never stand in for an authorization check.
 */
const TTL_MS = 30_000

let cache: { flags: FeatureFlagMap; expiresAt: number } | null = null

export function invalidateFeatureFlagCache(): void {
  cache = null
}

export function createFeatureFlagServiceFor(event: H3Event) {
  // Service role: writes have no RLS policy, and the read path shares the client.
  const client = serverSupabaseServiceRole(event)
  return createFeatureFlagService(
    createFeatureFlagRepository(client),
    createPlatformAdminService(createPlatformConfigRepository(client))
  )
}

export async function getFeatureFlagMap(event: H3Event): Promise<FeatureFlagMap> {
  if (cache && cache.expiresAt > Date.now()) return cache.flags

  try {
    const flags = await createFeatureFlagServiceFor(event).getFlagMap()
    cache = { flags, expiresAt: Date.now() + TTL_MS }
    return flags
  } catch (err) {
    // A flag lookup must never take down the page it decorates. An empty map
    // fails closed: anything gated stays hidden.
    console.error('[feature-flags] could not read the catalog, treating every flag as off:', err)
    return {}
  }
}

export async function isFeatureEnabled(event: H3Event, key: string): Promise<boolean> {
  return isEnabledIn(await getFeatureFlagMap(event), key)
}
