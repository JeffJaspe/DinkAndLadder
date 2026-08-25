import { describe, expect, it } from 'vitest'
import {
  computeConvenienceFee,
  computeRegistrationCost,
  describeFeeRule,
  findFeeRule,
  formatMoney,
  type PlatformFeeRule
} from '~/utils/convenience-fee'

/**
 * The fee a player is quoted is the fee they are charged, so this is the one
 * piece of the payment work that has to be right before any of it goes live.
 */

function rule(overrides: Partial<PlatformFeeRule> = {}): PlatformFeeRule {
  return {
    id: 'rule-1',
    fee_type: 'percentage',
    value: 5,
    min_amount_cents: 0,
    max_amount_cents: null,
    min_fee_cents: null,
    max_fee_cents: null,
    is_active: true,
    sort_order: 1,
    ...overrides
  }
}

/** The seeded ladder from 034. */
const LADDER: PlatformFeeRule[] = [
  rule({
    id: 'pct',
    fee_type: 'percentage',
    value: 5,
    max_amount_cents: 100_000,
    min_fee_cents: 1000,
    max_fee_cents: 5000,
    sort_order: 1
  }),
  rule({
    id: 'flat',
    fee_type: 'fixed',
    value: 7500,
    min_amount_cents: 100_001,
    max_amount_cents: null,
    sort_order: 2
  })
]

describe('findFeeRule', () => {
  it('picks the band the amount falls in', () => {
    expect(findFeeRule(50_000, LADDER)?.id).toBe('pct')
    expect(findFeeRule(200_000, LADDER)?.id).toBe('flat')
  })

  it('treats a null upper bound as open-ended', () => {
    expect(findFeeRule(9_999_999, LADDER)?.id).toBe('flat')
  })

  it('is inclusive at both ends of a band', () => {
    expect(findFeeRule(100_000, LADDER)?.id).toBe('pct')
    expect(findFeeRule(100_001, LADDER)?.id).toBe('flat')
  })

  it('ignores an inactive rule', () => {
    const off = [rule({ id: 'off', is_active: false })]
    expect(findFeeRule(5000, off)).toBeNull()
  })

  it('resolves an overlapping ladder by sort_order, not by array order', () => {
    const overlapping = [
      rule({ id: 'second', sort_order: 2, value: 10 }),
      rule({ id: 'first', sort_order: 1, value: 5 })
    ]
    expect(findFeeRule(5000, overlapping)?.id).toBe('first')
  })

  it('returns null when nothing matches', () => {
    expect(findFeeRule(50, [rule({ min_amount_cents: 100_000 })])).toBeNull()
  })
})

describe('computeConvenienceFee', () => {
  it('takes a percentage', () => {
    expect(computeConvenienceFee(50_000, [rule({ value: 5 })])).toBe(2500)
  })

  it('takes a fixed amount regardless of the base', () => {
    const flat = [rule({ fee_type: 'fixed', value: 7500 })]
    expect(computeConvenienceFee(200_000, flat)).toBe(7500)
    expect(computeConvenienceFee(900_000, flat)).toBe(7500)
  })

  it('rounds a fractional percentage to the cent', () => {
    // 3.33% of 1001 = 33.333...
    expect(computeConvenienceFee(1001, [rule({ value: 3.33 })])).toBe(33)
  })

  it('applies the floor when the percentage is too small to matter', () => {
    // 5% of ₱100 is ₱5, below the ₱10 floor.
    expect(computeConvenienceFee(10_000, LADDER)).toBe(1000)
  })

  it('applies the cap when the percentage would run away', () => {
    // 5% of ₱1,000 is ₱50 — exactly the cap, and never more.
    expect(computeConvenienceFee(100_000, LADDER)).toBe(5000)
  })

  it('charges nothing when no rule is configured', () => {
    // A platform that has not set a fee takes none, rather than defaulting to
    // a number nobody chose.
    expect(computeConvenienceFee(50_000, [])).toBe(0)
  })

  it('charges nothing on a free event', () => {
    expect(computeConvenienceFee(0, LADDER)).toBe(0)
  })

  it('never exceeds the amount it is a fee on', () => {
    // A misconfigured flat fee larger than the entry must not reach a payment
    // screen as a total that is mostly fee.
    expect(computeConvenienceFee(500, [rule({ fee_type: 'fixed', value: 100_000 })])).toBe(500)
  })

  it('never goes negative', () => {
    expect(computeConvenienceFee(5000, [rule({ value: -10 })])).toBe(0)
  })
})

describe('computeRegistrationCost', () => {
  it('charges a singles entry once', () => {
    const cost = computeRegistrationCost(500, false, LADDER)

    expect(cost.players).toBe(1)
    expect(cost.entryCents).toBe(50_000)
    expect(cost.feeCents).toBe(2500)
    expect(cost.totalCents).toBe(52_500)
  })

  it('charges a doubles entry twice — a pair is two players', () => {
    const cost = computeRegistrationCost(500, true, LADDER)

    expect(cost.players).toBe(2)
    expect(cost.entryCents).toBe(100_000)
    // And the fee follows the doubled base into its own band.
    expect(cost.feeCents).toBe(5000)
    expect(cost.totalCents).toBe(105_000)
  })

  it('handles a free event with no fee at all', () => {
    const cost = computeRegistrationCost(null, true, LADDER)

    expect(cost.entryCents).toBe(0)
    expect(cost.feeCents).toBe(0)
    expect(cost.totalCents).toBe(0)
  })

  it('converts a decimal fee amount to cents without float drift', () => {
    // 0.1 + 0.2 territory: 199.99 * 100 must be 19999, not 19998.999...
    expect(computeRegistrationCost(199.99, false, []).entryCents).toBe(19_999)
  })
})

describe('formatMoney', () => {
  it('writes pesos with two decimals', () => {
    expect(formatMoney(52_500)).toBe('₱525.00')
    expect(formatMoney(7)).toBe('₱0.07')
  })

  it('falls back to the code for other currencies', () => {
    expect(formatMoney(5000, 'USD')).toBe('USD 50.00')
  })
})

describe('describeFeeRule', () => {
  it('reads a percentage rule with its clamps', () => {
    expect(describeFeeRule(LADDER[0])).toBe('5% (min ₱10.00, max ₱50.00) on ₱0.00–₱1,000.00')
  })

  it('reads an open-ended fixed rule', () => {
    expect(describeFeeRule(LADDER[1])).toBe('₱75.00 flat on ₱1,000.01 and above')
  })
})
