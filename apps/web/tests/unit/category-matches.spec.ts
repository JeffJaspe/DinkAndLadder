import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CategoryMatches from '~/components/tournament/CategoryMatches.vue'
import type { BracketDto, BracketMatchDto } from '~/server/domains/event/dto/bracket.dto'

/**
 * The Matches tab exists because the draw is the wrong place to type a score
 * into: it answers "who plays the winner of this", so the card needing a result
 * is wherever the tree happens to put it, while an organiser at a venue is
 * scanning for the next unplayed match. Ordering by what needs doing is the
 * whole point of the view.
 */

const stubs = {
  TournamentCategoryMatchRow: {
    name: 'TournamentCategoryMatchRow',
    props: ['match', 'round', 'canManage', 'recording'],
    template: '<div class="row-stub" :data-id="match.id" :data-can-manage="canManage" />'
  }
}

function match(overrides: Partial<BracketMatchDto> = {}): BracketMatchDto {
  return {
    id: 'bm-1',
    tournament_id: 'tournament-1',
    round: 1,
    position: 1,
    match_id: null,
    participant1_registration_id: 'reg-1',
    participant2_registration_id: 'reg-2',
    winner_registration_id: null,
    status: 'ready',
    scheduled_at: null,
    category_id: 'cat-1',
    participant1: null,
    participant2: null,
    scores: [],
    ...overrides
  }
}

function bracket(matches: BracketMatchDto[], locked = true): BracketDto {
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b)
  return {
    tournament_id: 'tournament-1',
    category_id: 'cat-1',
    locked,
    rounds: rounds.map((round) => ({ round, matches: matches.filter((m) => m.round === round) }))
  }
}

function mountMatches(props: Record<string, unknown> = {}) {
  return mount(CategoryMatches, {
    props: {
      bracket: bracket([match()]),
      canManage: true,
      recordingId: null,
      recordError: '',
      ...props
    },
    global: { stubs }
  })
}

function idsInOrder(wrapper: ReturnType<typeof mountMatches>): string[] {
  return wrapper.findAll('.row-stub').map((r) => r.attributes('data-id')!)
}

describe('CategoryMatches', () => {
  it('puts playable matches first, then waiting, then played', () => {
    const wrapper = mountMatches({
      bracket: bracket([
        match({ id: 'played', round: 1, position: 1, match_id: 'm-1', status: 'completed' }),
        // Waiting: a feeder has not finished, so one side is empty.
        match({ id: 'waiting', round: 2, position: 1, participant2_registration_id: null }),
        match({ id: 'ready', round: 1, position: 2 })
      ])
    })

    expect(idsInOrder(wrapper)).toEqual(['ready', 'waiting', 'played'])
  })

  it('counts a bye as played — nobody plays it', () => {
    const wrapper = mountMatches({
      bracket: bracket([
        match({ id: 'bye', status: 'bye', participant2_registration_id: null }),
        match({ id: 'ready', position: 2 })
      ])
    })

    expect(idsInOrder(wrapper)).toEqual(['ready', 'bye'])
    expect(wrapper.text()).toContain('Played')
  })

  it('orders within a bucket by round, then position', () => {
    const wrapper = mountMatches({
      bracket: bracket([
        match({ id: 'r2p1', round: 2, position: 1 }),
        match({ id: 'r1p2', round: 1, position: 2 }),
        match({ id: 'r1p1', round: 1, position: 1 })
      ])
    })

    expect(idsInOrder(wrapper)).toEqual(['r1p1', 'r1p2', 'r2p1'])
  })

  it('says so when there is nothing drawn yet', () => {
    const wrapper = mountMatches({ bracket: bracket([]) })
    expect(wrapper.text()).toContain('No matches yet')
  })

  describe('results need a locked draw', () => {
    it('withholds score entry while the draw is unlocked', () => {
      const wrapper = mountMatches({ bracket: bracket([match()], false) })

      expect(wrapper.find('.row-stub').attributes('data-can-manage')).toBe('false')
      expect(wrapper.text()).toContain('Lock the draw before recording results')
    })

    it('allows it once locked', () => {
      const wrapper = mountMatches({ bracket: bracket([match()], true) })

      expect(wrapper.find('.row-stub').attributes('data-can-manage')).toBe('true')
      expect(wrapper.text()).not.toContain('Lock the draw before')
    })

    it('never offers score entry to a player, locked or not', () => {
      const wrapper = mountMatches({ canManage: false, bracket: bracket([match()], true) })
      expect(wrapper.find('.row-stub').attributes('data-can-manage')).toBe('false')
    })
  })
})
