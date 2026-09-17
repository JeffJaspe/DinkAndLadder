import type { PaymentProvider } from './subscription.dto'

export type TransactionStatus = 'pending' | 'succeeded' | 'failed' | 'refunded' | 'canceled'
export type TransactionType =
  'subscription' | 'tournament_entry' | 'sponsorship' | 'donation' | 'refund'

export interface PaymentTransactionRecord {
  id: string
  player_id: string | null
  club_id: string | null
  stripe_payment_intent_id: string | null
  stripe_invoice_id: string | null
  amount_cents: number
  currency: string
  status: TransactionStatus
  transaction_type: TransactionType
  description: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  // 056 — selected by the repository since step 3.
  provider: PaymentProvider
  provider_reference: string | null
  /** True for every simulated charge; the database CHECK guarantees it. */
  is_test: boolean
  subscription_id: string | null
}

export interface PaymentTransactionDto {
  id: string
  player_id: string | null
  club_id: string | null
  amount_cents: number
  currency: string
  status: TransactionStatus
  transaction_type: TransactionType
  description: string | null
  created_at: string
  provider: PaymentProvider
  /**
   * Carried to the client on purpose: a history row that cannot say "Test"
   * next to ₱0.00 leaves a club owner wondering whether they were charged.
   */
  is_test: boolean
}

export function toPaymentTransactionDto(record: PaymentTransactionRecord): PaymentTransactionDto {
  return {
    id: record.id,
    player_id: record.player_id,
    club_id: record.club_id,
    amount_cents: record.amount_cents,
    currency: record.currency,
    status: record.status,
    transaction_type: record.transaction_type,
    description: record.description,
    created_at: record.created_at,
    provider: record.provider,
    is_test: record.is_test
  }
}
