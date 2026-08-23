import {
  serverSupabaseClient,
  serverSupabaseUser
} from '#supabase/server'
import { apiError } from '~/server/utils/api-error'
import {
  singlesRatingOf,
  type PlayerProfileJoinRow
} from '~/server/domains/player/dto/player-join-row.dto'

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw apiError(400, 'VALIDATION_ERROR', 'Event ID is required.')
  }

  const userClient = await serverSupabaseClient(event)
  const _claims = await serverSupabaseUser(event)

  const { data: eventData, error: eventError } = await userClient
    .from('events')
    .select('id, visibility, status')
    .eq('id', eventId)
    .single()

  if (eventError || !eventData) {
    throw apiError(404, 'NOT_FOUND', 'Event not found.')
  }

  const { data: registrations, error: regError } = await userClient
    .from('event_registrations')
    .select(`
      id,
      event_id,
      player_id,
      status,
      registered_at,
      checked_in_at,
      player_profiles!inner (
        id,
        display_name,
        player_ratings (
          rating_type,
          rating_value
        )
      )
    `)
    .eq('event_id', eventId)
    .in('status', ['registered', 'checked_in'])
    .order('registered_at', { ascending: true })

  if (regError) {
    console.error('[GET /api/v1/events/:eventId/registrations] failed:', regError)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load registrations.')
  }

  interface RegistrationJoinRow {
    id: string
    event_id: string
    player_id: string
    status: string
    registered_at: string
    checked_in_at: string | null
    player_profiles?: PlayerProfileJoinRow | null
  }

  const mapped = ((registrations ?? []) as unknown as RegistrationJoinRow[]).map((r) => {
    const profile = r.player_profiles
    const singlesRating = singlesRatingOf(profile)

    return {
      id: r.id,
      event_id: r.event_id,
      player_id: r.player_id,
      status: r.status,
      registered_at: r.registered_at,
      checked_in_at: r.checked_in_at,
      player: {
        id: profile?.id,
        display_name: profile?.display_name,
        rating: singlesRating ?? null
      }
    }
  })

  return {
    data: mapped,
    request_id: crypto.randomUUID()
  }
})
