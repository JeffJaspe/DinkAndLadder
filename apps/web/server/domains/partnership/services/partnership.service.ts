import type { PartnershipRepository } from '../repositories/partnership.repository'
import type { PlayerProfileRepository } from '../../player/repositories/player-profile.repository'
import type { PlayerProfileRecord } from '../../player/dto/player-profile.dto'
import type { RatingRepository } from '../../rating/repositories/rating.repository'
import type { PartnerDto, PartnerRequestDto } from '../dto/partnership.dto'
import { toPartnerRequestDto } from '../dto/partnership.dto'

export class PartnershipServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export interface PartnershipService {
  getPartners(playerId: string): Promise<PartnerDto[]>
  isPartner(playerId: string, otherPlayerId: string): Promise<boolean>
  removePartner(playerId: string, partnerPlayerId: string): Promise<void>

  getDefaultPartnerId(playerId: string): Promise<string | null>
  setDefaultPartner(playerId: string, partnerPlayerId: string | null): Promise<string | null>

  sendRequest(
    fromPlayerId: string,
    toPlayerId: string,
    message?: string
  ): Promise<PartnerRequestDto>
  acceptRequest(playerId: string, requestId: string): Promise<PartnerDto>
  declineRequest(playerId: string, requestId: string): Promise<void>
  cancelRequest(playerId: string, requestId: string): Promise<void>
  getIncomingRequests(playerId: string): Promise<PartnerRequestDto[]>
  getOutgoingRequests(playerId: string): Promise<PartnerRequestDto[]>

  checkScheduleConflict(
    partnerId: string,
    eventId: string
  ): Promise<{ hasConflict: boolean; conflictingEventName?: string }>
}

