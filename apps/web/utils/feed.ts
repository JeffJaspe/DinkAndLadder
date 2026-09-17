/**
 * Pure helpers for the feed page. Kept out of the component so the words and
 * the day grouping can be tested without mounting anything.
 */

import type { FeedReason } from '~/server/domains/activity/dto/activity.dto'

/**
 * Why this row is in front of the reader, in one short clause.
 *
 * The server says *which* rule admitted the row (060); the page says it in
 * the community page's own vocabulary — partners, team-ups, opponents — so a
 * reader who wants fewer of a kind knows which tab to go to. `club` is the
 * one that names something, and the name is the whole point: "a club you
 * belong to" is not an answer, "Bay Area Pickleball" is.
 */
export function describeFeedReason(
  reason: FeedReason | null | undefined,
  name?: string | null
): string | null {
  switch (reason) {
    case 'club':
      return name ? `You're a member of ${name}` : "You're a member of this club"
    case 'self':
      return 'Your own activity'
    case 'partner':
      return 'Your duo partner'
    case 'follow':
      return 'You follow each other'
    case 'opponent':
      return "You've played each other"
    default:
      return null
  }
}

/** Local calendar day of a timestamp, as YYYY-MM-DD. */
function localDayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * The heading over a day's rows: "Today", "Yesterday", then a real date.
 *
 * The feed is ordered by day first (060), so the day is the structure of the
 * page and deserves a rule of its own. Naming it is also the honest answer to
 * "why is this old post here": it is under a heading that says when it was.
 */
export function describeFeedDay(dateStr: string, now: Date = new Date()): string {
  const date = new Date(dateStr)
  const key = localDayKey(date)
  if (key === localDayKey(now)) return 'Today'

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (key === localDayKey(yesterday)) return 'Yesterday'

  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' })
  })
}

export interface FeedDayGroup<T> {
  /** YYYY-MM-DD in the reader's own timezone. */
  key: string
  label: string
  items: T[]
}

/**
 * Consecutive rows that share a local calendar day, in the order given.
 *
 * Consecutive rather than a full bucket sort: the server already ordered by
 * day, and re-sorting here would fight the geo ordering it applied inside
 * each day. The reader's local day is used, not Manila's; for the market they
 * are the same clock, and a reader elsewhere still gets days that match their
 * own idea of "today".
 */
export function groupByFeedDay<T extends { created_at: string }>(
  items: T[],
  now: Date = new Date()
): FeedDayGroup<T>[] {
  const groups: FeedDayGroup<T>[] = []
  for (const item of items) {
    const key = localDayKey(new Date(item.created_at))
    const last = groups[groups.length - 1]
    if (last && last.key === key) {
      last.items.push(item)
    } else {
      groups.push({ key, label: describeFeedDay(item.created_at, now), items: [item] })
    }
  }
  return groups
}
