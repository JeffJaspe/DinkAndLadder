import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClubRecord, ClubSearchQuery, CreateClubInput } from '../dto/club.dto'

const CLUB_COLUMNS =
  'id, name, slug, description, province, city, visibility, status, created_by_user_id, created_at'

export interface UpdateClubInput {
  name?: string
  description?: string | null
  province?: string | null
  city?: string | null
  visibility?: 'public' | 'private'
}

export interface ClubRepository {
  findById(clubId: string): Promise<ClubRecord | null>
  findBySlug(slug: string): Promise<ClubRecord | null>
  create(input: CreateClubInput, createdByUserId: string): Promise<ClubRecord>
  update(clubId: string, patch: UpdateClubInput): Promise<ClubRecord>
  search(query: ClubSearchQuery): Promise<ClubRecord[]>
}

export function createClubRepository(client: SupabaseClient): ClubRepository {
  return {
    async findById(clubId) {
      const { data, error } = await client
        .from('clubs')
        .select(CLUB_COLUMNS)
        .eq('id', clubId)
        .maybeSingle()

      if (error) throw error
      return data as unknown as ClubRecord | null
    },

    async findBySlug(slug) {
      const { data, error } = await client
        .from('clubs')
        .select(CLUB_COLUMNS)
        .eq('slug', slug)
        .maybeSingle()

      if (error) throw error
      return data as unknown as ClubRecord | null
    },

    async create(input, createdByUserId) {
      const { data, error } = await client
        .from('clubs')
        .insert({ ...input, created_by_user_id: createdByUserId })
        .select(CLUB_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as ClubRecord
    },

    async update(clubId, patch) {
      const { data, error } = await client
        .from('clubs')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', clubId)
        .select(CLUB_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as ClubRecord
    },

    async search(query) {
      let builder = client
        .from('clubs')
        .select(CLUB_COLUMNS)
        .eq('visibility', 'public')
        .eq('status', 'active')

      if (query.q) {
        builder = builder.ilike('name', `%${query.q}%`)
      }
      if (query.province) {
        builder = builder.eq('province', query.province)
      }
      if (query.city) {
        builder = builder.eq('city', query.city)
      }

      builder = builder
        .order('name', { ascending: true })
        .range(query.offset, query.offset + query.limit - 1)

      const { data, error } = await builder

      if (error) throw error
      return (data ?? []) as unknown as ClubRecord[]
    }
  }
}
