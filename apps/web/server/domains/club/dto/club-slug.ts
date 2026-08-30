/**
 * Rules for a club's custom URL.
 *
 * `clubs.slug` has existed since 003-club, unique-constrained, and
 * `ClubRepository.findBySlug()` has been written all along - but nothing ever
 * called it and no route resolved it, so every club URL was a raw UUID. Making
 * it routable and editable is what turns a slug from a stored string into an
 * address, and an address needs rules a create-time regex did not have to care
 * about.
 *
 * Shared by the create and update paths so the two cannot disagree about what
 * a valid slug is - the create endpoint carried its own inline regex, which is
 * exactly how a reserved word ends up accepted on one path only.
 */

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** Long enough not to collide by accident, short enough to type. */
export const MIN_SLUG_LENGTH = 3
export const MAX_SLUG_LENGTH = 40

/**
 * Words that must never become a club URL.
 *
 * Two kinds. First, anything that is or could become a top-level route: a club
 * at /clubs/settings is only a problem the day someone adds that page, and by
 * then the club has printed the URL on a banner. Second, words that would let a
 * club impersonate the platform itself.
 */
const RESERVED = new Set([
  'admin',
  'administrator',
  'api',
  'app',
  'auth',
  'billing',
  'clubs',
  'create',
  'dashboard',
  'delete',
  'dev',
  'edit',
  'events',
  'feed',
  'help',
  'login',
  'logout',
  'matches',
  'me',
  'new',
  'notifications',
  'null',
  'official',
  'onboarding',
  'players',
  'profile',
  'rankings',
  'register',
  'reports',
  'root',
  'settings',
  'setup',
  'signin',
  'signup',
  'staff',
  'superadmin',
  'support',
  'system',
  'tournaments',
  'undefined',
  'verified'
])

export type SlugProblem = 'FORMAT' | 'TOO_SHORT' | 'TOO_LONG' | 'RESERVED' | 'UUID_SHAPED' | null

/**
 * A UUID is how the id route is recognised, so a slug shaped like one would be
 * unreachable - the resolver would look it up by id and 404.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function validateSlug(slug: string): SlugProblem {
  if (!SLUG_PATTERN.test(slug)) return 'FORMAT'
  if (slug.length < MIN_SLUG_LENGTH) return 'TOO_SHORT'
  if (slug.length > MAX_SLUG_LENGTH) return 'TOO_LONG'
  if (UUID_PATTERN.test(slug)) return 'UUID_SHAPED'
  if (RESERVED.has(slug)) return 'RESERVED'
  return null
}

export function slugProblemMessage(problem: Exclude<SlugProblem, null>): string {
  switch (problem) {
    case 'FORMAT':
      return 'Use lowercase letters, numbers and single hyphens only.'
    case 'TOO_SHORT':
      return `Club URLs must be at least ${MIN_SLUG_LENGTH} characters.`
    case 'TOO_LONG':
      return `Club URLs must be ${MAX_SLUG_LENGTH} characters or fewer.`
    case 'RESERVED':
      return 'That word is reserved by the platform. Try another.'
    case 'UUID_SHAPED':
      return 'That looks like an ID rather than a name. Try another.'
  }
}

/** Whether a route parameter should be resolved as an id or as a slug. */
export function looksLikeUuid(value: string): boolean {
  return UUID_PATTERN.test(value)
}
