import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CreateEventInput,
  EventRecord,
  EventSearchQuery,
  EventStatus,
  UpdateEventInput
} from '../dto/event.dto'

const EVENT_COLUMNS =
  'id, club_id, name, description, venue, province, city, start_date, end_date, ' +
  'registration_opens, registration_closes, status, visibility, created_by_player_id, created_at, updated_at'

export interface EventRepository {
  findById(eventId: string): Promise<EventRecord | null>
  create(input: CreateEventInput, createdByPlayerId: string): Promise<EventRecord>
  update(eventId: string, input: UpdateEventInput): Promise<EventRecord>
  updateStatus(eventId: string, status: EventStatus): Promise<EventRecord>
  search(query: EventSearchQuery): Promise<EventRecord[]>
}

export function createEventRepository(client: SupabaseClient): EventRepository {
  return {
    async findById(eventId) {
      const { data, error } = await client
        .from('events')
        .select(EVENT_COLUMNS)
        .eq('id', eventId)
        .maybeSingle()

      if (error) throw error
      return data as unknown as EventRecord | null
    },

    async create(input, createdByPlayerId) {
      const { data, error } = await client
        .from('events')
        .insert({
          club_id: input.club_id,
          name: input.name,
          description: input.description ?? null,
          venue: input.venue ?? null,
          province: input.province ?? null,
          city: input.city ?? null,
          start_date: input.start_date,
          end_date: input.end_date,
          registration_opens: input.registration_opens ?? null,
          registration_closes: input.registration_closes ?? null,
          visibility: input.visibility ?? 'public',
          status: 'draft',
          created_by_player_id: createdByPlayerId
        })
        .select(EVENT_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as EventRecord
    },

    async update(eventId, input) {
      const { data, error } = await client
        .from('events')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', eventId)
        .select(EVENT_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as EventRecord
    },

    async updateStatus(eventId, status) {
      const { data, error } = await client
        .from('events')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', eventId)
        .select(EVENT_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as EventRecord
    },

    async search(query) {
      let builder = client
        .from('events')
        .select(EVENT_COLUMNS)
        .neq('status', 'draft')

      builder = builder.eq('visibility', query.visibility ?? 'public')

      if (query.club_id) {
        builder = builder.eq('club_id', query.club_id)
      }
      if (query.province) {
        builder = builder.eq('province', query.province)
      }
      if (query.city) {
        builder = builder.eq('city', query.city)
      }
      if (query.status) {
        builder = builder.eq('status', query.status)
      }

      builder = builder
        .order('start_date', { ascending: true })
        .range(query.offset, query.offset + query.limit - 1)

      const { data, error } = await builder

      if (error) throw error
      return (data ?? []) as unknown as EventRecord[]
    }
  }
}
