import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CreateTournamentInput,
  RegistrationStatus,
  TournamentRecord,
  TournamentRegistrationRecord,
  TournamentStatus,
  UpdateTournamentInput
} from '../dto/tournament.dto'
import { SLOT_HOLDING_REGISTRATION_STATUSES } from '../dto/tournament.dto'

const TOURNAMENT_COLUMNS =
  'id, event_id, name, format, match_type, min_rating, max_rating, max_participants, status, ' +
  'bracket_locked_at, bracket_locked_by_player_id, created_at, updated_at'

const REGISTRATION_COLUMNS =
  'id, tournament_id, player_id, partner_player_id, status, registered_at, confirmed_at, created_at, category_id'

export interface TournamentRepository {
  findById(tournamentId: string): Promise<TournamentRecord | null>
  findByEventId(eventId: string): Promise<TournamentRecord[]>
  create(input: CreateTournamentInput): Promise<TournamentRecord>
  update(tournamentId: string, input: UpdateTournamentInput): Promise<TournamentRecord>
  updateStatus(tournamentId: string, status: TournamentStatus): Promise<TournamentRecord>
  /** The category-less draw's lock. Mirrors the category repository's. */
  setBracketLock(tournamentId: string, playerId: string | null): Promise<TournamentRecord>
}

/**
 * Who is already in a category, and how they got there.
 *
 * A doubles entry is one row carrying two people, so "is this player in this
 * category" cannot be answered by looking at `player_id` alone — the partner
 * occupies a slot just as much as the registrant does. Both columns are folded
 * into one lookup so callers cannot check one and forget the other.
 */
export interface CategoryEntrant {
  registration_id: string
  player_id: string
  /** True when this player holds their slot as somebody else's partner. */
  as_partner: boolean
  /** The other half of the entry, for a message that says where to look. */
  paired_with_player_id: string | null
}

export interface TournamentRegistrationRepository {
  findById(registrationId: string): Promise<TournamentRegistrationRecord | null>
  /**
   * Every player occupying a slot in one category — registrants and partners
   * alike — excluding withdrawn entries, which release their place.
   *
   * `categoryId` of `null` means the tournament's flat, category-less draw, and
   * is a distinct scope from any real category. Replaces the old
   * `findByTournamentAndPlayer`, which was tournament-wide (so it wrongly
   * blocked entering a second category) and read `player_id` only (so it never
   * saw a partner at all).
   */
  findCategoryEntrants(tournamentId: string, categoryId: string | null): Promise<CategoryEntrant[]>
  findByTournamentId(tournamentId: string): Promise<TournamentRegistrationRecord[]>
  /**
   * Same rows, with each player's (and partner's) display name and BOTH ratings
   * joined in. Separate from findByTournamentId so the bracket generator keeps
   * its cheap id-only read.
   *
   * Both ratings, not one: which of them applies is a property of the CATEGORY
   * the row belongs to, and a repository has no business resolving that. This
   * used to hand back the singles rating unconditionally, so a doubles draw was
   * seeded — and labelled — by everyone's singles form. `resolveEntrantRating`
   * in the DTO picks the right one once the match type is known.
   */
  findByTournamentIdWithPlayers(tournamentId: string): Promise<
    Array<
      TournamentRegistrationRecord & {
        display_name: string
        singles_rating: number | null
        doubles_rating: number | null
        partner_display_name: string | null
      }
    >
  >
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
    },

    async setBracketLock(tournamentId, playerId) {
      const { data, error } = await client
        .from('tournaments')
        .update({
          bracket_locked_at: playerId ? new Date().toISOString() : null,
          bracket_locked_by_player_id: playerId,
          updated_at: new Date().toISOString()
        })
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

    async findCategoryEntrants(tournamentId, categoryId) {
      let query = client
        .from('tournament_registrations')
        .select('id, player_id, partner_player_id')
        .eq('tournament_id', tournamentId)
        // Withdrawn AND rejected both release the slot. Excluding only
        // `withdrawn` would leave a turned-away entry blocking its own players
        // from ever re-entering, and would stop an organiser rejecting one half
        // of a duplicate pair.
        .in('status', SLOT_HOLDING_REGISTRATION_STATUSES)

      // `.is(null)` and `.eq(id)` are different scopes on purpose: the flat draw
      // of a category-less tournament must not collide with a real category.
      query =
        categoryId === null ? query.is('category_id', null) : query.eq('category_id', categoryId)

      const { data, error } = await query
      if (error) throw error

      const rows = (data ?? []) as unknown as Array<{
        id: string
        player_id: string
        partner_player_id: string | null
      }>

      // One row yields one or two entrants — the registrant, and the partner if
      // there is one. Flattening here is what lets the service ask a single
      // "is this person in?" question regardless of which side they are on.
      return rows.flatMap((row) => {
        const entrants: CategoryEntrant[] = [
          {
            registration_id: row.id,
            player_id: row.player_id,
            as_partner: false,
            paired_with_player_id: row.partner_player_id
          }
        ]
        if (row.partner_player_id) {
          entrants.push({
            registration_id: row.id,
            player_id: row.partner_player_id,
            as_partner: true,
            paired_with_player_id: row.player_id
          })
        }
        return entrants
      })
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
        singles_rating:
          player?.player_ratings?.find((r) => r.rating_type === 'singles')?.rating_value ?? null,
        doubles_rating:
          player?.player_ratings?.find((r) => r.rating_type === 'doubles')?.rating_value ?? null,
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
