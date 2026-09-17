import { serverSupabaseServiceRole } from '#supabase/server'
import { createRelationshipRepository } from '~/server/domains/social/repositories/relationship.repository'
import { createRelationshipService } from '~/server/domains/social/services/relationship.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createBrandingAssetRepository } from '~/server/domains/platform/repositories/branding-asset.repository'
import { getOptionalUser } from '~/server/utils/optional-user'
import { apiError } from '~/server/utils/api-error'

/**
 * Both follow lists, with names, avatars and which way each runs.
 *
 * One call for both directions because the panel needs both to mark a row
 * mutual, and because the two lists are read together: the point of opening
 * Followers is to follow back the ones you have not.
 *
 * Names are resolved here, not by the client. `/players/me/followers` and
 * `/following` before it returned bare `{ player_id, followed_at }` pairs while
 * the page that consumed them rendered `display_name` — a field the API has
 * never sent — so every row showed an empty name. That went unnoticed because
 * nothing could create a follow, so the lists were always empty.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) throw apiError(401, 'AUTH_REQUIRED', 'Sign in to continue.')

  const client = serverSupabaseServiceRole(event)
  const players = createPlayerProfileRepository(client)

  const profile = await players.findByUserId(claims.sub)
  if (!profile) throw apiError(403, 'PROFILE_REQUIRED', 'Create your player profile first.')

  const service = createRelationshipService(createRelationshipRepository(client))

  // 200 is well past what anybody scrolls and keeps this a single round trip;
  // paging can come back when somebody actually reaches it.
  const [following, followers, mutualIds] = await Promise.all([
    service.getFollowing(profile.id, 200, 0),
    service.getFollowers(profile.id, 200, 0),
    createRelationshipRepository(client).findAllMutualFollows(profile.id)
  ])

  const mutual = new Set(mutualIds)
  const ids = [
    ...new Set([...following.map((f) => f.player_id), ...followers.map((f) => f.player_id)])
  ]
  const profiles = await players.findByIds(ids)
  const assets = createBrandingAssetRepository(client)

  const described = new Map(
    await Promise.all(
      profiles.map(
        async (p) =>
          [
            p.id,
            {
              display_name: p.display_name,
              avatar_url: p.avatar_path ? await assets.resolveUrl(p.avatar_path) : null
            }
          ] as const
      )
    )
  )

  function describe(playerId: string, since: string) {
    const person = described.get(playerId)
    return {
      player_id: playerId,
      display_name: person?.display_name ?? 'Unknown player',
      avatar_url: person?.avatar_url ?? null,
      mutual: mutual.has(playerId),
      since
    }
  }

  return {
    data: {
      following: following.map((f) => describe(f.player_id, f.following_since)),
      followers: followers.map((f) => describe(f.player_id, f.followed_at))
    }
  }
})
