import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Hashed recovery codes (062). Service-role only: the table has RLS enabled
 * with no policies, and the browser never sees a hash.
 */
export interface MfaRecoveryCodeRepository {
  /** Throws away whatever the user had and stores this set. */
  replaceForUser(userId: string, hashes: string[]): Promise<void>
  /**
   * Marks one unused code as used. True if a row was consumed, false if no
   * unused row matched — a wrong code and an already-used code are the same
   * answer, deliberately: the caller must not be able to tell them apart.
   */
  consume(userId: string, hash: string): Promise<boolean>
  countUnused(userId: string): Promise<number>
  deleteForUser(userId: string): Promise<void>
}

export function createMfaRecoveryCodeRepository(
  client: SupabaseClient
): MfaRecoveryCodeRepository {
  return {
    async replaceForUser(userId, hashes) {
      const { error: deleteError } = await client
        .from('mfa_recovery_codes')
        .delete()
        .eq('user_id', userId)
      if (deleteError) throw deleteError

      if (hashes.length === 0) return

      const { error } = await client
        .from('mfa_recovery_codes')
        .insert(hashes.map((code_hash) => ({ user_id: userId, code_hash })))
      if (error) throw error
    },

    async consume(userId, hash) {
      const { data, error } = await client
        .from('mfa_recovery_codes')
        .update({ used_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('code_hash', hash)
        .is('used_at', null)
        .select('id')
      if (error) throw error
      return Array.isArray(data) && data.length === 1
    },

    async countUnused(userId) {
      const { count, error } = await client
        .from('mfa_recovery_codes')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('used_at', null)
      if (error) throw error
      return count ?? 0
    },

    async deleteForUser(userId) {
      const { error } = await client.from('mfa_recovery_codes').delete().eq('user_id', userId)
      if (error) throw error
    }
  }
}
