import { describe, expect, it } from 'vitest'
import {
  REDACTED_PLAYER_LABEL,
  isMatchPublishable,
  mayPublishMatchHistory,
  redactParticipants,
  type ParticipantPrivacy,
  type RawParticipant
} from '../../server/domains/match/services/match-history-visibility'

const PUBLISHES: ParticipantPrivacy = { profile_visibility: 'public', show_match_history: true }
const OPTED_OUT: ParticipantPrivacy = { profile_visibility: 'public', show_match_history: false }
const PRIVATE_PROFILE: ParticipantPrivacy = {
  profile_visibility: 'private',
  show_match_history: true
}

/** A doubles match: teams 1 and 2, two players each. */
const DOUBLES: RawParticipant[] = [
  { player_id: 'marlon', team_number: 1, display_name: 'Marlon Reyes' },
  { player_id: 'ana', team_number: 1, display_name: 'Ana Lim' },
  { player_id: 'bea', team_number: 2, display_name: 'Bea Cruz' },
  { player_id: 'caloy', team_number: 2, display_name: 'Caloy Tan' }
]

function privacy(entries: Record<string, ParticipantPrivacy>) {
  return new Map(Object.entries(entries))
}

describe('match-history-visibility', () => {
  describe('mayPublishMatchHistory', () => {
    it('requires both a public profile and the opt-in', () => {
      expect(mayPublishMatchHistory(PUBLISHES)).toBe(true)
      expect(mayPublishMatchHistory(OPTED_OUT)).toBe(false)
      // A private profile shows nothing regardless of the match-history flag —
      // profile_visibility is the outer gate.
      expect(mayPublishMatchHistory(PRIVATE_PROFILE)).toBe(false)
    })

    it('treats an unknown player as not publishing', () => {
      expect(mayPublishMatchHistory(undefined)).toBe(false)
      expect(mayPublishMatchHistory(null)).toBe(false)
    })
  })

  describe('isMatchPublishable', () => {
    it('one participant publishing is enough to show the match', () => {
      const map = privacy({
        marlon: PUBLISHES,
        ana: OPTED_OUT,
        bea: OPTED_OUT,
        caloy: OPTED_OUT
      })
      expect(isMatchPublishable(DOUBLES, map)).toBe(true)
    })

    it('a match nobody publishes stays hidden', () => {
      const map = privacy({
        marlon: OPTED_OUT,
        ana: OPTED_OUT,
        bea: PRIVATE_PROFILE,
        caloy: OPTED_OUT
      })
      expect(isMatchPublishable(DOUBLES, map)).toBe(false)
    })
  })

  describe('redactParticipants', () => {
    it('names only the players who opted in', () => {
      const map = privacy({
        marlon: PUBLISHES,
        ana: OPTED_OUT,
        bea: PUBLISHES,
        caloy: PRIVATE_PROFILE
      })
      const result = redactParticipants(DOUBLES, map)

      expect(result.map((p) => p.display_name)).toEqual([
        'Marlon Reyes',
        REDACTED_PLAYER_LABEL,
        'Bea Cruz',
        REDACTED_PLAYER_LABEL
      ])
      expect(result.map((p) => p.redacted)).toEqual([false, true, false, true])
    })

    it('drops the player_id along with the name', () => {
      // An id is one public lookup away from the name it was meant to hide:
      // player_profiles is readable by design.
      const map = privacy({ marlon: PUBLISHES, ana: OPTED_OUT, bea: OPTED_OUT, caloy: OPTED_OUT })
      const result = redactParticipants(DOUBLES, map)

      expect(result[0].player_id).toBe('marlon')
      for (const hidden of result.slice(1)) {
        expect(hidden.player_id).toBeNull()
      }
    })

    it('keeps team numbers intact so the scoreline still reads', () => {
      const map = privacy({ marlon: PUBLISHES, ana: OPTED_OUT, bea: OPTED_OUT, caloy: OPTED_OUT })
      expect(redactParticipants(DOUBLES, map).map((p) => p.team_number)).toEqual([1, 1, 2, 2])
    })

    it('redacts a participant the privacy map never mentions', () => {
      // Fail closed: a missing row means "no evidence they opted in", never
      // "assume they did".
      const result = redactParticipants(DOUBLES, privacy({ marlon: PUBLISHES }))
      expect(result.filter((p) => p.redacted)).toHaveLength(3)
    })

    it('redacts everyone when nobody opted in', () => {
      const result = redactParticipants(DOUBLES, privacy({}))
      expect(result.every((p) => p.redacted)).toBe(true)
      expect(result.every((p) => p.display_name === REDACTED_PLAYER_LABEL)).toBe(true)
    })

    it('handles singles', () => {
      const singles: RawParticipant[] = [
        { player_id: 'marlon', team_number: 1, display_name: 'Marlon Reyes' },
        { player_id: 'ana', team_number: 2, display_name: 'Ana Lim' }
      ]
      const result = redactParticipants(singles, privacy({ marlon: PUBLISHES, ana: OPTED_OUT }))
      expect(result[0].display_name).toBe('Marlon Reyes')
      expect(result[1].display_name).toBe(REDACTED_PLAYER_LABEL)
    })

    it('carries result_status through for both visible and redacted players', () => {
      const withStatus: RawParticipant[] = [
        { player_id: 'marlon', team_number: 1, display_name: 'Marlon Reyes', result_status: 'won' },
        { player_id: 'ana', team_number: 2, display_name: 'Ana Lim', result_status: 'lost' }
      ]
      const result = redactParticipants(withStatus, privacy({ marlon: PUBLISHES }))
      expect(result.map((p) => p.result_status)).toEqual(['won', 'lost'])
    })
  })
})
