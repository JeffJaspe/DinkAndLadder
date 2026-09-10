/**
 * The highest rating a player has ever held, from the three numbers that can
 * possibly carry it.
 *
 * Pure and separate from the service so the rule can be tested without a
 * Supabase client. The rule is the part that was wrong (F-26): the profile
 * reported the *current* rating as the highest, so a player who peaked at 4.2
 * and slid to 3.8 was told their best ever was 3.8 — the one number on a
 * profile whose whole job is to remember a better day.
 *
 * - `current` is `player_ratings.rating_value`. It is included because that
 *   table can hold a value no transaction produced (a directly-seeded rating,
 *   or a future admin adjustment), and a peak shown below the current rating
 *   printed beside it would be an obvious lie.
 * - `reached` is the largest `new_rating` in `rating_transactions` — every
 *   rating the player moved *to*.
 * - `started` is the largest `old_rating` — this only ever adds the value the
 *   player began from, since every other `old_rating` is some earlier
 *   `new_rating`. A player seeded at 3.5 who has only ever lost peaked at 3.5.
 *
 * Null means "no rating on record", not zero: an unrated player has no peak,
 * and 0.0 is a real point on a 2.000–8.000 scale.
 */
export function pickPeakRating(
  current: number | null,
  reached: number | null,
  started: number | null
): number | null {
  const known = [current, reached, started].filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value)
  )
  return known.length > 0 ? Math.max(...known) : null
}
