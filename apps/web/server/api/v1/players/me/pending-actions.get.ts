import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { apiError } from '~/server/utils/api-error'

export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to view your pending actions.')
  }

  const client = await serverSupabaseClient(event)
  const playerProfile = await createPlayerProfileRepository(client).findByUserId(claims.sub)
  if (!playerProfile) {
    throw apiError(409, 'PLAYER_PROFILE_REQUIRED', 'Complete your player profile first.')
  }

  const { data: verificationRows, error: verificationError } = await client
    .from('match_verifications')
    .select('match_id, matches!inner (id, match_type, played_at)')
    .eq('verifier_player_id', playerProfile.id)
    .eq('status', 'pending')

  if (verificationError) {
    console.error(
      '[GET /api/v1/players/me/pending-actions] verifications failed:',
      verificationError
    )
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load your pending actions.')
  }

  interface VerificationJoinRow {
    match_id: string
    matches?: { match_type?: string; played_at?: string } | null
  }

  const pendingVerifications = ((verificationRows ?? []) as unknown as VerificationJoinRow[]).map(
    (r) => ({
      type: 'match_verification' as const,
      match_id: r.match_id,
      match_type: r.matches?.match_type,
      played_at: r.matches?.played_at
    })
  )

  const memberships = await createClubMembershipRepository(client).listOwnWithClub(playerProfile.id)
  const pendingMemberships = memberships
    .filter((m) => m.status === 'pending')
    .map((m) => ({
      type: 'club_membership_pending' as const,
      club_id: m.club.id,
      club_name: m.club.name
    }))

  return {
    data: {
      pending_verifications: pendingVerifications,
      pending_memberships: pendingMemberships,
      total: pendingVerifications.length + pendingMemberships.length
    },
    request_id: crypto.randomUUID()
  }
})
