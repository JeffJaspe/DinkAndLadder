/**
 * Presentation layer for the rating tiers.
 *
 * The tier *bands* are a domain rule and live server-side in
 * `server/domains/rating/data/question-bank.ts`. This module does not redefine
 * them — it mirrors them for the client (server domain code must not be
 * imported into the browser bundle) and adds the one thing the domain has no
 * business knowing: which design token each tier is drawn in.
 *
 * `tests/unit/rating-tiers.spec.ts` asserts this mirror matches the server
 * table exactly, so the duplication cannot silently drift.
 *
 * NOTE ON THE MOCKUPS: the approved designs show ELO-style ratings ("1854")
 * with four medal tiers (Gold 1900+, Silver 1700–1899, Bronze 1400–1699,
 * Iron <1400). This platform does not use that scale. Ratings are
 * `numeric(5,3)` constrained to 2.000–8.000 (DUPR-style), with nine named
 * bands. Per CLAUDE.md §7 the implemented rule wins over an invented one, so
 * the real bands are used — grouped onto the mockup's four-medal *visual*
 * language so the design intent survives the data being different.
 */

export interface RatingTierView {
  min: number
  max: number
  name: string
  description: string
  /** Text token, e.g. `text-rating-gold` */
  textClass: string
  /** Soft background token for pills */
  softClass: string
}

/**
 * Nine bands, mirroring RATING_TIERS in the rating domain.
 *
 * The four medal tokens map onto them as a ladder — two or three bands per
 * medal — because nine separate colours would be noise at badge size and the
 * mockup's visual system only has four steps.
 */
export const RATING_TIER_VIEWS: RatingTierView[] = [
  {
    min: 2.0,
    max: 2.49,
    name: 'Beginner',
    description: 'Just starting your pickleball journey',
    textClass: 'text-rating-iron',
    softClass: 'bg-rating-iron/15'
  },
  {
    min: 2.5,
    max: 2.99,
    name: 'Novice',
    description: 'Learning the fundamentals',
    textClass: 'text-rating-iron',
    softClass: 'bg-rating-iron/15'
  },
  {
    min: 3.0,
    max: 3.49,
    name: 'Intermediate',
    description: 'Developing consistent play',
    textClass: 'text-rating-bronze',
    softClass: 'bg-rating-bronze/15'
  },
  {
    min: 3.5,
    max: 3.99,
    name: 'Advanced',
    description: 'Strong recreational player',
    textClass: 'text-rating-bronze',
    softClass: 'bg-rating-bronze/15'
  },
  {
    min: 4.0,
    max: 4.49,
    name: 'Skilled',
    description: 'Competitive club player',
    textClass: 'text-rating-silver',
    softClass: 'bg-rating-silver/15'
  },
  {
    min: 4.5,
    max: 4.99,
    name: 'Expert',
    description: 'Tournament-ready player',
    textClass: 'text-rating-silver',
    softClass: 'bg-rating-silver/15'
  },
  {
    min: 5.0,
    max: 5.49,
    name: 'Pro',
    description: 'Elite competitive player',
    textClass: 'text-rating-gold',
    softClass: 'bg-rating-gold/15'
  },
  {
    min: 5.5,
    max: 5.99,
    name: 'Elite',
    description: 'Top-tier competitor',
    textClass: 'text-rating-gold',
    softClass: 'bg-rating-gold/15'
  },
  {
    min: 6.0,
    max: 8.0,
    name: 'Champion',
    description: 'Professional level',
    textClass: 'text-rating-gold',
    softClass: 'bg-rating-gold/15'
  }
]

export const RATING_MIN = 2.0
export const RATING_MAX = 8.0

/** The band a rating falls in. Out-of-range values clamp to the nearest end. */
export function tierForRating(rating: number): RatingTierView {
  for (const tier of RATING_TIER_VIEWS) {
    if (rating >= tier.min && rating <= tier.max) return tier
  }
  return rating > RATING_MAX
    ? RATING_TIER_VIEWS[RATING_TIER_VIEWS.length - 1]
    : RATING_TIER_VIEWS[0]
}

/**
 * Ratings are `numeric(5,3)`, so three decimals is the stored precision and the
 * canonical display format. Anything less would show two different players as
 * the same number.
 */
export function formatRating(rating: number | null | undefined): string {
  if (rating === null || rating === undefined || Number.isNaN(rating)) return '—'
  return rating.toFixed(3)
}

/** Signed delta for trend displays: `+0.120`, `-0.045`, `0.000`. */
export function formatRatingDelta(delta: number | null | undefined): string {
  if (delta === null || delta === undefined || Number.isNaN(delta)) return '—'
  return `${delta > 0 ? '+' : ''}${delta.toFixed(3)}`
}
