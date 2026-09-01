import type { SupabaseClient } from '@supabase/supabase-js'
import type { TeamMemberDto, TeamUpRecord, TeamUpStatus } from '../dto/team-up.dto'

const TEAM_UP_COLUMNS =
  'id, owner_player_id, member_player_id, status, message, responded_at, created_at'

export interface TeamUpRepository {
  findById(id: string): Promise<TeamUpRecord | null>
  /** One row for this exact direction. The reverse is a separate row. */
  findBetween(ownerPlayerId: string, memberPlayerId: string): Promise<TeamUpRecord | null>
  /** The owner's roster, with each member resolved for display. */
  listTeam(ownerPlayerId: string, status?: TeamUpStatus): Promise<TeamMemberDto[]>
  /** Rosters this player has been asked to join. */
  listIncoming(memberPlayerId: string): Promise<TeamMemberDto[]>
  /**
   * Just the number of pending invitations, for the badge.
   *
   * Separate from `listIncoming` for the same reason the duo request count is
   * separate from its list: the sidebar asks on every page, and `listIncoming`
   * embeds each sender's profile and ratings — work a number has no use for.
   */
  countIncoming(memberPlayerId: string): Promise<number>
  create(ownerPlayerId: string, memberPlayerId: string, message?: string): Promise<TeamUpRecord>
  updateStatus(id: string, status: TeamUpStatus): Promise<TeamUpRecord>
  remove(id: string): Promise<void>
  /** Whether the owner may register this member — the only question that gates anything. */
  isAcceptedMember(ownerPlayerId: string, memberPlayerId: string): Promise<boolean>
}

/** The joined shape PostgREST returns for either embed direction. */
interface JoinedRow extends TeamUpRecord {
  owner?: PlayerEmbed | null
  member?: PlayerEmbed | null
}

interface PlayerEmbed {
  id: string
  display_name: string | null
  province: string | null
  city: string | null
  player_ratings?: Array<{ rating_type: string; rating_value: number | null }> | null
}

function toMember(row: JoinedRow, side: 'owner' | 'member'): TeamMemberDto {
  const player = row[side] ?? null
  const ratings = player?.player_ratings ?? []
  return {
    id: row.id,
    player_id: side === 'member' ? row.member_player_id : row.owner_player_id,
    display_name: player?.display_name ?? 'Unknown player',
    province: player?.province ?? null,
    city: player?.city ?? null,
    singles_rating: ratings.find((r) => r.rating_type === 'singles')?.rating_value ?? null,
    doubles_rating: ratings.find((r) => r.rating_type === 'doubles')?.rating_value ?? null,
    status: row.status,
    created_at: row.created_at
  }
}

const PLAYER_EMBED =
  'id, display_name, province, city, player_ratings ( rating_type, rating_value )'

export function createTeamUpRepository(client: SupabaseClient): TeamUpRepository {
  return {
    async findById(id) {
      const { data, error } = await client
        .from('team_ups')
        .select(TEAM_UP_COLUMNS)
        .eq('id', id)
        .maybeSingle()

      if (error) throw error
      return data as unknown as TeamUpRecord | null
    },

    async findBetween(ownerPlayerId, memberPlayerId) {
      const { data, error } = await client
        .from('team_ups')
        .select(TEAM_UP_COLUMNS)
        .eq('owner_player_id', ownerPlayerId)
        .eq('member_player_id', memberPlayerId)
        .maybeSingle()

      if (error) throw error
      return data as unknown as TeamUpRecord | null
    },

    async listTeam(ownerPlayerId, status) {
      let query = client
        .from('team_ups')
        // Two FKs point at player_profiles, so the embed needs naming.
        .select(`${TEAM_UP_COLUMNS}, member:player_profiles!fk_team_ups_member ( ${PLAYER_EMBED} )`)
        .eq('owner_player_id', ownerPlayerId)
        .order('created_at', { ascending: true })

      if (status) query = query.eq('status', status)

      const { data, error } = await query
      if (error) throw error
      return ((data ?? []) as unknown as JoinedRow[]).map((row) => toMember(row, 'member'))
    },

    async listIncoming(memberPlayerId) {
      const { data, error } = await client
        .from('team_ups')
        .select(`${TEAM_UP_COLUMNS}, owner:player_profiles!fk_team_ups_owner ( ${PLAYER_EMBED} )`)
        .eq('member_player_id', memberPlayerId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })

      if (error) throw error
      return ((data ?? []) as unknown as JoinedRow[]).map((row) => toMember(row, 'owner'))
    },

    async countIncoming(memberPlayerId) {
      const { count, error } = await client
        .from('team_ups')
        .select('id', { count: 'exact', head: true })
        .eq('member_player_id', memberPlayerId)
        .eq('status', 'pending')

      if (error) throw error
      return count ?? 0
    },

    async create(ownerPlayerId, memberPlayerId, message) {
      const { data, error } = await client
        .from('team_ups')
        .insert({
          owner_player_id: ownerPlayerId,
          member_player_id: memberPlayerId,
          message: message ?? null,
          status: 'pending'
        })
        .select(TEAM_UP_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as TeamUpRecord
    },

    async updateStatus(id, status) {
      const { data, error } = await client
        .from('team_ups')
        .update({ status, responded_at: new Date().toISOString() })
        .eq('id', id)
        .select(TEAM_UP_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as TeamUpRecord
    },

    async remove(id) {
      const { error } = await client.from('team_ups').delete().eq('id', id)
      if (error) throw error
    },

    async isAcceptedMember(ownerPlayerId, memberPlayerId) {
      const { count, error } = await client
        .from('team_ups')
        .select('*', { count: 'exact', head: true })
        .eq('owner_player_id', ownerPlayerId)
        .eq('member_player_id', memberPlayerId)
        .eq('status', 'accepted')

      if (error) throw error
      return (count ?? 0) > 0
    }
  }
}
