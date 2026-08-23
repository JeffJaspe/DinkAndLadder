import type { SupabaseClient } from '@supabase/supabase-js'
import type { ThemePaletteRecord } from '../dto/theme-palette.dto'

const PALETTE_COLUMNS = 'id, key, name, description, light, dark, display_order'

/**
 * The pre-migration cases. A missing table comes back as PostgREST's own
 * PGRST205 ("not found in the schema cache") rather than Postgres's 42P01, so
 * both count; a missing column does come through as Postgres's 42703. Both
 * verified against the live database before these migrations were applied.
 */
const MISSING_TABLE_CODES = ['42P01', 'PGRST205']
const UNDEFINED_COLUMN = '42703'

function isMissingTable(code: string | undefined): boolean {
  return !!code && MISSING_TABLE_CODES.includes(code)
}

export interface ThemePaletteRepository {
  /**
   * The catalog, in display order. Empty — not an error — when the 024
   * migration has not run: the platform then paints its own design-system
   * tokens, which is exactly what it does with no palette selected.
   */
  listAll(): Promise<ThemePaletteRecord[]>
  findByKey(key: string): Promise<ThemePaletteRecord | null>
  /** `null` when nothing is selected, or when the column is not there yet. */
  getActiveKey(): Promise<string | null>
  /** Pass `null` to fall back to the design system's own tokens. */
  setActiveKey(key: string | null, updatedByUserId: string): Promise<void>
}

export function createThemePaletteRepository(client: SupabaseClient): ThemePaletteRepository {
  return {
    async listAll() {
      const { data, error } = await client
        .from('theme_palettes')
        .select(PALETTE_COLUMNS)
        .order('display_order', { ascending: true })
        .order('key', { ascending: true })

      if (error) {
        if (isMissingTable(error.code)) {
          console.warn(
            '[theme] theme_palettes missing — run the 024-platform-theme migration. Using design-system tokens.'
          )
          return []
        }
        throw error
      }
      return (data ?? []) as unknown as ThemePaletteRecord[]
    },

    async findByKey(key) {
      const { data, error } = await client
        .from('theme_palettes')
        .select(PALETTE_COLUMNS)
        .eq('key', key)
        .maybeSingle()

      if (error) {
        if (isMissingTable(error.code)) return null
        throw error
      }
      return data as unknown as ThemePaletteRecord | null
    },

    async getActiveKey() {
      const { data, error } = await client
        .from('platform_config')
        .select('active_palette_key')
        .limit(1)
        .maybeSingle()

      if (error) {
        if (error.code === UNDEFINED_COLUMN) return null
        throw error
      }
      return (data as { active_palette_key: string | null } | null)?.active_palette_key ?? null
    },

    async setActiveKey(key, updatedByUserId) {
      const { data: config, error: configError } = await client
        .from('platform_config')
        .select('id')
        .limit(1)
        .maybeSingle()

      if (configError) throw configError
      if (!config) {
        throw new Error('platform_config row is missing; the 018 seed changeset has not run')
      }

      const { error } = await client
        .from('platform_config')
        .update({
          active_palette_key: key,
          theme_updated_at: new Date().toISOString(),
          theme_updated_by: updatedByUserId
        })
        .eq('id', (config as { id: string }).id)

      if (error) throw error
    }
  }
}
