import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const serverSupabaseUser = vi.fn()
vi.mock('#supabase/server', () => ({ serverSupabaseUser }))

const { getOptionalUser } = await import('../../server/utils/optional-user')

const event = {} as H3Event

describe('getOptionalUser', () => {
  // A block body, not a concise one: mockReset returns the mock, and Vitest
  // treats a function returned from beforeEach as a teardown callback — it
  // would then *call* the mock after each test.
  beforeEach(() => {
    serverSupabaseUser.mockReset()
  })

  it('passes the claims through for a signed-in caller', async () => {
    serverSupabaseUser.mockResolvedValue({ sub: 'user-1' })
    await expect(getOptionalUser(event)).resolves.toEqual({ sub: 'user-1' })
  })

  it('returns null when nobody is signed in', async () => {
    serverSupabaseUser.mockResolvedValue(null)
    await expect(getOptionalUser(event)).resolves.toBeNull()
  })

  // The reason this helper exists: the module's own version rethrows a dead
  // cookie as an uncaptioned createError, which h3 serves as a 500. A browser
  // holding a stale refresh token is a signed-out browser, not a server fault.
  it('treats an unusable refresh token as signed out rather than a 500', async () => {
    serverSupabaseUser.mockImplementation(() => {
      throw new Error('Invalid Refresh Token: Refresh Token Not Found')
    })
    await expect(getOptionalUser(event)).resolves.toBeNull()
  })
})
