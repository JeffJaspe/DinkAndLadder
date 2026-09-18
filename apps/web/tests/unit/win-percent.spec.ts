import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { formatWinPercent, winPercent } from '~/utils/win-percent'
import RankingBoard from '~/components/RankingBoard.vue'

describe('winPercent', () => {
  it('prefers the server figure', () => {
    expect(winPercent({ wins: 1, losses: 9, win_pct: 66.7 })).toBe(66.7)
  })

  it('derives one decimal from wins and losses', () => {
    expect(winPercent({ wins: 2, losses: 1 })).toBe(66.7)
    expect(winPercent({ wins: 3, losses: 0 })).toBe(100)
  })

  it('has no percentage for nothing played', () => {
    expect(winPercent({ wins: 0, losses: 0 })).toBeNull()
    expect(formatWinPercent(null)).toBe('—')
    expect(formatWinPercent(66.7)).toBe('66.7%')
  })
})

/**
 * The podium used to print "—" with an "Unrated" tooltip on record ladders —
 * against players who were rated perfectly well. The pill is the record now.
 */
describe('RankingBoard record variant', () => {
  const stubs = {
    UiPodium: {
      name: 'UiPodium',
      props: ['entries'],
      template:
        '<ol class="podium-stub"><li v-for="e in entries" :key="e.id" :data-label="e.label" :title="e.labelTitle">{{ e.name }}</li></ol>'
    },
    UiDataTable: {
      name: 'UiDataTable',
      props: ['columns', 'rows'],
      template: '<table class="table-stub" :data-columns="columns.map((c) => c.key).join(\',\')" />'
    },
    UiEmptyState: true,
    UiIcon: true
  }

  const entries = [
    { rank: 1, player_id: 'a', display_name: 'Ana', wins: 5, losses: 1 },
    { rank: 2, player_id: 'b', display_name: 'Ben', wins: 3, losses: 3 },
    { rank: 3, player_id: 'c', display_name: 'Cai', wins: 0, losses: 4 },
    { rank: 4, player_id: 'd', display_name: 'Dee', wins: 0, losses: 5 }
  ]

  it('puts the record on the podium pill, with the percentage in the tooltip', () => {
    const w = mount(RankingBoard, { props: { entries, variant: 'record' }, global: { stubs } })
    const pills = w.findAll('.podium-stub li')
    expect(pills.map((p) => p.attributes('data-label'))).toEqual(['5–1', '3–3', '0–4'])
    expect(pills[0].attributes('title')).toBe('5 won, 1 lost · 83.3% won')
  })

  it('adds a Win % column to the record table', () => {
    const w = mount(RankingBoard, { props: { entries, variant: 'record' }, global: { stubs } })
    expect(w.find('.table-stub').attributes('data-columns')).toBe(
      'rank,player,matches,record,winpct'
    )
  })

  it('leaves the rating ladder on the rating pill', () => {
    const rated = [{ rank: 1, player_id: 'a', display_name: 'Ana', rating_value: 4.25 }]
    const w = mount(RankingBoard, { props: { entries: rated }, global: { stubs } })
    expect(w.find('.podium-stub li').attributes('data-label')).toBeUndefined()
  })
})
