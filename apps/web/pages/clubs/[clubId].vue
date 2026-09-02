<script setup lang="ts">
import type { ClubDto } from '~/server/domains/club/dto/club.dto'
import type { ClubRole, RosterMemberDto } from '~/server/domains/club/dto/club-membership.dto'
import type { PlayerProfileDto } from '~/server/domains/player/dto/player-profile.dto'
import type { AnnouncementDto } from '~/server/domains/announcement/dto/announcement.dto'
import type { EventDto } from '~/server/domains/event/dto/event.dto'
import { looksLikeUuid } from '~/server/domains/club/dto/club-slug'

interface ClubRankingEntry {
  rank: number
  player_id: string
  display_name: string
  rating_value: number | null
}

interface ClubMatchSummary {
  id: string
  match_type: 'singles' | 'doubles'
  status: string
  played_at: string
  participants: Array<{ player_id: string; team_number: 1 | 2; display_name: string }>
  scores: Array<{ set_number: number; team1_score: number; team2_score: number }>
}

const route = useRoute()
const clubId = computed(() => route.params.clubId as string)

const {
  data: club,
  pending: clubPending,
  error: clubError,
  refresh: refreshClub
} = await useFetch<ClubDto>(() => `/api/v1/clubs/${clubId.value}`)

/**
 * The club's UUID, however the page was reached.
 *
 * Only `GET /clubs/{id}` accepts a slug; every sub-resource under it —
 * members, rankings, matches, announcements — is keyed by UUID, and the event
 * search filters on `club_id`. Passing the route param straight through meant
 * a visit to /clubs/my-club loaded the club and then quietly failed to load
 * anything belonging to it. Falls back to the param so the first render, before
 * the club resolves, still addresses a UUID visit correctly.
 */
const resolvedClubId = computed(() => club.value?.id ?? clubId.value)

const { data: myProfile } = await useFetch<PlayerProfileDto>('/api/v1/players/me')

const roster = ref<RosterMemberDto[] | null>(null)
const notAMember = ref(false)
const joinMessage = ref('')
const joinError = ref('')
const joining = ref(false)
const hasPendingRequest = ref(false)
const membershipStatus = ref<string | null>(null)

const announcements = ref<AnnouncementDto[]>([])
/**
 * Show the club's own URL once we know it.
 *
 * `GET /api/v1/clubs/{id}` resolves a UUID or a slug on purpose, and a UUID
 * link must keep working forever (see the note on that controller) — so this
 * deliberately does not redirect. It rewrites the address in place after the
 * club loads, which is what was missing: editing the custom URL saved
 * correctly, then every link and every visit still showed the UUID, so the
 * setting looked like it had not taken.
 *
 * `history.replaceState` rather than `router.replace`: this is the same page
 * showing the same club, and a router navigation would re-run the route and
 * refetch everything to arrive exactly where it already is.
 */
watch(
  club,
  (value) => {
    if (!import.meta.client) return
    if (!value?.slug) return
    if (!looksLikeUuid(clubId.value)) return
    history.replaceState(history.state, '', `/clubs/${value.slug}`)
  },
  { immediate: true }
)

const clubRankings = ref<ClubRankingEntry[]>([])
const clubMatches = ref<ClubMatchSummary[]>([])
const upcomingClubEvents = ref<EventDto[]>([])
const previousClubEvents = ref<EventDto[]>([])

async function loadRoster() {
  notAMember.value = false
  try {
    const response = await $fetch<{ items: RosterMemberDto[] }>(
      `/api/v1/clubs/${resolvedClubId.value}/members`
    )
    roster.value = response.items
  } catch {
    roster.value = null
    notAMember.value = true
  }
}

async function checkPendingRequest() {
  try {
    const response = await $fetch<{ pending: boolean; status: string | null }>(
      `/api/v1/clubs/${resolvedClubId.value}/membership-requests`
    )
    hasPendingRequest.value = response.pending
    membershipStatus.value = response.status
  } catch {
    hasPendingRequest.value = false
    membershipStatus.value = null
  }
}

async function loadAnnouncements() {
  try {
    const response = await $fetch<{ announcements: AnnouncementDto[] }>(
      `/api/v1/clubs/${resolvedClubId.value}/announcements`
    )
    announcements.value = response.announcements
  } catch {
    announcements.value = []
  }
}

/**
 * Both ladders, fetched together.
 *
 * GET /api/v1/clubs/:id/rankings has always accepted ?rating_type=doubles - the
 * page just never passed it, so the card was hardcoded to singles and labelled
 * as such. Doubles is the format most club play actually happens in, so leaving
 * it unreachable hid half the answer.
 */
