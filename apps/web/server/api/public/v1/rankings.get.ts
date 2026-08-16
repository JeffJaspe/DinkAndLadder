import { serverSupabaseClient } from '#supabase/server'
import { createRankingRepository } from '~/server/domains/rating/repositories/ranking.repository'
import { createRankingService } from '~/server/domains/rating/services/ranking.service'
import type { RatingType } from '~/server/domains/rating/dto/rating.dto'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)

  const ratingType = query.rating_type as RatingType
  if (!ratingType || !['singles', 'doubles'].includes(ratingType)) {
    throw createError({ statusCode: 400, statusMessage: 'rating_type must be singles or doubles' })
  }

  const limit = Math.min(parseInt(query.limit as string) || 50, 100)
  const offset = parseInt(query.offset as string) || 0
  const province = (query.province as string) || undefined
  const city = (query.city as string) || undefined
  const region = (query.region as string) || undefined

  const client = await serverSupabaseClient(event)
  const repo = createRankingRepository(client)
  const service = createRankingService(repo)

  const rankings = await service.getRankings({
    rating_type: ratingType,
    province,
    city,
    limit,
    offset
  })

  return { rankings, region }
})
