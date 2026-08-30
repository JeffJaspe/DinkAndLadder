import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Whether a player pays to enter their own club's event.
 *
 * A club owner or admin running a tournament is the organiser, not a customer.
 * Charging them a convenience fee to enter a draw they created is the platform
 * billing someone for using their own event.
 *
 * Computed server-side and returned to the client, rather than worked out in
 * `RegisterSummaryModal`. A price the browser calculates is not a price - it is
 * a suggestion the browser is free to disagree with, and the whole point of
 * `utils/convenience-fee.ts` living in one place is that the quote and the
 * charge can never differ.
 *
 * Note that nothing is actually charged yet: both payment webhooks throw 501 by
 * design, and `convenience-fee.ts` only quotes. This decides what the player is
 * *told* they owe, and is the hook the eventual billing path will read.
 */
export interface FeeWaiver {
  waived: boolean
  /** Shown next to the zeroed total, so ₱0 never looks like a bug. */
  reason: string | null
}

const NO_WAIVER: FeeWaiver = { waived: false, reason: null }

const ORGANIZER_ROLES = ['OWNER', 'ADMIN']

/**
 * `playerId` may be null (a signed-out visitor looking at the event), in which
 * case there is no waiver to compute - the quote shown is the ordinary one.
 */
export async function resolveFeeWaiver(
  serviceClient: SupabaseClient,
  eventId: string,
  playerId: string | null
): Promise<FeeWaiver> {
  if (!playerId) return NO_WAIVER

  const { data } = await serviceClient
    .from('events')
    .select('club_id, created_by_player_id')
    .eq('id', eventId)
    .maybeSingle()

  const eventRow = data as { club_id: string | null; created_by_player_id: string | null } | null
  if (!eventRow) return NO_WAIVER

  // The person who created it, whether or not a club is involved.
  if (eventRow.created_by_player_id === playerId) {
    return { waived: true, reason: 'Waived — you are the organizer' }
  }

  if (!eventRow.club_id) return NO_WAIVER

  const { data: membership } = await serviceClient
    .from('club_memberships')
    .select('role, status')
    .eq('club_id', eventRow.club_id)
    .eq('player_id', playerId)
    .eq('status', 'active')
    .maybeSingle()

  const row = membership as { role: string } | null

  // Deliberately OWNER/ADMIN only, not MODERATOR. A moderator reviews
  // registrations; they do not run the club's finances, and waiving their entry
  // fee is a money decision rather than an operational one.
  if (row && ORGANIZER_ROLES.includes(row.role)) {
    return { waived: true, reason: 'Waived — club organizer' }
  }

  return NO_WAIVER
}
