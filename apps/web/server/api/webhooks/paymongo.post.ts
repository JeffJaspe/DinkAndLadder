import { createHmac } from 'crypto'

interface PayMongoEvent {
  id: string
  type: string
  data: {
    id: string
    type: string
    attributes: Record<string, unknown>
  }
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const webhookSecret = config.paymongoWebhookSecret

  if (!webhookSecret) {
    console.error('PAYMONGO_WEBHOOK_SECRET not configured')
    throw createError({ statusCode: 500, statusMessage: 'Webhook not configured' })
  }

  const signature = getHeader(event, 'paymongo-signature')
  if (!signature) {
    throw createError({ statusCode: 400, statusMessage: 'Missing signature' })
  }

  const body = await readRawBody(event)
  if (!body) {
    throw createError({ statusCode: 400, statusMessage: 'Missing body' })
  }

  const elements = signature.split(',')
  const timestamp = elements.find(e => e.startsWith('t='))?.slice(2)
  const testSignature = elements.find(e => e.startsWith('te='))?.slice(3)
  const liveSignature = elements.find(e => e.startsWith('li='))?.slice(3)

  if (!timestamp) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid signature format' })
  }

  const signedPayload = `${timestamp}.${body}`
  const expectedSignature = createHmac('sha256', webhookSecret)
    .update(signedPayload)
    .digest('hex')

  const providedSignature = testSignature || liveSignature
  if (expectedSignature !== providedSignature) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid signature' })
  }

  const paymongoEvent: PayMongoEvent = JSON.parse(body)
  const eventType = paymongoEvent.data.attributes.type as string

  switch (eventType) {
    case 'source.chargeable':
      await handleSourceChargeable(paymongoEvent.data)
      break

    case 'payment.paid':
      await handlePaymentPaid(paymongoEvent.data)
      break

    case 'payment.failed':
      await handlePaymentFailed(paymongoEvent.data)
      break

    default:
      console.log(`Unhandled PayMongo event: ${eventType}`)
  }

  return { received: true }
})

async function handleSourceChargeable(data: PayMongoEvent['data']) {
  const sourceId = data.id
  const attributes = data.attributes
  const amount = attributes.amount as number
  const sourceType = attributes.type as string

  console.log('Source chargeable:', { sourceId, amount, sourceType })
}

async function handlePaymentPaid(data: PayMongoEvent['data']) {
  const paymentId = data.id
  const attributes = data.attributes
  const amount = attributes.amount as number
  const netAmount = attributes.net_amount as number

  console.log('Payment paid:', { paymentId, amount, netAmount })
}

async function handlePaymentFailed(data: PayMongoEvent['data']) {
  const paymentId = data.id
  const attributes = data.attributes
  const lastPaymentError = attributes.last_payment_error as Record<string, unknown>

  console.log('Payment failed:', { paymentId, error: lastPaymentError })
}
