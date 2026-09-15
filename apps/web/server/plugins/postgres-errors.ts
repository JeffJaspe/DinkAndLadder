/**
 * Maps the one PostgreSQL error every id-taking route can produce into an API
 * error, in one place.
 *
 * Repositories rethrow PostgREST errors as-is. When a route param is not a
 * UUID — `/api/v1/players/some-id` — Postgres rejects the comparison with
 * `22P02 invalid_text_representation` before any row is looked at, and h3
 * turned that plain object into a bare `500 Server Error`. Over a hundred
 * handlers read a router param; validating each one is a hundred chances to
 * forget. A malformed id can never match a row, so it is a 404, exactly as if
 * the id were well-formed and absent.
 *
 * Only the error's status and public message are changed; the original object
 * is preserved for the server log.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error) => {
    // h3 has already wrapped the thrown PostgREST object by the time this
    // runs: the original sits in `cause`, and the wrapper is a 500 flagged
    // `unhandled`. Only that shape is rewritten — an error a handler chose to
    // throw with its own status is left alone.
    const err = error as {
      cause?: { code?: unknown }
      statusCode?: number
      statusMessage?: string
      message?: string
      data?: unknown
      unhandled?: boolean
    }
    if (err.cause?.code !== '22P02' || !err.unhandled) return
    err.statusCode = 404
    err.statusMessage = 'NOT_FOUND'
    err.message = 'No record found with that id.'
    err.unhandled = false
    err.data = {
      code: 'NOT_FOUND',
      message: 'No record found with that id.',
      details: null,
      trace_id: crypto.randomUUID()
    }
  })
})
