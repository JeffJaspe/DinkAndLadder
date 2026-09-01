import { serverSupabaseClient } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'

export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to view your upcoming events.')
  }

  const client = await serverSupabaseClient(event)
  const playerProfile = await createPlayerProfileRepository(client).findByUserId(claims.sub)
  if (!playerProfile) {
    throw apiError(409, 'PLAYER_PROFILE_REQUIRED', 'Complete your player profile first.')
  }

  const rawQuery = getQuery(event)
  const limit = Math.min(parseInt(rawQuery.limit as string) || 5, 50)
  const offset = Math.max(parseInt(rawQuery.offset as string) || 0, 0)

  const today = new Date().toISOString().slice(0, 10)

  const { data, error } = await client
    .from('event_registrations')
    .select(
      `
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
    `
    )
    .eq('player_id', playerProfile.id)
    .neq('status', 'withdrawn')
    .gte('events.end_date', today)
    .in('events.status', ['published', 'active'])

  if (error) {
    console.error('[GET /api/v1/players/me/upcoming-events] failed:', error)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load your upcoming events.')
  }

  interface RegistrationEventRow {
    status: string
    events?: Record<string, unknown> | null
  }

  /**
   * Sorted and paged here rather than in the query.
   *
   * `.order(..., { referencedTable: 'events' })` orders rows *within* each
   * embedded resource, not the registrations themselves — with one event per
   * registration it does nothing at all, which is why this list arrived in no
   * particular order. PostgREST cannot order a parent by an embedded column, so
   * the sort happens on the way out. A player's own live registrations are a
   * bounded set (the `end_date >= today` filter has already run), so paging in
   * memory here is honest rather than a scan of the table.
   */
  const sorted = ((data ?? []) as unknown as RegistrationEventRow[])
    .filter((r) => r.events)
    .map((r) => ({
      event: r.events as Record<string, unknown>,
      registration_status: r.status
    }))
    .sort((a, b) =>
      String(a.event.start_date ?? '').localeCompare(String(b.event.start_date ?? ''))
    )

  return {
    data: sorted.slice(offset, offset + limit),
    total: sorted.length,
    has_more: offset + limit < sorted.length,
    request_id: crypto.randomUUID()
  }
})
