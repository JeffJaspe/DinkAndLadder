import { assertPsgcCode, fetchPsgc, PSGC_CACHE_CONTROL } from '~/server/utils/psgc'

interface PsgcBarangay {
  code: string
  name: string
}

export default defineEventHandler(async (event) => {
  const city = assertPsgcCode(getQuery(event).city, 'city')

  const data = await fetchPsgc<PsgcBarangay[]>(
    `/cities-municipalities/${city}/barangays/`,
    'barangays'
  )
  setResponseHeader(event, 'Cache-Control', PSGC_CACHE_CONTROL)
  return data
})
