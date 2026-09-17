import { describe, it, expect } from 'vitest'
import { createSimulatedGateway } from '~/server/domains/payment/gateways/simulated.gateway'
import { resolvePaymentGateway, PaymentGatewayError } from '~/server/domains/payment/gateways'

const request = {
  club_id: 'club-1',
  plan_id: 'plan-premium',
  plan_name: 'Premium',
  list_price_cents: 99900,
  currency: 'php',
  billing_interval: 'month' as const,
  idempotency_key: 'key-1'
}

describe('simulated gateway', () => {
  it('charges NOTHING even when handed a ₱999 list price', async () => {
    const result = await createSimulatedGateway().createSubscriptionCheckout(request)
    expect(result.charged_cents).toBe(0)
    expect(result.outcome).toBe('succeeded')
  })

  it('marks every result as a test and as its own provider', async () => {
    const result = await createSimulatedGateway().createSubscriptionCheckout(request)
    expect(result.is_test).toBe(true)
    expect(result.provider).toBe('simulated')
  })

  it('hands out a sim_ reference from the injected id source', async () => {
    const result = await createSimulatedGateway(() => 'abc').createSubscriptionCheckout(request)
    expect(result.provider_reference).toBe('sim_abc')
  })

  it('never asks for a redirect', async () => {
    const result = await createSimulatedGateway().createSubscriptionCheckout(request)
    expect(result.redirect_url).toBeUndefined()
  })
})

describe('resolvePaymentGateway', () => {
  it('returns the simulated gateway for simulated mode', () => {
    expect(resolvePaymentGateway('simulated').provider).toBe('simulated')
  })

  it('refuses with 503 BILLING_DISABLED when billing is off', () => {
    expect(() => resolvePaymentGateway('off')).toThrowError(PaymentGatewayError)
    try {
      resolvePaymentGateway('off')
    } catch (err) {
      expect((err as PaymentGatewayError).status).toBe(503)
      expect((err as PaymentGatewayError).code).toBe('BILLING_DISABLED')
    }
  })

  it('refuses with 501 GATEWAY_NOT_CONFIGURED for live — never a silent fallback', () => {
    try {
      resolvePaymentGateway('live')
      expect.unreachable('live must not resolve to any gateway')
    } catch (err) {
      expect((err as PaymentGatewayError).status).toBe(501)
      expect((err as PaymentGatewayError).code).toBe('GATEWAY_NOT_CONFIGURED')
    }
  })
})
