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
  UpdateEventInput
} from '../dto/event.dto'
import { SLOT_OCCUPYING_STATUSES, toEventDto } from '../dto/event.dto'
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
  getRegistrationsWithPlayers(tournamentId: string): Promise<TournamentRegistrationWithPlayerDto[]>
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
  clubs?: ClubRepository
): EventService {
  async function assertEventOrganizer(playerId: string, eventId: string) {
    const event = await events.findById(eventId)
    if (!event) {
      throw new EventServiceError(404, 'NOT_FOUND', 'Event not found.')
    }
    if (event.created_by_player_id !== playerId) {
      throw new EventServiceError(
        403,
        'FORBIDDEN',
        'Only the event organizer can modify this event.'
      )
    }
    return event
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
   * What an unverified club may have running at once.
   *
   * Nothing limited this before, so a club could accumulate drafts and live
   * events without bound — and verification, which has a full approval flow
   * already built, bought nothing. These are the limits that make the tier
   * mean something.
   *
   * A verified club is unlimited. An unverified one gets one live tournament,
   * one live open play, and one draft: enough to run a real weekend and plan
   * the next, not enough to use the platform as free listing space.
   *
   * Cancelled and completed events do not count. An event that has had its
   * weekend must not block the next one, and a cancelled one never happened.
   *
   * Degrades to no limit when the club repository was not supplied, matching
   * how `memberships` and `categories` behave — a caller that did not wire it
   * keeps the behaviour it had rather than failing closed.
   */
  async function assertWithinClubLimits(
    clubId: string,
    intent: 'draft' | 'publish',
    eventType: string
  ) {
    if (!clubs) return

    const club = await clubs.findById(clubId)
    if (!club || club.verification_status === 'verified') return

    const counts = await events.countByClubForLimits(clubId)

    if (intent === 'draft') {
      if (counts.drafts >= 1) {
        throw new EventServiceError(
          409,
          'CLUB_DRAFT_LIMIT',
          'An unverified club can keep one draft at a time. Publish or delete the one you have, or get the club verified for unlimited drafts.'
        )
      }
      return
    }

    const isTournament = eventType === 'tournament'
    const live = isTournament ? counts.liveTournaments : counts.liveOpenPlay
    if (live >= 1) {
      throw new EventServiceError(
        409,
        'CLUB_EVENT_LIMIT',
        isTournament
          ? 'An unverified club can run one tournament at a time. Finish or cancel the current one, or get the club verified.'
          : 'An unverified club can run one open play event at a time. Finish or cancel the current one, or get the club verified.'
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
    if (endTime <= startTime) {
      throw new EventServiceError(
        400,
        'VALIDATION_ERROR',
        'The end time must be after the start time on a single-day event.'
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

      assertTimesOrdered(
        input.start_date ?? existingEvent.start_date,
        input.end_date ?? existingEvent.end_date,
        input.start_time !== undefined ? input.start_time : existingEvent.start_time,
        input.end_time !== undefined ? input.end_time : existingEvent.end_time
      )

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
      const event = await assertEventOrganizer(playerId, eventId)

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
      const dtos = records.map(toEventDto)

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

      return records.map((record) => ({
        ...toTournamentRegistrationDto(record),
        display_name: record.display_name,
        rating: resolveEntrantRating(
          record,
          resolveMatchType(
            record.category_id ? (byCategory.get(record.category_id) ?? null) : null,
            fallbackType
          )
        ),
        partner_display_name: record.partner_display_name
      }))
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
