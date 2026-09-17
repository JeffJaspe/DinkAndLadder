import type { PaymentGateway } from './payment-gateway'

/**
 * The zero-charge gateway.
 *
 * Exists so the entire subscription flow — checkout, activation, entitlements,
 * lapse, verification queue — can be built and exercised end to end before a
 * real provider is chosen (ADR-006 is open). It always succeeds, and it
 * **always charges nothing**: `charged_cents` is `0` no matter what list price
 * it is handed. The database backs that up with
 * `ck_payment_transactions_simulated_is_test`, so even a caller that lied here
 * could not record real money against this provider.
 *
 * Failure injection is deliberately absent (parent plan §10). A simulated
 * "declined card" would be an invented business rule about what a decline
 * does to a club, and that rule has not been written.
 */
export function createSimulatedGateway(
  ids: () => string = () => crypto.randomUUID()
): PaymentGateway {
  return {
    provider: 'simulated',
    async createSubscriptionCheckout() {
      return {
        outcome: 'succeeded',
        provider: 'simulated',
        provider_reference: `sim_${ids()}`,
        charged_cents: 0,
        is_test: true
      }
    }
  }
}
