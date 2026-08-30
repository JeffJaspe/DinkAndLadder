/**
 * Platform feature flags (docs/30-SUPER-ADMIN-SPECIFICATION.md §2.5).
 *
 * The catalog is data, not code: rows in `feature_flags` (see
 * database/liquibase/023-platform-feature-flags) decide which flags exist, what
 * they are called, how they are described and whether they are on. Nothing here
 * lists them, so adding or renaming a flag is a seed row and not a deploy.
 *
 * Code still names a key at the point where it gates something — that is the
 * gate, not the catalog. A key with no row reads as disabled, so a gate whose
 * flag was never seeded hides its feature rather than exposing it.
 */

export interface FeatureFlagRecord {
  id: string
  key: string
  label: string
  description: string | null
  enabled: boolean
  display_order: number
  updated_at: string
  updated_by_user_id: string | null
}

export interface FeatureFlagDto {
  key: string
  label: string
  description: string | null
  enabled: boolean
  display_order: number
  updated_at: string
}

export function toFeatureFlagDto(record: FeatureFlagRecord): FeatureFlagDto {
  return {
    key: record.key,
    label: record.label,
    description: record.description,
    enabled: record.enabled,
    display_order: record.display_order,
    updated_at: record.updated_at
  }
}

/** `key -> enabled`, the shape every consumer of a flag actually wants. */
export type FeatureFlagMap = Record<string, boolean>

export function toFeatureFlagMap(flags: Pick<FeatureFlagDto, 'key' | 'enabled'>[]): FeatureFlagMap {
  const map: FeatureFlagMap = {}
  for (const flag of flags) {
    map[flag.key] = flag.enabled
  }
  return map
}

/**
 * Fail closed. An unknown key means the flag has not been seeded (or was
 * removed), and the honest answer for "should this feature show?" in that case
 * is no — the alternative is a feature appearing because its row is missing.
 */
export function isEnabledIn(map: FeatureFlagMap, key: string): boolean {
  return map[key] === true
}

/**
 * Key for the achievements/badges surface. Named once so gates cannot drift.
 *
 * It lives here rather than beside `requireFeature()` because the route guard
 * `middleware/feature-achievements.ts` needs the same key, and importing it
 * from a server util drags `#supabase/server` into the client bundle.
 */
export const FEATURE_ACHIEVEMENTS = 'achievements.enabled'
