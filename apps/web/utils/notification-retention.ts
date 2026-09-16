/**
 * How long a notification lives.
 *
 * Notifications are disposable. "Your rating moved from 3.41 to 3.48" is worth
 * something the day it arrives and nothing a month later, and the table had no
 * ceiling at all — every rating recalculation, club announcement and team-up
 * invitation the platform had ever sent was still there. That cost grows with
 * activity, which is exactly the direction the product is trying to grow in.
 *
 * Two clocks, because a read notification and an unread one are not the same
 * object:
 *
 * - **Read: 14 days.** The clock starts when it was read, not when it was sent,
 *   so it only begins counting once the notification has done its job. Nothing
 *   is ever deleted out from under somebody who has not seen it.
 * - **Unread: 90 days.** Long enough that a player away for a season still
 *   finds what waited for them, short enough that abandoned accounts stop
 *   accumulating.
 *
 * The deep link a notification carries is a reference, not the record itself —
 * the match, the club membership and the rating transaction all outlive it —
 * so expiry loses the announcement, never the thing announced.
 *
 * Lives in `utils/` rather than in the notification domain because the policy
 * is stated to the player on the notifications page as well as applied by the
 * sweep, and the sentence and the sweep must never drift apart. The domain
 * imports it; see notification-retention.ts there for the cutoff arithmetic.
 */
export const NOTIFICATION_RETENTION = {
  /** Days a notification is kept after the player read it. */
  readDays: 14,
  /** Days an unread notification is kept after it was created. */
  unreadDays: 90
} as const

/** The policy in one sentence, for the notifications page. */
export const RETENTION_NOTICE = `Notifications are cleared ${NOTIFICATION_RETENTION.readDays} days after you read them, or ${NOTIFICATION_RETENTION.unreadDays} days if you never do. The matches, clubs and ratings they point to are kept.`
