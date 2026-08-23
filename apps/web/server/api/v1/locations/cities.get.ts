import { assertPsgcCode, fetchPsgc, PSGC_CACHE_CONTROL } from '~/server/utils/psgc'
import { apiError } from '~/server/utils/api-error'

interface PsgcCityMunicipality {
  code: string
  name: string
  provinceCode?: string
  regionCode?: string
  isCity: boolean
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const hasRegion = query.region !== undefined && query.region !== ''
  const hasProvince = query.province !== undefined && query.province !== ''

  if (!hasRegion && !hasProvince) {
    throw apiError(400, 'VALIDATION_ERROR', 'Provide either a province or a region code.')
  }

  // NCR and the other region-level entities have no parent province, so they
  // are looked up through the regions endpoint instead.
  const path = hasRegion
    ? `/regions/${assertPsgcCode(query.region, 'region')}/cities-municipalities/`
    : `/provinces/${assertPsgcCode(query.province, 'province')}/cities-municipalities/`

  const data = await fetchPsgc<PsgcCityMunicipality[]>(path, 'cities')
  setResponseHeader(event, 'Cache-Control', PSGC_CACHE_CONTROL)
  return data
})
