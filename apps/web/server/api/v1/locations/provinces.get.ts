const PSGC_BASE = 'https://psgc.gitlab.io/api'

export default defineEventHandler(async () => {
  console.log('[locations/provinces] Fetching from PSGC API...')
  try {
    const data = await $fetch<Array<{ code: string; name: string; regionCode: string }>>(
      `${PSGC_BASE}/provinces/`,
      { timeout: 10000 }
    )
    console.log(`[locations/provinces] Successfully fetched ${data?.length ?? 0} provinces`)
    return data
  } catch (error: any) {
    console.error('[locations/provinces] Failed to fetch from PSGC API:', error?.message || error)
    throw createError({
      statusCode: 502,
      statusMessage: `Failed to fetch provinces: ${error?.message || 'Unknown error'}`
    })
  }
})
