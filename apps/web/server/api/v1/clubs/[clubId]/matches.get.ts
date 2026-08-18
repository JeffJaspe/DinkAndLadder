import {
  serverSupabaseClient,
  serverSupabaseServiceRole,
  serverSupabaseUser
} from '#supabase/server'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { createClubRepository } from '~/server/domains/club/repositories/club.repository'
import { createClubService, ClubServiceError } from '~/server/domains/club/services/club.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'

/**
 * Reuses ClubService.listRoster purely as the "is this caller an active member" gate before
 * looking up matches from this club's events with the service-role client.
 */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to view club matches.')
  }

  const clubId = getRouterParam(event, 'clubId')
  if (!clubId) {
    throw apiError(400, 'VALIDATION_ERROR', 'clubId is required.')
  }

  const limit = Math.min(parseInt(getQuery(event).limit as string) || 10, 50)

  const userClient = await serverSupabaseClient(event)
  const playerProfile = await createPlayerProfileRepository(userClient).findByUserId(claims.sub)
  if (!playerProfile) {
    throw apiError(403, 'FORBIDDEN', 'You have no player profile, so you cannot view this club.')
  }

  const serviceClient = serverSupabaseServiceRole(event)
  const clubService = createClubService(
    createClubRepository(serviceClient),
    createClubMembershipRepository(serviceClient)
  )

  try {
    await clubService.listRoster(playerProfile.id, clubId)
  } catch (err) {
    if (err instanceof ClubServiceError) throw apiError(err.status, err.code, err.message)
    console.error(`[GET /api/v1/clubs/${clubId}/matches] listRoster failed:`, err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load club matches.')
  }

  const { data: eventRows, error: eventError } = await serviceClient
    .from('events')
    .select('id')
    .eq('club_id', clubId)

  if (eventError) {
    console.error(`[GET /api/v1/clubs/${clubId}/matches] failed:`, eventError)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load club matches.')
  }

  const eventIds = (eventRows ?? []).map((r) => r.id)
  if (eventIds.length === 0) {
    return { data: [], request_id: crypto.randomUUID() }
  }

  const { data: matches, error } = await serviceClient
    .from('matches')
    .select(`
      id,
      match_type,
      status,
      played_at,
      match_participants (
        player_id,
        team_number,
        player_profiles!inner (id, display_name)
      ),
      match_scores (set_number, team1_score, team2_score)
    `)
    .in('event_id', eventIds)
    .order('played_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error(`[GET /api/v1/clubs/${clubId}/matches] failed:`, error)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load club matches.')
  }

  const mapped = (matches ?? []).map((m: any) => ({
    id: m.id,
    match_type: m.match_type,
    status: m.status,
    played_at: m.played_at,
    participants: (m.match_participants ?? []).map((p: any) => ({
      player_id: p.player_id,
      team_number: p.team_number,
      display_name: p.player_profiles?.display_name
    })),
    scores: (m.match_scores ?? [])
      .sort((a: any, b: any) => a.set_number - b.set_number)
      .map((s: any) => ({
        set_number: s.set_number,
        team1_score: s.team1_score,
        team2_score: s.team2_score
      }))
  }))

  return { data: mapped, request_id: crypto.randomUUID() }
})
