<script setup lang="ts">
import type { PlayerProfileDto } from '~/server/domains/player/dto/player-profile.dto'
import type { PlayerRatingDto, RatingType } from '~/server/domains/rating/dto/rating.dto'
import type { PlayerKudosDto } from '~/server/domains/kudos/dto/kudos.dto'
import type {
  PlayerStatsDto,
  RatingHistoryPointDto
} from '~/server/domains/analytics/dto/analytics.dto'
import type { ActivityDto } from '~/server/domains/activity/dto/activity.dto'
import type { LinkedEvent } from '~/server/domains/activity/services/linked-event'
import type { RosterMemberDto } from '~/server/domains/club/dto/club-membership.dto'

interface Achievement {
  id: string
  name: string
  tier: string
  points: number
}

interface PlayerAchievement {
  achievement_id: string
  unlocked_at: string
  achievement: Achievement
}

interface MatchSummary {
  id: string
  match_type: 'singles' | 'doubles'
  status: string
  played_at: string
  /**
   * `player_id` and `display_name` are null for a participant who has not
   * published their own history (067). The id goes with the name — keeping it
   * would leave the hidden player one public lookup away.
   */
  participants: Array<{
    player_id: string | null
    team_number: 1 | 2
    display_name: string | null
    redacted?: boolean
  }>
  scores: Array<{ set_number: number; team1_score: number; team2_score: number }>
}

/**
 * The badge on this player's profile.
 *
 * Mirrors BadgeDto (server/domains/badge/dto/badge.dto.ts). It is resolved
 * server-side against the achievements this player actually holds, so anything
 * that arrives here is earned — the endpoint returns null rather than a badge
 * the record does not support.
 */
interface SelectedBadge {
  /** The achievement key. */
  id: string
  name: string
  icon: string | null
  description: string
  tier: string
  earnedAt: string
}

/**
 * A tournament title. Mirrors ChampionshipDto
 * (server/domains/achievement/services/championship.service.ts).
 */
interface ChampionshipDto {
  placement: 1 | 2
  tournament_id: string
  category_id: string | null
  /** "Summer Slam — 3.5 Mixed Doubles". */
  label: string
  event_name: string | null
  category_name: string | null
  decided_at: string | null
  /** Null when the tournament has no event page to link to. */
  href: string | null
}

const route = useRoute()
const user = useSupabaseUser()

/**
 * Duo and TeamUp are player-to-player relationships. A club is not a party to
 * either, so while acting as one the whole block is replaced rather than
 * disabled — a club pressing "Follow" has nothing sensible to mean, and the
 * request it sent would have come from the person behind the club account
 * rather than the club.
 *
 * What a club actually wants from a player's profile is to bring them in, so
 * that is what it is offered instead — and it now actually invites them
 * (051-club-invitations). It used to be a link to the club's own page, because
 * no invite endpoint existed; the button looked like an action and was a
 * redirect, which is what "invite is not working" turned out to mean.
 */
const { isClubMode, activeClubId } = useAccountMode()
const playerId = computed(() => route.params.playerId as string)

const inviting = ref(false)
const invited = ref(false)

async function inviteToClub() {
  if (!activeClubId.value) {
    // No club selected to act as. Sending them to pick one beats a request that
    // cannot name a club.
    await navigateTo('/my-clubs')
    return
  }

  inviting.value = true
  try {
    await $fetch(`/api/v1/clubs/${activeClubId.value}/invites`, {
      method: 'POST',
      body: { player_id: playerId.value }
    })
    invited.value = true
    useToast().success('Invitation sent.')
  } catch (err) {
    // The server distinguishes "already a member", "already invited" and "they
    // asked first", and each of those is worth reading — so the message is
    // shown rather than flattened into a generic failure.
    useToast().error(apiErrorMessage(err, 'Could not send that invitation.'))
  } finally {
    inviting.value = false
  }
}

/**
 * Where this player already stands with the club being acted as.
 *
 * Without it the profile offered "Invite to club" to everybody — including the
 * club's own members — and the button only failed once pressed, on the server's
 * "already a member". The roster is the same list the members page reads, and
 * the club account is an admin of it, so no new endpoint is needed; it is
 * client-only because it changes nothing about what a search engine sees.
 *
 * A failure here (the account is not a member of the selected club, say) leaves
 * the relationship unknown, which falls back to offering the invitation — the
 * server still refuses the ones it should.
 */
const clubRosterQuery = useFetch<{ items: RosterMemberDto[] }>(
  () => `/api/v1/clubs/${activeClubId.value}/members`,
  {
    server: false,
    immediate: Boolean(isClubMode.value && activeClubId.value),
    watch: [activeClubId, isClubMode],
    default: () => ({ items: [] as RosterMemberDto[] })
  }
)

/** 'active' | 'invited' | 'pending' — or null when there is no live row. */
const clubRelationship = computed(() => {
  if (!isClubMode.value || !activeClubId.value) return null
  const row = clubRosterQuery.data.value?.items?.find((m) => m.player_id === playerId.value)
  if (!row) return null
  return row.status === 'active' || row.status === 'invited' || row.status === 'pending'
    ? row.status
    : null
})

/**
 * Achievements are a switchable platform surface (feature_flags,
 * 'achievements.enabled'). Turning it off in the SuperAdmin console used to do
 * nothing at all — isEnabled() had no call sites anywhere in the app — so the
 * toggle saved and the tab, the stat tile and the showcase badge all stayed.
 *
 * Hiding UI is all this does. The endpoints behind it are gated separately in
 * server/utils/require-feature.ts, because a client cannot be trusted to
 * withhold data it was already sent.
 */
const { isEnabled } = useFeatureFlags()
const achievementsEnabled = computed(() => isEnabled('achievements.enabled'))

/**
 * The six server-rendered reads for this profile, fired together.
 *
 * These were six consecutive top-level `await useFetch` calls, so setup
 * suspended on each before starting the next and the profile took as long as
 * all six queries added up — the single slowest page in the app. They still
 * await (a public profile has to render server-side for SEO), just at once.
 *
 * Header stats row and the Stats tab used to be hardcoded mock numbers (124 matches,
 * 68% win rate, etc.) — identical no matter which player's profile you opened. Both of
 * these, plus the rating-history chart and activity feed below, now come from the real
 * per-player analytics/activity endpoints, which already enforce the profile's public
 * visibility server-side.
 */
const profileQuery = useFetch<PlayerProfileDto>(() => `/api/v1/players/${playerId.value}`)
const ratingsQuery = useFetch<{
  singles: PlayerRatingDto | null
  doubles: PlayerRatingDto | null
}>(() => `/api/v1/players/${playerId.value}/ratings`)
const achievementsQuery = useFetch<{ achievements: PlayerAchievement[] }>(
  () => `/api/v1/players/${playerId.value}/achievements`
)
const statsQuery = useFetch<PlayerStatsDto>(() => `/api/v1/players/${playerId.value}/stats`)
/**
 * Doubles first, here as everywhere else on this page.
 *
 * This was pinned to `type: 'singles'` and captioned as such, directly beneath
 * a headline number that was `Math.max(singles, doubles)` — so on any player
 * whose doubles rating led, the chart and the number above it described
 * different formats without saying so. `historyType` is a ref in the query, so
 * Nuxt refetches when the toggle moves.
 */
