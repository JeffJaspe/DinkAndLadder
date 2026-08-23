import type { PartnershipRepository } from '../repositories/partnership.repository'
import type { PlayerProfileRepository } from '../../player/repositories/player-profile.repository'
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
  async function enrichPartner(
    partnerId: string,
    partneredSince: string,
    isDefault = false
  ): Promise<PartnerDto | null> {
    const profile = await players.findById(partnerId)
    if (!profile) return null

    let singlesRating: number | null = null
    let doublesRating: number | null = null

    if (ratings) {
      const singles = await ratings.getRating(partnerId, 'singles')
      const doubles = await ratings.getRating(partnerId, 'doubles')
      singlesRating = singles?.rating_value ?? null
      doublesRating = doubles?.rating_value ?? null
    }

    return {
      player_id: partnerId,
      display_name: profile.display_name,
      province: profile.province,
      city: profile.city,
      singles_rating: singlesRating,
      doubles_rating: doublesRating,
      partnered_since: partneredSince,
      is_default: isDefault
    }
  }

  async function enrichRequest(
    request: PartnerRequestDto,
    otherPlayerId: string
  ): Promise<PartnerRequestDto> {
    const profile = await players.findById(otherPlayerId)
    if (profile) {
      let rating: number | null = null
      if (ratings) {
        const doublesRating = await ratings.getRating(otherPlayerId, 'doubles')
        rating = doublesRating?.rating_value ?? null
      }
      request.player = {
        id: profile.id,
        display_name: profile.display_name,
        rating
      }
    }
    return request
  }

  return {
    async getPartners(playerId) {
      const records = await partnerships.findPartners(playerId)
      const defaultRow = await partnerships.findDefaultPartner(playerId)
      const partners: PartnerDto[] = []

      for (const record of records) {
        const partnerId = record.player1_id === playerId ? record.player2_id : record.player1_id
        const partner = await enrichPartner(
          partnerId,
          record.created_at,
          partnerId === defaultRow?.partner_id
        )
        if (partner) partners.push(partner)
      }

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
      return enrichRequest(toPartnerRequestDto(record), toPlayerId)
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
      const partner = await enrichPartner(request.from_player_id, partnership.created_at)
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
      const requests: PartnerRequestDto[] = []
      for (const record of records) {
        const dto = await enrichRequest(toPartnerRequestDto(record), record.from_player_id)
        requests.push(dto)
      }
      return requests
    },

    async getOutgoingRequests(playerId) {
      const records = await partnerships.findPendingRequestsFrom(playerId)
      const requests: PartnerRequestDto[] = []
      for (const record of records) {
        const dto = await enrichRequest(toPartnerRequestDto(record), record.to_player_id)
        requests.push(dto)
      }
      return requests
    },

    async checkScheduleConflict(_partnerId, _eventId) {
      // Schedule conflict checking is a future enhancement that requires
      // findByPlayerId on the registration repository. For now, return no conflict.
      return { hasConflict: false }
    }
  }
}
