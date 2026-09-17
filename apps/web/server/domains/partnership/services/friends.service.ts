import type { PartnershipRepository } from '../repositories/partnership.repository'
import type { RelationshipRepository } from '~/server/domains/social/repositories/relationship.repository'

/**
 * "Friends", as the product means it: the people you have chosen to play with.
 * A duo partner (mutual, 019), or somebody you and they follow each other
 * (066). Not opponents — having played someone is history, not a choice — and
 * not club-mates.
 *
 * The mutual-follow half replaced accepted team-ups in 066-follow-and-kudos.
 * The qualifying bar is deliberately the same as before and not lower: a
 * team-up needed the other person to accept, and a one-way follow needs nothing
 * from them at all, so counting a one-way follow here would have quietly let
 * anybody appoint a stranger as a co-organiser.
 *
 * The one place this set is defined, so the co-organiser picker and the
 * co-organiser rule cannot disagree about who qualifies.
 */
export interface FriendsService {
  /** Deduplicated, with how each qualified. */
  listFriends(playerId: string): Promise<Array<{ player_id: string; via: 'partner' | 'follow' }>>
  isFriend(playerId: string, otherPlayerId: string): Promise<boolean>
}

export function createFriendsService(
  partnerships: PartnershipRepository,
  relationships: RelationshipRepository
): FriendsService {
  async function listFriends(playerId: string) {
    const [partnerRows, mutualIds] = await Promise.all([
      partnerships.findPartners(playerId),
      relationships.findAllMutualFollows(playerId)
    ])
    const byId = new Map<string, 'partner' | 'follow'>()
    for (const row of partnerRows) {
      const other = row.player1_id === playerId ? row.player2_id : row.player1_id
      byId.set(other, 'partner')
    }
    for (const id of mutualIds) {
      if (!byId.has(id)) byId.set(id, 'follow')
    }
    byId.delete(playerId)
    return [...byId.entries()].map(([player_id, via]) => ({ player_id, via }))
  }

  return {
    listFriends,
    async isFriend(playerId, otherPlayerId) {
      if (playerId === otherPlayerId) return false
      const friends = await listFriends(playerId)
      return friends.some((f) => f.player_id === otherPlayerId)
    }
  }
}