export function createPartnershipService(
  partnerships: PartnershipRepository,
  players: PlayerProfileRepository,
  ratings?: RatingRepository
): PartnershipService {
  /**
   * Everyone's profile and ratings for a whole list, in three queries.
   *
   * This replaces a per-player `findById` + two `getRating` calls issued inside
   * a sequential `for` loop, which made the Partners tab cost `2 + 3n` round
   * trips one after another. Against a pooled Supabase instance a continent
   * away that is ~150ms each, so five partners took four to five seconds to
   * render a list of names — and every action that refreshed the list paid it
   * again.
   *
   * `findByIds` and `getRatingsForPlayers` both already existed; nothing here
   * needed a new query, only a batched one.
   */
  async function loadPlayerDetails(playerIds: string[]) {
    const unique = [...new Set(playerIds)]
    if (unique.length === 0) {
      return {
        profiles: new Map<string, PlayerProfileRecord>(),
        singles: new Map<string, number | null>(),
        doubles: new Map<string, number | null>()
      }
    }

    const [profileRows, singlesRows, doublesRows] = await Promise.all([
      players.findByIds(unique),
      ratings ? ratings.getRatingsForPlayers(unique, 'singles') : Promise.resolve([]),
      ratings ? ratings.getRatingsForPlayers(unique, 'doubles') : Promise.resolve([])
    ])

    return {
      profiles: new Map(profileRows.map((p) => [p.id, p])),
      singles: new Map(singlesRows.map((r) => [r.player_id, r.rating_value])),
      doubles: new Map(doublesRows.map((r) => [r.player_id, r.rating_value]))
    }
  }

  type PlayerDetails = Awaited<ReturnType<typeof loadPlayerDetails>>

  function buildPartner(
    partnerId: string,
    partneredSince: string,
    isDefault: boolean,
    details: PlayerDetails
  ): PartnerDto | null {
    const profile = details.profiles.get(partnerId)
    if (!profile) return null

    return {
      player_id: partnerId,
      display_name: profile.display_name,
      province: profile.province,
      city: profile.city,
      singles_rating: details.singles.get(partnerId) ?? null,
      doubles_rating: details.doubles.get(partnerId) ?? null,
      partnered_since: partneredSince,
      is_default: isDefault
    }
  }

  function buildRequest(
    request: PartnerRequestDto,
    otherPlayerId: string,
    details: PlayerDetails
  ): PartnerRequestDto {
    const profile = details.profiles.get(otherPlayerId)
    if (profile) {
      request.player = {
        id: profile.id,
        display_name: profile.display_name,
        rating: details.doubles.get(otherPlayerId) ?? null
      }
    }
    return request
  }

  return {
    async getPartners(playerId) {
      // Independent of each other, so they go together rather than one after
      // the other.
      const [records, defaultRow] = await Promise.all([
        partnerships.findPartners(playerId),
        partnerships.findDefaultPartner(playerId)
      ])

      const partnerIds = records.map((record) =>
        record.player1_id === playerId ? record.player2_id : record.player1_id
      )
      const details = await loadPlayerDetails(partnerIds)

      const partners: PartnerDto[] = []
      records.forEach((record, index) => {
        const partnerId = partnerIds[index]!
        const partner = buildPartner(
          partnerId,
          record.created_at,
          partnerId === defaultRow?.partner_id,
          details
        )
        if (partner) partners.push(partner)
      })

      // The duo leads the list — it is the one every doubles picker pre-selects,
      // so it is also the one the reader is looking for first.
      partners.sort((a, b) => Number(b.is_default) - Number(a.is_default))

      return partners
    },

    async isPartner(playerId, otherPlayerId) {
      const partnership = await partnerships.findPartnershipBetween(playerId, otherPlayerId)
      return partnership !== null
    },

    async removePartner(playerId, partnerPlayerId) {
      const partnership = await partnerships.findPartnershipBetween(playerId, partnerPlayerId)
      if (!partnership) {
        throw new PartnershipServiceError(404, 'NOT_FOUND', 'Partnership not found.')
      }
      await partnerships.deletePartnership(partnership.id)

      // Dropping the partnership must drop the duo with it. The FK only
      // cascades when the *profile* is deleted, so without this the pickers
      // would keep pre-selecting someone who is no longer a partner.
      // Both directions: either player may have had the other as their duo.
      const [mine, theirs] = await Promise.all([
        partnerships.findDefaultPartner(playerId),
        partnerships.findDefaultPartner(partnerPlayerId)
      ])
      const clears: Promise<void>[] = []
      if (mine?.partner_id === partnerPlayerId)
        clears.push(partnerships.clearDefaultPartner(playerId))
      if (theirs?.partner_id === playerId) {
        clears.push(partnerships.clearDefaultPartner(partnerPlayerId))
      }
      await Promise.all(clears)
    },

    async getDefaultPartnerId(playerId) {
      const row = await partnerships.findDefaultPartner(playerId)
      return row?.partner_id ?? null
    },

    /**
     * Set or clear the duo. Passing null clears it.
     *
     * The target must already be a confirmed partner — this is a preference
     * over an existing relationship, never a way to create one, and letting an
     * arbitrary id through would pre-fill doubles pickers with a stranger.
     */
    async setDefaultPartner(playerId, partnerPlayerId) {
      if (partnerPlayerId === null) {
        await partnerships.clearDefaultPartner(playerId)
        return null
      }

      if (partnerPlayerId === playerId) {
        throw new PartnershipServiceError(
          400,
          'INVALID_REQUEST',
          'You cannot set yourself as your duo.'
        )
      }

      const partnership = await partnerships.findPartnershipBetween(playerId, partnerPlayerId)
      if (!partnership) {
        throw new PartnershipServiceError(
          409,
          'NOT_A_PARTNER',
          'You can only set a confirmed partner as your duo.'
        )
      }

      const row = await partnerships.upsertDefaultPartner(playerId, partnerPlayerId)
      return row.partner_id
    },

    async sendRequest(fromPlayerId, toPlayerId, message) {
      if (fromPlayerId === toPlayerId) {
        throw new PartnershipServiceError(
          400,
          'INVALID_REQUEST',
          'Cannot send a partner request to yourself.'
        )
      }

      // Check if already partners
      const existing = await partnerships.findPartnershipBetween(fromPlayerId, toPlayerId)
      if (existing) {
        throw new PartnershipServiceError(409, 'ALREADY_PARTNERS', 'You are already partners.')
      }

      // Check if a pending request already exists (in either direction)
      const outgoing = await partnerships.findRequestBetween(fromPlayerId, toPlayerId)
      if (outgoing) {
        throw new PartnershipServiceError(
          409,
          'REQUEST_EXISTS',
          'A pending request already exists.'
        )
      }

      const incoming = await partnerships.findRequestBetween(toPlayerId, fromPlayerId)
      if (incoming) {
        throw new PartnershipServiceError(
          409,
          'INCOMING_REQUEST_EXISTS',
          'This player has already sent you a request. Accept it instead.'
        )
      }

      const record = await partnerships.createRequest(fromPlayerId, toPlayerId, message)
      return buildRequest(
        toPartnerRequestDto(record),
        toPlayerId,
        await loadPlayerDetails([toPlayerId])
      )
    },

    async acceptRequest(playerId, requestId) {
      const request = await partnerships.findRequestById(requestId)
      if (!request) {
        throw new PartnershipServiceError(404, 'NOT_FOUND', 'Request not found.')
      }

      if (request.to_player_id !== playerId) {
        throw new PartnershipServiceError(
          403,
          'FORBIDDEN',
          'You can only accept requests sent to you.'
        )
      }

      if (request.status !== 'pending') {
        throw new PartnershipServiceError(
          409,
          'INVALID_STATE',
          `Request is already ${request.status}.`
        )
      }

      // Update request status
      await partnerships.updateRequestStatus(requestId, 'accepted')

      // Create the partnership
      const partnership = await partnerships.createPartnership(request.from_player_id, playerId)

      // Return the new partner
      const partner = buildPartner(
        request.from_player_id,
        partnership.created_at,
        false,
        await loadPlayerDetails([request.from_player_id])
      )
      if (!partner) {
        throw new PartnershipServiceError(500, 'INTERNAL_ERROR', 'Could not load partner profile.')
      }
      return partner
    },

    async declineRequest(playerId, requestId) {
      const request = await partnerships.findRequestById(requestId)
      if (!request) {
        throw new PartnershipServiceError(404, 'NOT_FOUND', 'Request not found.')
      }

      if (request.to_player_id !== playerId) {
        throw new PartnershipServiceError(
          403,
          'FORBIDDEN',
          'You can only decline requests sent to you.'
        )
      }

      if (request.status !== 'pending') {
        throw new PartnershipServiceError(
          409,
          'INVALID_STATE',
          `Request is already ${request.status}.`
        )
      }

      await partnerships.updateRequestStatus(requestId, 'declined')
    },

    async cancelRequest(playerId, requestId) {
      const request = await partnerships.findRequestById(requestId)
      if (!request) {
        throw new PartnershipServiceError(404, 'NOT_FOUND', 'Request not found.')
      }

      if (request.from_player_id !== playerId) {
        throw new PartnershipServiceError(
          403,
          'FORBIDDEN',
          'You can only cancel requests you sent.'
        )
      }

      if (request.status !== 'pending') {
        throw new PartnershipServiceError(
          409,
          'INVALID_STATE',
          `Request is already ${request.status}.`
        )
      }

      await partnerships.updateRequestStatus(requestId, 'cancelled')
    },

    async getIncomingRequests(playerId) {
      const records = await partnerships.findPendingRequestsTo(playerId)
      const details = await loadPlayerDetails(records.map((r) => r.from_player_id))
      return records.map((record) =>
        buildRequest(toPartnerRequestDto(record), record.from_player_id, details)
      )
    },

    async getOutgoingRequests(playerId) {
      const records = await partnerships.findPendingRequestsFrom(playerId)
      const details = await loadPlayerDetails(records.map((r) => r.to_player_id))
      return records.map((record) =>
        buildRequest(toPartnerRequestDto(record), record.to_player_id, details)
      )
    },

    async checkScheduleConflict(_partnerId, _eventId) {
      // Schedule conflict checking is a future enhancement that requires
      // findByPlayerId on the registration repository. For now, return no conflict.
      return { hasConflict: false }
    }
  }
}
