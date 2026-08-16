import { createHmac } from 'crypto'

interface StripeEvent {
  id: string
  type: string
  data: {
    object: Record<string, unknown>
  }
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const webhookSecret = config.stripeWebhookSecret

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured')
    throw createError({ statusCode: 500, statusMessage: 'Webhook not configured' })
  }

  const signature = getHeader(event, 'stripe-signature')
  if (!signature) {
    throw createError({ statusCode: 400, statusMessage: 'Missing signature' })
  }

  const body = await readRawBody(event)
  if (!body) {
    throw createError({ statusCode: 400, statusMessage: 'Missing body' })
  }

  const elements = signature.split(',')
  const timestamp = elements.find(e => e.startsWith('t='))?.slice(2)
  const v1Signature = elements.find(e => e.startsWith('v1='))?.slice(3)

  if (!timestamp || !v1Signature) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid signature format' })
  }

  const signedPayload = `${timestamp}.${body}`
  const expectedSignature = createHmac('sha256', webhookSecret)
    .update(signedPayload)
    .digest('hex')

  if (expectedSignature !== v1Signature) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid signature' })
  }

  const stripeEvent: StripeEvent = JSON.parse(body)

  switch (stripeEvent.type) {
    case 'checkout.session.completed':
      await handleCheckoutComplete(stripeEvent.data.object)
      break

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await handleSubscriptionUpdate(stripeEvent.data.object)
      break

    case 'customer.subscription.deleted':
      await handleSubscriptionCanceled(stripeEvent.data.object)
      break

    case 'invoice.paid':
      await handleInvoicePaid(stripeEvent.data.object)
      break

    case 'invoice.payment_failed':
      await handlePaymentFailed(stripeEvent.data.object)
      break

    default:
      console.log(`Unhandled Stripe event: ${stripeEvent.type}`)
  }

  return { received: true }
})

async function handleCheckoutComplete(session: Record<string, unknown>) {
  const customerId = session.customer as string
  const subscriptionId = session.subscription as string
  const metadata = session.metadata as Record<string, string>

  console.log('Checkout completed:', { customerId, subscriptionId, metadata })
}

async function handleSubscriptionUpdate(subscription: Record<string, unknown>) {
  const customerId = subscription.customer as string
  const status = subscription.status as string
  const priceId = (subscription.items as { data: Array<{ price: { id: string } }> })?.data?.[0]?.price?.id

  console.log('Subscription updated:', { customerId, status, priceId })
}

async function handleSubscriptionCanceled(subscription: Record<string, unknown>) {
  const customerId = subscription.customer as string
  console.log('Subscription canceled:', { customerId })
}

async function handleInvoicePaid(invoice: Record<string, unknown>) {
  const customerId = invoice.customer as string
  const amountPaid = invoice.amount_paid as number
  console.log('Invoice paid:', { customerId, amountPaid })
}

async function handlePaymentFailed(invoice: Record<string, unknown>) {
  const customerId = invoice.customer as string
  console.log('Payment failed:', { customerId })
}
