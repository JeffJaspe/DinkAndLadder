import type { TeamUpRepository } from '../repositories/team-up.repository'
import type { TeamMemberDto, TeamUpRequestDto } from '../dto/team-up.dto'
import { toTeamUpRequestDto } from '../dto/team-up.dto'

export class TeamUpServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

/**
 * Rosters: who a player may bring to an open play session.
 *
 * Directional, unlike a partnership — "I may bring you" is not "you may bring
 * me" — but still requiring the member's consent, because registering somebody
 * commits their evening and, once payments are live, their money.
 */
export interface TeamUpService {
  getTeam(ownerPlayerId: string): Promise<TeamMemberDto[]>
  getIncoming(memberPlayerId: string): Promise<TeamMemberDto[]>
  invite(
    ownerPlayerId: string,
    memberPlayerId: string,
    message?: string
  ): Promise<TeamUpRequestDto>
  respond(memberPlayerId: string, teamUpId: string, accept: boolean): Promise<TeamUpRequestDto>
  /** Either side may end it: the owner drops them, the member leaves. */
  remove(actingPlayerId: string, teamUpId: string): Promise<void>
  /** Gate for registering somebody else. */
  assertCanRegister(ownerPlayerId: string, memberPlayerIds: string[]): Promise<void>
}

export function createTeamUpService(teamUps: TeamUpRepository): TeamUpService {
  return {
    async getTeam(ownerPlayerId) {
      return teamUps.listTeam(ownerPlayerId)
    },

    async getIncoming(memberPlayerId) {
      return teamUps.listIncoming(memberPlayerId)
    },

    async invite(ownerPlayerId, memberPlayerId, message) {
      if (ownerPlayerId === memberPlayerId) {
        throw new TeamUpServiceError(
          400,
          'SELF_TEAM_UP',
          'You are already on your own team.'
        )
      }

      const existing = await teamUps.findBetween(ownerPlayerId, memberPlayerId)
      if (existing) {
        if (existing.status === 'accepted') {
          throw new TeamUpServiceError(
            409,
            'ALREADY_ON_TEAM',
            'They are already on your team.'
          )
        }
        if (existing.status === 'pending') {
          throw new TeamUpServiceError(
            409,
            'REQUEST_PENDING',
            'You have already asked them — they have not answered yet.'
          )
        }
        // A declined request is not a life sentence: asking again is allowed,
        // and reuses the row so the unique pair constraint still holds.
        const revived = await teamUps.updateStatus(existing.id, 'pending')
        return toTeamUpRequestDto(revived)
      }

      const created = await teamUps.create(ownerPlayerId, memberPlayerId, message)
      return toTeamUpRequestDto(created)
    },

    async respond(memberPlayerId, teamUpId, accept) {
      const request = await teamUps.findById(teamUpId)
      if (!request) {
        throw new TeamUpServiceError(404, 'NOT_FOUND', 'That request no longer exists.')
      }
      // Only the person being added may answer — the owner asking themselves
      // would defeat the point of asking.
      if (request.member_player_id !== memberPlayerId) {
        throw new TeamUpServiceError(403, 'FORBIDDEN', 'That request is not yours to answer.')
      }
      if (request.status !== 'pending') {
        throw new TeamUpServiceError(
          409,
          'ALREADY_ANSWERED',
          'That request has already been answered.'
        )
      }

      const updated = await teamUps.updateStatus(teamUpId, accept ? 'accepted' : 'declined')
      return toTeamUpRequestDto(updated)
    },

    async remove(actingPlayerId, teamUpId) {
      const request = await teamUps.findById(teamUpId)
      if (!request) {
        throw new TeamUpServiceError(404, 'NOT_FOUND', 'That team-up no longer exists.')
      }
      // Both ends can walk away. Letting only the owner remove someone would
      // leave a player permanently registrable by somebody they fell out with.
      if (
        request.owner_player_id !== actingPlayerId &&
        request.member_player_id !== actingPlayerId
      ) {
        throw new TeamUpServiceError(403, 'FORBIDDEN', 'That team-up is not yours.')
      }

      await teamUps.remove(teamUpId)
    },

    async assertCanRegister(ownerPlayerId, memberPlayerIds) {
      for (const memberId of memberPlayerIds) {
        // Registering yourself needs no permission from anyone.
        if (memberId === ownerPlayerId) continue

        if (!(await teamUps.isAcceptedMember(ownerPlayerId, memberId))) {
          throw new TeamUpServiceError(
            403,
            'NOT_ON_TEAM',
            'You can only register players who have accepted a team-up with you.'
          )
        }
      }
    }
  }
}
