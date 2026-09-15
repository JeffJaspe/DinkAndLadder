import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserRecord } from '../dto/user.dto'

const USER_COLUMNS =
  'id, email, status, email_verified_at, last_login_at, mfa_enrolled_at, created_at'

export interface AuthIdentity {
  id: string
  email: string
}

export interface UserRepository {
  findByAuthId(authId: string): Promise<UserRecord | null>
  /** Case-insensitive; addresses are stored as Supabase reports them. */
  findByEmail(email: string): Promise<UserRecord | null>
  upsertFromAuthIdentity(identity: AuthIdentity): Promise<UserRecord>
  /** Null clears it — the account no longer has a verified factor. */
  setMfaEnrolledAt(userId: string, at: string | null): Promise<void>
}

export function createUserRepository(client: SupabaseClient): UserRepository {
  return {
    async findByAuthId(authId) {
      const { data, error } = await client
        .from('users')
        .select(USER_COLUMNS)
        .eq('id', authId)
        .maybeSingle()

      if (error) throw error
      return data as UserRecord | null
    },

    async findByEmail(email) {
      const { data, error } = await client
        .from('users')
        .select(USER_COLUMNS)
        .ilike('email', email.trim())
        .maybeSingle()

      if (error) throw error
      return data as UserRecord | null
    },

    async upsertFromAuthIdentity(identity) {
      const { data, error } = await client
        .from('users')
        .upsert(
          { id: identity.id, email: identity.email, last_login_at: new Date().toISOString() },
          { onConflict: 'id' }
        )
        .select(USER_COLUMNS)
        .single()

      if (error) throw error
      return data as UserRecord
    },

    async setMfaEnrolledAt(userId, at) {
      const { error } = await client.from('users').update({ mfa_enrolled_at: at }).eq('id', userId)
      if (error) throw error
    }
  }
}
