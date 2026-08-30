import type { SupabaseClient } from '@supabase/supabase-js'
import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { createEventCourtRepository } from '~/server/domains/event/repositories/event-court.repository'
import { createEventQueueRepository } from '~/server/domains/event/repositories/event-queue.repository'
import { toEventCourtDto } from '~/server/domains/event/dto/event.dto'
import type {
  CourtSideDto,
  EventCourtDto,
  EventQueueRecord
} from '~/server/domains/event/dto/event.dto'
import { apiError } from '~/server/utils/api-error'

/**
 * The court board: who is on each court, the live score, and who is up next.
 *
 * This is the endpoint the live view polls every 30 seconds, so it is
 * deliberately one round trip per collection rather than per court - a
 * six-court session polled by thirty spectators would otherwise be a very
 * expensive way to display six numbers.
 *
 * Read with the user client so the event_courts RLS policy (041) decides who
 * can see a session's board; the service-role client is used only to resolve
 * player names, which are needed regardless of the viewer's own visibility.
 */
export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw apiError(400, 'VALIDATION_ERROR', 'eventId is required.')
  }

  const userClient = await serverSupabaseClient(event)

  let courts
  try {
    courts = await createEventCourtRepository(userClient).listByEvent(eventId)
  } catch (err) {
    console.error(`[GET /api/v1/events/${eventId}/courts] failed:`, err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load the courts.')
  }

  if (courts.length === 0) {
    // Not an error: an event that has not been started yet has no courts.
    return { data: [], request_id: crypto.randomUUID() }
  }

  const serviceClient = serverSupabaseServiceRole(event)
  const queueEntries = await createEventQueueRepository(serviceClient).findByEvent(eventId)
  const byQueueId = new Map(queueEntries.map((entry) => [entry.id, entry]))

  const names = await resolvePlayerNames(serviceClient, queueEntries)

  /** A queue entry as a court side: one player for singles, two for doubles. */
  function toSide(queueId: string | null): CourtSideDto | null {
    if (!queueId) return null
    const entry = byQueueId.get(queueId)
    if (!entry) return null

    const ids = [entry.player_id, entry.partner_id].filter((id): id is string => !!id)
    return {
      queue_id: entry.id,
      players: ids.map((id) => names.get(id) ?? { id, display_name: 'Unknown', rating: null })
    }
  }

  // Everyone still waiting, oldest first — the queue is first-come, so this is
  // the honest answer to "who is next on this court".
  const waiting = queueEntries
    .filter((entry) => entry.status === 'waiting')
    .sort((a, b) => a.joined_at.localeCompare(b.joined_at))

  const dtos: EventCourtDto[] = courts.map((court, index) => {
    const dto = toEventCourtDto(court)
    dto.team1 = toSide(court.team1_queue_id)
    dto.team2 = toSide(court.team2_queue_id)

    // Deal the waiting list round-robin across the courts rather than showing
    // the same two names under every court, which would tell nobody anything
    // about where they are actually going to play.
    dto.up_next = waiting
      .filter((_, i) => i % courts.length === index)
      .slice(0, 2)
      .map((entry) => toSide(entry.id))
      .filter((side): side is CourtSideDto => side !== null)

    return dto
  })

  return { data: dtos, request_id: crypto.randomUUID() }
})

async function resolvePlayerNames(
  client: SupabaseClient,
  entries: EventQueueRecord[]
): Promise<Map<string, { id: string; display_name: string; rating: number | null }>> {
  const ids = [
    ...new Set(
      entries.flatMap((e) => [e.player_id, e.partner_id]).filter((id): id is string => !!id)
    )
  ]

  const names = new Map<string, { id: string; display_name: string; rating: number | null }>()
  if (ids.length === 0) return names

  const { data } = await client
    .from('player_profiles')
    .select('id, display_name, player_ratings(rating_type, rating_value)')
    .in('id', ids)

  interface Row {
    id: string
    display_name: string | null
    player_ratings?: { rating_type: string; rating_value: number | null }[] | null
  }

  for (const row of (data ?? []) as unknown as Row[]) {
    names.set(row.id, {
      id: row.id,
      display_name: row.display_name ?? 'Unknown',
      rating: row.player_ratings?.find((r) => r.rating_type === 'doubles')?.rating_value ?? null
    })
  }

  return names
}
