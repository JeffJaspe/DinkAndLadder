import type { EventRepository } from '../repositories/event.repository'
import type {
  TournamentRegistrationRepository,
  TournamentRepository
} from '../repositories/tournament.repository'
import type { ClubMembershipRepository } from '../../club/repositories/club-membership.repository'
import type {
  CreateEventInput,
  EventDto,
  EventSearchQuery,
  UpdateEventInput
} from '../dto/event.dto'
import { SLOT_OCCUPYING_STATUSES, toEventDto } from '../dto/event.dto'
import type { EventRegistrationRepository } from '../repositories/event-registration.repository'
import type {
  CreateTournamentInput,
  TournamentDto,
  TournamentRegistrationDto,
  TournamentRegistrationWithPlayerDto,
  UpdateTournamentInput
} from '../dto/tournament.dto'
import { toTournamentDto, toTournamentRegistrationDto } from '../dto/tournament.dto'

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
  /** Draft-only, and only when nothing is attached. See the implementation. */
  deleteDraftEvent(playerId: string, eventId: string): Promise<void>
  cancelEvent(playerId: string, eventId: string): Promise<EventDto>
  searchEvents(query: EventSearchQuery): Promise<EventDto[]>

  createTournament(playerId: string, input: CreateTournamentInput): Promise<TournamentDto>
  getTournaments(eventId: string): Promise<TournamentDto[]>
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
  eventRegistrations?: EventRegistrationRepository
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

  return {
    async createEvent(playerId, input) {
      await assertClubAdmin(playerId, input.club_id)

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

      const event = await events.create(input, playerId)
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

      const event = await events.update(eventId, input)
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
      const updated = await events.updateStatus(eventId, 'published')
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

      // A draft cannot normally be registered for or played, so anything here
      // means the event is not really unused. Refuse rather than destroy it.
      const blocking = await events.countBlockingChildren(eventId)
      if (blocking.registrations > 0 || blocking.matches > 0 || blocking.queueEntries > 0) {
        throw new EventServiceError(
          409,
          'EVENT_NOT_EMPTY',
          'This event already has players or matches attached and cannot be deleted. Cancel it instead.'
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

      const existing = await registrations.findByTournamentAndPlayer(tournamentId, playerId)
      if (existing) {
        throw new EventServiceError(409, 'ALREADY_REGISTERED', 'You are already registered.')
      }

      if (tournament.match_type === 'doubles' && !partnerPlayerId) {
        throw new EventServiceError(
          400,
          'PARTNER_REQUIRED',
          'A partner is required for doubles tournaments.'
        )
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

      const registration = await registrations.create(
        tournamentId,
        playerId,
        partnerPlayerId,
        categoryId ?? null
      )
      return toTournamentRegistrationDto(registration)
    },

    async getRegistrations(tournamentId) {
      const records = await registrations.findByTournamentId(tournamentId)
      return records.map(toTournamentRegistrationDto)
    },

    async getRegistrationsWithPlayers(tournamentId) {
      const records = await registrations.findByTournamentIdWithPlayers(tournamentId)
      return records.map((record) => ({
        ...toTournamentRegistrationDto(record),
        display_name: record.display_name,
        rating: record.rating,
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
