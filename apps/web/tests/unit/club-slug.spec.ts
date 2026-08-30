import { describe, expect, it } from 'vitest'
import {
  looksLikeUuid,
  slugProblemMessage,
  validateSlug
} from '../../server/domains/club/dto/club-slug'

describe('validateSlug — accepted', () => {
  it.each(['cebu-smashers', 'bgc-pickleball', 'club42', 'a-b-c', 'manila2026'])(
    'accepts %s',
    (slug) => {
      expect(validateSlug(slug)).toBeNull()
    }
  )
})

describe('validateSlug — format', () => {
  it.each([
    ['Cebu-Smashers', 'uppercase'],
    ['cebu_smashers', 'underscore'],
    ['cebu smashers', 'space'],
    ['-cebu', 'leading hyphen'],
    ['cebu-', 'trailing hyphen'],
    ['cebu--smashers', 'double hyphen'],
    ['cebu.smashers', 'dot'],
    ['cebu/smashers', 'slash']
  ])('rejects %s (%s)', (slug) => {
    expect(validateSlug(slug)).toBe('FORMAT')
  })
})

describe('validateSlug — length', () => {
  it('rejects something too short to be distinctive', () => {
    expect(validateSlug('ab')).toBe('TOO_SHORT')
  })

  it('accepts the minimum', () => {
    expect(validateSlug('abc')).toBeNull()
  })

  it('rejects something too long to type', () => {
    expect(validateSlug('a'.repeat(41))).toBe('TOO_LONG')
  })

  it('accepts the maximum', () => {
    expect(validateSlug('a'.repeat(40))).toBeNull()
  })
})

describe('validateSlug — reserved words', () => {
  it.each(['admin', 'settings', 'clubs', 'api', 'new', 'login', 'superadmin', 'official'])(
    'refuses %s',
    (slug) => {
      expect(validateSlug(slug)).toBe('RESERVED')
    }
  )

  it('allows a reserved word as part of a longer name', () => {
    // "admin" is reserved; "admin-club" collides with nothing.
    expect(validateSlug('admin-club')).toBeNull()
  })
})

describe('validateSlug — UUID-shaped', () => {
  it('refuses a slug shaped like a UUID', () => {
    // The route resolver picks id-vs-slug by shape, so a UUID-shaped slug would
    // be looked up by id and 404 — unreachable rather than merely confusing.
    expect(validateSlug('550e8400-e29b-41d4-a716-446655440000')).toBe('UUID_SHAPED')
  })
})

describe('slugProblemMessage', () => {
  it('gives a usable sentence for every problem', () => {
    for (const problem of ['FORMAT', 'TOO_SHORT', 'TOO_LONG', 'RESERVED', 'UUID_SHAPED'] as const) {
      const message = slugProblemMessage(problem)
      expect(message.length).toBeGreaterThan(0)
      expect(message).toMatch(/\.$/)
    }
  })
})

describe('looksLikeUuid', () => {
  it('recognises a UUID, so the route resolves it by id', () => {
    expect(looksLikeUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(looksLikeUuid('550E8400-E29B-41D4-A716-446655440000')).toBe(true)
  })

  it('treats an ordinary slug as a slug', () => {
    expect(looksLikeUuid('cebu-smashers')).toBe(false)
  })

  it('does not mistake a hyphenated name for a UUID', () => {
    expect(looksLikeUuid('a-b-c-d-e')).toBe(false)
  })
})
