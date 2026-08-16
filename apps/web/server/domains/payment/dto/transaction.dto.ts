export type TransactionStatus = 'pending' | 'succeeded' | 'failed' | 'refunded' | 'canceled'
export type TransactionType = 'subscription' | 'tournament_entry' | 'sponsorship' | 'donation' | 'refund'

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
    created_at: record.created_at
  }
}
