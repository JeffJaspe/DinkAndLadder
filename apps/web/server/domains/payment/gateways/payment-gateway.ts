import type { PaymentProvider } from '../dto/subscription.dto'

/**
 * What a gateway is asked for when a club buys a plan.
 *
 * `list_price_cents` is what the plan CLAIMS to cost. It is an input so the
 * gateway can show it, and it is deliberately NOT what gets recorded — see
 * `CheckoutResult.charged_cents`.
 */
export interface SubscriptionCheckoutRequest {
  club_id: string
  plan_id: string
  plan_name: string
  list_price_cents: number
  currency: string
  billing_interval: 'month' | 'year'
  /** Caller-supplied; the same key twice must not charge twice. */
  idempotency_key: string
}

export interface CheckoutResult {
  outcome: 'succeeded' | 'requires_redirect' | 'failed'
  provider: PaymentProvider
  /** The gateway's own id for this charge. The idempotency index turns on it. */
  provider_reference: string
  /**
   * What was ACTUALLY charged. Never assume this equals `list_price_cents`:
   * conflating the two is how a simulated flow records ₱999 nobody paid.
   */
  charged_cents: number
  is_test: boolean
  redirect_url?: string
  failure_reason?: string
}

export interface PaymentGateway {
  readonly provider: PaymentProvider
  createSubscriptionCheckout(request: SubscriptionCheckoutRequest): Promise<CheckoutResult>
}
