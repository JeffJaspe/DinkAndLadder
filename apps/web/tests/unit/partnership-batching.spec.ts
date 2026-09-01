import { describe, expect, it, vi } from 'vitest'
import { createPartnershipService } from '../../server/domains/partnership/services/partnership.service'
import type { PartnershipRepository } from '../../server/domains/partnership/repositories/partnership.repository'
import type { PartnershipRecord } from '../../server/domains/partnership/dto/partnership.dto'
import type { PlayerProfileRepository } from '../../server/domains/player/repositories/player-profile.repository'
import type { PlayerProfileRecord } from '../../server/domains/player/dto/player-profile.dto'
import type { RatingRepository } from '../../server/domains/rating/repositories/rating.repository'
import type { PlayerRatingRecord } from '../../server/domains/rating/dto/rating.dto'

/**
 * The Partners tab took four to five seconds to render a list of names.
 *
 * Not the query — the number of them. Enrichment ran per partner inside a
 * sequential loop: one profile read plus two rating reads each, awaited one
 * after another, so the cost was `2 + 3n` serial round trips to a database on
 * another continent. These lock in the batched shape, because the loop is easy
 * to reintroduce and nothing else would notice until someone with a handful of
 * partners opened the page.
 */

function makeProfile(id: string): PlayerProfileRecord {
  return {
    id,
    user_id: `user-${id}`,
    display_name: `Player ${id}`,
    province: 'Metro Manila',
    city: 'Makati'
  } as unknown as PlayerProfileRecord
}

function makeRating(playerId: string, value: number): PlayerRatingRecord {
  return { player_id: playerId, rating_value: value } as unknown as PlayerRatingRecord
}

function makePartnership(a: string, b: string): PartnershipRecord {
  const [p1, p2] = a < b ? [a, b] : [b, a]
  return {
    id: `partnership-${p1}-${p2}`,
    player1_id: p1,
    player2_id: p2,
    created_at: '2026-01-01T00:00:00Z'
  }
}

const PARTNER_IDS = ['ally', 'bea', 'caz', 'dio', 'eve']

function setup() {
  const findById = vi.fn(async (id: string) => makeProfile(id))
  const findByIds = vi.fn(async (ids: string[]) => ids.map(makeProfile))
  const getRating = vi.fn(async (id: string) => makeRating(id, 3.5))
  const getRatingsForPlayers = vi.fn(async (ids: string[]) =>
    ids.map((id) => makeRating(id, 3.5))
  )

  const partnerships = {
    async findPartners() {
      return PARTNER_IDS.map((id) => makePartnership('me', id))
    },
    async findDefaultPartner() {
      return { player_id: 'me', partner_id: 'caz', updated_at: '2026-01-01T00:00:00Z' }
    },
    async findPendingRequestsTo() {
      return [
        {
          id: 'req-1',
          from_player_id: 'zed',
          to_player_id: 'me',
          status: 'pending',
          message: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z'
        }
      ]
    }
  } as unknown as PartnershipRepository

  const players = { findById, findByIds } as unknown as PlayerProfileRepository
  const ratings = { getRating, getRatingsForPlayers } as unknown as RatingRepository

  return {
    service: createPartnershipService(partnerships, players, ratings),
    findById,
    findByIds,
    getRating,
    getRatingsForPlayers
  }
}

describe('PartnershipService.getPartners', () => {
  it('reads every profile in one call rather than one call per partner', async () => {
    const { service, findById, findByIds } = setup()

    await service.getPartners('me')

    expect(findById).not.toHaveBeenCalled()
    expect(findByIds).toHaveBeenCalledTimes(1)
    expect(findByIds).toHaveBeenCalledWith(PARTNER_IDS)
  })

  it('reads ratings once per type, not once per partner', async () => {
    const { service, getRating, getRatingsForPlayers } = setup()

    await service.getPartners('me')

    expect(getRating).not.toHaveBeenCalled()
    // Singles and doubles are two different rows, so two calls — not two per
    // partner, which is what the loop was doing.
    expect(getRatingsForPlayers).toHaveBeenCalledTimes(2)
    expect(getRatingsForPlayers).toHaveBeenCalledWith(PARTNER_IDS, 'singles')
    expect(getRatingsForPlayers).toHaveBeenCalledWith(PARTNER_IDS, 'doubles')
  })

  it('still returns every partner, with ratings and the duo first', async () => {
    const { service } = setup()

    const partners = await service.getPartners('me')

    expect(partners).toHaveLength(PARTNER_IDS.length)
    expect(partners[0]!.player_id).toBe('caz')
    expect(partners[0]!.is_default).toBe(true)
    expect(partners.filter((p) => p.is_default)).toHaveLength(1)
    expect(partners[0]!.doubles_rating).toBe(3.5)
    expect(partners[0]!.display_name).toBe('Player caz')
  })

  it('asks for nothing when there are no partners', async () => {
    const { findByIds, getRatingsForPlayers } = setup()
    const empty = createPartnershipService(
      { async findPartners() { return [] }, async findDefaultPartner() { return null } } as unknown as PartnershipRepository,
      { findByIds } as unknown as PlayerProfileRepository,
      { getRatingsForPlayers } as unknown as RatingRepository
    )

    const partners = await empty.getPartners('me')

    expect(partners).toEqual([])
    expect(findByIds).not.toHaveBeenCalled()
    expect(getRatingsForPlayers).not.toHaveBeenCalled()
  })
})

describe('PartnershipService.getIncomingRequests', () => {
  it('batches the sender lookups too', async () => {
    const { service, findById, findByIds } = setup()

    const requests = await service.getIncomingRequests('me')

    expect(findById).not.toHaveBeenCalled()
    expect(findByIds).toHaveBeenCalledWith(['zed'])
    expect(requests[0]!.player?.display_name).toBe('Player zed')
    expect(requests[0]!.player?.rating).toBe(3.5)
  })
})