const historyType = ref<RatingType>('doubles')
const ratingHistoryQuery = useFetch<{ history: RatingHistoryPointDto[] }>(
  () => `/api/v1/players/${playerId.value}/rating-history`,
  { query: { type: historyType, days: 180 } }
)
/** The profile's activity rows carry the shout-out's linked event, same as the feed. */
type ProfileActivity = ActivityDto & { event?: LinkedEvent | null }

/**
 * Matches the feed's shout-out date exactly — same card, same context, so it
 * should read the same in both places. Deliberately not promoted to a shared
 * util: the other two `formatEventDate` copies in this codebase format
 * differently (no weekday), and unifying them would silently restyle dates on
 * pages this change has nothing to do with.
 */
function formatEventDate(startDate: string | null): string {
  if (!startDate) return ''
  return new Date(startDate).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  })
}

const activitiesQuery = useFetch<{ activities: ProfileActivity[] }>(
  () => `/api/v1/players/${playerId.value}/activities`,
  { query: { limit: 10 } }
)

await Promise.all([
  profileQuery,
  ratingsQuery,
  achievementsQuery,
  statsQuery,
  ratingHistoryQuery,
  activitiesQuery
])

const { data: profile, pending, error } = profileQuery
/**
 * Every region gets its own `error`, because until now only `profile` had one.
 *
 * A failed `stats` call rendered "0 Matches / — / —". A failed `activities`
 * call rendered "No recent activity." A failed `clubs` call rendered "Not a
 * member of any clubs." Courtside connectivity on mobile data is a documented
 * constraint of this product, so partial failure is the normal case, not the
 * edge case — and every one of those strings is a factual claim about a real
 * person that the page had no evidence for. An organiser reading them declines
 * to invite an active player because a request timed out.
 *
 * Empty and failed are different states and now render differently.
 */
const { data: ratings, error: ratingsError } = ratingsQuery
const {
  data: achievementsData,
  error: achievementsError,
  refresh: refreshAchievements
} = achievementsQuery
const { data: stats, error: statsError, refresh: refreshStats } = statsQuery
const {
  data: ratingHistoryData,
  error: ratingHistoryError,
  refresh: refreshRatingHistory
} = ratingHistoryQuery
const { data: activitiesData, error: activitiesError, refresh: refreshActivities } = activitiesQuery

/**
 * Titles this player holds — one badge each, each linking to the draw it was
 * won in.
 *
 * Separate from the showcase badge on purpose. The showcase is one badge the
 * player picked; this is the record. A single "Tournament Champion" glyph can
 * say that somebody won something, which is the least interesting part of
 * winning it — these say which tournament, in which category, and take you
 * there.
 */
const { data: championshipsData } = useFetch<{ data: ChampionshipDto[] }>(
  () => `/api/v1/players/${playerId.value}/championships`,
  { server: false, default: () => ({ data: [] }) }
)

const championships = computed(() =>
  achievementsEnabled.value ? (championshipsData.value?.data ?? []) : []
)

/**
 * A title's hover text, and its accessible name.
 *
 * The event is the part somebody is actually looking for, so it leads; the
 * category qualifies it. `label` already carries both, joined.
 */
/**
 * Shared between the linked and unlinked trophy.
 *
 * Two elements rather than `<component :is>`: `:is="'NuxtLink'"` does not
 * resolve here and renders a literal `<nuxtlink>` custom element — markup that
 * looks right in the DOM, carries the href as an inert attribute, and cannot be
 * clicked. It typechecked and rendered; only following the badge revealed it.
 */
const TROPHY_CLASS = 'inline-flex items-center rounded-badge text-xl leading-none'

function championshipTitle(championship: ChampionshipDto): string {
  const when = championship.decided_at
    ? new Date(championship.decided_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short'
      })
    : null
  return `Champion — ${championship.label}${when ? ` · ${when}` : ''}`
}

const { data: badgeData } = useFetch<{ data: SelectedBadge | null }>(
  () => `/api/v1/players/${playerId.value}/badge`,
  { server: false }
)

const { data: myProfile } = useFetch<PlayerProfileDto | null>('/api/v1/players/me', {
  server: false
})

const isOwnProfile = computed(() => myProfile.value?.id === playerId.value)

/**
 * Reporting a player.
 *
 * Blocking already existed, but it is a private one-way mute: it hides someone
 * from you and tells nobody that anything happened. There was no way at all to
 * escalate behaviour to the platform. This goes to the SuperAdmin queue.
 *
 * The reported player is deliberately NOT notified at this point - a report is
 * an accusation until a moderator has looked at it, and announcing it on submit
 * would turn the button into the harassment tool it exists to answer.
 */
const REPORT_REASONS: { value: string; label: string }[] = [
  { value: 'harassment', label: 'Harassment or abusive behaviour' },
  { value: 'cheating', label: 'Cheating during play' },
  { value: 'fake_scores', label: 'Submitting false scores' },
  { value: 'no_show', label: 'Repeatedly not turning up' },
  { value: 'inappropriate_content', label: 'Inappropriate content' },
  { value: 'impersonation', label: 'Impersonating someone else' },
  { value: 'spam', label: 'Spam or unwanted promotion' },
  { value: 'other', label: 'Something else' }
]

const reportOpen = ref(false)
const reportReason = ref('')
const reportDetails = ref('')
const reportLoading = ref(false)
const reportError = ref('')

function openReport() {
  reportReason.value = ''
  reportDetails.value = ''
  reportError.value = ''
  reportOpen.value = true
}

async function submitReport() {
  if (!reportReason.value) {
    reportError.value = 'Pick a reason first.'
    return
  }
  reportLoading.value = true
  reportError.value = ''
  try {
    await $fetch(`/api/v1/players/${playerId.value}/report`, {
      method: 'POST',
      body: { reason: reportReason.value, details: reportDetails.value.trim() || null }
    })
    reportOpen.value = false
    useToast().success('Report submitted. The moderation team will review it.')
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    reportError.value = fetchError.data?.message ?? 'Could not submit the report.'
  } finally {
    reportLoading.value = false
  }
}

// match_participants/matches RLS restricts raw match rows to participants only — there's
// no public policy for browsing another player's individual match history, only for
// aggregate stats (fetched above). So real match data is only ever shown for your own
// profile; viewing someone else's shows an honest "private" message instead of the old
// fake match list every profile used to display.
/** The first page. 10 at a time, appended by `loadMoreMatches` below. */
const MATCH_PAGE_SIZE = 10

/**
 * Two endpoints, one tab.
 *
 * Your own history comes from `/players/me/matches` and is never redacted —
 * you are entitled to your own record in full. Someone else's comes from
 * `/players/:id/matches`, which publishes only if they opted in and names only
 * the participants who did. The tab used to have no second case at all: it told
 * every visitor "match history is only visible to the player themselves", which
 * on a public profile is everyone.
 */
