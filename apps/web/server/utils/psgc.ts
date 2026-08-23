import { apiError } from './api-error'

/**
 * Thin proxy over the Philippine Standard Geographic Code API. It exists only
 * to dodge CORS from the browser — see composables/useLocationPicker.ts.
 *
 * Two rules matter here:
 *
 * 1. Codes are interpolated into the upstream URL *path*, so they must be
 *    validated before use. Without a check, a caller can put traversal
 *    segments in the query string and steer the request at other endpoints on
 *    that host. PSGC codes are 9- or 10-digit numeric strings (NCR is
 *    130000000), so a strict digit pattern is both correct and sufficient.
 *
 * 2. The routes are unauthenticated (the pickers run on register and community,
 *    before sign-in), so responses are cached hard. PSGC data changes on the
 *    order of years; without this every page load hit the upstream at our IP's
 *    expense.
 */
const PSGC_BASE = 'https://psgc.gitlab.io/api'
const PSGC_CODE_PATTERN = /^\d{9,10}$/

/** One day. PSGC is effectively static reference data. */
export const PSGC_CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=604800'

export function assertPsgcCode(value: unknown, label: string): string {
  if (typeof value !== 'string' || !PSGC_CODE_PATTERN.test(value)) {
    throw apiError(400, 'VALIDATION_ERROR', `${label} must be a 9- or 10-digit PSGC code.`)
  }
  return value
}

/**
 * `path` must already be built from validated segments — this does not
 * sanitise. Upstream failures become 502 with a fixed message; the underlying
 * error text is logged, never returned, so upstream internals aren't echoed to
 * callers.
 */
export async function fetchPsgc<T>(path: string, what: string): Promise<T> {
  try {
    // Cast through unknown: Nitro types $fetch's return via its route-literal
    // map, which can't be reconciled with a caller-supplied generic on an
    // absolute external URL.
    return (await $fetch(`${PSGC_BASE}${path}`, { timeout: 10_000 })) as unknown as T
  } catch (error) {
    console.error(`[psgc] failed to fetch ${what}:`, error)
    throw apiError(502, 'UPSTREAM_UNAVAILABLE', `Could not load ${what} right now.`)
  }
}
