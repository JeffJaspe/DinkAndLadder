import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'

export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to view your upcoming events.')
  }

  const client = await serverSupabaseClient(event)
  const playerProfile = await createPlayerProfileRepository(client).findByUserId(claims.sub)
  if (!playerProfile) {
    throw apiError(409, 'PLAYER_PROFILE_REQUIRED', 'Complete your player profile first.')
  }

  const today = new Date().toISOString().slice(0, 10)

  const { data, error } = await client
    .from('event_registrations')
    .select(`
      status,
      events!inner (
        id,
        name,
        event_type,
        venue,
        city,
        start_date,
        end_date,
        status
      )
    `)
    .eq('player_id', playerProfile.id)
    .neq('status', 'withdrawn')
    .gte('events.end_date', today)
    .in('events.status', ['published', 'active'])
    .order('start_date', { referencedTable: 'events', ascending: true })

  if (error) {
    console.error('[GET /api/v1/players/me/upcoming-events] failed:', error)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load your upcoming events.')
  }

  interface RegistrationEventRow {
    status: string
    events?: Record<string, unknown> | null
  }

  const mapped = ((data ?? []) as unknown as RegistrationEventRow[])
    .filter((r) => r.events)
    .map((r) => ({
      event: r.events,
      registration_status: r.status
    }))

  return { data: mapped, request_id: crypto.randomUUID() }
})
