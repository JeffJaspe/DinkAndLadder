import { assertPsgcCode, fetchPsgc, PSGC_CACHE_CONTROL } from '~/server/utils/psgc'

interface PsgcProvince {
  code: string
  name: string
  regionCode: string
}

export default defineEventHandler(async (event) => {
  // Optional region filter; when absent this returns all provinces.
  const region = getQuery(event).region
  const path =
    region === undefined || region === ''
      ? '/provinces/'
      : `/regions/${assertPsgcCode(region, 'region')}/provinces/`

  const data = await fetchPsgc<PsgcProvince[]>(path, 'provinces')
  setResponseHeader(event, 'Cache-Control', PSGC_CACHE_CONTROL)
  return data
})
