import type { SupabaseClient } from '@supabase/supabase-js'
import type { RegionRecord, ProvinceRecord } from '../dto/region.dto'

const REGION_COLUMNS = 'id, code, name, sort_order, created_at'
const PROVINCE_COLUMNS = 'id, region_id, name, sort_order, created_at'

export interface RegionRepository {
  listRegions(): Promise<RegionRecord[]>
  findRegionByCode(code: string): Promise<RegionRecord | null>
  listProvincesByRegion(regionId: string): Promise<ProvinceRecord[]>
  findProvinceByName(name: string): Promise<ProvinceRecord | null>
}

export function createRegionRepository(client: SupabaseClient): RegionRepository {
  return {
    async listRegions() {
      const { data, error } = await client
        .from('regions')
        .select(REGION_COLUMNS)
        .order('sort_order', { ascending: true })

      if (error) throw error
      return data as unknown as RegionRecord[]
    },

    async findRegionByCode(code) {
      const { data, error } = await client
        .from('regions')
        .select(REGION_COLUMNS)
        .eq('code', code.toUpperCase())
        .maybeSingle()

      if (error) throw error
      return data as unknown as RegionRecord | null
    },

    async listProvincesByRegion(regionId) {
      const { data, error } = await client
        .from('provinces')
        .select(PROVINCE_COLUMNS)
        .eq('region_id', regionId)
        .order('sort_order', { ascending: true })

      if (error) throw error
      return data as unknown as ProvinceRecord[]
    },

    async findProvinceByName(name) {
      const { data, error } = await client
        .from('provinces')
        .select(PROVINCE_COLUMNS)
        .ilike('name', name)
        .maybeSingle()

      if (error) throw error
      return data as unknown as ProvinceRecord | null
    }
  }
}
