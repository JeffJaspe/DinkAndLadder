import type { EventQueueRepository } from '../repositories/event-queue.repository'
import type { EventRegistrationRepository } from '../repositories/event-registration.repository'
import type { EventRepository } from '../repositories/event.repository'
import type { EventQueueRecord, QueueMode } from '../dto/event.dto'

/**
 * Partner/opponent history for smart pairing in Mix & Match mode.
 * Maps player_id pairs to count of times they've partnered or faced each other.
 */
interface PairingHistory {
  partnerCounts: Map<string, number>
  opponentCounts: Map<string, number>
}

/** Stable key for a pair of players, so A|B and B|A count as the same. */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/** Cost weights - partner repeats matter more than opponent repeats. */
const PARTNER_REPEAT_COST = 10
const OPPONENT_REPEAT_COST = 1

export class EventQueueServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export interface EventQueueService {
  listQueue(eventId: string): Promise<EventQueueRecord[]>
  /**
   * Puts a player in the queue.
   *
   * `requestedMatchType` is a cross-check, not a choice. An event declares one
   * `match_format` and every game in the session is played to it, so the format
   * of a queue entry is a fact about the event rather than a preference of the
   * person joining. It used to be taken straight from the request body and
   * never compared to anything, which meant a player could enter a doubles
   * session as a singles entry — and `matchNextPair` only ever pairs two
   * entries of the SAME type, so one stray entry at the head of the queue
   * stopped the whole session from being paired.
   *
   * Absent means "use the session's format", which is what a current client
   * sends. A disagreeing value is a 400 rather than a silent correction: a
   * client that thinks the session is singles is out of date, and quietly
   * enqueueing them as doubles would be a different bug.
   */
  joinQueue(
    eventId: string,
    playerId: string,
    requestedMatchType: 'singles' | 'doubles' | null | undefined,
    partnerId?: string | null
  ): Promise<EventQueueRecord>
  leaveQueue(eventId: string, playerId: string): Promise<void>
  matchEntries(
    actingPlayerId: string,
    eventId: string,
    queueId1: string,
    queueId2: string,
    courtNumber: number
  ): Promise<{ first: EventQueueRecord; second: EventQueueRecord }>
  /**
   * Pairs the two longest-waiting entries of the same match type.
   *
   * The selection happens here rather than in the browser on purpose: two
   * organisers tapping "Match next" at the same moment would otherwise both
   * compute the same head of the queue from their own stale copy and send it as
   * an explicit pair. Reading the queue inside the request narrows that to the
   * ordinary write race, which the 'waiting' status check already loses safely.
   */
  matchNextPair(
    actingPlayerId: string,
    eventId: string,
    courtNumber: number,
    matchType?: 'singles' | 'doubles'
  ): Promise<{ first: EventQueueRecord; second: EventQueueRecord }>
  skipEntry(actingPlayerId: string, eventId: string, queueId: string): Promise<EventQueueRecord>
}

async function assertRegistered(
  registrations: EventRegistrationRepository,
  eventId: string,
  playerId: string
) {
  const registration = await registrations.findByEventAndPlayer(eventId, playerId)
  if (!registration || registration.status === 'withdrawn') {
    throw new EventQueueServiceError(
      403,
      'NOT_REGISTERED',
      'You must be registered to this event to use the queue.'
    )
  }
}

const STAFF_ROLES = ['OWNER', 'ADMIN', 'MODERATOR']

async function assertOrganizer(
  events: EventRepository,
  eventId: string,
  playerId: string,
  memberships?: { findByClubAndPlayer(clubId: string, playerId: string): Promise<{ role: string; status: string } | null> }
) {
  const event = await events.findById(eventId)
  if (!event) {
    throw new EventQueueServiceError(404, 'NOT_FOUND', 'Event not found.')
  }

  // Creator always allowed
  if (event.created_by_player_id === playerId) return event

  // Co-organizer allowed
  if (await events.isCoOrganizer?.(eventId, playerId)) return event

  // Club staff allowed (owner, admin, moderator)
  if (memberships && event.club_id) {
    const membership = await memberships.findByClubAndPlayer(event.club_id, playerId)
    if (membership && membership.status === 'active' && STAFF_ROLES.includes(membership.role)) {
      return event
    }
  }

  throw new EventQueueServiceError(
    403,
    'FORBIDDEN',
    'Only the organizer, a co-organiser or the hosting club\'s staff can manage the queue.'
  )
}

