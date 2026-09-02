import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ScoreSection from '~/components/match/ScoreSection.vue'
import MatchCard from '~/components/match/MatchCard.vue'
import { stageLabels } from '~/utils/bracket-rounds'
import type { BoxScoreMatch } from '~/components/match/BoxScore.vue'

/**
 * The Scores panel used to say "Round 3" for a final and stack every finished
 * category at full height. Both of those are the same failure: the panel knew
 * the draw's numbers and not what they meant.
 */

/** Only the round shape matters here, so the matches can be anything. */
function rounds(...counts: [number, number][]) {
  return counts.map(([round, count]) => ({
    round,
    matches: Array.from({ length: count }, () => ({}))
  }))
}

describe('stageLabels', () => {
  it('names a knockout backwards from its decider', () => {
    const labels = stageLabels(rounds([1, 4], [2, 2], [3, 1]))

    expect(labels.get(3)).toBe('Final')
    expect(labels.get(2)).toBe('Semifinals')
    expect(labels.get(1)).toBe('Quarterfinals')
  })

  it('calls a lone semifinal singular', () => {
    // A half-drawn bracket: one semi, one final. "Semifinals" would be a lie.
    const labels = stageLabels(rounds([1, 1], [2, 1]))

    expect(labels.get(1)).toBe('Semifinal')
    expect(labels.get(2)).toBe('Final')
  })

  it('names a round of 16 by its size rather than a stage', () => {
    const labels = stageLabels(rounds([1, 8], [2, 4], [3, 2], [4, 1]))

    expect(labels.get(1)).toBe('Round of 16')
    expect(labels.get(4)).toBe('Final')
  })

  /** Six quarterfinals and two byes is still the quarterfinal round. */
  it('names a stage the draw only half fills', () => {
    const labels = stageLabels(rounds([1, 3], [2, 2], [3, 1]))

    expect(labels.get(1)).toBe('Quarterfinals')
    expect(labels.get(3)).toBe('Final')
  })

  /**
   * The safety rule: a stage name is a claim about the shape of the draw, so a
   * round holding MORE matches than the stage allows keeps its number.
   */
  it('falls back to a number when the rounds do not halve', () => {
    const labels = stageLabels(rounds([1, 4], [2, 3]))

    expect(labels.get(1)).toBe('Round 1')
    expect(labels.get(2)).toBe('Round 2')
  })

  it('leaves pools named by letter', () => {
    const labels = stageLabels(rounds([10, 3], [11, 3], [50, 2], [51, 1]))

    expect(labels.get(10)).toBe('Pool A')
    expect(labels.get(11)).toBe('Pool B')
    // Playoffs are the knockout in a pool-play draw, so they own "Final".
    expect(labels.get(50)).toBe('Semifinals')
    expect(labels.get(51)).toBe('Final')
  })

  /** A winners bracket feeding a grand final crowns nobody. */
  it('names each half of a double elimination separately', () => {
    const labels = stageLabels(rounds([1, 2], [2, 1], [101, 2], [102, 1], [200, 1]))

    expect(labels.get(2)).toBe('Winners Final')
    expect(labels.get(102)).toBe('Losers Final')
    expect(labels.get(200)).toBe('Grand Final')
  })
})

function boxMatch(id: string): BoxScoreMatch {
  return {
    id,
    teams: [['Ana Garcia'], ['Luna Cruz']],
    games: [{ team1_score: 11, team2_score: 6 }],
    group: 'Final',
    complete: true
  }
}

const stubs = {
  MatchBoxScore: {
    name: 'MatchBoxScore',
    props: ['matches'],
    template: '<div class="box-score-stub" :data-count="matches.length" />'
  },
  UiIcon: true
}

interface SectionProps {
  label?: string | null
  champion?: string | null
  matches: BoxScoreMatch[]
  defaultOpen?: boolean
}

function mountSection(props: SectionProps) {
  return mount(ScoreSection, { props, global: { stubs } })
}

/** The scores live behind v-show, so folded means `display: none` on the panel. */
function panelDisplay(wrapper: ReturnType<typeof mountSection>) {
  const panel = wrapper.find('.box-score-stub').element.parentElement as HTMLElement
  return panel.style.display
}

