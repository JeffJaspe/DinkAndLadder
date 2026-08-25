/**
 * What a player actually pays, and why.
 *
 * Kept as pure functions in `utils` rather than in the payment domain because
 * both sides need the identical answer: the server when it eventually charges,
 * and the registration screen when it quotes a total before the player commits.
 * A fee quoted at one number and charged at another is the worst kind of bug in
 * this area, so there is one implementation and both call it.
 *
 * Everything is integer CENTS. Money in a float is a rounding error waiting to
 * be discovered by the person it shortchanged.
 */

export type FeeType = 'percentage' | 'fixed'

export interface PlatformFeeRule {
  id: string
  fee_type: FeeType
  /** Percent (5 = 5%) for a percentage rule; cents for a fixed one. */
  value: number
  /** The band of BASE amount this rule applies to. */
  min_amount_cents: number
  /** Null means no upper bound — the top of the ladder. */
  max_amount_cents: number | null
  /** Floor and cap on the computed fee. Only meaningful for a percentage. */
  min_fee_cents: number | null
  max_fee_cents: number | null
  is_active: boolean
  sort_order: number
}

/**
 * The first active rule whose band contains this amount.
 *
 * Ordered by `sort_order` so an overlapping ladder resolves predictably rather
 * than by whatever order the database happened to return. Returns null when
 * nothing matches, which is a real state — a platform that has not configured a
 * fee charges none, rather than falling back to a number nobody chose.
 */
export function findFeeRule(
  baseCents: number,
  rules: readonly PlatformFeeRule[]
): PlatformFeeRule | null {
  return (
    [...rules]
      .filter((rule) => rule.is_active)
      .sort((a, b) => a.sort_order - b.sort_order)
      .find(
        (rule) =>
          baseCents >= rule.min_amount_cents &&
          (rule.max_amount_cents === null || baseCents <= rule.max_amount_cents)
      ) ?? null
  )
}

/**
 * The convenience fee on a base amount.
 *
 * Rounds half-up to the cent, then clamps. Clamping AFTER rounding matters: a
 * cap of 5000 must mean the fee is never 5001, and rounding a clamped value
 * could push it back over.
 */
export function computeConvenienceFee(
  baseCents: number,
  rules: readonly PlatformFeeRule[]
): number {
  if (baseCents <= 0) return 0

  const rule = findFeeRule(baseCents, rules)
  if (!rule) return 0

  let fee =
    rule.fee_type === 'percentage'
      ? Math.round((baseCents * rule.value) / 100)
      : Math.round(rule.value)

  if (rule.min_fee_cents !== null) fee = Math.max(fee, rule.min_fee_cents)
  if (rule.max_fee_cents !== null) fee = Math.min(fee, rule.max_fee_cents)

  // A fee is never negative and never exceeds what it is a fee on — either
  // would be a misconfiguration, and neither should reach a payment screen.
  return Math.max(0, Math.min(fee, baseCents))
}

export interface RegistrationCost {
  /** Entry fee for one player, as the event states it. */
  unitCents: number
  /** 1 for singles, 2 for doubles — a pair is two entries on one row. */
  players: number
  entryCents: number
  feeCents: number
  totalCents: number
  currency: string
}

/**
 * The whole quote for entering one category.
 *
 * Doubles is the event's fee twice, because it is two people playing. The fee
 * applies to the tournament's stated amount rather than a per-category price:
 * one event, one entry fee, as asked.
 */
export function computeRegistrationCost(
  feeAmount: number | null,
  isDoubles: boolean,
  rules: readonly PlatformFeeRule[],
  currency = 'PHP'
): RegistrationCost {
  // `events.fee_amount` is a decimal in major units; everything below is cents.
  const unitCents = Math.max(0, Math.round((feeAmount ?? 0) * 100))
  const players = isDoubles ? 2 : 1
  const entryCents = unitCents * players
  const feeCents = computeConvenienceFee(entryCents, rules)

  return {
    unitCents,
    players,
    entryCents,
    feeCents,
    totalCents: entryCents + feeCents,
    currency
  }
}

/** `12345` -> `"₱123.45"`. Falls back to the code for anything but PHP. */
export function formatMoney(cents: number, currency = 'PHP'): string {
  const amount = (cents / 100).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
  return currency === 'PHP' ? `₱${amount}` : `${currency} ${amount}`
}

/** How a rule reads in the admin list: "5% (₱10.00–₱50.00) on ₱0.00–₱1,000.00". */
export function describeFeeRule(rule: PlatformFeeRule): string {
  const band = `on ${formatMoney(rule.min_amount_cents)}${
    rule.max_amount_cents === null ? ' and above' : `–${formatMoney(rule.max_amount_cents)}`
  }`

  if (rule.fee_type === 'fixed') return `${formatMoney(rule.value)} flat ${band}`

  const clamps: string[] = []
  if (rule.min_fee_cents !== null) clamps.push(`min ${formatMoney(rule.min_fee_cents)}`)
  if (rule.max_fee_cents !== null) clamps.push(`max ${formatMoney(rule.max_fee_cents)}`)

  return `${rule.value}%${clamps.length ? ` (${clamps.join(', ')})` : ''} ${band}`
}