/**
 * Minimal match history interface for smart pairing.
 * Returns participants grouped by team for each match in the event.
 */
interface MatchHistoryForPairing {
  getEventMatchHistory(eventId: string): Promise<
    Array<{
      team1_players: string[]
      team2_players: string[]
    }>
  >
}

/**
 * Minimal player profile interface for rating-based pairing.
 */
interface PlayerRatingsForPairing {
  getRatings(playerIds: string[]): Promise<Map<string, number>>
}

export function createEventQueueService(
  queue: EventQueueRepository,
  registrations: EventRegistrationRepository,
  events: EventRepository,
  /**
   * Optional: when supplied, a doubles entry may only name a linked duo
   * partner (Community → Partners), not any registered player. The join
   * endpoint passes it; organiser paths that move existing entries do not
   * need it.
   */
  partnerships?: { findPartnershipBetween(a: string, b: string): Promise<unknown | null> },
  /**
   * Optional: when supplied, club staff (owner, admin, moderator) can manage
   * the queue alongside the event creator and co-organisers. Queue management
   * endpoints pass it; player-only actions like join/leave do not need it.
   */
  memberships?: { findByClubAndPlayer(clubId: string, playerId: string): Promise<{ role: string; status: string } | null> },
  /**
   * Optional: for Mix & Match mode, provides match history to avoid repeat pairings.
   */
  matchHistory?: MatchHistoryForPairing,
  /**
   * Optional: for rating_based mode, provides player ratings for skill-based pairing.
   */
  playerRatings?: PlayerRatingsForPairing
): EventQueueService {
  /**
   * Selects the best pair based on queue mode:
   * - first_come: FIFO - first two in line
   * - random (Mix & Match): Minimize partner/opponent repeats
   * - rating_based: Pair players with closest ratings
   */
  async function selectPairByMode(
    waiting: EventQueueRecord[],
    queueMode: QueueMode,
    eventId: string,
    isDoubles: boolean
  ): Promise<{ first: EventQueueRecord; second: EventQueueRecord }> {
    // First come, first served - simple FIFO
    if (queueMode === 'first_come') {
      return { first: waiting[0], second: waiting[1] }
    }

    // Rating based - pair players with closest ratings
    if (queueMode === 'rating_based') {
      return selectByRating(waiting, isDoubles)
    }

    // Mix & Match (random) - minimize partner/opponent repeats
    return selectByMixMatch(waiting, eventId, isDoubles)
  }

  /**
   * Rating-based pairing: pairs players with closest skill levels.
   * For doubles, considers the combined/average rating of each entry's players.
   */
  async function selectByRating(
    waiting: EventQueueRecord[],
    isDoubles: boolean
  ): Promise<{ first: EventQueueRecord; second: EventQueueRecord }> {
    if (!playerRatings) {
      // Fallback to FIFO if no ratings available
      return { first: waiting[0], second: waiting[1] }
    }

    // Collect all player IDs
    const playerIds = waiting.flatMap((e) =>
      e.partner_id ? [e.player_id, e.partner_id] : [e.player_id]
    )
    const ratings = await playerRatings.getRatings(playerIds)

    // Calculate effective rating for each entry (average for doubles)
    const entryRatings = waiting.map((entry) => {
      const r1 = ratings.get(entry.player_id) ?? 3.0
      const r2 = entry.partner_id ? (ratings.get(entry.partner_id) ?? 3.0) : r1
      return { entry, rating: (r1 + r2) / 2 }
    })

    // Sort by rating
    entryRatings.sort((a, b) => a.rating - b.rating)

    // Pair adjacent entries (closest ratings)
    // Take the first entry and find the one with closest rating
    const first = entryRatings[0]
    let bestMatch = entryRatings[1]
    let minDiff = Math.abs(first.rating - bestMatch.rating)

    for (let i = 2; i < entryRatings.length; i++) {
      const diff = Math.abs(first.rating - entryRatings[i].rating)
      if (diff < minDiff) {
        minDiff = diff
        bestMatch = entryRatings[i]
      }
    }

    return { first: first.entry, second: bestMatch.entry }
  }

  /**
   * Mix & Match pairing: minimizes partner and opponent repeats.
   * Uses the same cost function as the mixup scheduler.
   */
  async function selectByMixMatch(
    waiting: EventQueueRecord[],
    eventId: string,
    isDoubles: boolean
  ): Promise<{ first: EventQueueRecord; second: EventQueueRecord }> {
    // Get match history to track who has partnered/faced whom
    const history = await buildPairingHistory(eventId)

    // For singles: each entry is one player, find best opponent
    if (!isDoubles) {
      return selectSinglesMixMatch(waiting, history)
    }

    // For doubles: each entry may have a partner already (non-random modes)
    // or be solo (random mode pairs them). Find best opponent pair.
    return selectDoublesMixMatch(waiting, history)
  }

  /**
   * Build partner/opponent history from completed matches in this event.
   */
  async function buildPairingHistory(eventId: string): Promise<PairingHistory> {
    const partnerCounts = new Map<string, number>()
    const opponentCounts = new Map<string, number>()

    if (!matchHistory) {
      return { partnerCounts, opponentCounts }
    }

    const matches = await matchHistory.getEventMatchHistory(eventId)
    for (const match of matches) {
      // Count partner pairings within each team
      for (const team of [match.team1_players, match.team2_players]) {
        for (let i = 0; i < team.length; i++) {
          for (let j = i + 1; j < team.length; j++) {
            const key = pairKey(team[i], team[j])
            partnerCounts.set(key, (partnerCounts.get(key) ?? 0) + 1)
          }
        }
      }
      // Count opponent pairings between teams
      for (const p1 of match.team1_players) {
        for (const p2 of match.team2_players) {
          const key = pairKey(p1, p2)
          opponentCounts.set(key, (opponentCounts.get(key) ?? 0) + 1)
        }
      }
    }

    return { partnerCounts, opponentCounts }
  }

  /**
   * Singles Mix & Match: find the two players who have faced each other least.
   */
  function selectSinglesMixMatch(
    waiting: EventQueueRecord[],
    history: PairingHistory
  ): { first: EventQueueRecord; second: EventQueueRecord } {
    const first = waiting[0]
    let bestSecond = waiting[1]
    let bestCost = history.opponentCounts.get(pairKey(first.player_id, bestSecond.player_id)) ?? 0

    for (let i = 2; i < waiting.length; i++) {
      const cost = history.opponentCounts.get(pairKey(first.player_id, waiting[i].player_id)) ?? 0
      if (cost < bestCost) {
        bestCost = cost
        bestSecond = waiting[i]
      }
    }

    return { first, second: bestSecond }
  }

  /**
   * Doubles Mix & Match: find two entries that minimize repeat partners AND opponents.
   * Each entry may be a solo player (Mix & Match pairs them) or a fixed pair.
   */
  function selectDoublesMixMatch(
    waiting: EventQueueRecord[],
    history: PairingHistory
  ): { first: EventQueueRecord; second: EventQueueRecord } {
    const first = waiting[0]
    let bestSecond = waiting[1]
    let bestCost = calculateMatchCost(first, bestSecond, history)

    for (let i = 2; i < waiting.length; i++) {
      const cost = calculateMatchCost(first, waiting[i], history)
      if (cost < bestCost) {
        bestCost = cost
        bestSecond = waiting[i]
      }
    }

    return { first, second: bestSecond }
  }

  /**
   * Calculate the cost of matching two entries.
   * Lower cost = better match (fewer repeats).
   */
  function calculateMatchCost(
    entry1: EventQueueRecord,
    entry2: EventQueueRecord,
    history: PairingHistory
  ): number {
    const players1 = entry1.partner_id
      ? [entry1.player_id, entry1.partner_id]
      : [entry1.player_id]
    const players2 = entry2.partner_id
      ? [entry2.player_id, entry2.player_id]
      : [entry2.player_id]

    let cost = 0

    // In Mix & Match solo mode, the two entries might become PARTNERS on the same team
    // We need to check if they've partnered before
    if (!entry1.partner_id && !entry2.partner_id) {
      // Solo entries - they'll be paired AS partners, not opponents
      const partnerKey = pairKey(entry1.player_id, entry2.player_id)
      cost += (history.partnerCounts.get(partnerKey) ?? 0) * PARTNER_REPEAT_COST
    } else {
      // Fixed pairs - they'll be opponents
      for (const p1 of players1) {
        for (const p2 of players2) {
          const key = pairKey(p1, p2)
          cost += (history.opponentCounts.get(key) ?? 0) * OPPONENT_REPEAT_COST
        }
      }
    }

    return cost
  }

  // Named rather than returned inline so matchNextPair can delegate to
  // matchEntries without depending on `this`, which a destructured service loses.
  const service: EventQueueService = {
    async listQueue(eventId) {
      return queue.findByEvent(eventId)
    },

    async joinQueue(eventId, playerId, requestedMatchType, partnerId) {
      await assertRegistered(registrations, eventId, playerId)

      const existing = await queue.findByEventAndPlayer(eventId, playerId)
      if (existing) {
        throw new EventQueueServiceError(409, 'ALREADY_QUEUED', 'You are already in the queue.')
      }

      /**
       * Mix & Match pairs people itself, so asking for a partner contradicts
       * the mode: the scheduler's whole job there is to rotate partners and
       * opponents so nobody plays with the same person twice. Demanding one up
       * front made a solo drop-in — the normal way somebody joins an open play
       * session — impossible to enter.
       *
       * Every other mode still needs one. A first-come queue entry IS a side of
       * a court, so without a partner there is no side to queue, and inventing
       * one by pairing whoever is next is a scheduling rule nobody has decided.
       */
      const eventRecord = await events.findById(eventId)
      if (!eventRecord) {
        throw new EventQueueServiceError(404, 'NOT_FOUND', 'Event not found.')
      }
      const pairsAutomatically = eventRecord.queue_mode === 'random'

      /**
       * The session's format decides the entry's, full stop. Defaulted the same
       * way `toEventDto` defaults it, so an event created before 041 — which
       * predates the column — still resolves to the doubles it was played as.
       */
      const matchType = eventRecord.match_format ?? 'doubles'

      if (requestedMatchType != null && requestedMatchType !== matchType) {
        throw new EventQueueServiceError(
          409,
          'FORMAT_MISMATCH',
          `This session is ${matchType}. Reload the event and try again.`
        )
      }

      if (matchType === 'doubles' && !pairsAutomatically) {
        if (!partnerId) {
          throw new EventQueueServiceError(
            400,
            'VALIDATION_ERROR',
            'A partner is required to join the queue for doubles.'
          )
        }
      }

      if (matchType === 'doubles' && partnerId) {
        if (partnerId === playerId) {
          throw new EventQueueServiceError(
            400,
            'VALIDATION_ERROR',
            'You cannot partner with yourself.'
          )
        }
        await assertRegistered(registrations, eventId, partnerId)

        // Your partner for open play is your DUO partner — someone who has
        // agreed to play with you — not whoever else happens to be registered.
        // The picker used to offer the whole roster, which let a player queue
        // a stranger as their partner without that person knowing.
        if (partnerships && !(await partnerships.findPartnershipBetween(playerId, partnerId))) {
          throw new EventQueueServiceError(
            409,
            'NOT_DUO_PARTNER',
            'You can only queue with a linked duo partner. Link them in Community first.'
          )
        }
      }

      return queue.create({
        event_id: eventId,
        player_id: playerId,
        match_type: matchType,
        // Normalised to null rather than passed through: a Mix & Match doubles
        // entry has no partner, and `undefined` would omit the column from the
        // insert entirely instead of writing an explicit "nobody".
        partner_id: matchType === 'doubles' ? (partnerId ?? null) : null
      })
    },

    async leaveQueue(eventId, playerId) {
      const existing = await queue.findByEventAndPlayer(eventId, playerId)
      if (!existing) {
        throw new EventQueueServiceError(404, 'NOT_QUEUED', 'You are not in the queue.')
      }
      await queue.leave(existing.id)
    },

    async matchEntries(actingPlayerId, eventId, queueId1, queueId2, courtNumber) {
      await assertOrganizer(events, eventId, actingPlayerId, memberships)

      if (queueId1 === queueId2) {
        throw new EventQueueServiceError(
          400,
          'VALIDATION_ERROR',
          'Select two different queue entries.'
        )
      }

      const [first, second] = await Promise.all([
        queue.findById(queueId1),
        queue.findById(queueId2)
      ])
      if (!first || !second || first.event_id !== eventId || second.event_id !== eventId) {
        throw new EventQueueServiceError(404, 'NOT_FOUND', 'Queue entry not found for this event.')
      }
      if (first.status !== 'waiting' || second.status !== 'waiting') {
        throw new EventQueueServiceError(
          409,
          'INVALID_QUEUE_STATE',
          'Both queue entries must be waiting to be matched.'
        )
      }

      const active = await queue.findByEvent(eventId)
      const courtTaken = active.some(
        (entry) =>
          entry.court_number === courtNumber &&
          (entry.status === 'matched' || entry.status === 'playing')
      )
      if (courtTaken) {
        throw new EventQueueServiceError(
          409,
          'COURT_IN_USE',
          `Court ${courtNumber} is already in use.`
        )
      }

      const [updatedFirst, updatedSecond] = await Promise.all([
        queue.setMatched(first.id, courtNumber, second.id),
        queue.setMatched(second.id, courtNumber, first.id)
      ])

      if (!updatedFirst || !updatedSecond) {
        throw new Error('Queue entries disappeared immediately after being matched.')
      }
      return { first: updatedFirst, second: updatedSecond }
    },

    async matchNextPair(actingPlayerId, eventId, courtNumber, matchType) {
      const eventRecord = await assertOrganizer(events, eventId, actingPlayerId, memberships)

      const format = matchType ?? eventRecord.match_format ?? 'doubles'
      const waiting = await queue.findWaiting(eventId, format)

      if (waiting.length < 2) {
        throw new EventQueueServiceError(
          409,
          'INSUFFICIENT_QUEUE',
          waiting.length === 0
            ? 'Nobody is waiting in the queue.'
            : `Only one ${format} entry is waiting; two are needed for a match.`
        )
      }

      const queueMode = eventRecord.queue_mode ?? 'first_come'
      const { first, second } = await selectPairByMode(
        waiting,
        queueMode,
        eventId,
        format === 'doubles'
      )

      return service.matchEntries(actingPlayerId, eventId, first.id, second.id, courtNumber)
    },

    async skipEntry(actingPlayerId, eventId, queueId) {
      await assertOrganizer(events, eventId, actingPlayerId, memberships)

      const entry = await queue.findById(queueId)
      if (!entry || entry.event_id !== eventId) {
        throw new EventQueueServiceError(404, 'NOT_FOUND', 'Queue entry not found for this event.')
      }
      if (entry.status !== 'waiting') {
        throw new EventQueueServiceError(
          409,
          'INVALID_QUEUE_STATE',
          'Only a waiting queue entry can be skipped.'
        )
      }

      const updated = await queue.updateStatus(queueId, 'skipped')
      if (!updated) throw new Error('Queue entry disappeared immediately after being updated.')
      return updated
    }
  }

  return service
}
