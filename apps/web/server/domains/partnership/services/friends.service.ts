import type { PartnershipRepository } from '../repositories/partnership.repository'
import type { TeamUpRepository } from '../repositories/team-up.repository'

/**
 * "Friends", as the product means it: the people you have chosen to play
 * with. A duo partner (mutual, 019) or an accepted team-up in either
 * direction (035). Not opponents — having played someone is history, not a
 * choice — and not club-mates.
 *
 * The one place this set is defined, so the co-organiser picker and the
 * co-organiser rule cannot disagree about who qualifies.
 */
export interface FriendsService {
  /** Deduplicated, with how each qualified. */
  listFriends(playerId: string): Promise<Array<{ player_id: string; via: 'partner' | 'team_up' }>>
  isFriend(playerId: string, otherPlayerId: string): Promise<boolean>
}

export function createFriendsService(
  partnerships: PartnershipRepository,
  teamUps: TeamUpRepository
): FriendsService {
  async function listFriends(playerId: string) {
    const [partnerRows, teammateIds] = await Promise.all([
      partnerships.findPartners(playerId),
      teamUps.findAcceptedPeerIds(playerId)
    ])
    const byId = new Map<string, 'partner' | 'team_up'>()
    for (const row of partnerRows) {
      const other = row.player1_id === playerId ? row.player2_id : row.player1_id
      byId.set(other, 'partner')
    }
    for (const id of teammateIds) {
      if (!byId.has(id)) byId.set(id, 'team_up')
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
