import type { SupabaseClient } from '@supabase/supabase-js'
import {
  serverSupabaseClient,
  serverSupabaseServiceRole,
  serverSupabaseUser
} from '#supabase/server'
import { createActivityRepository } from '~/server/domains/activity/repositories/activity.repository'
import { createRelationshipRepository } from '~/server/domains/social/repositories/relationship.repository'
import { createActivityService } from '~/server/domains/activity/services/activity.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { createClubRepository } from '~/server/domains/club/repositories/club.repository'
import type {
  ActivityDto,
  ActivityType,
  FeedQuery
} from '~/server/domains/activity/dto/activity.dto'

interface EnrichedActivity extends ActivityDto {
  actor_display_name: string
}

async function enrichWithDisplayNames(
  client: SupabaseClient,
  activities: ActivityDto[]
): Promise<EnrichedActivity[]> {
  const playerIds = [
    ...new Set(activities.map((a) => a.actor_player_id).filter((id): id is string => !!id))
  ]
  if (playerIds.length === 0) {
    return activities.map((a) => ({ ...a, actor_display_name: 'Unknown' }))
  }

  const { data: profiles } = await client
    .from('player_profiles')
    .select('id, display_name')
    .in('id', playerIds)

  const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.display_name]))

  return activities.map((a) => ({
    ...a,
    actor_display_name: (a.actor_player_id && nameMap.get(a.actor_player_id)) || 'Unknown'
  }))
}

async function getCirclePlayerIds(client: SupabaseClient, playerId: string): Promise<string[]> {
  const { data: myParticipations } = await client
    .from('match_participants')
    .select('match_id, team_number')
    .eq('player_id', playerId)

  if (!myParticipations || myParticipations.length === 0) return []

  const matchIds = myParticipations.map((p: { match_id: string }) => p.match_id)

  const { data: allParticipants } = await client
    .from('match_participants')
    .select('player_id')
    .in('match_id', matchIds)
    .neq('player_id', playerId)

  if (!allParticipants) return []

  return [...new Set(allParticipants.map((p: { player_id: string }) => p.player_id))]
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)

  const rawQuery = getQuery(event)
  const query: FeedQuery = {
    limit: Math.min(parseInt(rawQuery.limit as string) || 20, 50),
    offset: parseInt(rawQuery.offset as string) || 0,
    types: rawQuery.types ? ((rawQuery.types as string).split(',') as ActivityType[]) : undefined,
    since: rawQuery.since as string | undefined
  }

  const client = await serverSupabaseClient(event)
  const activityRepo = createActivityRepository(client)
  const relationshipRepo = createRelationshipRepository(client)
  const clubRepo = createClubRepository(client)
  const service = createActivityService(activityRepo, relationshipRepo, clubRepo)

  if (!user) {
    const activities = await service.getPublicFeed(query)
    const enriched = await enrichWithDisplayNames(client, activities)
    return { activities: enriched }
  }

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(user.sub)

  if (!profile) {
    const activities = await service.getPublicFeed(query)
    const enriched = await enrichWithDisplayNames(client, activities)
    return { activities: enriched }
  }

  const membershipRepo = createClubMembershipRepository(client)
  const memberships = await membershipRepo.listOwnWithClub(profile.id)
  const clubIds = memberships.filter((m) => m.status === 'active').map((m) => m.club_id)

  const serviceRoleClient = serverSupabaseServiceRole(event)
  const circlePlayerIds = await getCirclePlayerIds(serviceRoleClient, profile.id)

  const activities = await service.getPersonalizedFeed(profile.id, clubIds, query, circlePlayerIds)
  const enriched = await enrichWithDisplayNames(client, activities)
  return { activities: enriched }
})
