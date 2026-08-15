import type { MatchRepository } from '../repositories/match.repository'
import type {
  MatchDto,
  MatchStatus,
  MatchVerificationRecord,
  RecordVerificationDecisionInput,
  SubmitMatchInput
} from '../dto/match.dto'
import { toMatchDto } from '../dto/match.dto'

export class MatchServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

const TEAM_SIZE: Record<'singles' | 'doubles', number> = { singles: 1, doubles: 2 }

export interface MatchService {
  getById(matchId: string): Promise<MatchDto | null>
  submitMatch(submittedByPlayerId: string, input: SubmitMatchInput): Promise<MatchDto>
  initiateVerification(actingPlayerId: string, matchId: string): Promise<MatchDto>
  recordVerificationDecision(
    actingPlayerId: string,
    matchId: string,
    input: RecordVerificationDecisionInput
  ): Promise<MatchDto>
}

/**
 * Validation belongs here, not in the DB CHECK constraints, because "does this match
 * have the right number of players on each team for its type" is business logic, not a
 * per-row data-integrity rule. Score legality (is 11-9 a valid pickleball game score) is
 * deliberately NOT validated — that's an unresolved product rule (see /docs/11-RATING-
 * SYSTEM-SPECIFICATION.md), not something to invent here.
 */
function validateSubmission(submittedByPlayerId: string, input: SubmitMatchInput): void {
  const perTeam = TEAM_SIZE[input.match_type]
  const expectedTotal = perTeam * 2

  if (input.participants.length !== expectedTotal) {
    throw new MatchServiceError(
      400,
      'VALIDATION_ERROR',
      `${input.match_type} requires exactly ${expectedTotal} participants.`
    )
  }

  const uniquePlayerIds = new Set(input.participants.map((p) => p.player_id))
  if (uniquePlayerIds.size !== input.participants.length) {
    throw new MatchServiceError(
      400,
      'VALIDATION_ERROR',
      'A player cannot appear twice in the same match.'
    )
  }

  for (const team of [1, 2] as const) {
    const count = input.participants.filter((p) => p.team_number === team).length
    if (count !== perTeam) {
      throw new MatchServiceError(
        400,
        'VALIDATION_ERROR',
        `Team ${team} must have exactly ${perTeam} player(s) for ${input.match_type}.`
      )
    }
  }

  if (!uniquePlayerIds.has(submittedByPlayerId)) {
    throw new MatchServiceError(
      400,
      'VALIDATION_ERROR',
      'You can only submit a match you played in.'
    )
  }

  if (input.scores.length === 0) {
    throw new MatchServiceError(400, 'VALIDATION_ERROR', 'At least one set score is required.')
  }
  const setNumbers = new Set(input.scores.map((s) => s.set_number))
  if (setNumbers.size !== input.scores.length) {
    throw new MatchServiceError(400, 'VALIDATION_ERROR', 'Duplicate set_number in scores.')
  }
}

/**
 * How individual verifier decisions roll up into the match's own status is ADR-002 (Match
 * Verification Authority, /docs/18-ADR-INDEX.md — still OPEN). This is an interim, literal
 * reading of /docs/12-MATCH-VERIFICATION-SPECIFICATION.md, not a finalized product rule:
 *  - any single 'disputed' decision takes the whole match to 'disputed' (a disputed result
 *    "must not silently affect rankings" — the strongest, most conservative response),
 *  - otherwise any single 'rejected' takes it to 'rejected',
 *  - only once EVERY required verifier has 'confirmed' does it become 'verified',
 *  - anything else (some still 'pending') stays 'pending_verification'.
 * "Required verifier" = every match participant except the one who submitted the match (see
 * initiateVerification below) — the spec never distinguishes teammate from opponent here, and
 * inventing that distinction isn't this pass's call to make.
 */
function resolveMatchStatus(verifications: MatchVerificationRecord[]): MatchStatus {
  if (verifications.some((v) => v.status === 'disputed')) return 'disputed'
  if (verifications.some((v) => v.status === 'rejected')) return 'rejected'
  if (verifications.length > 0 && verifications.every((v) => v.status === 'confirmed')) {
    return 'verified'
  }
  return 'pending_verification'
}

export function createMatchService(repository: MatchRepository): MatchService {
  return {
    async getById(matchId) {
      const match = await repository.findById(matchId)
      return match ? toMatchDto(match) : null
    },

    async submitMatch(submittedByPlayerId, input) {
      validateSubmission(submittedByPlayerId, input)
      const match = await repository.create(input, submittedByPlayerId)
      return toMatchDto(match)
    },

    async initiateVerification(actingPlayerId, matchId) {
      const match = await repository.findById(matchId)
      if (!match) {
        throw new MatchServiceError(404, 'NOT_FOUND', 'No match found with that id.')
      }

      const participantIds = match.match_participants.map((p) => p.player_id)
      if (!participantIds.includes(actingPlayerId)) {
        throw new MatchServiceError(
          403,
          'FORBIDDEN',
          'Only a participant in this match can start verification.'
        )
      }

      if (match.status !== 'submitted') {
        throw new MatchServiceError(
          409,
          'INVALID_MATCH_STATE',
          `Verification cannot be started from status '${match.status}'.`
        )
      }

      const requiredVerifierIds = [...new Set(participantIds)].filter(
        (playerId) => playerId !== match.submitted_by_player_id
      )
      await repository.createPendingVerifications(matchId, requiredVerifierIds)
      await repository.updateMatchStatus(matchId, 'pending_verification', null)

      const updated = await repository.findById(matchId)
      if (!updated) throw new Error('Match disappeared immediately after being updated.')
      return toMatchDto(updated)
    },

    async recordVerificationDecision(actingPlayerId, matchId, input) {
      const match = await repository.findById(matchId)
      if (!match) {
        throw new MatchServiceError(404, 'NOT_FOUND', 'No match found with that id.')
      }

      if (match.status === 'submitted') {
        throw new MatchServiceError(
          409,
          'VERIFICATION_REQUIRED',
          'Verification has not been started for this match yet.'
        )
      }
      if (match.status !== 'pending_verification') {
        throw new MatchServiceError(
          409,
          'INVALID_MATCH_STATE',
          `This match is already '${match.status}' and can no longer receive verification decisions.`
        )
      }

      const own = match.match_verifications.find((v) => v.verifier_player_id === actingPlayerId)
      if (!own) {
        throw new MatchServiceError(
          403,
          'FORBIDDEN',
          'You are not a designated verifier for this match.'
        )
      }
      if (own.status !== 'pending') {
        throw new MatchServiceError(
          409,
          'CONFLICT',
          'You have already recorded a decision for this match.'
        )
      }

      await repository.updateVerificationDecision(
        matchId,
        actingPlayerId,
        input.status,
        input.response_note ?? null
      )

      const updatedVerifications = match.match_verifications.map((v) =>
        v.verifier_player_id === actingPlayerId ? { ...v, status: input.status } : v
      )
      const newStatus = resolveMatchStatus(updatedVerifications)
      if (newStatus !== match.status) {
        await repository.updateMatchStatus(
          matchId,
          newStatus,
          newStatus === 'verified' ? new Date().toISOString() : null
        )
      }

      const updated = await repository.findById(matchId)
      if (!updated) throw new Error('Match disappeared immediately after being updated.')
      return toMatchDto(updated)
    }
  }
}
