export type ProfileVisibility = 'public' | 'private'

export interface PlayerProfileRecord {
  id: string
  user_id: string
  display_name: string
  first_name: string | null
  last_name: string | null
  bio: string | null
  province: string | null
  city: string | null
  barangay: string | null
  dominant_hand: string | null
  preferred_position: string | null
  profile_visibility: ProfileVisibility
  /**
   * Whether this player publishes their match history (067).
   *
   * Separate from `profile_visibility`: a public profile still hides its
   * matches until the player says otherwise, which is what the old blanket
   * "only visible to the player themselves" rule became.
   */
  show_match_history: boolean
  /** Bucket-relative object path, not a URL. See 055-player-avatar. */
  avatar_path: string | null
  created_at: string
  updated_at: string
}

export interface PlayerProfileDto {
  id: string
  display_name: string
  first_name: string | null
  last_name: string | null
  bio: string | null
  province: string | null
  city: string | null
  barangay: string | null
  dominant_hand: string | null
  preferred_position: string | null
  profile_visibility: ProfileVisibility
  /** See PlayerProfileRecord.show_match_history. */
  show_match_history: boolean
  /**
   * A URL the browser can load, resolved from avatar_path by the API layer
   * (the bucket has no anon read access while it is private, so signing needs
   * the service role). Null means the initials avatar, which is the design's
   * default rather than a placeholder.
   */
  avatar_url: string | null
  created_at: string
}

export interface UpdatePlayerProfileInput {
  display_name: string
  first_name?: string | null
  last_name?: string | null
  bio?: string | null
  province?: string | null
  city?: string | null
  barangay?: string | null
  dominant_hand?: string | null
  preferred_position?: string | null
  profile_visibility?: ProfileVisibility
  show_match_history?: boolean
}

export function toPlayerProfileDto(profile: PlayerProfileRecord): PlayerProfileDto {
  return {
    id: profile.id,
    display_name: profile.display_name,
    first_name: profile.first_name,
    last_name: profile.last_name,
    bio: profile.bio,
    province: profile.province,
    city: profile.city,
    barangay: profile.barangay,
    dominant_hand: profile.dominant_hand,
    preferred_position: profile.preferred_position,
    profile_visibility: profile.profile_visibility,
    show_match_history: profile.show_match_history,
    // Resolved by the API layer via withAvatarUrl(); the DTO carries the shape
    // so no caller has to know whether a photo exists.
    avatar_url: null,
    created_at: profile.created_at
  }
}

export interface PlayerSearchQuery {
  q?: string
  province?: string
  city?: string
  barangay?: string
  limit: number
  offset: number
}

export interface PlayerSearchResultRow extends PlayerProfileRecord {
  singles_rating?: number | null
  doubles_rating?: number | null
}

export interface PlayerSearchResultDto {
  id: string
  display_name: string
  avatar_url: string | null
  province: string | null
  city: string | null
  barangay: string | null
  singles_rating: number | null
  doubles_rating: number | null
}

export function toPlayerSearchResultDto(row: PlayerSearchResultRow): PlayerSearchResultDto {
  return {
    id: row.id,
    display_name: row.display_name,
    avatar_url: null,
    province: row.province,
    city: row.city,
    barangay: row.barangay,
    singles_rating: row.singles_rating ?? null,
    doubles_rating: row.doubles_rating ?? null
  }
}

/**
 * Thrown by parseUpdatePlayerProfileInput. Kept framework-free (a plain Error,
 * not an h3 error) so this module stays consistent with the rest of
 * server/domains, which never imports from server/utils — the API layer maps
 * this onto apiError().
 */
export class PlayerProfileValidationError extends Error {
  constructor(
    public readonly field: string,
    message: string
  ) {
    super(message)
    this.name = 'PlayerProfileValidationError'
  }
}

/** Every optional field of UpdatePlayerProfileInput that is a nullable string. */
type OptionalTextField = Exclude<
  keyof UpdatePlayerProfileInput,
  'display_name' | 'profile_visibility' | 'show_match_history'
>

/**
 * Declared as a Record keyed by OptionalTextField rather than a hand-written
 * array on purpose: TypeScript rejects both a missing key and an unknown one,
 * so adding a field to UpdatePlayerProfileInput without listing it here is a
 * compile error rather than a silently dropped write.
 *
 * This is the guard for the `barangay` bug — the column, DTO, editor, search
 * filter and rankings join all had it, but the API layer's hand-maintained
 * field list did not, so every save discarded the value and reported success.
 */
const UPDATABLE_TEXT_FIELD_MAP: Record<OptionalTextField, true> = {
  first_name: true,
  last_name: true,
  bio: true,
  province: true,
  city: true,
  barangay: true,
  dominant_hand: true,
  preferred_position: true
}

export const UPDATABLE_TEXT_FIELDS = Object.keys(UPDATABLE_TEXT_FIELD_MAP) as OptionalTextField[]

/**
 * Length ceilings.
 *
 * There were none, on either side: the columns are `text`, the parser only
 * checked types, and the editor set no `maxlength`. A display name is rendered
 * inside fixed-width rows — a sidebar card, a ranking row, a bracket seat — so
 * an unbounded one is a layout break on every surface that shows it, and a bio
 * of arbitrary size is a payload nobody validated. The numbers match what the
 * editor counts down to, so the field and the API agree on the limit.
 */
export const MAX_DISPLAY_NAME_LENGTH = 40
export const MAX_NAME_LENGTH = 60
export const MAX_BIO_LENGTH = 280

const TEXT_FIELD_LIMITS: Partial<Record<OptionalTextField, number>> = {
  first_name: MAX_NAME_LENGTH,
  last_name: MAX_NAME_LENGTH,
  bio: MAX_BIO_LENGTH
}

/**
 * Parses an untrusted request body into an UpdatePlayerProfileInput.
 * Extracted from the PATCH handler so it can be unit-tested directly.
 */
export function parseUpdatePlayerProfileInput(body: unknown): UpdatePlayerProfileInput {
  if (typeof body !== 'object' || body === null) {
    throw new PlayerProfileValidationError('body', 'Request body must be an object.')
  }

  const record = body as Record<string, unknown>

  if (typeof record.display_name !== 'string' || record.display_name.trim().length === 0) {
    throw new PlayerProfileValidationError('display_name', 'display_name is required.')
  }

  const displayName = record.display_name.trim()
  if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new PlayerProfileValidationError(
      'display_name',
      `display_name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`
    )
  }

  const input: UpdatePlayerProfileInput = { display_name: displayName }

  for (const field of UPDATABLE_TEXT_FIELDS) {
    const value = record[field]
    if (value === undefined) continue
    if (value !== null && typeof value !== 'string') {
      throw new PlayerProfileValidationError(field, `${field} must be a string or null.`)
    }
    const limit = TEXT_FIELD_LIMITS[field]
    if (limit !== undefined && value !== null && value.length > limit) {
      throw new PlayerProfileValidationError(
        field,
        `${field} must be ${limit} characters or fewer.`
      )
    }
    input[field] = value
  }

  if (record.profile_visibility !== undefined) {
    if (record.profile_visibility !== 'public' && record.profile_visibility !== 'private') {
      throw new PlayerProfileValidationError(
        'profile_visibility',
        "profile_visibility must be 'public' or 'private'."
      )
    }
    input.profile_visibility = record.profile_visibility
  }

  if (record.show_match_history !== undefined) {
    if (typeof record.show_match_history !== 'boolean') {
      throw new PlayerProfileValidationError(
        'show_match_history',
        'show_match_history must be true or false.'
      )
    }
    input.show_match_history = record.show_match_history
  }

  return input
}
