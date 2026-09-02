import { beforeEach, describe, expect, it } from 'vitest'
import {
  ClubServiceError,
  createClubService
} from '../../server/domains/club/services/club.service'
import type {
  ClubRepository,
  UpdateClubInput
} from '../../server/domains/club/repositories/club.repository'
import type {
  ClubMembershipRepository,
  CreateMembershipInput,
  OwnMembershipWithClub,
  RosterRow,
  UpdateMembershipRecordInput
} from '../../server/domains/club/repositories/club-membership.repository'
import type { ClubRecord, CreateClubInput } from '../../server/domains/club/dto/club.dto'
import type { ClubMembershipRecord } from '../../server/domains/club/dto/club-membership.dto'

let clubCounter = 0
let membershipCounter = 0

function createFakes() {
  const clubs = new Map<string, ClubRecord>()
  const memberships = new Map<string, ClubMembershipRecord>()

  const clubRepository: ClubRepository = {
    async findById(clubId) {
      return clubs.get(clubId) ?? null
    },
    async findBySlug(slug) {
      return [...clubs.values()].find((c) => c.slug === slug) ?? null
    },
    async create(input: CreateClubInput, createdByUserId: string) {
      const now = new Date().toISOString()
      const club: ClubRecord = {
        id: `club-${++clubCounter}`,
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
        province: input.province ?? null,
        city: input.city ?? null,
        barangay: input.barangay ?? null,
        court_name: input.court_name ?? null,
        court_address: input.court_address ?? null,
        visibility: input.visibility ?? 'public',
        status: 'active',
        created_by_user_id: createdByUserId,
        created_at: now,
        verification_status: 'unverified',
        verification_requested_at: null,
        verified_at: null,
        verified_by_user_id: null,
        cover_photo_path: null,
        logo_path: null
      }
      clubs.set(club.id, club)
      return club
    },
    async update(clubId: string, patch: UpdateClubInput) {
      const existing = clubs.get(clubId)
      if (!existing) throw new Error('not found')
      const updated = { ...existing, ...patch }
      clubs.set(clubId, updated)
      return updated
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

  const membershipRepository: ClubMembershipRepository = {
    async findByClubAndPlayer(clubId, playerId) {
      return (
        [...memberships.values()].find(
          (m) =>
            m.club_id === clubId &&
            m.player_id === playerId &&
            (m.status === 'pending' || m.status === 'active')
        ) ?? null
      )
    },
    async findById(membershipId) {
      return memberships.get(membershipId) ?? null
    },
    async create(input: CreateMembershipInput) {
      const now = new Date().toISOString()
      const row: ClubMembershipRecord = {
        id: `membership-${++membershipCounter}`,
        club_id: input.club_id,
        player_id: input.player_id,
        role: input.role,
        status: input.status,
        joined_at: input.joined_at ?? null,
        left_at: null,
        invited_by_player_id: null,
        invited_at: null,
        created_at: now
      }
      memberships.set(row.id, row)
      return row
    },
    async updateById(membershipId, patch: UpdateMembershipRecordInput) {
      const existing = memberships.get(membershipId)
      if (!existing) throw new Error('not found')
      const updated = { ...existing, ...patch }
      memberships.set(membershipId, updated)
      return updated
    },
    async listByClub(clubId): Promise<RosterRow[]> {
      return [...memberships.values()]
        .filter((m) => m.club_id === clubId)
        .map((m) => ({ ...m, display_name: `Player ${m.player_id}` }))
    },
    async listOwnWithClub(playerId): Promise<OwnMembershipWithClub[]> {
      return [...memberships.values()]
        .filter(
          (m) => m.player_id === playerId && (m.status === 'pending' || m.status === 'active')
        )
        .flatMap((m) => {
          const club = clubs.get(m.club_id)
          return club ? [{ ...m, club }] : []
        })
    }
  }

  return { clubs, memberships, clubRepository, membershipRepository }
}

describe('ClubService', () => {
  let fakes: ReturnType<typeof createFakes>

  beforeEach(() => {
    fakes = createFakes()
  })

  function service() {
    return createClubService(fakes.clubRepository, fakes.membershipRepository)
  }

  async function seedClubWithOwner(ownerPlayerId = 'player-owner') {
    const svc = service()
    const club = await svc.createClub('user-owner', ownerPlayerId, {
      name: 'Manila Dinkers',
      slug: 'manila-dinkers'
    })
    return club
  }

  it('createClub creates the club and makes the creator an active OWNER', async () => {
    const club = await seedClubWithOwner()
    const svc = service()

    const membership = await fakes.membershipRepository.findByClubAndPlayer(club.id, 'player-owner')
    expect(membership?.role).toBe('OWNER')
    expect(membership?.status).toBe('active')
    expect(membership?.joined_at).not.toBeNull()
    expect((await svc.getClub(club.id))?.name).toBe('Manila Dinkers')
  })

  it('requestToJoin creates a pending MEMBER row', async () => {
    const club = await seedClubWithOwner()
    const svc = service()

    const membership = await svc.requestToJoin(club.id, 'player-requester')

    expect(membership.role).toBe('MEMBER')
    expect(membership.status).toBe('pending')
  })

  it('requestToJoin rejects a second request while one is already live', async () => {
    const club = await seedClubWithOwner()
    const svc = service()
    await svc.requestToJoin(club.id, 'player-requester')

    await expect(svc.requestToJoin(club.id, 'player-requester')).rejects.toMatchObject({
      code: 'CONFLICT'
    })
  })

  it('leaveClub sets status to left for a regular member', async () => {
    const club = await seedClubWithOwner()
    const svc = service()
    const request = await svc.requestToJoin(club.id, 'player-member')
    await svc.updateMember('player-owner', club.id, 'player-member', { status: 'active' })

    const left = await svc.leaveClub(club.id, 'player-member')

    expect(left.status).toBe('left')
    expect(left.left_at).not.toBeNull()
    expect(request.id).toBe(left.id)
  })

  it('leaveClub refuses to let the owner leave', async () => {
    const club = await seedClubWithOwner()
    const svc = service()

    await expect(svc.leaveClub(club.id, 'player-owner')).rejects.toMatchObject({
      code: 'INVALID_MEMBER_STATE'
    })
  })

  it('leaveClub 404s for a player with no membership at all', async () => {
    const club = await seedClubWithOwner()
    const svc = service()

    await expect(svc.leaveClub(club.id, 'player-stranger')).rejects.toMatchObject({
      code: 'NOT_FOUND'
    })
  })

  it('the owner can approve a pending request, setting status active and joined_at', async () => {
    const club = await seedClubWithOwner()
    const svc = service()
    await svc.requestToJoin(club.id, 'player-member')

    const approved = await svc.updateMember('player-owner', club.id, 'player-member', {
      status: 'active'
    })

    expect(approved.status).toBe('active')
    expect(approved.joined_at).not.toBeNull()
  })

  it('the owner can reject a pending request', async () => {
    const club = await seedClubWithOwner()
    const svc = service()
    await svc.requestToJoin(club.id, 'player-member')

    const rejected = await svc.updateMember('player-owner', club.id, 'player-member', {
      status: 'rejected'
    })

    expect(rejected.status).toBe('rejected')
  })

  it('the owner can promote a member to admin', async () => {
    const club = await seedClubWithOwner()
    const svc = service()
    await svc.requestToJoin(club.id, 'player-member')
    await svc.updateMember('player-owner', club.id, 'player-member', { status: 'active' })

    const promoted = await svc.updateMember('player-owner', club.id, 'player-member', {
      role: 'ADMIN'
    })

    expect(promoted.role).toBe('ADMIN')
  })

  it('an admin cannot modify another admin', async () => {
    const club = await seedClubWithOwner()
    const svc = service()
    for (const playerId of ['player-admin-1', 'player-admin-2']) {
      await svc.requestToJoin(club.id, playerId)
      await svc.updateMember('player-owner', club.id, playerId, { status: 'active' })
      await svc.updateMember('player-owner', club.id, playerId, { role: 'ADMIN' })
    }

    await expect(
      svc.updateMember('player-admin-1', club.id, 'player-admin-2', { status: 'left' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('an admin cannot grant admin', async () => {
    const club = await seedClubWithOwner()
    const svc = service()
    await svc.requestToJoin(club.id, 'player-admin')
    await svc.updateMember('player-owner', club.id, 'player-admin', { status: 'active' })
    await svc.updateMember('player-owner', club.id, 'player-admin', { role: 'ADMIN' })
    await svc.requestToJoin(club.id, 'player-member')
    await svc.updateMember('player-owner', club.id, 'player-member', { status: 'active' })

    await expect(
      svc.updateMember('player-admin', club.id, 'player-member', { role: 'ADMIN' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('an admin can approve requests and manage plain members', async () => {
    const club = await seedClubWithOwner()
    const svc = service()
    await svc.requestToJoin(club.id, 'player-admin')
    await svc.updateMember('player-owner', club.id, 'player-admin', { status: 'active' })
    await svc.updateMember('player-owner', club.id, 'player-admin', { role: 'ADMIN' })
    await svc.requestToJoin(club.id, 'player-member')

    const approved = await svc.updateMember('player-admin', club.id, 'player-member', {
      status: 'active'
    })

    expect(approved.status).toBe('active')
  })

  it('a plain member cannot manage anyone', async () => {
    const club = await seedClubWithOwner()
    const svc = service()
    for (const playerId of ['player-member-1', 'player-member-2']) {
      await svc.requestToJoin(club.id, playerId)
      await svc.updateMember('player-owner', club.id, playerId, { status: 'active' })
    }

    await expect(
      svc.updateMember('player-member-1', club.id, 'player-member-2', { status: 'left' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('the owner row cannot be targeted by updateMember at all', async () => {
    const club = await seedClubWithOwner()
    const svc = service()
    await svc.requestToJoin(club.id, 'player-admin')
    await svc.updateMember('player-owner', club.id, 'player-admin', { status: 'active' })
    await svc.updateMember('player-owner', club.id, 'player-admin', { role: 'ADMIN' })

    await expect(
      svc.updateMember('player-admin', club.id, 'player-owner', { status: 'left' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('updateMember refuses to let a caller target their own row', async () => {
    const club = await seedClubWithOwner()
    const svc = service()

    await expect(
      svc.updateMember('player-owner', club.id, 'player-owner', { status: 'left' })
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it('listRoster is only visible to active members', async () => {
    const club = await seedClubWithOwner()
    const svc = service()

    await expect(svc.listRoster('player-stranger', club.id)).rejects.toMatchObject({
      code: 'FORBIDDEN'
    })

    const roster = await svc.listRoster('player-owner', club.id)
    expect(roster).toHaveLength(1)
    expect(roster[0].role).toBe('OWNER')
  })

  it('only the owner or an admin can edit the club profile', async () => {
    const club = await seedClubWithOwner()
    const svc = service()
    await svc.requestToJoin(club.id, 'player-member')
    await svc.updateMember('player-owner', club.id, 'player-member', { status: 'active' })

    await expect(
      svc.updateClub('player-member', club.id, { name: 'New Name' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    const updated = await svc.updateClub('player-owner', club.id, { name: 'New Name' })
    expect(updated.name).toBe('New Name')
  })

  it('listMine returns the clubs a player currently belongs to, joined with club details', async () => {
    await seedClubWithOwner()
    const svc = service()

    const mine = await svc.listMine('player-owner')

    expect(mine).toHaveLength(1)
    expect(mine[0].club.slug).toBe('manila-dinkers')
    expect(mine[0].role).toBe('OWNER')
  })
})

describe('ClubService — moderator join-request review', () => {
  let fakes: ReturnType<typeof createFakes>

  beforeEach(() => {
    fakes = createFakes()
  })

  function service() {
    return createClubService(fakes.clubRepository, fakes.membershipRepository)
  }

  /** Club with an owner and an active MODERATOR, plus a pending applicant. */
  async function seedWithModerator() {
    const svc = service()
    const club = await svc.createClub('user-owner', 'player-owner', {
      name: 'Manila Dinkers',
      slug: 'manila-dinkers'
    })
    await svc.requestToJoin(club.id, 'player-mod')
    await svc.updateMember('player-owner', club.id, 'player-mod', { status: 'active' })
    await svc.updateMember('player-owner', club.id, 'player-mod', { role: 'MODERATOR' })
    await svc.requestToJoin(club.id, 'player-applicant')
    return { svc, club }
  }

  it('lets a moderator admit a pending applicant', async () => {
    const { svc, club } = await seedWithModerator()

    const approved = await svc.updateMember('player-mod', club.id, 'player-applicant', {
      status: 'active'
    })

    expect(approved.status).toBe('active')
    expect(approved.joined_at).not.toBeNull()
  })

  it('lets a moderator turn a pending applicant away', async () => {
    const { svc, club } = await seedWithModerator()

    const rejected = await svc.updateMember('player-mod', club.id, 'player-applicant', {
      status: 'rejected'
    })

    expect(rejected.status).toBe('rejected')
  })

  it('does not let a moderator change any role', async () => {
    const { svc, club } = await seedWithModerator()
    await svc.updateMember('player-owner', club.id, 'player-applicant', { status: 'active' })

    await expect(
      svc.updateMember('player-mod', club.id, 'player-applicant', { role: 'ADMIN' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      svc.updateMember('player-mod', club.id, 'player-applicant', { role: 'MEMBER' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('does not let a moderator remove an existing member', async () => {
    // The applicant is active by now, so this is a removal, not a review —
    // even though it is still just a status change.
    const { svc, club } = await seedWithModerator()
    await svc.updateMember('player-owner', club.id, 'player-applicant', { status: 'active' })

    await expect(
      svc.updateMember('player-mod', club.id, 'player-applicant', { status: 'left' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('gates on the target being pending, not merely on the status value', async () => {
    // The same input that is a legitimate review of a pending applicant is not
    // a review once they are active — so the permission must turn on the
    // target's state, not on `status: 'active'` appearing in the body.
    const { svc, club } = await seedWithModerator()
    await svc.updateMember('player-owner', club.id, 'player-applicant', { status: 'active' })

    await expect(
      svc.updateMember('player-mod', club.id, 'player-applicant', { status: 'active' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('still refuses a plain member reviewing a request', async () => {
    const { svc, club } = await seedWithModerator()
    await svc.requestToJoin(club.id, 'player-plain')
    await svc.updateMember('player-owner', club.id, 'player-plain', { status: 'active' })

    await expect(
      svc.updateMember('player-plain', club.id, 'player-applicant', { status: 'active' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})

describe('ClubServiceError', () => {
  it('carries the http status alongside the machine-readable code', () => {
    const err = new ClubServiceError(403, 'FORBIDDEN', 'nope')
    expect(err.status).toBe(403)
    expect(err.code).toBe('FORBIDDEN')
  })
})
