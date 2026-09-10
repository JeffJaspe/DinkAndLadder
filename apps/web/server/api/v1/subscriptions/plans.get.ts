import { serverSupabaseClient } from '#supabase/server'
import { createSubscriptionRepository } from '~/server/domains/payment/repositories/subscription.repository'
import { createSubscriptionService } from '~/server/domains/payment/services/subscription.service'
import type { PlanType } from '~/server/domains/payment/dto/subscription.dto'
import { apiError } from '~/server/utils/api-error'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const planType = query.type as PlanType | undefined

  if (planType && !['player', 'club'].includes(planType)) {
    throw apiError(400, 'INVALID_INPUT', 'Invalid plan type.')
  }

  const client = await serverSupabaseClient(event)
  const repo = createSubscriptionRepository(client)
  const service = createSubscriptionService(repo)

  const plans = await service.listPlans(planType)
  return { plans }
})
