import { beforeEach, describe, expect, it } from 'vitest'
import {
  createPartnershipService,
  PartnershipServiceError
} from '../../server/domains/partnership/services/partnership.service'
import type { PartnershipRepository } from '../../server/domains/partnership/repositories/partnership.repository'
import type {
  DefaultPartnerRecord,
  PartnershipRecord
} from '../../server/domains/partnership/dto/partnership.dto'
import type { PlayerProfileRepository } from '../../server/domains/player/repositories/player-profile.repository'
import type { PlayerProfileRecord } from '../../server/domains/player/dto/player-profile.dto'

/** Partnerships are stored once per pair, ordered so player1_id < player2_id. */
function makePartnership(a: string, b: string): PartnershipRecord {
  const [p1, p2] = a < b ? [a, b] : [b, a]
  return {
    id: `partnership-${p1}-${p2}`,
    player1_id: p1,
    player2_id: p2,
    created_at: new Date().toISOString()
  }
}

function makeProfile(id: string): PlayerProfileRecord {
  return {
    id,
    user_id: `user-${id}`,
    display_name: `Player ${id}`,
    first_name: null,
    last_name: null,
    bio: null,
    province: null,
    city: null,
    barangay: null,
    dominant_hand: null,
    preferred_position: null,
    profile_visibility: 'public',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null
  } as unknown as PlayerProfileRecord
}

describe('PartnershipService — default duo', () => {
  let partnershipRows: PartnershipRecord[]
  let defaults: Map<string, DefaultPartnerRecord>
  let partnerships: PartnershipRepository
  let players: PlayerProfileRepository

  const notUsed = () => {
    throw new Error('not used in these tests')
  }

  beforeEach(() => {
    // me is partnered with ally, and not with stranger.
    partnershipRows = [makePartnership('me', 'ally')]
    defaults = new Map()

    partnerships = {
      async findPartners(playerId: string) {
        return partnershipRows.filter(
          (row) => row.player1_id === playerId || row.player2_id === playerId
        )
      },
      async findPartnershipBetween(a: string, b: string) {
        const [p1, p2] = a < b ? [a, b] : [b, a]
        return partnershipRows.find((row) => row.player1_id === p1 && row.player2_id === p2) ?? null
      },
      createPartnership: notUsed,
      async deletePartnership(id: string) {
        partnershipRows = partnershipRows.filter((row) => row.id !== id)
      },
      countPartners: notUsed,
      findPendingRequestsTo: notUsed,
      findPendingRequestsFrom: notUsed,
      findRequestBetween: notUsed,
      findRequestById: notUsed,
      createRequest: notUsed,
      updateRequestStatus: notUsed,

      async findDefaultPartner(playerId: string) {
        return defaults.get(playerId) ?? null
      },
      async upsertDefaultPartner(playerId: string, partnerId: string) {
        const row: DefaultPartnerRecord = {
          player_id: playerId,
          partner_id: partnerId,
          updated_at: new Date().toISOString()
        }
        defaults.set(playerId, row)
        return row
      },
      async clearDefaultPartner(playerId: string) {
        defaults.delete(playerId)
      }
    } as unknown as PartnershipRepository

    players = {
      async findById(id: string) {
        return makeProfile(id)
      },
      async findByIds(ids: string[]) {
        return ids.map(makeProfile)
      }
    } as unknown as PlayerProfileRepository
  })

  function service() {
    return createPartnershipService(partnerships, players)
  }

  it('sets a confirmed partner as the duo', async () => {
    const result = await service().setDefaultPartner('me', 'ally')

    expect(result).toBe('ally')
    expect(defaults.get('me')?.partner_id).toBe('ally')
  })

  // The duo is a preference over an existing relationship, never a way to
  // create one — otherwise the doubles pickers would pre-fill a stranger.
  it('refuses a player who is not a confirmed partner', async () => {
    await expect(service().setDefaultPartner('me', 'stranger')).rejects.toBeInstanceOf(
      PartnershipServiceError
    )
    await expect(service().setDefaultPartner('me', 'stranger')).rejects.toMatchObject({
      status: 409,
      code: 'NOT_A_PARTNER'
    })
    expect(defaults.has('me')).toBe(false)
  })

  it('refuses self as the duo', async () => {
    await expect(service().setDefaultPartner('me', 'me')).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_REQUEST'
    })
  })

  it('clears the duo when passed null', async () => {
    await service().setDefaultPartner('me', 'ally')
    const result = await service().setDefaultPartner('me', null)

    expect(result).toBeNull()
    expect(defaults.has('me')).toBe(false)
  })

  it('replaces the previous duo rather than adding a second', async () => {
    partnershipRows.push(makePartnership('me', 'other'))

    await service().setDefaultPartner('me', 'ally')
    await service().setDefaultPartner('me', 'other')

    expect(defaults.size).toBe(1)
    expect(defaults.get('me')?.partner_id).toBe('other')
  })

  // Without this, every doubles picker would keep pre-selecting someone who is
  // no longer a partner: the FK only cascades when the profile itself is gone.
  it('clears the duo when that partnership is removed', async () => {
    await service().setDefaultPartner('me', 'ally')
    await service().removePartner('me', 'ally')

    expect(defaults.has('me')).toBe(false)
  })

  it('clears the other side too when they had me as their duo', async () => {
    await service().setDefaultPartner('ally', 'me')
    await service().removePartner('me', 'ally')

    expect(defaults.has('ally')).toBe(false)
  })

  it('leaves an unrelated duo alone when a different partnership is removed', async () => {
    partnershipRows.push(makePartnership('me', 'other'))

    await service().setDefaultPartner('me', 'other')
    await service().removePartner('me', 'ally')

    expect(defaults.get('me')?.partner_id).toBe('other')
  })

  it('marks exactly one partner as the duo, and lists them first', async () => {
    partnershipRows.push(makePartnership('me', 'other'))
    await service().setDefaultPartner('me', 'other')

    const partners = await service().getPartners('me')

    expect(partners).toHaveLength(2)
    expect(partners[0]!.player_id).toBe('other')
    expect(partners[0]!.is_default).toBe(true)
    expect(partners.filter((p) => p.is_default)).toHaveLength(1)
  })

  it('reports no duo when none is set', async () => {
    expect(await service().getDefaultPartnerId('me')).toBeNull()

    const partners = await service().getPartners('me')
    expect(partners.every((p) => !p.is_default)).toBe(true)
  })
})