const matchesEndpoint = computed(() =>
  isOwnProfile.value ? '/api/v1/players/me/matches' : `/api/v1/players/${playerId.value}/matches`
)

/** Whether there is anything to ask for. The page never calls an endpoint it
 *  knows will refuse — the server still enforces it either way. */
const matchHistoryVisible = computed(
  () => isOwnProfile.value || Boolean(profile.value?.show_match_history)
)

const {
  data: myMatchesData,
  error: myMatchesError,
  pending: myMatchesPending,
  execute: fetchMyMatches
} = useFetch<{ data: MatchSummary[] }>(() => matchesEndpoint.value, {
  query: { limit: MATCH_PAGE_SIZE, offset: 0 },
  immediate: false,
  server: false
})

watch(
  matchHistoryVisible,
  (val) => {
    if (val) fetchMyMatches()
  },
  { immediate: true }
)

/**
 * Pages 2..n, kept separate from the fetched first page.
 *
 * The tab showed the ten most recent matches and stopped there, with no way to
 * reach the eleventh — on the one screen that is meant to be a player's match
 * history.
 */
const olderMatches = ref<MatchSummary[]>([])
const matchesEnd = ref(false)
const loadingMoreMatches = ref(false)

const allMyMatches = computed(() => [...(myMatchesData.value?.data ?? []), ...olderMatches.value])

watch(
  myMatchesData,
  (value) => {
    olderMatches.value = []
    matchesEnd.value = (value?.data?.length ?? 0) < MATCH_PAGE_SIZE
  },
  { immediate: true }
)

async function loadMoreMatches() {
  if (loadingMoreMatches.value || matchesEnd.value) return
  loadingMoreMatches.value = true
  try {
    const response = await $fetch<{ data: MatchSummary[] }>(matchesEndpoint.value, {
      query: { limit: MATCH_PAGE_SIZE, offset: allMyMatches.value.length }
    })
    const batch = response.data ?? []
    olderMatches.value = [...olderMatches.value, ...batch]
    if (batch.length < MATCH_PAGE_SIZE) matchesEnd.value = true
  } catch {
    // The button stays, so a failed page can simply be tried again rather than
    // replacing the history already on screen with an error.
  } finally {
    loadingMoreMatches.value = false
  }
}

interface PartnerDto {
  player_id: string
  display_name: string
  partnered_since: string
}

interface PartnerRequestDto {
  id: string
  to_player_id: string
  from_player_id: string
  status: string
}

const { data: partnersData, refresh: refreshPartners } = useFetch<{ data: PartnerDto[] }>(
  '/api/v1/players/me/partners',
  { server: false }
)

const { data: outgoingRequests, refresh: refreshOutgoing } = useFetch<{
  data: PartnerRequestDto[]
}>('/api/v1/players/me/partner-requests/outgoing', { server: false })

/**
 * The other direction, which this page never asked about.
 *
 * If this player has already sent a request, the button used to read "Request
 * as Duo Partner" and pressing it failed with INCOMING_REQUEST_EXISTS — the
 * server telling the user to accept an invitation the page never showed them.
 */
const { data: incomingRequests, refresh: refreshIncoming } = useFetch<{
  data: PartnerRequestDto[]
}>('/api/v1/players/me/partner-requests/incoming', { server: false })

const { refreshPartnerRequestCount } = usePartnerRequestCount()

const isPartner = computed(() => {
  if (!partnersData.value?.data) return false
  return partnersData.value.data.some((p) => p.player_id === playerId.value)
})

const pendingRequest = computed(() => {
  if (!outgoingRequests.value?.data) return null
  return outgoingRequests.value.data.find(
    (r) => r.to_player_id === playerId.value && r.status === 'pending'
  )
})

const incomingRequest = computed(() => {
  if (!incomingRequests.value?.data) return null
  return incomingRequests.value.data.find(
    (r) => r.from_player_id === playerId.value && r.status === 'pending'
  )
})

const partnerLoading = ref(false)

/**
 * Follow.
 *
 * Replaces the Team Up control (066-follow-and-kudos). Team-up was a
 * directional roster — "you may register me for a session" — which follow now
 * carries in a symmetric form: when you both follow each other, either of you
 * can enter the other. That is why mutual is called out on screen rather than
 * left for people to work out.
 */
/**
 * What opponents credit this player with. Public, and read on every profile,
 * so it is fetched with the rest of the page rather than on tab change — the
 * card is the first thing under Overview.
 */
const { data: kudosData, refresh: refreshKudos } = useFetch<{
  data: PlayerKudosDto
  statusCode?: number
}>(() => `/api/v1/players/${playerId.value}/kudos`, {
  server: false,
  ignoreResponseError: true
})

/**
 * `ignoreResponseError` keeps a failing kudos endpoint from taking the whole
 * profile down, which is deliberate — but it also hands the card an error body
 * instead of data, and the card's null-safe fallback then renders six zeroes.
 * Six zeroes is a statement about what opponents think of this player. Keep the
 * flag; detect the swallowed error and say so instead.
 */
const kudosFailed = computed(() =>
  Boolean(kudosData.value && (kudosData.value as { statusCode?: number }).statusCode)
)
const kudos = computed(() => (kudosFailed.value ? null : (kudosData.value?.data ?? null)))

const {
  state: followState,
  isMutual,
  label: followLabel,
  pending: followPending,
  toggle: toggleFollow
} = useFollow(() => playerId.value)

const PROFILE_TABS = computed(() => [
  { value: 'overview', label: 'Overview' },
  { value: 'matches', label: 'Matches' },
  { value: 'stats', label: 'Stats' },
  ...(achievementsEnabled.value ? [{ value: 'achievements', label: 'Achievements' }] : []),
  { value: 'activity', label: 'Activity' },
  { value: 'clubs', label: 'Clubs' }
])

// Seeded from `?tab=` so a linked tab opens on that tab; UiTabs keeps the query
// in sync from there.
const activeTab = ref<string>(
  PROFILE_TABS.value.some((t) => t.value === route.query.tab) ? String(route.query.tab) : 'overview'
)

const {
  data: clubsData,
  error: clubsError,
  refresh: refreshClubs
} = await useFetch<{
  items: Array<{ club: { id: string; name: string; is_verified: boolean } }>
}>(() => `/api/v1/players/${playerId.value}/clubs`)

async function sendPartnerRequest() {
  if (!user.value) return
  partnerLoading.value = true
  try {
    await $fetch(`/api/v1/players/${playerId.value}/partner-request`, { method: 'POST' })
    await refreshOutgoing()
  } catch (err) {
    useToast().error(apiErrorMessage(err, 'Could not send that partner request.'))
  } finally {
    partnerLoading.value = false
  }
}

