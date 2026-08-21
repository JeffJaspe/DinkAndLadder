import { beforeEach, describe, expect, it } from 'vitest'
import {
  ClubVerificationServiceError,
  createClubVerificationService
} from '../../server/domains/club/services/club-verification.service'
import type { ClubRepository } from '../../server/domains/club/repositories/club.repository'
import type { ClubMembershipRepository } from '../../server/domains/club/repositories/club-membership.repository'
import type { ClubRecord } from '../../server/domains/club/dto/club.dto'
import type { ClubMembershipRecord } from '../../server/domains/club/dto/club-membership.dto'
import type { PlatformAdminService } from '../../server/domains/platform/services/platform-admin.service'

function makeClub(overrides: Partial<ClubRecord> = {}): ClubRecord {
  return {
    id: 'club-1',
    name: 'Test Club',
    slug: 'test-club',
    description: null,
    province: null,
    city: null,
    barangay: null,
    court_name: null,
    court_address: null,
    visibility: 'public',
    status: 'active',
    created_by_user_id: 'user-1',
    created_at: new Date().toISOString(),
    verification_status: 'unverified',
    verification_requested_at: null,
    verified_at: null,
    verified_by_user_id: null,
    ...overrides
  }
}

function makeMembership(overrides: Partial<ClubMembershipRecord> = {}): ClubMembershipRecord {
  return {
    id: 'membership-1',
    club_id: 'club-1',
    player_id: 'player-1',
    role: 'OWNER',
    status: 'active',
    joined_at: new Date().toISOString(),
    left_at: null,
    created_at: new Date().toISOString(),
    ...overrides
  }
}

describe('ClubVerificationService', () => {
  let clubs: Map<string, ClubRecord>
  let memberships: ClubMembershipRecord[]
  let clubRepository: ClubRepository
  let membershipRepository: ClubMembershipRepository
  let isSuperAdminResult: boolean

  beforeEach(() => {
    clubs = new Map([['club-1', makeClub()]])
    memberships = [makeMembership()]
    isSuperAdminResult = false

    clubRepository = {
      async findById(clubId) {
        return clubs.get(clubId) ?? null
      },
      async findBySlug() {
        return null
      },
      async create() {
        throw new Error('not used')
      },
      async update() {
        throw new Error('not used')
      },
      async search() {
        return []
      },
      async updateVerification(clubId, patch) {
        const existing = clubs.get(clubId)
        if (!existing) throw new Error('not found')
        const updated = { ...existing, ...patch }
        clubs.set(clubId, updated)
        return updated
      },
      async findPendingVerification() {
        return [...clubs.values()].filter((c) => c.verification_status === 'pending')
      },
      async findVerifiedClubs() {
        return [...clubs.values()].filter((c) => c.verification_status === 'verified')
      }
    }

    membershipRepository = {
      async findByClubAndPlayer(clubId, playerId) {
        return memberships.find((m) => m.club_id === clubId && m.player_id === playerId) ?? null
      },
      async findById() {
        return null
      },
      async create() {
        throw new Error('not used')
      },
      async updateById() {
        throw new Error('not used')
      },
      async listOwnWithClub() {
        return []
      },
      async listByClub() {
        return []
      }
    }
  })

  function createService() {
    const platformAdmin: PlatformAdminService = {
      async isSuperAdmin() {
        return isSuperAdminResult
      }
    }
    return createClubVerificationService(clubRepository, membershipRepository, platformAdmin)
  }

  it('lets the owner request verification for an unverified club', async () => {
    const service = createService()
    const result = await service.requestVerification('player-1', 'club-1')
    expect(result.verification_status).toBe('pending')
    expect(result.verification_requested_at).toBeTruthy()
  })

  it('rejects a non-owner requesting verification', async () => {
    memberships = [makeMembership({ role: 'ADMIN' })]
    const service = createService()
    await expect(service.requestVerification('player-1', 'club-1')).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN'
    })
  })

  it('rejects requesting verification twice while already pending', async () => {
    clubs.set('club-1', makeClub({ verification_status: 'pending' }))
    const service = createService()
    await expect(service.requestVerification('player-1', 'club-1')).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT'
    })
  })

  it('rejects requesting verification for an already-verified club', async () => {
    clubs.set('club-1', makeClub({ verification_status: 'verified' }))
    const service = createService()
    await expect(service.requestVerification('player-1', 'club-1')).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT'
    })
  })

  it('rejects approve/reject/list-pending from a non-super-admin', async () => {
    isSuperAdminResult = false
    const service = createService()
    await expect(service.approveVerification('user-1', 'club-1')).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN'
    })
    await expect(service.rejectVerification('user-1', 'club-1')).rejects.toBeInstanceOf(
      ClubVerificationServiceError
    )
    await expect(service.listPendingVerification('user-1')).rejects.toBeInstanceOf(
      ClubVerificationServiceError
    )
  })

  it('lets the super admin approve a pending club', async () => {
    clubs.set('club-1', makeClub({ verification_status: 'pending' }))
    isSuperAdminResult = true
    const service = createService()
    const result = await service.approveVerification('admin-user', 'club-1')
    expect(result.verification_status).toBe('verified')
    expect(result.verified_at).toBeTruthy()
  })

  it('lets the super admin reject a pending club back to unverified', async () => {
    clubs.set('club-1', makeClub({ verification_status: 'pending', verification_requested_at: new Date().toISOString() }))
    isSuperAdminResult = true
    const service = createService()
    const result = await service.rejectVerification('admin-user', 'club-1')
    expect(result.verification_status).toBe('unverified')
    expect(result.verification_requested_at).toBeNull()
  })

  it('lists only verified clubs', async () => {
    clubs.set('club-2', makeClub({ id: 'club-2', slug: 'club-2', verification_status: 'verified' }))
    const service = createService()
    const result = await service.listVerifiedClubs(10, 0)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('club-2')
  })
})
