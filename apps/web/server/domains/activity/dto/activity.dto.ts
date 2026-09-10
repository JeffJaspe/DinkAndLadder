export type ActivityType =
  | 'match.verified'
  | 'rating.changed'
  | 'achievement.earned'
  | 'profile.updated'
  | 'club.event_created'
  | 'club.member_joined'
  | 'club.announcement'
  | 'social.started_following'
  | 'social.shoutout'

export type ActivityVisibility = 'public' | 'followers' | 'club' | 'private'

export interface ActivityRecord {
  id: string
  actor_player_id: string | null
  actor_club_id: string | null
  activity_type: ActivityType
  reference_type: string | null
  reference_id: string | null
  visibility: ActivityVisibility
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface ActivityDto {
  id: string
  actor_player_id: string | null
  actor_club_id: string | null
  activity_type: ActivityType
  reference_type: string | null
  reference_id: string | null
  visibility: ActivityVisibility
  metadata: Record<string, unknown> | null
  created_at: string
}

export function toActivityDto(record: ActivityRecord): ActivityDto {
  return {
    id: record.id,
    actor_player_id: record.actor_player_id,
    actor_club_id: record.actor_club_id,
    activity_type: record.activity_type,
    reference_type: record.reference_type,
    reference_id: record.reference_id,
    visibility: record.visibility,
    metadata: record.metadata,
    created_at: record.created_at
  }
}

export interface CreateActivityInput {
  actor_player_id?: string | null
  actor_club_id?: string | null
  activity_type: ActivityType
  reference_type?: string | null
  reference_id?: string | null
  visibility?: ActivityVisibility
  metadata?: Record<string, unknown> | null
}

/**
 * Who is in the feed.
 *
 * `community` is the product behaviour (049-feed-community-scope): only the
 * viewer's own people. `geo` is the older everyone's-public-activity listing,
 * still what a signed-out visitor gets, since they have no community to scope
 * to.
 */
export type FeedScope = 'community' | 'geo'

export interface FeedQuery {
  limit: number
  offset: number
  types?: ActivityType[]
  since?: string
  scope?: FeedScope
}

/** A page of the feed, plus what the page means when it is empty. */
export interface FeedResult {
  activities: ActivityDto[]
  /**
   * Players in the viewer's community, self included — so 1 means "no one yet".
   * Null for a signed-out viewer, who is not being scoped in the first place.
   */
  community_size: number | null
}

/**
 * Thrown by parseFeedQuery / parsePagination. A plain Error, not an h3 one, so
 * server/domains keeps its rule of never importing from server/utils — the API
 * layer maps it onto apiError(400, ...).
 */
export class FeedQueryValidationError extends Error {
  constructor(
    public readonly field: string,
    message: string
  ) {
    super(message)
    this.name = 'FeedQueryValidationError'
  }
}

/**
 * Every ActivityType, as a value.
 *
 * Declared as a Record keyed by ActivityType rather than a hand-written array
 * for the same reason UPDATABLE_TEXT_FIELD_MAP is: TypeScript rejects both a
 * missing key and an unknown one, so adding a type to the union without
 * listing it here is a compile error rather than a filter that silently
 * rejects the new type as unknown.
 */
const ACTIVITY_TYPE_MAP: Record<ActivityType, true> = {
  'match.verified': true,
  'rating.changed': true,
  'achievement.earned': true,
  'profile.updated': true,
  'club.event_created': true,
  'club.member_joined': true,
  'club.announcement': true,
  'social.started_following': true,
  'social.shoutout': true
}

export const ACTIVITY_TYPES = Object.keys(ACTIVITY_TYPE_MAP) as ActivityType[]

export function isActivityType(value: string): value is ActivityType {
  return Object.prototype.hasOwnProperty.call(ACTIVITY_TYPE_MAP, value)
}

export const DEFAULT_FEED_LIMIT = 20
export const MAX_FEED_LIMIT = 50

/**
 * `getQuery` gives a string for `?k=v`, an array for a repeated `?k=a&k=b`,
 * and undefined for an absent key. Anything else (a nested object from
 * `?k[x]=1`) is not a value this API accepts.
 */
function singleValue(raw: unknown, field: string): string | undefined {
  if (raw === undefined || raw === null) return undefined
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) {
    const last = raw[raw.length - 1]
    if (typeof last === 'string') return last
  }
  throw new FeedQueryValidationError(field, `${field} must be a single value.`)
}

