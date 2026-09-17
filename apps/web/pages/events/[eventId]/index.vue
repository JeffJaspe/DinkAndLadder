<script setup lang="ts">
import type {
  EventDto,
  EventQueueDto,
  EventRegistrationDto,
  QueueMode
} from '~/server/domains/event/dto/event.dto'
import type { TournamentDto } from '~/server/domains/event/dto/tournament.dto'
import type { MatchListItemDto } from '~/server/domains/match/dto/match-join-row.dto'
import type { PartnerDto } from '~/server/domains/partnership/dto/partnership.dto'
import type { BoxScoreMatch } from '~/components/match/BoxScore.vue'
import type { PlayerProfileDto } from '~/server/domains/player/dto/player-profile.dto'
import type { EventCoOrganizerDto } from '~/server/domains/event/dto/event-co-organizer.dto'
import { apiErrorMessage } from '~/utils/api-error-message'
import { limitUpsell, type LimitUpsell } from '~/utils/limit-upsell'
import { championOf, stageLabels } from '~/utils/bracket-rounds'
import { rulesForEvent, rulesForRound } from '~/utils/game-rules'
import type { BracketDto, BracketMatchDto } from '~/server/domains/event/dto/bracket.dto'
import type { TournamentCategoryDto } from '~/server/domains/event/dto/tournament-category.dto'
import type { PlatformFeeRule } from '~/utils/convenience-fee'
import type { FeeWaiver } from '~/server/domains/event/services/registration-fee'
import type { MixupSchedule } from '~/server/domains/event/services/mixup-scheduler'

interface TournamentsResponse {
  tournaments: TournamentDto[]
}

const route = useRoute()
const eventId = route.params.eventId as string
const user = useSupabaseUser()
const { isClubMode } = useAccountMode()

/**
 * Players, not Info.
 *
 * Info opened by default while carrying almost nothing — it rendered only a
 * Tournaments card, a Record Match link or a queue blurb, each behind its own
 * condition, so a plain published event opened on a blank panel. Who is playing
 * is what people come to a public event page to see.
 */
type EventTab = 'info' | 'matches' | 'players' | 'rankings' | 'queue'

/**
 * Opens on the live board rather than the roster.
 *
 * "What is happening on court" is the question this page is opened to answer
 * during a session, and it was previously two clicks away behind Players.
 */
const activeTab = ref<EventTab>('matches')

interface EventRankingEntry {
  rank: number
  player_id: string
  display_name: string
  matches_played: number
  wins: number
  losses: number
}

/** EventDto plus the per-caller fee decision this endpoint adds. */
interface EventWithFeeWaiver extends EventDto {
  fee_waiver?: FeeWaiver | null
}

/**
 * Every fetch this page needs at first render, started together.
 *
 * These were eight `await useFetch()` calls in a row. Each one waited for its
 * round trip before the next began, so a navigation to an event paid for the
 * whole chain end to end — measured at ~2.5s on a local dev server before
 * anything below the header could draw, and the same again as SSR time on a
 * hard load. None of them depends on another's result, so they are created
 * un-awaited and awaited once as a group at the end of the block below; the
 * page still blocks on all of them, but on the slowest one rather than the
 * sum.
 */
const firstRenderFetches: Promise<unknown>[] = []
function firstRender<T extends PromiseLike<unknown>>(fetch: T): T {
  firstRenderFetches.push(Promise.resolve(fetch))
  return fetch
}

const {
  data: event,
  pending: eventPending,
  error: eventError,
  refresh: refreshEvent
} = firstRender(useFetch<EventWithFeeWaiver>(`/api/v1/events/${eventId}`))

const { data: myProfile } = firstRender(useFetch<PlayerProfileDto>('/api/v1/players/me'))

/**
 * Who runs this event with its creator (061). Needed at first render because
 * every organiser control below hangs off it.
 */
const { data: coOrganizersData } = firstRender(
  useFetch<{ data: EventCoOrganizerDto[] }>(`/api/v1/events/${eventId}/co-organizers`, {
    default: () => ({ data: [] })
  })
)
const coOrganizers = computed(() => coOrganizersData.value?.data ?? [])
function setCoOrganizers(list: EventCoOrganizerDto[]) {
  coOrganizersData.value = { data: list }
}

const { data: tournamentsData, pending: tournamentsPending } = firstRender(
  useFetch<TournamentsResponse>(`/api/v1/events/${eventId}/tournaments`)
)

/**
 * A tournament event is one tournament with categories under it.
 *
 * The middle level is no longer something an organiser builds: `createEvent`
 * makes the tournament alongside the event, so this page IS the tournament
 * header and the categories sit directly beneath it. An event carrying more
 * than one tournament row predates that and renders its first.
 */
const isTournament = computed(() => event.value?.event_type === 'tournament')
const primaryTournament = computed(() => tournamentsData.value?.tournaments?.[0] ?? null)

const {
  data: registrationsData,
  pending: registrationsPending,
  refresh: refreshRegistrations
} = firstRender(
  useFetch<{ data: EventRegistrationDto[] }>(`/api/v1/events/${eventId}/registrations`)
)

const {
  data: matchesData,
  pending: matchesPending,
  refresh: refreshMatches
} = firstRender(useFetch<{ data: MatchListItemDto[] }>(`/api/v1/events/${eventId}/matches`))

/**
 * The spectator boxscore, below the header and above the tabs.
 *
 * Aggregates every recorded match in the event, whatever category it came from.
 * Live scores lived only inside a category before, so somebody watching the
 * whole tournament had to open each one in turn and hold the picture in their
 * head.
 *
 * Recorded matches only: a match that has not been scored has nothing to show,
 * and the running courts are already on the Courts tab with their own controls.
 */
const isRegistered = computed(() => !!myRegistration.value)

/** The person who made the event. The only one who may delete it or change its co-organisers. */
const isCreator = computed(
  () =>
    !!myProfile.value && !!event.value && event.value.created_by_player_id === myProfile.value.id
)

/** A friend the creator appointed to run the event alongside them. */
const isCoOrganizer = computed(
  () => !!myProfile.value && coOrganizers.value.some((c) => c.player_id === myProfile.value!.id)
)

/** Creator or co-organiser. Almost nothing should branch on this directly — see below. */
const isOrganizer = computed(() => isCreator.value || isCoOrganizer.value)

/**
 * The gate every organiser control hangs off.
 *
 * Ownership alone is not enough: running an event is club-mode work. In player
 * mode the owner sees exactly what any other player sees — register, the player
 * list, the bracket, the matches — and no way to publish, edit, delete, add a
 * tournament, or drive the queue. That is why the participant branches below
 * test `!canManageEvent` rather than `!isOrganizer`: an owner in player mode is,
 * for every purpose on this screen, a participant.
 */
// A co-organiser is exempt from the club-mode rule: they were appointed as a
// person, may belong to no club at all, and so may have no club mode to enter.
// Their delegated role IS the mode.
const canManageEvent = computed(() => (isCreator.value && isClubMode.value) || isCoOrganizer.value)

/**
 * Starting and ending a session.
 *
 * Neither transition existed: UpdateEventInput has no status field, so 'active'
 * was unreachable through the API - while check-in, the Record Match card and
 * the withdraw/check-in branches all gated on status === 'active'. Every one of
 * those paths was dead until now.
 */
const startingEvent = ref(false)

async function startEvent() {
  startingEvent.value = true
  try {
    await $fetch(`/api/v1/events/${eventId}/start`, { method: 'POST' })
    await refreshEvent()
    await refreshCourts()
    useToast().success('Event started. Courts are open.')
  } catch (err) {
    useToast().error(apiErrorMessage(err, 'Could not start the event.'))
  } finally {
    startingEvent.value = false
  }
}

const closingSession = ref(false)

/**
 * Stop taking entries without ending the event — the manual half of the close
 * policy. Play carries on; only new registrations stop.
 */
async function closeSession() {
  closingSession.value = true
  try {
    await $fetch(`/api/v1/events/${eventId}/close`, { method: 'POST' })
    await refreshEvent()
    useToast().success('Session closed. No new players can join.')
  } catch (err) {
    useToast().error(apiErrorMessage(err, 'Could not close the session.'))
  } finally {
    closingSession.value = false
  }
}

async function completeEvent() {
  startingEvent.value = true
  try {
    await $fetch(`/api/v1/events/${eventId}/complete`, { method: 'POST' })
    await refreshEvent()
    useToast().success('Event completed.')
  } catch (err) {
    useToast().error(apiErrorMessage(err, 'Could not complete the event.'))
  } finally {
    startingEvent.value = false
  }
}

/**
 * The live court board. Short-interval polling plus a manual refresh, and only while
 * a court is actually playing and the tab is visible - see useLiveScores.
 */
const {
  courts,
  hasLiveCourt,
  refresh: refreshCourts,
  lastUpdated: courtsUpdatedAt
} = useLiveScores(eventId)

/**
 * The draw, purely to know which round each finished match belongs to.
 *
 * The event's match list is flat — it records that a match was played, not
 * where it sat in a bracket — so grouping the Scores panel by round needs the
 * bracket. Client-only and lazy: it is presentation for a panel that already
 * renders without it, and a non-tournament event never fetches it at all.
 */
const { data: eventBracket, refresh: refreshEventBracket } = useLazyFetch<BracketDto>(
  () => `/api/v1/tournaments/${primaryTournament.value?.id}/bracket`,
  { immediate: false, server: false }
)

/**
 * The categories, purely to name the Scores panel's sections and order them.
 *
 * A bracket match carries a `category_id` and nothing else about its category,
 * so the panel could group by it but not label it. Lazy and client-only for the
 * same reason as the bracket above: it is presentation for a panel that renders
 * without it.
 */
const { data: eventCategories, refresh: refreshEventCategories } = useLazyFetch<{
  data: TournamentCategoryDto[]
}>(() => `/api/v1/tournaments/${primaryTournament.value?.id}/categories`, {
  immediate: false,
  server: false
})

watch(
  primaryTournament,
  (value) => {
    if (value) {
      refreshEventBracket()
      refreshEventCategories()
    }
  },
  { immediate: true }
)

/**
 * What is being played right now, from the court board.
 *
 * The Scores panel only ever listed finished matches — `liveGame` was hardcoded
 * to null with a note saying live play "is on a court, which the Courts tab
 * owns". That is true and it is exactly the problem: a spectator asking "what
 * is the score" had to know which tab to open first. A live match now leads the
 * panel, on its own card, banded live.
 */
const liveBoxScoreMatches = computed<BoxScoreMatch[]>(() =>
  courts.value
    .filter((court) => court.status === 'playing')
    .map((court) => {
      const games = court.live_score ?? []
      const names = (side: typeof court.team1) =>
        side?.players.map((p) => ({ name: p.display_name, playerId: p.id })) ?? [{ name: 'TBC' }]

      return {
        id: `court-${court.id}`,
        teams: [names(court.team1), names(court.team2)] as BoxScoreMatch['teams'],
        games: games.map((g) => ({ team1_score: g.team1_score, team2_score: g.team2_score })),
        context: court.court_name || `Court ${court.court_number}`,
        group: 'On court',
        // 1-based, and only while there is a game to be on.
        liveGame: games.length || 1,
        complete: false
      }
    })
)

/**
 * The draw split back out per category.
 *
 * `/bracket` without a `category_id` returns every category's matches merged
 * into shared `rounds`, so round 1 of the 3.0 singles and round 1 of the 4.0
 * doubles arrive as one round. That is fine for a flat list and wrong for
 * everything here: a category's champion is the winner of ITS last match, and
 * naming a round "Final" only means something within one draw.
 */
interface CategoryDraw {
  key: string
  rounds: { round: number; matches: BracketMatchDto[] }[]
}

/** The section key for matches that belong to no category. */
const NO_CATEGORY = ''

const categoryDraws = computed<CategoryDraw[]>(() => {
  const byCategory = new Map<string, Map<number, BracketMatchDto[]>>()

  for (const round of eventBracket.value?.rounds ?? []) {
    for (const match of round.matches) {
      const key = match.category_id ?? NO_CATEGORY
      const rounds = byCategory.get(key) ?? new Map<number, BracketMatchDto[]>()
      const bucket = rounds.get(round.round) ?? []
      bucket.push(match)
      rounds.set(round.round, bucket)
      byCategory.set(key, rounds)
    }
  }

  return [...byCategory.entries()].map(([key, rounds]) => ({
    key,
    rounds: [...rounds.entries()]
      .map(([round, matches]) => ({ round, matches }))
      .sort((a, b) => a.round - b.round)
  }))
})

