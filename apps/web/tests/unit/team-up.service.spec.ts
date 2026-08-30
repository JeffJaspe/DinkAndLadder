import { describe, expect, it, vi } from 'vitest'
import { createTeamUpService } from '../../server/domains/partnership/services/team-up.service'
import type { TeamUpRepository } from '../../server/domains/partnership/repositories/team-up.repository'
import type { TeamUpRecord } from '../../server/domains/partnership/dto/team-up.dto'

/**
 * A team-up is a ROSTER, not a partnership: directional ("I may bring you"),
 * and requiring consent because registering somebody commits their evening —
 * and, once payments are live, their money.
 */

const OWNER = 'player-owner'
const MEMBER = 'player-member'

function record(overrides: Partial<TeamUpRecord> = {}): TeamUpRecord {
  return {
    id: 'tu-1',
    owner_player_id: OWNER,
    member_player_id: MEMBER,
    status: 'pending',
    message: null,
    responded_at: null,
    created_at: '2026-08-01T00:00:00Z',
    ...overrides
  }
}

function repo(overrides: Partial<TeamUpRepository> = {}) {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findBetween: vi.fn().mockResolvedValue(null),
    listTeam: vi.fn().mockResolvedValue([]),
    listIncoming: vi.fn().mockResolvedValue([]),
    create: vi
      .fn()
      .mockImplementation(async (o, m) => record({ owner_player_id: o, member_player_id: m })),
    updateStatus: vi.fn().mockImplementation(async (id, status) => record({ id, status })),
    remove: vi.fn().mockResolvedValue(undefined),
    isAcceptedMember: vi.fn().mockResolvedValue(false),
    ...overrides
  } as unknown as TeamUpRepository
}

describe('inviting', () => {
  it('creates a pending request', async () => {
    const r = repo()
    const result = await createTeamUpService(r).invite(OWNER, MEMBER)

    expect(result.status).toBe('pending')
    expect(r.create).toHaveBeenCalledWith(OWNER, MEMBER, undefined)
  })

  it('refuses adding yourself', async () => {
    await expect(createTeamUpService(repo()).invite(OWNER, OWNER)).rejects.toMatchObject({
      code: 'SELF_TEAM_UP'
    })
  })

  it('refuses a duplicate of an accepted team-up', async () => {
    const r = repo({ findBetween: vi.fn().mockResolvedValue(record({ status: 'accepted' })) })
    await expect(createTeamUpService(r).invite(OWNER, MEMBER)).rejects.toMatchObject({
      code: 'ALREADY_ON_TEAM'
    })
  })

  it('refuses re-asking while a request is outstanding', async () => {
    const r = repo({ findBetween: vi.fn().mockResolvedValue(record({ status: 'pending' })) })
    await expect(createTeamUpService(r).invite(OWNER, MEMBER)).rejects.toMatchObject({
      code: 'REQUEST_PENDING'
    })
  })

  it('lets a declined request be asked again, reusing the row', async () => {
    // A no today is not a no forever — and the unique pair constraint means it
    // has to be the same row, not a second one.
    const r = repo({ findBetween: vi.fn().mockResolvedValue(record({ status: 'declined' })) })
    const result = await createTeamUpService(r).invite(OWNER, MEMBER)

    expect(result.status).toBe('pending')
    expect(r.updateStatus).toHaveBeenCalledWith('tu-1', 'pending')
    expect(r.create).not.toHaveBeenCalled()
  })
})

describe('responding', () => {
  it('lets the member accept', async () => {
    const r = repo({ findById: vi.fn().mockResolvedValue(record()) })
    const result = await createTeamUpService(r).respond(MEMBER, 'tu-1', true)

    expect(result.status).toBe('accepted')
  })

  it('lets the member decline', async () => {
    const r = repo({ findById: vi.fn().mockResolvedValue(record()) })
    expect((await createTeamUpService(r).respond(MEMBER, 'tu-1', false)).status).toBe('declined')
  })

  it('refuses to let the owner answer on the member’s behalf', async () => {
    // The consent is the whole point; self-answering would void it.
    const r = repo({ findById: vi.fn().mockResolvedValue(record()) })
    await expect(createTeamUpService(r).respond(OWNER, 'tu-1', true)).rejects.toMatchObject({
      status: 403
    })
  })

  it('refuses to answer twice', async () => {
    const r = repo({ findById: vi.fn().mockResolvedValue(record({ status: 'accepted' })) })
    await expect(createTeamUpService(r).respond(MEMBER, 'tu-1', false)).rejects.toMatchObject({
      code: 'ALREADY_ANSWERED'
    })
  })
})

describe('removing', () => {
  it('lets the owner drop a member', async () => {
    const r = repo({ findById: vi.fn().mockResolvedValue(record({ status: 'accepted' })) })
    await createTeamUpService(r).remove(OWNER, 'tu-1')
    expect(r.remove).toHaveBeenCalledWith('tu-1')
  })

  it('lets the member leave', async () => {
    // Owner-only removal would leave a player permanently registrable by
    // somebody they have fallen out with.
    const r = repo({ findById: vi.fn().mockResolvedValue(record({ status: 'accepted' })) })
    await createTeamUpService(r).remove(MEMBER, 'tu-1')
    expect(r.remove).toHaveBeenCalledWith('tu-1')
  })

  it('refuses a stranger', async () => {
    const r = repo({ findById: vi.fn().mockResolvedValue(record({ status: 'accepted' })) })
    await expect(createTeamUpService(r).remove('someone-else', 'tu-1')).rejects.toMatchObject({
      status: 403
    })
  })
})

describe('registering on someone else’s behalf', () => {
  it('allows an accepted member', async () => {
    const r = repo({ isAcceptedMember: vi.fn().mockResolvedValue(true) })
    await expect(createTeamUpService(r).assertCanRegister(OWNER, [MEMBER])).resolves.toBeUndefined()
  })

  it('refuses someone who never accepted', async () => {
    const r = repo({ isAcceptedMember: vi.fn().mockResolvedValue(false) })
    await expect(createTeamUpService(r).assertCanRegister(OWNER, [MEMBER])).rejects.toMatchObject({
      code: 'NOT_ON_TEAM'
    })
  })

  it('needs no permission to register yourself', async () => {
    const r = repo({ isAcceptedMember: vi.fn().mockResolvedValue(false) })
    await expect(createTeamUpService(r).assertCanRegister(OWNER, [OWNER])).resolves.toBeUndefined()
    expect(r.isAcceptedMember).not.toHaveBeenCalled()
  })

  it('checks every name, not just the first', async () => {
    const r = repo({
      isAcceptedMember: vi.fn().mockImplementation(async (_o, m) => m === 'ok')
    })
    await expect(
      createTeamUpService(r).assertCanRegister(OWNER, ['ok', 'not-ok'])
    ).rejects.toMatchObject({ code: 'NOT_ON_TEAM' })
  })
})
