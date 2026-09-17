import type { ClubRepository } from '../repositories/club.repository'
import type { ClubMembershipRepository } from '../repositories/club-membership.repository'
import type { ClubDto } from '../dto/club.dto'
import { toClubDto } from '../dto/club.dto'
import type { PlatformAdminService } from '../../platform/services/platform-admin.service'

export class ClubVerificationServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

/**
 * Split out from ClubService on purpose: verification is SuperAdmin-gated and needed
 * by only 4 new endpoints, whereas ClubService's factory is already called from ~10
 * existing controllers that have no reason to depend on PlatformAdminService.
 */
export interface ClubVerificationService {
  requestVerification(actingPlayerId: string, clubId: string): Promise<ClubDto>
  listPendingVerification(actingUserId: string): Promise<ClubDto[]>
  approveVerification(actingUserId: string, clubId: string): Promise<ClubDto>
  rejectVerification(actingUserId: string, clubId: string): Promise<ClubDto>
  listVerifiedClubs(limit: number, offset: number): Promise<ClubDto[]>

  /**
   * A plan with `verified_badge_eligible` was activated for this club.
   *
   * Paying enters the queue; it does not grant the badge. The club joins the
   * same `pending` list the OWNER-initiated request uses, marked
   * `verification_source = 'subscription'` so the reviewer can see it is paying
   * and so a later lapse knows it may take the badge back. Returns true when
   * the club was actually moved; a club already `pending` or `verified` is
   * left alone.
   *
   * Not gated on the caller: the subscription service has already established
   * that the acting player is a club admin who just completed checkout.
   */
  requestVerificationFromSubscription(clubId: string): Promise<boolean>

  /**
   * The club's subscription stopped entitling it.
   *
   * Only a badge that came from a subscription is taken back. A club a human
   * verified by hand keeps its badge no matter what it stops paying —
   * `verification_source = 'admin_review'` means "no write" here, always. A
   * `pending` club that got there by paying drops out of the queue.
   */
  onSubscriptionLapsed(clubId: string): Promise<void>
}

export function createClubVerificationService(
  clubs: ClubRepository,
  memberships: ClubMembershipRepository,
  platformAdmin: PlatformAdminService
): ClubVerificationService {
  async function requireSuperAdmin(actingUserId: string) {
    const isAdmin = await platformAdmin.isSuperAdmin(actingUserId)
    if (!isAdmin) {
      throw new ClubVerificationServiceError(
        403,
        'FORBIDDEN',
        'Only the platform super admin can manage club verification.'
      )
    }
  }

  return {
    async requestVerification(actingPlayerId, clubId) {
      const membership = await memberships.findByClubAndPlayer(clubId, actingPlayerId)
      if (!membership || membership.status !== 'active' || membership.role !== 'OWNER') {
        throw new ClubVerificationServiceError(
          403,
          'FORBIDDEN',
          'Only the club owner can request verification.'
        )
      }
      const club = await clubs.findById(clubId)
      if (!club) {
        throw new ClubVerificationServiceError(404, 'NOT_FOUND', 'Club not found.')
      }
      if (club.verification_status === 'verified') {
        throw new ClubVerificationServiceError(409, 'CONFLICT', 'This club is already verified.')
      }
      if (club.verification_status === 'pending') {
        throw new ClubVerificationServiceError(
          409,
          'CONFLICT',
          'A verification request for this club is already pending.'
        )
      }
      const updated = await clubs.updateVerification(clubId, {
        verification_status: 'pending',
        verification_requested_at: new Date().toISOString()
      })
      return toClubDto(updated)
    },

    async listPendingVerification(actingUserId) {
      await requireSuperAdmin(actingUserId)
      const rows = await clubs.findPendingVerification()
      return rows.map(toClubDto)
    },

    async approveVerification(actingUserId, clubId) {
      await requireSuperAdmin(actingUserId)
      const club = await clubs.findById(clubId)
      if (!club) {
        throw new ClubVerificationServiceError(404, 'NOT_FOUND', 'Club not found.')
      }
      const updated = await clubs.updateVerification(clubId, {
        verification_status: 'verified',
        verified_at: new Date().toISOString(),
        verified_by_user_id: actingUserId,
        // Provenance survives approval. A club that queued itself by paying
        // stays 'subscription' so a lapse can take the badge back; every other
        // route is a human's decision and is kept for good.
        verification_source:
          club.verification_source === 'subscription' ? 'subscription' : 'admin_review'
      })
      return toClubDto(updated)
    },

    async rejectVerification(actingUserId, clubId) {
      await requireSuperAdmin(actingUserId)
      const updated = await clubs.updateVerification(clubId, {
        verification_status: 'unverified',
        verification_requested_at: null,
        verification_source: 'none'
      })
      return toClubDto(updated)
    },

    async listVerifiedClubs(limit, offset) {
      const rows = await clubs.findVerifiedClubs(limit, offset)
      return rows.map(toClubDto)
    },

    async requestVerificationFromSubscription(clubId) {
      const club = await clubs.findById(clubId)
      if (!club) return false
      if (club.verification_status !== 'unverified') return false

      await clubs.updateVerification(clubId, {
        verification_status: 'pending',
        verification_requested_at: new Date().toISOString(),
        verification_source: 'subscription'
      })
      return true
    },

    async onSubscriptionLapsed(clubId) {
      const club = await clubs.findById(clubId)
      if (!club) return
      // The whole rule in one line: a badge a human granted is never touched.
      if (club.verification_source !== 'subscription') return
      if (club.verification_status === 'unverified') return

      await clubs.updateVerification(clubId, {
        verification_status: 'unverified',
        verification_requested_at: null,
        verified_at: null,
        verified_by_user_id: null,
        verification_source: 'none'
      })
    }
  }
}
