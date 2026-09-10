import { describe, it, expect } from 'vitest'
import {
  ACTIVITY_TYPES,
  FeedQueryValidationError,
  isActivityType,
  parseFeedQuery,
  parsePagination
} from '~/server/domains/activity/dto/activity.dto'

describe('parsePagination', () => {
  it('defaults an absent limit and offset', () => {
    expect(parsePagination({})).toEqual({ limit: 20, offset: 0 })
  })

  it('honours explicit values', () => {
    expect(parsePagination({ limit: '25', offset: '50' })).toEqual({ limit: 25, offset: 50 })
  })

  it('caps the limit at the maximum instead of silently clamping', () => {
    // The old code did Math.min(200, 50) and served 50 for a request that asked
    // for 200. A caller paging by 200 would then see every page overlap.
    expect(() => parsePagination({ limit: '200' })).toThrow(FeedQueryValidationError)
  })

  it('rejects a negative offset', () => {
    // This is F-27: it reached the query as .range(-5, 14) / a negative SQL
    // OFFSET, which is a 500.
    expect(() => parsePagination({ offset: '-5' })).toThrow(/between 0/)
  })

  it('rejects a zero or negative limit', () => {
    expect(() => parsePagination({ limit: '0' })).toThrow(FeedQueryValidationError)
    expect(() => parsePagination({ limit: '-1' })).toThrow(FeedQueryValidationError)
  })

  it('rejects a partly-numeric value rather than reading the prefix', () => {
    expect(() => parsePagination({ limit: '20abc' })).toThrow(/whole number/)
  })

  it('rejects a non-numeric value rather than falling back to the default', () => {
    expect(() => parsePagination({ offset: 'first' })).toThrow(/whole number/)
  })

  it('treats an empty value as absent', () => {
    expect(parsePagination({ limit: '', offset: '' })).toEqual({ limit: 20, offset: 0 })
  })

  it('accepts a caller-supplied default and maximum', () => {
    expect(parsePagination({}, { defaultLimit: 10, maxLimit: 100 })).toEqual({
      limit: 10,
      offset: 0
    })
    expect(parsePagination({ limit: '80' }, { maxLimit: 100 }).limit).toBe(80)
  })

  it('names the field it rejected', () => {
    try {
      parsePagination({ offset: '-1' })
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(FeedQueryValidationError)
      expect((err as FeedQueryValidationError).field).toBe('offset')
    }
  })
})

describe('isActivityType', () => {
  it('accepts every declared type', () => {
    for (const type of ACTIVITY_TYPES) {
      expect(isActivityType(type)).toBe(true)
    }
  })

  it('rejects an unknown type', () => {
    expect(isActivityType('match.deleted')).toBe(false)
  })

  it('does not accept an inherited Object property as a type', () => {
    expect(isActivityType('constructor')).toBe(false)
    expect(isActivityType('toString')).toBe(false)
  })
})

describe('parseFeedQuery', () => {
  it('returns no filters for an empty query', () => {
    expect(parseFeedQuery({})).toEqual({
      limit: 20,
      offset: 0,
      types: undefined,
      since: undefined
    })
  })

  it('parses a comma-separated types list', () => {
    expect(parseFeedQuery({ types: 'match.verified,rating.changed' }).types).toEqual([
      'match.verified',
      'rating.changed'
    ])
  })

  it('rejects an unknown activity type', () => {
    // F-27: this was cast to ActivityType[] with no membership check and sent
    // straight to the query.
    expect(() => parseFeedQuery({ types: 'match.verified,drop_table' })).toThrow(
      /unknown activity type/
    )
  })

  it('trims and de-duplicates types', () => {
    expect(parseFeedQuery({ types: ' match.verified , match.verified ' }).types).toEqual([
      'match.verified'
    ])
  })

  it('treats an empty types list as no filter, not as match-nothing', () => {
    expect(parseFeedQuery({ types: '' }).types).toBeUndefined()
    expect(parseFeedQuery({ types: ',,' }).types).toBeUndefined()
  })

  it('normalises since to an ISO timestamp', () => {
    expect(parseFeedQuery({ since: '2026-01-31T00:00:00Z' }).since).toBe('2026-01-31T00:00:00.000Z')
  })

  it('rejects a malformed since instead of letting Postgres 500 on it', () => {
    expect(() => parseFeedQuery({ since: 'yesterday' })).toThrow(/ISO 8601/)
  })

  it('treats an empty since as absent', () => {
    expect(parseFeedQuery({ since: '' }).since).toBeUndefined()
  })

  it('never derives scope from the query string', () => {
    // Scope is a product rule. ?scope=geo must not widen the feed to the public
    // firehose the community scope replaced.
    expect(parseFeedQuery({ scope: 'geo' })).not.toHaveProperty('scope', 'geo')
  })

  it('takes the last value of a repeated parameter', () => {
    expect(parseFeedQuery({ limit: ['10', '30'] }).limit).toBe(30)
  })

  it('rejects a nested object parameter', () => {
    expect(() => parseFeedQuery({ limit: { gt: 5 } })).toThrow(/single value/)
  })
})
