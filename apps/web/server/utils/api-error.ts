import { createError } from 'h3'

/**
 * Consistent ApiErrorResponse shape per /docs/06-API-CONTRACTS.md:
 * { code, message, details, trace_id }. Never pass raw db/stack text as message.
 *
 * `message` is passed to createError's own `message` (not just `data.message`)
 * on purpose: h3's H3Error defaults `.message` to `statusMessage` (our `code`)
 * when no explicit message is given, and ofetch's client-side FetchError.data
 * is the *whole* JSON error body — so `fetchError.data.message` reads this
 * top-level field, not `data.message`. Without this, every page using the
 * app-wide `fetchError.data?.message` convention would display the error
 * *code* (e.g. "REGISTRATION_FAILED") instead of the friendly message.
 */
export function apiError(
  statusCode: number,
  code: string,
  message: string,
  details: unknown = null
) {
  return createError({
    statusCode,
    statusMessage: code,
    message,
    data: { code, message, details, trace_id: crypto.randomUUID() }
  })
}
