import type { H3Event } from 'h3'
import { serverSupabaseUser } from '#supabase/server'

/**
 * `serverSupabaseUser` for callers who may legitimately have no session.
 *
 * The module's own helper does not distinguish "nobody is signed in" from "the
 * token this browser sent is no longer usable": a stale or revoked refresh
 * token makes `getClaims()` return an error, and it rethrows that as
 * `createError({ statusMessage })` with **no statusCode** — which h3 serves as
 * a 500 carrying a raw Supabase string ("Invalid Refresh Token: Refresh Token
 * Not Found").
 *
 * That is wrong in both directions. A public page that only wanted to know who
 * the viewer is (to include their drafts, or mark a card "Registered") goes
 * down entirely, and an authenticated endpoint reports a server fault instead
 * of asking the visitor to sign in again. Neither is a 500: a browser holding a
 * dead cookie is a signed-out browser.
 *
 * So: a bad token collapses to `null`, the same as no token at all. Endpoints
 * that require a caller keep their own `if (!claims) throw apiError(401, …)`
 * guard, which now fires with the right status and a message a person can act
 * on. Endpoints where the caller is optional simply degrade to the public view.
 */
export async function getOptionalUser(event: H3Event) {
  try {
    return await serverSupabaseUser(event)
  } catch {
    return null
  }
}