/**
 * A whole number, or a 400.
 *
 * The old `parseInt(x) || fallback` was wrong in three separate ways: it read
 * "12abc" as 12, silently swapped the fallback in for junk, and let a negative
 * through to `.range(-5, 14)` / a negative SQL OFFSET, which is a 500 rather
 * than the bad request it is.
 */
function parseInteger(
  raw: unknown,
  field: string,
  { min, max, fallback }: { min: number; max: number; fallback: number }
): number {
  const value = singleValue(raw, field)
  if (value === undefined || value.trim() === '') return fallback

  if (!/^-?\d+$/.test(value.trim())) {
    throw new FeedQueryValidationError(field, `${field} must be a whole number.`)
  }

  const parsed = Number(value.trim())
  if (parsed < min || parsed > max) {
    throw new FeedQueryValidationError(field, `${field} must be between ${min} and ${max}.`)
  }
  return parsed
}

/** `limit`/`offset` for any activity listing. Shared by the feed and profiles. */
export function parsePagination(
  rawQuery: Record<string, unknown>,
  options: { defaultLimit?: number; maxLimit?: number } = {}
): { limit: number; offset: number } {
  const maxLimit = options.maxLimit ?? MAX_FEED_LIMIT
  return {
    limit: parseInteger(rawQuery.limit, 'limit', {
      min: 1,
      max: maxLimit,
      fallback: options.defaultLimit ?? DEFAULT_FEED_LIMIT
    }),
    // Number.MAX_SAFE_INTEGER rather than an arbitrary cap: a deep offset is a
    // slow query, not an invalid one, and the page size is already bounded.
    offset: parseInteger(rawQuery.offset, 'offset', {
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
      fallback: 0
    })
  }
}

/**
 * The feed's query string, validated.
 *
 * `scope` is deliberately absent: it is a product rule, not a preference, and
 * accepting `?scope=geo` would hand any caller the public firehose the
 * community scope exists to replace. The caller sets it.
 */
export function parseFeedQuery(rawQuery: Record<string, unknown>): FeedQuery {
  const { limit, offset } = parsePagination(rawQuery)

  let types: ActivityType[] | undefined
  const rawTypes = singleValue(rawQuery.types, 'types')
  if (rawTypes !== undefined) {
    const requested: ActivityType[] = []
    for (const raw of rawTypes.split(',')) {
      const type = raw.trim()
      if (type.length === 0) continue
      if (!isActivityType(type)) {
        throw new FeedQueryValidationError(
          'types',
          `types contains an unknown activity type: ${type}.`
        )
      }
      requested.push(type)
    }

    // `?types=` and `?types=,,` mean "no filter", not "match nothing" — an
    // empty `.in()` list would return an empty page and read as a broken feed.
    types = requested.length > 0 ? [...new Set(requested)] : undefined
  }

  let since: string | undefined
  const rawSince = singleValue(rawQuery.since, 'since')
  if (rawSince !== undefined && rawSince.trim() !== '') {
    const parsed = Date.parse(rawSince.trim())
    if (Number.isNaN(parsed)) {
      throw new FeedQueryValidationError(
        'since',
        'since must be an ISO 8601 timestamp, e.g. 2026-01-31T00:00:00Z.'
      )
    }
    // Normalised rather than passed through: Postgres rejects plenty of strings
    // Date.parse accepts, and that rejection arrives as a 500.
    since = new Date(parsed).toISOString()
  }

  return { limit, offset, types, since }
}
