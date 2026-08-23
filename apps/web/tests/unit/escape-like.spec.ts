import { describe, expect, it } from 'vitest'
import { escapeLikePattern } from '../../server/domains/shared/escape-like'

// String.raw keeps these readable — the expected values are full of
// backslashes, and doubling them in ordinary quotes hides what is asserted.
describe('escapeLikePattern', () => {
  it('leaves ordinary search terms untouched', () => {
    expect(escapeLikePattern('Jeff')).toBe('Jeff')
    expect(escapeLikePattern('Molino IV')).toBe('Molino IV')
  })

  it('escapes the percent wildcard so it matches literally', () => {
    // Unescaped, a bare "%" matched every row and defeated the filter entirely.
    expect(escapeLikePattern('%')).toBe(String.raw`\%`)
    expect(escapeLikePattern('50%off')).toBe(String.raw`50\%off`)
  })

  it('escapes the underscore wildcard', () => {
    // "a_b" previously also matched "axb".
    expect(escapeLikePattern('a_b')).toBe(String.raw`a\_b`)
  })

  it('escapes backslashes first so a typed backslash survives', () => {
    expect(escapeLikePattern(String.raw`a\b`)).toBe(String.raw`a\\b`)
    expect(escapeLikePattern(String.raw`\%`)).toBe(String.raw`\\\%`)
  })

  it('handles an empty string', () => {
    expect(escapeLikePattern('')).toBe('')
  })
})
