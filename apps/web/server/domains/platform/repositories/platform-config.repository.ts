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
 * minimal: only what's needed to gate SuperAdmin-only actions (club verification) for
 * this pass. docs/30-SUPER-ADMIN-SPECIFICATION.md's full branding/theming/feature-flag
 * system is a separate, later backlog item, not built here.
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
