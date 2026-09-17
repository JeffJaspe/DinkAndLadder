import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  PaymentTransactionRecord,
  TransactionStatus,
  TransactionType
} from '../dto/transaction.dto'
import type { PaymentProvider } from '../dto/subscription.dto'

const COLUMNS =
  'id, player_id, club_id, stripe_payment_intent_id, stripe_invoice_id, amount_cents, currency, status, transaction_type, description, metadata, created_at, updated_at, ' +
  'provider, provider_reference, is_test, subscription_id'

export interface TransactionRepository {
  create(input: CreateTransactionInput): Promise<PaymentTransactionRecord>
  findByStripePaymentIntent(stripePaymentIntentId: string): Promise<PaymentTransactionRecord | null>
  findByStripeInvoice(stripeInvoiceId: string): Promise<PaymentTransactionRecord | null>
  /**
   * The idempotency lookup. A gateway that retries a webhook is normal
   * behaviour; charging twice because of it is not, and this is how a handler
   * recognises a delivery it has already recorded.
   *
   * Scoped by provider as well as reference, because two gateways can hand out
   * the same-looking id and the unique index behind this is on the pair.
   */
  findByProviderReference(
    provider: PaymentProvider,
    reference: string
  ): Promise<PaymentTransactionRecord | null>
  updateStatus(id: string, status: TransactionStatus): Promise<PaymentTransactionRecord>
  /**
   * Ties a transaction to the subscription it paid for. Separate from `create`
   * because the transaction is written BEFORE the subscription exists — see
   * `startCheckout` — so the id is not known at insert time.
   */
  updateSubscription(id: string, subscriptionId: string): Promise<PaymentTransactionRecord>
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
  /** Defaults to 'manual' in the database — an entry with no gateway at all. */
  provider?: PaymentProvider
  /** The gateway's own id for this charge, and the key idempotency turns on. */
  provider_reference?: string | null
  /**
   * A database CHECK enforces `provider = 'simulated'` implies `is_test` and a
   * zero amount, so a simulated charge cannot be recorded as real money even if
   * a caller tries.
   */
  is_test?: boolean
  subscription_id?: string | null
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

    async findByProviderReference(provider, reference) {
      const { data, error } = await client
        .from('payment_transactions')
        .select(COLUMNS)
        .eq('provider', provider)
        .eq('provider_reference', reference)
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

    async updateSubscription(id, subscriptionId) {
      const { data, error } = await client
        .from('payment_transactions')
        .update({ subscription_id: subscriptionId, updated_at: new Date().toISOString() })
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
