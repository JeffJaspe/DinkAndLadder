import type { SupabaseClient } from '@supabase/supabase-js'
import type { SponsorInput, SponsorRecord } from '../dto/sponsor.dto'

const SPONSOR_COLUMNS =
  'id, label, image_path, link_url, display_order, enabled, created_at, updated_at'

export interface SponsorRepository {
  /** Enabled sponsors in display order — what the landing page renders. */
  listEnabled(): Promise<SponsorRecord[]>
  /** Everything, enabled or not. The SuperAdmin console. */
  listAll(): Promise<SponsorRecord[]>
  findById(id: string): Promise<SponsorRecord | null>
  create(input: SponsorInput): Promise<SponsorRecord>
  update(
    id: string,
    patch: Partial<SponsorInput> & { image_path?: string | null }
  ): Promise<SponsorRecord>
  remove(id: string): Promise<void>
}

export function createSponsorRepository(client: SupabaseClient): SponsorRepository {
  async function list(enabledOnly: boolean): Promise<SponsorRecord[]> {
    let query = client.from('platform_sponsors').select(SPONSOR_COLUMNS)
    if (enabledOnly) query = query.eq('enabled', true)

    // display_order then created_at: two sponsors added at the same order
    // should keep a stable sequence rather than shuffling between renders.
    const { data, error } = await query
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) throw error
    return (data ?? []) as unknown as SponsorRecord[]
  }

  return {
    listEnabled: () => list(true),
    listAll: () => list(false),

    async findById(id) {
      const { data, error } = await client
        .from('platform_sponsors')
        .select(SPONSOR_COLUMNS)
        .eq('id', id)
        .maybeSingle()

      if (error) throw error
      return (data as unknown as SponsorRecord) ?? null
    },

    async create(input) {
      const { data, error } = await client
        .from('platform_sponsors')
        .insert({
          label: input.label,
          link_url: input.link_url ?? null,
          display_order: input.display_order ?? 0,
          enabled: input.enabled ?? true
        })
        .select(SPONSOR_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as SponsorRecord
    },

    async update(id, patch) {
      const { data, error } = await client
        .from('platform_sponsors')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select(SPONSOR_COLUMNS)
        .single()

      if (error) throw error
      return data as unknown as SponsorRecord
    },

    async remove(id) {
      const { error } = await client.from('platform_sponsors').delete().eq('id', id)
      if (error) throw error
    }
  }
}