/**
 * Where a played match sits: which category, and what that round is called.
 *
 * The event's own match list carries neither — it is a flat list of results —
 * so both come from the draw. Anything the draw does not place (open play, a
 * match recorded outside a bracket) is left unplaced and falls into one
 * untitled section, which is the whole panel for a non-tournament event.
 */
interface ScorePlacement {
  categoryKey: string
  round: number
  stage: string
}

const placementByMatchId = computed(() => {
  const byMatch = new Map<string, ScorePlacement>()

  for (const draw of categoryDraws.value) {
    const stages = stageLabels(draw.rounds)
    for (const round of draw.rounds) {
      for (const match of round.matches) {
        if (!match.match_id) continue
        byMatch.set(match.match_id, {
          categoryKey: draw.key,
          round: round.round,
          stage: stages.get(round.round) ?? `Round ${round.round}`
        })
      }
    }
  }

  return byMatch
})

/** "Ana Garcia" for a singles entrant, "Ana Garcia / Ben Cruz" for a pair. */
function entrantLine(entrant: { display_name: string; partner_display_name: string | null }) {
  return entrant.partner_display_name
    ? `${entrant.display_name} / ${entrant.partner_display_name}`
    : entrant.display_name
}

/**
 * Who won each category, or nothing while its final is still to be played.
 *
 * `championOf` wants a bracket, so each category's rounds are handed over as
 * one — which is exactly what the endpoint would have returned had it been
 * asked for that category alone.
 */
const championByCategory = computed(() => {
  const byCategory = new Map<string, string>()

  for (const draw of categoryDraws.value) {
    const champion = championOf({
      tournament_id: primaryTournament.value?.id ?? '',
      category_id: draw.key || null,
      locked: true,
      rounds: draw.rounds
    })
    if (champion) byCategory.set(draw.key, entrantLine(champion))
  }

  return byCategory
})

const categoryById = computed(
  () => new Map((eventCategories.value?.data ?? []).map((category) => [category.id, category]))
)

interface FinishedScore extends BoxScoreMatch {
  categoryKey: string
  round: number
}

const finishedBoxScoreMatches = computed<FinishedScore[]>(() =>
  (matchesData.value?.data ?? [])
    .filter((match) => match.scores.length > 0)
    // Generous, because a wrapped-up category is folded away: the cap exists to
    // keep an all-day open-play session from rendering hundreds of rows, not to
    // hide half a draw behind nothing.
    .slice(0, 60)
    .map((match) => {
      const side = (team: 1 | 2) =>
        match.participants
          .filter((p) => p.team_number === team)
          .map((p) => ({ name: p.display_name ?? 'Unknown player', playerId: p.player_id }))

      const placement = placementByMatchId.value.get(match.id)

      /**
       * The recorded result, not one re-derived from the games.
       *
       * `seriesWinner` applies win-by-two, so a match of 11-10 games — a house
       * "first to 11" — resolves to nobody, and the row read FINAL with no ✓
       * against either name. `result_status` is what the submission actually
       * settled on.
       */
      const wonBy = (team: 1 | 2) =>
        match.participants.some((p) => p.team_number === team && p.result_status === 'won')
      const winner = wonBy(1) ? 1 : wonBy(2) ? 2 : null

      return {
        id: match.id,
        teams: [side(1), side(2)] as BoxScoreMatch['teams'],
        games: match.scores.map((s) => ({
          team1_score: s.team1_score,
          team2_score: s.team2_score
        })),
        context: [match.match_type === 'singles' ? 'Singles' : 'Doubles', match.venue]
          .filter(Boolean)
          .join(' · '),
        group: placement?.stage ?? null,
        winner: winner as 1 | 2 | null,
        /**
         * The category's own rules, so a game is marked won by the rules it was
         * played under. Without them the panel assumed 11 win-by-two and left
         * the 11 in an 11-10 game unbolded — the same defect as the missing ✓,
         * one level down.
         */
        rules: rulesForRound(
          categoryById.value.get(placement?.categoryKey ?? NO_CATEGORY) ?? null,
          placement?.round ?? null
        ),
        liveGame: null,
        complete: match.status === 'verified',
        categoryKey: placement?.categoryKey ?? NO_CATEGORY,
        round: placement?.round ?? Number.MAX_SAFE_INTEGER
      }
    })
)

/**
 * The panel, as sections: live play and open matches first, then a section per
 * category — the ones still running above the ones already decided.
 *
 * A decided category collapses to its champion (see `MatchScoreSection`), so
 * putting them last is what stops a finished weekend from opening on a stack of
 * folded cards with the live draw below the fold.
 */
interface ScoreSection {
  key: string
  label: string | null
  champion: string | null
  matches: BoxScoreMatch[]
}

const scoreSections = computed<ScoreSection[]>(() => {
  const byCategory = new Map<string, FinishedScore[]>()
  for (const match of finishedBoxScoreMatches.value) {
    const bucket = byCategory.get(match.categoryKey) ?? []
    bucket.push(match)
    byCategory.set(match.categoryKey, bucket)
  }

  const sections: ScoreSection[] = []

  // Whatever is on court now, plus anything the draw does not place. Unlabelled,
  // so it renders as the bare round cards it always was.
  const unplaced = [...liveBoxScoreMatches.value, ...(byCategory.get(NO_CATEGORY) ?? [])]
  if (unplaced.length) {
    sections.push({ key: NO_CATEGORY, label: null, champion: null, matches: unplaced })
  }

  /**
   * A tournament's finished results are read on the category card.
   *
   * Each card now carries its own champion in the header, beside the band and
   * the format, and its scores under Matches grouped by round — so listing them
   * again up here was the same results twice on one page, with the category
   * named in two places and its details in only one. What is on court right now
   * stays: it is the only part of the picture no single card owns.
   */
  if (isTournament.value) return sections

  const categorised = [...byCategory.entries()]
    .filter(([key]) => key !== NO_CATEGORY)
    .map(([key, matches]) => ({
      key,
      label: categoryById.value.get(key)?.name ?? null,
      champion: championByCategory.value.get(key) ?? null,
      order: categoryById.value.get(key)?.display_order ?? Number.MAX_SAFE_INTEGER,
      // Newest round first: the final is the answer to the question being asked.
      matches: [...matches].sort((a, b) => b.round - a.round)
    }))
    .sort((a, b) => Number(!!a.champion) - Number(!!b.champion) || a.order - b.order)

  return [...sections, ...categorised]
})

const hasScores = computed(() => scoreSections.value.some((section) => section.matches.length))

const { data: rankingsData, pending: rankingsPending } = firstRender(
  useFetch<{
    data: EventRankingEntry[]
  }>(`/api/v1/events/${eventId}/rankings`)
)

const {
  data: queueData,
  pending: queuePending,
  refresh: refreshQueue
} = firstRender(useFetch<{ data: EventQueueDto[] }>(`/api/v1/events/${eventId}/queue`))

const myRegistration = computed(() => {
  if (!myProfile.value || !registrationsData.value?.data) return null
  return registrationsData.value.data.find(
    (r) => r.player_id === myProfile.value!.id && r.status !== 'withdrawn'
  )
})

/**
 * Courts only appear once the session is running.
 *
 * Before that the tab would be an empty board — courts are materialised when
 * the event starts (see /events/:id/start), because queue_courts is editable
 * while the event is a draft and creating rows earlier would mean reconciling
 * them every time the organiser changed their mind.
 *
 * Declared here, below `courts` and `event`, and not up beside `activeTab`
 * where it reads more naturally. A computed body is lazy, so referencing a
 * `const` declared further down is normally harmless — but the `watch` below
 * evaluates this getter once during setup to seed its old value, which hit the
 * temporal dead zone and threw `Cannot access 'courts' before initialization`,
 * taking the whole event page down on open.
 */
/**
 * The two tabs the session is actually run from.
 *
 * Matches is the live board — courts in play and games already finished, in
 * one scroll. It absorbed the old Courts tab, which existed only because live
 * play and finished play were drawn by different code; splitting the same
 * evening across two tabs meant nobody could follow a match from "on court" to
 * "final" without changing tabs mid-game.
 */
const primaryTabs: { id: EventTab; label: string }[] = [
  { id: 'matches', label: 'Matches' },
  { id: 'rankings', label: 'Scoreboard' }
]

/**
 * Everything you set up or look up rather than watch.
 *
 * Demoted rather than removed: an organiser needs all of it, but not while a
 * game is on, and putting five peers in one row made the two that matter
 * during a session no easier to hit than the three that do not.
 */
const moreTabs = computed<{ id: EventTab; label: string }[]>(() => {
  const tabs: { id: EventTab; label: string }[] = [
    { id: 'info', label: 'Info' },
    { id: 'players', label: 'Players' }
  ]

  // The queue is a live control surface. On a finished or cancelled event it
  // can only offer actions that cannot do anything, so it is withheld rather
  // than shown empty — the roster stays reachable under Players.
  const over = event.value?.status === 'completed' || event.value?.status === 'cancelled'
  if (!over) tabs.push({ id: 'queue', label: 'Queue' })

  return tabs
})

const visibleTabs = computed<EventTab[]>(() => [
  ...primaryTabs.map((t) => t.id),
  ...moreTabs.value.map((t) => t.id)
])

// A tab can disappear underneath the reader — finishing an event while sitting
// on Queue, for instance — so fall back rather than render nothing.
watch(visibleTabs, (tabs) => {
  if (!tabs.includes(activeTab.value)) activeTab.value = 'matches'
})

/** The round shown in the sticky strip. */
const sessionRound = computed(() => event.value?.current_round ?? 1)

/**
 * The scoring rules this session is played to. See 054.
 *
 * Open play could not express anything but one game to 11, so the board, the
 * confirm dialog and the deuce note all read a constant. They read the event
 * now, and this is the single place that resolves it.
 */
const sessionRules = computed(() => rulesForEvent(event.value))

/** The rule as a sentence, for the Info tab and the queue panel. */
const scoringSummary = computed(() => {
  const rules = sessionRules.value
  const games = rules.bestOf === 1 ? 'One game' : `Best of ${rules.bestOf}`
  return `${games} to ${rules.targetPoints}${rules.winByTwo ? ', win by 2' : ' — first to the number takes it'}`
})

const courtBusyId = ref('')

/**
 * Renaming a court.
 *
 * `event_courts.court_name` has been rendered since 017 as
 * `court_name || \`Court ${court_number}\``, but nothing could write it — so
 * the number was the only label the product could produce, and a venue whose
 * courts are signposted "Center" or "A" was sending players to a name that
 * matched nothing on the fence.
 */
const renamingCourtId = ref('')
const courtNameDraft = ref('')
const savingCourtName = ref(false)

function startRenameCourt(court: { id: string; court_name: string | null }) {
  renamingCourtId.value = court.id
  courtNameDraft.value = court.court_name ?? ''
}

function cancelRenameCourt() {
  renamingCourtId.value = ''
  courtNameDraft.value = ''
}

async function saveCourtName() {
  if (savingCourtName.value || !renamingCourtId.value) return
  savingCourtName.value = true
  try {
    await $fetch(`/api/v1/events/${eventId}/courts/${renamingCourtId.value}`, {
      method: 'PATCH',
      // Blank clears the name and restores "Court N" — the way back from a
      // rename somebody regrets.
      body: { court_name: courtNameDraft.value.trim() || null }
    })
    await refreshCourts()
    cancelRenameCourt()
    useToast().success('Court renamed.')
  } catch (err) {
    useToast().error(apiErrorMessage(err, 'Could not rename the court.'))
  } finally {
    savingCourtName.value = false
  }
}

/**
 * Starting a game on a specific court.
 *
 * The two sides are picked from the waiting queue rather than typed, because a
 * court can only ever be started with entries that are actually in this event's
 * queue — the server enforces exactly that, and offering a free-text field
 * would just be a way to discover the error message.
 */
/**
 * Queue vs Mixup.
 *
 * Queue is first-come: whoever has waited longest goes on next, with whoever
 * they arrived with. Mixup rotates partners AND opponents across the session so
 * that, as far as possible, nobody partners the same person twice — the
 * "everyone plays with everyone" format a club night actually runs.
 *
 * The generated schedule is a PREVIEW and nothing is written. People arrive
 * late, leave early and pull out with a bad ankle, so a whole evening's
 * pairings committed at 7pm is a liability by 8. Courts are still started one
 * at a time; the schedule tells the desk who to put on.
 */
