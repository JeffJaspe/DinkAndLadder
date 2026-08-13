import { createError } from 'h3'

/**
 * Consistent ApiErrorResponse shape per /docs/06-API-CONTRACTS.md:
 * { code, message, details, trace_id }. Never pass raw db/stack text as message.
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
    data: { code, message, details, trace_id: crypto.randomUUID() }
  })
}
