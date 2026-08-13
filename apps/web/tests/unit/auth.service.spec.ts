import { beforeEach, describe, expect, it } from 'vitest'
import { createAuthService } from '../../server/domains/identity/services/auth.service'
import type {
  AuthIdentity,
  UserRepository
} from '../../server/domains/identity/repositories/user.repository'
import type { UserRecord } from '../../server/domains/identity/dto/user.dto'

function createFakeUserRepository(seed: UserRecord[] = []): UserRepository {
  const rows = new Map(seed.map((row) => [row.id, row]))

  return {
    async findByAuthId(authId) {
      return rows.get(authId) ?? null
    },
    async upsertFromAuthIdentity(identity: AuthIdentity) {
      const existing = rows.get(identity.id)
      const row: UserRecord = existing
        ? { ...existing, email: identity.email, last_login_at: new Date().toISOString() }
        : {
            id: identity.id,
            email: identity.email,
            status: 'active',
            email_verified_at: null,
            last_login_at: new Date().toISOString(),
            created_at: new Date().toISOString()
          }
      rows.set(identity.id, row)
      return row
    }
  }
}

describe('AuthService', () => {
  let repository: UserRepository

  beforeEach(() => {
    repository = createFakeUserRepository()
  })

  it('provisions a brand-new user on first session', async () => {
    const service = createAuthService(repository)

    const user = await service.provisionSession({ id: 'auth-1', email: 'player@example.com' })

    expect(user.id).toBe('auth-1')
    expect(user.email).toBe('player@example.com')
    expect(user.status).toBe('active')
  })

  it('is idempotent — re-provisioning an existing user updates it in place, not duplicates it', async () => {
    const service = createAuthService(repository)

    await service.provisionSession({ id: 'auth-1', email: 'player@example.com' })
    const second = await service.provisionSession({ id: 'auth-1', email: 'player@example.com' })

    expect(second.id).toBe('auth-1')
    expect(await repository.findByAuthId('auth-1')).not.toBeNull()
  })

  it('returns null for getCurrentUser when no application profile exists yet', async () => {
    const service = createAuthService(repository)

    const user = await service.getCurrentUser('unknown-auth-id')

    expect(user).toBeNull()
  })

  it('returns the mapped DTO for getCurrentUser once provisioned', async () => {
    const service = createAuthService(repository)
    await service.provisionSession({ id: 'auth-1', email: 'player@example.com' })

    const user = await service.getCurrentUser('auth-1')

    expect(user).not.toBeNull()
    expect(user?.email).toBe('player@example.com')
  })
})
