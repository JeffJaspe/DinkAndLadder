import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import Scoreboard from '~/components/match/Scoreboard.vue'
import type { BoxScoreMatch } from '~/components/match/BoxScore.vue'

/**
 * The tournament page's board shows ONE match, large. What the big number
 * counts changes with the state — points of the game in progress while live,
 * the points of a single game once done, games won across a series — and the
 * two-row sheet is always under it. These pin that down.
 */

const stubs = {
  MatchScoreSheet: {
    name: 'MatchScoreSheet',
    props: {
      teams: Array,
      games: Array,
      rules: Object,
      readonly: Boolean,
      explicitWinner: [Number, null]
    },
    template: '<table class="sheet-stub" :data-games="games.length" />'
  },
  UiPlayerLink: {
    name: 'UiPlayerLink',
    props: ['playerId', 'name'],
    template: '<span class="player">{{ name }}</span>'
  },
  UiIcon: {
    name: 'UiIcon',
    props: ['name', 'label'],
    template: '<svg class="icon" :data-name="name" :aria-label="label" />'
  },
  UiButton: {
    name: 'UiButton',
    props: ['to'],
    template: '<a class="button-stub" :href="to"><slot /></a>'
  }
}

function board(
  match: Partial<BoxScoreMatch> & Pick<BoxScoreMatch, 'games'>,
  extra: { categoryTo?: string | null } = {}
) {
  const full: BoxScoreMatch = {
    id: 'm1',
    teams: [[{ name: 'Ana Garcia' }], [{ name: 'Luna Cruz' }]],
    context: '3.5 Singles · Final',
    ...match
  }
  return mount(Scoreboard, { props: { match: full, ...extra }, global: { stubs } })
}

/** The big number, with the dash and the sr-only "to" stripped out. */
function bigScore(wrapper: ReturnType<typeof board>) {
  return wrapper
    .find('[aria-live], .text-stat-lg')
    .text()
    .replace(/[–to\s]+/g, ' ')
    .trim()
}

describe('MatchScoreboard', () => {
  it('shows the points of the game in progress while live', () => {
    const wrapper = board({
      games: [
        { team1_score: 11, team2_score: 7 },
        { team1_score: 4, team2_score: 6 }
      ],
      rules: { targetPoints: 11, winByTwo: true, bestOf: 3 },
      liveGame: 2
    })

    expect(bigScore(wrapper)).toBe('4 6')
    expect(wrapper.text()).toContain('Live')
    expect(wrapper.text()).toContain('Game 2 · games 1–0')
    expect(wrapper.find('[aria-live="polite"]').exists()).toBe(true)
  })

  it('shows a started match with no score yet at 0–0 rather than blank', () => {
    const wrapper = board({ games: [], liveGame: 1 })

    expect(bigScore(wrapper)).toBe('0 0')
    expect(wrapper.find('.sheet-stub').attributes('data-games')).toBe('1')
  })

  it('shows the points of a single finished game, because that is the result', () => {
    const wrapper = board({
      games: [{ team1_score: 11, team2_score: 9 }],
      winner: 1,
      complete: true
    })

    expect(bigScore(wrapper)).toBe('11 9')
    expect(wrapper.text()).toContain('Final')
    expect(wrapper.find('[aria-label="Won"]').exists()).toBe(true)
    expect(wrapper.find('[aria-live]').exists()).toBe(false)
  })

  it('shows games won across a series, with the per-game line beneath', () => {
    const wrapper = board({
      games: [
        { team1_score: 11, team2_score: 7 },
        { team1_score: 9, team2_score: 11 },
        { team1_score: 11, team2_score: 8 }
      ],
      rules: { targetPoints: 11, winByTwo: true, bestOf: 3 },
      winner: 1,
      complete: true
    })

    expect(bigScore(wrapper)).toBe('2 1')
    expect(wrapper.text()).toContain('Games · 11–7, 9–11, 11–8')
  })

  it('trusts the recorded winner over the derived one', () => {
    // A house "first to 11": 11-10 has no winner under win-by-two, but the
    // submission settled it.
    const wrapper = board({
      games: [{ team1_score: 10, team2_score: 11 }],
      winner: 2,
      complete: true
    })

    const sides = wrapper.findAll('.player').map((n) => n.text())
    expect(sides).toEqual(['Ana Garcia', 'Luna Cruz'])
    // The winner's first name line carries the mark; there is exactly one.
    const marks = wrapper.findAll('[aria-label="Won"]')
    expect(marks).toHaveLength(1)
    expect(marks[0].element.parentElement?.textContent).toContain('Luna Cruz')
  })

  it('always renders the two-row sheet under the board', () => {
    const wrapper = board({
      games: [{ team1_score: 11, team2_score: 3 }],
      complete: true
    })

    const sheet = wrapper.findComponent({ name: 'MatchScoreSheet' })
    expect(sheet.exists()).toBe(true)
    expect(sheet.props('readonly')).toBe(true)
  })

  it('links to the category card only when given one', () => {
    const withLink = board(
      { games: [{ team1_score: 11, team2_score: 3 }], complete: true },
      { categoryTo: '?category=abc' }
    )
    expect(withLink.find('.button-stub').attributes('href')).toBe('?category=abc')
    expect(withLink.text()).toContain('View category')

    const without = board({ games: [{ team1_score: 11, team2_score: 3 }], complete: true })
    expect(without.find('.button-stub').exists()).toBe(false)
  })

  it('stacks a doubles pair one name per line', () => {
    const wrapper = board({
      teams: [
        [{ name: 'Ana Garcia' }, { name: 'Ben Cruz' }],
        [{ name: 'Luna Cruz' }, { name: 'Mia Reyes' }]
      ],
      games: [{ team1_score: 11, team2_score: 5 }],
      complete: true
    })

    expect(wrapper.findAll('.player').map((n) => n.text())).toEqual([
      'Ana Garcia',
      'Ben Cruz',
      'Luna Cruz',
      'Mia Reyes'
    ])
  })
})
