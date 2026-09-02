import { serverSupabaseServiceRole } from '#supabase/server'
import { createEventRepository } from '~/server/domains/event/repositories/event.repository'
import { createEventService } from '~/server/domains/event/services/event.service'
import type {
  TournamentRegistrationRepository,
  TournamentRepository
} from '~/server/domains/event/repositories/tournament.repository'
import { createClubRepository } from '~/server/domains/club/repositories/club.repository'
import { createClubMembershipRepository } from '~/server/domains/club/repositories/club-membership.repository'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { createNotificationRepository } from '~/server/domains/notification/repositories/notification.repository'
import { createNotificationService } from '~/server/domains/notification/services/notification.service'
import type { CreateNotificationInput } from '~/server/domains/notification/dto/notification.dto'
import { apiError } from '~/server/utils/api-error'

/**
 * Sweep: close open-play sessions the organiser forgot to close, and tell the
 * club it happened.
 *
 * A scheduled job rather than a lazy check on read, because the notification is
 * the point — a session quietly closing the next time somebody happens to load
 * the event list would tell nobody, and would make an ordinary GET write to the
 * database. Meant to be called by a scheduler (Vercel Cron, GitHub Actions,
 * anything that can send a header); running it more often than the grace period
 * is harmless, since it is idempotent.
 *
 * Not a public endpoint. It is guarded by a shared secret rather than by a user
 * session because it has no user: with `CRON_SECRET` unset it refuses to run at
 * all, which fails closed rather than leaving an unauthenticated writer exposed.
 */
export default defineEventHandler(async (event) => {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    throw apiError(
      503,
      'NOT_CONFIGURED',
      'CRON_SECRET is not set, so scheduled tasks are disabled.'
    )
  }

  const authorization = getRequestHeader(event, 'authorization')
  if (authorization !== `Bearer ${secret}`) {
    throw apiError(401, 'AUTH_REQUIRED', 'This endpoint is for the scheduler.')
  }

  // Service role throughout: there is no signed-in user behind this request, so
  // there is no RLS identity to act under.
  const client = serverSupabaseServiceRole(event)
  const events = createEventRepository(client)
  const service = createEventService(
    events,
    {} as TournamentRepository,
    {} as TournamentRegistrationRepository
  )

  try {
    const closed = await service.autoCloseStaleOpenPlay()
    if (!closed.length) {
      return { closed: 0, notified: 0, request_id: crypto.randomUUID() }
    }

    const clubs = createClubRepository(client)
    const memberships = createClubMembershipRepository(client)
    const players = createPlayerProfileRepository(client)
    const notifications = createNotificationService(createNotificationRepository(client))

    const messages: CreateNotificationInput[] = []

    for (const closedEvent of closed) {
      /**
       * "The club" is the people who could have closed it: whoever runs the
       * club, plus the organiser who set the session up. Ordinary members are
       * deliberately left out — this is housekeeping, not news.
       */
      const roster = await memberships.listByClub(closedEvent.club_id)
      const recipientPlayerIds = new Set(
        roster
          .filter((m) => m.status === 'active' && ['OWNER', 'ADMIN'].includes(m.role))
          .map((m) => m.player_id)
      )
      recipientPlayerIds.add(closedEvent.created_by_player_id)

      const [club, profiles] = await Promise.all([
        clubs.findById(closedEvent.club_id),
        players.findByIds([...recipientPlayerIds])
      ])

      // One row per person, deduped by account: an owner who is also the
      // organiser gets one notification, not two.
      const userIds = new Set(profiles.map((p) => p.user_id).filter(Boolean))
      for (const userId of userIds) {
        messages.push({
          user_id: userId,
          type: 'event.auto_closed',
          title: 'Session closed automatically',
          body: `${closedEvent.name} was still open ${club ? `at ${club.name} ` : ''}more than 12 hours after it ended, so it has been closed. Scores already recorded are unaffected.`,
          reference_type: 'event',
          reference_id: closedEvent.id
        })
      }
    }

    await notifications.notifyMany(messages)

    return {
      closed: closed.length,
      notified: messages.length,
      event_ids: closed.map((e) => e.id),
      request_id: crypto.randomUUID()
    }
  } catch (err) {
    console.error('[POST /api/v1/tasks/close-stale-open-play] sweep failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not close stale sessions.')
  }
})
