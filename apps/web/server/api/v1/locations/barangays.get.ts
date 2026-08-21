const PSGC_BASE = 'https://psgc.gitlab.io/api'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const cityCode = query.city as string

  if (!cityCode) {
    throw createError({
      statusCode: 400,
      statusMessage: 'City code is required'
    })
  }

  try {
    const data = await $fetch<Array<{ code: string; name: string }>>(
      `${PSGC_BASE}/cities-municipalities/${cityCode}/barangays/`
    )
    return data
  } catch (error) {
    console.error('Failed to fetch barangays from PSGC API:', error)
    throw createError({
      statusCode: 502,
      statusMessage: 'Failed to fetch barangays from external API'
    })
  }
})
