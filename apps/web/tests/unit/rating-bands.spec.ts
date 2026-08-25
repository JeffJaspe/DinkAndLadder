import { describe, expect, it } from 'vitest'
import {
  bandExclusionReason,
  isRatingInBand,
  ratingRangeLabel,
  roundToBand
} from '~/utils/rating-bands'

describe('roundToBand', () => {
  it('rounds a stored rating to the ladder’s one-decimal units', () => {
    expect(roundToBand(2.91)).toBe(2.9)
    expect(roundToBand(3.549)).toBe(3.5)
    expect(roundToBand(3.55)).toBe(3.6)
    expect(roundToBand(4.0)).toBe(4.0)
  })
})

describe('isRatingInBand', () => {
  // The ladder as seeded by 032: no two bands claim the same tenth.
  const INTERMEDIATE = [3.0, 3.5] as const
  const ADVANCED = [3.6, 4.5] as const

  it('places a rating that falls between two bands in exactly one of them', () => {
    // The case a naive min<=r<=max check drops on the floor.
    expect(isRatingInBand(3.549, ...INTERMEDIATE)).toBe(true)
    expect(isRatingInBand(3.549, ...ADVANCED)).toBe(false)

    expect(isRatingInBand(3.55, ...INTERMEDIATE)).toBe(false)
    expect(isRatingInBand(3.55, ...ADVANCED)).toBe(true)
  })

  it('leaves no gap anywhere along the ladder', () => {
    const ladder: Array<[number | null, number | null]> = [
      [2.0, 2.4],
      [2.5, 2.9],
      [3.0, 3.5],
      [3.6, 4.5],
      [4.6, 5.5],
      [5.6, null]
    ]
    // Every thousandth from 2.000 to 8.000 must match exactly one band.
    for (let r = 2.0; r <= 8.0; r = Math.round((r + 0.001) * 1000) / 1000) {
      const hits = ladder.filter(([min, max]) => isRatingInBand(r, min, max))
      expect(hits, `rating ${r.toFixed(3)} matched ${hits.length} bands`).toHaveLength(1)
    }
  })

  it('treats a null bound as open-ended, not as zero', () => {
    expect(isRatingInBand(7.5, 5.6, null)).toBe(true)
    expect(isRatingInBand(2.1, null, 2.4)).toBe(true)
    expect(isRatingInBand(2.5, null, 2.4)).toBe(false)
  })

  it('admits anyone to a band with neither bound', () => {
    expect(isRatingInBand(3.2, null, null)).toBe(true)
    // Including someone with no rating at all — "Open" means open.
    expect(isRatingInBand(null, null, null)).toBe(true)
  })

  it('refuses an unrated player from a band that states a bound', () => {
    expect(isRatingInBand(null, 3.0, 3.5)).toBe(false)
    expect(isRatingInBand(null, null, 2.4)).toBe(false)
  })
})

describe('ratingRangeLabel', () => {
  it('writes each band the way the ladder states it', () => {
    expect(ratingRangeLabel(3.0, 3.5)).toBe('3.0–3.5')
    expect(ratingRangeLabel(3.6, 4.5)).toBe('3.6–4.5')
    expect(ratingRangeLabel(5.6, null)).toBe('5.6+')
    expect(ratingRangeLabel(null, 2.4)).toBe('Up to 2.4')
    expect(ratingRangeLabel(null, null)).toBe('Any rating')
  })

  it('always shows one decimal, whatever numeric came back from the DB', () => {
    expect(ratingRangeLabel(3, 4)).toBe('3.0–4.0')
  })
})

describe('bandExclusionReason', () => {
  it('is null for an eligible player', () => {
    expect(bandExclusionReason(3.2, 3.0, 3.5)).toBeNull()
  })

  it('quotes the player’s own rating and the band that excluded them', () => {
    expect(bandExclusionReason(3.55, 3.0, 3.5)).toBe(
      "Your rating (3.550) is outside this category's range (3.0–3.5)."
    )
  })

  it('says something useful to a player who has no rating yet', () => {
    expect(bandExclusionReason(null, 3.0, 3.5)).toContain('do not have one yet')
  })
})
