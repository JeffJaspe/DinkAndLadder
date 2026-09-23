import type { EventRepository } from '../repositories/event.repository'
import type {
  TournamentRegistrationRepository,
  TournamentRepository
} from '../repositories/tournament.repository'
import type { ClubMembershipRepository } from '../../club/repositories/club-membership.repository'
import type {
  CreateEventInput,
  EventDto,
  EventRecord,
  EventSearchQuery,
  QueueMode,
  UpdateEventInput
} from '../dto/event.dto'
import {
  OPEN_PLAY_CLOSE_GRACE_HOURS,
  SLOT_OCCUPYING_STATUSES,
  staleOpenPlayDeadline,
  toEventDto
} from '../dto/event.dto'
import type { EventRegistrationRepository } from '../repositories/event-registration.repository'
import type { TournamentCategoryRepository } from '../repositories/tournament-category.repository'
import type { PartnershipRepository } from '../../partnership/repositories/partnership.repository'
import type { RatingRepository } from '../../rating/repositories/rating.repository'
import type { ClubRepository } from '../../club/repositories/club.repository'
import { resolveMatchType } from '../dto/tournament-category.dto'
import { bandExclusionReason } from '~/utils/rating-bands'
import type {
  CreateTournamentInput,
  TournamentDto,
  TournamentMatchType,
  TournamentRegistrationDto,
  TournamentRegistrationWithPlayerDto,
  UpdateTournamentInput
} from '../dto/tournament.dto'
import {
  resolveEntrantRating,
  toTournamentDto,
  toTournamentRegistrationDto
} from '../dto/tournament.dto'

import type { ClubEntitlementsService } from '../../payment/services/club-entitlements.service'
import { unwiredEntitlements } from '../../payment/services/club-entitlements.service'
import type { ClubEntitlements } from '../../payment/dto/entitlements.dto'
import { describeLimit } from '~/utils/subscription-plan'

/** The stored pairing modes. Named for players in `utils/queue-mode.ts`. */
const QUEUE_MODES: QueueMode[] = ['first_come', 'rating_based', 'random']

/** `HH:MM` or `HH:MM:SS` on a 24-hour clock — what an <input type="time"> emits. */
const TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/

/**
 * The one-entry-per-category trigger rejecting an insert, as it reaches us
 * through PostgREST.
 *
 * It raises `unique_violation` (23505) deliberately so that a lost race and an
 * ordinary duplicate are the same class of failure; the message prefix is what
 * separates it from a real unique index firing on some other column.
 */
function isOneEntryPerCategoryViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const candidate = err as { code?: unknown; message?: unknown }
  return (
    candidate.code === '23505' &&
    typeof candidate.message === 'string' &&
    candidate.message.includes('ONE_ENTRY_PER_CATEGORY')
  )
}

export class EventServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export interface EventService {
  createEvent(playerId: string, input: CreateEventInput): Promise<EventDto>
  getEvent(eventId: string): Promise<EventDto | null>
  updateEvent(playerId: string, eventId: string, input: UpdateEventInput): Promise<EventDto>
  publishEvent(playerId: string, eventId: string): Promise<EventDto>
  /**
   * published -> active. The session is now running.
   *
   * This transition did not exist: UpdateEventInput has no status field, so
   * 'active' was unreachable through the API - while check-in, the Record Match
   * card and the withdraw/check-in branches all gate on status === 'active'.
   * Every one of those was dead code.
   */
  startEvent(playerId: string, eventId: string): Promise<EventDto>
  /** active -> completed. Frees the club's live-event allowance. */
  completeEvent(playerId: string, eventId: string): Promise<EventDto>
  /** Draft-only, and only when nothing is attached. See the implementation. */
  deleteDraftEvent(playerId: string, eventId: string): Promise<void>
  cancelEvent(playerId: string, eventId: string): Promise<EventDto>
  searchEvents(query: EventSearchQuery): Promise<EventDto[]>
  /**
   * Close open-play sessions whose organiser never did.
   *
   * A session left open keeps taking registrations for an evening that has
   * already happened, and keeps claiming a live court on every board that reads
   * the event list. Nobody was sweeping them, because closing was only ever a
   * button.
   *
   * Returns what it closed so the caller can announce it — the club is told
   * that its session was closed for it, which is the half of this that stops it
   * looking like data loss.
   *
   * Idempotent and safe to run on any schedule: it only ever touches rows that
   * are still active, still unclosed, and already past their grace period.
   */
  autoCloseStaleOpenPlay(input?: {
    now?: Date
    graceHours?: number
    limit?: number
  }): Promise<EventDto[]>

  createTournament(playerId: string, input: CreateTournamentInput): Promise<TournamentDto>
  getTournaments(eventId: string): Promise<TournamentDto[]>
  /**
   * The one tournament a tournament event runs.
   *
   * "The first, ignore the rest" is a business rule, not a rendering detail, so
   * it lives here rather than in a page reaching for `[0]`. Ordered by
   * creation, so renaming a tournament cannot silently change which one the
   * event shows.
   */
  getPrimaryTournament(eventId: string): Promise<TournamentDto | null>
  updateTournament(
    playerId: string,
    tournamentId: string,
    input: UpdateTournamentInput
  ): Promise<TournamentDto>

