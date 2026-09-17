import type { H3Event } from 'h3'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverSupabaseServiceRole } from '#supabase/server'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import { createEventCoOrganizerRepository } from '~/server/domains/event/repositories/event-co-organizer.repository'
import { createEventCoOrganizerService } from '~/server/domains/event/services/event-co-organizer.service'
import { createPartnershipRepository } from '~/server/domains/partnership/repositories/partnership.repository'
import { createRelationshipRepository } from '~/server/domains/social/repositories/relationship.repository'
import { createFriendsService } from '~/server/domains/partnership/services/friends.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createBrandingAssetRepository } from '~/server/domains/platform/repositories/branding-asset.repository'
import type { EventCoOrganizerDto } from '~/server/domains/event/dto/event-co-organizer.dto'

/**
 * The co-organiser service, wired the same way for its three endpoints.
 *
 * Service role throughout: appointing someone writes a row about another
 * player, which no self-service policy can express; the creator-and-friend
 * checks in the service are what make that safe.
 */
export function buildCoOrganizerService(event: H3Event) {
  const client = serverSupabaseServiceRole(event)
  return {
    client,
    service: createEventCoOrganizerService(
      createEventRepository(client),
      createEventCoOrganizerRepository(client),
      createFriendsService(
        createPartnershipRepository(client),
        createRelationshipRepository(client)
      )
    )
  }
}

/** Names and avatars for a set of player ids. */
export async function describePlayers(
  client: SupabaseClient,
  playerIds: string[]
): Promise<Map<string, { display_name: string; avatar_url: string | null }>> {
  if (playerIds.length === 0) return new Map()
  const profiles = await createPlayerProfileRepository(client).findByIds(playerIds)
  const assets = createBrandingAssetRepository(client)
  const entries = await Promise.all(
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
  return new Map(entries)
}

export async function listCoOrganizerDtos(
  event: H3Event,
  eventId: string
): Promise<EventCoOrganizerDto[]> {
  const { client, service } = buildCoOrganizerService(event)
  const rows = await service.list(eventId)
  const people = await describePlayers(
    client,
    rows.map((r) => r.player_id)
  )
  return rows.map((r) => ({
    player_id: r.player_id,
    display_name: people.get(r.player_id)?.display_name ?? 'Unknown player',
    avatar_url: people.get(r.player_id)?.avatar_url ?? null,
    added_at: r.created_at
  }))
}
