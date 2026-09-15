import type { SupabaseClient } from '@supabase/supabase-js'
import {
  REPORT_STATUSES,
  type CreatePlayerReportInput,
  type PlayerReportRecord,
  type ReportStatusCounts
} from '../dto/report.dto'

export interface ReportRepository {
  create(input: CreatePlayerReportInput): Promise<PlayerReportRecord>
  findById(id: string): Promise<PlayerReportRecord | null>
  /** The open report this reporter already has against this player, if any. */
  findOpenByPair(
    reporterPlayerId: string,
    reportedPlayerId: string
  ): Promise<PlayerReportRecord | null>
  /** The moderation queue. `status` omitted means every report. */
  list(options: {
    status?: string
    limit: number
    offset: number
  }): Promise<{ items: PlayerReportRecord[]; total: number }>
  /** Reports per status, for the queue's tab counts. */
  countByStatus(): Promise<ReportStatusCounts>
  /** Every report ever filed against each of these players, keyed by player id. */
  countByReportedPlayer(playerIds: string[]): Promise<Record<string, number>>
  resolve(
    id: string,
    updates: {
      status: string
      reviewed_by_user_id: string
      resolution_note: string | null
    }
  ): Promise<PlayerReportRecord | null>
}

export function createReportRepository(client: SupabaseClient): ReportRepository {
  return {
    async create(input) {
      const { data, error } = await client
        .from('player_reports')
        .insert({
          reporter_player_id: input.reporter_player_id,
          reported_player_id: input.reported_player_id,
          reason: input.reason,
          details: input.details ?? null,
          status: 'pending'
        })
        .select()
        .single()

      if (error) {
        throw new Error(`Failed to create report: ${error.message}`)
      }
      return data as PlayerReportRecord
    },

    async findById(id) {
      const { data, error } = await client
        .from('player_reports')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (error) {
        throw new Error(`Failed to load report: ${error.message}`)
      }
      return (data as PlayerReportRecord) ?? null
    },

    async findOpenByPair(reporterPlayerId, reportedPlayerId) {
      const { data, error } = await client
        .from('player_reports')
        .select('*')
        .eq('reporter_player_id', reporterPlayerId)
        .eq('reported_player_id', reportedPlayerId)
        .eq('status', 'pending')
        .maybeSingle()

      if (error) {
        throw new Error(`Failed to check for an existing report: ${error.message}`)
      }
      return (data as PlayerReportRecord) ?? null
    },

    async list({ status, limit, offset }) {
      let query = client.from('player_reports').select('*', { count: 'exact' })

      if (status) {
        query = query.eq('status', status)
      }

      // Oldest first within the queue: a moderation backlog is worked from the
      // front, and the newest-first ordering used everywhere else would leave
      // the oldest complaint permanently at the bottom.
      const { data, error, count } = await query
        .order('created_at', { ascending: true })
        .range(offset, offset + limit - 1)

      if (error) {
        throw new Error(`Failed to list reports: ${error.message}`)
      }
      return { items: (data ?? []) as PlayerReportRecord[], total: count ?? 0 }
    },

    async countByStatus() {
      // Four head-only counts rather than one select of every status column:
      // the queue is small, and this stays O(1) rows over the wire as it grows.
      const entries = await Promise.all(
        REPORT_STATUSES.map(async (status) => {
          const { count, error } = await client
            .from('player_reports')
            .select('id', { count: 'exact', head: true })
            .eq('status', status)
          if (error) {
            throw new Error(`Failed to count ${status} reports: ${error.message}`)
          }
          return [status, count ?? 0] as const
        })
      )
      return Object.fromEntries(entries) as ReportStatusCounts
    },

    async countByReportedPlayer(playerIds) {
      if (playerIds.length === 0) return {}
      const { data, error } = await client
        .from('player_reports')
        .select('reported_player_id')
        .in('reported_player_id', playerIds)

      if (error) {
        throw new Error(`Failed to count reports by player: ${error.message}`)
      }
      const counts: Record<string, number> = {}
      for (const row of (data ?? []) as { reported_player_id: string }[]) {
        counts[row.reported_player_id] = (counts[row.reported_player_id] ?? 0) + 1
      }
      return counts
    },

    async resolve(id, updates) {
      const { data, error } = await client
        .from('player_reports')
        .update({
          status: updates.status,
          reviewed_by_user_id: updates.reviewed_by_user_id,
          reviewed_at: new Date().toISOString(),
          resolution_note: updates.resolution_note,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        throw new Error(`Failed to resolve report: ${error.message}`)
      }
      return data as PlayerReportRecord
    }
  }
}
