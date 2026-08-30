import { beforeEach, describe, expect, it } from 'vitest'
import { createMatchService } from '../../server/domains/match/services/match.service'
import type { MatchRepository } from '../../server/domains/match/repositories/match.repository'
import type { MatchRecord, SubmitMatchInput } from '../../server/domains/match/dto/match.dto'

let matchCounter = 0
let verificationCounter = 0
let proposalCounter = 0

function createFakeMatchRepository(): MatchRepository {
  const rows = new Map<string, MatchRecord>()

  return {
    // Read-only lookup used by the bracket to line scores up with a draw;
    // nothing in the match workflow calls it.
    async findScoreRowsByMatchIds(matchIds: string[]) {
      return matchIds
        .map((id) => rows.get(id))
        .filter((row): row is MatchRecord => Boolean(row))
        .map((row) => ({
          match_id: row.id,
          participants: row.match_participants.map((p) => ({
            player_id: p.player_id,
            team_number: p.team_number
          })),
          scores: row.match_scores.map((s) => ({
            set_number: s.set_number,
            team1_score: s.team1_score,
            team2_score: s.team2_score
          }))
        }))
    },
    async findById(matchId) {
      const row = rows.get(matchId)
      // The verification records are copied, not just the array holding them:
      // a real read returns a point-in-time snapshot, and sharing the element
      // objects would let a later write appear to mutate an earlier read —
      // exactly the staleness the concurrency tests below need to reproduce.
      return row
        ? {
            ...row,
            match_verifications: row.match_verifications.map((v) => ({ ...v })),
            match_score_proposals: row.match_score_proposals.map((p) => ({ ...p }))
          }
        : null
    },
    async create(input: SubmitMatchInput, submittedByPlayerId: string) {
      const now = new Date().toISOString()
      const id = `match-${++matchCounter}`
      const record: MatchRecord = {
        id,
        match_type: input.match_type,
        status: 'submitted',
        submitted_by_player_id: submittedByPlayerId,
        event_id: input.event_id,
        affects_rating: true,
        venue: input.venue ?? null,
        played_at: input.played_at,
        submitted_at: now,
        verified_at: null,
        created_at: now,
        match_participants: input.participants.map((p, i) => ({
          id: `participant-${id}-${i}`,
          match_id: id,
          player_id: p.player_id,
          team_number: p.team_number,
          result_status: 'pending'
        })),
        match_scores: input.scores.map((s, i) => ({
          id: `score-${id}-${i}`,
          match_id: id,
          set_number: s.set_number,
          team1_score: s.team1_score,
          team2_score: s.team2_score
        })),
        match_verifications: [],
        match_score_proposals: []
      }
      rows.set(id, record)
      return record
    },
    async createPendingVerifications(matchId, verifierPlayerIds) {
      const row = rows.get(matchId)
      if (!row) throw new Error('not found')
      const created = verifierPlayerIds.map((verifierPlayerId) => ({
        id: `verification-${++verificationCounter}`,
        match_id: matchId,
        verifier_player_id: verifierPlayerId,
        status: 'pending' as const,
        response_note: null,
        responded_at: null,
        created_at: new Date().toISOString()
      }))
      row.match_verifications = [...row.match_verifications, ...created]
      return created
    },
    async updateVerificationDecision(matchId, verifierPlayerId, status, responseNote) {
      const row = rows.get(matchId)
      if (!row) throw new Error('not found')
      const target = row.match_verifications.find((v) => v.verifier_player_id === verifierPlayerId)
      if (!target) throw new Error('not found')
      // Mirrors the repository's `.eq('status', 'pending')` guard: a verifier
      // who already decided matches no row and gets nothing back.
      if (target.status !== 'pending') return null
      target.status = status
      target.response_note = responseNote
      target.responded_at = new Date().toISOString()
      return { ...target }
    },
    async updateMatchStatus(matchId, status, verifiedAt) {
      const row = rows.get(matchId)
      if (!row) throw new Error('not found')
      row.status = status
      row.verified_at = verifiedAt
    },
    async transitionMatchStatus(matchId, fromStatus, toStatus, verifiedAt) {
      const row = rows.get(matchId)
      if (!row) throw new Error('not found')
      // Compare-and-set, as in the repository: the update matches no row unless
      // the match is still at `fromStatus`, so exactly one racing caller wins.
      if (row.status !== fromStatus) return false
      row.status = toStatus
      row.verified_at = verifiedAt
      return true
    },
    async createScoreProposal(matchId, proposedByPlayerId, scores, proposalRound) {
      const row = rows.get(matchId)
      if (!row) throw new Error('not found')
      const proposal = {
        id: `proposal-${++proposalCounter}`,
        match_id: matchId,
        proposed_by_player_id: proposedByPlayerId,
        scores,
        status: 'pending' as const,
        proposal_round: proposalRound,
        created_at: new Date().toISOString()
      }
      row.match_score_proposals = [...row.match_score_proposals, proposal]
      return proposal
    }
  }
}