const rankingType = ref<'singles' | 'doubles'>('singles')
const clubDoublesRankings = ref<ClubRankingEntry[]>([])

const visibleRankings = computed(() =>
  rankingType.value === 'doubles' ? clubDoublesRankings.value : clubRankings.value
)

async function loadClubRankings() {
  try {
    const [singles, doubles] = await Promise.all([
      $fetch<{ data: ClubRankingEntry[] }>(`/api/v1/clubs/${resolvedClubId.value}/rankings`, {
        query: { rating_type: 'singles' }
      }),
      $fetch<{ data: ClubRankingEntry[] }>(`/api/v1/clubs/${resolvedClubId.value}/rankings`, {
        query: { rating_type: 'doubles' }
      })
    ])
    clubRankings.value = singles.data
    clubDoublesRankings.value = doubles.data
  } catch {
    clubRankings.value = []
    clubDoublesRankings.value = []
  }
}

async function loadClubMatches() {
  try {
    const response = await $fetch<{ data: ClubMatchSummary[] }>(
      `/api/v1/clubs/${resolvedClubId.value}/matches?limit=50`
    )
    clubMatches.value = response.data
  } catch {
    clubMatches.value = []
  }
}

/**
 * Upcoming vs previous, split by DATE rather than by status.
 *
 * This used to read upcoming = published + active and previous = completed. An
 * event whose date had passed but which nobody ever marked complete therefore
 * stayed under "Upcoming" forever - and cancelled events appeared in neither
 * list, so a cancelled fixture simply vanished with no explanation.
 *
 * Status is still consulted, but only as a secondary rule: a cancelled event is
 * always past whatever its date says, because it is not going to happen.
 */
function isPastEvent(event: EventDto): boolean {
  if (event.status === 'cancelled' || event.status === 'completed') return true

  // end_date when there is one, start_date otherwise. Compared against
  // yesterday rather than now: a single-day event should stay under "Upcoming"
  // for the whole of its own day, including the evening it is actually played.
  const endsOn = event.end_date ?? event.start_date
  if (!endsOn) return false

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  return new Date(endsOn) < yesterday
}

async function loadClubEvents() {
  try {
    const [published, active, completed, cancelled] = await Promise.all([
      $fetch<{ events: EventDto[] }>('/api/v1/events', {
        query: { club_id: resolvedClubId.value, status: 'published' }
      }),
      $fetch<{ events: EventDto[] }>('/api/v1/events', {
        query: { club_id: resolvedClubId.value, status: 'active' }
      }),
      $fetch<{ events: EventDto[] }>('/api/v1/events', {
        query: { club_id: resolvedClubId.value, status: 'completed' }
      }),
      $fetch<{ events: EventDto[] }>('/api/v1/events', {
        query: { club_id: resolvedClubId.value, status: 'cancelled' }
      })
    ])

    const all = [...published.events, ...active.events, ...completed.events, ...cancelled.events]

    upcomingClubEvents.value = all
      .filter((e) => !isPastEvent(e))
      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())

    // Most recent first: the interesting past event is the one that just
    // happened, not the club's first ever fixture.
    previousClubEvents.value = all
      .filter(isPastEvent)
      .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())
  } catch {
    upcomingClubEvents.value = []
    previousClubEvents.value = []
  }
}

onMounted(() => {
  loadRoster()
  loadAnnouncements()
  loadClubRankings()
  loadClubMatches()
  loadClubEvents()
  checkPendingRequest()
})

function formatScore(scores: ClubMatchSummary['scores']): string {
  return scores.map((s) => `${s.team1_score}-${s.team2_score}`).join(', ')
}

function formatEventDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const myMembership = computed(
  () => roster.value?.find((m) => m.player_id === myProfile.value?.id) ?? null
)
const isAdmin = computed(
  () => myMembership.value?.role === 'OWNER' || myMembership.value?.role === 'ADMIN'
)
const isStaff = computed(() =>
  ['OWNER', 'ADMIN', 'MODERATOR'].includes(myMembership.value?.role ?? '')
)

const isOwner = computed(() => myMembership.value?.role === 'OWNER')

const { isClubMode, activeClubId } = useAccountMode()

/**
 * Wearing *this* club's hat — club mode, and the club being acted as is the one
 * on screen.
 *
 * The club id matters as much as the mode. Checking `isClubMode` alone would let
 * someone acting as Club A administer Club B, which is incoherent even though
 * they must still be staff of B for anything to be offered.
 */
const isActingAsThisClub = computed(() => isClubMode.value && activeClubId.value === resolvedClubId.value)

