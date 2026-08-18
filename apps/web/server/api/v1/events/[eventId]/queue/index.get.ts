import { serverSupabaseClient } from '#supabase/server'
import { apiError } from '~/server/utils/api-error'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw apiError(400, 'VALIDATION_ERROR', 'Event ID is required.')
  }

  const userClient = await serverSupabaseClient(event)

  const { data: rows, error } = await userClient
    .from('event_queue')
    .select(`
      id,
      event_id,
      player_id,
      match_type,
      partner_id,
      joined_at,
      status,
      court_number,
      player:player_profiles!fk_event_queue_player (
        id,
        display_name,
        player_ratings (rating_type, rating_value)
      ),
      partner:player_profiles!fk_event_queue_partner (
        id,
        display_name,
        player_ratings (rating_type, rating_value)
      )
    `)
    .eq('event_id', eventId)
    .in('status', ['waiting', 'matched', 'playing'])
    .order('joined_at', { ascending: true })

  if (error) {
    console.error('[GET /api/v1/events/:eventId/queue] failed:', error)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load the queue.')
  }

  function toPlayerSummary(profile: any) {
    if (!profile) return undefined
    const singlesRating = profile.player_ratings?.find(
      (pr: any) => pr.rating_type === 'singles'
    )?.rating_value
    return { id: profile.id, display_name: profile.display_name, rating: singlesRating ?? null }
  }

  const mapped = (rows ?? []).map((r: any) => ({
    id: r.id,
    event_id: r.event_id,
    player_id: r.player_id,
    match_type: r.match_type,
    partner_id: r.partner_id,
    joined_at: r.joined_at,
    status: r.status,
    court_number: r.court_number,
    player: toPlayerSummary(r.player),
    partner: toPlayerSummary(r.partner)
  }))

  return {
    data: mapped,
    request_id: crypto.randomUUID()
  }
})