/**
 * How the queue pairs people, as a stored setting rather than a local toggle.
 *
 * There used to be a `pairingMode` ref here with two values ("queue" and
 * "mixup") driving a pair of radios labelled "How to pair players". It looked
 * like a setting and was not one: it persisted nothing, reset on reload, and
 * had no relationship to `events.queue_mode` — which was displayed as a
 * heading immediately above it and editable nowhere. An organiser could
 * therefore be shown "Mix & Match" and "queue" selected at the same time.
 *
 * The three values are the stored enum, named by `utils/queue-mode.ts` so the
 * words match wherever a mode is shown.
 */
const QUEUE_MODES: QueueMode[] = ['first_come', 'random', 'rating_based']

const savingQueueMode = ref(false)

async function setQueueMode(mode: QueueMode) {
  if (savingQueueMode.value || event.value?.queue_mode === mode) return
  savingQueueMode.value = true
  try {
    await $fetch(`/api/v1/events/${eventId}`, { method: 'PATCH', body: { queue_mode: mode } })
    await refreshEvent()
    toast.success(`Pairing set to ${queueModeLabel(mode)}.`)
  } catch (err) {
    toast.error(apiErrorMessage(err, 'Could not change how players are paired.'))
  } finally {
    savingQueueMode.value = false
  }
}
const mixupRounds = ref(6)
const mixupSchedule = ref<MixupSchedule | null>(null)
const generatingMixup = ref(false)

async function generateMixup() {
  generatingMixup.value = true
  try {
    const result = await $fetch<{ data: MixupSchedule; player_count: number }>(
      `/api/v1/events/${eventId}/queue/mixup`,
      { method: 'POST', body: { rounds: mixupRounds.value } }
    )
    mixupSchedule.value = result.data
    if (!result.data.rounds.length) {
      useToast().info('Not enough players in the queue yet to build a rotation.')
    }
  } catch (err) {
    useToast().error(apiErrorMessage(err, 'Could not generate a rotation.'))
  } finally {
    generatingMixup.value = false
  }
}

function sideNames(side: { players: { player_id: string }[] }): string {
  return side.players
    .map((p) => {
      const entry = queueData?.value?.data.find(
        (q) => q.player_id === p.player_id || q.partner_id === p.player_id
      )
      if (entry?.player?.id === p.player_id) return entry.player.display_name
      if (entry?.partner?.id === p.player_id) return entry.partner.display_name
      return 'Player'
    })
    .join(' & ')
}

const startCourtId = ref('')
const startTeam1 = ref('')
const startTeam2 = ref('')
const startingCourt = ref(false)

const startCourtOpen = computed({
  get: () => startCourtId.value !== '',
  set: (open: boolean) => {
    if (!open) startCourtId.value = ''
  }
})

function openStartCourt(courtId: string) {
  startTeam1.value = waitingEntries.value[0]?.id ?? ''
  startTeam2.value = waitingEntries.value[1]?.id ?? ''
  startCourtId.value = courtId
}

/** A queue entry as one line: the player, plus their partner for doubles. */
function queueEntryLabel(entry: EventQueueDto): string {
  const names = [entry.player?.display_name, entry.partner?.display_name].filter(Boolean)
  return names.length ? names.join(' & ') : 'Unknown player'
}

/**
 * Which court is being filled.
 *
 * The dialog used to be titled "Start a game" and name no court at all, so an
 * organiser with three courts free clicked Start on court 3 and then picked two
 * sides with nothing on screen saying where those people were being sent. In
 * open play that is the whole of the decision - a court is the unit, sides are
 * drawn fresh for each one - so it belongs in the title, not left to be
 * remembered from the button that was clicked a second ago.
 */
const startCourtLabel = computed(() => {
  const court = courts.value.find((c) => c.id === startCourtId.value)
  if (!court) return null
  return court.court_name || `Court ${court.court_number}`
})

async function confirmStartCourt() {
  if (!startTeam1.value || !startTeam2.value || startTeam1.value === startTeam2.value) return
  startingCourt.value = true
  try {
    await $fetch(`/api/v1/events/${eventId}/courts/${startCourtId.value}/start`, {
      method: 'POST',
      body: { team1_queue_id: startTeam1.value, team2_queue_id: startTeam2.value }
    })
    await Promise.all([refreshCourts(), refreshQueue()])
    startCourtId.value = ''
    useToast().success('Court started.')
  } catch (err) {
    useToast().error(apiErrorMessage(err, 'Could not start the court.'))
  } finally {
    startingCourt.value = false
  }
}

/**
 * One request per point, and no re-read behind it.
 *
 * This used to PATCH and then `await refreshCourts()`, and the card only
 * re-rendered once that second request returned — two serial round trips before
 * the number on screen moved, which at a venue is seconds per tap. The card now
 * shows the tap immediately (see `useGameConfirm`), so the write is all that is
 * left to do and it does not need to be waited on.
 *
 * A failure re-reads, which is what puts the optimistic score back to whatever
 * the server actually holds.
 */
async function updateCourtScore(courtId: string, scores: unknown) {
  try {
    await $fetch(`/api/v1/events/${eventId}/courts/${courtId}/score`, {
      method: 'PATCH',
      body: { scores }
    })
  } catch (err) {
    useToast().error(apiErrorMessage(err, 'Could not update the score.'))
    await refreshCourts()
  }
}

async function submitCourtScore(courtId: string) {
  if (courtBusyId.value) return
  courtBusyId.value = courtId
  try {
    const result = await $fetch<{ warnings?: string[] }>(
      `/api/v1/events/${eventId}/courts/${courtId}/submit`,
      { method: 'POST' }
    )
    await Promise.all([refreshCourts(), refreshMatches()])
    // The court is freed even when the match or the auto-advance failed, so a
    // warning has to be shown rather than a blanket success.
    if (result.warnings?.length) {
      useToast().info(result.warnings.join(' '))
    } else {
      useToast().success('Score submitted. Next pair is on.')
    }
  } catch (err) {
    useToast().error(apiErrorMessage(err, 'Could not submit the score.'))
  } finally {
    courtBusyId.value = ''
  }
}

/**
 * A draft is unpublished club work, so it has no place in the player-mode UI.
 * The organiser is not locked out — switching to club mode reveals it — and no
 * other viewer could load a draft anyway, since `events_select_public` filters
 * them out server-side. This only stops an owner's own draft from appearing
 * while they are wearing the player hat.
 */
const draftHiddenFromPlayer = computed(() => event.value?.status === 'draft' && !isClubMode.value)

const myQueueEntry = computed(() => {
  if (!myProfile.value || !queueData.value?.data) return null
  return queueData.value.data.find((q) => q.player_id === myProfile.value!.id) ?? null
})

const waitingEntries = computed(
  () => queueData.value?.data.filter((q) => q.status === 'waiting') ?? []
)
const activeEntries = computed(
  () => queueData.value?.data.filter((q) => q.status !== 'waiting') ?? []
)

/**
 * Singles or doubles for the queue entry — read from the event, never chosen.
 *
 * This was a `<select>` in the join panel, which asked the player a question
 * the event had already answered: an event carries one `match_format` and
 * every game in the session is played to it. Worse than redundant, it was
 * answerable wrongly — `matchNextPair` only pairs two entries of the SAME
 * type, so one player picking singles in a doubles session left an entry at
 * the head of the queue that could not be paired with anything behind it, and
 * the organiser saw "only one singles entry is waiting" while four people
 * stood on court waiting for a game.
 *
 * A computed, not a ref: there is nothing here for a person to set. The
 * service derives the same value from the same column and rejects a request
 * that disagrees, so this is the display half of one rule rather than a second
 * source of it.
 */
const joinMatchType = computed<'singles' | 'doubles'>(() => event.value?.match_format ?? 'doubles')

const joinPartnerId = ref('')
const joiningQueue = ref(false)
const leavingQueue = ref(false)
const queueError = ref('')

const availablePartners = computed(() => {
  if (!registrationsData.value?.data) return []
  return registrationsData.value.data.filter(
    (r) => r.status !== 'withdrawn' && r.player_id !== myProfile.value?.id
  )
})

/**
 * The reader's default duo, used only to pre-select the partner field below.
 *
 * server: false because this is a signed-in-only preference that has no
 * bearing on the public render of the page.
 */
const { data: myPartnersData } = useFetch<{ data: PartnerDto[] }>('/api/v1/players/me/partners', {
  server: false,
  default: () => ({ data: [] })
})

const defaultPartnerId = computed(
  () => myPartnersData.value?.data.find((partner) => partner.is_default)?.player_id ?? null
)

/**
 * Pre-select the duo, but only if they are actually registered for this event —
 * a partner who is not on the list cannot be queued with, and pre-filling a
 * name the server will reject is worse than leaving the field empty.
 *
 * Only ever fills a blank field: once the reader picks someone, that choice
 * stands even if the partner list reloads underneath them.
 */
watch(
  [joinMatchType, defaultPartnerId, availablePartners],
  () => {
    if (joinMatchType.value !== 'doubles' || joinPartnerId.value) return
    const duo = defaultPartnerId.value
    if (duo && availablePartners.value.some((r) => r.player_id === duo)) {
      joinPartnerId.value = duo
    }
  },
  { immediate: true }
)

/**
 * Mix & Match forms the pairs itself, so a partner is neither asked for nor
 * sent. Requiring one made a solo drop-in impossible to enter, which is the
 * normal way somebody joins an open play session.
 */
const queuePairsForYou = computed(() => queuePairsAutomatically(event.value?.queue_mode))

/** What joining actually commits you to, in the words the session uses. */
const joinFormatNote = computed(() => {
  if (joinMatchType.value === 'singles') return 'One against one.'
  return queuePairsForYou.value
    ? 'Two a side. The rotation picks your partner.'
    : 'Two a side. Bring a partner from the registered players.'
})

async function handleJoinQueue() {
  queueError.value = ''
  if (joinMatchType.value === 'doubles' && !queuePairsForYou.value && !joinPartnerId.value) {
    queueError.value = 'Select a partner to join as a doubles pair.'
    return
  }
  joiningQueue.value = true
  try {
    await $fetch(`/api/v1/events/${eventId}/queue/join`, {
      method: 'POST',
      body: {
        // Deliberately not sent: the service reads the format off the event,
        // which is the only place it is decided. See joinQueue.
        partner_id:
          joinMatchType.value === 'doubles' && !queuePairsForYou.value ? joinPartnerId.value : null
      }
    })
    await refreshQueue()
  } catch (err) {
    queueError.value = apiErrorMessage(err, 'Failed to join the queue.')
  } finally {
    joiningQueue.value = false
  }
}

async function handleLeaveQueue() {
  leavingQueue.value = true
  try {
    await $fetch(`/api/v1/events/${eventId}/queue/leave`, { method: 'POST' })
    await refreshQueue()
  } catch (err) {
    queueError.value = apiErrorMessage(err, 'Failed to leave the queue.')
  } finally {
    leavingQueue.value = false
  }
}

const selectedEntry1 = ref('')
const selectedEntry2 = ref('')
const matchCourtNumber = ref('')
const matchingQueue = ref(false)
/** The hand-pick pair is the exception now, so it starts collapsed. */
const showManualPick = ref(false)

/**
 * "Match next" names the pair before it is pressed, so the organiser can see
 * whether the fair answer is the right one before committing to it.
 *
 * Same-format only: singles cannot be paired against doubles, and the longest
 * wait decides which format goes on next. Mirrors `matchNextPair`, which is
 * the authority — the server re-reads the queue and picks again.
 */
const nextPair = computed(() => {
  const [first] = waitingEntries.value
  if (!first) return null
  const second = waitingEntries.value.find(
    (entry) => entry.id !== first.id && entry.match_type === first.match_type
  )
  return second ? { first, second } : null
})

function entryLabel(entry: EventQueueDto): string {
  const name = entry.player?.display_name ?? 'Unknown player'
  return entry.partner ? `${name} & ${entry.partner.display_name}` : name
}

/**
 * The same entry as one line per person, so each name links to its profile.
 *
 * `entryLabel` stays for the places that need a plain string — a `<select>`
 * option, an aria-label — where markup is not allowed.
 */
