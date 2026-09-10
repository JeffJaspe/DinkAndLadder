/**
 * Plan prices and limits, as words.
 *
 * Pure functions in `utils` rather than in the payment domain, for exactly the
 * reason `utils/convenience-fee.ts` gives: three surfaces must produce the
 * identical number — the SuperAdmin's preview while writing a plan, the public
 * pricing page, and the club's own chooser. A saving advertised at one figure
 * on the pricing page and another in the checkout is the worst kind of bug in
 * this area, so there is one implementation and all three call it.
 *
 * Everything is integer CENTS. Money in a float is a rounding error waiting to
 * be discovered by the person it shortchanged.
 */

import type {
  BillingInterval,
  ClubSubscriptionPlanDto,
  PlanEntitlements
} from '~/server/domains/payment/dto/subscription.dto'

/** `null` means unlimited everywhere in this system. Never `-1`. */
export function isUnlimited(value: number | null): boolean {
  return value === null
}

/**
 * A limit as a phrase: "1 draft event", "3 draft events", "Unlimited draft
 * events", "No draft events".
 *
 * Zero is a real, meaningful limit — a plan that allows none of something — and
 * must never be printed as "0 draft events" or confused with unlimited. That
 * confusion is precisely what `-1`-in-jsonb invited.
 */
export function describeLimit(value: number | null, noun: string, pluralNoun?: string): string {
  const plural = pluralNoun ?? `${noun}s`
  if (isUnlimited(value)) return `Unlimited ${plural}`
  if (value === 0) return `No ${plural}`
  return `${value} ${value === 1 ? noun : plural}`
}

/**
 * A price in the plan's own currency.
 *
 * Zero is "Free", not "₱0.00": a free plan is a different kind of thing from a
 * plan that happens to cost nothing this month, and every pricing page in the
 * world says so.
 *
 * Uses Intl rather than a hardcoded ₱ because `currency` is a column and a
 * second currency is a row away. Minor units come from the formatter, not from
 * an assumed 100 — not every currency has two decimal places, and a hardcoded
 * divide by 100 is wrong in the ones that do not.
 */
export function formatPlanPrice(
  priceCents: number,
  currency = 'php',
  options: { freeLabel?: string } = {}
): string {
  if (priceCents === 0) return options.freeLabel ?? 'Free'

  const code = currency.toUpperCase()
  try {
    const formatter = new Intl.NumberFormat('en-PH', { style: 'currency', currency: code })
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2
    return formatter.format(priceCents / 10 ** digits)
  } catch {
    // An unknown currency code must not take a pricing page down with it.
    return `${code} ${(priceCents / 100).toFixed(2)}`
  }
}

/** How much a yearly plan works out to per month. Null for anything not yearly. */
export function perMonthEquivalent(priceCents: number, interval: BillingInterval): number | null {
  if (interval !== 'year') return null
  return Math.round(priceCents / 12)
}

export interface AnnualSaving {
  /** What twelve months at the monthly price would have cost. */
  monthlyTotalCents: number
  yearlyPriceCents: number
  savingCents: number
  /** Rounded to a whole percent — nobody advertises 16.67%. */
  savingPercent: number
  /** "Save ₱1,200 (17%)" — the sentence, already formatted. */
  label: string
}

/**
 * The saving on a yearly plan against its monthly twin.
 *
 * **Returns null when either side of the pair is missing, or when there is no
 * saving.** A yearly plan with no monthly twin advertises nothing rather than a
 * made-up figure, and a yearly plan that costs *more* than twelve monthly
 * payments must not be dressed up as a discount. This is the function
 * `savings_label` overrides; it exists so the default can never disagree with
 * the two prices it sits between.
 */
