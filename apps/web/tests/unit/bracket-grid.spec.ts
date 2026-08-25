import { describe, expect, it } from 'vitest'
import { bracketGridRows } from '~/utils/bracket-rounds'

/**
 * The maths behind the connector lines.
 *
 * The tree used to infer each match's position from flex layout — `space-around`
 * was assumed to put two children at 25% and 75%. It does not, once there is a
 * gap between them or the two cards differ in height, and the losers bracket
 * does not halve at all. Stating the geometry instead of inferring it is what
 * makes the lines land, and stating it means it can be tested.
 */
describe('bracketGridRows', () => {
  it('gives every column the same row count', () => {
    const grid = bracketGridRows([4, 2, 1])
    expect(grid.rows).toBe(8)
    // A round-1 match spans 2 rows, a semi spans 4, the final spans all 8 —
    // so each one's centre is exactly the midpoint of the band it feeds.
    expect(grid.spans).toEqual([2, 4, 8])
  })

  it('centres a round-2 match on the boundary of its two feeders', () => {
    const { spans } = bracketGridRows([4, 2, 1])
    const [leaf, semi] = spans

    // Feeder A occupies rows 0-1 (centre 1), feeder B rows 2-3 (centre 3).
    // Their target spans rows 0-3, centre 2 — the midpoint of 1 and 3.
    const feederACentre = leaf / 2
    const feederBCentre = leaf + leaf / 2
    expect(semi / 2).toBe((feederACentre + feederBCentre) / 2)
  })

  it('handles a two-entrant draw', () => {
    const grid = bracketGridRows([1])
    expect(grid.rows).toBe(2)
    expect(grid.spans).toEqual([2])
    expect(grid.connected).toBe(true)
  })

  it('calls a proper knockout connected', () => {
    expect(bracketGridRows([8, 4, 2, 1]).connected).toBe(true)
    expect(bracketGridRows([2, 1]).connected).toBe(true)
  })

  /**
   * The losers bracket of an 8-draw emits 2, 2, 1, 1 — round 101 to 102 is
   * 2 to 2, not 2 to 1. Pairing matches two-at-a-time there drew a joiner into
   * a round that had two slots, so the lines pointed at nothing.
   */
  it('refuses to call a losers bracket connected', () => {
    expect(bracketGridRows([2, 2, 1, 1]).connected).toBe(false)
  })

  it('refuses a round robin, whose rounds are a schedule not a progression', () => {
    // Three rounds of two fixtures each: nothing feeds anything.
    expect(bracketGridRows([2, 2, 2]).connected).toBe(false)
  })

  it('refuses a draw whose first round is not a power of two', () => {
    // 3 -> 2 -> 1 halves by the ceiling rule but cannot be drawn as a clean
    // tree; better no lines than lines that misrepresent the feed.
    expect(bracketGridRows([3, 2, 1]).connected).toBe(false)
  })

  it('survives an empty draw without dividing by zero', () => {
    expect(bracketGridRows([])).toEqual({ rows: 0, spans: [], connected: false })
  })
})
