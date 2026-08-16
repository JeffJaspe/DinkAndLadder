import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuditLogInput, AuditLogRecord } from '../dto/audit.dto'

export interface AuditRepository {
  create(input: AuditLogInput): Promise<AuditLogRecord>
}

export function createAuditRepository(client: SupabaseClient): AuditRepository {
  return {
    async create(input) {
      const { data, error } = await client
        .from('audit_logs')
        .insert({
          event_type: input.event_type,
          actor_user_id: input.actor_user_id,
          actor_player_id: input.actor_player_id,
          target_type: input.target_type,
          target_id: input.target_id,
          payload: input.payload ?? null,
          ip_address: input.ip_address ?? null,
          user_agent: input.user_agent ?? null
        })
        .select()
        .single()

      if (error) throw error
      return data as AuditLogRecord
    }
  }
}
