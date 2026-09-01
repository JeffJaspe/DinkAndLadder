import {
  serverSupabaseClient,
  serverSupabaseServiceRole,
  serverSupabaseUser
} from '#supabase/server'
import { createEventQueueRepository } from '~/server/domains/event/repositories/event-queue.repository'
import { createPlayerProfileRepository } from '~/server/domains/player/repositories/player-profile.repository'
import { generateMixupSchedule, mixupShortfall } from '~/server/domains/event/services/mixup-scheduler'
import { assertCanRunEvent } from '~/server/utils/event-organizer'
import { apiError } from '~/server/utils/api-error'

const MAX_ROUNDS = 20

/**
 * Generate a mixer schedule for the players currently in the queue.
 *
 * Preview only — nothing is written. The organiser sees the rounds, and courts
 * are started from them one at a time through
 * `/events/:id/courts/:courtId/start`. Committing a whole evening's pairings up
 * front would be wrong: people arrive late, leave early and pull out with a bad
 * ankle, and a schedule baked into the database at 7pm is a liability by 8.
 *
 * The generator is pure and seeded, so re-requesting with the same seed returns
 * the same schedule and the preview an organiser approves is the one they get.
 */
export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  if (!claims) {
    throw apiError(401, 'AUTH_REQUIRED', 'Sign in to manage the queue.')
  }

  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) {
    throw apiError(400, 'VALIDATION_ERROR', 'eventId is required.')
  }

  type MixupBody = { rounds?: unknown; seed?: unknown; format?: unknown }
  const body: MixupBody = (await readBody<MixupBody>(event).catch(() => undefined)) ?? {}

  const rounds = typeof body.rounds === 'number' ? Math.floor(body.rounds) : 6
  if (rounds < 1 || rounds > MAX_ROUNDS) {
    throw apiError(400, 'VALIDATION_ERROR', `rounds must be between 1 and ${MAX_ROUNDS}.`)
  }
  if (body.format !== undefined && body.format !== 'singles' && body.format !== 'doubles') {
    throw apiError(400, 'VALIDATION_ERROR', "format must be 'singles' or 'doubles'.")
  }

  const userClient = await serverSupabaseClient(event)
  const profile = await createPlayerProfileRepository(userClient).findByUserId(claims.sub)
  if (!profile) {
    throw apiError(409, 'PLAYER_PROFILE_REQUIRED', 'Complete your player profile first.')
  }

  const serviceClient = serverSupabaseServiceRole(event)
  const eventRow = await assertCanRunEvent(serviceClient, eventId, profile.id)

  // Deliberately no "must be active" check: an organiser wants to see what the
  // evening looks like before starting it, and a preview writes nothing.

  const { data: formatRow } = await serviceClient
    .from('events')
    .select('match_format')
    .eq('id', eventId)
    .maybeSingle()

  const format =
    (body.format as 'singles' | 'doubles' | undefined) ??
    ((formatRow as { match_format?: string } | null)?.match_format as
      'singles' | 'doubles' | undefined) ??
    'doubles'

  const queueEntries = await createEventQueueRepository(serviceClient).findByEvent(eventId)
  const waiting = queueEntries
    .filter((entry) => entry.status === 'waiting' || entry.status === 'matched')
    .sort((a, b) => a.joined_at.localeCompare(b.joined_at))

  // A mixer rotates individuals, so a doubles entry that already names a
  // partner is split: the whole point is that you do NOT play with the person
  // you arrived with every round.
  const players = waiting.flatMap((entry) =>
    [entry.player_id, entry.partner_id]
      .filter((id): id is string => !!id)
      .map((playerId) => ({ queue_id: entry.id, player_id: playerId }))
  )

  // Refuse before building rather than returning an empty schedule: a preview
  // that silently shows nothing is what made a short queue look like a bug.
  const shortfall = mixupShortfall(players.length, format)
  if (shortfall) {
    throw apiError(409, 'NOT_ENOUGH_PLAYERS', shortfall)
  }

  const schedule = generateMixupSchedule({
    players,
    courts: Math.max(1, eventRow.queue_courts ?? 1),
    rounds,
    format,
    seed: typeof body.seed === 'number' ? body.seed : undefined
  })

  return {
    data: schedule,
    player_count: players.length,
    format,
    request_id: crypto.randomUUID()
  }
})
