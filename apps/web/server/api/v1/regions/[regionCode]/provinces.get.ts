import { serverSupabaseClient } from '#supabase/server'
import { createRegionRepository } from '~/server/domains/region/repositories/region.repository'
import { toProvinceDto } from '~/server/domains/region/dto/region.dto'
import { apiError } from '~/server/utils/api-error'

export default defineEventHandler(async (event) => {
  const regionCode = getRouterParam(event, 'regionCode')
  if (!regionCode) {
    throw apiError(400, 'MISSING_PARAMETER', 'regionCode is required.')
  }

  const client = await serverSupabaseClient(event)
  const repo = createRegionRepository(client)

  const region = await repo.findRegionByCode(regionCode)
  if (!region) {
    throw apiError(404, 'NOT_FOUND', 'Region not found.')
  }

  const provinces = await repo.listProvincesByRegion(region.id)
  return { provinces: provinces.map(toProvinceDto) }
})
