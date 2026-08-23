/**
 * RankingBoard covers five screens that each used to render their own ladder,
 * so the things worth pinning are the ones that differed between those copies:
 * which columns appear, how many rows the podium takes off the top, and
 * whether a rating keeps its stored precision.
 */

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import RankingBoard, { type RankingBoardEntry } from '../../components/RankingBoard.vue'
import UiAvatar from '../../components/ui/Avatar.vue'
import UiButton from '../../components/ui/Button.vue'
import UiDataTable from '../../components/ui/DataTable.vue'
import UiEmptyState from '../../components/ui/EmptyState.vue'
import UiIcon from '../../components/ui/Icon.vue'
import UiPodium from '../../components/ui/Podium.vue'
import UiTrendIndicator from '../../components/ui/TrendIndicator.vue'

// The page-level components resolve these through Nuxt auto-import, which
// does not exist in the test environment.
const global = {
  components: { UiAvatar, UiButton, UiDataTable, UiEmptyState, UiIcon, UiPodium, UiTrendIndicator },
  stubs: { NuxtLink: { template: '<a><slot /></a>' } }
}

function ratingEntries(count: number): RankingBoardEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    rank: i + 1,
    player_id: `player-${i + 1}`,
    display_name: `Player ${i + 1}`,
    rating_value: 4.25 - i * 0.001,
    matches_played: 10 + i,
    trend_delta: i === 0 ? 12 : null,
    province: 'Cebu',
    city: 'Cebu City'
  }))
}

function recordEntries(count: number): RankingBoardEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    rank: i + 1,
    player_id: `player-${i + 1}`,
    display_name: `Player ${i + 1}`,
    matches_played: 5,
    wins: 4 - i,
    losses: 1 + i
  }))
}

function headers(wrapper: ReturnType<typeof mount>): string[] {
  return wrapper.findAll('th').map((th) => th.text())
}

describe('RankingBoard', () => {
  it('lifts the top three onto the podium and tables the rest', () => {
    const wrapper = mount(RankingBoard, {
      props: { entries: ratingEntries(6) },
      global
    })

    expect(wrapper.findComponent(UiPodium).props('entries')).toHaveLength(3)
    expect(wrapper.findAll('tbody tr')).toHaveLength(3)
  })

  // The hand-rolled podiums this replaces required exactly three entries and
  // rendered nothing at all on a shorter ladder. UiPodium fills the gaps.
  it('still shows a podium with fewer than three players', () => {
    const wrapper = mount(RankingBoard, {
      props: { entries: ratingEntries(2) },
      global
    })

    expect(wrapper.findComponent(UiPodium).exists()).toBe(true)
    expect(wrapper.findAll('tbody tr')).toHaveLength(0)
  })

  it('tables everyone when the podium is off', () => {
    const wrapper = mount(RankingBoard, {
      props: { entries: ratingEntries(6), showPodium: false },
      global
    })

    expect(wrapper.findComponent(UiPodium).exists()).toBe(false)
    expect(wrapper.findAll('tbody tr')).toHaveLength(6)
  })

  it('shows rating and trend columns in the rating variant', () => {
    const wrapper = mount(RankingBoard, {
      props: { entries: ratingEntries(5) },
      global
    })

    expect(headers(wrapper)).toEqual(['#', 'Player', 'Matches', 'Rating', 'Trend'])
  })

  it('swaps rating and trend for a W–L column in the record variant', () => {
    const wrapper = mount(RankingBoard, {
      props: { entries: recordEntries(5), variant: 'record' },
      global
    })

    const cols = headers(wrapper)
    expect(cols).toContain('W–L')
    expect(cols).not.toContain('Rating')
    expect(cols).not.toContain('Trend')
  })

  // Ratings are numeric(5,3). Two of the screens this replaces rounded them,
  // so players three thousandths apart displayed as identical.
  it('keeps three decimals of rating precision', () => {
    const wrapper = mount(RankingBoard, {
      props: { entries: ratingEntries(5), showPodium: false },
      global
    })

    expect(wrapper.text()).toContain('4.250')
    expect(wrapper.text()).toContain('4.249')
  })

  it('renders a rating-less row as Unrated rather than 0', () => {
    const wrapper = mount(RankingBoard, {
      props: {
        entries: [{ rank: 1, player_id: 'p1', display_name: 'Unrated One', rating_value: null }],
        showPodium: false
      },
      global
    })

    expect(wrapper.text()).toContain('Unrated')
  })

  // null trend means "no rated match in the window", which is not a zero delta
  // and must not be drawn as one.
  it('distinguishes a null trend from a zero one', () => {
    const withNull = mount(RankingBoard, {
      props: {
        entries: [
          { rank: 1, player_id: 'p1', display_name: 'A', rating_value: 4, trend_delta: null }
        ],
        showPodium: false
      },
      global
    })
    const withZero = mount(RankingBoard, {
      props: {
        entries: [{ rank: 1, player_id: 'p1', display_name: 'A', rating_value: 4, trend_delta: 0 }],
        showPodium: false
      },
      global
    })

    expect(withNull.findComponent(UiTrendIndicator).exists()).toBe(false)
    expect(withZero.findComponent(UiTrendIndicator).exists()).toBe(true)
  })

  it('drops the Matches column and the location line when compact', () => {
    const wrapper = mount(RankingBoard, {
      props: { entries: ratingEntries(4), compact: true, showPodium: false },
      global
    })

    expect(headers(wrapper)).not.toContain('Matches')
    expect(wrapper.text()).not.toContain('Cebu City')
  })

  it('marks the reader own row', () => {
    const wrapper = mount(RankingBoard, {
      props: { entries: ratingEntries(5), showPodium: false, highlightId: 'player-3' },
      global
    })

    expect(wrapper.text()).toContain('You')
  })

  it('emits the full entry when a row is chosen', async () => {
    const wrapper = mount(RankingBoard, {
      props: { entries: ratingEntries(5), showPodium: false },
      global
    })

    await wrapper.findAll('tbody tr')[2]!.trigger('click')

    const emitted = wrapper.emitted('select')
    expect(emitted).toHaveLength(1)
    expect((emitted![0]![0] as RankingBoardEntry).player_id).toBe('player-3')
  })

  it('shows an empty state instead of a podium when there is nobody', () => {
    const wrapper = mount(RankingBoard, {
      props: { entries: [], emptyTitle: 'No rated members yet' },
      global
    })

    expect(wrapper.findComponent(UiPodium).exists()).toBe(false)
    expect(wrapper.text()).toContain('No rated members yet')
  })
})
