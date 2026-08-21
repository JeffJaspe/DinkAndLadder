import type { SupabaseClient } from '@supabase/supabase-js'
import type { BadgeShowcaseRecord } from '../dto/badge.dto'

export interface BadgeRepository {
  findByPlayerId(playerId: string): Promise<BadgeShowcaseRecord | null>
  upsert(playerId: string, badgeId: string | null): Promise<BadgeShowcaseRecord>
}

export function createBadgeRepository(supabase: SupabaseClient): BadgeRepository {
  return {
    async findByPlayerId(playerId: string): Promise<BadgeShowcaseRecord | null> {
      const { data, error } = await supabase
        .from('player_badge_showcase')
        .select('*')
        .eq('player_id', playerId)
        .maybeSingle()

      if (error) throw error
      return data
    },

    async upsert(playerId: string, badgeId: string | null): Promise<BadgeShowcaseRecord> {
      const { data, error } = await supabase
        .from('player_badge_showcase')
        .upsert({
          player_id: playerId,
          selected_badge_id: badgeId,
          updated_at: new Date().toISOString()
        }, { onConflict: 'player_id' })
        .select()
        .single()

      if (error) throw error
      return data
    }
  }
}
