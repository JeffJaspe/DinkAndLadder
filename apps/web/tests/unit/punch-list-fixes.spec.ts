import { describe, it, expect } from 'vitest'
import {
  defaultMinPlayersToStart,
  effectiveMinPlayersToStart
} from '../../server/domains/event/dto/event.dto'
import { ncrAliasesFor } from '../../server/domains/player/repositories/player-profile.repository'
import { minPlayersForMixup, mixupShortfall } from '../../server/domains/event/services/mixup-scheduler'
import { queueModeLabel, queuePairsAutomatically } from '../../utils/queue-mode'
import { eventKindLabel, eventKindQualifiers, eventTypesForFilter } from '../../utils/event-type'
import { toEventDto, type EventRecord } from '../../server/domains/event/dto/event.dto'

/** A minimal events row, for the mapper assertions below. */
const baseEventRecord: EventRecord = {
  id: 'event-1',
  club_id: 'club-1',
  name: 'Session',
  description: null,
  venue: null,
  province: null,
  city: null,
  start_date: '2026-09-01',
  end_date: '2026-09-01',
  start_time: null,
  end_time: null,
  registration_opens: null,
  registration_closes: null,
  status: 'published',
  visibility: 'public',
  event_type: 'open_casual',
  fee_amount: null,
  fee_currency: null,
  max_participants: null,
  queue_enabled: false,
  queue_courts: 1,
  match_format: 'doubles',
  queue_mode: 'first_come',
  min_players_to_start: null,
  close_policy: 'manual',
  closes_at: null,
  closed_at: null,
  coach_player_id: null,
  fee_payer: 'player',
  organizer_fee_amount: null,
  queue_skip_timeout_seconds: 120,
  created_by_player_id: 'player-1',
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z'
}

/**
 * Regression cover for the punch-list fixes whose logic is pure enough to
 * assert directly. Each block names the reported symptom, because the symptom
 * is what a future reader will recognise — not the function name.
 */

describe('OP-1 — a session at 3 of 14 offered no way to start', () => {
  /**
   * Capacity and readiness were the same number, so a session was treated as
   * unstartable until it was FULL. The floor is one court's worth.
   */
  it('derives the floor from the format when the organiser set none', () => {
    expect(defaultMinPlayersToStart('doubles')).toBe(4)
    expect(defaultMinPlayersToStart('singles')).toBe(2)
    expect(effectiveMinPlayersToStart({ match_format: 'doubles' })).toBe(4)
  })

  it('lets an organiser raise the floor', () => {
    expect(effectiveMinPlayersToStart({ match_format: 'doubles', min_players_to_start: 8 })).toBe(8)
  })

  /** Below one court there is nothing to start, whatever the override says. */
  it('never drops below what a court needs', () => {
    expect(effectiveMinPlayersToStart({ match_format: 'doubles', min_players_to_start: 2 })).toBe(4)
  })

  it('treats a doubles session as the default for a record predating the column', () => {
    expect(effectiveMinPlayersToStart({})).toBe(4)
  })
})

describe('OP-7 — the panel printed the wrong queue mode', () => {
  /**
   * "Random" described the implementation, not what a player gets. The stored
   * enum value is deliberately unchanged — only the label moved.
   */
  it('labels random as Mix & Match', () => {
    expect(queueModeLabel('random')).toBe('Mix & Match')
    expect(queueModeLabel('first_come')).toBe('First come')
  })

  it('says only Mix & Match forms the pairs itself', () => {
    expect(queuePairsAutomatically('random')).toBe(true)
    expect(queuePairsAutomatically('first_come')).toBe(false)
    expect(queuePairsAutomatically('rating_based')).toBe(false)
  })

  it('degrades readably on a value it does not know', () => {
    expect(queueModeLabel('some_new_mode')).toBe('some new mode')
  })
})

describe('OP-8 — Mix & Match dead-ended with too few players', () => {
  it('needs one court of players before a rotation exists', () => {
    expect(minPlayersForMixup('doubles')).toBe(4)
    expect(minPlayersForMixup('singles')).toBe(2)
  })

  /** "Not enough players" without a number is what sent someone hunting a bug. */
  it('says how many more are needed', () => {
    expect(mixupShortfall(3, 'doubles')).toContain('1 more')
    expect(mixupShortfall(4, 'doubles')).toBeNull()
  })
})

describe('MS-2 — the NCR filter returned nothing', () => {
  /**
   * NCR is a region, not a province, and it is written down four ways. An
   * equality match on the picker's label matched none of the others.
   */
  it('matches every spelling of NCR', () => {
    const aliases = ncrAliasesFor('NCR (National Capital Region)')
    expect(aliases).toContain('Metro Manila')
    expect(aliases).toContain('NCR')
    expect(ncrAliasesFor('metro manila')).toContain('National Capital Region')
  })

  /** Widening the match for every province would trade correct for fuzzy. */
  it('leaves an ordinary province alone', () => {
    expect(ncrAliasesFor('Cavite')).toBeNull()
    expect(ncrAliasesFor('Laguna')).toBeNull()
  })
})

describe('EV-2 — coaching had to be faked as a casual event', () => {
  it('names coaching as its own kind', () => {
    expect(eventKindLabel('coaching')).toBe('COACHING')
    expect(eventTypesForFilter('coaching')).toEqual(['coaching'])
  })

  /**
   * A lesson is not a contest, so ranked/casual and singles/doubles would each
   * say something untrue about it.
   */
  it('carries no ranked or format qualifiers', () => {
    expect(
      eventKindQualifiers({
        event_type: 'coaching',
        match_format: 'doubles',
        affects_rating: false
      })
    ).toEqual([])
  })

  /**
   * The safety property: affects_rating is an allow-list, so a new type is
   * unrated unless deliberately added. Asserted because getting this wrong
   * would quietly feed lessons into the rating engine.
   */
  it('is unrated by construction', () => {
    const coaching = toEventDto({ ...baseEventRecord, event_type: 'coaching' })
    expect(coaching.affects_rating).toBe(false)

    const ranked = toEventDto({ ...baseEventRecord, event_type: 'open_ranked' })
    expect(ranked.affects_rating).toBe(true)
  })
})

describe('EV-3 — no way to say the organiser is covering the fee', () => {
  it('defaults an event with no stated payer to the player', () => {
    const dto = toEventDto({ ...baseEventRecord, fee_payer: undefined as never })
    expect(dto.fee_payer).toBe('player')
  })

  it('carries an organiser-covered fee through', () => {
    const dto = toEventDto({ ...baseEventRecord, fee_payer: 'organizer', fee_amount: 250 })
    expect(dto.fee_payer).toBe('organizer')
    expect(dto.fee_amount).toBe(250)
  })
})

describe('EV-4/EV-5 — nothing said what kind of event it was', () => {
  it('names the headline kind', () => {
    expect(eventKindLabel('tournament')).toBe('TOURNAMENT')
    expect(eventKindLabel('open_ranked')).toBe('OPEN PLAY')
    expect(eventKindLabel('club_casual')).toBe('OPEN PLAY')
  })

  /** Someone browsing wants "tournaments", not "club_ranked". */
  it('expands a broad filter to the types it covers', () => {
    expect(eventTypesForFilter('tournament')).toEqual(['tournament'])
    expect(eventTypesForFilter('open_play')).toHaveLength(4)
    expect(eventTypesForFilter('all')).toBeUndefined()
  })
})
