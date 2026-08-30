import type { SupabaseClient } from '@supabase/supabase-js'
import { apiError } from './api-error'

/**
 * Who may run a session: the organiser, or the hosting club's staff.
 *
 * The same rule `EventService.assertCanReviewRegistrations` applies to the
 * registration queue, and for the same reason: tying "who can start a court and
 * enter a score" to one individual means the session stalls the moment that
 * person steps away from the desk. A club night is run by whoever is on the
 * desk, not by whoever happened to create the event a fortnight ago.
 *
 * Lives in server/utils rather than the event service because the court
 * endpoints construct EventCourtService, which has no membership repository of
 * its own and should not grow one just to answer this.
 */
const STAFF_ROLES = ['OWNER', 'ADMIN', 'MODERATOR']

export async function assertCanRunEvent(
  serviceClient: SupabaseClient,
  eventId: string,
  playerId: string
): Promise<{ id: string; status: string; club_id: string | null; queue_courts: number | null }> {
  const { data, error } = await serviceClient
    .from('events')
    .select('id, status, club_id, queue_courts, created_by_player_id')
    .eq('id', eventId)
    .maybeSingle()

  if (error || !data) {
    throw apiError(404, 'NOT_FOUND', 'Event not found.')
  }

  const eventRow = data as {
    id: string
    status: string
    club_id: string | null
    queue_courts: number | null
    created_by_player_id: string | null
  }

  if (eventRow.created_by_player_id === playerId) return eventRow

  if (eventRow.club_id) {
    const { data: membership } = await serviceClient
      .from('club_memberships')
      .select('role, status')
      .eq('club_id', eventRow.club_id)
      .eq('player_id', playerId)
      .eq('status', 'active')
      .maybeSingle()

    const row = membership as { role: string } | null
    if (row && STAFF_ROLES.includes(row.role)) return eventRow
  }

  throw apiError(
    403,
    'FORBIDDEN',
    'Only the organizer or the hosting club’s staff can run this session.'
  )
}

/** A court can only be run while the session is actually happening. */
export function assertEventIsRunning(eventRow: { status: string }): void {
  if (eventRow.status !== 'active') {
    throw apiError(409, 'EVENT_NOT_ACTIVE', 'Start the event before running a court.')
  }
}