export function describeAnnualSaving(
  monthly: { price_cents: number } | null | undefined,
  yearly: { price_cents: number; currency?: string } | null | undefined
): AnnualSaving | null {
  if (!monthly || !yearly) return null
  if (monthly.price_cents <= 0 || yearly.price_cents <= 0) return null

  const monthlyTotalCents = monthly.price_cents * 12
  const savingCents = monthlyTotalCents - yearly.price_cents
  if (savingCents <= 0) return null

  const savingPercent = Math.round((savingCents / monthlyTotalCents) * 100)
  const amount = formatPlanPrice(savingCents, yearly.currency ?? 'php')

  return {
    monthlyTotalCents,
    yearlyPriceCents: yearly.price_cents,
    savingCents,
    savingPercent,
    label: `Save ${amount} (${savingPercent}%)`
  }
}

/**
 * A monthly plan and its yearly twin, tied together by `plan_group`.
 *
 * This is what the interval toggle toggles. Before `plan_group` existed nothing
 * linked the two, so the toggle had nothing to switch between.
 */
export interface PlanGroup {
  key: string
  monthly: ClubSubscriptionPlanDto | null
  yearly: ClubSubscriptionPlanDto | null
  /** Whichever exists, preferring monthly — what a card shows when not toggled. */
  primary: ClubSubscriptionPlanDto
  saving: AnnualSaving | null
}

/**
 * Groups plans for display, preserving the order they arrived in.
 *
 * An ungrouped plan (`plan_group` null) becomes its own group keyed by id
 * rather than being dropped — a plan the admin forgot to group should render
 * on its own, not vanish from the pricing page.
 *
 * A duplicate interval within one group keeps the first and ignores the rest.
 * Two monthly plans in one group is a data mistake, and a pricing page is the
 * wrong place to surface it; the admin UI is.
 */
export function groupPlans(plans: readonly ClubSubscriptionPlanDto[]): PlanGroup[] {
  const order: string[] = []
  const byKey = new Map<
    string,
    {
      monthly: ClubSubscriptionPlanDto | null
      yearly: ClubSubscriptionPlanDto | null
      first: ClubSubscriptionPlanDto
    }
  >()

  for (const plan of plans) {
    const key = plan.plan_group ?? `plan:${plan.id}`
    let entry = byKey.get(key)
    if (!entry) {
      entry = { monthly: null, yearly: null, first: plan }
      byKey.set(key, entry)
      order.push(key)
    }
    if (plan.billing_interval === 'month' && !entry.monthly) entry.monthly = plan
    else if (plan.billing_interval === 'year' && !entry.yearly) entry.yearly = plan
  }

  return order.map((key) => {
    const entry = byKey.get(key)!
    return {
      key,
      monthly: entry.monthly,
      yearly: entry.yearly,
      primary: entry.monthly ?? entry.yearly ?? entry.first,
      saving: describeAnnualSaving(entry.monthly, entry.yearly)
    }
  })
}

/**
 * The four limits as display rows, in the order a club owner cares about them.
 *
 * Built from the typed entitlements rather than from marketing bullets: a
 * bullet is a claim the admin wrote, a limit is what the code will actually
 * enforce, and the two must not be able to disagree on a pricing page.
 */
export function describeEntitlements(
  entitlements: PlanEntitlements
): { label: string; value: string }[] {
  return [
    { label: 'Draft events', value: describeLimit(entitlements.max_draft_events, 'draft event') },
    {
      label: 'Live tournaments',
      value: describeLimit(entitlements.max_live_tournaments, 'tournament')
    },
    {
      label: 'Live open play',
      value: describeLimit(entitlements.max_live_open_play, 'open play event')
    },
    { label: 'Members', value: describeLimit(entitlements.max_members, 'member') },
    {
      label: 'Online entry fees',
      value: entitlements.online_fee_collection ? 'Included' : 'Not included'
    },
    {
      // "Eligible", never "Verified". Paying queues the club for review; a
      // human still approves it, and a card that promises the badge would be
      // promising something this platform does not sell.
      label: 'Verified badge',
      value: entitlements.verified_badge_eligible ? 'Eligible to apply' : 'Not included'
    }
  ]
}
