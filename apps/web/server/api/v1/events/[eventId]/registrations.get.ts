import type { SupabaseClient } from '@supabase/supabase-js'
import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { apiError } from '~/server/utils/api-error'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import {
  singlesRatingOf,
  type PlayerProfileJoinRow
} from '~/server/domains/player/dto/player-join-row.dto'
import { getOptionalUser } from '~/server/utils/optional-user'

/**
 * The event roster.
 *
 * Previously read with the *user* client and an inner join:
 * `player_profiles!inner (...)`. RLS policy `player_profiles_select_public`
 * (008-security) exposes a profile only when `profile_visibility = 'public'`,
 * so an inner join silently deleted the registration of anyone with a private
 * profile. Meanwhile register.post.ts checks for duplicates with the
 * *service-role* client, which sees every row. The result was the reported bug:
 * the organiser saw an empty roster while the player was told "You are already
 * registered for this event."
 *
 * So the read is done with the service-role client behind an explicit
 * authorization check — the pattern the club domain already uses for rosters
 * (see the AuthZ note in 008-security) — and a profile the caller may not see
 * is *redacted*, never dropped. A registration is a fact about the event; who
 * the player is, is a fact about the player, and only the second is private.
 */

/** Mirrors the RLS intent of `event_registrations_select_event`. */
async function assertCanViewRoster(
  serviceClient: SupabaseClient,
  eventData: { id: string; visibility: string; status: string; club_id: string | null },
  viewerPlayerId: string | null
) {
  if (eventData.visibility === 'public' && eventData.status !== 'draft') return

  if (!viewerPlayerId) {
    throw apiError(403, 'FORBIDDEN', 'This event’s roster is not public.')
  }

  const { data: ownRegistration } = await serviceClient
    .from('event_registrations')
    .select('id')
    .eq('event_id', eventData.id)
    .eq('player_id', viewerPlayerId)
    .neq('status', 'withdrawn')
    .maybeSingle()

  if (ownRegistration) return

  // Club staff run the session, so they see the roster of their own club's
  // events. Same roles ClubService uses for approving registrations.
  if (eventData.club_id) {
    const { data } = await serviceClient
      .from('club_memberships')
      .select('role, status')
      .eq('club_id', eventData.club_id)
      .eq('player_id', viewerPlayerId)
      .eq('status', 'active')
      .maybeSingle()

    const membership = data as { role: string } | null
    if (membership && ['OWNER', 'ADMIN', 'MODERATOR'].includes(membership.role)) return
  }

  throw apiError(403, 'FORBIDDEN', 'This event’s roster is not public.')
}

export default defineEventHandler(async (event) => {
  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw apiError(400, 'VALIDATION_ERROR', 'Event ID is required.')
  }

  const claims = await getOptionalUser(event)
  const serviceClient = serverSupabaseServiceRole(event)

  const { data: eventData, error: eventError } = await serviceClient
    .from('events')
    .select('id, visibility, status, club_id')
    .eq('id', eventId)
    .single()

  if (eventError || !eventData) {
    throw apiError(404, 'NOT_FOUND', 'Event not found.')
  }

  let viewerPlayerId: string | null = null
  if (claims) {
    const userClient = await serverSupabaseClient(event)
    const profile = await createPlayerProfileRepository(userClient).findByUserId(claims.sub)
    viewerPlayerId = profile?.id ?? null
  }

  await assertCanViewRoster(serviceClient as SupabaseClient, eventData, viewerPlayerId)

  // Left join, not `!inner`: a registration whose profile cannot be resolved
  // must still appear in the count, or the roster lies about who is coming.
  //
  // The embed also names its foreign key: since 035-team-up, event_registrations
  // has two into player_profiles (player_id and registered_by_player_id), so an
  // unqualified `player_profiles (...)` is ambiguous — PostgREST answers PGRST201
  // rather than guessing, which took the whole roster down.
  const { data: registrations, error: regError } = await serviceClient
    .from('event_registrations')
    .select(
      `
      id,
      event_id,
      player_id,
      status,
      registered_at,
      checked_in_at,
      player_profiles!fk_event_registrations_player (
        id,
        display_name,
        profile_visibility,
        player_ratings (
          rating_type,
          rating_value
        )
      )
    `
    )
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
    player_profiles?: (PlayerProfileJoinRow & { profile_visibility?: string | null }) | null
  }

  const mapped = ((registrations ?? []) as unknown as RegistrationJoinRow[]).map((r) => {
    const profile = r.player_profiles

    // The service-role client bypasses RLS, so re-apply the visibility rule
    // here rather than leaking a private profile through the back door. The
    // player still sees their own name, and staff still see who is on the list.
    const isSelf = viewerPlayerId !== null && r.player_id === viewerPlayerId
    const canSeeProfile = isSelf || (profile?.profile_visibility ?? 'public') === 'public'

    return {
      id: r.id,
      event_id: r.event_id,
      player_id: r.player_id,
      status: r.status,
      registered_at: r.registered_at,
      checked_in_at: r.checked_in_at,
      player: {
        id: profile?.id ?? r.player_id,
        display_name: canSeeProfile
          ? (profile?.display_name ?? 'Unknown player')
          : 'Private player',
        // A private profile's rating is part of the profile, not of the
        // registration, so it stays hidden too.
        rating: canSeeProfile ? singlesRatingOf(profile) : null,
        private: !canSeeProfile
      }
    }
  })

  return {
    data: mapped,
    request_id: crypto.randomUUID()
  }
})