async function cancelPartnerRequest() {
  if (!user.value || !pendingRequest.value) return
  partnerLoading.value = true
  try {
    await $fetch(`/api/v1/partner-requests/${pendingRequest.value.id}`, { method: 'DELETE' })
    await refreshOutgoing()
  } catch (err) {
    useToast().error(apiErrorMessage(err, 'Could not cancel that partner request.'))
  } finally {
    partnerLoading.value = false
  }
}

async function removePartner() {
  if (!user.value) return
  partnerLoading.value = true
  try {
    await $fetch(`/api/v1/players/me/partners/${playerId.value}`, { method: 'DELETE' })
    await refreshPartners()
  } catch (err) {
    useToast().error(apiErrorMessage(err, 'Could not remove that partner.'))
  } finally {
    partnerLoading.value = false
  }
}

async function acceptPartnerRequest() {
  if (!user.value || !incomingRequest.value) return
  partnerLoading.value = true
  try {
    await $fetch(`/api/v1/partner-requests/${incomingRequest.value.id}/accept`, {
      method: 'POST'
    })
    await Promise.all([refreshPartners(), refreshIncoming(), refreshPartnerRequestCount()])
  } catch (err) {
    useToast().error(apiErrorMessage(err, 'Could not accept that partner request.'))
  } finally {
    partnerLoading.value = false
  }
}

async function declinePartnerRequest() {
  if (!user.value || !incomingRequest.value) return
  partnerLoading.value = true
  try {
    await $fetch(`/api/v1/partner-requests/${incomingRequest.value.id}/decline`, {
      method: 'POST'
    })
    await Promise.all([refreshIncoming(), refreshPartnerRequestCount()])
  } catch (err) {
    useToast().error(apiErrorMessage(err, 'Could not decline that partner request.'))
  } finally {
    partnerLoading.value = false
  }
}

/**
 * All of them, not `slice(0, 6)`.
 *
 * The header stat renders `stats.achievements_count`, so a player with
 * fourteen saw "14" above a tab showing six, with nothing indicating the list
 * was cut. The slice was left over from a six-item Overview showcase that no
 * longer exists.
 */
const achievements = computed(() => achievementsData.value?.achievements ?? [])
/**
 * The two ratings, doubles first.
 *
 * Replaces `displayRating`, which was
 * `Math.max(singles?.rating_value ?? 0, doubles?.rating_value ?? 0)` rendered
 * as one unlabelled number at `toFixed(2)`. Three things were wrong with it and
 * they compounded:
 *
 *   1. It never said which format it was, and silently showed whichever was
 *      higher — a flattering artefact, not a fact about the player. Doubles is
 *      the dominant format in this sport and could be the hidden one.
 *   2. Two decimals, where `formatRating` is three everywhere else — including
 *      `pages/players/index.vue`, which lists `singles_rating`. The same player
 *      read as 3.150 in the directory and 4.42 here. PRODUCT.md's first
 *      principle is "a number nobody disputes"; a number that changes between
 *      two screens is the definition of one that can be.
 *   3. `provisional` and `matches_played` were fetched and thrown away, so a
 *      two-match rating rendered with exactly the confidence of a
 *      two-hundred-match one.
 *
 * Match count and provisional state are per-format facts the API already
 * returns. A trend arrow is deliberately NOT shown: `PlayerStatsDto` carries a
 * single `rating_trend` for the whole player, not one per format, so putting an
 * arrow on each number would be inventing one.
 */
const RATING_FORMATS = [
  { type: 'doubles', label: 'Doubles' },
  { type: 'singles', label: 'Singles' }
] as const

const ratingFormats = computed(() =>
  RATING_FORMATS.map(({ type, label }, index) => {
    const record = ratings.value?.[type] ?? null
    const value = record?.rating_value ?? null
    return {
      type,
      label,
      /** Doubles leads; singles is the same information at a quieter weight. */
      primary: index === 0,
      value,
      tier: value === null ? null : tierForRating(value),
      provisional: record?.provisional ?? false,
      matchesPlayed: record?.matches_played ?? 0
    }
  })
)

const HISTORY_TYPES = RATING_FORMATS.map(({ type, label }) => ({ value: type, label }))
const selectedBadge = computed(() => badgeData.value?.data ?? null)

/** The player whose matches the tab is showing — not necessarily the viewer. */
const subjectPlayerId = computed(() => profile.value?.id ?? myProfile.value?.id ?? null)

function getOpponentNames(match: MatchSummary): string {
  const subjectTeam = match.participants.find(
    (p) => p.player_id && p.player_id === subjectPlayerId.value
  )?.team_number
  const opponents = match.participants.filter((p) => p.team_number !== subjectTeam)
  return opponents.map((p) => p.display_name || 'Private player').join(' & ') || 'Unknown'
}

/** Told from the profile owner's side, same as getOpponentNames. */
function didSubjectWin(match: MatchSummary): boolean | null {
  const subjectTeam = match.participants.find(
    (p) => p.player_id && p.player_id === subjectPlayerId.value
  )?.team_number
  if (!subjectTeam || match.scores.length === 0) return null
  const setsWon = match.scores.filter((s) =>
    subjectTeam === 1 ? s.team1_score > s.team2_score : s.team2_score > s.team1_score
  ).length
  return setsWon > match.scores.length / 2
}

function formatScore(match: MatchSummary): string {
  return match.scores.map((s) => `${s.team1_score}-${s.team2_score}`).join(', ')
}

function formatRelativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

const ratingHistoryPoints = computed(() => ratingHistoryData.value?.history ?? [])
/**
 * Rating History (docs/33 §5.4).
 *
 * Was a bar sparkline with no time axis, so two ratings a year apart sat beside
 * two from the same afternoon and the shape meant nothing. `UiLineChart` plots
 * against real dates and carries a visually-hidden data table, so the series is
 * not a black hole for screen readers.
 */
const ratingChartPoints = computed(() =>
  ratingHistoryPoints.value.map((p) => ({ date: p.date, value: p.rating_value }))
)

const trendLabel = computed(() => {
  if (stats.value?.rating_trend === 'rising') return 'Rising ↑'
  if (stats.value?.rating_trend === 'falling') return 'Falling ↓'
  return 'Stable'
})
const trendClass = computed(() => {
  if (stats.value?.rating_trend === 'rising') return 'text-primary'
  if (stats.value?.rating_trend === 'falling') return 'text-danger'
  return 'text-fg'
})

const activities = computed(() => activitiesData.value?.activities ?? [])

function getActivityIcon(type: string): string {
  switch (type) {
    case 'match.verified':
      return '🎯'
    case 'rating.changed':
      return '📈'
    case 'achievement.earned':
      return '🏆'
    case 'profile.updated':
      return '✏️'
    case 'club.event_created':
      return '📅'
    case 'club.member_joined':
      return '🏸'
    case 'club.announcement':
      return '📣'
    case 'social.started_following':
      return '👤'
    case 'social.shoutout':
      return '📣'
    default:
      return '📌'
  }
}