/**
 * Club administration, split the way the product decided (2026-08-23).
 *
 * Approving and rejecting join requests works in BOTH hats, on purpose: a
 * pending request is a person waiting to get in, and making them wait for an
 * admin to notice they are in the wrong mode costs someone real time. Nothing
 * else on this page has a third party blocked on it.
 *
 * Everything else — roles, removals, verification, and the club's create
 * actions — is club work and needs the club hat. `Create Event` was already
 * club-mode-only on the events page, so leaving it ungated here was the same
 * inconsistency in a second place.
 */
// Moderators too, matching APPROVAL_ROLES in club.service.ts — the whole point
// of the role is absorbing this queue. Still both hats, still review-only:
// nothing below widens for them.
const canReviewJoinRequests = computed(() => isStaff.value)
const canManageMembers = computed(() => isAdmin.value && isActingAsThisClub.value)
const canManageAnnouncements = computed(() => isStaff.value && isActingAsThisClub.value)
const canRequestVerification = computed(() => isOwner.value && isActingAsThisClub.value)
const canUseClubActions = computed(() => isAdmin.value && isActingAsThisClub.value)

/**
 * Staff who are on the club's page but not wearing its hat would otherwise see
 * the management controls simply vanish with no explanation. This drives a hint
 * telling them what to switch to.
 */
const needsClubHatToManage = computed(() => isStaff.value && !isActingAsThisClub.value)

const verificationLoading = ref(false)
const verificationError = ref('')

async function handleRequestVerification() {
  verificationError.value = ''
  verificationLoading.value = true
  try {
    await $fetch(`/api/v1/clubs/${resolvedClubId.value}/request-verification`, { method: 'POST' })
    await refreshClub()
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    verificationError.value = fetchError.data?.message ?? 'Could not request verification.'
  } finally {
    verificationLoading.value = false
  }
}

const roleColors: Record<string, string> = {
  OWNER: 'bg-warning-fill text-on-accent',
  ADMIN: 'bg-accent text-on-accent',
  MODERATOR: 'bg-primary text-on-primary',
  MEMBER: 'bg-surface-3 text-fg-secondary'
}

async function handleJoin() {
  joinError.value = ''
  joinMessage.value = ''
  joining.value = true
  try {
    await $fetch(`/api/v1/clubs/${resolvedClubId.value}/membership-requests`, { method: 'POST' })
    joinMessage.value = 'Request sent — waiting for approval.'
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    joinError.value = fetchError.data?.message ?? 'Could not send the request.'
  } finally {
    joining.value = false
  }
}

/**
 * Answer an invitation from this club (051).
 *
 * Reuses `joining` for the busy state: the two are mutually exclusive — you are
 * either being asked or asking — so a second flag would only be a way for them
 * to disagree.
 */
async function answerInvite(accept: boolean) {
  joinError.value = ''
  joinMessage.value = ''
  joining.value = true
  try {
    await $fetch(`/api/v1/clubs/${resolvedClubId.value}/invites/respond`, {
      method: 'POST',
      body: { accept }
    })
    joinMessage.value = accept ? 'You joined the club.' : 'Invitation declined.'
    await Promise.all([checkPendingRequest(), loadRoster()])
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    joinError.value = fetchError.data?.message ?? 'Could not answer that invitation.'
  } finally {
    joining.value = false
  }
}

async function handleLeave() {
  await $fetch(`/api/v1/clubs/${resolvedClubId.value}/leave`, { method: 'POST' })
  await loadRoster()
}

const memberActionError = ref('')
const memberBusyId = ref<string | null>(null)

async function updateMember(playerId: string, body: { status?: string; role?: string }) {
  memberActionError.value = ''
  memberBusyId.value = playerId
  try {
    await $fetch(`/api/v1/clubs/${resolvedClubId.value}/members/${playerId}`, { method: 'PATCH', body })
    await loadRoster()
  } catch (err) {
    // Previously unhandled: a refused change left the row looking unchanged with
    // no reason given. The permission matrix below mirrors the server's, so a
    // 403 here means the two have drifted — worth showing, not swallowing.
    memberActionError.value = apiErrorMessage(err, 'Could not update this member.')
  } finally {
    memberBusyId.value = null
  }
}

/**
 * Which roles the current user may assign to a given member.
 *
 * This mirrors ClubService.updateMember, which is the real authority — the UI
 * offering an action the server refuses is worse than not offering it. From
 * that matrix:
 *   - the OWNER row is never modifiable, by anyone;
 *   - nobody edits their own membership here (leaving is a separate action);
 *   - an ADMIN may not touch another ADMIN, and may not grant ADMIN.
 * So the owner can assign all three lower roles, and an admin can only move
 * members and moderators between those two.
 *
 * An empty list means the row shows no role control at all.
 */
const ASSIGNABLE_BY_OWNER: ClubRole[] = ['ADMIN', 'MODERATOR', 'MEMBER']
const ASSIGNABLE_BY_ADMIN: ClubRole[] = ['MODERATOR', 'MEMBER']

