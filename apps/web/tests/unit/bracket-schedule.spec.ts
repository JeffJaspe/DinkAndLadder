import { describe, expect, it } from 'vitest'
import {
  flattenBracket,
  formatScoreLine,
  isDrawDecided,
  nextMatch,
  nextMatchLabel,
  participantLabel,
  partitionSchedule
} from '~/utils/bracket-schedule'
import type { BracketDto, BracketMatchDto } from '~/server/domains/event/dto/bracket.dto'

function match(overrides: Partial<BracketMatchDto>): BracketMatchDto {
  return {
    id: 'bm-1',
    tournament_id: 'tournament-1',
    round: 1,
    position: 1,
    match_id: null,
    participant1_registration_id: null,
    participant2_registration_id: null,
    winner_registration_id: null,
    status: 'pending',
    scheduled_at: null,
    category_id: 'cat-1',
    participant1: null,
    participant2: null,
    scores: [],
    ...overrides
  }
}

function bracket(rounds: { round: number; matches: BracketMatchDto[] }[]): BracketDto {
  return { tournament_id: 'tournament-1', category_id: 'cat-1', locked: false, rounds }
}

function entrant(name: string, partner: string | null = null) {
  return {
    registration_id: `reg-${name}`,
    display_name: name,
    rating: null,
    partner_display_name: partner
  }
}

describe('bracket-schedule', () => {
  describe('flattenBracket', () => {
    it('orders by round then position, not by the order rounds arrive', () => {
      const result = flattenBracket(
        bracket([
          { round: 2, matches: [match({ id: 'later', round: 2, position: 1 })] },
          {
            round: 1,
            matches: [
              match({ id: 'second', round: 1, position: 2 }),
              match({ id: 'first', round: 1, position: 1 })
            ]
          }
        ])
      )

      expect(result.map((e) => e.match.id)).toEqual(['first', 'second', 'later'])
    })

    it('returns nothing for a category with no draw', () => {
      expect(flattenBracket(null)).toEqual([])
    })
  })

  describe('partitionSchedule', () => {
    it('splits by what can be played now, later, and what is done', () => {
      const result = partitionSchedule(
        bracket([
          {
            round: 1,
            matches: [
              match({ id: 'ready', status: 'ready', position: 1 }),
              match({ id: 'playing', status: 'in_progress', position: 2 }),
              match({ id: 'waiting', status: 'pending', position: 3 }),
              match({ id: 'done', status: 'completed', position: 4 }),
              match({ id: 'bye', status: 'bye', position: 5 })
            ]
          }
        ])
      )

      expect(result.upNext.map((e) => e.match.id)).toEqual(['ready', 'playing'])
      expect(result.waiting.map((e) => e.match.id)).toEqual(['waiting'])
      // A bye was never played, but it is decided, so it belongs with the past.
      expect(result.done.map((e) => e.match.id)).toEqual(['done', 'bye'])
    })
  })

  describe('nextMatch', () => {
    it('prefers a match already on court over one merely ready', () => {
      const result = nextMatch(
        bracket([
          {
            round: 1,
            matches: [
              match({ id: 'ready', status: 'ready', position: 1 }),
              match({ id: 'on-court', status: 'in_progress', position: 2 })
            ]
          }
        ])
      )

      expect(result?.match.id).toBe('on-court')
    })

    it('falls back to the earliest ready match', () => {
      const result = nextMatch(
        bracket([
          {
            round: 1,
            matches: [
              match({ id: 'second', status: 'ready', position: 2 }),
              match({ id: 'first', status: 'ready', position: 1 })
            ]
          }
        ])
      )

      expect(result?.match.id).toBe('first')
    })

    it('is null when everything is waiting on an earlier result', () => {
      expect(nextMatch(bracket([{ round: 1, matches: [match({ status: 'pending' })] }]))).toBeNull()
    })

    it('is null when there is no draw at all', () => {
      expect(nextMatch(null)).toBeNull()
    })
  })

  describe('participantLabel', () => {
    it('renders a doubles pair', () => {
      const m = match({ participant1: entrant('A. Cruz', 'M. Reyes') })
      expect(participantLabel(m, 1)).toBe('A. Cruz / M. Reyes')
    })

    it('renders a singles entrant alone', () => {
      const m = match({ participant1: entrant('A. Cruz') })
      expect(participantLabel(m, 1)).toBe('A. Cruz')
    })

    it('says TBD for a slot nothing has reached', () => {
      expect(participantLabel(match({}), 2)).toBe('TBD')
    })
  })

  describe('nextMatchLabel', () => {
    it('names both sides of the next match', () => {
      const result = nextMatchLabel(
        bracket([
          {
            round: 1,
            matches: [
              match({
                status: 'ready',
                participant1: entrant('A. Cruz'),
                participant2: entrant('J. Lim')
              })
            ]
          }
        ])
      )

      expect(result).toBe('A. Cruz vs J. Lim')
    })

    it('is null when nothing is playable', () => {
      expect(nextMatchLabel(null)).toBeNull()
    })
  })

  describe('formatScoreLine', () => {
    it('joins sets in set order regardless of how they arrived', () => {
      const result = formatScoreLine([
        { set_number: 2, participant1_score: 8, participant2_score: 11 },
        { set_number: 1, participant1_score: 11, participant2_score: 9 },
        { set_number: 3, participant1_score: 11, participant2_score: 6 }
      ])

      expect(result).toBe('11-9, 8-11, 11-6')
    })

    it('is empty when no sets were recorded', () => {
      expect(formatScoreLine([])).toBe('')
    })
  })

  describe('isDrawDecided', () => {
    it('is true when every match is completed or a bye', () => {
      expect(
        isDrawDecided(
          bracket([
            {
              round: 1,
              matches: [
                match({ id: 'a', status: 'completed', position: 1 }),
                match({ id: 'b', status: 'bye', position: 2 })
              ]
            }
          ])
        )
      ).toBe(true)
    })

    it('is false while any match is still open', () => {
      expect(
        isDrawDecided(
          bracket([
            {
              round: 1,
              matches: [
                match({ id: 'a', status: 'completed', position: 1 }),
                match({ id: 'b', status: 'ready', position: 2 })
              ]
            }
          ])
        )
      ).toBe(false)
    })

    it('is false for a category with no draw — an empty draw is not a finished one', () => {
      expect(isDrawDecided(null)).toBe(false)
      expect(isDrawDecided(bracket([]))).toBe(false)
    })
  })
})
