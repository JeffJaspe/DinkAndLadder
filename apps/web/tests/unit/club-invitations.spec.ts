import { beforeEach, describe, expect, it } from 'vitest'
import { createClubService, ClubServiceError } from '../../server/domains/club/services/club.service'
import type {
  ClubMembershipRepository,
  CreateMembershipInput,
  UpdateMembershipRecordInput
} from '../../server/domains/club/repositories/club-membership.repository'
import type { ClubRepository } from '../../server/domains/club/repositories/club.repository'
import type {
  ClubMembershipRecord,
  ClubMembershipStatus,
  ClubRole
} from '../../server/domains/club/dto/club-membership.dto'

/**
 * Inviting a player, which is a join request travelling the other way.
 *
 * "Invite to club" was a button linking to the club's own page — the code said
 * outright that no invite endpoint existed. These cover the rules that make the
 * two directions safe to share one table: one live row per player per club, and
 * only the invited player may answer.
 */

function makeMembership(overrides: Partial<ClubMembershipRecord> = {}): ClubMembershipRecord {
  return {
    id: `membership-${overrides.player_id ?? 'x'}`,
    club_id: 'club-1',
    player_id: 'player-1',
    role: 'MEMBER' as ClubRole,
    status: 'active' as ClubMembershipStatus,
    joined_at: '2026-01-01T00:00:00Z',
    left_at: null,
    created_at: '2026-01-01T00:00:00Z',
    invited_by_player_id: null,
    invited_at: null,
    ...overrides
  }
}

describe('ClubService invitations', () => {
  let rows: ClubMembershipRecord[]
  let memberships: ClubMembershipRepository

  const notUsed = () => {
    throw new Error('not used in these tests')
  }

  beforeEach(() => {
    // owner-1 runs the club; member-1 is in it; nobody else has a row.
    rows = [
      makeMembership({ player_id: 'owner-1', role: 'OWNER' }),
      makeMembership({ player_id: 'member-1' })
    ]

    memberships = {
      async findByClubAndPlayer(clubId: string, playerId: string) {
        return (
          rows.find(
            (r) =>
              r.club_id === clubId &&
              r.player_id === playerId &&
              ['pending', 'invited', 'active'].includes(r.status)
          ) ?? null
        )
      },
      async create(input: CreateMembershipInput) {
        // `joined_at` is defaulted here rather than by `makeMembership`: the
        // real insert writes only the columns it is given, and the column's own
        // default is null. A fake that quietly fills it in would hide exactly
        // the bug this file is checking for — an invitation that reads as a
        // membership before it has been accepted.
        const row = makeMembership({
          joined_at: null,
          ...input,
          id: `new-${input.player_id}`
        })
        rows.push(row)
        return row
      },
      async updateById(id: string, patch: UpdateMembershipRecordInput) {
        const row = rows.find((r) => r.id === id)!
        Object.assign(row, patch)
        return row
      },
      findById: notUsed,
      listByClub: notUsed,
      listOwnWithClub: notUsed
    } as unknown as ClubMembershipRepository
  })

  function service() {
    return createClubService({} as unknown as ClubRepository, memberships)
  }

  it('creates an invited row, stamped with who sent it', async () => {
    const result = await service().invitePlayer('owner-1', 'club-1', 'stranger-1')

    expect(result.status).toBe('invited')
    expect(result.invited_by_player_id).toBe('owner-1')
    expect(result.invited_at).not.toBeNull()
    // Not a member until they say yes.
    expect(result.joined_at).toBeNull()
  })

  it('refuses an ordinary member trying to invite', async () => {
    await expect(service().invitePlayer('member-1', 'club-1', 'stranger-1')).rejects.toBeInstanceOf(
      ClubServiceError
    )
  })

  it('refuses a player who is already in the club', async () => {
    await expect(service().invitePlayer('owner-1', 'club-1', 'member-1')).rejects.toMatchObject({
      code: 'CONFLICT'
    })
  })

  it('refuses a second invitation to the same player', async () => {
    await service().invitePlayer('owner-1', 'club-1', 'stranger-1')

    await expect(service().invitePlayer('owner-1', 'club-1', 'stranger-1')).rejects.toMatchObject({
      code: 'CONFLICT'
    })
  })

  /**
   * The case that would otherwise be a unique-index violation: they asked
   * first. Approving is the honest resolution, and saying so is more use than
   * a constraint error.
   */
  it('points at the pending request when the player already asked', async () => {
    rows.push(makeMembership({ player_id: 'asker-1', status: 'pending', joined_at: null }))

    await expect(service().invitePlayer('owner-1', 'club-1', 'asker-1')).rejects.toMatchObject({
      code: 'REQUEST_PENDING'
    })
  })

  it('admits the player when they accept, dating membership from the answer', async () => {
    await service().invitePlayer('owner-1', 'club-1', 'stranger-1')

    const result = await service().respondToInvite('club-1', 'stranger-1', true)

    expect(result.status).toBe('active')
    expect(result.joined_at).not.toBeNull()
  })

  it('records a decline without admitting them', async () => {
    await service().invitePlayer('owner-1', 'club-1', 'stranger-1')

    const result = await service().respondToInvite('club-1', 'stranger-1', false)

    expect(result.status).toBe('rejected')
    expect(result.joined_at).toBeNull()
  })

  it('refuses to answer an invitation that was never sent', async () => {
    await expect(service().respondToInvite('club-1', 'stranger-1', true)).rejects.toMatchObject({
      code: 'NOT_FOUND'
    })
  })

  /**
   * The one thing nobody in the club may do.
   *
   * `updateMember` sets whatever status an admin asks for, which on an invited
   * row would have admitted somebody who never answered — a membership without
   * consent, which is exactly what the invited status exists to prevent.
   */
  it('refuses to let the club accept its own invitation', async () => {
    await service().invitePlayer('owner-1', 'club-1', 'stranger-1')

    await expect(
      service().updateMember('owner-1', 'club-1', 'stranger-1', { status: 'active' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('lets the club withdraw an invitation it sent', async () => {
    await service().invitePlayer('owner-1', 'club-1', 'stranger-1')

    const result = await service().updateMember('owner-1', 'club-1', 'stranger-1', {
      status: 'rejected'
    })

    expect(result.status).toBe('rejected')
  })

  /**
   * A moderator may send an invitation, so a moderator must be able to take it
   * back. An `invited` row is not `pending`, so it fell through to the
   * admin-only branch and left them unable to undo their own action.
   */
  it('lets a moderator withdraw an invitation', async () => {
    rows.push(makeMembership({ player_id: 'mod-1', role: 'MODERATOR' }))
    await service().invitePlayer('mod-1', 'club-1', 'stranger-1')

    const result = await service().updateMember('mod-1', 'club-1', 'stranger-1', {
      status: 'rejected'
    })

    expect(result.status).toBe('rejected')
  })

  it('refuses to answer on behalf of somebody else', async () => {
    await service().invitePlayer('owner-1', 'club-1', 'stranger-1')

    // member-1 has an active row, not an invitation — accepting must not
    // silently do anything to it.
    await expect(service().respondToInvite('club-1', 'member-1', true)).rejects.toMatchObject({
      code: 'NOT_FOUND'
    })
  })
})
