import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  MatchRecord,
  MatchScoreProposalRecord,
  MatchStatus,
  MatchVerificationRecord,
  SubmitMatchInput,
  SubmitMatchScoreInput,
  VerificationStatus
} from '../dto/match.dto'

const MATCH_SELECT =
  'id, match_type, status, submitted_by_player_id, event_id, affects_rating, venue, played_at, submitted_at, verified_at, created_at, ' +
  'match_participants(id, match_id, player_id, team_number, result_status), ' +
  'match_scores(id, match_id, set_number, team1_score, team2_score), ' +
  'match_verifications(id, match_id, verifier_player_id, status, response_note, responded_at, created_at), ' +
  'match_score_proposals(id, match_id, proposed_by_player_id, scores, status, proposal_round, created_at)'

export interface MatchRepository {
  findById(matchId: string): Promise<MatchRecord | null>
  create(input: SubmitMatchInput, submittedByPlayerId: string): Promise<MatchRecord>
  createPendingVerifications(
    matchId: string,
    verifierPlayerIds: string[]
  ): Promise<MatchVerificationRecord[]>
  updateVerificationDecision(
    matchId: string,
    verifierPlayerId: string,
    status: Exclude<VerificationStatus, 'pending'>,
    responseNote: string | null
  ): Promise<MatchVerificationRecord>
  updateMatchStatus(matchId: string, status: MatchStatus, verifiedAt: string | null): Promise<void>
  createScoreProposal(
    matchId: string,
    proposedByPlayerId: string,
    scores: SubmitMatchScoreInput[],
    proposalRound: number
  ): Promise<MatchScoreProposalRecord>
}

export function createMatchRepository(client: SupabaseClient): MatchRepository {
  async function findById(matchId: string) {
    const { data, error } = await client
      .from('matches')
      .select(MATCH_SELECT)
      .eq('id', matchId)
      .maybeSingle()

    if (error) throw error
    return data as unknown as MatchRecord | null
  }

  return {
    findById,

    async create(input, submittedByPlayerId) {
      const { data: match, error: matchError } = await client
        .from('matches')
        .insert({
          match_type: input.match_type,
          event_id: input.event_id,
          venue: input.venue ?? null,
          played_at: input.played_at,
          submitted_by_player_id: submittedByPlayerId
        })
        .select('id')
        .single()

      if (matchError) throw matchError
      const matchId = (match as unknown as { id: string }).id

      const { error: participantsError } = await client.from('match_participants').insert(
        input.participants.map((p) => ({
          match_id: matchId,
          player_id: p.player_id,
          team_number: p.team_number
        }))
      )
      if (participantsError) throw participantsError

      const { error: scoresError } = await client.from('match_scores').insert(
        input.scores.map((s) => ({
          match_id: matchId,
          set_number: s.set_number,
          team1_score: s.team1_score,
          team2_score: s.team2_score
        }))
      )
      if (scoresError) throw scoresError

      const created = await findById(matchId)
      if (!created) throw new Error('Match was created but could not be re-read.')
      return created
    },

    async createPendingVerifications(matchId, verifierPlayerIds) {
      const { data, error } = await client
        .from('match_verifications')
        .insert(
          verifierPlayerIds.map((verifierPlayerId) => ({
            match_id: matchId,
            verifier_player_id: verifierPlayerId
          }))
        )
        .select('id, match_id, verifier_player_id, status, response_note, responded_at, created_at')

      if (error) throw error
      return data as unknown as MatchVerificationRecord[]
    },

    async updateVerificationDecision(matchId, verifierPlayerId, status, responseNote) {
      const { data, error } = await client
        .from('match_verifications')
        .update({ status, response_note: responseNote, responded_at: new Date().toISOString() })
        .eq('match_id', matchId)
        .eq('verifier_player_id', verifierPlayerId)
        .select('id, match_id, verifier_player_id, status, response_note, responded_at, created_at')
        .single()

      if (error) throw error
      return data as unknown as MatchVerificationRecord
    },

    async updateMatchStatus(matchId, status, verifiedAt) {
      const { error } = await client
        .from('matches')
        .update({ status, verified_at: verifiedAt })
        .eq('id', matchId)

      if (error) throw error
    },

    async createScoreProposal(matchId, proposedByPlayerId, scores, proposalRound) {
      const { data, error } = await client
        .from('match_score_proposals')
        .insert({
          match_id: matchId,
          proposed_by_player_id: proposedByPlayerId,
          scores,
          proposal_round: proposalRound
        })
        .select('id, match_id, proposed_by_player_id, scores, status, proposal_round, created_at')
        .single()

      if (error) throw error
      return data as unknown as MatchScoreProposalRecord
    }
  }
}
