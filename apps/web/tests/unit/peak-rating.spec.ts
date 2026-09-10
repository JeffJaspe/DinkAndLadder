import { describe, it, expect } from 'vitest'
import { pickPeakRating } from '~/server/domains/analytics/services/peak-rating'

describe('pickPeakRating', () => {
  it('remembers a peak the player has since slid below', () => {
    // F-26: this returned 3.8, the current rating, under the name "highest".
    expect(pickPeakRating(3.8, 4.2, 3.5)).toBe(4.2)
  })

  it('counts the rating a player started from', () => {
    // Seeded at 3.5 and has only ever lost: the peak is the seed, and it is
    // nobody's new_rating.
    expect(pickPeakRating(3.4, 3.4, 3.5)).toBe(3.5)
  })

  it('never reports a peak below the current rating', () => {
    // player_ratings can hold a value no transaction produced. A peak printed
    // below the current rating beside it would be an obvious lie.
    expect(pickPeakRating(4.5, 4.0, 3.9)).toBe(4.5)
  })

  it('falls back to the current rating when there is no history', () => {
    expect(pickPeakRating(3.75, null, null)).toBe(3.75)
  })

  it('uses history when there is no current rating', () => {
    expect(pickPeakRating(null, 4.1, 3.6)).toBe(4.1)
  })

  it('is null for a player with no rating at all', () => {
    // Null, not 0 — an unrated player has no peak, and 0.0 is a real point on
    // the 2.000-8.000 scale.
    expect(pickPeakRating(null, null, null)).toBeNull()
  })

  it('keeps a genuine zero rather than treating it as missing', () => {
    expect(pickPeakRating(0, null, null)).toBe(0)
  })

  it('ignores NaN and Infinity instead of poisoning the maximum', () => {
    // Math.max(4.2, NaN) is NaN, which would render as "NaN" on the profile.
    expect(pickPeakRating(Number.NaN, 4.2, null)).toBe(4.2)
    expect(pickPeakRating(Number.POSITIVE_INFINITY, 4.2, null)).toBe(4.2)
    expect(pickPeakRating(Number.NaN, null, null)).toBeNull()
  })

  it('is order-independent across the three sources', () => {
    expect(pickPeakRating(4.9, 3.0, 3.0)).toBe(4.9)
    expect(pickPeakRating(3.0, 4.9, 3.0)).toBe(4.9)
    expect(pickPeakRating(3.0, 3.0, 4.9)).toBe(4.9)
  })
})
