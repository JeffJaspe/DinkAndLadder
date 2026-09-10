import type { PlanEntitlements, SubscriptionStatus } from './subscription.dto'

/**
 * What one club is actually allowed to do right now, and why.
 *
 * This is the shape every caller asks for instead of reading a plan row and
 * deciding for itself. `event.service.ts` currently answers the same question
 * with three hardcoded `>= 1` literals and a
 * `verification_status === 'verified'` bypass; those two systems know nothing
 * about each other, and this type is where they merge.
 */
export interface ClubEntitlements extends PlanEntitlements {
  plan_id: string | null
  plan_name: string

  /**
   * **Why the club has this allowance.** Not decoration: the billing page has
   * to explain the number it shows, and "unlimited because a SuperAdmin
   * verified you" and "unlimited because you pay" are different sentences to a
   * club owner deciding whether to renew.
   *
   * - `plan` — a live subscription to a specific plan.
   * - `default_plan` — no subscription, so the `is_default_free` plan applies.
   * - `verified_override` — the pre-billing rule, kept: a verified club is
   *   unrestricted regardless of what it pays. Removing that would take
   *   allowances away from clubs that have them today.
   * - `fallback` — no subscription *and* no default plan row could be read.
   *   Should never happen; the resolver still has to return something, and
   *   what it returns must be the safe conservative allowance rather than
   *   unlimited. A billing lookup that fails open is a billing system that
   *   does not exist.
   */
  origin: 'plan' | 'default_plan' | 'fallback' | 'verified_override'

  /** Null when the club has no subscription row at all. */
  status: SubscriptionStatus | null
  current_period_end: string | null

  /**
   * True when the period has ended but `subscription_grace_days` has not run
   * out. The club keeps everything during grace — a card that expired on a
   * weekend must not restrict an event that is running on Sunday.
   */
  in_grace: boolean
}

/**
 * What the club is using, counted against the same four ceilings.
 *
 * Kept beside the entitlements because every surface that shows one shows the
 * other: "1 of 1 live tournaments" is the useful sentence, and a limit with no
 * usage next to it makes a club owner go looking.
 */
export interface ClubUsage {
  drafts: number
  live_tournaments: number
  live_open_play: number
  members: number
}