function entryPlayers(entry: EventQueueDto) {
  const players = [
    {
      id: entry.player?.id ?? entry.player_id,
      name: entry.player?.display_name ?? 'Unknown player'
    }
  ]
  if (entry.partner) {
    players.push({ id: entry.partner.id ?? entry.partner_id, name: entry.partner.display_name })
  }
  return players
}

/**
 * How long an entry has been waiting, from `joined_at`. Minutes until an hour,
 * because "73m" stops being readable long before it stops being accurate.
 */
function waitedFor(joinedAt: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - new Date(joinedAt).getTime()) / 60000))
  if (minutes < 1) return 'just joined'
  if (minutes < 60) return `${minutes}m waiting`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m waiting` : `${hours}h waiting`
}

// Ticks so the wait times do not freeze at whatever they were when the tab
// was opened. A minute is the smallest unit shown, so a minute is the interval.
const clockNow = ref(Date.now())
onMounted(() => {
  const timer = window.setInterval(() => (clockNow.value = Date.now()), 60_000)
  onBeforeUnmount(() => window.clearInterval(timer))
})

/**
 * The courts a pair can be sent to, and which are free.
 *
 * This was a free-text number box. Nothing stopped an organiser typing the
 * number of a court already in play - or one that does not exist - and the
 * mistake only surfaced as an error from the server after the fact. Starting a
 * game in open play is a decision about a court, so the courts are the choices.
 *
 * Falls back to the configured count when no court rows exist yet, because an
 * event that has not been started has a court count but no courts.
 */
const courtChoices = computed(() => {
  if (courts.value.length) {
    return courts.value.map((court) => ({
      value: String(court.court_number),
      label: `${court.court_name || `Court ${court.court_number}`}${
        court.status === 'playing' ? ' — in play' : ' — free'
      }`
    }))
  }

  return Array.from({ length: Math.max(1, event.value?.queue_courts ?? 1) }, (_, i) => ({
    value: String(i + 1),
    label: `Court ${i + 1}`
  }))
})

/**
 * Keeps the picker on a court that can actually be started.
 *
 * Re-seeds whenever the current choice is gone or has gone into play, which is
 * exactly what happens the moment a pair is sent to it - leaving the selection
 * sitting on a busy court would make the next press fail for a reason the
 * organiser never chose.
 */
watch(
  courtChoices,
  (choices) => {
    const current = choices.find((c) => c.value === matchCourtNumber.value)
    if (current && !current.label.includes('in play')) return
    matchCourtNumber.value =
      (choices.find((c) => !c.label.includes('in play')) ?? choices[0])?.value ?? ''
  },
  { immediate: true }
)

async function handleMatchNextPair() {
  queueError.value = ''
  if (!matchCourtNumber.value) {
    queueError.value = 'Choose a court first.'
    return
  }
  matchingQueue.value = true
  try {
    await $fetch(`/api/v1/events/${eventId}/queue/match-next`, {
      method: 'POST',
      body: { court_number: Number(matchCourtNumber.value) }
    })
    matchCourtNumber.value = ''
    await refreshQueue()
  } catch (err) {
    queueError.value = apiErrorMessage(err, 'Could not match the next pair.')
  } finally {
    matchingQueue.value = false
  }
}

async function handleMatchEntries() {
  queueError.value = ''
  if (!selectedEntry1.value || !selectedEntry2.value || !matchCourtNumber.value) {
    queueError.value = 'Select two waiting players and a court.'
    return
  }
  matchingQueue.value = true
  try {
    await $fetch(`/api/v1/events/${eventId}/queue/match`, {
      method: 'POST',
      body: {
        queue_id_1: selectedEntry1.value,
        queue_id_2: selectedEntry2.value,
        court_number: Number(matchCourtNumber.value)
      }
    })
    selectedEntry1.value = ''
    selectedEntry2.value = ''
    matchCourtNumber.value = ''
    await refreshQueue()
  } catch (err) {
    queueError.value = apiErrorMessage(err, 'Failed to match these players.')
  } finally {
    matchingQueue.value = false
  }
}

async function handleSkipEntry(queueId: string) {
  queueError.value = ''
  try {
    await $fetch(`/api/v1/events/${eventId}/queue/skip`, {
      method: 'POST',
      body: { queue_id: queueId }
    })
    await refreshQueue()
  } catch (err) {
    queueError.value = apiErrorMessage(err, 'Failed to skip this player.')
  }
}

const registering = ref(false)
const withdrawing = ref(false)
const checkingIn = ref(false)

/**
 * Confirmations run through `UiModal`, not `window.confirm`. The browser
 * dialog is unthemed and untranslatable, it ignores the design tokens the rest
 * of the app is built on, and it blocks the tab while it is up. Failures are
 * toasts for the same reason `alert()` is gone.
 */
const withdrawOpen = ref(false)
const publishOpen = ref(false)
const deleteOpen = ref(false)

/**
 * Registering for open play now goes through the same confirmation a
 * tournament category uses. Pressing Register used to post straight away, so
 * the first anyone heard of an entry fee was on the day — and when the roster
 * refresh failed the screen did not visibly change at all, which read as the
 * button doing nothing.
 *
 * The quote is read from the shared ladder in utils/convenience-fee.ts, so the
 * number shown here and the number eventually charged cannot disagree.
 */
const registerOpen = ref(false)
const registerError = ref('')

/**
 * The convenience-fee ladder, so the dialog can quote a real total rather than
 * only the entry fee. Public and cached for the page.
 */
const { data: feeRulesData } = firstRender(
  useFetch<{ data: PlatformFeeRule[] }>('/api/v1/platform/fee-rules', {
    default: () => ({ data: [] })
  })
)
const feeRules = computed(() => feeRulesData.value?.data ?? [])

// The single wait for everything created above. See the note on `event`.
await Promise.all(firstRenderFetches)

async function openRegister() {
  if (!user.value) {
    await navigateTo('/login')
    return
  }
  registerError.value = ''
  registerOpen.value = true
}

async function handleRegister() {
  registering.value = true
  registerError.value = ''
  try {
    await $fetch(`/api/v1/events/${eventId}/register`, { method: 'POST' })
    await refreshRegistrations()
    registerOpen.value = false
    toast.success('You are registered for this event.')
  } catch (err) {
    // Shown inside the dialog rather than as a toast: the dialog is still up,
    // and a message behind it is a message nobody reads.
    registerError.value = apiErrorMessage(err, 'Could not register for the event.')
  } finally {
    registering.value = false
  }
}

async function handleWithdraw() {
  withdrawing.value = true
  try {
    await $fetch(`/api/v1/events/${eventId}/withdraw`, { method: 'POST' })
    await refreshRegistrations()
  } catch (err) {
    toast.error(apiErrorMessage(err, 'Could not withdraw from the event.'))
  } finally {
    withdrawing.value = false
    withdrawOpen.value = false
  }
}

async function handleCheckIn() {
  checkingIn.value = true
  try {
    await $fetch(`/api/v1/events/${eventId}/check-in`, { method: 'POST' })
    await refreshRegistrations()
  } catch (err) {
    toast.error(apiErrorMessage(err, 'Could not check you in.'))
  } finally {
    checkingIn.value = false
  }
}

const statusConfig: Record<string, { bg: string; text: string }> = {
  draft: { bg: 'bg-surface-3', text: 'text-fg-muted' },
  published: { bg: 'bg-primary-soft', text: 'text-primary' },
  active: { bg: 'bg-primary-soft', text: 'text-primary' },
  open: { bg: 'bg-primary-soft', text: 'text-primary' },
  in_progress: { bg: 'bg-primary-soft', text: 'text-primary' },
  completed: { bg: 'bg-accent-soft', text: 'text-primary' },
  cancelled: { bg: 'bg-danger-soft', text: 'text-danger' }
}

const eventTypeLabels: Record<string, string> = {
  open_casual: 'Open Casual',
  open_ranked: 'Open Ranked',
  club_casual: 'Club Casual',
  club_ranked: 'Club Ranked',
  tournament: 'Tournament',
  coaching: 'Coaching'
}

/**
 * Empty when the event carries no start time, which is every event created
 * before 028-event-time and every one where the organiser left it blank — the
 * date alone still renders in that case.
 */
const timeLabel = computed(() =>
  formatEventTimeRange(event.value?.start_time, event.value?.end_time)
)

function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start)
  const endDate = new Date(end)
  const startStr = startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const endStr = endDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
  if (startStr === endStr.replace(/, \d{4}$/, '')) {
    return endStr
  }
  return `${startStr} - ${endStr}`
}

/**
 * Inline description editing.
 *
 * PATCH /api/v1/events/:id has accepted `description` since the event domain
 * landed, but nothing in the UI ever called it, so whatever was typed at
 * creation was final. Gated on canManageEvent, not isOrganizer: editing an
 * event is club-mode work, same as publishing and deleting.
 */
const editingDescription = ref(false)
const descriptionDraft = ref('')
const savingDescription = ref(false)
const descriptionError = ref('')
const toast = useToast()

function startEditDescription() {
  descriptionDraft.value = event.value?.description ?? ''
  descriptionError.value = ''
  editingDescription.value = true
}

function cancelEditDescription() {
  editingDescription.value = false
  descriptionError.value = ''
}

async function saveDescription() {
  savingDescription.value = true
  descriptionError.value = ''
  try {
    const trimmed = descriptionDraft.value.trim()
    await $fetch(`/api/v1/events/${eventId}`, {
      method: 'PATCH',
      // Empty clears the field rather than storing an empty string, so the
      // "no description yet" branch renders instead of a blank paragraph.
      body: { description: trimmed || null }
    })
    await refreshEvent()
    editingDescription.value = false
    toast.success('Event details updated.')
  } catch (err) {
    descriptionError.value = apiErrorMessage(err, 'Could not save the event details.')
  } finally {
    savingDescription.value = false
  }
}

const publishing = ref(false)

async function handlePublishEvent() {
  publishing.value = true
  try {
    await $fetch(`/api/v1/events/${eventId}/publish`, { method: 'POST' })
    await refreshEvent()
  } catch (err) {
    toast.error(apiErrorMessage(err, 'Could not publish the event.'))
    // A toast cannot carry a link; a plan limit needs one. It persists on the
    // page until dismissed or until the event is actually published.
    publishUpsell.value = limitUpsell(err, event.value?.club_id)
  } finally {
    publishing.value = false
    publishOpen.value = false
  }
}
const publishUpsell = ref<LimitUpsell | null>(null)

// Deleting is draft-only and irreversible, so it asks twice as loudly as
// publishing does. The server enforces the same rule regardless — a published
// event, or a draft with players attached, is refused there.
const deleting = ref(false)

async function handleDeleteEvent() {
  deleting.value = true
  try {
    await $fetch(`/api/v1/events/${eventId}`, { method: 'DELETE' })
    await navigateTo('/events')
  } catch (err) {
    toast.error(apiErrorMessage(err, 'Could not delete the event.'))
  } finally {
    deleting.value = false
    deleteOpen.value = false
  }
}

/**
 * Open play fills against the event's own capacity, so the header can say how
 * many more are needed rather than only how many have joined.
 */
const registeredCount = computed(() => registrationsData.value?.data.length ?? 0)

/**
 * Registered and checked-in are different things and only one of them plays.
 *
 * Registered is a claimed slot. Checked in is a player who has arrived and is
 * eligible for the rotation — which is why the queue draws on the second and
 * not the first. Both numbers were on screen with nothing saying so.
 */
const checkedInCount = computed(
  () => registrationsData.value?.data.filter((r) => r.status === 'checked_in').length ?? 0
)
const registeredOnlyCount = computed(
  () => registrationsData.value?.data.filter((r) => r.status === 'registered').length ?? 0
)
const placesRemaining = computed(() => {
  const capacity = event.value?.max_participants
  if (!capacity) return null
  return Math.max(0, capacity - registeredCount.value)
})

/**
 * Why the session cannot start yet, or null when it can.
 *
 * Capacity and readiness are different numbers and were being conflated: a
 * session at 3 of 14 was treated as not startable because it was not FULL,
 * when what actually matters is whether enough people are there to fill a
 * court. `effective_min_players_to_start` is the server's answer to that (the
 * organiser's override, or 4 for doubles / 2 for singles), so the button and
 * the API cannot disagree about it.
 */
const startBlockedReason = computed(() => {
  const needed = event.value?.effective_min_players_to_start ?? 0
  const short = needed - registeredCount.value
  if (short <= 0) return null
  return `${short} more ${short === 1 ? 'player' : 'players'} to start`
})

/**
 * What the session is doing right now, in words.
 *
 * The panel previously showed a bare count and left the reader to work out what
 * it meant. Full and playing are not mutually exclusive, so this reports the
 * play state and the capacity state separately rather than collapsing them.
 */
/**
 * The coach's name, for a coaching session.
 *
 * A separate lookup because the event carries only the id — and it is a player
 * like any other, so the name links to their profile the way every other player
 * reference on this page does.
 */
// Fetched only when there is a coach: watching the id directly fired a
// request for `/players/null` on every event without one.
const { data: coachProfile, execute: loadCoach } = await useFetch<{
  id: string
  display_name: string
}>(() => `/api/v1/players/${event.value?.coach_player_id}`, { immediate: false, watch: false })
watch(
  () => event.value?.coach_player_id,
  (id) => {
    if (id) loadCoach()
  },
  { immediate: true }
)

const sessionState = computed(() => {
  const e = event.value
  if (!e || isTournament.value) return null
  if (e.closed_at || e.status === 'completed') return { label: 'Session closed', tone: 'muted' }
  if (e.status === 'active') return { label: 'Currently playing', tone: 'live' }
  if (placesRemaining.value === 0) return { label: 'Full — no slots', tone: 'full' }
  if (placesRemaining.value !== null) {
    return {
      label: `${placesRemaining.value} ${placesRemaining.value === 1 ? 'slot' : 'slots'} left`,
      tone: 'open'
    }
  }
  return null
})
/**
 * Back returns to the page you came from; the route below is only the
 * fallback for a deep link, where there is nothing of ours behind us.
 */
const { goBack } = useAppBack('/events')
</script>

<template>
  <div class="min-h-screen bg-canvas p-4 lg:p-6">
    <div class="page-shell">
      <UiPageHeader to="/events" />

      <!-- A plan limit stopped the publish. Persistent, with the way out. -->
      <div
        v-if="publishUpsell"
        role="alert"
        class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning"
      >
        <span>{{ publishUpsell.message }}</span>
        <span class="flex items-center gap-3">
          <NuxtLink :to="publishUpsell.to" class="font-medium underline underline-offset-2" data-testid="limit-upsell">{{ publishUpsell.ctaLabel }}</NuxtLink>
          <button type="button" class="text-warning/80 hover:text-warning" aria-label="Dismiss" @click="publishUpsell = null">
            <UiIcon name="x" size="h-4 w-4" />
          </button>
        </span>
      </div>

      <!-- Loading -->
      <div v-if="eventPending" class="space-y-4">
        <div class="h-36 animate-pulse rounded-xl bg-surface" />
        <div class="h-48 animate-pulse rounded-xl bg-surface" />
      </div>

      <!-- Error -->
      <div v-else-if="eventError" class="rounded-xl bg-danger-soft p-6 text-center">
        <p class="text-danger">Could not load event.</p>
        <button
          type="button"
          class="mt-4 inline-block text-sm text-primary hover:underline"
          @click="goBack"
        >
          Back
        </button>
      </div>

      <!-- A draft reached in player mode. Not an error and not a permission
           failure — the viewer may well own it — so it says what the state is
           and how to get to it, rather than pretending the event is missing. -->
      <div
        v-else-if="draftHiddenFromPlayer"
        class="rounded-xl bg-surface p-8 text-center shadow-card"
      >
        <h1 class="font-display text-heading-2 text-fg">This event is still a draft</h1>
        <p class="mx-auto mt-2 max-w-md text-sm text-fg-muted">
          Drafts live in club mode. Switch to the club that owns this event to finish setting it up
          and make it visible to players.
        </p>
        <button
          type="button"
          class="mt-4 inline-block text-sm text-primary hover:underline"
          @click="goBack"
        >
          Back
        </button>
      </div>

      <template v-else-if="event">
        <!-- Event Header -->
        <div class="mb-6 rounded-xl bg-surface p-4 shadow-card sm:p-6">
          <!-- Stacked below `sm`. The actions used to sit in a fixed right-hand
               column at every width, so on a phone "Close to new players" alone
               took most of the row and the event name was left wrapping down a
               140px gutter beside it. -->
          <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0 flex-1">
              <!-- What kind of event this is, before its name. Nothing on the
                   page said so at a glance, so a tournament and an open play
                   session were indistinguishable until you read the body. -->
              <p
                class="mb-1 text-xs font-bold tracking-[0.14em]"
                :class="eventTypeStyle(event.event_type).art"
              >
                {{ eventKindLabel(event.event_type) }}
              </p>
              <div class="flex flex-wrap items-center gap-2">
                <h1 class="font-display text-heading-1 text-fg">{{ event.name }}</h1>
                <span
                  class="rounded-md px-2 py-0.5 text-xs font-medium"
                  :class="
                    event.affects_rating
                      ? 'bg-accent-soft text-primary'
                      : 'bg-surface-3 text-fg-muted'
                  "
                >
                  {{ event.affects_rating ? 'Ranked' : 'Casual' }}
                </span>
              </div>
              <p class="mt-1 text-sm text-primary">
                {{ eventTypeLabels[event.event_type] || event.event_type }}
              </p>

              <!-- Who is teaching. Any player can be the coach, so it links to
                   their profile like every other player reference here. -->
              <p v-if="event.coach_player_id" class="mt-1 text-sm text-fg-secondary">
                Coach:
                <NuxtLink
                  :to="`/players/${event.coach_player_id}`"
                  class="font-medium text-primary hover:underline"
                >
                  {{ coachProfile?.display_name ?? 'View profile' }}
                </NuxtLink>
              </p>
              <p class="mt-2 text-fg-muted">
                {{ formatDateRange(event.start_date, event.end_date) }}
              </p>
              <p v-if="timeLabel" class="text-fg-muted">{{ timeLabel }}</p>
              <p v-if="event.venue || event.city" class="text-fg-muted">
                {{ [event.venue, event.city].filter(Boolean).join(', ') }}
              </p>
              <div v-if="event.fee_amount" class="mt-2 text-fg-secondary">
                Fee: {{ event.fee_currency || 'PHP' }} {{ event.fee_amount }}
              </div>
              <!-- Capacity is a CATEGORY's business in a tournament: the 3.5s
                   and the Open draw fill independently and are rarely the same
                   size, so one event-wide "2 / 16 players" was a number that
                   matched nothing anybody could enter. Open play and leagues
                   keep it, where the event really is the thing with a limit. -->
              <div v-if="!isTournament" class="flex flex-wrap items-center gap-2 text-sm">
                <span v-if="event.max_participants" class="text-fg-muted">
                  {{ registeredCount }} / {{ event.max_participants }} players
                </span>

                <!-- Singles or doubles, which the record has carried since 041
                     but nothing ever showed — an all-singles session looked
                     identical to an all-doubles one. -->
                <span
                  class="rounded-md bg-surface-3 px-2 py-0.5 text-caption font-medium capitalize text-fg-secondary"
                >
                  {{ event.match_format }}
                </span>

                <!-- What the session is doing, said plainly. -->
                <span
                  v-if="sessionState"
                  class="rounded-md px-2 py-0.5 text-caption font-medium"
                  :class="{
                    'bg-warning-soft text-warning': sessionState.tone === 'live',
                    'bg-primary-soft text-primary': sessionState.tone === 'full',
                    'bg-surface-3 text-fg-secondary': sessionState.tone === 'open',
                    'bg-surface-2 text-fg-muted': sessionState.tone === 'muted'
                  }"
                >
                  {{ sessionState.label }}
                </span>
              </div>
            </div>
            <!-- Full-width stacked buttons on a phone, a right-aligned column
                 from `sm`. Every control in here is a real thumb target either
                 way; none of them is a 140px sliver any more. -->
            <div
              class="flex shrink-0 flex-col gap-2 border-t border-border pt-4 sm:items-end sm:border-0 sm:pt-0"
            >
              <span
                class="self-start rounded-md px-3 py-1 text-xs font-medium capitalize sm:self-auto"
                :class="statusConfig[event.status]?.bg + ' ' + statusConfig[event.status]?.text"
              >
                {{ event.status.replace('_', ' ') }}
              </span>

              <!-- Start the session. Per event; courts are started individually
                   from the Courts tab once this is running. -->
              <!-- Disabled with its reason, never absent. An organiser who
                   cannot start needs to know what is missing; a button that
                   simply is not there reads as a broken page. -->
              <div v-if="canManageEvent && event.status === 'published'" class="sm:text-right">
                <button
                  :disabled="startingEvent || startBlockedReason !== null"
                  :title="startBlockedReason ?? undefined"
                  class="min-h-11 w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  @click="startEvent"
                >
                  {{ startingEvent ? 'Starting…' : 'Start Event' }}
                </button>
                <p v-if="startBlockedReason" class="mt-1 text-caption text-fg-muted">
                  {{ startBlockedReason }}
                </p>
              </div>

              <!-- Stop taking entries while play continues. Only offered on a
                   manual-close session that is still open — a scheduled one
                   closes by its own clock, and closing twice does nothing. -->
              <button
                v-if="
                  canManageEvent &&
                  !isTournament &&
                  !event.closed_at &&
                  (event.status === 'published' || event.status === 'active')
                "
                :disabled="closingSession"
                class="min-h-11 w-full rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-fg-secondary hover:bg-surface-2 disabled:opacity-50 sm:w-auto"
                @click="closeSession"
              >
                {{ closingSession ? 'Closing…' : 'Close to new players' }}
              </button>

              <button
                v-if="canManageEvent && event.status === 'active'"
                :disabled="startingEvent"
                class="min-h-11 w-full rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-fg-secondary hover:bg-surface-2 disabled:opacity-50 sm:w-auto"
                @click="completeEvent"
              >
                {{ startingEvent ? 'Ending…' : 'End Event' }}
              </button>

              <!-- Drafts are editable. Published events are not: people have
                   registered against their terms, and rewriting the date or
                   the fee underneath them is a different feature. -->
              <NuxtLink
                v-if="canManageEvent && event.status === 'draft'"
                :to="`/create-event?edit=${event.id}`"
                class="flex min-h-11 w-full items-center justify-center rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-fg-secondary hover:bg-surface-2 sm:w-auto"
              >
                Edit event
              </NuxtLink>

              <!-- Publish Button for Draft Events -->
              <button
                v-if="canManageEvent && event.status === 'draft'"
                :disabled="publishing"
                class="min-h-11 w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50 sm:w-auto"
                @click="publishOpen = true"
              >
                {{ publishing ? 'Publishing...' : 'Publish Event' }}
              </button>

              <!-- Draft only. A published event is cancelled, never deleted, so
                   the record and anyone's plans around it survive. Creator only:
                   a co-organiser runs the event, they do not own it. -->
              <button
                v-if="canManageEvent && isCreator && event.status === 'draft'"
                :disabled="deleting"
                class="min-h-11 w-full rounded-lg border border-danger/40 px-4 py-2 text-sm font-medium text-danger hover:bg-danger-soft disabled:opacity-50 sm:w-auto"
                @click="deleteOpen = true"
              >
                {{ deleting ? 'Deleting...' : 'Delete Draft' }}
              </button>

              <!-- Registration Actions.
                   Not for tournaments: entering a tournament means entering a
                   CATEGORY (a rating band, singles or doubles), and this button
                   posted to the event-level /register regardless of type — so a
                   player could be "registered" for the weekend without being in
                   any draw. The real button lives on each category card. -->
              <template
                v-if="!isTournament && (event.status === 'published' || event.status === 'active')"
              >
                <button
                  v-if="!isRegistered"
                  class="min-h-11 w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50 sm:w-auto"
                  :disabled="registering"
                  @click="openRegister"
                >
                  {{ registering ? 'Registering...' : 'Register' }}
                </button>
                <template v-else>
                  <span class="text-sm text-primary">
                    {{ myRegistration?.status === 'checked_in' ? 'Checked In' : 'Registered' }}
                  </span>
                  <button
                    v-if="myRegistration?.status === 'registered' && event.status === 'active'"
                    class="min-h-11 w-full rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50 sm:w-auto"
                    :disabled="checkingIn"
                    @click="handleCheckIn"
                  >
                    {{ checkingIn ? 'Checking in...' : 'Check In' }}
                  </button>
                  <!-- Not on a tournament. This withdraws an EVENT registration,
                       which is a different table from a category entry and means
                       nothing for one — a player who had entered two categories
                       pressed it and nothing they could see changed. Withdrawing
                       from a tournament is per-category, on the category card,
                       where the entry actually lives. -->
                  <button
                    v-if="!isTournament"
                    class="min-h-11 rounded-lg px-3 text-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-danger disabled:opacity-50"
                    :disabled="withdrawing"
                    @click="withdrawOpen = true"
                  >
                    {{ withdrawing ? 'Withdrawing...' : 'Withdraw' }}
                  </button>
                </template>
              </template>
            </div>
          </div>
        </div>

        <!-- A tournament event has no tab bar: there is nothing page-level to
             switch between once every category owns its own players, draw,
             schedule and result. Queue is deliberately absent — it is an
             open-play feature, and the tournament "Queue" tab was never one. -->
        <!--
          Live scores, for anyone watching rather than organising.

          Sits above the tabs on purpose: a spectator's question is "what is
          happening", and answering it should not require choosing a tab first.
          The same grid as the score sheet and the match view, so a result reads
          identically wherever it is seen.
        -->
        <!-- Tournaments only, now. On an open play event this listed exactly
             the matches the Matches tab lists, one scroll above them, so the
             same result appeared on the page twice — and the copy up here was
             the worse of the two, with no rounds and no sort. A tournament is
             a different question (every category at once, which no single tab
             answers) so it keeps its panel. -->
        <section v-if="hasScores && isTournament" class="mb-6">
          <h2 class="mb-2 font-display text-heading-3 text-fg">Scores</h2>
          <div class="space-y-4">
            <MatchScoreSection
              v-for="section in scoreSections"
              :key="section.key"
              :label="section.label"
              :champion="section.champion"
              :matches="section.matches"
              :default-open="scoreSections.length === 1"
            />
          </div>
        </section>

        <template v-if="isTournament">
          <!-- No event-wide "open matches" link here on purpose. A tournament
               runs one draw at a time and the screen at the desk shows the one
               being played; opening every category at once is the picture
               nobody wanted. The Open button lives on each category card
               instead — see CategoryCard. -->
          <TournamentCategorySection
            v-if="primaryTournament"
            :event="event"
            :tournament="primaryTournament"
            :fee-waiver="event.fee_waiver ?? null"
            :can-manage="canManageEvent"
            :is-organizer="isOrganizer"
            :my-player-id="myProfile?.id ?? null"
          />
          <div v-else-if="!tournamentsPending" class="rounded-xl bg-surface p-6 shadow-card">
            <p class="text-fg-muted">
              This tournament has no draw set up yet. Editing the event recreates it.
            </p>
          </div>
        </template>

        <template v-else>
          <!-- The session strip and the tabs, pinned together.

               The page header carries everything about the event - fee, venue,
               capacity, organiser controls - and scrolls away within a screen
               of the board. During a session that is the wrong trade: the one
               fact worth keeping on screen is that a game is on, and the tabs
               have to stay reachable while somebody scrolls a long evening.

               `top-14` clears the layout's fixed mobile bar; the desktop shell
               puts its navigation down the left, so there is nothing to clear. -->
          <div class="sticky top-14 z-20 -mx-4 mb-4 bg-canvas px-4 pt-2 lg:top-0">
            <div
              v-if="event.status === 'active'"
              class="mb-2 flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2"
            >
              <div class="min-w-0">
                <p class="truncate text-body-2 font-bold text-fg">{{ event.name }}</p>
                <p class="truncate text-caption text-fg-muted">
                  {{ formatDateRange(event.start_date, event.end_date) }}
                  <span v-if="hasLiveCourt"> · Round {{ sessionRound }}</span>
                </p>
              </div>

              <span
                v-if="hasLiveCourt"
                class="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-danger-soft px-2.5 py-1 text-caption font-bold uppercase tracking-wide text-danger"
              >
                <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" aria-hidden="true" />
                Live
              </span>
            </div>

            <!-- Tabs.

               Two primary tabs sized to be hit, and the rest folded behind
               "More". The five peers this replaced all looked equally
               important, which made the live board - the only one anybody
               opens mid-session - no easier to reach than the entry fee. -->
            <!-- Scrolls rather than overflows. The five tabs need roughly
                 450px of minimum content and a 360px phone has 328px, so the
                 row used to push the whole page sideways. The two primary tabs
                 stay put and hold their share; only "More" scrolls away. -->
            <div
              class="flex items-center gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <div class="flex shrink-0 gap-1 rounded-lg bg-surface p-1 sm:min-w-0 sm:flex-1">
                <button
                  v-for="tab in primaryTabs"
                  :key="tab.id"
                  class="min-h-11 shrink-0 whitespace-nowrap rounded-md px-4 text-sm font-semibold transition-colors sm:min-w-0 sm:flex-1 sm:truncate"
                  :class="
                    activeTab === tab.id
                      ? 'bg-primary text-on-primary'
                      : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
                  "
                  @click="activeTab = tab.id"
                >
                  {{ tab.label }}
                  <span v-if="tab.id === 'matches' && matchesData?.data" class="ml-1 text-xs">
                    ({{ matchesData.data.length }})
                  </span>
                  <!-- The red LIVE dot: a player scanning the tab bar should be
                     able to tell a game is on without opening anything. -->
                  <span
                    v-if="tab.id === 'matches' && hasLiveCourt"
                    class="ml-1.5 inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-danger align-middle"
                    aria-label="A game is live"
                  />
                </button>
              </div>

              <div class="flex shrink-0 gap-1 rounded-lg bg-surface p-1">
                <button
                  v-for="tab in moreTabs"
                  :key="tab.id"
                  class="min-h-11 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors"
                  :class="
                    activeTab === tab.id
                      ? 'bg-surface-3 text-fg'
                      : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
                  "
                  @click="activeTab = tab.id"
                >
                  {{ tab.label }}
                  <span v-if="tab.id === 'players' && registrationsData?.data" class="ml-1 text-xs">
                    ({{ registrationsData.data.length }})
                  </span>
                </button>
              </div>
            </div>
          </div>

          <!-- Tab Content: Info -->
          <div v-if="activeTab === 'info'" class="space-y-4">
            <!-- About. The description was previously a paragraph in the page
               header and was never editable; it is the substance of the Info
               tab, so it lives here and organisers can change it in place. -->
            <div class="rounded-xl bg-surface p-6 shadow-card">
              <div class="mb-3 flex items-center justify-between gap-3">
                <h2 class="font-display text-heading-3 text-fg">About this event</h2>
                <button
                  v-if="canManageEvent && !editingDescription"
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-fg-secondary transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  @click="startEditDescription"
                >
                  <UiIcon name="edit" size="h-4 w-4" />
                  Edit
                </button>
              </div>

              <div v-if="editingDescription" class="space-y-3">
                <textarea
                  v-model="descriptionDraft"
                  rows="5"
                  maxlength="2000"
                  placeholder="What should players know about this event? Format, skill level, what to bring…"
                  class="w-full rounded-lg border border-border-strong bg-canvas px-3 py-2 text-fg placeholder-fg-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <p v-if="descriptionError" class="text-sm text-danger">{{ descriptionError }}</p>
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    :disabled="savingDescription"
                    class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
                    @click="saveDescription"
                  >
                    {{ savingDescription ? 'Saving…' : 'Save' }}
                  </button>
                  <button
                    type="button"
                    :disabled="savingDescription"
                    class="rounded-lg px-4 py-2 text-sm font-medium text-fg-secondary hover:bg-surface-2 disabled:opacity-50"
                    @click="cancelEditDescription"
                  >
                    Cancel
                  </button>
                  <span class="ml-auto text-xs text-fg-muted">
                    {{ descriptionDraft.length }} / 2000
                  </span>
                </div>
              </div>

              <template v-else>
                <p v-if="event.description" class="whitespace-pre-line text-fg-secondary">
                  {{ event.description }}
                </p>
                <p v-else class="text-sm text-fg-muted">
                  {{
                    canManageEvent
                      ? 'No description yet. Add one so players know what to expect.'
                      : 'The organiser has not added a description for this event.'
                  }}
                </p>
              </template>

              <!-- The same facts as the header, laid out as a definition list.
                 The header is a summary strip; this is where someone deciding
                 whether to turn up actually reads them. -->
              <dl class="mt-6 grid gap-x-6 gap-y-3 border-t border-border pt-4 sm:grid-cols-2">
                <div>
                  <dt class="text-xs uppercase tracking-wide text-fg-muted">When</dt>
                  <dd class="mt-0.5 text-sm text-fg">
                    {{ formatDateRange(event.start_date, event.end_date) }}
                    <span v-if="timeLabel" class="block text-fg-secondary">{{ timeLabel }}</span>
                  </dd>
                </div>
                <div>
                  <dt class="text-xs uppercase tracking-wide text-fg-muted">Where</dt>
                  <dd class="mt-0.5 text-sm text-fg">
                    {{
                      [event.venue, event.city, event.province].filter(Boolean).join(', ') ||
                      'Venue not set'
                    }}
                  </dd>
                </div>
                <div>
                  <dt class="text-xs uppercase tracking-wide text-fg-muted">Format</dt>
                  <dd class="mt-0.5 text-sm text-fg">
                    {{ eventTypeLabels[event.event_type] || event.event_type }}
                    <span class="text-fg-muted">
                      · {{ event.affects_rating ? 'Ranked' : 'Casual' }}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt class="text-xs uppercase tracking-wide text-fg-muted">Entry fee</dt>
                  <dd class="mt-0.5 text-sm text-fg">
                    <template v-if="event.fee_amount">
                      {{ event.fee_currency || 'PHP' }} {{ event.fee_amount }}
                    </template>
                    <template v-else>Free</template>
                  </dd>
                </div>
                <!-- Same reasoning as the header count: a tournament's numbers
                     are per category, and the cards below carry them. -->
                <div v-if="!isTournament">
                  <dt class="text-xs uppercase tracking-wide text-fg-muted">Players</dt>
                  <dd class="mt-0.5 text-sm text-fg">
                    {{ registeredCount }}
                    <template v-if="event.max_participants">
                      / {{ event.max_participants }} registered
                    </template>
                    <template v-else>registered</template>
                  </dd>
                </div>
                <!-- Nothing on this page ever said how long a game is. It
                     could not: until 054 the answer was a constant. -->
                <div v-if="!isTournament && event.event_type !== 'coaching'">
                  <dt class="text-xs uppercase tracking-wide text-fg-muted">Scoring</dt>
                  <dd class="mt-0.5 text-sm tabular-nums text-fg">{{ scoringSummary }}</dd>
                </div>
                <div v-if="!isTournament">
                  <dt class="text-xs uppercase tracking-wide text-fg-muted">Courts</dt>
                  <dd class="mt-0.5 text-sm tabular-nums text-fg">
                    {{ event.queue_courts }}
                    {{ event.queue_courts === 1 ? 'court' : 'courts' }}
                  </dd>
                </div>
                <div v-if="event.registration_closes">
                  <dt class="text-xs uppercase tracking-wide text-fg-muted">Registration closes</dt>
                  <dd class="mt-0.5 text-sm text-fg">
                    {{ formatDateRange(event.registration_closes, event.registration_closes) }}
                  </dd>
                </div>
              </dl>
            </div>

            <!-- Record a result. The organiser's, not the players': results are
                 entered by whoever runs the session and are final on save. Gated
                 on canManageEvent like every other organiser control, so an
                 owner browsing in player mode sees what a player sees. Only for
                 sessions without a draw - a tournament records through its
                 bracket. -->
            <div
              v-if="
                event.event_type !== 'tournament' && canManageEvent && event.status === 'active'
              "
              class="rounded-xl bg-surface p-6 shadow-card"
            >
              <NuxtLink
                :to="`/matches/submit?event=${eventId}`"
                class="block w-full rounded-lg bg-primary py-3 text-center font-medium text-on-primary hover:bg-primary-hover"
              >
                Record a result
              </NuxtLink>
              <p class="mt-2 text-center text-caption text-fg-muted">
                Entered by you as organiser. Counts the moment it is saved.
              </p>
            </div>

            <!-- Who else runs this. Organisers only: a participant does not
                 need the roster of the desk. The creator edits; a co-organiser
                 reads. -->
            <EventCoOrganizersPanel
              v-if="canManageEvent"
              :event-id="eventId"
              :co-organizers="coOrganizers"
              :can-edit="isCreator"
              @updated="setCoOrganizers"
            />

            <!-- Queue Settings Info -->
            <div v-if="event.queue_enabled" class="rounded-xl bg-surface p-6 shadow-card">
              <h2 class="mb-3 font-display text-heading-3 text-fg">
                {{ queueModeLabel(event.queue_mode) }}
              </h2>
              <p class="text-fg-secondary">
                {{ queueModeDescription(event.queue_mode) }}
              </p>
              <p class="mt-1 text-sm text-fg-muted">
                {{ event.queue_courts }}
                {{ event.queue_courts === 1 ? 'court' : 'courts' }} in rotation.
              </p>
            </div>
          </div>

          <!-- Tab Content: Matches — the live board.

               Courts in play and games already finished, grouped by round in
               one scroll. See EventLiveBoard for why these stopped being two
               tabs. -->
          <div v-if="activeTab === 'matches'" class="space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-caption text-fg-muted">
                <span v-if="courtsUpdatedAt">
                  Updated {{ courtsUpdatedAt.toLocaleTimeString() }} · refreshes every few seconds
                </span>
                <span v-else>Live scores refresh automatically.</span>
              </p>
              <UiButton variant="ghost" class="min-h-11" @click="refreshCourts">Refresh</UiButton>
            </div>

            <!-- Court labels.

                 `event_courts.court_name` has been rendered everywhere since
                 017 as `court_name || \`Court ${court_number}\``, and nothing
                 could ever write it — so a venue whose courts are signposted
                 "Center" or "A" through "D" was sending players to numbers
                 that matched nothing on the fence. Organiser-only, and folded
                 away, because it is setup rather than something to read
                 mid-session. -->
            <details
              v-if="canManageEvent && courts.length"
              class="rounded-xl bg-surface shadow-card"
            >
              <summary
                class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-body-2 font-medium text-fg-secondary transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Name your courts
                <span class="text-caption text-fg-muted">
                  {{ courts.length }} {{ courts.length === 1 ? 'court' : 'courts' }}
                </span>
              </summary>

              <div class="space-y-2 border-t border-border px-4 py-3">
                <p class="text-caption text-fg-muted">
                  Match the signs at the venue. Leave one blank to go back to its number.
                </p>

                <div
                  v-for="court in courts"
                  :key="court.id"
                  class="flex flex-wrap items-center gap-2 rounded-lg bg-canvas p-3"
                >
                  <template v-if="renamingCourtId === court.id">
                    <label :for="`court-name-${court.id}`" class="sr-only">
                      Name for court {{ court.court_number }}
                    </label>
                    <input
                      :id="`court-name-${court.id}`"
                      v-model="courtNameDraft"
                      type="text"
                      maxlength="40"
                      :placeholder="`Court ${court.court_number}`"
                      class="min-h-11 min-w-0 flex-1 rounded-lg border border-border-strong bg-surface px-3 text-body-2 text-fg placeholder-fg-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                      @keyup.enter="saveCourtName"
                      @keyup.esc="cancelRenameCourt"
                    />
                    <UiButton size="sm" :disabled="savingCourtName" @click="saveCourtName">
                      {{ savingCourtName ? 'Saving…' : 'Save' }}
                    </UiButton>
                    <UiButton
                      variant="ghost"
                      size="sm"
                      :disabled="savingCourtName"
                      @click="cancelRenameCourt"
                    >
                      Cancel
                    </UiButton>
                  </template>

                  <template v-else>
                    <span class="min-w-0 flex-1 truncate text-body-2 text-fg">
                      {{ court.court_name || `Court ${court.court_number}` }}
                      <span
                        v-if="court.court_name"
                        class="ml-1 text-caption tabular-nums text-fg-muted"
                      >
                        · court {{ court.court_number }}
                      </span>
                    </span>
                    <UiButton variant="ghost" size="sm" @click="startRenameCourt(court)">
                      Rename
                    </UiButton>
                  </template>
                </div>
              </div>
            </details>

            <EventLiveBoard
              :event-id="eventId"
              :courts="courts"
              :matches="matchesData?.data ?? []"
              :current-round="sessionRound"
              :court-count="event.queue_courts"
              :rules="sessionRules"
              :can-manage="canManageEvent"
              :busy-court-id="courtBusyId"
              :loading="matchesPending && !matchesData"
              @score="updateCourtScore"
              @submit="submitCourtScore"
              @start="openStartCourt"
            />
          </div>

          <!-- Tab Content: Players -->
          <div v-if="activeTab === 'players'" class="rounded-xl bg-surface p-6 shadow-card">
            <!--
              EV-8. Both counts appeared with no stated difference, so nobody
              could tell what either meant or why the queue drew on one and not
              the other. Said once, here, rather than left to be inferred.
            -->
            <div class="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-caption">
              <span class="flex items-center gap-1.5">
                <span class="h-2 w-2 rounded-pill bg-primary" />
                <span class="font-medium text-fg">{{ checkedInCount }} checked in</span>
                <span class="text-fg-muted">— here and in the rotation</span>
              </span>
              <span class="flex items-center gap-1.5">
                <span class="h-2 w-2 rounded-pill bg-border-strong" />
                <span class="font-medium text-fg-secondary"
                  >{{ registeredOnlyCount }} registered</span
                >
                <span class="text-fg-muted">— holding a slot, not arrived</span>
              </span>
            </div>

            <div v-if="registrationsPending" class="space-y-3">
              <div v-for="i in 5" :key="i" class="h-12 animate-pulse rounded-lg bg-canvas" />
            </div>
            <div v-else-if="!registrationsData?.data.length" class="text-center py-8">
              <p class="text-fg-muted">No players registered yet.</p>
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="reg in registrationsData.data"
                :key="reg.id"
                class="flex items-center justify-between rounded-lg bg-canvas p-3"
              >
                <div class="flex items-center gap-3">
                  <div
                    class="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 p-1.5"
                  >
                    <UiBrandImage />
                  </div>
                  <div>
                    <NuxtLink
                      :to="`/players/${reg.player_id}`"
                      class="font-medium text-fg hover:text-primary"
                    >
                      {{ reg.player?.display_name || 'Unknown' }}
                    </NuxtLink>
                    <p v-if="reg.player?.rating" class="text-sm text-fg-muted">
                      Rating: {{ reg.player.rating.toFixed(2) }}
                    </p>
                  </div>
                </div>
                <div class="text-right">
                  <span
                    class="rounded px-2 py-0.5 text-xs"
                    :class="
                      reg.status === 'checked_in'
                        ? 'bg-primary-soft text-primary'
                        : 'bg-surface-3 text-fg-muted'
                    "
                  >
                    {{ reg.status === 'checked_in' ? 'Checked In' : 'Registered' }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Tab Content: Rankings -->
          <!-- Standings, on the shared RankingBoard. `record` rather than
             `rating`: this endpoint aggregates wins and losses from verified
             matches and deliberately carries no rating delta (rating_transactions
             is select-own under RLS, so a shared leaderboard cannot show another
             player's movement without a service-role bypass). -->

          <div v-if="activeTab === 'rankings'">
            <RankingBoard
              :entries="rankingsData?.data ?? []"
              variant="record"
              :loading="rankingsPending"
              :highlight-id="myProfile?.id ?? null"
              :glow="false"
              empty-title="No standings yet"
              empty-message="Standings appear once matches at this event have been verified."
              @select="navigateTo(`/players/${$event.player_id}`)"
            />
          </div>

          <!-- Tab Content: Queue -->
          <div v-if="activeTab === 'queue'" class="space-y-4">
            <template v-if="event.queue_enabled">
              <div class="rounded-xl bg-surface p-6 shadow-card">
                <p class="text-sm text-fg-muted">
                  {{ event.queue_courts }}
                  {{ event.queue_courts === 1 ? 'court' : 'courts' }} ·
                  {{ queueModeLabel(event.queue_mode) }} · {{ scoringSummary }}
                </p>

                <!-- Pairing, where the queue is actually run.

                     This used to be a pair of radios on the Info tab bound to a
                     local ref, so it looked like a setting, changed nothing,
                     and reset on reload — while the real `queue_mode` was
                     printed as a heading directly above it with no way to
                     change it. The two could disagree on screen. One control
                     now, writing the stored field, in the words the rest of the
                     app already uses for it. -->
                <div v-if="canManageEvent" class="mt-4 border-t border-border pt-4">
                  <p class="mb-2 text-sm font-medium text-fg-secondary">How to pair players</p>
                  <div class="grid gap-2 sm:grid-cols-3">
                    <button
                      v-for="mode in QUEUE_MODES"
                      :key="mode"
                      type="button"
                      :disabled="savingQueueMode"
                      class="rounded-lg border-2 p-3 text-left text-sm transition-all disabled:opacity-60"
                      :class="
                        event.queue_mode === mode
                          ? 'border-primary bg-primary/5'
                          : 'border-border-strong hover:border-primary/40'
                      "
                      @click="setQueueMode(mode)"
                    >
                      <span class="block font-medium text-fg">{{ queueModeLabel(mode) }}</span>
                      <span class="mt-0.5 block text-xs text-fg-muted">
                        {{ queueModeDescription(mode) }}
                      </span>
                    </button>
                  </div>

                  <!-- The rotation preview belongs to Mix & Match and nothing
                       else: it exists to show that nobody repeats a partner. -->
                  <div v-if="event.queue_mode === 'random'" class="mt-4">
                    <div class="flex flex-wrap items-end gap-3">
                      <div>
                        <label for="mixup-rounds" class="mb-1 block text-xs text-fg-secondary">
                          Rounds
                        </label>
                        <input
                          id="mixup-rounds"
                          v-model.number="mixupRounds"
                          type="number"
                          min="1"
                          max="20"
                          class="w-24 rounded-lg border border-border-strong bg-canvas px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                      </div>
                      <UiButton :disabled="generatingMixup" @click="generateMixup">
                        {{ generatingMixup ? 'Generating…' : 'Generate rotation' }}
                      </UiButton>
                    </div>

                    <p class="mt-2 text-xs text-fg-muted">
                      A preview — nothing is saved. Courts are still started one at a time, so
                      latecomers and early leavers do not break the evening.
                    </p>

                    <!-- The generated rounds -->
                    <div v-if="mixupSchedule?.rounds.length" class="mt-4 space-y-3">
                      <div
                        v-for="round in mixupSchedule.rounds"
                        :key="round.round_number"
                        class="rounded-lg bg-canvas p-3"
                      >
                        <p class="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                          Round {{ round.round_number }}
                        </p>
                        <ul class="mt-2 space-y-1">
                          <li
                            v-for="match in round.matches"
                            :key="match.court_number"
                            class="flex flex-wrap items-baseline gap-2 text-sm text-fg-secondary"
                          >
                            <span class="text-xs text-fg-muted"
                              >Court {{ match.court_number }}</span
                            >
                            <span class="text-fg">{{ sideNames(match.team1) }}</span>
                            <span class="text-fg-muted">vs</span>
                            <span class="text-fg">{{ sideNames(match.team2) }}</span>
                          </li>
                        </ul>
                        <p v-if="round.sitting_out.length" class="mt-1.5 text-xs text-fg-muted">
                          Sitting out:
                          {{ round.sitting_out.map((p) => sideNames({ players: [p] })).join(', ') }}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  v-if="queueError"
                  class="mt-4 rounded-lg bg-danger-soft p-3 text-sm text-danger"
                >
                  {{ queueError }}
                </div>

                <!-- Join / Leave -->
                <div v-if="isRegistered && !canManageEvent" class="mt-4">
                  <div
                    v-if="myQueueEntry"
                    class="flex items-center justify-between rounded-lg bg-canvas p-4"
                  >
                    <div>
                      <p class="font-medium text-fg">You're in the queue</p>
                      <p class="text-sm text-fg-muted">
                        Status: <span class="capitalize">{{ myQueueEntry.status }}</span>
                        <span v-if="myQueueEntry.court_number">
                          · Court {{ myQueueEntry.court_number }}</span
                        >
                      </p>
                    </div>
                    <button
                      v-if="myQueueEntry.status === 'waiting'"
                      :disabled="leavingQueue"
                      class="rounded-lg border border-danger px-4 py-2 text-sm font-medium text-danger hover:bg-danger-soft disabled:opacity-50"
                      @click="handleLeaveQueue"
                    >
                      {{ leavingQueue ? 'Leaving...' : 'Leave Queue' }}
                    </button>
                  </div>
                  <!-- The format is stated, not asked. It is a property of the
                       session, and the only thing left for the player to decide
                       is who they are playing with. -->
                  <div v-else class="rounded-lg bg-canvas p-4">
                    <p class="text-sm text-fg">
                      <span class="font-medium capitalize">{{ joinMatchType }}</span>
                      <span class="text-fg-muted"> · {{ joinFormatNote }}</span>
                    </p>

                    <div class="mt-3 flex flex-wrap items-end gap-3">
                      <!-- Absent in Mix & Match: the rotation pairs you, so
                           there is nothing to choose. -->
                      <div v-if="joinMatchType === 'doubles' && !queuePairsForYou" class="min-w-0">
                        <label for="queue-partner" class="mb-1.5 block text-xs text-fg-secondary">
                          Partner
                        </label>
                        <select
                          id="queue-partner"
                          v-model="joinPartnerId"
                          class="min-h-11 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 sm:w-56"
                        >
                          <option value="" disabled>Select partner</option>
                          <option
                            v-for="p in availablePartners"
                            :key="p.player_id"
                            :value="p.player_id"
                          >
                            {{ p.player?.display_name || 'Unknown'
                            }}{{ p.player_id === defaultPartnerId ? ' ★ your duo' : '' }}
                          </option>
                        </select>
                        <!-- Nobody to pair with is a state, not an error: a
                             session with one registered player has no partner
                             to offer and the button below would fail with a
                             message that sounds like the player's fault. -->
                        <p v-if="!availablePartners.length" class="mt-1 text-caption text-fg-muted">
                          Nobody else is registered yet.
                        </p>
                      </div>
                      <button
                        :disabled="joiningQueue"
                        class="min-h-11 w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50 sm:w-auto"
                        @click="handleJoinQueue"
                      >
                        {{ joiningQueue ? 'Joining…' : 'Join queue' }}
                      </button>
                    </div>
                  </div>
                </div>
                <p v-else-if="!canManageEvent" class="mt-4 text-sm text-fg-muted">
                  Register for this event to join the queue.
                </p>

                <!-- Organizer: put the next pair on a court -->
                <div v-if="canManageEvent" class="mt-4 rounded-lg bg-canvas p-4">
                  <h3 class="mb-1 text-body-2 font-medium text-fg">Next on court</h3>
                  <!-- Said "First come, first served." on every session, so a
                       Rating Based or Mix &amp; Match organiser was told the
                       opposite of what the server does. -->
                  <p class="mb-3 text-xs text-fg-muted">
                    {{ queueModeDescription(event.queue_mode) }}
                  </p>

                  <div v-if="!nextPair" class="text-sm text-fg-muted">
                    Two waiting entries of the same format are needed before a match can start.
                  </div>
                  <div v-else class="flex flex-wrap items-end gap-3">
                    <p class="min-w-0 flex-1 text-sm text-fg">
                      {{ entryLabel(nextPair.first) }}
                      <span class="text-fg-muted">vs</span>
                      {{ entryLabel(nextPair.second) }}
                      <span class="text-xs capitalize text-fg-muted">
                        · {{ nextPair.first.match_type }}
                      </span>
                    </p>
                    <UiSelect
                      v-model="matchCourtNumber"
                      :options="courtChoices"
                      aria-label="Court to start on"
                      size="sm"
                    />
                    <button
                      type="button"
                      :disabled="matchingQueue"
                      class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
                      @click="handleMatchNextPair"
                    >
                      {{ matchingQueue ? 'Matching…' : 'Match next' }}
                    </button>
                  </div>

                  <!-- Kept for injuries and no-shows, which is the only reason to
                     depart from the order people queued in. -->
                  <button
                    v-if="waitingEntries.length >= 2"
                    type="button"
                    class="mt-3 text-xs text-fg-muted transition-colors hover:text-fg"
                    :aria-expanded="showManualPick"
                    @click="showManualPick = !showManualPick"
                  >
                    {{ showManualPick ? 'Hide manual pick' : 'Pick manually' }}
                  </button>

                  <div
                    v-if="showManualPick"
                    class="mt-3 flex flex-wrap items-end gap-3 border-t border-border pt-3"
                  >
                    <select
                      v-model="selectedEntry1"
                      class="rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      <option value="" disabled>Player/Pair 1</option>
                      <option v-for="e in waitingEntries" :key="e.id" :value="e.id">
                        {{ e.player?.display_name
                        }}{{ e.partner ? ` & ${e.partner.display_name}` : '' }}
                      </option>
                    </select>
                    <select
                      v-model="selectedEntry2"
                      class="rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      <option value="" disabled>Player/Pair 2</option>
                      <option v-for="e in waitingEntries" :key="e.id" :value="e.id">
                        {{ e.player?.display_name
                        }}{{ e.partner ? ` & ${e.partner.display_name}` : '' }}
                      </option>
                    </select>
                    <input
                      v-model="matchCourtNumber"
                      type="number"
                      min="1"
                      :max="event.queue_courts"
                      placeholder="Court #"
                      aria-label="Court number for the manual pick"
                      class="w-24 rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg placeholder-fg-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    <button
                      type="button"
                      :disabled="matchingQueue"
                      class="rounded-lg border border-border-strong px-4 py-2 text-sm text-fg-secondary hover:bg-surface-2 disabled:opacity-50"
                      @click="handleMatchEntries"
                    >
                      {{ matchingQueue ? 'Matching…' : 'Match this pair' }}
                    </button>
                  </div>
                </div>
              </div>

              <!-- Queue List -->
              <div class="rounded-xl bg-surface p-6 shadow-card">
                <h3 class="mb-1 text-body-1 font-medium text-fg">
                  Waiting ({{ waitingEntries.length }})
                </h3>
                <!-- The second place this sentence was hardcoded. On a Rating
                     Based or Mix & Match session it described the opposite of
                     what the server does. -->
                <p class="mb-4 text-xs text-fg-muted">
                  {{ queueModeDescription(event.queue_mode) }}
                </p>
                <div v-if="queuePending" class="space-y-3">
                  <div v-for="i in 3" :key="i" class="h-14 animate-pulse rounded-lg bg-canvas" />
                </div>
                <div v-else-if="waitingEntries.length === 0" class="text-center py-6">
                  <p class="text-fg-muted">No one is waiting in the queue.</p>
                </div>
                <div v-else class="space-y-2">
                  <div
                    v-for="(e, i) in waitingEntries"
                    :key="e.id"
                    class="flex items-center justify-between rounded-lg bg-canvas p-3"
                  >
                    <div class="flex items-center gap-3">
                      <span
                        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums"
                        :class="
                          i === 0
                            ? 'bg-primary-soft text-primary'
                            : 'bg-surface-2 text-fg-secondary'
                        "
                        :title="`Position ${i + 1} in the queue`"
                      >
                        #{{ i + 1 }}
                      </span>
                      <span class="min-w-0">
                        <span class="block truncate text-fg">
                          <template v-for="(player, n) in entryPlayers(e)" :key="player.id ?? n"
                            ><span v-if="n > 0"> &amp; </span
                            ><UiPlayerLink :player-id="player.id" :name="player.name"
                          /></template>
                        </span>
                        <span class="block text-xs text-fg-muted">
                          <span class="capitalize">{{ e.match_type }}</span>
                          · {{ waitedFor(e.joined_at, clockNow) }}
                        </span>
                      </span>
                    </div>
                    <button
                      v-if="canManageEvent"
                      class="min-h-11 shrink-0 rounded-lg px-3 text-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-danger"
                      :aria-label="`Skip ${entryLabel(e)}`"
                      @click="handleSkipEntry(e.id)"
                    >
                      Skip
                    </button>
                  </div>
                </div>

                <div v-if="activeEntries.length > 0" class="mt-6">
                  <h3 class="mb-3 font-display text-heading-3 text-fg">On Court</h3>
                  <div class="space-y-2">
                    <div
                      v-for="e in activeEntries"
                      :key="e.id"
                      class="flex items-center justify-between rounded-lg bg-canvas p-3"
                    >
                      <span class="text-fg">
                        <template v-for="(player, n) in entryPlayers(e)" :key="player.id ?? n"
                          ><span v-if="n > 0"> &amp; </span
                          ><UiPlayerLink :player-id="player.id" :name="player.name"
                        /></template>
                      </span>
                      <span class="text-sm text-primary">Court {{ e.court_number }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </template>
            <template v-else>
              <div class="rounded-xl bg-surface p-6 text-center py-8 shadow-card">
                <p class="text-fg-muted">Queue system is not enabled for this event.</p>
              </div>
            </template>
          </div>
        </template>

        <!-- Back Link -->
        <div class="mt-6 text-center">
          <button
            type="button"
            class="min-h-11 rounded-button px-3 text-sm text-primary transition-colors hover:bg-surface-2 hover:underline"
            @click="goBack"
          >
            Back
          </button>
        </div>
      </template>
    </div>

    <!-- What entering this session costs, before committing to it. Same
         component the tournament categories use, so the two paths quote money
         the same way. -->
    <TournamentRegisterSummaryModal
      v-if="event"
      v-model="registerOpen"
      :category-name="event.name"
      :is-doubles="false"
      :partner-name="null"
      :subtitle="eventTypeLabels[event.event_type] ?? 'Event'"
      :fee-amount="event.fee_amount"
      :fee-currency="event.fee_currency ?? 'PHP'"
      :rules="feeRules"
      :fee-waiver="event.fee_waiver ?? null"
      payment-note="Online payment is not switched on yet — your place is held and you pay the organiser at the venue."
      :submitting="registering"
      :error="registerError"
      @confirm="handleRegister"
    />

    <!-- Confirmations. `UiModal` already carries the focus trap, focus
         restore, Escape handling and destructive styling these need. -->
    <UiModal
      v-model="withdrawOpen"
      title="Withdraw from this event?"
      description="Your place is released and someone on the waitlist can take it."
      confirm-label="Withdraw"
      destructive
      :loading="withdrawing"
      @confirm="handleWithdraw"
    />
    <UiModal
      v-model="publishOpen"
      title="Publish this event?"
      description="It becomes visible to all players and can no longer be deleted."
      confirm-label="Publish"
      :loading="publishing"
      @confirm="handlePublishEvent"
    />
    <UiModal
      v-model="deleteOpen"
      title="Delete this draft event?"
      description="Its tournaments and categories go with it. This cannot be undone."
      confirm-label="Delete"
      destructive
      :loading="deleting"
      @confirm="handleDeleteEvent"
    />

    <!-- Start a court. hide-actions because Confirm has to be disabled until
         two different sides are chosen, which the built-in row cannot express. -->
    <UiModal
      v-model="startCourtOpen"
      :title="startCourtLabel ? `Start a game on ${startCourtLabel}` : 'Start a game'"
      description="Pick the two sides from the players waiting."
      hide-actions
    >
      <div class="space-y-4">
        <div v-if="waitingEntries.length < 2" class="rounded-button bg-canvas p-4 text-center">
          <p class="text-body-2 text-fg-muted">
            At least two entries need to be waiting in the queue before a court can start.
          </p>
        </div>

        <template v-else>
          <div>
            <label for="court-team1" class="mb-1.5 block text-body-2 font-medium text-fg-secondary">
              Side 1
            </label>
            <select
              id="court-team1"
              v-model="startTeam1"
              class="w-full rounded-button border border-border-strong bg-canvas px-3 py-2 text-body-2 text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option v-for="entry in waitingEntries" :key="entry.id" :value="entry.id">
                {{ queueEntryLabel(entry) }}
              </option>
            </select>
          </div>

          <div>
            <label for="court-team2" class="mb-1.5 block text-body-2 font-medium text-fg-secondary">
              Side 2
            </label>
            <select
              id="court-team2"
              v-model="startTeam2"
              class="w-full rounded-button border border-border-strong bg-canvas px-3 py-2 text-body-2 text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option v-for="entry in waitingEntries" :key="entry.id" :value="entry.id">
                {{ queueEntryLabel(entry) }}
              </option>
            </select>
          </div>

          <p v-if="startTeam1 && startTeam1 === startTeam2" class="text-caption text-danger">
            Pick two different sides.
          </p>
        </template>

        <div class="flex justify-end gap-2">
          <UiButton variant="ghost" :disabled="startingCourt" @click="startCourtOpen = false">
            Cancel
          </UiButton>
          <UiButton
            :disabled="startingCourt || !startTeam1 || !startTeam2 || startTeam1 === startTeam2"
            @click="confirmStartCourt"
          >
            {{ startingCourt ? 'Starting…' : 'Start game' }}
          </UiButton>
        </div>
      </div>
    </UiModal>
  </div>
</template>