  register(
    playerId: string,
    tournamentId: string,
    partnerPlayerId: string | null,
    categoryId?: string | null
  ): Promise<TournamentRegistrationDto>
  getRegistrations(tournamentId: string): Promise<TournamentRegistrationDto[]>
  /** Same list with player names resolved, for screens that show who entered. */
  /**
   * Each row also carries the entrant's `avatar_path`. The service has no
   * storage client, so turning it into a URL is the endpoint's job — the same
   * split as PlayerProfileService and its AvatarUrlResolver.
   */
  getRegistrationsWithPlayers(
    tournamentId: string
  ): Promise<Array<TournamentRegistrationWithPlayerDto & { avatar_path: string | null }>>
  withdrawRegistration(playerId: string, registrationId: string): Promise<TournamentRegistrationDto>
  updateRegistrationStatus(
    playerId: string,
    registrationId: string,
    status: 'confirmed' | 'rejected' | 'waitlisted'
  ): Promise<TournamentRegistrationDto>
}

export function createEventService(
  events: EventRepository,
  tournaments: TournamentRepository,
  registrations: TournamentRegistrationRepository,
  memberships?: ClubMembershipRepository,
  /**
   * Supplied by the list endpoint so search results can carry how many slots
   * are taken. Optional because every other caller of this service works fine
   * without it, and making it required would touch five call sites for a field
   * only one of them uses.
   */
  eventRegistrations?: EventRegistrationRepository,
  /**
   * Only needed to read a category's match type when someone registers.
   * Optional for the same reason `memberships` is: without it registration
   * falls back to the tournament's type, which is what it always used.
   */
  categories?: TournamentCategoryRepository,
  /**
   * Only needed to confirm a named partner actually agreed to be one. Optional
   * like the rest, and its absence degrades to the previous behaviour — any
   * player id accepted — rather than failing every doubles entry closed.
   */
  partnerships?: PartnershipRepository,
  /**
   * Only needed to enforce a category's rating band. Optional like the rest;
   * without it a banded category admits anyone, which is what happened before
   * this check existed at all.
   */
  ratings?: RatingRepository,
  /**
   * Only needed to read a club's verification status, which is what decides
   * how many events it may run. Optional like the rest; without it no limit
   * applies, which is the behaviour that existed before there were any.
   */
  clubs?: ClubRepository,
  /**
   * Resolves what this club's plan actually allows. Optional like the rest —
   * but note the degrade below is NOT "no limit": an unwired dependency must
   * not silently delete every ceiling, so it falls back to the same 1/1/1 the
   * hardcoded literals enforced.
   *
   * NOTE: this argument list is now ten long and wants an options object. Not
   * in this change — it would touch eighteen call sites for no behavioural
   * gain.
   */
  entitlements?: ClubEntitlementsService
): EventService {
  const STAFF_ROLES = ['OWNER', 'ADMIN', 'MODERATOR']

  /**
   * The creator, a co-organiser, or club staff (owner/admin/moderator).
   *
   * Club staff can run the event alongside the creator and co-organisers — a
   * club night is run by whoever is on the desk, not by whoever happened to
   * create it a fortnight ago. Deleting the event and choosing who co-organises
   * pass `creatorOnly` and stay with the person who made it.
   */
  async function assertEventOrganizer(
    playerId: string,
    eventId: string,
    options: { creatorOnly?: boolean } = {}
  ) {
    const event = await events.findById(eventId)
    if (!event) {
      throw new EventServiceError(404, 'NOT_FOUND', 'Event not found.')
    }
    if (event.created_by_player_id === playerId) return event
    if (!options.creatorOnly && (await events.isCoOrganizer?.(eventId, playerId))) return event

    // Club staff can modify the event (but not delete it or change co-organisers)
    if (!options.creatorOnly && memberships && event.club_id) {
      const membership = await memberships.findByClubAndPlayer(event.club_id, playerId)
      if (
        membership &&
        membership.status === 'active' &&
        STAFF_ROLES.includes(membership.role)
      ) {
        return event
      }
    }

    throw new EventServiceError(
      403,
      'FORBIDDEN',
      options.creatorOnly
        ? 'Only the person who created the event can do this.'
        : 'Only the organizer, a co-organiser or the hosting club\'s staff can modify this event.'
    )
  }

  /**
   * Who may admit or turn away a tournament registration.
   *
   * The event's creator always may. Beyond that it falls to the hosting club's
   * staff — owner, admin or moderator — because a pending registration is a
   * person waiting, and tying that queue to one individual means it stalls
   * whenever they are unavailable. This mirrors the club-side rule for join
   * requests (see ClubService's APPROVAL_ROLES): reviewing a queue is the
   * routine work a moderator is for.
   *
   * Nothing else about the event moves with it — editing, publishing, cancelling
   * and deleting all remain the organiser's alone via assertEventOrganizer.
   *
   * Degrades to organiser-only rather than throwing when the membership
   * repository was not supplied, so callers constructed without it keep the
   * behaviour they had instead of failing closed on a 500.
   */
  async function assertCanReviewRegistrations(playerId: string, eventId: string) {
    const event = await events.findById(eventId)
    if (!event) {
      throw new EventServiceError(404, 'NOT_FOUND', 'Event not found.')
    }
    if (event.created_by_player_id === playerId) {
      return event
    }

    if (memberships && event.club_id) {
      const membership = await memberships.findByClubAndPlayer(event.club_id, playerId)
      if (
        membership &&
        membership.status === 'active' &&
        ['OWNER', 'ADMIN', 'MODERATOR'].includes(membership.role)
      ) {
        return event
      }
    }

    throw new EventServiceError(
      403,
      'FORBIDDEN',
      'Only the organizer or the hosting club’s staff can review registrations.'
    )
  }

  /**
   * One entry per person per category — as the registrant OR as a partner.
   *
   * A doubles entry is one row carrying two people, and the old check read
   * `player_id` on its own, so the named partner was invisible: they could
   * enter the same category again in their own right, or be named by a second
   * pair, and the generator would seed the same person into two slots of one
   * draw. All four combinations are refused here, and the message names who
   * and how, because "already registered" does not tell an organiser staring
   * at a list of forty entries where to look.
   *
   * Scoped to the category, not the tournament: entering the 3.5 Singles and
   * the 3.5 Doubles of one weekend is legitimate, and the old tournament-wide
   * check made it impossible.
   */
  async function assertNeitherIsAlreadyInCategory(
    tournamentId: string,
    categoryId: string | null,
    playerId: string,
    partnerPlayerId: string | null
  ) {
    const entrants = await registrations.findCategoryEntrants(tournamentId, categoryId)
    if (!entrants.length) return

    const held = new Map(entrants.map((entrant) => [entrant.player_id, entrant]))

    const clash = held.get(playerId)
    if (clash) {
      throw new EventServiceError(
        409,
        'ALREADY_IN_CATEGORY',
        clash.as_partner
          ? 'You are already in this category as another player’s partner.'
          : 'You are already registered in this category.'
      )
    }

    if (partnerPlayerId) {
      const partnerClash = held.get(partnerPlayerId)
      if (partnerClash) {
        throw new EventServiceError(
          409,
          'PARTNER_ALREADY_IN_CATEGORY',
          partnerClash.as_partner
            ? 'That player is already in this category as someone else’s partner.'
            : 'That player is already registered in this category in their own right.'
        )
      }
    }
  }

  /**
   * Both halves of an entry have to be in the band, not just whoever pressed
   * the button.
   *
   * This check used to live in the registrations controller, which put business
   * logic in a place CLAUDE.md §1 reserves for wiring, and it had two bugs
   * worth naming: it read the TOURNAMENT's match type, so a doubles category
   * inside a singles tournament was judged on singles ratings; and it examined
   * the registrant alone, so a 3.2 player could carry a 4.9 partner into a 3.5
   * draw. Both are fixed by going through `resolveMatchType` and by looping.
   *
   * Degrades to no check when the rating repository was not supplied, matching
   * how `memberships` and `categories` behave.
   */
  async function assertBothMeetTheBand(
    category: { min_rating: number | null; max_rating: number | null } | null,
    matchType: TournamentMatchType,
    playerId: string,
    partnerPlayerId: string | null
  ) {
    if (!category || !ratings) return
    if (category.min_rating == null && category.max_rating == null) return

    for (const [id, who] of [
      [playerId, 'you'],
      [partnerPlayerId, 'partner']
    ] as const) {
      if (!id) continue

      const rating = await ratings.getRating(id, matchType)
      const value = rating?.rating_value ?? null
      const reason = bandExclusionReason(value, category.min_rating, category.max_rating)
      if (!reason) continue

      throw new EventServiceError(
        400,
        who === 'you' ? 'RATING_OUT_OF_BAND' : 'PARTNER_RATING_OUT_OF_BAND',
        who === 'you' ? reason : `Your partner cannot enter this category. ${reason}`
      )
    }
  }

  /**
   * What this club may have running at once.
   *
   * Nothing limited this before, so a club could accumulate drafts and live
   * events without bound — and verification, which has a full approval flow
   * already built, bought nothing. These are the limits that make a tier mean
   * something.
   *
   * The three ceilings used to be hardcoded `>= 1` literals here. They are now
   * read from the club's resolved plan (056), which is the same 1/1/1 for a
   * club on the free plan — the seed was written to match these literals
   * exactly, so applying that migration changed nobody's allowance.
   *
   * Cancelled and completed events do not count. An event that has had its
   * weekend must not block the next one, and a cancelled one never happened.
   *
   * Two degrade paths, and they are NOT the same:
   *
   * - **No club repository** — no limit, unchanged. That matches `memberships`
   *   and `categories`: a caller that never wired it keeps the behaviour it had
   *   before limits existed at all.
   * - **No entitlements service** — the 1/1/1 default, NOT unlimited. Every
   *   existing caller is in this state until step 6 wires it, and a missing
   *   optional dependency must not silently delete every ceiling in the
   *   product.
   */
  async function assertWithinClubLimits(
    clubId: string,
    intent: 'draft' | 'publish',
    eventType: string
  ) {
    if (!clubs) return

    const club = await clubs.findById(clubId)
    if (!club) return

    /*
     * THE VERIFIED BYPASS STAYS, AND STAYS FIRST.
     *
     * Verification and paid plans are two routes to the same unlimited
     * allowance. Removing this line would drop every currently verified club
     * from unlimited to 1/1/1 the moment this ships — a regression delivered as
     * a feature, to precisely the clubs that went through the review process.
     */
    if (club.verification_status === 'verified') return

    const allowance: ClubEntitlements = entitlements
      ? await entitlements.resolve(clubId)
      : unwiredEntitlements()

    const counts = await events.countByClubForLimits(clubId)

    if (intent === 'draft') {
      const cap = allowance.max_draft_events
      // null is unlimited. Never -1; see the entitlements DTO.
      if (cap !== null && counts.drafts >= cap) {
        throw new EventServiceError(
          409,
          'CLUB_DRAFT_LIMIT',
          `Your plan allows ${describeLimit(cap, 'draft event').toLowerCase()}. ` +
            'Publish or delete the one you have, or upgrade the club for more.'
        )
      }
      return
    }

    const isTournament = ['tournament', 'tournament_casual', 'tournament_club'].includes(eventType)
    const cap = isTournament ? allowance.max_live_tournaments : allowance.max_live_open_play
    const live = isTournament ? counts.liveTournaments : counts.liveOpenPlay

    if (cap !== null && live >= cap) {
      throw new EventServiceError(
        409,
        'CLUB_EVENT_LIMIT',
        `Your plan allows ${describeLimit(
          cap,
          isTournament ? 'live tournament' : 'live open play event'
        ).toLowerCase()}. Finish or cancel the current one, or upgrade the club for more.`
      )
    }
  }

  async function assertClubAdmin(playerId: string, clubId: string) {
    if (!memberships) {
      throw new EventServiceError(500, 'INTERNAL_ERROR', 'Membership repository not available.')
    }
    const membership = await memberships.findByClubAndPlayer(clubId, playerId)
    if (!membership || membership.status !== 'active') {
      throw new EventServiceError(
        403,
        'NOT_CLUB_MEMBER',
        'You must be an active member of this club.'
      )
    }
    if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') {
      throw new EventServiceError(
        403,
        'NOT_CLUB_ADMIN',
        'Only club owners or admins can create events.'
      )
    }
    return membership
  }

  /**
   * Ordering only means something inside one day. A two-day event that starts
   * at 18:00 on Friday and ends at 11:00 on Saturday is ordered correctly even
   * though 11:00 < 18:00, so the comparison is skipped unless the dates match.
   * Mirrors chk_event_time_order in 028-event-time.
   *
   * Exception: a session that crosses midnight (e.g. 18:00 → 00:00 or 22:00 → 02:00)
   * is valid even with the same date — the organizer means "runs until after midnight"
   * but entered one date. We allow end times 00:00–02:59 when the start is in the
   * evening (17:00 or later).
   */
  function assertTimesOrdered(
    startDate: string | null | undefined,
    endDate: string | null | undefined,
    startTime: string | null | undefined,
    endTime: string | null | undefined
  ) {
    for (const value of [startTime, endTime]) {
      if (value != null && !TIME_PATTERN.test(value)) {
        throw new EventServiceError(
          400,
          'VALIDATION_ERROR',
          'Times must be given as HH:MM using a 24-hour clock.'
        )
      }
    }
    if (!startTime || !endTime) return
    if (!startDate || !endDate || startDate !== endDate) return

    // Zero-padded 24-hour strings compare correctly as strings.
    if (endTime > startTime) return

    // Allow midnight-crossing: evening start (17:00+) with early-morning end (00:00-02:59)
    const startHour = parseInt(startTime.slice(0, 2), 10)
    const endHour = parseInt(endTime.slice(0, 2), 10)
    const isMidnightCrossing = startHour >= 17 && endHour <= 2

    if (!isMidnightCrossing) {
      throw new EventServiceError(
        400,
        'VALIDATION_ERROR',
        'The end time must be after the start time on a single-day event.'
      )
    }
  }

  /**
   * The game rules an organiser set, checked before Postgres sees them.
   *
   * events_game_rules_valid (054) enforces the same bounds, but a check
   * constraint answers with a 500 and a constraint name. An organiser typing
   * 210 instead of 21 into "points to win" deserves the sentence, not the
   * stack trace. Bounds are deliberately identical to the ones 046 put on
   * tournament_categories, so a game cannot be legal in a draw and illegal in
   * open play.
   */
  function assertGameRules(input: { target_points?: number; games_default?: number }) {
    const target = input.target_points
    if (target !== undefined) {
      if (!Number.isInteger(target) || target < 1 || target > 99) {
        throw new EventServiceError(
          400,
          'VALIDATION_ERROR',
          'Points to win must be a whole number between 1 and 99.'
        )
      }
    }

    const games = input.games_default
    if (games !== undefined) {
      // Odd, because a best-of has to be decidable: best of 2 can end 1-1.
      if (!Number.isInteger(games) || games < 1 || games > 9 || games % 2 === 0) {
        throw new EventServiceError(
          400,
          'VALIDATION_ERROR',
          'Games per match must be an odd number between 1 and 9 — a best-of has to be decidable.'
        )
      }
    }
  }

  /**
   * How many courts the session runs on.
   *
   * This used to be collected only behind the "Match Queue" toggle, so a
   * four-court session run without the queue stored null and materialised one
   * court at start (see event-court.service.openCourts, which floors null at
   * 1). It is a fact about the venue, not about the pairing mode, so the form
   * now always asks and the service always checks. 24 is well past any real
   * club and still stops a typed 400 from creating four hundred rows.
   */
  function assertCourtCount(input: { queue_courts?: number }) {
    const courts = input.queue_courts
    if (courts === undefined) return
    if (!Number.isInteger(courts) || courts < 1 || courts > 24) {
      throw new EventServiceError(
        400,
        'VALIDATION_ERROR',
        'Number of courts must be a whole number between 1 and 24.'
      )
    }
  }

  const RANKED_EVENT_TYPES = ['open_ranked', 'club_ranked', 'tournament']
  const OPEN_PLAY_EVENT_TYPES = ['open_casual', 'open_ranked', 'club_casual', 'club_ranked']

  /**
   * Open play sessions must be single-day events.
   *
   * A tournament or coaching session may span multiple days; an open play session
   * happens on one evening. The UI enforces this by hiding the end date field,
   * but the server validates it in case of API calls.
   */
  function assertOpenPlaySingleDay(
    eventType: string,
    startDate: string | undefined,
    endDate: string | undefined
  ) {
    if (!OPEN_PLAY_EVENT_TYPES.includes(eventType)) return
    if (!startDate || !endDate) return

    if (startDate !== endDate) {
      throw new EventServiceError(
        400,
        'VALIDATION_ERROR',
        'Open play sessions must be single-day events. Choose the same date for start and end.'
      )
    }
  }

  /**
   * Ranked events require either a verified club or a subscription that allows them.
   *
   * Verified clubs bypass this check entirely — they have always been able to
   * create any event type. The subscription check is for clubs that are not
   * verified but have paid for a plan that includes ranked events.
   */
  async function assertCanCreateRankedIfNeeded(clubId: string, eventType: string) {
    if (!RANKED_EVENT_TYPES.includes(eventType)) return

    if (!clubs) return

    const club = await clubs.findById(clubId)
    if (!club) return

    if (club.verification_status === 'verified') return

    const allowance = entitlements
      ? await entitlements.resolve(clubId)
      : unwiredEntitlements()

    if (!allowance.can_create_ranked_events) {
      throw new EventServiceError(
        403,
        'RANKED_NOT_ALLOWED',
        'Only verified clubs or those with a qualifying subscription can create ranked events. ' +
          'Upgrade your club subscription or apply for verification.'
      )
    }
  }

  /**
   * Event type must be in the plan's allowed_event_types list.
   *
   * null means all types allowed. Verified clubs bypass this check entirely.
   */
  async function assertEventTypeAllowed(clubId: string, eventType: string) {
    if (!clubs) return

    const club = await clubs.findById(clubId)
    if (!club) return

    if (club.verification_status === 'verified') return

    const allowance = entitlements
      ? await entitlements.resolve(clubId)
      : unwiredEntitlements()

    if (allowance.allowed_event_types === null) return

    if (!allowance.allowed_event_types.includes(eventType)) {
      const typeLabel = eventType.replace(/_/g, ' ')
      throw new EventServiceError(
        403,
        'EVENT_TYPE_NOT_ALLOWED',
        `Your subscription does not include ${typeLabel} events. ` +
          'Upgrade your club subscription to unlock this event type.'
      )
    }
  }

  /**
   * A tournament event has exactly one tournament, created with the event.
   *
   * The middle level used to be built by hand through an "Add Tournament"
   * screen, which is what made an event look like a folder of tournaments that
   * were themselves folders of categories. Categories are the thing players
   * actually enter, so the tournament is now an implementation detail the
   * organiser never has to think about.
   *
   * Idempotent by the existing-rows check, which also repairs an event that
   * somehow has none. Never creates a second one.
   */
  async function ensureTournament(
    event: EventRecord,
    shape: Pick<CreateEventInput, 'tournament_format' | 'tournament_match_type'> = {}
  ) {
    if (event.event_type !== 'tournament') return

    const existing = await tournaments.findByEventId(event.id)
    if (existing.length) return

    await tournaments.create({
      event_id: event.id,
      name: event.name,
      // Defaults rather than a hard requirement: an event created through an
      // older client, or switched to a tournament after the fact, still gets a
      // usable draw. match_type is NOT NULL in the schema and decides whether
      // registration demands a partner, so it must never be left to chance.
      format: shape.tournament_format ?? 'single_elimination',
      match_type: shape.tournament_match_type ?? 'doubles',
      min_rating: null,
      max_rating: null,
      max_participants: event.max_participants ?? null
    })
  }

  return {
    async createEvent(playerId, input) {
      await assertClubAdmin(playerId, input.club_id)
      // Every event is created as a draft, so this is the draft allowance.
      await assertWithinClubLimits(input.club_id, 'draft', input.event_type)
      await assertEventTypeAllowed(input.club_id, input.event_type)
      await assertCanCreateRankedIfNeeded(input.club_id, input.event_type)

      // Default registration_closes to start_date with time set to start of day
      if (!input.registration_closes && input.start_date) {
        input.registration_closes = `${input.start_date}T00:00:00.000Z`
      }

      // Validate registration_closes is not after start_date
      if (input.registration_closes && input.start_date) {
        const closesAt = new Date(input.registration_closes)
        const startsAt = new Date(input.start_date)
        if (closesAt > startsAt) {
          throw new EventServiceError(
            400,
            'VALIDATION_ERROR',
            'Registration close date cannot be after the event start date.'
          )
        }
      }

      assertTimesOrdered(input.start_date, input.end_date, input.start_time, input.end_time)
      assertGameRules(input)
      assertCourtCount(input)
      assertOpenPlaySingleDay(input.event_type, input.start_date, input.end_date)

      const event = await events.create(input, playerId)
      await ensureTournament(event, input)
      return toEventDto(event)
    },

    async getEvent(eventId) {
      const event = await events.findById(eventId)
      return event ? toEventDto(event) : null
    },

    async updateEvent(playerId, eventId, input) {
      const existingEvent = await assertEventOrganizer(playerId, eventId)

      // Validate registration_closes is not after start_date
      const closesAt = input.registration_closes ?? existingEvent.registration_closes
      const startsAt = input.start_date ?? existingEvent.start_date
      if (closesAt && startsAt) {
        if (new Date(closesAt) > new Date(startsAt)) {
          throw new EventServiceError(
            400,
            'VALIDATION_ERROR',
            'Registration close date cannot be after the event start date.'
          )
        }
      }

      // queue_mode became organiser-editable when the pairing control moved to
      // the Queue tab. Checked here rather than left to the column constraint,
      // so a bad value is a 400 saying which values are allowed instead of a
      // 500 from Postgres.
      if (input.queue_mode !== undefined && !QUEUE_MODES.includes(input.queue_mode)) {
        throw new EventServiceError(
          400,
          'VALIDATION_ERROR',
          `queue_mode must be one of: ${QUEUE_MODES.join(', ')}.`
        )
      }

      assertTimesOrdered(
        input.start_date ?? existingEvent.start_date,
        input.end_date ?? existingEvent.end_date,
        input.start_time !== undefined ? input.start_time : existingEvent.start_time,
        input.end_time !== undefined ? input.end_time : existingEvent.end_time
      )

      assertGameRules(input)
      assertCourtCount(input)

      const event = await events.update(eventId, input)
      // Covers an organiser switching an existing event over to a tournament
      // after it was created; a no-op for every other type and for an event
      // that already has one. Takes the defaults — format and match type are
      // not editable through this path.
      await ensureTournament(event)
      return toEventDto(event)
    },

    async publishEvent(playerId, eventId) {
      const event = await assertEventOrganizer(playerId, eventId)
      if (event.status !== 'draft') {
        throw new EventServiceError(
          409,
          'INVALID_EVENT_STATE',
          `Cannot publish an event that is already '${event.status}'.`
        )
      }
      // Publishing is what puts it in front of players, so this is where the
      // live-event allowance bites — not at creation, where it would stop a
      // club drafting next month's weekend while this month's is running.
      if (event.club_id) {
        await assertWithinClubLimits(event.club_id, 'publish', event.event_type)
      }

      const updated = await events.updateStatus(eventId, 'published')
      return toEventDto(updated)
    },

    async startEvent(playerId, eventId) {
      const event = await assertEventOrganizer(playerId, eventId)
      if (event.status === 'active') {
        throw new EventServiceError(409, 'ALREADY_ACTIVE', 'This event is already running.')
      }
      if (event.status !== 'published') {
        throw new EventServiceError(
          409,
          'INVALID_EVENT_STATE',
          `Only a published event can be started - this one is '${event.status}'.`
        )
      }

      // No date check on purpose. Sessions start late, run over, and are
      // occasionally opened early to let people warm up; refusing to start an
      // event because the clock says 6:59 would be the app arguing with the
      // person standing on the court.
      const updated = await events.updateStatus(eventId, 'active')
      return toEventDto(updated)
    },

    async completeEvent(playerId, eventId) {
      const event = await assertEventOrganizer(playerId, eventId)
      if (event.status !== 'active') {
        throw new EventServiceError(
          409,
          'INVALID_EVENT_STATE',
          `Only a running event can be completed - this one is '${event.status}'.`
        )
      }
      const updated = await events.updateStatus(eventId, 'completed')
      return toEventDto(updated)
    },

    async deleteDraftEvent(playerId, eventId) {
      const event = await assertEventOrganizer(playerId, eventId, { creatorOnly: true })

      // Only drafts. A published event may already have people planning around
      // it, so withdrawing it is `cancelEvent` — which preserves the record —
      // not deletion.
      if (event.status !== 'draft') {
        throw new EventServiceError(
          409,
          'INVALID_EVENT_STATE',
          `Only draft events can be deleted. Cancel this event instead — it is '${event.status}'.`
        )
      }

      /**
       * A draft with children is cleaned up, not refused.
       *
       * This used to throw EVENT_NOT_EMPTY the moment anything was attached,
       * which in practice meant a club that had set up categories on a draft
       * could never delete it — and with the one-draft limit above, could never
       * create another either. The two rules together would have been a trap.
       *
       * Safe because a draft is not playable: `register` requires the event to
       * be published or active, so no rated match can exist behind one. Nothing
       * here touches `matches`, which stay as the record of things that
       * happened.
       *
       * The one thing this must keep pace with is new tables hanging off an
       * event: every FK in this schema is RESTRICT, so a child the repository
       * does not know to delete turns this into a 500.
       */
      const blocking = await events.countBlockingChildren(eventId)
      if (blocking.matches > 0) {
        throw new EventServiceError(
          409,
          'EVENT_HAS_MATCHES',
          'This draft has matches attached, which are a record of play. Cancel it instead of deleting it.'
        )
      }

      await events.deleteWithChildren(eventId)
    },

    async cancelEvent(playerId, eventId) {
      const event = await assertEventOrganizer(playerId, eventId)
      if (event.status === 'cancelled' || event.status === 'completed') {
        throw new EventServiceError(
          409,
          'INVALID_EVENT_STATE',
          `Cannot cancel an event that is already '${event.status}'.`
        )
      }
      const updated = await events.updateStatus(eventId, 'cancelled')
      return toEventDto(updated)
    },

    async searchEvents(query) {
      const records = await events.search(query)
      let dtos = records.map(toEventDto)

      /**
       * Who is hosting, resolved once for the whole page.
       *
       * A card carried the venue and the town but never the club, so a player
       * browsing open events could not tell whose session it was. One `in`
       * query for the distinct clubs rather than one per card; a club the
       * caller cannot read under RLS simply stays unnamed.
       */
      if (clubs && dtos.length) {
        const hosts = await clubs.findByIds(dtos.map((e) => e.club_id).filter(Boolean))
        const byId = new Map(hosts.map((c) => [c.id, c]))
        dtos = dtos.map((e) => {
          const host = byId.get(e.club_id)
          return host
            ? {
                ...e,
                club_name: host.name,
                club_verified: host.verification_status === 'verified'
              }
            : e
        })
      }

      if (!eventRegistrations || !dtos.length) {
        return dtos
      }

      const eventIds = dtos.map((e) => e.id)

      // Capacity is only meaningful for events that declare a limit, so the
      // count is skipped entirely when none of them do.
      const counts = dtos.some((e) => e.max_participants !== null)
        ? await eventRegistrations.countByEvents(eventIds, SLOT_OCCUPYING_STATUSES)
        : null

      // "You are in this one" is per-caller, so it is only asked for when the
      // request identified one. For everyone else the field stays undefined
      // rather than false.
      const mine = query.viewer_player_id
        ? await eventRegistrations.findRegisteredEventIds(
            query.viewer_player_id,
            eventIds,
            SLOT_OCCUPYING_STATUSES
          )
        : null

      if (!counts && !mine) {
        return dtos
      }

      return dtos.map((e) => ({
        ...e,
        ...(counts ? { registered_count: counts.get(e.id) ?? 0 } : {}),
        ...(mine ? { viewer_registered: mine.has(e.id) } : {})
      }))
    },

    async autoCloseStaleOpenPlay(input) {
      const now = input?.now ?? new Date()
      const graceHours = input?.graceHours ?? OPEN_PLAY_CLOSE_GRACE_HOURS
      const limit = input?.limit ?? 100

      /**
       * A session cannot be stale before its own end date plus the grace
       * period, so the query only has to reach back as far as that date. The
       * exact deadline depends on `end_time` and is applied below, per row.
       */
      const cutoffDate = new Date(now.getTime() - graceHours * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)

      const candidates = await events.findOpenPlayAwaitingClose(cutoffDate, limit)
      const closed: EventDto[] = []

      for (const candidate of candidates) {
        if (staleOpenPlayDeadline(candidate, graceHours) > now) continue
        // One at a time rather than a bulk update: a row that fails (a race
        // with the organiser pressing Close, say) must not stop the rest.
        try {
          const updated = await events.update(candidate.id, { closed_at: now.toISOString() })
          closed.push(toEventDto(updated))
        } catch (err) {
          console.error(`[events] could not auto-close ${candidate.id}:`, err)
        }
      }

      return closed
    },

    async createTournament(playerId, input) {
      await assertEventOrganizer(playerId, input.event_id)
      const tournament = await tournaments.create(input)
      return toTournamentDto(tournament)
    },

    async getTournaments(eventId) {
      const records = await tournaments.findByEventId(eventId)
      return records.map(toTournamentDto)
    },

    async getPrimaryTournament(eventId) {
      const records = await tournaments.findByEventId(eventId)
      return records.length ? toTournamentDto(records[0]) : null
    },

    async updateTournament(playerId, tournamentId, input) {
      const tournament = await tournaments.findById(tournamentId)
      if (!tournament) {
        throw new EventServiceError(404, 'NOT_FOUND', 'Tournament not found.')
      }
      await assertEventOrganizer(playerId, tournament.event_id)
      const updated = await tournaments.update(tournamentId, input)
      return toTournamentDto(updated)
    },

    async register(playerId, tournamentId, partnerPlayerId, categoryId) {
      const tournament = await tournaments.findById(tournamentId)
      if (!tournament) {
        throw new EventServiceError(404, 'NOT_FOUND', 'Tournament not found.')
      }

      if (tournament.status !== 'open' && tournament.status !== 'draft') {
        throw new EventServiceError(
          409,
          'REGISTRATION_CLOSED',
          'Registration for this tournament is not open.'
        )
      }

      // Check event-level registration deadline
      const event = await events.findById(tournament.event_id)
      if (event?.registration_closes) {
        const closesAt = new Date(event.registration_closes)
        if (new Date() > closesAt) {
          throw new EventServiceError(
            409,
            'REGISTRATION_CLOSED',
            'Registration for this event has closed.'
          )
        }
      }

      // Follows the CATEGORY, not the tournament: one weekend can run a
      // singles draw and a doubles draw, and demanding a partner for the
      // singles one would make it impossible to enter.
      const category = categoryId && categories ? await categories.findById(categoryId) : null
      const matchType = resolveMatchType(category, tournament.match_type)

      // The category's own status, which nothing enforced.
      //
      // TournamentCategoryStatus has always had 'closed' and 'completed', and
      // the card's label was DERIVED from the bracket rather than read from the
      // column — so an organiser could close a category, watch the UI say so,
      // and still have entries land through a direct call or a stale page.
      if (category && category.status !== 'open') {
        throw new EventServiceError(
          409,
          'CATEGORY_CLOSED',
          category.status === 'completed'
            ? 'This category has finished.'
            : 'This category is closed for registration.'
        )
      }

      if (matchType === 'doubles' && !partnerPlayerId) {
        throw new EventServiceError(
          400,
          'PARTNER_REQUIRED',
          'A partner is required to enter a doubles category.'
        )
      }

      if (partnerPlayerId && partnerPlayerId === playerId) {
        throw new EventServiceError(400, 'SELF_PARTNER', 'You cannot enter as your own partner.')
      }

      // A partner has to have agreed to be one. Without this any player id at
      // all was accepted, so a person could be entered into a tournament — and
      // billed for it — by a stranger.
      if (partnerPlayerId && partnerships) {
        const partnership = await partnerships.findPartnershipBetween(playerId, partnerPlayerId)
        if (!partnership) {
          throw new EventServiceError(
            400,
            'NOT_A_PARTNER',
            'You can only enter with a confirmed duo partner. Send them a partner request from Community first.'
          )
        }
      }

      await assertNeitherIsAlreadyInCategory(
        tournamentId,
        categoryId ?? null,
        playerId,
        partnerPlayerId
      )

      await assertBothMeetTheBand(category, matchType, playerId, partnerPlayerId)

      // The CATEGORY's limit, which nothing enforced: the UI disabled its own
      // button on a full category and the API happily accepted the entry anyway,
      // so anyone posting directly — or racing the page — got in regardless.
      if (category?.max_participants) {
        const entrants = await registrations.findCategoryEntrants(tournamentId, categoryId ?? null)
        // Entries, not people: a doubles pair is one slot in a draw of eight.
        const taken = new Set(entrants.map((e) => e.registration_id)).size
        if (taken >= category.max_participants) {
          throw new EventServiceError(
            409,
            'CATEGORY_FULL',
            'This category has reached its maximum number of entries.'
          )
        }
      }

      if (tournament.max_participants) {
        const count = await registrations.countByTournament(tournamentId)
        if (count >= tournament.max_participants) {
          throw new EventServiceError(
            409,
            'TOURNAMENT_FULL',
            'This tournament has reached its maximum participants.'
          )
        }
      }

      try {
        const registration = await registrations.create(
          tournamentId,
          playerId,
          partnerPlayerId,
          categoryId ?? null
        )
        return toTournamentRegistrationDto(registration)
      } catch (err) {
        // The DB trigger is the backstop for the invariant above, and it fires
        // when two entries naming the same free partner race each other past
        // the pre-check. Mapped to the same 409 so a race and an ordinary
        // duplicate read identically to the caller.
        if (isOneEntryPerCategoryViolation(err)) {
          throw new EventServiceError(
            409,
            'ALREADY_IN_CATEGORY',
            'Someone on this entry was just registered in this category by another request.'
          )
        }
        throw err
      }
    },

    async getRegistrations(tournamentId) {
      const records = await registrations.findByTournamentId(tournamentId)
      return records.map(toTournamentRegistrationDto)
    },

    async getRegistrationsWithPlayers(tournamentId) {
      const records = await registrations.findByTournamentIdWithPlayers(tournamentId)
      if (!records.length) return []

      const tournament = await tournaments.findById(tournamentId)
      const fallbackType = tournament?.match_type ?? 'doubles'

      // Which rating each entry is judged by follows its own category, so one
      // read of the categories covers a list that may span several draws. Kept
      // to a single fetch rather than one per row.
      const byCategory = new Map<string, { match_type: TournamentMatchType | null }>()
      if (categories) {
        for (const category of await categories.findByTournamentId(tournamentId)) {
          byCategory.set(category.id, category)
        }
      }

      return records.map((record) => {
        const matchType = resolveMatchType(
          record.category_id ? (byCategory.get(record.category_id) ?? null) : null,
          fallbackType
        )
        return {
          ...toTournamentRegistrationDto(record),
          display_name: record.display_name,
          rating: resolveEntrantRating(record, matchType),
          partner_display_name: record.partner_display_name,
          partner_rating: record.partner_display_name
            ? resolveEntrantRating(
                {
                  singles_rating: record.partner_singles_rating ?? null,
                  doubles_rating: record.partner_doubles_rating ?? null
                },
                matchType
              )
            : null,
          avatar_path: record.avatar_path
        }
      })
    },

    async withdrawRegistration(playerId, registrationId) {
      const registration = await registrations.findById(registrationId)
      if (!registration) {
        throw new EventServiceError(404, 'NOT_FOUND', 'Registration not found.')
      }
      if (registration.player_id !== playerId && registration.partner_player_id !== playerId) {
        throw new EventServiceError(
          403,
          'FORBIDDEN',
          'You can only withdraw your own registration.'
        )
      }
      if (registration.status === 'withdrawn') {
        throw new EventServiceError(
          409,
          'ALREADY_WITHDRAWN',
          'This registration is already withdrawn.'
        )
      }
      const updated = await registrations.updateStatus(registrationId, 'withdrawn')
      return toTournamentRegistrationDto(updated)
    },

    async updateRegistrationStatus(playerId, registrationId, status) {
      const registration = await registrations.findById(registrationId)
      if (!registration) {
        throw new EventServiceError(404, 'NOT_FOUND', 'Registration not found.')
      }

      const tournament = await tournaments.findById(registration.tournament_id)
      if (!tournament) {
        throw new EventServiceError(404, 'NOT_FOUND', 'Tournament not found.')
      }

      await assertCanReviewRegistrations(playerId, tournament.event_id)

      if (registration.status === 'withdrawn') {
        throw new EventServiceError(409, 'INVALID_STATE', 'Cannot update a withdrawn registration.')
      }

      const updated = await registrations.updateStatus(registrationId, status)
      return toTournamentRegistrationDto(updated)
    }
  }
}