function formatActivityText(activity: ProfileActivity): string {
  const payload = (activity.metadata ?? {}) as Record<string, string>
  switch (activity.activity_type) {
    case 'match.verified':
      return `played a match${payload.match_type ? ` (${payload.match_type})` : ''}`
    case 'rating.changed':
      return `rating updated to ${payload.new_rating ?? '—'}${payload.rating_type ? ` (${payload.rating_type})` : ''}`
    case 'achievement.earned':
      return `unlocked achievement: ${payload.achievement_name ?? 'unknown'}`
    case 'profile.updated':
      return 'updated their profile'
    case 'club.event_created':
      // When the event resolved, the linked card below carries its name, so
      // repeating it in the sentence would say it twice.
      if (activity.event) return 'created an event'
      return `created an event${payload.event_name ? `: ${payload.event_name}` : ''}`
    case 'club.member_joined':
      return `joined ${payload.club_name ?? 'a club'}`
    case 'club.announcement':
      return `posted an announcement${payload.club_name ? ` in ${payload.club_name}` : ''}`
    case 'social.started_following':
      return `started teaming up with ${payload.target_display_name ?? 'someone'}`
    case 'social.shoutout':
      return `shouts: "${payload.message ?? ''}"`
    default:
      // Exhaustive over the current ActivityType union, but new activity types can be
      // added server-side without a matching client release, so keep a fallback.
      return (activity.activity_type as string).replace('.', ' ')
  }
}
</script>

