import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ClubMembershipRecord,
  ClubMembershipStatus,
  ClubRole
} from '../dto/club-membership.dto'
import type { ClubRecord } from '../dto/club.dto'

const MEMBERSHIP_COLUMNS = 'id, club_id, player_id, role, status, joined_at, left_at, created_at'

export interface CreateMembershipInput {
  club_id: string
  player_id: string
  role: ClubRole
  status: ClubMembershipStatus
  joined_at?: string | null
}

export interface UpdateMembershipRecordInput {
  role?: ClubRole
  status?: ClubMembershipStatus
  joined_at?: string | null
  left_at?: string | null
}

export interface RosterRow extends ClubMembershipRecord {
  display_name: string
}

interface RosterQueryRow extends ClubMembershipRecord {
  player_profiles: { display_name: string } | null
}

export interface OwnMembershipWithClub extends ClubMembershipRecord {
  club: ClubRecord
}

interface OwnMembershipQueryRow extends ClubMembershipRecord {
  clubs: ClubRecord | null
}

export interface ClubMembershipRepository {
  /** The current live (pending or active) row for this club/player pair, if any. */
  findByClubAndPlayer(clubId: string, playerId: string): Promise<ClubMembershipRecord | null>
  findById(membershipId: string): Promise<ClubMembershipRecord | null>
  create(input: CreateMembershipInput): Promise<ClubMembershipRecord>
  updateById(
    membershipId: string,
    patch: UpdateMembershipRecordInput
  ): Promise<ClubMembershipRecord>
  listByClub(clubId: string): Promise<RosterRow[]>
  /** Every live (pending or active) membership for this player, with its club joined in. */
  listOwnWithClub(playerId: string): Promise<OwnMembershipWithClub[]>
}

export function createClubMembershipRepository(client: SupabaseClient): ClubMembershipRepository {
  return {
    async findByClubAndPlayer(clubId, playerId) {
      const { data, error } = await client
        .from('club_memberships')
        .select(MEMBERSHIP_COLUMNS)
        .eq('club_id', clubId)
        .eq('player_id', playerId)
        .in('status', ['pending', 'active'])
        .maybeSingle()

      if (error) throw error
      return data as unknown as ClubMembershipRecord | null
    },

    async findById(membershipId) {
      const { data, error } = await client
        .from('club_memberships')
        .select(MEMBERSHIP_COLUMNS)
        .eq('id', membershipId)
        .maybeSingle()

      if (error) throw error
      return data as unknown as ClubMembershipRecord | null
    },

    async create(input) {
      const { data, error } = await client
        .from('club_memberships')
        .insert(input)
        .select(MEMBERSHIP_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as ClubMembershipRecord
    },

    async updateById(membershipId, patch) {
      const { data, error } = await client
        .from('club_memberships')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', membershipId)
        .select(MEMBERSHIP_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as ClubMembershipRecord
    },

    async listByClub(clubId) {
      const { data, error } = await client
        .from('club_memberships')
        .select(`${MEMBERSHIP_COLUMNS}, player_profiles(display_name)`)
        .eq('club_id', clubId)
        .order('created_at', { ascending: true })

      if (error) throw error
      return ((data ?? []) as unknown as RosterQueryRow[]).map((row) => ({
        ...row,
        display_name: row.player_profiles?.display_name ?? 'Unknown player'
      }))
    },

    async listOwnWithClub(playerId) {
      const { data, error } = await client
        .from('club_memberships')
        .select(`${MEMBERSHIP_COLUMNS}, clubs(*)`)
        .eq('player_id', playerId)
        .in('status', ['pending', 'active'])
        .order('created_at', { ascending: true })

      if (error) throw error
      return ((data ?? []) as unknown as OwnMembershipQueryRow[])
        .filter((row) => row.clubs !== null)
        .map((row) => ({ ...row, club: row.clubs as ClubRecord }))
    }
  }
}
