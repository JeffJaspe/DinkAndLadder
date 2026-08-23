import type { SupabaseClient } from '@supabase/supabase-js'

export interface PlatformConfigRecord {
  id: string
  super_admin_id: string | null
}

export interface PlatformConfigRepository {
  getConfig(): Promise<PlatformConfigRecord | null>
}

/**
 * Single-row table — see database/liquibase/018-platform-enhancements. Deliberately
 * minimal: only what's needed to answer "is this user the SuperAdmin". Feature flags
 * are their own table with their own repository; branding and theming from
 * docs/30-SUPER-ADMIN-SPECIFICATION.md are not built yet.
 *
 * RLS is enabled here with zero policies, so every caller must be constructed with
 * the service-role client — a user-scoped client sees no rows and every check
 * silently answers "not the SuperAdmin".
 */
export function createPlatformConfigRepository(client: SupabaseClient): PlatformConfigRepository {
  return {
    async getConfig() {
      const { data, error } = await client
        .from('platform_config')
        .select('id, super_admin_id')
        .limit(1)
        .maybeSingle()

      if (error) throw error
      return data as unknown as PlatformConfigRecord | null
    }
  }
}