<template>
  <div class="min-h-screen bg-canvas p-4 lg:p-6">
    <!-- Loading -->
    <div v-if="pending" class="page-shell space-y-4">
      <div class="flex items-start gap-4">
        <div class="h-24 w-24 animate-pulse rounded-full bg-surface" />
        <div class="flex-1 space-y-2">
          <div class="h-6 w-48 animate-pulse rounded bg-surface" />
          <div class="h-4 w-32 animate-pulse rounded bg-surface" />
        </div>
      </div>
      <div class="h-48 animate-pulse rounded-xl bg-surface" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="page-shell rounded-xl bg-surface p-8 text-center shadow-card">
      <span
        class="mx-auto flex h-12 w-12 items-center justify-center rounded-pill bg-surface-2 text-fg-muted"
      >
        <UiIcon name="alert" size="h-6 w-6" />
      </span>
      <h2 class="mt-4 font-display text-heading-2 text-fg">
        {{ error.statusCode === 404 ? 'Profile Not Found' : 'Error Loading Profile' }}
      </h2>
      <p class="mt-2 text-sm text-fg-muted">
        {{
          error.statusCode === 404
            ? 'This profile is private or does not exist.'
            : 'Please try again later.'
        }}
      </p>
      <NuxtLink
        to="/players"
        class="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-on-primary"
      >
        Browse Players
      </NuxtLink>
    </div>

    <!-- Profile -->
    <div v-else-if="profile" class="page-shell space-y-6">
      <!-- Back to wherever you opened this profile from — a draw, a score
           sheet, a feed entry — not to the player directory, which is where a
           hardcoded `to="/players"` sent everybody. -->
      <UiPageHeader to="/players" back-label="Back" />

      <!-- Header Card -->
      <div class="rounded-xl bg-surface p-6 shadow-card">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <!-- Avatar & Info -->
          <div class="flex items-start gap-4">
            <!-- UiAvatar rather than a hand-rolled initials circle: it carries
                 the uploaded photo when there is one, the per-name tint when
                 there is not, and the broken-image fallback. -->
            <UiAvatar
              :name="profile.display_name"
              :src="profile.avatar_url"
              :identity-key="profile.id"
              size="xl"
              highlighted
            />
            <div>
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h1 class="font-display text-heading-1 text-fg">{{ profile.display_name }}</h1>
                <span
                  v-if="achievementsEnabled && selectedBadge"
                  class="inline-flex"
                  :title="`${selectedBadge.name} — ${selectedBadge.description}`"
                >
                  <AchievementBadgeIcon
                    :achievement-key="selectedBadge.id"
                    :tier="selectedBadge.tier"
                    size="sm"
                  />
                  <span class="sr-only"
                    >Badge earned: {{ selectedBadge.name }}. {{ selectedBadge.description }}</span
                  >
                </span>

                <!-- One trophy per title, each going to the draw it was won in.
                     A title with no event row has nowhere to go, so it renders
                     as a plain glyph rather than a link that 404s. -->
                <template
                  v-for="championship in championships"
                  :key="`${championship.tournament_id}-${championship.category_id ?? 'all'}`"
                >
                  <NuxtLink
                    v-if="championship.href"
                    :to="championship.href"
                    :title="championshipTitle(championship)"
                    :class="TROPHY_CLASS"
                    class="transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    <span aria-hidden="true">🏆</span>
                    <span class="sr-only">{{ championshipTitle(championship) }}</span>
                  </NuxtLink>
                  <span v-else :title="championshipTitle(championship)" :class="TROPHY_CLASS">
                    <span aria-hidden="true">🏆</span>
                    <span class="sr-only">{{ championshipTitle(championship) }}</span>
                  </span>
                </template>
              </div>
              <p v-if="profile.city || profile.province" class="mt-1 text-sm text-fg-muted">
                {{ [profile.city, profile.province].filter(Boolean).join(', ') }}
              </p>
              <p v-if="profile.bio" class="mt-2 text-sm text-fg-secondary">{{ profile.bio }}</p>
              <PlayerSocialLinks class="mt-2 -ml-2" :links="profile" :name="profile.display_name" />
            </div>
          </div>

          <!-- Rating & Action -->
          <div class="flex flex-col items-end gap-2">
            <!-- Doubles leads. Both formats are always present and always
                 named: an unlabelled rating is a claim, not a fact, and this
                 is the one screen where a stranger reads the number. -->
            <div class="flex items-start gap-6 text-right">
              <div v-for="format in ratingFormats" :key="format.type">
                <p class="text-caption font-semibold uppercase tracking-widest text-fg-muted">
                  {{ format.label }}
                </p>
                <!-- Fixed-height number row so the two formats share a
                     baseline. Without it the smaller singles figure rides high
                     and every line beneath the pair — tier, match count —
                     staggers against its opposite number. -->
                <p
                  class="flex h-9 items-end justify-end font-display tabular-nums"
                  :class="
                    format.primary ? 'text-stat-md text-primary' : 'text-stat-sm text-fg-secondary'
                  "
                >
                  {{ format.value === null ? '—' : formatRating(format.value) }}
                </p>
                <template v-if="format.tier">
                  <p class="text-caption text-fg-secondary">{{ format.tier.name }}</p>
                  <!-- The rating's own receipt, in miniature: how much play is
                       behind it. `provisional` is the engine's own flag, not a
                       guess made here. -->
                  <p class="text-caption text-fg-muted">
                    {{ format.matchesPlayed }}
                    {{ format.matchesPlayed === 1 ? 'match' : 'matches' }}
                    <template v-if="format.provisional"> · provisional</template>
                  </p>
                </template>
                <p v-else-if="ratingsError" class="text-caption text-fg-muted">
                  Rating<br />unavailable
                </p>
                <p v-else class="text-caption text-fg-muted">
                  No rated<br />{{ format.label.toLowerCase() }} yet
                </p>
              </div>
            </div>
            <!-- Acting as a club: one club-shaped action, not the player ones.
                 An invitation is only offered when there is nothing live
                 between them and the club already. -->
            <template v-if="user && !isOwnProfile && isClubMode">
              <span
                v-if="clubRelationship === 'active'"
                class="rounded-pill bg-success-soft px-3 py-1.5 text-sm font-medium text-success"
              >
                Club member
              </span>
              <NuxtLink
                v-else-if="clubRelationship === 'pending'"
                :to="`/club/${activeClubId}/members`"
                class="rounded-lg border border-primary px-5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary-soft"
              >
                Review join request
              </NuxtLink>
              <span
                v-else-if="clubRelationship === 'invited' || invited"
                class="rounded-pill bg-warning-soft px-3 py-1.5 text-sm font-medium text-warning"
              >
                Invitation sent
              </span>
              <button
                v-else
                type="button"
                :disabled="inviting"
                class="rounded-lg border border-primary px-5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary-soft disabled:opacity-60"
                @click="inviteToClub"
              >
                {{ inviting ? 'Inviting…' : 'Invite to club' }}
              </button>
            </template>

            <!-- Partner button (replaces Follow) -->
            <template v-else-if="user && !isOwnProfile">
              <!-- Already partners -->
              <button
                v-if="isPartner"
                class="rounded-lg border border-primary px-5 py-2 text-sm font-medium text-primary transition-colors hover:border-danger hover:text-danger"
                :disabled="partnerLoading"
                @click="removePartner"
              >
                {{ partnerLoading ? '...' : 'Duo Partner' }}
              </button>
              <!-- They asked first. Accepting here is the same action as
                   accepting from Community; declining is offered alongside so
                   the answer is not one-sided. -->
              <span v-else-if="incomingRequest" class="flex items-center gap-2">
                <button
                  type="button"
                  class="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
                  :disabled="partnerLoading"
                  @click="acceptPartnerRequest"
                >
                  {{ partnerLoading ? '...' : 'Accept duo request' }}
                </button>
                <button
                  type="button"
                  class="rounded-lg border border-border-strong px-3 py-2 text-sm text-fg-secondary transition-colors hover:border-danger hover:text-danger disabled:opacity-50"
                  :disabled="partnerLoading"
                  @click="declinePartnerRequest"
                >
                  Decline
                </button>
              </span>
              <!-- Pending request -->
              <button
                v-else-if="pendingRequest"
                class="rounded-lg border border-warning-fill px-5 py-2 text-sm font-medium text-warning transition-colors hover:border-danger hover:text-danger"
                :disabled="partnerLoading"
                @click="cancelPartnerRequest"
              >
                {{ partnerLoading ? '...' : 'Pending' }}
              </button>
              <!--
                Not partners, and only offered to someone you mutually follow.

                A duo is who you enter a doubles DRAW with, which is a bigger
                commitment than a follow and makes no sense to offer a stranger:
                the button used to appear on every profile, and pressing it sent
                a request to somebody with no relationship to the sender at all.
                The bar used to be an accepted team-up; it is now a mutual
                follow, which is the same agreement in the new model.

                Existing duos, incoming requests and pending ones above are all
                still shown whatever the follow state — withdrawing the way to
                answer a request you already have would be worse than never
                offering it.
              -->
              <button
                v-else-if="isMutual"
                class="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover"
                :disabled="partnerLoading"
                @click="sendPartnerRequest"
              >
                {{ partnerLoading ? '...' : 'Request as Duo Partner' }}
              </button>

              <!-- Follow sits BESIDE the duo control, not instead of it: a duo
                   partner is who you pair with in a doubles draw, following is
                   how you keep up with somebody and — once it is mutual — how
                   either of you may enter the other into an open play session.
                   Being one does not make you the other. -->
              <button
                type="button"
                class="rounded-lg px-5 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                :class="
                  followState.following
                    ? 'border border-primary text-primary hover:border-danger hover:text-danger'
                    : 'bg-primary text-on-primary hover:bg-primary-hover'
                "
                :disabled="followPending"
                :aria-pressed="followState.following"
                @click="toggleFollow"
              >
                {{ followPending ? '…' : followLabel }}
              </button>

              <!-- Said out loud because it is the thing that unlocks entering
                   each other into a session, and nothing else on the page would
                   tell you it had happened. -->
              <p v-if="isMutual" class="text-caption text-fg-muted">
                You can enter each other into open play
              </p>

              <!-- Quiet on purpose. Reporting is a last resort, not a peer of
                   "Follow", and giving it equal weight invites use as a
                   reaction to losing a match. -->
              <button
                type="button"
                class="mt-1 text-caption text-fg-muted underline-offset-2 transition-colors hover:text-danger hover:underline"
                @click="openReport"
              >
                Report this player
              </button>
            </template>
          </div>
        </div>

        <!-- Stats Row -->
        <!-- A failed stats call used to render "0 Matches / — / —", which is
             exactly what a brand-new player renders. An organiser reading that
             declines to invite an active player over a timeout. -->
        <div
          v-if="statsError"
          class="mt-6 flex flex-wrap items-center justify-center gap-2 border-t border-border-strong pt-4 text-caption text-fg-muted"
          role="alert"
        >
          <span>Stats didn't load.</span>
          <button
            type="button"
            class="rounded-button font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            @click="() => refreshStats()"
          >
            Retry
          </button>
        </div>
        <div
          v-else
          class="mt-6 grid grid-cols-2 gap-4 border-t border-border-strong pt-4"
          :class="achievementsEnabled ? 'sm:grid-cols-4' : 'sm:grid-cols-3'"
        >
          <div class="text-center">
            <p class="font-display text-stat-sm tabular-nums text-fg">
              {{ stats?.total_matches ?? 0 }}
            </p>
            <p class="text-xs text-fg-muted">Matches</p>
          </div>
          <div class="text-center">
            <p class="font-display text-stat-sm tabular-nums text-fg">
              {{ stats ? `${stats.win_rate}%` : '—' }}
            </p>
            <p class="text-xs text-fg-muted">Win Rate</p>
          </div>
          <div class="text-center">
            <p class="font-display text-stat-sm tabular-nums text-fg">
              {{ stats ? `${stats.wins}-${stats.losses}` : '—' }}
            </p>
            <p class="text-xs text-fg-muted">W - L</p>
          </div>
          <div v-if="achievementsEnabled" class="text-center">
            <p class="font-display text-stat-sm tabular-nums text-fg">
              {{ stats?.achievements_count ?? 0 }}
            </p>
            <p class="text-xs text-fg-muted">Achievements</p>
          </div>
        </div>
      </div>

      <!-- Tabs are route-query backed (`?tab=matches`), so a tab is linkable
           and the browser back button steps between them — docs/33 §5.4. -->
      <UiTabs v-model="activeTab" :tabs="PROFILE_TABS" id-prefix="profile" />

      <!-- Tab Content -->
      <div
        :id="`profile-panel-${activeTab}`"
        class="space-y-4"
        role="tabpanel"
        :aria-labelledby="`profile-tab-${activeTab}`"
      >
        <!-- Overview Tab -->
        <template v-if="activeTab === 'overview'">
          <UiErrorState
            v-if="kudosFailed"
            compact
            class="mb-4"
            title="Couldn't load kudos"
            message="Skill ratings from opponents are unavailable right now."
            retry-label="Retry"
            @retry="refreshKudos"
          />
          <KudosCard
            v-else
            class="mb-4"
            :kudos="kudos"
            :display-name="profile.display_name"
            :is-own-profile="isOwnProfile"
          />

          <!-- Rating History -->
          <div class="rounded-card border border-border bg-surface p-5 shadow-card">
            <!-- h3, not a span: this was the one panel title on the page that
                 was not a heading, so it was invisible to heading navigation
                 while its five siblings were reachable. -->
            <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 class="text-body-2 font-medium text-fg">Rating History</h2>
              <UiSegmented
                :items="HISTORY_TYPES"
                :model-value="historyType"
                size="sm"
                label="Rating type"
                @update:model-value="historyType = $event as RatingType"
              />
            </div>
            <UiErrorState
              v-if="ratingHistoryError"
              compact
              title="Couldn't load rating history"
              message="The chart is unavailable right now."
              retry-label="Retry"
              @retry="refreshRatingHistory"
            />
            <UiLineChart
              v-else
              :points="ratingChartPoints"
              :label="`${historyType === 'doubles' ? 'Doubles' : 'Singles'} rating over the last 180 days`"
              :empty-message="`No ${historyType} record yet.`"
            />
            <p class="mt-3 text-caption text-fg-muted">Last 180 days</p>
          </div>

          <!-- Dominant Hand & Preferred Position -->
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="rounded-xl bg-surface p-4 shadow-card">
              <p class="text-xs text-fg-muted">Dominant Hand</p>
              <p class="mt-1 font-medium capitalize text-fg">
                {{ profile.dominant_hand || 'Not set' }}
              </p>
            </div>
            <div class="rounded-xl bg-surface p-4 shadow-card">
              <p class="text-xs text-fg-muted">Preferred Position</p>
              <p class="mt-1 font-medium capitalize text-fg">
                {{ profile.preferred_position || 'Not set' }}
              </p>
            </div>
          </div>
        </template>

        <!-- Matches Tab -->
        <template v-if="activeTab === 'matches'">
          <div class="rounded-xl bg-surface p-5 shadow-card">
            <h2 class="mb-4 text-body-2 font-medium text-fg">Recent Matches</h2>
            <div v-if="!matchHistoryVisible" class="py-6 text-center text-sm text-fg-muted">
              This player has hidden their match history.
            </div>
            <UiErrorState
              v-else-if="myMatchesError"
              compact
              title="Couldn't load your matches"
              message="Your match history is unavailable right now."
              retry-label="Retry"
              @retry="() => fetchMyMatches()"
            />
            <!-- The first page had no pending guard, so your own profile showed
                 "No matches yet." until the request landed. -->
            <div
              v-else-if="myMatchesPending && !allMyMatches.length"
              class="py-6 text-center text-sm text-fg-muted"
            >
              Loading your matches…
            </div>
            <div v-else-if="!allMyMatches.length" class="py-6 text-center text-sm text-fg-muted">
              No record yet.
            </div>
            <div v-else class="space-y-3">
              <NuxtLink
                v-for="match in allMyMatches"
                :key="match.id"
                :to="`/matches/${match.id}`"
                class="flex items-center justify-between rounded-lg bg-canvas p-3 transition-all hover:bg-surface-2"
              >
                <div>
                  <p class="text-sm text-fg">vs {{ getOpponentNames(match) }}</p>
                  <p class="text-xs text-fg-muted">{{ formatScore(match) }}</p>
                </div>
                <div class="text-right">
                  <span
                    class="rounded-md px-2 py-0.5 text-xs font-medium"
                    :class="
                      didSubjectWin(match) === true
                        ? 'bg-primary-soft text-primary'
                        : didSubjectWin(match) === false
                          ? 'bg-danger-soft text-danger'
                          : 'bg-surface-2 text-fg-secondary'
                    "
                  >
                    {{
                      didSubjectWin(match) === true
                        ? 'Won'
                        : didSubjectWin(match) === false
                          ? 'Lost'
                          : 'Played'
                    }}
                  </span>
                  <p class="mt-1 text-xs text-fg-muted">
                    {{ formatRelativeTime(match.played_at) }}
                  </p>
                </div>
              </NuxtLink>

              <button
                v-if="!matchesEnd"
                type="button"
                class="w-full rounded-lg border border-border px-3 py-2 text-xs font-medium text-fg-secondary transition-colors hover:border-border-strong hover:text-fg disabled:opacity-60"
                :disabled="loadingMoreMatches"
                @click="loadMoreMatches"
              >
                {{ loadingMoreMatches ? 'Loading…' : 'Show more matches' }}
              </button>
            </div>
          </div>
        </template>

        <!-- Stats Tab -->
        <template v-if="activeTab === 'stats'">
          <div class="rounded-xl bg-surface p-5 shadow-card">
            <h2 class="mb-4 text-body-2 font-medium text-fg">Performance Stats</h2>
            <UiErrorState
              v-if="statsError"
              compact
              title="Couldn't load stats"
              message="These numbers are unavailable right now."
              retry-label="Retry"
              @retry="refreshStats"
            />
            <div v-else class="grid gap-4 sm:grid-cols-2">
              <div class="rounded-lg bg-canvas p-3">
                <p class="text-xs text-fg-muted">Singles / Doubles Played</p>
                <p class="font-display text-stat-sm tabular-nums text-fg">
                  {{ stats?.singles_matches ?? 0 }} / {{ stats?.doubles_matches ?? 0 }}
                </p>
              </div>
              <div class="rounded-lg bg-canvas p-3">
                <p class="text-xs text-fg-muted">Matches This Month</p>
                <p class="font-display text-stat-sm tabular-nums text-fg">
                  {{ stats?.matches_this_month ?? 0 }}
                </p>
              </div>
              <div class="rounded-lg bg-canvas p-3">
                <p class="text-xs text-fg-muted">Rating Trend</p>
                <p class="font-display text-stat-sm tabular-nums" :class="trendClass">
                  {{ trendLabel }}
                </p>
              </div>
              <div class="rounded-lg bg-canvas p-3">
                <p class="text-xs text-fg-muted">Tournaments Played</p>
                <p class="font-display text-stat-sm tabular-nums text-fg">
                  {{ stats?.tournaments_participated ?? 0 }}
                </p>
              </div>
            </div>
          </div>
        </template>

        <!-- Achievements Tab -->
        <template v-if="activeTab === 'achievements' && achievementsEnabled">
          <div class="rounded-xl bg-surface p-5 shadow-card">
            <h2 class="mb-4 text-body-2 font-medium text-fg">Achievements</h2>
            <div v-if="achievements.length > 0" class="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div
                v-for="pa in achievements"
                :key="pa.achievement_id"
                class="rounded-lg bg-canvas p-3 text-center"
              >
                <div
                  class="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-warning-fill/20 text-warning"
                  aria-hidden="true"
                >
                  🏆
                </div>
                <p class="text-xs font-medium text-fg">{{ pa.achievement.name }}</p>
                <p class="text-xs text-fg-muted">+{{ pa.achievement.points }} pts</p>
              </div>
            </div>
            <UiErrorState
              v-else-if="achievementsError"
              compact
              title="Couldn't load achievements"
              message="This list is unavailable right now."
              retry-label="Retry"
              @retry="refreshAchievements"
            />
            <p v-else class="py-6 text-center text-sm text-fg-muted">No record yet.</p>
          </div>
        </template>

        <!-- Activity Tab -->
        <template v-if="activeTab === 'activity'">
          <div class="rounded-xl bg-surface p-5 shadow-card">
            <h2 class="mb-4 text-body-2 font-medium text-fg">Recent Activity</h2>
            <UiErrorState
              v-if="activitiesError"
              compact
              title="Couldn't load activity"
              message="This feed is unavailable right now."
              retry-label="Retry"
              @retry="refreshActivities"
            />
            <div v-else-if="activities.length === 0" class="py-6 text-center text-sm text-fg-muted">
              No record yet.
            </div>
            <div v-else class="space-y-3">
              <div
                v-for="a in activities"
                :key="a.id"
                class="flex items-start gap-3 rounded-lg bg-canvas p-3"
              >
                <span class="text-lg" aria-hidden="true">{{
                  getActivityIcon(a.activity_type)
                }}</span>
                <div class="min-w-0 flex-1">
                  <p class="text-sm text-fg">{{ formatActivityText(a) }}</p>
                  <p class="text-xs text-fg-muted">{{ formatRelativeTime(a.created_at) }}</p>

                  <!-- The event this activity points at — a shout-out's, or the
                       event a `club.event_created` row is announcing. -->
                  <NuxtLink
                    v-if="a.event"
                    :to="`/events/${a.event.id}`"
                    class="mt-2 flex items-center gap-2 rounded-button bg-surface p-2 transition-colors hover:bg-surface-2"
                  >
                    <UiIcon name="calendar" size="h-4 w-4" class="shrink-0 text-primary" />
                    <span class="min-w-0">
                      <span class="block truncate text-sm font-medium text-fg">
                        {{ a.event.name }}
                      </span>
                      <span class="block truncate text-caption text-fg-muted">
                        {{
                          [formatEventDate(a.event.start_date), a.event.city]
                            .filter(Boolean)
                            .join(' · ')
                        }}
                      </span>
                    </span>
                  </NuxtLink>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- Clubs Tab -->
        <template v-if="activeTab === 'clubs'">
          <div class="rounded-xl bg-surface p-5 shadow-card">
            <h2 class="mb-4 text-body-2 font-medium text-fg">Club Memberships</h2>
            <UiErrorState
              v-if="clubsError"
              compact
              title="Couldn't load clubs"
              message="This list is unavailable right now."
              retry-label="Retry"
              @retry="refreshClubs"
            />
            <div
              v-else-if="!clubsData?.items?.length"
              class="py-6 text-center text-sm text-fg-muted"
            >
              No record yet.
            </div>
            <div v-else class="space-y-3">
              <NuxtLink
                v-for="membership in clubsData.items"
                :key="membership.club.id"
                :to="`/clubs/${membership.club.id}`"
                class="flex items-center gap-3 rounded-lg bg-canvas p-3 transition-all hover:bg-surface-2"
              >
                <UiClubLogo :name="membership.club.name" box-class="h-10 w-10 rounded-lg" />
                <div class="flex-1">
                  <p class="text-sm font-medium text-fg">{{ membership.club.name }}</p>
                </div>
                <div
                  v-if="membership.club.is_verified"
                  class="flex items-center gap-1 text-xs text-primary"
                >
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                  Verified
                </div>
              </NuxtLink>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- Neither loading, nor an error, nor a profile. Rare, but it used to
         render the page wrapper and nothing else: a blank screen. -->
    <div v-else class="page-shell rounded-card bg-surface p-8 text-center shadow-card">
      <span
        class="mx-auto flex h-12 w-12 items-center justify-center rounded-pill bg-surface-2 text-fg-muted"
      >
        <UiIcon name="alert" size="h-6 w-6" />
      </span>
      <h2 class="mt-4 font-display text-heading-2 text-fg">Profile unavailable</h2>
      <p class="mt-2 text-sm text-fg-muted">
        We couldn't load this player. Try again, or browse the player directory.
      </p>
      <div class="mt-4 flex flex-wrap justify-center gap-2">
        <UiButton variant="secondary" size="sm" @click="() => profileQuery.refresh()">
          Try again
        </UiButton>
        <UiButton variant="ghost" size="sm" to="/players">All players</UiButton>
      </div>
    </div>

    <!-- Report modal. hide-actions because the footer needs a disabled state
         driven by the reason select, which the built-in row cannot express. -->
    <UiModal
      v-model="reportOpen"
      title="Report this player"
      description="Reports go to the platform moderation team. The player is not told who reported them."
      hide-actions
    >
      <div class="space-y-4">
        <div>
          <label for="report-reason" class="mb-1.5 block text-sm font-medium text-fg-secondary">
            Reason
          </label>
          <select
            id="report-reason"
            v-model="reportReason"
            class="w-full rounded-button border border-fg-muted bg-canvas px-4 py-2.5 text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="" disabled>Pick a reason…</option>
            <option v-for="r in REPORT_REASONS" :key="r.value" :value="r.value">
              {{ r.label }}
            </option>
          </select>
        </div>

        <div>
          <label for="report-details" class="mb-1.5 block text-sm font-medium text-fg-secondary">
            What happened? <span class="text-fg-muted">(optional)</span>
          </label>
          <textarea
            id="report-details"
            v-model="reportDetails"
            rows="4"
            maxlength="1000"
            placeholder="Dates, events or matches help the moderator a lot."
            class="w-full rounded-button border border-fg-muted bg-canvas px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <p class="mt-1 text-xs text-fg-muted">{{ reportDetails.length }}/1000</p>
        </div>

        <p v-if="reportError" class="rounded-button bg-danger-soft px-4 py-3 text-sm text-danger">
          {{ reportError }}
        </p>

        <div class="flex justify-end gap-2">
          <UiButton variant="ghost" :disabled="reportLoading" @click="reportOpen = false">
            Cancel
          </UiButton>
          <UiButton
            variant="danger"
            :disabled="reportLoading || !reportReason"
            @click="submitReport"
          >
            {{ reportLoading ? 'Submitting…' : 'Submit report' }}
          </UiButton>
        </div>
      </div>
    </UiModal>
  </div>
</template>