const baseSinglesInput: SubmitMatchInput = {
  event_id: 'event-1',
  match_type: 'singles',
  played_at: new Date().toISOString(),
  participants: [
    { player_id: 'player-me', team_number: 1 },
    { player_id: 'player-opponent', team_number: 2 }
  ],
  scores: [{ set_number: 1, team1_score: 11, team2_score: 9 }]
}

describe('MatchService', () => {
  let repository: MatchRepository

  beforeEach(() => {
    repository = createFakeMatchRepository()
  })

  it('submits a valid singles match', async () => {
    const service = createMatchService(repository)

    const match = await service.submitMatch('player-me', baseSinglesInput)

    expect(match.match_type).toBe('singles')
    expect(match.status).toBe('submitted')
    expect(match.participants).toHaveLength(2)
    expect(match.scores).toHaveLength(1)
  })

  it('submits a valid doubles match', async () => {
    const service = createMatchService(repository)
    const input: SubmitMatchInput = {
      event_id: 'club-1',
      match_type: 'doubles',
      played_at: new Date().toISOString(),
      participants: [
        { player_id: 'player-me', team_number: 1 },
        { player_id: 'player-partner', team_number: 1 },
        { player_id: 'player-opp1', team_number: 2 },
        { player_id: 'player-opp2', team_number: 2 }
      ],
      scores: [{ set_number: 1, team1_score: 11, team2_score: 7 }]
    }

    const match = await service.submitMatch('player-me', input)

    expect(match.match_type).toBe('doubles')
    expect(match.participants).toHaveLength(4)
  })

  it('rejects singles with the wrong participant count', async () => {
    const service = createMatchService(repository)
    const input: SubmitMatchInput = {
      ...baseSinglesInput,
      participants: [{ player_id: 'player-me', team_number: 1 }]
    }

    await expect(service.submitMatch('player-me', input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR'
    })
  })

  it('rejects doubles with only 2 participants', async () => {
    const service = createMatchService(repository)
    const input: SubmitMatchInput = {
      event_id: 'club-1',
      match_type: 'doubles',
      played_at: new Date().toISOString(),
      participants: baseSinglesInput.participants,
      scores: baseSinglesInput.scores
    }

    await expect(service.submitMatch('player-me', input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR'
    })
  })

  it('rejects a lopsided team split (3-1 in doubles)', async () => {
    const service = createMatchService(repository)
    const input: SubmitMatchInput = {
      event_id: 'club-1',
      match_type: 'doubles',
      played_at: new Date().toISOString(),
      participants: [
        { player_id: 'player-me', team_number: 1 },
        { player_id: 'player-partner', team_number: 1 },
        { player_id: 'player-opp1', team_number: 1 },
        { player_id: 'player-opp2', team_number: 2 }
      ],
      scores: baseSinglesInput.scores
    }

    await expect(service.submitMatch('player-me', input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR'
    })
  })

  it('rejects a duplicate player appearing twice', async () => {
    const service = createMatchService(repository)
    const input: SubmitMatchInput = {
      ...baseSinglesInput,
      participants: [
        { player_id: 'player-me', team_number: 1 },
        { player_id: 'player-me', team_number: 2 }
      ]
    }

    await expect(service.submitMatch('player-me', input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR'
    })
  })

  it('rejects submission by someone who is not listed as a participant', async () => {
    const service = createMatchService(repository)

    await expect(service.submitMatch('player-stranger', baseSinglesInput)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR'
    })
  })

  it('rejects a submission with no scores', async () => {
    const service = createMatchService(repository)
    const input: SubmitMatchInput = { ...baseSinglesInput, scores: [] }

    await expect(service.submitMatch('player-me', input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR'
    })
  })

  it('rejects duplicate set numbers', async () => {
    const service = createMatchService(repository)
    const input: SubmitMatchInput = {
      ...baseSinglesInput,
      scores: [
        { set_number: 1, team1_score: 11, team2_score: 9 },
        { set_number: 1, team1_score: 11, team2_score: 3 }
      ]
    }

    await expect(service.submitMatch('player-me', input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR'
    })
  })

  it('returns null from getById for an unknown match', async () => {
    const service = createMatchService(repository)

    expect(await service.getById('does-not-exist')).toBeNull()
  })

  it('getById returns the mapped DTO for a match that exists', async () => {
    const service = createMatchService(repository)
    const created = await service.submitMatch('player-me', baseSinglesInput)

    const found = await service.getById(created.id)

    expect(found?.id).toBe(created.id)
    expect(found?.participants).toHaveLength(2)
  })
})

