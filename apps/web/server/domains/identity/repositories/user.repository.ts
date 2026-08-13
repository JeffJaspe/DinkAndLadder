import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserRecord } from '../dto/user.dto'

const USER_COLUMNS = 'id, email, status, email_verified_at, last_login_at, created_at'

export interface AuthIdentity {
  id: string
  email: string
}

export interface UserRepository {
  findByAuthId(authId: string): Promise<UserRecord | null>
  upsertFromAuthIdentity(identity: AuthIdentity): Promise<UserRecord>
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
    }
  }
}
