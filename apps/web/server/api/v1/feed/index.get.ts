import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createActivityRepository } from '~/server/domains/activity/repositories/activity.repository'
import { createRelationshipRepository } from '~/server/domains/social/repositories/relationship.repository'
import { createActivityService } from '~/server/domains/activity/services/activity.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import type { ActivityType, FeedQuery } from '~/server/domains/activity/dto/activity.dto'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)

  const rawQuery = getQuery(event)
  const query: FeedQuery = {
    limit: Math.min(parseInt(rawQuery.limit as string) || 20, 50),
    offset: parseInt(rawQuery.offset as string) || 0,
    types: rawQuery.types ? (rawQuery.types as string).split(',') as ActivityType[] : undefined,
    since: rawQuery.since as string | undefined
  }

  const client = await serverSupabaseClient(event)
  const activityRepo = createActivityRepository(client)
  const relationshipRepo = createRelationshipRepository(client)
  const service = createActivityService(activityRepo, relationshipRepo)

  if (!user) {
    const activities = await service.getPublicFeed(query)
    return { activities }
  }

  const playerRepo = createPlayerProfileRepository(client)
  const profile = await playerRepo.findByUserId(user.sub)

  if (!profile) {
    const activities = await service.getPublicFeed(query)
    return { activities }
  }

  const membershipRepo = createClubMembershipRepository(client)
  const memberships = await membershipRepo.listOwnWithClub(profile.id)
  const clubIds = memberships
    .filter((m) => m.status === 'active')
    .map((m) => m.club_id)

  const activities = await service.getPersonalizedFeed(profile.id, clubIds, query)
  return { activities }
})
