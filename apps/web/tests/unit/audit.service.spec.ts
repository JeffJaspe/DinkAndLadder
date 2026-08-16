import { describe, expect, it, vi } from 'vitest'
import { createAuditService } from '../../server/domains/audit/services/audit.service'
import type { AuditRepository } from '../../server/domains/audit/repositories/audit.repository'
import type { AuditLogInput, AuditLogRecord } from '../../server/domains/audit/dto/audit.dto'

function createFakeRepository(): AuditRepository & { calls: AuditLogInput[] } {
  const calls: AuditLogInput[] = []
  return {
    calls,
    async create(input) {
      calls.push(input)
      return {
        id: 'audit-log-id',
        ...input,
        payload: input.payload ?? null,
        ip_address: input.ip_address ?? null,
        user_agent: input.user_agent ?? null,
        created_at: new Date().toISOString()
      } as AuditLogRecord
    }
  }
}

describe('AuditService', () => {
  it('logs a club role change event', async () => {
    const repo = createFakeRepository()
    const service = createAuditService(repo)

    await service.logClubRoleChange('user-1', 'player-1', 'membership-1', {
      old_role: 'MEMBER',
      new_role: 'ADMIN',
      target_player_id: 'player-2'
    })

    expect(repo.calls).toHaveLength(1)
    expect(repo.calls[0].event_type).toBe('club.role_change')
    expect(repo.calls[0].target_type).toBe('club_membership')
    expect(repo.calls[0].target_id).toBe('membership-1')
    expect(repo.calls[0].payload).toEqual({
      old_role: 'MEMBER',
      new_role: 'ADMIN',
      target_player_id: 'player-2'
    })
  })

  it('logs a club membership approval event', async () => {
    const repo = createFakeRepository()
    const service = createAuditService(repo)

    await service.logClubMembershipAction('user-1', 'player-1', 'membership-1', 'approve', {
      target_player_id: 'player-2',
      club_id: 'club-1'
    })

    expect(repo.calls).toHaveLength(1)
    expect(repo.calls[0].event_type).toBe('club.membership_approve')
  })

  it('logs a club membership rejection event', async () => {
    const repo = createFakeRepository()
    const service = createAuditService(repo)

    await service.logClubMembershipAction('user-1', 'player-1', 'membership-1', 'reject', {
      target_player_id: 'player-2',
      club_id: 'club-1'
    })

    expect(repo.calls).toHaveLength(1)
    expect(repo.calls[0].event_type).toBe('club.membership_reject')
  })

  it('logs a club membership removal event', async () => {
    const repo = createFakeRepository()
    const service = createAuditService(repo)

    await service.logClubMembershipAction('user-1', 'player-1', 'membership-1', 'remove', {
      target_player_id: 'player-2',
      club_id: 'club-1'
    })

    expect(repo.calls).toHaveLength(1)
    expect(repo.calls[0].event_type).toBe('club.membership_remove')
  })

  it('logs a match verification decision event', async () => {
    const repo = createFakeRepository()
    const service = createAuditService(repo)

    await service.logMatchVerificationDecision('user-1', 'player-1', 'match-1', {
      decision: 'confirmed',
      match_status: 'verified'
    })

    expect(repo.calls).toHaveLength(1)
    expect(repo.calls[0].event_type).toBe('match.verification_decision')
    expect(repo.calls[0].target_type).toBe('match_verification')
    expect(repo.calls[0].target_id).toBe('match-1')
  })

  it('does not throw when repository fails (best-effort logging)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const repo: AuditRepository = {
      async create() {
        throw new Error('Database error')
      }
    }
    const service = createAuditService(repo)

    await expect(
      service.logClubRoleChange('user-1', 'player-1', 'membership-1', {
        old_role: 'MEMBER',
        new_role: 'ADMIN',
        target_player_id: 'player-2'
      })
    ).resolves.not.toThrow()

    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
