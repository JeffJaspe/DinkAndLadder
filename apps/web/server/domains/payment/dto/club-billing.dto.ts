import type { ClubEntitlements, ClubUsage } from './entitlements.dto'
import type {
  BillingMode,
  ClubSubscriptionDto,
  ClubSubscriptionPlanDto,
  SubscriptionSource
} from './subscription.dto'
import type { PaymentTransactionDto } from './transaction.dto'

/**
 * Everything the club billing page needs in one round trip.
 *
 * The page shows the plan, the meters, the held events and the history side by
 * side, and every one of those has to agree with the others — so they come
 * from one call that resolved them all at the same instant, not four fetches
 * that can each land on a different side of a status change.
 */
export interface ClubBillingDto {
  subscription: ClubSubscriptionDto | null
  /** The plan the subscription points at, when there is one. */
  plan: ClubSubscriptionPlanDto | null
  /** What the club may do right now, and why — the same object the server enforces. */
  entitlements: ClubEntitlements
  usage: ClubUsage
  billing: {
    mode: BillingMode
    /** SuperAdmin-owned test-mode copy; null means the client shows its default sentence. */
    notice: string | null
  }
  /**
   * Events held by a plan downgrade. Nothing about them was cancelled; the
   * page lists them so the club knows what resubscribing restores.
   */
  restricted_events: RestrictedEventSummary[]
  transactions: PaymentTransactionDto[]
}

export interface RestrictedEventSummary {
  id: string
  name: string
  event_type: string
  start_date: string
  restricted_at: string
}

export interface CheckoutRequestDto {
  plan_id: string
  /**
   * Accepted now so the contract does not change when vouchers become real.
   * Until then any non-empty code is refused with `VOUCHER_UNKNOWN`.
   */
  voucher_code?: string | null
}

export interface CheckoutResultDto {
  outcome: 'activated' | 'requires_redirect' | 'already_processed'
  subscription: ClubSubscriptionDto
  transaction: PaymentTransactionDto
  /** Set only for `requires_redirect`, which no configured gateway produces today. */
  redirect_url: string | null
  /** True when the club was moved into the verification queue by this activation. */
  verification_requested: boolean
}

/* --- SuperAdmin --- */

export interface AdminGrantSubscriptionDto {
  club_id: string
  plan_id: string
  /** Whole months from now. */
  months: number
  notes?: string | null
}

export interface AdminUpdateSubscriptionDto {
  action: 'extend' | 'cancel'
  /** Required for `extend`. */
  months?: number
  notes?: string | null
}

/** One row of the SuperAdmin clubs table: the subscription with its context. */
export interface AdminClubSubscriptionRowDto {
  subscription: ClubSubscriptionDto
  club: { id: string; name: string; verification_status: string }
  plan: { id: string; name: string } | null
  source: SubscriptionSource
  /** The newest transaction on this subscription, if any — the "payment state" column. */
  last_transaction: PaymentTransactionDto | null
}
