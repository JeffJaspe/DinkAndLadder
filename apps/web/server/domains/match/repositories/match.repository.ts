import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  MatchRecord,
  MatchScoreLookupRow,
  MatchScoreProposalRecord,
  MatchStatus,
  MatchVerificationRecord,
  SubmitMatchInput,
  SubmitMatchScoreInput,
  TeamNumber,
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
  /**
   * Teams and set scores for many matches in one round trip.
   *
   * Exists for the bracket, which holds a `match_id` per slot and would
   * otherwise fetch each match on its own. Returns only the matches it finds;
   * an id with no row is simply absent, and an empty input list never queries.
   */
  findScoreRowsByMatchIds(matchIds: string[]): Promise<MatchScoreLookupRow[]>
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
    },

    async findScoreRowsByMatchIds(matchIds) {
      // `.in()` with an empty list is a query that can only return nothing.
      if (!matchIds.length) return []

      const { data, error } = await client
        .from('matches')
        .select(
          'id, match_participants(player_id, team_number), ' +
            'match_scores(set_number, team1_score, team2_score)'
        )
        .in('id', matchIds)

      if (error) throw error

      const rows = (data ?? []) as unknown as {
        id: string
        match_participants: { player_id: string; team_number: TeamNumber }[] | null
        match_scores: { set_number: number; team1_score: number; team2_score: number }[] | null
      }[]

      return rows.map((row) => ({
        match_id: row.id,
        participants: row.match_participants ?? [],
        // PostgREST does not order an embedded resource for us, and a score
        // list is meaningless out of set order.
        scores: [...(row.match_scores ?? [])].sort((a, b) => a.set_number - b.set_number)
      }))
    }
  }
}
