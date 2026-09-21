import { serverSupabaseServiceRole } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createTournamentPlacementRepository } from '~/server/domains/achievement/repositories/tournament-placement.repository'
import type { TournamentHistoryDto } from '~/server/domains/player/dto/tournament-history.dto'
import { apiError } from '~/server/utils/api-error'

/**
 * Every tournament this player has entered, most recent first, with placements
 * for finals they reached.
 *
 * Public like the profile it decorates. Service role because registration and
 * bracket rows have RLS for participants, not for any reader.
 */
export default defineEventHandler(async (event) => {
  const playerId = getRouterParam(event, 'playerId')
  if (!playerId) {
    throw apiError(400, 'INVALID_INPUT', 'Player ID required.')
  }

  const client = serverSupabaseServiceRole(event)

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findById(playerId)

  if (!profile) {
    throw apiError(404, 'NOT_FOUND', 'Player not found.')
  }

  if (profile.profile_visibility !== 'public') {
    throw apiError(403, 'FORBIDDEN', 'Profile is private.')
  }

  const { data: registrations, error: regError } = await client
    .from('tournament_registrations')
    .select(
      `id, tournament_id, category_id, registered_at,
       tournaments!inner(id, name, event_id, start_date, events(id, name)),
       tournament_categories(id, name)`
    )
    .or(`player_id.eq.${playerId},partner_player_id.eq.${playerId}`)
    .order('registered_at', { ascending: false })

  if (regError) {
    console.error(`[GET /api/v1/players/${playerId}/tournaments] registration query failed:`, regError)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load tournament history.')
  }

  type RegRow = {
    id: string
    tournament_id: string
    category_id: string | null
    registered_at: string
    tournaments: {
      id: string
      name: string | null
      event_id: string | null
      start_date: string | null
      events: { id: string; name: string | null } | null
    }
    tournament_categories: { id: string; name: string | null } | null
  }

  const rows = (registrations ?? []) as unknown as RegRow[]

  const placementRepo = createTournamentPlacementRepository(client)
  const placements = await placementRepo.findByRegistrations(
    rows.map((r) => ({ id: r.id, tournament_id: r.tournament_id }))
  )

  const placementMap = new Map(
    placements.map((p) => [`${p.tournament_id}::${p.category_id ?? ''}`, p.placement])
  )

  const history: TournamentHistoryDto[] = rows.map((r) => {
    const key = `${r.tournament_id}::${r.category_id ?? ''}`
    const eventId = r.tournaments.event_id
    return {
      registration_id: r.id,
      tournament_id: r.tournament_id,
      tournament_name: r.tournaments.name,
      category_id: r.category_id,
      category_name: r.tournament_categories?.name ?? null,
      event_id: eventId,
      event_name: r.tournaments.events?.name ?? null,
      played_at: r.tournaments.start_date,
      placement: placementMap.get(key) ?? null,
      href: eventId ? `/events/${eventId}` : null
    }
  })

  return { data: history }
})
