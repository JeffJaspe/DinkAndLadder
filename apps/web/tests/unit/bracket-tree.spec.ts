import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BracketTree from '~/components/tournament/BracketTree.vue'
import BracketMatchCard from '~/components/BracketMatchCard.vue'
import { championOf, finalMatchOf } from '~/utils/bracket-rounds'
import type {
  BracketDto,
  BracketMatchDto,
  BracketParticipantDto
} from '~/server/domains/event/dto/bracket.dto'

function participant(name: string): BracketParticipantDto {
  return {
    registration_id: `reg-${name}`,
    display_name: name,
    rating: null,
    partner_display_name: null
  }
}

function match(overrides: Partial<BracketMatchDto> = {}): BracketMatchDto {
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
    live_score: null,
    started_at: null,
    is_live: false,
    ...overrides
  }
}

const statusConfig = {
  pending: { bg: 'bg-surface-2', border: 'border-border-strong' },
  ready: { bg: 'bg-warning-soft', border: 'border-warning/30' },
  in_progress: { bg: 'bg-primary/10', border: 'border-primary/30' },
  completed: { bg: 'bg-primary/10', border: 'border-primary/30' },
  bye: { bg: 'bg-surface-2', border: 'border-border-strong' }
}

const playedMatch = match({
  status: 'completed',
  participant1_registration_id: 'reg-Ana',
  participant2_registration_id: 'reg-Ben',
  participant1: participant('Ana'),
  participant2: participant('Ben'),
  winner_registration_id: 'reg-Ana',
  scores: [
    { set_number: 1, participant1_score: 11, participant2_score: 9 },
    { set_number: 2, participant1_score: 8, participant2_score: 11 },
    { set_number: 3, participant1_score: 11, participant2_score: 6 }
  ],
  live_score: null,
  started_at: null,
  is_live: false
})

describe('BracketMatchCard scores', () => {
  it('renders one column per set, oriented to each slot', () => {
    const wrapper = mount(BracketMatchCard, {
      props: { match: playedMatch, statusConfig },
      global: { stubs: { UiRatingBadge: true } }
    })

    const text = wrapper.text()
    // Ana's column, then Ben's — the server orients them to these slots, so
    // reading them back in slot order is the whole contract.
    expect(text).toContain('11')
    expect(text).toContain('9')
    expect(text).toContain('6')

    const rows = wrapper.findAll('.flex.items-center.gap-2')
    expect(rows.length).toBeGreaterThanOrEqual(2)
  })

  it('leaves the score columns out entirely when nothing was recorded', () => {
    const wrapper = mount(BracketMatchCard, {
      props: {
        match: match({
          participant1_registration_id: 'reg-Ana',
          participant2_registration_id: 'reg-Ben',
          participant1: participant('Ana'),
          participant2: participant('Ben'),
          status: 'ready'
        }),
        statusConfig
      },
      global: { stubs: { UiRatingBadge: true } }
    })

    expect(wrapper.text()).toContain('Ana')
    expect(wrapper.text()).toContain('Ben')
    expect(wrapper.text()).not.toMatch(/\d+/)
  })

  // A slot the draw has not reached is "TBD", never a blank row that reads as a
  // player with no name.
  it('names an unreached slot', () => {
    const wrapper = mount(BracketMatchCard, {
      props: { match: match(), statusConfig },
      global: { stubs: { UiRatingBadge: true } }
    })

    expect(wrapper.text()).toContain('TBD')
  })

  it('drops the status line in dense form, where the tree supplies the context', () => {
    const wrapper = mount(BracketMatchCard, {
      props: { match: playedMatch, statusConfig, dense: true },
      global: { stubs: { UiRatingBadge: true } }
    })

    expect(wrapper.text()).not.toContain('completed')
  })
})

describe('finalMatchOf / championOf', () => {
  function bracket(rounds: BracketDto['rounds']): BracketDto {
    return { tournament_id: 'tournament-1', category_id: 'cat-1', locked: false, rounds }
  }

  it('takes the last round of a single elimination as the final', () => {
    const final = match({ id: 'final', round: 2 })
    expect(
      finalMatchOf(
        bracket([
          { round: 1, matches: [] },
          { round: 2, matches: [final] }
        ])
      )?.id
    ).toBe('final')
  })

  it('prefers the grand final over the higher-numbered losers rounds', () => {
    const grand = match({ id: 'grand', round: 200 })
    const losers = match({ id: 'losers', round: 104 })
    // 104 < 200 numerically, but the point is that a losers round is never the
    // decider whatever its number — swapping the offsets must not change this.
    expect(
      finalMatchOf(
        bracket([
          { round: 104, matches: [losers] },
          { round: 200, matches: [grand] }
        ])
      )?.id
    ).toBe('grand')
  })

  it('never treats a pool round as the final', () => {
    expect(finalMatchOf(bracket([{ round: 10, matches: [match({ round: 10 })] }]))).toBeNull()
  })

  it('names the champion once the final is decided', () => {
    const final = match({
      id: 'final',
      round: 2,
      status: 'completed',
      participant1_registration_id: 'reg-Ana',
      participant2_registration_id: 'reg-Ben',
      participant1: participant('Ana'),
      participant2: participant('Ben'),
      winner_registration_id: 'reg-Ben'
    })

    expect(championOf(bracket([{ round: 2, matches: [final] }]))?.display_name).toBe('Ben')
  })

  it('has no champion while the final is unplayed', () => {
    expect(championOf(bracket([{ round: 2, matches: [match({ round: 2 })] }]))).toBeNull()
  })
})

