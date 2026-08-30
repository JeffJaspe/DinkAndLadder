import { getPublicSponsors } from '~/server/utils/sponsors'

/**
 * The sponsors on the landing page. Public and unauthenticated by design — the
 * landing page is the one screen a signed-out visitor sees.
 *
 * Cached for 30s server-side (see server/utils/sponsors.ts), so this costs one
 * database round trip per half-minute rather than one per visitor.
 */
export default defineEventHandler(async (event) => {
  return { data: await getPublicSponsors(event), request_id: crypto.randomUUID() }
})
