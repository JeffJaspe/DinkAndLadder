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
      const updated = await clubs.updateVerification(clubId, {
        verification_status: 'verified',
        verified_at: new Date().toISOString(),
        verified_by_user_id: actingUserId
      })
      return toClubDto(updated)
    },

    async rejectVerification(actingUserId, clubId) {
      await requireSuperAdmin(actingUserId)
      const updated = await clubs.updateVerification(clubId, {
        verification_status: 'unverified',
        verification_requested_at: null
      })
      return toClubDto(updated)
    },

    async listVerifiedClubs(limit, offset) {
      const rows = await clubs.findVerifiedClubs(limit, offset)
      return rows.map(toClubDto)
    }
  }
}