describe('MatchScoreSection', () => {
  it('renders the matches bare when there is no category to name', () => {
    const wrapper = mountSection({ label: null, matches: [boxMatch('m1')] })

    expect(wrapper.find('.box-score-stub').exists()).toBe(true)
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('keeps a category that is still being played open and named', () => {
    const wrapper = mountSection({
      label: "Men's 3.5 Singles",
      champion: null,
      matches: [boxMatch('m1')]
    })

    expect(wrapper.text()).toContain("Men's 3.5 Singles")
    expect(wrapper.find('.box-score-stub').isVisible()).toBe(true)
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('folds a wrapped-up category behind its champion', async () => {
    const wrapper = mountSection({
      label: "Men's 3.5 Singles",
      champion: 'Luna Cruz',
      matches: [boxMatch('m1'), boxMatch('m2')]
    })

    const toggle = wrapper.get('button')
    expect(wrapper.text()).toContain('Luna Cruz')
    expect(wrapper.text()).toContain('Champion')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(panelDisplay(wrapper)).toBe('none')

    await toggle.trigger('click')

    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(panelDisplay(wrapper)).toBe('')
  })

  it('opens a decided category when asked to', () => {
    const wrapper = mountSection({
      label: "Men's 3.5 Singles",
      champion: 'Luna Cruz',
      defaultOpen: true,
      matches: [boxMatch('m1')]
    })

    expect(wrapper.get('button').attributes('aria-expanded')).toBe('true')
  })
})

/**
 * The panel is a stack of collapsible match cards now, not a wide table.
 *
 * Two things have to survive that change. A house rule of "first to 11" records
 * games like 11-10, which win-by-two says nobody won — the recorded result is
 * the answer, the derived one only the fallback — and a match being played has
 * to announce itself: open, banded LIVE, and glowing, because a card in a
 * column of cards is otherwise indistinguishable from the ones already over.
 */
describe('MatchCard', () => {
  function card(match: Partial<BoxScoreMatch>) {
    return mount(MatchCard, {
      props: {
        match: {
          id: 'm1',
          teams: [['Isabella Cruz'], ['Ana Garcia']],
          games: [
            { team1_score: 10, team2_score: 11 },
            { team1_score: 2, team2_score: 11 }
          ],
          complete: true,
          ...match
        } as BoxScoreMatch
      },
      global: { stubs: { MatchScoreSheet: true, UiIcon: true } }
    })
  }

  /** The two sides on the collapsed line, in order. */
  function sides(wrapper: ReturnType<typeof card>) {
    return wrapper.get('button').findAll('span > span')
  }

  it('trusts the recorded winner over win-by-two', () => {
    const wrapper = card({
      winner: 2,
      games: [
        { team1_score: 11, team2_score: 10 },
        { team1_score: 10, team2_score: 11 },
        { team1_score: 9, team2_score: 11 }
      ]
    })

    const [side1, , side2] = sides(wrapper)
    expect(side2!.classes()).toContain('font-semibold')
    expect(side1!.classes()).not.toContain('font-semibold')
  })

  it('still derives a winner when none was recorded', () => {
    const wrapper = card({
      games: [
        { team1_score: 4, team2_score: 11 },
        { team1_score: 2, team2_score: 11 }
      ]
    })

    const [side1, , side2] = sides(wrapper)
    expect(side2!.classes()).toContain('font-semibold')
    expect(side1!.classes()).not.toContain('font-semibold')
  })

  it('marks nobody while the result is unknown', () => {
    const wrapper = card({
      winner: null,
      complete: false,
      liveGame: 1,
      games: [{ team1_score: 4, team2_score: 3 }]
    })

    for (const side of sides(wrapper)) {
      expect(side.classes()).not.toContain('font-semibold')
    }
  })

  it('opens a live match and glows', () => {
    const wrapper = card({
      winner: null,
      complete: false,
      liveGame: 2,
      games: [
        { team1_score: 11, team2_score: 7 },
        { team1_score: 4, team2_score: 3 }
      ]
    })

    expect(wrapper.get('button').attributes('aria-expanded')).toBe('true')
    expect(wrapper.text()).toContain('Live · G2')
    // The running score, so a spectator need not open anything.
    expect(wrapper.get('button').text()).toContain('4')
    expect(wrapper.html()).toContain('blur-md')
  })

  it('collapses a finished match, and opens it on click', async () => {
    const wrapper = card({ winner: 2 })
    const toggle = wrapper.get('button')

    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(wrapper.text()).toContain('Final')
    expect(wrapper.html()).not.toContain('blur-md')

    await toggle.trigger('click')

    expect(toggle.attributes('aria-expanded')).toBe('true')
  })
})
