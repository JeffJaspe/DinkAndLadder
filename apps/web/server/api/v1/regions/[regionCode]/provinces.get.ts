import { serverSupabaseClient } from '#supabase/server'
import { createRegionRepository } from '~/server/domains/region/repositories/region.repository'
import { toProvinceDto } from '~/server/domains/region/dto/region.dto'

export default defineEventHandler(async (event) => {
  const regionCode = getRouterParam(event, 'regionCode')
  if (!regionCode) {
    throw createError({ statusCode: 400, statusMessage: 'regionCode is required' })
  }

  const client = await serverSupabaseClient(event)
  const repo = createRegionRepository(client)

  const region = await repo.findRegionByCode(regionCode)
  if (!region) {
    throw createError({ statusCode: 404, statusMessage: 'Region not found' })
  }

  const provinces = await repo.listProvincesByRegion(region.id)
  return { provinces: provinces.map(toProvinceDto) }
})
