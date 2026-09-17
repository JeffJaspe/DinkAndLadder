/**
 * Who may be named in a published match history.
 *
 * A match is not one person's record. A doubles row carries four names, and
 * publishing your own history necessarily shows the matches you played — but it
 * must not name the people you played them against unless they publish too.
 * Their participation is their fact, not yours.
 *
 * So the rule splits in two, and only one half is row-level:
 *
 *   - the match ROW is publishable by any one participant who opted in;
 *   - each participant's NAME is gated by that participant.
 *
 * RLS cannot express the second half — it decides whole rows, and column grants
 * are not per-row either — which is why 067 adds no policy and this runs in the
 * API layer instead. See the 067 changelog header.
 *
 * Everything here is pure so the rule can be tested without a database.
 */

/** The privacy facts this module needs about one player. */
export interface ParticipantPrivacy {
  profile_visibility: 'public' | 'private'
  show_match_history: boolean
}

export interface RawParticipant {
  player_id: string
  team_number: number
  result_status?: string | null
  display_name?: string | null
}

export interface RedactedParticipant {
  player_id: string | null
  team_number: number
  result_status?: string | null
  display_name: string | null
  /** True when this participant chose not to publish their history. */
  redacted: boolean
}

/**
 * Shown in place of a name. Deliberately not "Unknown" or "Anonymous": nothing
 * failed and nobody is hiding, a player simply has not published their record.
 */
export const REDACTED_PLAYER_LABEL = 'Private player'

export function mayPublishMatchHistory(privacy: ParticipantPrivacy | undefined | null): boolean {
  if (!privacy) return false
  return privacy.profile_visibility === 'public' && privacy.show_match_history
}

/**
 * A match may appear in a published history when at least one of its players
 * publishes. In practice the caller has already narrowed to one player's
 * matches, so this is the guard for the row rather than a search.
 */
export function isMatchPublishable(
  participants: RawParticipant[],
  privacyByPlayerId: Map<string, ParticipantPrivacy>
): boolean {
  return participants.some((p) => mayPublishMatchHistory(privacyByPlayerId.get(p.player_id)))
}

/**
 * Names only the participants who publish.
 *
 * `player_id` is dropped along with the name, not kept alongside it — an id is
 * a lookup away from the name it was meant to hide, and `player_profiles` is
 * publicly readable by design.
 */
export function redactParticipants(
  participants: RawParticipant[],
  privacyByPlayerId: Map<string, ParticipantPrivacy>
): RedactedParticipant[] {
  return participants.map((p) => {
    const visible = mayPublishMatchHistory(privacyByPlayerId.get(p.player_id))
    return {
      player_id: visible ? p.player_id : null,
      team_number: p.team_number,
      result_status: p.result_status ?? null,
      display_name: visible ? (p.display_name ?? null) : REDACTED_PLAYER_LABEL,
      redacted: !visible
    }
  })
}
