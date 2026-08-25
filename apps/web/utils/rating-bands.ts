/**
 * Which rating band a player falls into, and how a band is written down.
 *
 * The category ladder is stated in whole tenths — 3.0–3.5, then 3.6–4.5, then
 * 4.6–5.5 — so that no two bands claim the same number. Ratings, however, are
 * `numeric(5,3)`: a real player is 2.910 or 3.550, and comparing those against
 * a ladder written in tenths leaves gaps. 3.550 is above 3.5 and below 3.6, so
 * a naive `min <= r && r <= max` puts it in NO band at all.
 *
 * The rule that closes the gap is to round the rating to one decimal FIRST and
 * compare in the ladder's own units. 3.550 → 3.6 → Advanced; 3.549 → 3.5 →
 * Intermediate. Every rating between two bands lands in exactly one of them,
 * and the rule is explainable to the player it affects: your rating to one
 * decimal picks your band.
 *
 * Both the eligibility check on registration and the label on the card go
 * through here, so the number a player is refused by is the number they were
 * shown.
 */

/** Ratings are stored to three decimals; a band is stated to one. */
export function roundToBand(rating: number): number {
  return Math.round(rating * 10) / 10
}

/**
 * A null bound is open-ended, not zero — "5.6+" and "up to 2.4" are both real
 * bands, and "Open" is a band with neither bound.
 */
export function isRatingInBand(
  rating: number | null,
  minRating: number | null,
  maxRating: number | null
): boolean {
  if (minRating == null && maxRating == null) return true
  if (rating == null) return false

  const banded = roundToBand(rating)
  if (minRating != null && banded < roundToBand(minRating)) return false
  if (maxRating != null && banded > roundToBand(maxRating)) return false
  return true
}

/** One decimal, always — "3.5", never "3.5000000001" or "3". */
export function formatBandBound(value: number): string {
  return roundToBand(value).toFixed(1)
}

/**
 * How a band reads on a card. Previously duplicated verbatim in CategoryCard
 * and CategoryCreateCard, which is exactly the kind of pair that drifts.
 */
export function ratingRangeLabel(minRating: number | null, maxRating: number | null): string {
  if (minRating == null && maxRating == null) return 'Any rating'
  if (minRating == null) return `Up to ${formatBandBound(maxRating!)}`
  if (maxRating == null) return `${formatBandBound(minRating)}+`
  return `${formatBandBound(minRating)}–${formatBandBound(maxRating)}`
}

/**
 * Why a player cannot enter, in the words of the band that excluded them.
 * Returns null when they are eligible.
 */
export function bandExclusionReason(
  rating: number | null,
  minRating: number | null,
  maxRating: number | null
): string | null {
  if (isRatingInBand(rating, minRating, maxRating)) return null
  if (rating == null) {
    return 'This category is limited by rating, and you do not have one yet. Play a rated match first.'
  }
  return (
    `Your rating (${rating.toFixed(3)}) is outside this category's range ` +
    `(${ratingRangeLabel(minRating, maxRating)}).`
  )
}