function assignableRolesFor(member: RosterMemberDto): ClubRole[] {
  if (!canManageMembers.value) return []
  if (member.role === 'OWNER') return []
  if (member.player_id === myProfile.value?.id) return []
  if (isOwner.value) return ASSIGNABLE_BY_OWNER
  return member.role === 'ADMIN' ? [] : ASSIGNABLE_BY_ADMIN
}

/**
 * Same matrix, for removal. The previous condition offered Remove to an admin
 * against another admin, which the server then refused with a 403 the UI never
 * surfaced.
 */
function canRemoveMember(member: RosterMemberDto): boolean {
  if (!canManageMembers.value) return false
  if (member.role === 'OWNER') return false
  if (member.player_id === myProfile.value?.id) return false
  if (!isOwner.value && member.role === 'ADMIN') return false
  return true
}

function changeRole(member: RosterMemberDto, nextRole: string) {
  if (!nextRole || nextRole === member.role) return
  updateMember(member.player_id, { role: nextRole })
}

const showAnnouncementForm = ref(false)
const newAnnouncement = ref({ title: '', body: '' })
const announcementError = ref('')
const creatingAnnouncement = ref(false)

async function createAnnouncement() {
  if (!newAnnouncement.value.title || !newAnnouncement.value.body) return
  announcementError.value = ''
  creatingAnnouncement.value = true
  try {
    await $fetch(`/api/v1/clubs/${resolvedClubId.value}/announcements`, {
      method: 'POST',
      body: newAnnouncement.value
    })
    newAnnouncement.value = { title: '', body: '' }
    showAnnouncementForm.value = false
    await loadAnnouncements()
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    announcementError.value = fetchError.data?.message ?? 'Failed to create announcement.'
  } finally {
    creatingAnnouncement.value = false
  }
}

async function publishAnnouncement(id: string) {
  await $fetch(`/api/v1/clubs/${resolvedClubId.value}/announcements/${id}/publish`, { method: 'POST' })
  await loadAnnouncements()
}

async function archiveAnnouncement(id: string) {
  await $fetch(`/api/v1/clubs/${resolvedClubId.value}/announcements/${id}/archive`, { method: 'POST' })
  await loadAnnouncements()
}

async function togglePin(id: string) {
  await $fetch(`/api/v1/clubs/${resolvedClubId.value}/announcements/${id}/pin`, { method: 'POST' })
  await loadAnnouncements()
}

async function markAsRead(id: string) {
  await $fetch(`/api/v1/clubs/${resolvedClubId.value}/announcements/${id}/read`, { method: 'POST' })
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString()
}

const publishedAnnouncements = computed(() =>
  announcements.value.filter((a) => a.status === 'published')
)
const draftAnnouncements = computed(() => announcements.value.filter((a) => a.status === 'draft'))

// Split roster into pending requests and active members for admin view
const pendingRequests = computed(() => roster.value?.filter((m) => m.status === 'pending') ?? [])
const activeMembers = computed(() => roster.value?.filter((m) => m.status === 'active') ?? [])
</script>

