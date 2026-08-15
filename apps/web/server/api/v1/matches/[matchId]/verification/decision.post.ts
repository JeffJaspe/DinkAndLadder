import {
  serverSupabaseClient,
  serverSupabaseServiceRole,
  serverSupabaseUser
} from '#supabase/server'
import { createMatchRepository } from '~/server/domains/match/repositories/match.repository'
import {
  createMatchService,
  MatchServiceError
} from '~/server/domains/match/services/match.service'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { apiError } from '~/server/utils/api-error'
import type { RecordVerificationDecisionInput } from '~/server/domains/match/dto/match.dto'

function parseDecisionInput(body: unknown): RecordVerificationDecisionInput {
  if (typeof body !== 'object' || body === null) {
    throw apiError(400, 'VALIDATION_ERROR', 'Request body must be an object.')
  }
  const record = body as Record<string, unknown>

  if (
    record.status !== 'confirmed' &&
    record.status !== 'rejected' &&
    record.status !== 'disputed'
  ) {
    throw apiError(
      400,
      'VALIDATION_ERROR',
      "status must be 'confirmed', 'rejected', or 'disputed'."
    )
  }
  if (
    record.response_note !== undefined &&
    record.response_note !== null &&
    typeof record.response_note !== 'string'
  ) {
    throw apiError(400, 'VALIDATION_ERROR', 'response_note must be a string or null.')
  }

  return {
    status: record.status,
    response_note: (record.response_note as string | null | undefined) ?? null
  }
}

/**
 * Records one verifier's decision. Same service-role rationale as the rest of the match
 * domain's writes — MatchService checks the caller is a designated, not-yet-responded verifier
 * before the bypass is used, and rejects self-verification (the submitter never gets a pending
 * row in the first place — see initiateVerification).
 */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to record a verification decision.')
  }

  const matchId = getRouterParam(event, 'matchId')
  if (!matchId) {
    throw apiError(400, 'VALIDATION_ERROR', 'matchId is required.')
  }

  const userClient = await serverSupabaseClient(event)
  const playerProfile = await createPlayerProfileRepository(userClient).findByUserId(claims.sub)
  if (!playerProfile) {
    throw apiError(
      409,
      'PLAYER_PROFILE_REQUIRED',
      'Complete your player profile before verifying a match.'
    )
  }

  const input = parseDecisionInput(await readBody(event))
  const serviceClient = serverSupabaseServiceRole(event)
  const service = createMatchService(createMatchRepository(serviceClient))

  try {
    const match = await service.recordVerificationDecision(playerProfile.id, matchId, input)
    return {
      data: match,
      message: 'Verification decision recorded',
      request_id: crypto.randomUUID()
    }
  } catch (err) {
    if (err instanceof MatchServiceError) throw apiError(err.status, err.code, err.message)
    console.error(
      `[POST /api/v1/matches/${matchId}/verification/decision] recordVerificationDecision failed:`,
      err
    )
    throw apiError(500, 'INTERNAL_ERROR', 'Could not record your verification decision.')
  }
})
