import { serverSupabaseServiceRole } from '#supabase/server'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createPartnershipRepository } from '~/server/domains/partnership/repositories/partnership.repository'
import { createTeamUpRepository } from '~/server/domains/partnership/repositories/team-up.repository'
import { createFriendsService } from '~/server/domains/partnership/services/friends.service'
import type { FriendDto } from '~/server/domains/event/dto/event-co-organizer.dto'
import { apiError } from '~/server/utils/api-error'
import { getOptionalUser } from '~/server/utils/optional-user'
import { describePlayers } from '~/server/utils/co-organizers'

/**
 * The people this player may appoint as co-organisers: duo partners and
 * accepted team-ups. One list, sorted by name, so the picker is the same set
 * the server will accept.
 */
export default defineEventHandler(async (event) => {
  const claims = await getOptionalUser(event)
  if (!claims) throw apiError(401, 'AUTH_REQUIRED', 'Sign in to see your friends.')

  const client = serverSupabaseServiceRole(event)
  const profile = await createPlayerProfileRepository(client).findByUserId(claims.sub)
  if (!profile)
    throw apiError(409, 'PLAYER_PROFILE_REQUIRED', 'Complete your player profile first.')

  const friends = await createFriendsService(
    createPartnershipRepository(client),
    createTeamUpRepository(client)
  ).listFriends(profile.id)
  const people = await describePlayers(
    client,
    friends.map((f) => f.player_id)
  )

  const data: FriendDto[] = friends
    .map((f) => ({
      player_id: f.player_id,
      display_name: people.get(f.player_id)?.display_name ?? 'Unknown player',
      avatar_url: people.get(f.player_id)?.avatar_url ?? null,
      via: f.via
    }))
    .sort((a, b) => a.display_name.localeCompare(b.display_name))

  return { data }
})
