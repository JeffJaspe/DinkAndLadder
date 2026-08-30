/**
 * Groups notification types into the four things a person actually wants to
 * look at separately.
 *
 * The list was one undifferentiated stream, so "did anyone ask to team up with
 * me?" meant scrolling past every rating recalculation. The categories below
 * are the ones named as mattering: your own account, club activity, people
 * pairing up with you, and anything from moderation.
 *
 * Derived from the type string rather than stored on the row: `notifications`
 * has no category column, and adding one would mean a migration plus a
 * backfill to express something the type prefix already encodes. A new type
 * that matches no rule falls into `account`, which is the safe default — it
 * shows up somewhere rather than being silently unreachable.
 */

export type NotificationCategory = 'account' | 'club' | 'community' | 'moderation'

export const NOTIFICATION_CATEGORIES: {
  value: NotificationCategory | 'all'
  label: string
}[] = [
  { value: 'all', label: 'All' },
  { value: 'account', label: 'Account' },
  { value: 'club', label: 'Clubs' },
  { value: 'community', label: 'Community' },
  { value: 'moderation', label: 'Warnings' }
]

export function categoryOf(type: string): NotificationCategory {
  if (type.startsWith('club.')) return 'club'
  if (type.startsWith('moderation.')) return 'moderation'

  // Partner requests and team-ups are both "another player wants something
  // with you", which is one question however the product names the two
  // relationships.
  if (type.startsWith('partner.') || type.startsWith('team_up.')) return 'community'

  // match.* and rating.* are things that happened to YOUR record. They belong
  // with the account, not in a social bucket.
  return 'account'
}