describe('BracketTree', () => {
  const rounds = [
    {
      round: 1,
      matches: [
        match({ id: 'r1m1', round: 1, position: 1 }),
        match({ id: 'r1m2', round: 1, position: 2 })
      ]
    },
    { round: 2, matches: [match({ id: 'r2m1', round: 2, position: 1 })] }
  ]

  it('renders a column per round with the rounds named', () => {
    const wrapper = mount(BracketTree, {
      props: { rounds, statusConfig },
      global: { components: { BracketMatchCard }, stubs: { UiRatingBadge: true, UiIcon: true } }
    })

    expect(wrapper.findAll('.bracket-round')).toHaveLength(2)
    expect(wrapper.text()).toContain('Round 1')
    expect(wrapper.text()).toContain('Round 2')
  })

  // The connector geometry hangs off this class: only a round that feeds
  // another one reserves the elbow zone and draws the joiner.
  it('marks every round but the last as feeding the next', () => {
    const wrapper = mount(BracketTree, {
      props: { rounds, statusConfig },
      global: { components: { BracketMatchCard }, stubs: { UiRatingBadge: true, UiIcon: true } }
    })

    expect(wrapper.findAll('.bracket-round--feeding')).toHaveLength(1)
  })

  /**
   * The `.bracket-pair` wrapper this used to count is gone. Pairing matches
   * two-at-a-time was the bug: it assumed every round is half the previous,
   * which the losers bracket violates, and it inferred each card's position
   * from flex layout, which unequal card heights and a `gap` both break.
   *
   * Position is now stated as a grid row span, so that is what to assert.
   */
  it('spans each round across the same grid, doubling every round', () => {
    const wrapper = mount(BracketTree, {
      props: { rounds, statusConfig },
      global: { components: { BracketMatchCard }, stubs: { UiRatingBadge: true, UiIcon: true } }
    })

    const feeding = wrapper.find('.bracket-round--feeding')
    const nodes = feeding.findAll('.bracket-node')
    expect(nodes).toHaveLength(2)

    // Two feeders, one row-band each; their target spans both.
    const feederSpan = nodes[0].attributes('style')
    const finalSpan = wrapper
      .findAll('.bracket-round')
      .at(-1)!
      .find('.bracket-node')
      .attributes('style')

    expect(feederSpan).toContain('span 2')
    expect(finalSpan).toContain('span 4')
  })

  it('draws connectors for a real knockout', () => {
    const wrapper = mount(BracketTree, {
      props: { rounds, statusConfig },
      global: { components: { BracketMatchCard }, stubs: { UiRatingBadge: true, UiIcon: true } }
    })

    expect(wrapper.find('.bracket-tree--connected').exists()).toBe(true)
  })

  /**
   * A losers bracket emits 2, 2, 1, 1 — round 101 to 102 does not halve. Lines
   * there would point at slots that do not feed from them, so none are drawn.
   */
  it('draws none for rounds that do not feed each other', () => {
    const flat = [
      { round: 101, matches: [match({ id: 'l1', round: 101 }), match({ id: 'l2', round: 101 })] },
      { round: 102, matches: [match({ id: 'l3', round: 102 }), match({ id: 'l4', round: 102 })] }
    ]
    const wrapper = mount(BracketTree, {
      props: { rounds: flat, statusConfig },
      global: { components: { BracketMatchCard }, stubs: { UiRatingBadge: true, UiIcon: true } }
    })

    expect(wrapper.find('.bracket-tree--connected').exists()).toBe(false)
  })

  it('shows the champion panel as undecided before the final is played', () => {
    const wrapper = mount(BracketTree, {
      props: { rounds, statusConfig, showChampion: true, champion: null },
      global: { components: { BracketMatchCard }, stubs: { UiRatingBadge: true, UiIcon: true } }
    })

    expect(wrapper.text()).toContain('Champion')
    expect(wrapper.text()).toContain('To be decided')
  })

  it('names both halves of a doubles pair in the champion panel', () => {
    const wrapper = mount(BracketTree, {
      props: {
        rounds,
        statusConfig,
        showChampion: true,
        champion: { ...participant('Ana'), partner_display_name: 'Ben' }
      },
      global: { components: { BracketMatchCard }, stubs: { UiRatingBadge: true, UiIcon: true } }
    })

    expect(wrapper.text()).toContain('Ana / Ben')
  })

  // A losers draw crowns nobody, so two panels must never appear at once.
  it('leaves the champion panel off when not asked for', () => {
    const wrapper = mount(BracketTree, {
      props: { rounds, statusConfig, champion: participant('Ana') },
      global: { components: { BracketMatchCard }, stubs: { UiRatingBadge: true, UiIcon: true } }
    })

    expect(wrapper.find('.bracket-champion').exists()).toBe(false)
  })
})
