import type { PlayerProfileRepository } from '../repositories/player-profile.repository'
import type { PlayerProfileDto, UpdatePlayerProfileInput } from '../dto/player-profile.dto'
import { PlayerProfileValidationError, toPlayerProfileDto } from '../dto/player-profile.dto'

export interface PlayerProfileService {
  getById(profileId: string): Promise<PlayerProfileDto | null>
  getOwnProfile(userId: string): Promise<PlayerProfileDto | null>
  saveOwnProfile(userId: string, input: UpdatePlayerProfileInput): Promise<PlayerProfileDto>
  /**
   * Create the profile if this user has none, otherwise return the existing one
   * untouched. Used by the onboarding paths, which must never rename someone
   * who already chose a display name — saveOwnProfile upserts, so calling it
   * from onboarding silently overwrote the name every time the flow was
   * re-entered (reachable via AccountSwitcher's rate-only redirect).
   */
  ensureProfile(userId: string, displayName?: string | null): Promise<PlayerProfileDto>
}

export function createPlayerProfileService(
  repository: PlayerProfileRepository
): PlayerProfileService {
  return {
    async getById(profileId) {
      const profile = await repository.findById(profileId)
      return profile ? toPlayerProfileDto(profile) : null
    },

    async getOwnProfile(userId) {
      const profile = await repository.findByUserId(userId)
      return profile ? toPlayerProfileDto(profile) : null
    },

    async saveOwnProfile(userId, input) {
      const profile = await repository.upsertOwnProfile(userId, input)
      return toPlayerProfileDto(profile)
    },

    async ensureProfile(userId, displayName) {
      const existing = await repository.findByUserId(userId)
      if (existing) {
        return toPlayerProfileDto(existing)
      }

      const trimmed = typeof displayName === 'string' ? displayName.trim() : ''
      if (!trimmed) {
        // Deliberately not defaulted from the email address. display_name is
        // published through the public-read RLS policy on player_profiles, so
        // deriving it from an email leaked the local part (often a real name)
        // onto a public profile before the user ever saw a settings screen.
        throw new PlayerProfileValidationError(
          'display_name',
          'A display name is required to create your profile.'
        )
      }

      const profile = await repository.upsertOwnProfile(userId, { display_name: trimmed })
      return toPlayerProfileDto(profile)
    }
  }
}
