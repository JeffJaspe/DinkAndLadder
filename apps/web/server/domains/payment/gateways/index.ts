import type { BillingMode } from '../dto/subscription.dto'
import type { PaymentGateway } from './payment-gateway'
import { createSimulatedGateway } from './simulated.gateway'

export class PaymentGatewayError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

/**
 * Which gateway `platform_config.billing_mode` selects.
 *
 * - `off` — nothing may be bought. 503, not 403: the platform is refusing, not
 *   the user's permission.
 * - `simulated` — the zero-charge gateway.
 * - `live` — no provider is installed. 501 for the same reason the webhook
 *   stubs in `server/api/webhooks/` return 501 (ADR-005): a "live" mode that
 *   quietly fell back to the simulated gateway would activate paid plans for
 *   free and call it a sale. The mode is switchable in the SuperAdmin billing
 *   tab; the code behind it lands when ADR-006 closes.
 */
export function resolvePaymentGateway(mode: BillingMode): PaymentGateway {
  switch (mode) {
    case 'simulated':
      return createSimulatedGateway()
    case 'off':
      throw new PaymentGatewayError(
        503,
        'BILLING_DISABLED',
        'Plans cannot be purchased right now. Billing is switched off.'
      )
    case 'live':
      throw new PaymentGatewayError(
        501,
        'GATEWAY_NOT_CONFIGURED',
        'Live billing is selected but no payment provider is configured on this deployment.'
      )
    default:
      throw new PaymentGatewayError(503, 'BILLING_DISABLED', 'Unknown billing mode.')
  }
}