describe('MatchService verification', () => {
  let repository: MatchRepository

  beforeEach(() => {
    repository = createFakeMatchRepository()
  })

  const doublesInput: SubmitMatchInput = {
    event_id: 'club-1',
    match_type: 'doubles',
    played_at: new Date().toISOString(),
    participants: [
      { player_id: 'player-me', team_number: 1 },
      { player_id: 'player-partner', team_number: 1 },
      { player_id: 'player-opp1', team_number: 2 },
      { player_id: 'player-opp2', team_number: 2 }
    ],
    scores: [{ set_number: 1, team1_score: 11, team2_score: 7 }]
  }

  it('initiating verification creates a pending row for every participant but the submitter', async () => {
    const service = createMatchService(repository)
    const match = await service.submitMatch('player-me', doublesInput)

    const updated = await service.initiateVerification('player-me', match.id)

    expect(updated.status).toBe('pending_verification')
    expect(updated.verifications).toHaveLength(3)
    expect(updated.verifications.map((v) => v.verifier_player_id).sort()).toEqual(
      ['player-opp1', 'player-opp2', 'player-partner'].sort()
    )
    expect(updated.verifications.every((v) => v.status === 'pending')).toBe(true)
  })

  it('rejects initiating verification twice', async () => {
    const service = createMatchService(repository)
    const match = await service.submitMatch('player-me', baseSinglesInput)
    await service.initiateVerification('player-me', match.id)

    await expect(service.initiateVerification('player-opponent', match.id)).rejects.toMatchObject({
      code: 'INVALID_MATCH_STATE'
    })
  })

  it('rejects a non-participant starting verification', async () => {
    const service = createMatchService(repository)
    const match = await service.submitMatch('player-me', baseSinglesInput)

    await expect(service.initiateVerification('player-stranger', match.id)).rejects.toMatchObject({
      code: 'FORBIDDEN'
    })
  })

  it('rejects a decision before verification has started', async () => {
    const service = createMatchService(repository)
    const match = await service.submitMatch('player-me', baseSinglesInput)

    await expect(
      service.recordVerificationDecision('player-opponent', match.id, { status: 'confirmed' })
    ).rejects.toMatchObject({ code: 'VERIFICATION_REQUIRED' })
  })

  it('rejects a decision from the submitter (not a designated verifier)', async () => {
    const service = createMatchService(repository)
    const match = await service.submitMatch('player-me', baseSinglesInput)
    await service.initiateVerification('player-me', match.id)

    await expect(
      service.recordVerificationDecision('player-me', match.id, { status: 'confirmed' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('rejects a decision from someone who is not a participant', async () => {
    const service = createMatchService(repository)
    const match = await service.submitMatch('player-me', baseSinglesInput)
    await service.initiateVerification('player-me', match.id)

    await expect(
      service.recordVerificationDecision('player-stranger', match.id, { status: 'confirmed' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('a singles match becomes verified once the sole opponent confirms', async () => {
    const service = createMatchService(repository)
    const match = await service.submitMatch('player-me', baseSinglesInput)
    await service.initiateVerification('player-me', match.id)

    const { match: updated } = await service.recordVerificationDecision(
      'player-opponent',
      match.id,
      {
        status: 'confirmed'
      }
    )

    expect(updated.status).toBe('verified')
    expect(updated.verified_at).not.toBeNull()
  })

  it('a doubles match stays pending_verification until every other participant confirms', async () => {
    const service = createMatchService(repository)
    const match = await service.submitMatch('player-me', doublesInput)
    await service.initiateVerification('player-me', match.id)

    const { match: afterOne } = await service.recordVerificationDecision(
      'player-partner',
      match.id,
      {
        status: 'confirmed'
      }
    )
    expect(afterOne.status).toBe('pending_verification')

    const { match: afterTwo } = await service.recordVerificationDecision('player-opp1', match.id, {
      status: 'confirmed'
    })
    expect(afterTwo.status).toBe('pending_verification')

    const { match: afterThree } = await service.recordVerificationDecision(
      'player-opp2',
      match.id,
      {
        status: 'confirmed'
      }
    )
    expect(afterThree.status).toBe('verified')
  })

  it('any single rejection rejects the whole match, even with other confirmations', async () => {
    const service = createMatchService(repository)
    const match = await service.submitMatch('player-me', doublesInput)
    await service.initiateVerification('player-me', match.id)

    await service.recordVerificationDecision('player-partner', match.id, { status: 'confirmed' })
    const { match: afterReject } = await service.recordVerificationDecision(
      'player-opp1',
      match.id,
      {
        status: 'rejected',
        response_note: 'Score was wrong'
      }
    )

    expect(afterReject.status).toBe('rejected')
  })

  it('a dispute immediately finalizes the match, even with other confirmations still pending', async () => {
    const service = createMatchService(repository)
    const match = await service.submitMatch('player-me', doublesInput)
    await service.initiateVerification('player-me', match.id)

    await service.recordVerificationDecision('player-partner', match.id, { status: 'confirmed' })
    const { match: afterDispute } = await service.recordVerificationDecision(
      'player-opp1',
      match.id,
      {
        status: 'disputed'
      }
    )

    expect(afterDispute.status).toBe('disputed')
  })

  it('rejects a second decision from the same verifier while the match is still pending', async () => {
    const service = createMatchService(repository)
    const match = await service.submitMatch('player-me', doublesInput)
    await service.initiateVerification('player-me', match.id)
    await service.recordVerificationDecision('player-partner', match.id, { status: 'confirmed' })

    await expect(
      service.recordVerificationDecision('player-partner', match.id, { status: 'confirmed' })
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  // F-25. Every verifier reads the match before writing its own decision, so
  // two who act at the same time both hold a snapshot taken before either
  // wrote. The roll-up has to survive that.
  describe('concurrent verification decisions', () => {
    it('still verifies the match when the last two verifiers confirm simultaneously', async () => {
      const service = createMatchService(repository)
      const match = await service.submitMatch('player-me', doublesInput)
      await service.initiateVerification('player-me', match.id)
      await service.recordVerificationDecision('player-partner', match.id, { status: 'confirmed' })

      const [first, second] = await Promise.all([
        service.recordVerificationDecision('player-opp1', match.id, { status: 'confirmed' }),
        service.recordVerificationDecision('player-opp2', match.id, { status: 'confirmed' })
      ])

      // Computing the roll-up from each caller's own stale snapshot left both
      // at pending_verification, and the match was never rated.
      const final = await service.getById(match.id)
      expect(final?.status).toBe('verified')
      expect(final?.verified_at).not.toBeNull()

      // Exactly one of them owns the transition, so the rating runs once.
      expect([first.status_changed, second.status_changed].filter(Boolean)).toHaveLength(1)
    })

    it('reports the transition to exactly one caller when a confirm and a dispute race', async () => {
      const service = createMatchService(repository)
      const match = await service.submitMatch('player-me', doublesInput)
      await service.initiateVerification('player-me', match.id)

      const results = await Promise.all([
        service.recordVerificationDecision('player-opp1', match.id, { status: 'disputed' }),
        service.recordVerificationDecision('player-opp2', match.id, { status: 'confirmed' })
      ])

      // A dispute is terminal regardless of which decision landed first.
      const final = await service.getById(match.id)
      expect(final?.status).toBe('disputed')
      expect(results.filter((r) => r.status_changed)).toHaveLength(1)
    })

    it('lets only one of two simultaneous decisions from the same verifier through', async () => {
      const service = createMatchService(repository)
      const match = await service.submitMatch('player-me', doublesInput)
      await service.initiateVerification('player-me', match.id)

      const outcomes = await Promise.allSettled([
        service.recordVerificationDecision('player-partner', match.id, { status: 'confirmed' }),
        service.recordVerificationDecision('player-partner', match.id, { status: 'confirmed' })
      ])

      expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1)
      const rejected = outcomes.find((o) => o.status === 'rejected')
      expect(rejected).toBeDefined()
      expect((rejected as PromiseRejectedResult).reason).toMatchObject({ code: 'CONFLICT' })
    })
  })

  it('rejects a decision once the match has already reached a terminal state', async () => {
    const service = createMatchService(repository)
    const match = await service.submitMatch('player-me', baseSinglesInput)
    await service.initiateVerification('player-me', match.id)
    await service.recordVerificationDecision('player-opponent', match.id, { status: 'confirmed' })

    await expect(
      service.recordVerificationDecision('player-opponent', match.id, { status: 'disputed' })
    ).rejects.toMatchObject({ code: 'INVALID_MATCH_STATE' })
  })

  it('rejects a decision on a non-existent match', async () => {
    const service = createMatchService(repository)

    await expect(
      service.recordVerificationDecision('player-me', 'non-existent-match-id', {
        status: 'confirmed'
      })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rejects initiating verification on a non-existent match', async () => {
    const service = createMatchService(repository)

    await expect(
      service.initiateVerification('player-me', 'non-existent-match-id')
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('stores the response_note when provided with a decision', async () => {
    const service = createMatchService(repository)
    const match = await service.submitMatch('player-me', baseSinglesInput)
    await service.initiateVerification('player-me', match.id)

    const { match: updated } = await service.recordVerificationDecision(
      'player-opponent',
      match.id,
      {
        status: 'rejected',
        response_note: 'The score was 11-7, not 11-9'
      }
    )

    const verification = updated.verifications.find(
      (v) => v.verifier_player_id === 'player-opponent'
    )
    expect(verification?.response_note).toBe('The score was 11-7, not 11-9')
  })

  describe('proposeCounterScore', () => {
    const counterScores = [{ set_number: 1, team1_score: 11, team2_score: 7 }]

    it('records a proposal and moves the match to disputed', async () => {
      const service = createMatchService(repository)
      const match = await service.submitMatch('player-me', baseSinglesInput)

      const updated = await service.proposeCounterScore('player-opponent', match.id, counterScores)

      expect(updated.status).toBe('disputed')
      expect(updated.score_proposals).toHaveLength(1)
      expect(updated.score_proposals[0]).toMatchObject({
        proposed_by_player_id: 'player-opponent',
        proposal_round: 1,
        scores: counterScores
      })
    })

    it('rejects a counter-proposal from a non-participant', async () => {
      const service = createMatchService(repository)
      const match = await service.submitMatch('player-me', baseSinglesInput)

      await expect(
        service.proposeCounterScore('player-stranger', match.id, counterScores)
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })

    it('rejects a counter-proposal on a doubles match', async () => {
      const service = createMatchService(repository)
      const match = await service.submitMatch('player-me', doublesInput)

      await expect(
        service.proposeCounterScore('player-opp1', match.id, counterScores)
      ).rejects.toMatchObject({ code: 'NOT_SUPPORTED' })
    })

    it('rejects a counter-proposal once the match has reached a terminal state', async () => {
      const service = createMatchService(repository)
      const match = await service.submitMatch('player-me', baseSinglesInput)
      await service.initiateVerification('player-me', match.id)
      await service.recordVerificationDecision('player-opponent', match.id, {
        status: 'confirmed'
      })

      await expect(
        service.proposeCounterScore('player-opponent', match.id, counterScores)
      ).rejects.toMatchObject({ code: 'INVALID_MATCH_STATE' })
    })

    it('rejects a counter-proposal on a non-existent match', async () => {
      const service = createMatchService(repository)

      await expect(
        service.proposeCounterScore('player-me', 'non-existent-match-id', counterScores)
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })

    it('rejects an empty scores array', async () => {
      const service = createMatchService(repository)
      const match = await service.submitMatch('player-me', baseSinglesInput)

      await expect(
        service.proposeCounterScore('player-opponent', match.id, [])
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    })
  })
})
