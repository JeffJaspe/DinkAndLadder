import type { SupabaseClient } from '@supabase/supabase-js'
import type { FeatureFlagRecord } from '../dto/feature-flag.dto'

const FLAG_COLUMNS =
  'id, key, label, description, enabled, display_order, updated_at, updated_by_user_id'

/**
 * "That table isn't there yet." PostgREST answers with its own PGRST205
 * ("not found in the schema cache") rather than Postgres's 42P01, so both
 * count — verified against the live database before 023 was applied.
 */
const MISSING_TABLE_CODES = ['42P01', 'PGRST205']

function isMissingTable(code: string | undefined): boolean {
  return !!code && MISSING_TABLE_CODES.includes(code)
}

export interface FeatureFlagRepository {
  /**
   * Every flag, in display order. Returns an empty list — not an error — when
   * the table is not there yet: the flags migration (023) may not have run, and
   * a platform without it must keep serving with everything switched off rather
   * than failing every request that consults a flag.
   */
  listAll(): Promise<FeatureFlagRecord[]>
  findByKey(key: string): Promise<FeatureFlagRecord | null>
  setEnabled(key: string, enabled: boolean, updatedByUserId: string): Promise<FeatureFlagRecord>
}

/**
 * Reads work through any client (the table has a public SELECT policy). Writes
 * have no policy at all, so `setEnabled` must be given the service-role client —
 * and the endpoint holding that key is the one that checks for SuperAdmin.
 */
export function createFeatureFlagRepository(client: SupabaseClient): FeatureFlagRepository {
  return {
    async listAll() {
      const { data, error } = await client
        .from('feature_flags')
        .select(FLAG_COLUMNS)
        .order('display_order', { ascending: true })
        .order('key', { ascending: true })

      if (error) {
        if (isMissingTable(error.code)) {
          console.warn(
            '[feature-flags] table missing — run the 023-platform-feature-flags migration. Every flag reads as off.'
          )
          return []
        }
        throw error
      }
      return (data ?? []) as unknown as FeatureFlagRecord[]
    },

    async findByKey(key) {
      const { data, error } = await client
        .from('feature_flags')
        .select(FLAG_COLUMNS)
        .eq('key', key)
        .maybeSingle()

      if (error) {
        if (isMissingTable(error.code)) return null
        throw error
      }
      return data as unknown as FeatureFlagRecord | null
    },

    async setEnabled(key, enabled, updatedByUserId) {
      const { data, error } = await client
        .from('feature_flags')
        .update({
          enabled,
          updated_at: new Date().toISOString(),
          updated_by_user_id: updatedByUserId
        })
        .eq('key', key)
        .select(FLAG_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as FeatureFlagRecord
    }
  }
}
