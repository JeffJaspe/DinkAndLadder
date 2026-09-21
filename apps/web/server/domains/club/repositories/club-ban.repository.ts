import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClubBannedPlayerRecord, ClubBannedPlayerDto } from '../dto/club-ban.dto'

const BAN_COLUMNS = 'id, club_id, player_id, banned_by, reason, banned_at'

export interface CreateBanInput {
  club_id: string
  player_id: string
  banned_by: string
  reason?: string | null
}

export interface ClubBanRepository {
  findByClubAndPlayer(clubId: string, playerId: string): Promise<ClubBannedPlayerRecord | null>
  isPlayerBanned(clubId: string, playerId: string): Promise<boolean>
  listByClub(clubId: string): Promise<ClubBannedPlayerDto[]>
  create(input: CreateBanInput): Promise<ClubBannedPlayerRecord>
  deleteByClubAndPlayer(clubId: string, playerId: string): Promise<void>
}

export function createClubBanRepository(client: SupabaseClient): ClubBanRepository {
  return {
    async findByClubAndPlayer(clubId, playerId) {
      const { data, error } = await client
        .from('club_banned_players')
        .select(BAN_COLUMNS)
        .eq('club_id', clubId)
        .eq('player_id', playerId)
        .maybeSingle()

      if (error) throw error
      return data as unknown as ClubBannedPlayerRecord | null
    },

    async isPlayerBanned(clubId, playerId) {
      const { count, error } = await client
        .from('club_banned_players')
        .select('id', { count: 'exact', head: true })
        .eq('club_id', clubId)
        .eq('player_id', playerId)

      if (error) throw error
      return (count ?? 0) > 0
    },

    async listByClub(clubId) {
      const { data, error } = await client
        .from('club_banned_players')
        .select(
          `${BAN_COLUMNS},
           player:player_profiles!fk_club_banned_players_player ( display_name ),
           banner:player_profiles!fk_club_banned_players_banned_by ( display_name )`
        )
        .eq('club_id', clubId)
        .order('banned_at', { ascending: false })

      if (error) throw error

      interface JoinedRow extends ClubBannedPlayerRecord {
        player?: { display_name: string } | null
        banner?: { display_name: string } | null
      }

      return ((data ?? []) as unknown as JoinedRow[]).map((row) => ({
        id: row.id,
        club_id: row.club_id,
        player_id: row.player_id,
        player_name: row.player?.display_name ?? 'Unknown',
        banned_by: row.banned_by,
        banned_by_name: row.banner?.display_name ?? 'Unknown',
        reason: row.reason,
        banned_at: row.banned_at
      }))
    },

    async create(input) {
      const { data, error } = await client
        .from('club_banned_players')
        .insert({
          club_id: input.club_id,
          player_id: input.player_id,
          banned_by: input.banned_by,
          reason: input.reason ?? null
        })
        .select(BAN_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as ClubBannedPlayerRecord
    },

    async deleteByClubAndPlayer(clubId, playerId) {
      const { error } = await client
        .from('club_banned_players')
        .delete()
        .eq('club_id', clubId)
        .eq('player_id', playerId)

      if (error) throw error
    }
  }
}
