/**
 * Shapes of the `player_profiles` embeds PostgREST returns on the listing
 * endpoints (event queue, event registrations, club rosters).
 *
 * These exist because the generated Supabase `Database` type is absent — see
 * the `types/database.types.ts` warning on every dev boot — so embedded
 * relations come back untyped and the endpoints had reached for `any`.
 * Declared once rather than per endpoint: several of them select the same
 * profile-plus-ratings shape.
 */
export interface PlayerRatingJoinRow {
  rating_type: string
  rating_value: number | null
}

export interface PlayerProfileJoinRow {
  id: string
  display_name: string | null
  province?: string | null
  city?: string | null
  barangay?: string | null
  player_ratings?: PlayerRatingJoinRow[] | null
}

/** Convenience: the singles rating out of an embedded profile, or null. */
export function singlesRatingOf(profile?: PlayerProfileJoinRow | null): number | null {
  return profile?.player_ratings?.find((r) => r.rating_type === 'singles')?.rating_value ?? null
}
