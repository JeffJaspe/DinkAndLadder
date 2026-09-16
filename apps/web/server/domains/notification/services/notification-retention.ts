import { NOTIFICATION_RETENTION } from '~/utils/notification-retention'

/**
 * The retention policy's arithmetic. The policy itself — the two numbers, and
 * why there are two of them — lives in utils/notification-retention.ts, which
 * the notifications page also reads so the sentence shown to the player and the
 * sweep that deletes their rows can never disagree.
 *
 * Expiry is computed at sweep time rather than stamped on each row. That is
 * deliberate: a stored `expires_at` would need a backfill and a second
 * migration every time the policy moved, and would leave old rows on the old
 * policy forever. The cost is that the two partial indexes in
 * 065-achievement-integrity have to carry the predicates instead.
 */
export { NOTIFICATION_RETENTION }

/** The two cutoffs, as ISO timestamps, for a given moment. */
export function retentionCutoffs(now: Date = new Date()): {
  readBefore: string
  createdBefore: string
} {
  const day = 24 * 60 * 60 * 1000
  return {
    readBefore: new Date(now.getTime() - NOTIFICATION_RETENTION.readDays * day).toISOString(),
    createdBefore: new Date(now.getTime() - NOTIFICATION_RETENTION.unreadDays * day).toISOString()
  }
}
