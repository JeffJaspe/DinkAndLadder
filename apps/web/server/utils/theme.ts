import type { H3Event } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import { createPlatformConfigRepository } from '~/server/domains/platform/repositories/platform-config.repository'
import { createThemePaletteRepository } from '~/server/domains/platform/repositories/theme-palette.repository'
import { createPlatformAdminService } from '~/server/domains/platform/services/platform-admin.service'
import {
  createThemeService,
  type ActiveTheme
} from '~/server/domains/platform/services/theme.service'

/**
 * The active palette is read on every page render, so it is cached the same way
 * feature flags are and for the same reason. Thirty seconds means a SuperAdmin
 * sees their choice almost immediately, and the write path clears this cache in
 * its own process at once.
 */
const TTL_MS = 30_000

let cache: { theme: ActiveTheme; expiresAt: number } | null = null

export function invalidateThemeCache(): void {
  cache = null
}

export function createThemeServiceFor(event: H3Event) {
  // Service role: platform_config has no RLS policies at all, so the active-key
  // read and write both need it. theme_palettes is publicly readable.
  const client = serverSupabaseServiceRole(event)
  return createThemeService(
    createThemePaletteRepository(client),
    createPlatformAdminService(createPlatformConfigRepository(client))
  )
}

export async function getActiveTheme(event: H3Event): Promise<ActiveTheme> {
  if (cache && cache.expiresAt > Date.now()) return cache.theme

  try {
    const theme = await createThemeServiceFor(event).getActiveTheme()
    cache = { theme, expiresAt: Date.now() + TTL_MS }
    return theme
  } catch (err) {
    // Never fail a page render over a colour. No palette means the design
    // system's own tokens, which is a complete, tested theme.
    console.error('[theme] could not read the active palette, using design-system tokens:', err)
    return { palette: null }
  }
}
