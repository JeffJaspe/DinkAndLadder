import type { SponsorshipRepository } from '../repositories/sponsorship.repository'
import type { SponsorshipDto, CreateSponsorshipInput } from '../dto/sponsorship.dto'
import { toSponsorshipDto } from '../dto/sponsorship.dto'

export class SponsorshipServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export interface SponsorshipService {
  createSponsorship(sponsorPlayerId: string, input: CreateSponsorshipInput): Promise<SponsorshipDto>
  listGiven(playerId: string): Promise<SponsorshipDto[]>
  listReceivedByPlayer(playerId: string): Promise<SponsorshipDto[]>
  listReceivedByClub(clubId: string): Promise<SponsorshipDto[]>
  getTotalReceivedByPlayer(playerId: string): Promise<number>
}

export function createSponsorshipService(sponsorships: SponsorshipRepository): SponsorshipService {
  return {
    async createSponsorship(sponsorPlayerId, input) {
      if (input.amount_cents < 100) {
        throw new SponsorshipServiceError(400, 'AMOUNT_TOO_SMALL', 'Minimum sponsorship is 1.00')
      }

      if (input.target_type === 'player' && input.target_id === sponsorPlayerId) {
        throw new SponsorshipServiceError(400, 'CANNOT_SPONSOR_SELF', 'You cannot sponsor yourself')
      }

      const record = await sponsorships.create({
        sponsor_player_id: sponsorPlayerId,
        target_type: input.target_type,
        target_id: input.target_id,
        amount_cents: input.amount_cents,
        message: input.message,
        is_anonymous: input.is_anonymous,
        status: 'pending'
      })

      return toSponsorshipDto(record)
    },

    async listGiven(playerId) {
      const records = await sponsorships.listGivenByPlayer(playerId)
      return records.map((r) => toSponsorshipDto(r))
    },

    async listReceivedByPlayer(playerId) {
      const records = await sponsorships.listReceivedByTarget('player', playerId)
      return records.map((r) => toSponsorshipDto(r))
    },

    async listReceivedByClub(clubId) {
      const records = await sponsorships.listReceivedByTarget('club', clubId)
      return records.map((r) => toSponsorshipDto(r))
    },

    async getTotalReceivedByPlayer(playerId) {
      return sponsorships.sumReceivedByTarget('player', playerId)
    }
  }
}
