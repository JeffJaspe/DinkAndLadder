import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import LineChart from '~/components/ui/LineChart.vue'
import { toRatingTransactionDto } from '~/server/domains/rating/dto/rating.dto'
import type { RatingTransactionRecord } from '~/server/domains/rating/dto/rating.dto'

/**
 * The chart's x-axis is time, not array position.
 *
 * Spacing points evenly by index made every range selector look broken: a
 * player whose whole history landed in one week drew the same picture under 7D
 * as under ALL, and a quiet month took as much width as a busy one.
 */

/**
 * The x of each plotted point, read back out of the line path — the series is
 * drawn as one `M x,y L x,y …`, and there is no per-point element to query.
 */
function pointXs(wrapper: ReturnType<typeof mount>): number[] {
  const line = wrapper.findAll('path').find((p) => p.attributes('fill') === 'none')
  const d = line?.attributes('d') ?? ''
  return [...d.matchAll(/[ML]([\d.]+),/g)].map((m) => Number(m[1]))
}

describe('UiLineChart time axis', () => {
  it('spaces points by date, not by position', () => {
    // Two points a day apart, then a gap of nearly a year to the third. The
    // middle point belongs hard against the left edge, not halfway across.
    const wrapper = mount(LineChart, {
      props: {
        label: 'Singles rating',
        points: [
          { date: '2026-01-01T00:00:00Z', value: 3.0 },
          { date: '2026-01-02T00:00:00Z', value: 3.1 },
          { date: '2026-12-31T00:00:00Z', value: 3.4 }
        ]
      }
    })

    const xs = pointXs(wrapper)
    expect(xs).toHaveLength(3)

    const [first, middle, last] = xs as [number, number, number]
    const fraction = (middle - first) / (last - first)
    expect(fraction).toBeLessThan(0.05)
  })

  it('falls back to even spacing when every point shares one instant', () => {
    // What a rating backfill produces. There is no span to spread over, so the
    // points must still be drawn rather than collapsing onto each other or
    // dividing by zero.
    const stamp = '2026-08-30T12:00:00Z'
    const wrapper = mount(LineChart, {
      props: {
        label: 'Singles rating',
        points: [
          { date: stamp, value: 3.0 },
          { date: stamp, value: 3.1 },
          { date: stamp, value: 3.2 }
        ]
      }
    })

    const xs = pointXs(wrapper)
    expect(xs).toHaveLength(3)
    expect(xs[0]).toBeLessThan(xs[1]!)
    expect(xs[1]).toBeLessThan(xs[2]!)
  })
})

describe('toRatingTransactionDto occurred_at', () => {
  function record(overrides?: Partial<RatingTransactionRecord>): RatingTransactionRecord {
    return {
      id: 'txn-1',
      player_id: 'player-1',
      rating_type: 'singles',
      match_id: 'match-1',
      old_rating: 3.0,
      new_rating: 3.1,
      rating_delta: 0.1,
      confidence_before: 0.4,
      confidence_after: 0.5,
      calculation_version: 1,
      // When the backfill ran, not when the match was played.
      created_at: '2026-08-30T12:00:00Z',
      ...overrides
    }
  }

  it('reports when the match was played, not when the engine wrote the row', () => {
    const dto = toRatingTransactionDto(record({ played_at: '2026-03-14T09:00:00Z' }))
    expect(dto.occurred_at).toBe('2026-03-14T09:00:00Z')
  })

  it('falls back to created_at for a transaction with no match behind it', () => {
    const dto = toRatingTransactionDto(record({ match_id: null, played_at: null }))
    expect(dto.occurred_at).toBe('2026-08-30T12:00:00Z')
  })
})
