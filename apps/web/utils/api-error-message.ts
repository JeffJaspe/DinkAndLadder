/**
 * Reads the human-facing message off a failed $fetch / useFetch error.
 *
 * Server routes return the ApiErrorResponse envelope built by
 * server/utils/api-error.ts, where ofetch exposes the whole JSON body as
 * `error.data` — so the friendly text is at `data.message`. A few routes still
 * throw a bare createError, which surfaces as `statusMessage` instead; both are
 * handled here so call sites do not each re-derive the convention (and do not
 * each reach for `any` to do it).
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const e = err as
    | { data?: { message?: string; statusMessage?: string }; statusMessage?: string }
    | null
    | undefined

  return e?.data?.message || e?.data?.statusMessage || e?.statusMessage || fallback
}
