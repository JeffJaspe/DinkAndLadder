import type { FeatureFlagRepository } from '../repositories/feature-flag.repository'
import type { PlatformAdminService } from './platform-admin.service'
import {
  toFeatureFlagDto,
  toFeatureFlagMap,
  type FeatureFlagDto,
  type FeatureFlagMap
} from '../dto/feature-flag.dto'

export class FeatureFlagServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export interface FeatureFlagService {
  /** The catalog, in display order. Used by the SuperAdmin console. */
  listFlags(): Promise<FeatureFlagDto[]>
  /** `key -> enabled`, for anything deciding whether to show a feature. */
  getFlagMap(): Promise<FeatureFlagMap>
  /** SuperAdmin only. Returns the flag as stored after the write. */
  setFlag(userId: string, key: string, enabled: boolean): Promise<FeatureFlagDto>
}

export function createFeatureFlagService(
  flags: FeatureFlagRepository,
  platformAdmin: PlatformAdminService
): FeatureFlagService {
  return {
    async listFlags() {
      const records = await flags.listAll()
      return records.map(toFeatureFlagDto)
    },

    async getFlagMap() {
      const records = await flags.listAll()
      return toFeatureFlagMap(records.map(toFeatureFlagDto))
    },

    async setFlag(userId, key, enabled) {
      // Authorization first, deliberately: checking the key first would let a
      // stranger probe which flags exist from the error message alone.
      if (!(await platformAdmin.isSuperAdmin(userId))) {
        throw new FeatureFlagServiceError(
          403,
          'FORBIDDEN',
          'Only the platform SuperAdmin can change feature flags.'
        )
      }

      // The catalog lives in the database, so an unknown key is a missing row
      // rather than a typo in an enum — 404 rather than a validation error.
      const existing = await flags.findByKey(key)
      if (!existing) {
        throw new FeatureFlagServiceError(404, 'FEATURE_FLAG_NOT_FOUND', 'No such feature flag.')
      }

      const updated = await flags.setEnabled(key, enabled, userId)
      return toFeatureFlagDto(updated)
    }
  }
}
