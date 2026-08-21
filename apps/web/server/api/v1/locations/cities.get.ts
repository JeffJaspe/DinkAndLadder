const PSGC_BASE = 'https://psgc.gitlab.io/api'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const provinceCode = query.province as string | undefined
  const regionCode = query.region as string | undefined

  if (!provinceCode && !regionCode) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Province or region code is required'
    })
  }

  try {
    // NCR and other regions use the region endpoint, provinces use the province endpoint
    const endpoint = regionCode
      ? `${PSGC_BASE}/regions/${regionCode}/cities-municipalities/`
      : `${PSGC_BASE}/provinces/${provinceCode}/cities-municipalities/`

    const data = await $fetch<Array<{ code: string; name: string; provinceCode?: string; regionCode?: string; isCity: boolean }>>(endpoint)
    return data
  } catch (error) {
    console.error('Failed to fetch cities from PSGC API:', error)
    throw createError({
      statusCode: 502,
      statusMessage: 'Failed to fetch cities from external API'
    })
  }
})
