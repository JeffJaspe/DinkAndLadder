import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CreateTournamentInput,
  RegistrationStatus,
  TournamentRecord,
  TournamentRegistrationRecord,
  TournamentStatus,
  UpdateTournamentInput
} from '../dto/tournament.dto'

const TOURNAMENT_COLUMNS =
  'id, event_id, name, format, match_type, min_rating, max_rating, max_participants, status, created_at, updated_at'

const REGISTRATION_COLUMNS =
  'id, tournament_id, player_id, partner_player_id, status, registered_at, confirmed_at, created_at, category_id'

export interface TournamentRepository {
  findById(tournamentId: string): Promise<TournamentRecord | null>
  findByEventId(eventId: string): Promise<TournamentRecord[]>
  create(input: CreateTournamentInput): Promise<TournamentRecord>
  update(tournamentId: string, input: UpdateTournamentInput): Promise<TournamentRecord>
  updateStatus(tournamentId: string, status: TournamentStatus): Promise<TournamentRecord>
}

export interface TournamentRegistrationRepository {
  findById(registrationId: string): Promise<TournamentRegistrationRecord | null>
  findByTournamentAndPlayer(
    tournamentId: string,
    playerId: string
  ): Promise<TournamentRegistrationRecord | null>
  findByTournamentId(tournamentId: string): Promise<TournamentRegistrationRecord[]>
  /**
   * Same rows, with each player's (and partner's) display name and singles
   * rating joined in. Separate from findByTournamentId so the bracket generator
   * keeps its cheap id-only read.
   */
  findByTournamentIdWithPlayers(
    tournamentId: string
  ): Promise<Array<TournamentRegistrationRecord & {
    display_name: string
    rating: number | null
    partner_display_name: string | null
  }>>
  create(
    tournamentId: string,
    playerId: string,
    partnerPlayerId: string | null,
    categoryId?: string | null
  ): Promise<TournamentRegistrationRecord>
  updateStatus(
    registrationId: string,
    status: RegistrationStatus
  ): Promise<TournamentRegistrationRecord>
  countByTournament(tournamentId: string): Promise<number>
}

export function createTournamentRepository(client: SupabaseClient): TournamentRepository {
  return {
    async findById(tournamentId) {
      const { data, error } = await client
        .from('tournaments')
        .select(TOURNAMENT_COLUMNS)
        .eq('id', tournamentId)
        .maybeSingle()

      if (error) throw error
      return data as unknown as TournamentRecord | null
    },

    async findByEventId(eventId) {
      const { data, error } = await client
        .from('tournaments')
        .select(TOURNAMENT_COLUMNS)
        .eq('event_id', eventId)
        .order('name', { ascending: true })

      if (error) throw error
      return (data ?? []) as unknown as TournamentRecord[]
    },

    async create(input) {
      const { data, error } = await client
        .from('tournaments')
        .insert({
          event_id: input.event_id,
          name: input.name,
          format: input.format ?? 'single_elimination',
          match_type: input.match_type,
          min_rating: input.min_rating ?? null,
          max_rating: input.max_rating ?? null,
          max_participants: input.max_participants ?? null,
          status: 'draft'
        })
        .select(TOURNAMENT_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as TournamentRecord
    },

    async update(tournamentId, input) {
      const { data, error } = await client
        .from('tournaments')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', tournamentId)
        .select(TOURNAMENT_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as TournamentRecord
    },

    async updateStatus(tournamentId, status) {
      const { data, error } = await client
        .from('tournaments')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', tournamentId)
        .select(TOURNAMENT_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as TournamentRecord
    }
  }
}

export function createTournamentRegistrationRepository(
  client: SupabaseClient
): TournamentRegistrationRepository {
  return {
    async findById(registrationId) {
      const { data, error } = await client
        .from('tournament_registrations')
        .select(REGISTRATION_COLUMNS)
        .eq('id', registrationId)
        .maybeSingle()

      if (error) throw error
      return data as unknown as TournamentRegistrationRecord | null
    },

    async findByTournamentAndPlayer(tournamentId, playerId) {
      const { data, error } = await client
        .from('tournament_registrations')
        .select(REGISTRATION_COLUMNS)
        .eq('tournament_id', tournamentId)
        .eq('player_id', playerId)
        .not('status', 'eq', 'withdrawn')
        .maybeSingle()

      if (error) throw error
      return data as unknown as TournamentRegistrationRecord | null
    },

    async findByTournamentId(tournamentId) {
      const { data, error } = await client
        .from('tournament_registrations')
        .select(REGISTRATION_COLUMNS)
        .eq('tournament_id', tournamentId)
        .not('status', 'eq', 'withdrawn')
        .order('registered_at', { ascending: true })

      if (error) throw error
      return (data ?? []) as unknown as TournamentRegistrationRecord[]
    },

    async findByTournamentIdWithPlayers(tournamentId) {
      // Two embeds off the same table need disambiguating by FK name, hence the
      // `player:player_profiles!...` aliases. The partner embed is a left join —
      // singles registrations have no partner.
      const { data, error } = await client
        .from('tournament_registrations')
        .select(
          `${REGISTRATION_COLUMNS},
           player:player_profiles!fk_tournament_registrations_player (
             id, display_name, player_ratings ( rating_type, rating_value )
           ),
           partner:player_profiles!fk_tournament_registrations_partner (
             id, display_name
           )`
        )
        .eq('tournament_id', tournamentId)
        .not('status', 'eq', 'withdrawn')
        .order('registered_at', { ascending: true })

      if (error) throw error

      interface JoinedRow extends TournamentRegistrationRecord {
        player?: {
          display_name?: string | null
          player_ratings?: Array<{ rating_type: string; rating_value: number | null }> | null
        } | null
        partner?: { display_name?: string | null } | null
      }

      return ((data ?? []) as unknown as JoinedRow[]).map(({ player, partner, ...row }) => ({
        ...row,
        display_name: player?.display_name ?? 'Unknown player',
        rating:
          player?.player_ratings?.find((r) => r.rating_type === 'singles')?.rating_value ?? null,
        partner_display_name: partner?.display_name ?? null
      }))
    },

    async create(tournamentId, playerId, partnerPlayerId, categoryId) {
      const { data, error } = await client
        .from('tournament_registrations')
        .insert({
          tournament_id: tournamentId,
          player_id: playerId,
          partner_player_id: partnerPlayerId,
          category_id: categoryId ?? null,
          status: 'pending'
        })
        .select(REGISTRATION_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as TournamentRegistrationRecord
    },

    async updateStatus(registrationId, status) {
      const updateData: Record<string, unknown> = { status }
      if (status === 'confirmed') {
        updateData.confirmed_at = new Date().toISOString()
      }

      const { data, error } = await client
        .from('tournament_registrations')
        .update(updateData)
        .eq('id', registrationId)
        .select(REGISTRATION_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as TournamentRegistrationRecord
    },

    async countByTournament(tournamentId) {
      const { count, error } = await client
        .from('tournament_registrations')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId)
        .in('status', ['pending', 'confirmed'])

      if (error) throw error
      return count ?? 0
    }
  }
}
