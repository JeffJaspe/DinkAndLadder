/**
 * A tournament this player entered, with their finish if they reached a final.
 *
 * Carries everything the profile's Tournaments tab needs: the event context,
 * the category, the placement when it was a podium finish, and a link back to
 * the draw. Placements beyond 2nd are not derived — single elimination has two
 * losing semi-finalists with no ordering between them without a consolation
 * match, and that rule is unresolved (ADR-010).
 */
export interface TournamentHistoryDto {
  registration_id: string
  tournament_id: string
  tournament_name: string | null
  category_id: string | null
  category_name: string | null
  event_id: string | null
  event_name: string | null
  /** When they played — the tournament's start date, not the registration. */
  played_at: string | null
  /** 1 = champion, 2 = finalist, null = participated without reaching final. */
  placement: 1 | 2 | null
  /** Where the draw page lives. */
  href: string | null
}
