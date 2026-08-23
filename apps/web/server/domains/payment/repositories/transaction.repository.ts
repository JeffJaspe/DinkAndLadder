import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  PaymentTransactionRecord,
  TransactionStatus,
  TransactionType
} from '../dto/transaction.dto'

const COLUMNS =
  'id, player_id, club_id, stripe_payment_intent_id, stripe_invoice_id, amount_cents, currency, status, transaction_type, description, metadata, created_at, updated_at'

export interface TransactionRepository {
  create(input: CreateTransactionInput): Promise<PaymentTransactionRecord>
  findByStripePaymentIntent(stripePaymentIntentId: string): Promise<PaymentTransactionRecord | null>
  findByStripeInvoice(stripeInvoiceId: string): Promise<PaymentTransactionRecord | null>
  updateStatus(id: string, status: TransactionStatus): Promise<PaymentTransactionRecord>
  listByPlayer(playerId: string, limit?: number): Promise<PaymentTransactionRecord[]>
  listByClub(clubId: string, limit?: number): Promise<PaymentTransactionRecord[]>
}

export interface CreateTransactionInput {
  player_id?: string
  club_id?: string
  stripe_payment_intent_id?: string
  stripe_invoice_id?: string
  amount_cents: number
  currency?: string
  status: TransactionStatus
  transaction_type: TransactionType
  description?: string
  metadata?: Record<string, unknown>
}

export function createTransactionRepository(client: SupabaseClient): TransactionRepository {
  return {
    async create(input) {
      const { data, error } = await client
        .from('payment_transactions')
        .insert({
          ...input,
          currency: input.currency ?? 'php',
          metadata: input.metadata ?? {}
        })
        .select(COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as PaymentTransactionRecord
    },

    async findByStripePaymentIntent(stripePaymentIntentId) {
      const { data, error } = await client
        .from('payment_transactions')
        .select(COLUMNS)
        .eq('stripe_payment_intent_id', stripePaymentIntentId)
        .maybeSingle()

      if (error) throw error
      return data as unknown as PaymentTransactionRecord | null
    },

    async findByStripeInvoice(stripeInvoiceId) {
      const { data, error } = await client
        .from('payment_transactions')
        .select(COLUMNS)
        .eq('stripe_invoice_id', stripeInvoiceId)
        .maybeSingle()

      if (error) throw error
      return data as unknown as PaymentTransactionRecord | null
    },

    async updateStatus(id, status) {
      const { data, error } = await client
        .from('payment_transactions')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select(COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as PaymentTransactionRecord
    },

    async listByPlayer(playerId, limit = 50) {
      const { data, error } = await client
        .from('payment_transactions')
        .select(COLUMNS)
        .eq('player_id', playerId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) throw error
      return data as unknown as PaymentTransactionRecord[]
    },

    async listByClub(clubId, limit = 50) {
      const { data, error } = await client
        .from('payment_transactions')
        .select(COLUMNS)
        .eq('club_id', clubId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) throw error
      return data as unknown as PaymentTransactionRecord[]
    }
  }
}
