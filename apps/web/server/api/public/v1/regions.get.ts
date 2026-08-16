import { serverSupabaseClient } from '#supabase/server'
import { createRegionRepository } from '~/server/domains/region/repositories/region.repository'
import { toRegionDto } from '~/server/domains/region/dto/region.dto'

export default defineEventHandler(async (event) => {
  const client = await serverSupabaseClient(event)
  const repo = createRegionRepository(client)

  const regions = await repo.listRegions()
  return { regions: regions.map(toRegionDto) }
})