<template>
  <div class="min-h-screen bg-canvas p-4 lg:p-6">
    <div class="page-shell">
      <UiPageHeader to="/clubs" back-label="Clubs" />

      <!-- Loading -->
      <div v-if="clubPending" class="space-y-4">
        <div class="h-32 animate-pulse rounded-xl bg-surface" />
        <div class="h-48 animate-pulse rounded-xl bg-surface" />
      </div>

      <!-- Error -->
      <div v-else-if="clubError" class="rounded-xl bg-red-500/10 p-6 text-center">
        <p class="text-red-400">
          {{
            clubError.statusCode === 404
              ? 'This club is private or does not exist.'
              : 'Could not load this club.'
          }}
        </p>
        <NuxtLink to="/clubs" class="mt-4 inline-block text-sm text-primary hover:underline">
          Browse clubs
        </NuxtLink>
      </div>

      <template v-else-if="club">
        <!-- Header. The mockup leads with a cover photo; there is no image
             column on clubs, so this is generated from the name — see
             UiCoverArt. The logo tile overlaps the cover, as drawn. -->
        <div class="mb-6 overflow-hidden rounded-card border border-border bg-surface shadow-card">
          <!-- An uploaded cover when there is one; otherwise the generated
               banner, which is a finished design rather than a placeholder. -->
          <img
            v-if="club.cover_photo_url"
            :src="club.cover_photo_url"
            :alt="`${club.name} cover photo`"
            class="h-36 w-full object-cover sm:h-48"
          />
          <UiCoverArt v-else :name="club.name" variant="banner" rounded="rounded-none" />

          <div class="flex items-start gap-4 p-6 pt-0">
            <img
              v-if="club.logo_url"
              :src="club.logo_url"
              :alt="`${club.name} logo`"
              class="-mt-8 h-16 w-16 flex-shrink-0 rounded-xl border-4 border-surface object-cover"
            />
            <div
              v-else
              class="-mt-8 flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl border-4 border-surface bg-surface-2 text-2xl font-bold text-fg"
            >
              {{ club.name.charAt(0).toUpperCase() }}
            </div>
            <div class="flex-1 pt-4">
              <div class="flex items-center gap-2">
                <h1 class="text-2xl font-bold text-fg">{{ club.name }}</h1>
                <VerifiedBadge v-if="club.verification_status === 'verified'" />
                <span
                  v-if="club.visibility === 'private'"
                  class="rounded-full bg-fg-muted/20 px-2 py-0.5 text-xs font-medium text-fg-muted"
                >
                  Private Club
                </span>
              </div>
              <p v-if="club.city || club.province || club.barangay" class="mt-1 text-fg-muted">
                {{ [club.barangay, club.city, club.province].filter(Boolean).join(', ') }}
              </p>
              <p v-if="club.description" class="mt-3 text-fg-secondary">
                {{ club.description }}
              </p>

              <!-- Court Details -->
              <div
                v-if="club.court_name || club.court_address"
                class="mt-3 rounded-lg bg-canvas p-3"
              >
                <p v-if="club.court_name" class="text-sm font-medium text-fg">
                  🏸 {{ club.court_name }}
                </p>
                <p v-if="club.court_address" class="mt-1 text-xs text-fg-muted">
                  📍 {{ club.court_address }}
                </p>
              </div>

              <!-- Verification status/action, owner only -->
              <div v-if="canRequestVerification" class="mt-3">
                <span
                  v-if="club.verification_status === 'pending'"
                  class="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs text-amber-400"
                >
                  Verification requested — awaiting review
                </span>
                <button
                  v-else-if="club.verification_status !== 'verified'"
                  type="button"
                  :disabled="verificationLoading"
                  class="rounded-lg border border-border-strong px-3 py-1.5 text-xs text-fg-secondary hover:bg-surface-2 disabled:opacity-50"
                  @click="handleRequestVerification"
                >
                  {{ verificationLoading ? 'Requesting…' : 'Request Verification' }}
                </button>
                <p v-if="verificationError" class="mt-1 text-xs text-red-400">
                  {{ verificationError }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Club Stats -->
        <div v-if="roster" class="mb-6 rounded-xl bg-surface p-5 shadow-card">
          <h2 class="mb-3 text-sm font-medium uppercase tracking-wider text-fg-muted">
            Club Stats
          </h2>
          <div class="flex gap-6 text-fg-secondary">
            <span>👥 {{ roster.filter((m) => m.status === 'active').length }} Members</span>
            <span
              >🎾 {{ clubMatches.length }}{{ clubMatches.length === 50 ? '+' : '' }} Matches</span
            >
            <span>📅 {{ upcomingClubEvents.length + previousClubEvents.length }} Events</span>
          </div>
        </div>

        <!-- Top members, on the shared RankingBoard. This was a third
             hand-rolled podium: a [2,1,3] loop with ring-coloured initials and
             w-14 plinth stubs, which rendered nothing at all when the club had
             fewer than three rated members. UiPodium handles a short list. -->
        <div
          v-if="clubRankings.length > 0 || clubDoublesRankings.length > 0"
          class="mb-6 rounded-xl bg-surface p-5 shadow-card"
        >
          <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 class="font-semibold text-fg">Top Members</h2>
            <!-- Both ladders. The endpoint has always served doubles; the page
                 simply never asked, so half the answer was unreachable. -->
            <div class="flex rounded-pill bg-canvas p-0.5" role="tablist">
              <button
                v-for="type in ['singles', 'doubles'] as const"
                :key="type"
                type="button"
                role="tab"
                :aria-selected="rankingType === type"
                class="rounded-pill px-3 py-1 text-xs font-medium capitalize transition-colors"
                :class="
                  rankingType === type
                    ? 'bg-primary text-on-primary'
                    : 'text-fg-muted hover:text-fg'
                "
                @click="rankingType = type"
              >
                {{ type }}
              </button>
            </div>
          </div>
          <RankingBoard
            :entries="visibleRankings"
            :glow="false"
            compact
            :empty-title="`No rated ${rankingType} members yet`"
            empty-message="Ratings appear once members have played verified matches."
            @select="navigateTo(`/players/${$event.player_id}`)"
          />
        </div>

        <!-- Recent Club Matches -->
        <div v-if="clubMatches.length > 0" class="mb-6 rounded-xl bg-surface p-5 shadow-card">
          <h2 class="mb-4 font-semibold text-fg">Recent Club Matches</h2>
          <div class="space-y-2">
            <NuxtLink
              v-for="match in clubMatches.slice(0, 5)"
              :key="match.id"
              :to="`/matches/${match.id}`"
              class="flex items-center justify-between rounded-lg bg-canvas p-3 hover:bg-surface-2"
            >
              <div class="text-sm text-fg">
                <span
                  v-for="(p, i) in match.participants.filter((pp) => pp.team_number === 1)"
                  :key="p.player_id"
                >
                  {{ i > 0 ? ' & ' : '' }}{{ p.display_name }}
                </span>
                <span class="mx-1 text-fg-muted">vs</span>
                <span
                  v-for="(p, i) in match.participants.filter((pp) => pp.team_number === 2)"
                  :key="p.player_id"
                >
                  {{ i > 0 ? ' & ' : '' }}{{ p.display_name }}
                </span>
                <span class="ml-2 text-primary">{{ formatScore(match.scores) }}</span>
              </div>
              <span class="text-xs text-fg-muted">{{
                new Date(match.played_at).toLocaleDateString()
              }}</span>
            </NuxtLink>
          </div>
        </div>

        <!-- Upcoming Events -->
        <div
          v-if="upcomingClubEvents.length > 0"
          class="mb-6 rounded-xl bg-surface p-5 shadow-card"
        >
          <h2 class="mb-4 font-semibold text-fg">Upcoming Events</h2>
          <div class="space-y-2">
            <NuxtLink
              v-for="e in upcomingClubEvents"
              :key="e.id"
              :to="`/events/${e.id}`"
              class="flex items-center justify-between rounded-lg bg-canvas p-3 hover:bg-surface-2"
            >
              <span class="text-sm text-fg">
                📅 {{ e.name }}
                <span class="text-fg-muted">{{
                  [e.venue, e.city].filter(Boolean).join(', ')
                }}</span>
              </span>
              <span class="text-xs text-fg-muted">{{ formatEventDate(e.start_date) }}</span>
            </NuxtLink>
          </div>
        </div>

        <!-- Previous Events -->
        <div
          v-if="previousClubEvents.length > 0"
          class="mb-6 rounded-xl bg-surface p-5 shadow-card"
        >
          <h2 class="mb-4 font-semibold text-fg">Previous Events</h2>
          <div class="space-y-2">
            <NuxtLink
              v-for="e in previousClubEvents"
              :key="e.id"
              :to="`/events/${e.id}`"
              class="flex items-center justify-between rounded-lg bg-canvas p-3 hover:bg-surface-2"
            >
              <span class="text-sm text-fg-secondary">📅 {{ e.name }}</span>
              <span class="text-xs text-fg-muted">{{ formatEventDate(e.start_date) }}</span>
            </NuxtLink>
          </div>
        </div>

        <!-- Announcements -->
        <div
          v-if="publishedAnnouncements.length > 0"
          class="mb-6 rounded-xl bg-surface p-5 shadow-card"
        >
          <h2 class="mb-4 font-semibold text-fg">Announcements</h2>
          <div class="space-y-3">
            <ClubAnnouncementCard
              v-for="ann in publishedAnnouncements"
              :key="ann.id"
              :announcement="ann"
              :can-manage="canManageAnnouncements"
              @read="markAsRead"
              @pin="togglePin"
              @archive="archiveAnnouncement"
            >
              <template #date>{{ formatDate(ann.published_at || ann.created_at) }}</template>
            </ClubAnnouncementCard>
          </div>
        </div>

        <!-- Draft Announcements (Staff Only) -->
        <div
          v-if="canManageAnnouncements && draftAnnouncements.length > 0"
          class="mb-6 rounded-xl bg-surface p-5 shadow-card"
        >
          <h2 class="mb-4 font-semibold text-fg-muted">Drafts</h2>
          <div class="space-y-3">
            <div
              v-for="ann in draftAnnouncements"
              :key="ann.id"
              class="rounded-lg border-2 border-dashed border-border-strong p-4"
            >
              <div class="flex items-start justify-between">
                <span class="font-medium text-fg-secondary">{{ ann.title }}</span>
                <span class="rounded-md bg-surface-3 px-2 py-0.5 text-xs text-fg-muted">Draft</span>
              </div>
              <p class="mt-2 text-fg-muted">{{ ann.body }}</p>
              <div class="mt-3 flex gap-3">
                <button
                  class="text-xs text-primary hover:underline"
                  @click="publishAnnouncement(ann.id)"
                >
                  Publish
                </button>
                <button
                  class="text-xs text-red-400 hover:underline"
                  @click="archiveAnnouncement(ann.id)"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- New Announcement Form (Staff Only) -->
        <div v-if="canManageAnnouncements" class="mb-6">
          <button
            v-if="!showAnnouncementForm"
            class="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            @click="showAnnouncementForm = true"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 4v16m8-8H4"
              />
            </svg>
            New Announcement
          </button>
          <div v-else class="rounded-xl bg-surface p-5 shadow-card">
            <h3 class="mb-4 font-semibold text-fg">Create Announcement</h3>
            <div class="mb-3">
              <label class="mb-1.5 block text-sm text-fg-secondary">Title</label>
              <input
                v-model="newAnnouncement.title"
                type="text"
                placeholder="Announcement title"
                class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none"
              />
            </div>
            <div class="mb-3">
              <label class="mb-1.5 block text-sm text-fg-secondary">Content</label>
              <textarea
                v-model="newAnnouncement.body"
                placeholder="Announcement content..."
                rows="3"
                class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none"
              />
            </div>
            <p v-if="announcementError" class="mb-3 text-sm text-red-400">
              {{ announcementError }}
            </p>
            <div class="flex gap-2">
              <button
                :disabled="creatingAnnouncement"
                class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
                @click="createAnnouncement"
              >
                {{ creatingAnnouncement ? 'Creating...' : 'Create Draft' }}
              </button>
              <button
                class="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-fg-secondary hover:bg-surface-2"
                @click="showAnnouncementForm = false"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>

        <!-- Admin Actions -->
        <div v-if="canUseClubActions" class="mb-6 grid gap-3 sm:grid-cols-2">
          <NuxtLink
            :to="`/matches/submit?club=${clubId}`"
            class="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-medium text-on-primary hover:bg-primary-hover"
          >
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 4v16m8-8H4"
              />
            </svg>
            Submit Match
          </NuxtLink>
          <NuxtLink
            :to="`/create-event?club=${clubId}`"
            class="flex items-center justify-center gap-2 rounded-xl border border-primary px-4 py-3 font-medium text-primary hover:bg-primary/10"
          >
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            Create Event
          </NuxtLink>
        </div>

        <!-- Join CTA (Non-Members) -->
        <div v-if="notAMember" class="mb-6 rounded-xl bg-surface p-6 text-center shadow-card">
          <h2 class="font-semibold text-fg">
            {{ club.visibility === 'private' ? 'Private Club' : 'Join This Club' }}
          </h2>
          <p class="mt-1 text-fg-muted">
            {{
              club.visibility === 'private'
                ? 'This is a private club. Request membership to access full details.'
                : 'Request membership to see member roster and announcements'
            }}
          </p>

          <!-- Already has pending request -->
          <div
            v-if="hasPendingRequest"
            class="mt-4 rounded-lg bg-amber-500/10 p-3 text-amber-400 ring-1 ring-amber-500/30"
          >
            Your membership request is pending approval.
          </div>

          <!-- Request was rejected -->
          <div
            v-else-if="membershipStatus === 'rejected'"
            class="mt-4 rounded-lg bg-red-500/10 p-3 text-red-400 ring-1 ring-red-500/30"
          >
            Your membership request was declined. You may request again.
          </div>

          <!-- Success message after requesting -->
          <div
            v-else-if="joinMessage"
            class="mt-4 rounded-lg bg-primary/10 p-3 text-primary ring-1 ring-primary/30"
          >
            {{ joinMessage }}
          </div>

          <p v-if="joinError" class="mt-4 text-sm text-red-400">{{ joinError }}</p>

          <!-- Already invited: answering is the action, not asking again.
               Without this the page offered "Request to Join" to somebody the
               club had already invited, and the request came back as a
               conflict. -->
          <div v-if="membershipStatus === 'invited' && !joinMessage" class="mt-4">
            <p class="text-sm text-fg-secondary">This club has invited you to join.</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                :disabled="joining"
                class="rounded-lg bg-primary px-6 py-2.5 font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
                @click="answerInvite(true)"
              >
                Accept invitation
              </button>
              <button
                type="button"
                :disabled="joining"
                class="rounded-lg border border-border-strong px-4 py-2.5 text-sm text-fg-secondary hover:border-danger hover:text-danger disabled:opacity-50"
                @click="answerInvite(false)"
              >
                Decline
              </button>
            </div>
          </div>

          <!-- Show join button only if no pending request or invitation, and
               not just submitted -->
          <button
            v-else-if="!hasPendingRequest && !joinMessage"
            :disabled="joining"
            class="mt-4 rounded-lg bg-primary px-6 py-2.5 font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
            @click="handleJoin"
          >
            {{ joining ? 'Requesting...' : 'Request to Join' }}
          </button>
        </div>

        <!-- Pending Requests Section (Admins Only) -->
        <div
          v-if="roster && canReviewJoinRequests && pendingRequests.length > 0"
          class="mb-6 rounded-xl bg-amber-500/10 p-5 ring-1 ring-amber-500/30"
        >
          <h2 class="mb-4 flex items-center gap-2 font-semibold text-amber-400">
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Pending Requests ({{ pendingRequests.length }})
          </h2>
          <div class="space-y-2">
            <div
              v-for="member in pendingRequests"
              :key="member.id"
              class="flex items-center justify-between rounded-lg bg-canvas p-3"
            >
              <div class="flex items-center gap-3">
                <div
                  class="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-sm font-bold text-fg-secondary"
                >
                  {{ member.display_name.charAt(0).toUpperCase() }}
                </div>
                <NuxtLink
                  :to="`/players/${member.player_id}`"
                  class="font-medium text-fg hover:text-primary"
                >
                  {{ member.display_name }}
                </NuxtLink>
              </div>
              <div class="flex gap-2">
                <button
                  class="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-on-primary hover:bg-primary-hover"
                  @click="updateMember(member.player_id, { status: 'active' })"
                >
                  Approve
                </button>
                <button
                  class="rounded-lg border border-red-400 px-3 py-1 text-xs font-medium text-red-400 hover:bg-red-400/10"
                  @click="updateMember(member.player_id, { status: 'rejected' })"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Members List (Active Members Only) -->
        <div v-if="roster" class="mb-6 rounded-xl bg-surface p-5 shadow-card">
          <h2 class="mb-4 font-semibold text-fg">Members ({{ activeMembers.length }})</h2>

          <!-- Staff on this page without its hat. Says why the controls are not
               here, rather than letting them silently not exist. -->
          <p
            v-if="needsClubHatToManage"
            class="mb-4 rounded-button bg-surface-2 px-3 py-2 text-xs text-fg-secondary"
          >
            Switch to <span class="font-medium text-fg">{{ club?.name }}</span> in the account
            switcher to change roles, remove members or manage announcements.
          </p>

          <p
            v-if="memberActionError"
            role="alert"
            class="mb-4 rounded-button bg-danger/10 px-3 py-2 text-xs text-danger"
          >
            {{ memberActionError }}
          </p>

          <div class="space-y-2">
            <div
              v-for="member in activeMembers"
              :key="member.id"
              class="flex items-center justify-between rounded-lg bg-canvas p-3"
            >
              <div class="flex items-center gap-3">
                <div
                  class="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-sm font-bold text-fg-secondary"
                >
                  {{ member.display_name.charAt(0).toUpperCase() }}
                </div>
                <NuxtLink
                  :to="`/players/${member.player_id}`"
                  class="font-medium text-fg hover:text-primary"
                >
                  {{ member.display_name }}
                </NuxtLink>
                <span
                  class="rounded-md px-2 py-0.5 text-xs font-medium"
                  :class="roleColors[member.role] || roleColors.MEMBER"
                >
                  {{ member.role }}
                </span>
              </div>

              <div class="flex flex-shrink-0 items-center gap-2">
                <!-- Role control. The API has always accepted a role change;
                     until now nothing in the app ever sent one, so a member
                     stayed a MEMBER for life. Options come from the same matrix
                     the server enforces, so nothing offered here can 403. -->
                <label v-if="assignableRolesFor(member).length" class="sr-only">
                  Role for {{ member.display_name }}
                </label>
                <select
                  v-if="assignableRolesFor(member).length"
                  :value="member.role"
                  :disabled="memberBusyId === member.player_id"
                  class="rounded-button border border-border-strong bg-surface px-2 py-1 text-xs text-fg focus:border-primary focus:outline-none disabled:opacity-50"
                  @change="changeRole(member, ($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="role in assignableRolesFor(member)" :key="role" :value="role">
                    {{ role }}
                  </option>
                </select>

                <button
                  v-if="canRemoveMember(member)"
                  :disabled="memberBusyId === member.player_id"
                  class="rounded-button border border-danger px-3 py-1 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
                  @click="updateMember(member.player_id, { status: 'left' })"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>

          <button
            v-if="myMembership && myMembership.role !== 'OWNER'"
            class="mt-4 rounded-lg border border-red-400 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-400/10"
            @click="handleLeave"
          >
            Leave Club
          </button>
        </div>

        <!-- Back Link -->
        <div class="text-center">
          <NuxtLink to="/my-clubs" class="text-sm text-primary hover:underline">
            Back to My Clubs
          </NuxtLink>
        </div>
      </template>
    </div>
  </div>
</template>
