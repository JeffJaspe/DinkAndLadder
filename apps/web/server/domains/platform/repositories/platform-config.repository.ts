import type { SupabaseClient } from '@supabase/supabase-js'
import type { BillingMode } from '../../payment/dto/subscription.dto'

export interface PlatformConfigRecord {
  id: string
  super_admin_id: string | null
  /**
   * Whether real money can move. Deliberately a column and not a feature flag:
   * feature-flags.ts says in its own docstring that its 30-second cache "must
   * never stand in for an authorization check", and this is exactly that.
   */
  billing_mode: BillingMode
  /** Test-mode copy, SuperAdmin-owned. Even "no card will be charged" is not hardcoded. */
  billing_notice: string | null
  /** How long a lapsed subscription keeps its entitlements before dropping to free. */
  subscription_grace_days: number
}

export interface UpdateBillingInput {
  billing_mode?: BillingMode
  billing_notice?: string | null
  subscription_grace_days?: number
}

const CONFIG_COLUMNS = 'id, super_admin_id, billing_mode, billing_notice, subscription_grace_days'

export interface PlatformConfigRepository {
  getConfig(): Promise<PlatformConfigRecord | null>
  updateBilling(patch: UpdateBillingInput): Promise<PlatformConfigRecord>
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
        .select(CONFIG_COLUMNS)
        .limit(1)
        .maybeSingle()

      if (error) throw error
      return data as unknown as PlatformConfigRecord | null
    },

    async updateBilling(patch) {
      // The row is found first rather than updated by a `where true`: this is a
      // single-row table by convention, not by constraint, and an unbounded
      // UPDATE on a table that turns out to have two rows changes both.
      const { data: existing, error: readError } = await client
        .from('platform_config')
        .select('id')
        .limit(1)
        .maybeSingle()

      if (readError) throw readError
      if (!existing) throw new Error('platform_config has no row to update.')

      const { data, error } = await client
        .from('platform_config')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', (existing as { id: string }).id)
        .select(CONFIG_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as PlatformConfigRecord
    }
  }
}
