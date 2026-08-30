import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAuthService,
  loginWithPassword,
  registerWithPassword,
  setPassword
} from '../../server/domains/identity/services/auth.service'
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

describe('registerWithPassword / loginWithPassword', () => {
  it('registerWithPassword delegates to the auth client and reports no error on success', async () => {
    const client = {
      auth: {
        signUp: vi.fn().mockResolvedValue({ error: null }),
        signInWithPassword: vi.fn()
      }
    }

    const result = await registerWithPassword(client, 'player@example.com', 'password123')

    expect(result.error).toBeNull()
    expect(client.auth.signUp).toHaveBeenCalledWith({
      email: 'player@example.com',
      password: 'password123'
    })
  })

  it('registerWithPassword sends the confirmation link back to the given origin', async () => {
    const client = {
      auth: {
        signUp: vi.fn().mockResolvedValue({ error: null }),
        signInWithPassword: vi.fn()
      }
    }

    await registerWithPassword(
      client,
      'player@example.com',
      'password123',
      'https://dink-and-ladder-web.vercel.app/confirm'
    )

    expect(client.auth.signUp).toHaveBeenCalledWith({
      email: 'player@example.com',
      password: 'password123',
      options: { emailRedirectTo: 'https://dink-and-ladder-web.vercel.app/confirm' }
    })
  })

  it('registerWithPassword omits options entirely when no origin is given', async () => {
    // Supabase then falls back to the project's Site URL, which is what it did
    // before this argument existed — an environment that cannot resolve an
    // origin is no worse off than it was.
    const client = {
      auth: {
        signUp: vi.fn().mockResolvedValue({ error: null }),
        signInWithPassword: vi.fn()
      }
    }

    await registerWithPassword(client, 'player@example.com', 'password123')

    expect(client.auth.signUp).toHaveBeenCalledWith({
      email: 'player@example.com',
      password: 'password123'
    })
    expect(client.auth.signUp.mock.calls[0][0]).not.toHaveProperty('options')
  })

  it('registerWithPassword surfaces the provider error message and code', async () => {
    const client = {
      auth: {
        signUp: vi.fn().mockResolvedValue({
          error: { message: 'User already registered', code: 'user_already_exists' }
        }),
        signInWithPassword: vi.fn()
      }
    }

    const result = await registerWithPassword(client, 'player@example.com', 'password123')

    expect(result.error).toBe('User already registered')
    expect(result.code).toBe('user_already_exists')
  })

  it('flags an address that already has an account, which Supabase reports as a silent success', async () => {
    // With email confirmations on, Supabase's user-enumeration protection
    // answers a duplicate signup with no error and a decoy user carrying an
    // empty identities array — and sends no email. See registerWithPassword.
    const client = {
      auth: {
        signUp: vi.fn().mockResolvedValue({
          data: { user: { id: 'decoy-uuid', identities: [] } },
          error: null
        }),
        signInWithPassword: vi.fn()
      }
    }

    const result = await registerWithPassword(client, 'taken@example.com', 'password123')

    expect(result.alreadyRegistered).toBe(true)
    expect(result.error).toBeNull()
  })

  it('does not flag a genuine new signup, which comes back carrying an identity', async () => {
    const client = {
      auth: {
        signUp: vi.fn().mockResolvedValue({
          data: { user: { id: 'real-uuid', identities: [{ provider: 'email' }] } },
          error: null
        }),
        signInWithPassword: vi.fn()
      }
    }

    const result = await registerWithPassword(client, 'new@example.com', 'password123')

    expect(result.alreadyRegistered).toBe(false)
  })

  it('does not flag when the provider returns no identity information at all', async () => {
    // Absent is not the same as empty: only an explicitly empty array is the
    // decoy signal, so an unexpected response shape stays a normal signup
    // rather than turning into a false "already registered".
    const client = {
      auth: {
        signUp: vi.fn().mockResolvedValue({ error: null }),
        signInWithPassword: vi.fn()
      }
    }

    const result = await registerWithPassword(client, 'new@example.com', 'password123')

    expect(result.alreadyRegistered).toBe(false)
  })

  it('loginWithPassword delegates to the auth client and returns the session on success', async () => {
    const session = { access_token: 'at-1', refresh_token: 'rt-1', expires_at: 12345 }
    const client = {
      auth: {
        signUp: vi.fn(),
        signInWithPassword: vi.fn().mockResolvedValue({ data: { session }, error: null })
      }
    }

    const result = await loginWithPassword(client, 'player@example.com', 'password123')

    expect(result.error).toBeNull()
    expect(result.session).toEqual(session)
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'player@example.com',
      password: 'password123'
    })
  })

  it('loginWithPassword surfaces the provider error message, code, and no session', async () => {
    const client = {
      auth: {
        signUp: vi.fn(),
        signInWithPassword: vi.fn().mockResolvedValue({
          data: { session: null },
          error: { message: 'Invalid login credentials', code: 'invalid_credentials' }
        })
      }
    }

    const result = await loginWithPassword(client, 'player@example.com', 'password123')

    expect(result.error).toBe('Invalid login credentials')
    expect(result.code).toBe('invalid_credentials')
    expect(result.session).toBeNull()
  })
})

describe('setPassword', () => {
  it('sets the password on the current session user', async () => {
    const client = { auth: { updateUser: vi.fn().mockResolvedValue({ error: null }) } }

    const result = await setPassword(client, 'a-new-password')

    expect(result.error).toBeNull()
    expect(client.auth.updateUser).toHaveBeenCalledWith({ password: 'a-new-password' })
  })

  it('never sends anything but the password — no email, so the account cannot be switched', async () => {
    // The session identifies the account; passing an address would make this an
    // account-takeover primitive rather than a password change.
    const client = { auth: { updateUser: vi.fn().mockResolvedValue({ error: null }) } }

    await setPassword(client, 'a-new-password')

    expect(Object.keys(client.auth.updateUser.mock.calls[0][0])).toEqual(['password'])
  })

  it('surfaces the provider error message and code', async () => {
    const client = {
      auth: {
        updateUser: vi.fn().mockResolvedValue({
          error: { message: 'Reauthentication required', code: 'reauthentication_needed' }
        })
      }
    }

    const result = await setPassword(client, 'a-new-password')

    expect(result.error).toBe('Reauthentication required')
    expect(result.code).toBe('reauthentication_needed')
  })
})
