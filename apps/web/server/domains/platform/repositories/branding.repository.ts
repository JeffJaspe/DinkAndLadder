import type { SupabaseClient } from '@supabase/supabase-js'
import type { BrandingRecord, BrandingSlot } from '../dto/branding.dto'

const BRANDING_COLUMNS =
  'app_name, logo_path, favicon_path, hero_title, hero_subtitle, hero_background_path, ' +
  'hero_overlay_color, hero_overlay_opacity, branding_updated_at'

/** PostgREST's code for a column that is not there yet (pre-migration). */
const UNDEFINED_COLUMN = '42703'

const EMPTY: BrandingRecord = {
  app_name: null,
  logo_path: null,
  favicon_path: null,
  hero_title: null,
  hero_subtitle: null,
  hero_background_path: null,
  hero_overlay_color: null,
  hero_overlay_opacity: null,
  branding_updated_at: null
}

export interface HeroPatch {
  hero_title?: string | null
  hero_subtitle?: string | null
  hero_overlay_color?: string | null
  hero_overlay_opacity?: number | null
}

export interface BrandingRepository {
  /**
   * Branding as stored. Falls back to an all-null record — not an error — when
   * the 025/026 migrations have not run, so the platform keeps painting its own
   * name, monogram and landing copy instead of failing every page render.
   */
  get(): Promise<BrandingRecord>
  setAppName(appName: string | null, updatedByUserId: string): Promise<BrandingRecord>
  /** `null` clears the slot back to the built-in mark. */
  setAssetPath(
    slot: BrandingSlot,
    path: string | null,
    updatedByUserId: string
  ): Promise<BrandingRecord>
  setHero(patch: HeroPatch, updatedByUserId: string): Promise<BrandingRecord>
}

const SLOT_COLUMNS: Record<BrandingSlot, string> = {
  logo: 'logo_path',
  favicon: 'favicon_path',
  hero: 'hero_background_path'
}

/**
 * platform_config has RLS enabled with zero policies, so every caller must be
 * constructed with the service-role client.
 */
export function createBrandingRepository(client: SupabaseClient): BrandingRepository {
  async function configId(): Promise<string> {
    const { data, error } = await client.from('platform_config').select('id').limit(1).maybeSingle()
    if (error) throw error
    if (!data) throw new Error('platform_config row is missing; the 018 seed changeset has not run')
    return (data as { id: string }).id
  }

  async function update(patch: Record<string, unknown>, updatedByUserId: string) {
    const id = await configId()
    const { data, error } = await client
      .from('platform_config')
      .update({
        ...patch,
        branding_updated_at: new Date().toISOString(),
        branding_updated_by: updatedByUserId
      })
      .eq('id', id)
      .select(BRANDING_COLUMNS)
      .single()

    if (error) throw error
    return data as unknown as BrandingRecord
  }

  return {
    async get() {
      const { data, error } = await client
        .from('platform_config')
        .select(BRANDING_COLUMNS)
        .limit(1)
        .maybeSingle()

      if (error) {
        if (error.code === UNDEFINED_COLUMN) {
          console.warn(
            '[branding] columns missing — run the 025/026 platform migrations. Using built-in branding.'
          )
          return EMPTY
        }
        throw error
      }
      return (data as unknown as BrandingRecord | null) ?? EMPTY
    },

    setAppName(appName, updatedByUserId) {
      return update({ app_name: appName }, updatedByUserId)
    },

    setAssetPath(slot, path, updatedByUserId) {
      return update({ [SLOT_COLUMNS[slot]]: path }, updatedByUserId)
    },

    setHero(patch, updatedByUserId) {
      // Only the keys the caller actually supplied, so updating the title does
      // not silently blank the overlay.
      return update({ ...patch }, updatedByUserId)
    }
  }
}
