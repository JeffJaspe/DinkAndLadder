/**
 * The client mirrors the rating tier bands (server domain code cannot be
 * imported into the browser bundle). This test is what makes that mirror safe:
 * if anyone edits one table, the other stops matching and this fails.
 */

import { describe, expect, it } from 'vitest'
import { RATING_TIERS, getTierForRating } from '../../server/domains/rating/data/question-bank'
import {
  RATING_MAX,
  RATING_MIN,
  RATING_TIER_VIEWS,
  formatRating,
  formatRatingDelta,
  tierForRating
} from '../../utils/rating-tiers'

describe('rating tiers', () => {
  it('mirrors the server tier table band for band', () => {
    expect(RATING_TIER_VIEWS).toHaveLength(RATING_TIERS.length)

    RATING_TIERS.forEach((server, i) => {
      const view = RATING_TIER_VIEWS[i]
      expect(view.name, `band ${i} name`).toBe(server.name)
      expect(view.min, `band ${i} min`).toBe(server.min)
      expect(view.max, `band ${i} max`).toBe(server.max)
      expect(view.description, `band ${i} description`).toBe(server.description)
    })
  })

  it('agrees with the server on which band a rating falls in', () => {
    // Walk the whole legal range at the stored precision boundary.
    for (let r = RATING_MIN; r <= RATING_MAX; r = Math.round((r + 0.1) * 100) / 100) {
      expect(tierForRating(r).name, `rating ${r}`).toBe(getTierForRating(r).name)
    }
  })

  it('covers the legal range with no gaps', () => {
    expect(RATING_TIER_VIEWS[0].min).toBe(RATING_MIN)
    expect(RATING_TIER_VIEWS[RATING_TIER_VIEWS.length - 1].max).toBe(RATING_MAX)

    for (let i = 1; i < RATING_TIER_VIEWS.length; i++) {
      const gap = RATING_TIER_VIEWS[i].min - RATING_TIER_VIEWS[i - 1].max
      // Bands are inclusive and quantised to 0.01, so consecutive bands sit
      // exactly 0.01 apart. A larger gap would leave ratings untiered.
      expect(Number(gap.toFixed(2)), `gap before band ${i}`).toBeCloseTo(0.01, 2)
    }
  })

  it('clamps out-of-range ratings instead of throwing', () => {
    expect(tierForRating(0).name).toBe('Beginner')
    expect(tierForRating(99).name).toBe('Champion')
  })

  it('only uses tokens that exist in the design system', () => {
    const allowed = /^text-rating-(iron|bronze|silver|gold)$/
    for (const tier of RATING_TIER_VIEWS) {
      expect(tier.textClass, tier.name).toMatch(allowed)
      expect(tier.softClass, tier.name).toMatch(/^bg-rating-(iron|bronze|silver|gold)\/15$/)
    }
  })

  it('formats at the stored numeric(5,3) precision', () => {
    expect(formatRating(4.25)).toBe('4.250')
    expect(formatRating(3)).toBe('3.000')
    expect(formatRating(null)).toBe('—')
    expect(formatRating(undefined)).toBe('—')
  })

  it('signs rating deltas', () => {
    expect(formatRatingDelta(0.12)).toBe('+0.120')
    expect(formatRatingDelta(-0.045)).toBe('-0.045')
    expect(formatRatingDelta(0)).toBe('0.000')
    expect(formatRatingDelta(null)).toBe('—')
  })
})
