import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AnnouncementRecord,
  AnnouncementReadRecord,
  AnnouncementStatus,
  CreateAnnouncementInput,
  UpdateAnnouncementInput
} from '../dto/announcement.dto'

const ANNOUNCEMENT_COLUMNS =
  'id, club_id, author_player_id, title, body, announcement_type, visibility, status, ' +
  'event_id, pinned, published_at, archived_at, created_at, updated_at'

export interface AnnouncementRepository {
  findById(announcementId: string): Promise<AnnouncementRecord | null>
  findByClub(clubId: string, includeArchived: boolean): Promise<AnnouncementRecord[]>
  create(input: CreateAnnouncementInput, authorPlayerId: string): Promise<AnnouncementRecord>
  update(announcementId: string, input: UpdateAnnouncementInput): Promise<AnnouncementRecord>
  updateStatus(announcementId: string, status: AnnouncementStatus): Promise<AnnouncementRecord>
  setPinned(announcementId: string, pinned: boolean): Promise<AnnouncementRecord>
  markAsRead(announcementId: string, playerId: string): Promise<AnnouncementReadRecord>
  isRead(announcementId: string, playerId: string): Promise<boolean>
  countUnreadForPlayer(playerId: string, clubIds: string[]): Promise<number>
}

export function createAnnouncementRepository(client: SupabaseClient): AnnouncementRepository {
  return {
    async findById(announcementId) {
      const { data, error } = await client
        .from('club_announcements')
        .select(ANNOUNCEMENT_COLUMNS)
        .eq('id', announcementId)
        .maybeSingle()

      if (error) throw error
      return data as unknown as AnnouncementRecord | null
    },

    async findByClub(clubId, includeArchived) {
      let query = client
        .from('club_announcements')
        .select(ANNOUNCEMENT_COLUMNS)
        .eq('club_id', clubId)

      if (!includeArchived) {
        query = query.neq('status', 'archived')
      }

      const { data, error } = await query
        .order('pinned', { ascending: false })
        .order('published_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data ?? []) as unknown as AnnouncementRecord[]
    },

    async create(input, authorPlayerId) {
      const { data, error } = await client
        .from('club_announcements')
        .insert({
          club_id: input.club_id,
          author_player_id: authorPlayerId,
          title: input.title,
          body: input.body,
          announcement_type: input.announcement_type ?? 'general',
          visibility: input.visibility ?? 'all_members',
          event_id: input.event_id ?? null,
          status: 'draft'
        })
        .select(ANNOUNCEMENT_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as AnnouncementRecord
    },

    async update(announcementId, input) {
      const { data, error } = await client
        .from('club_announcements')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', announcementId)
        .select(ANNOUNCEMENT_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as AnnouncementRecord
    },

    async updateStatus(announcementId, status) {
      const updates: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString()
      }

      if (status === 'published') {
        updates.published_at = new Date().toISOString()
      } else if (status === 'archived') {
        updates.archived_at = new Date().toISOString()
      }

      const { data, error } = await client
        .from('club_announcements')
        .update(updates)
        .eq('id', announcementId)
        .select(ANNOUNCEMENT_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as AnnouncementRecord
    },

    async setPinned(announcementId, pinned) {
      const { data, error } = await client
        .from('club_announcements')
        .update({ pinned, updated_at: new Date().toISOString() })
        .eq('id', announcementId)
        .select(ANNOUNCEMENT_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as AnnouncementRecord
    },

    async markAsRead(announcementId, playerId) {
      const { data, error } = await client
        .from('club_announcement_reads')
        .upsert(
          { announcement_id: announcementId, player_id: playerId },
          { onConflict: 'announcement_id,player_id' }
        )
        .select('id, announcement_id, player_id, read_at')
        .single()

      if (error) throw error
      return data as unknown as AnnouncementReadRecord
    },

    async isRead(announcementId, playerId) {
      const { count, error } = await client
        .from('club_announcement_reads')
        .select('*', { count: 'exact', head: true })
        .eq('announcement_id', announcementId)
        .eq('player_id', playerId)

      if (error) throw error
      return (count ?? 0) > 0
    },

    async countUnreadForPlayer(playerId, clubIds) {
      if (clubIds.length === 0) return 0

      const { data: readIds, error: readError } = await client
        .from('club_announcement_reads')
        .select('announcement_id')
        .eq('player_id', playerId)

      if (readError) throw readError

      const readSet = new Set((readIds ?? []).map((r) => r.announcement_id))

      const { data: announcements, error: annError } = await client
        .from('club_announcements')
        .select('id')
        .in('club_id', clubIds)
        .eq('status', 'published')

      if (annError) throw annError

      return (announcements ?? []).filter((a) => !readSet.has(a.id)).length
    }
  }
}
