<script setup lang="ts">
import type { PlayerProfileDto } from '~/server/domains/player/dto/player-profile.dto'
import type { PlayerRatingDto } from '~/server/domains/rating/dto/rating.dto'
import type { PlayerStatsDto, RatingHistoryPointDto } from '~/server/domains/analytics/dto/analytics.dto'
import type { ActivityDto } from '~/server/domains/activity/dto/activity.dto'

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
  participants: Array<{ player_id: string; team_number: 1 | 2; display_name: string }>
  scores: Array<{ set_number: number; team1_score: number; team2_score: number }>
}

interface SelectedBadge {
  id: string
  name: string
  icon: string
  description: string
  category: string
  selectedAt: string
}

const route = useRoute()
const user = useSupabaseUser()
const playerId = computed(() => route.params.playerId as string)

const {
  data: profile,
  pending,
  error
} = await useFetch<PlayerProfileDto>(() => `/api/v1/players/${playerId.value}`)

const { data: ratings } = await useFetch<{
  singles: PlayerRatingDto | null
  doubles: PlayerRatingDto | null
}>(() => `/api/v1/players/${playerId.value}/ratings`)

const { data: achievementsData } = await useFetch<{ achievements: PlayerAchievement[] }>(
  () => `/api/v1/players/${playerId.value}/achievements`
)

// Header stats row and the Stats tab used to be hardcoded mock numbers (124 matches,
// 68% win rate, etc.) — identical no matter which player's profile you opened. Both of
// these, plus the rating-history chart and activity feed below, now come from the real
// per-player analytics/activity endpoints, which already enforce the profile's public
// visibility server-side.
const { data: stats } = await useFetch<PlayerStatsDto>(() => `/api/v1/players/${playerId.value}/stats`)

const { data: ratingHistoryData } = await useFetch<{ history: RatingHistoryPointDto[] }>(
  () => `/api/v1/players/${playerId.value}/rating-history`,
  { query: { type: 'singles', days: 180 } }
)

const { data: activitiesData } = await useFetch<{ activities: ActivityDto[] }>(
  () => `/api/v1/players/${playerId.value}/activities`,
  { query: { limit: 10 } }
)

const { data: badgeData } = await useFetch<{ data: SelectedBadge | null }>(
  () => `/api/v1/players/${playerId.value}/badge`,
  { server: false }
)

const { data: myProfile } = await useFetch<PlayerProfileDto | null>('/api/v1/players/me', {
  server: false
})

const isOwnProfile = computed(() => myProfile.value?.id === playerId.value)

// match_participants/matches RLS restricts raw match rows to participants only — there's
// no public policy for browsing another player's individual match history, only for
// aggregate stats (fetched above). So real match data is only ever shown for your own
// profile; viewing someone else's shows an honest "private" message instead of the old
// fake match list every profile used to display.
const { data: myMatchesData, execute: fetchMyMatches } = await useFetch<{ data: MatchSummary[] }>(
  '/api/v1/players/me/matches',
  { query: { limit: 10 }, immediate: false, server: false }
)

watch(isOwnProfile, (val) => {
  if (val) fetchMyMatches()
}, { immediate: true })

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

const { data: partnersData, refresh: refreshPartners } = await useFetch<{ data: PartnerDto[] }>(
  '/api/v1/players/me/partners',
  { server: false }
)

const { data: outgoingRequests, refresh: refreshOutgoing } = await useFetch<{ data: PartnerRequestDto[] }>(
  '/api/v1/players/me/partner-requests/outgoing',
  { server: false }
)

const isPartner = computed(() => {
  if (!partnersData.value?.data) return false
  return partnersData.value.data.some(p => p.player_id === playerId.value)
})

const pendingRequest = computed(() => {
  if (!outgoingRequests.value?.data) return null
  return outgoingRequests.value.data.find(r => r.to_player_id === playerId.value && r.status === 'pending')
})

const partnerLoading = ref(false)
const activeTab = ref<'overview' | 'matches' | 'stats' | 'achievements' | 'activity' | 'clubs'>('overview')

const { data: clubsData } = await useFetch<{ items: Array<{ club: { id: string; name: string; is_verified: boolean } }> }>(
  () => `/api/v1/players/${playerId.value}/clubs`
)

async function sendPartnerRequest() {
  if (!user.value) return
  partnerLoading.value = true
  try {
    await $fetch(`/api/v1/players/${playerId.value}/partner-request`, { method: 'POST' })
    await refreshOutgoing()
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
  } finally {
    partnerLoading.value = false
  }
}

const achievements = computed(() => achievementsData.value?.achievements?.slice(0, 6) ?? [])
const displayRating = computed(() => Math.max(ratings.value?.singles?.rating_value ?? 0, ratings.value?.doubles?.rating_value ?? 0))
const selectedBadge = computed(() => badgeData.value?.data ?? null)

function getOpponentNames(match: MatchSummary): string {
  const myTeam = match.participants.find(p => p.player_id === myProfile.value?.id)?.team_number
  const opponents = match.participants.filter(p => p.team_number !== myTeam)
  return opponents.map(p => p.display_name).join(' & ') || 'Unknown'
}

function didIWin(match: MatchSummary): boolean | null {
  const myTeam = match.participants.find(p => p.player_id === myProfile.value?.id)?.team_number
  if (!myTeam || match.scores.length === 0) return null
  const mySets = match.scores.filter(s =>
    myTeam === 1 ? s.team1_score > s.team2_score : s.team2_score > s.team1_score
  ).length
  return mySets > match.scores.length / 2
}

function formatScore(match: MatchSummary): string {
  return match.scores.map(s => `${s.team1_score}-${s.team2_score}`).join(', ')
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
const ratingHistoryBars = computed(() => {
  const points = ratingHistoryPoints.value
  if (points.length === 0) return []
  const values = points.map(p => p.rating_value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  // Floor bars at 20% so a flat history (min === max) still reads as a bar chart
  // rather than a row of invisible slivers.
  return points.map(p => ({ heightPct: 20 + ((p.rating_value - min) / range) * 70 }))
})
const ratingHistoryRangeLabel = computed(() => {
  const points = ratingHistoryPoints.value
  if (points.length === 0) return null
  const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return { start: fmt(points[0].date), end: fmt(points[points.length - 1].date) }
})

const trendLabel = computed(() => {
  if (stats.value?.rating_trend === 'rising') return 'Rising ↑'
  if (stats.value?.rating_trend === 'falling') return 'Falling ↓'
  return 'Stable'
})
const trendClass = computed(() => {
  if (stats.value?.rating_trend === 'rising') return 'text-[#4DB175]'
  if (stats.value?.rating_trend === 'falling') return 'text-red-400'
  return 'text-white'
})

const activities = computed(() => activitiesData.value?.activities ?? [])

function getActivityIcon(type: string): string {
  switch (type) {
    case 'match.verified': return '🎯'
    case 'rating.changed': return '📈'
    case 'achievement.earned': return '🏆'
    case 'profile.updated': return '✏️'
    case 'club.event_created': return '📅'
    case 'club.member_joined': return '🏸'
    case 'club.announcement': return '📣'
    case 'social.started_following': return '👤'
    case 'social.shoutout': return '📣'
    default: return '📌'
  }
}

function formatActivityText(activity: ActivityDto): string {
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
      return `created an event${payload.event_name ? `: ${payload.event_name}` : ''}`
    case 'club.member_joined':
      return `joined ${payload.club_name ?? 'a club'}`
    case 'club.announcement':
      return `posted an announcement${payload.club_name ? ` in ${payload.club_name}` : ''}`
    case 'social.started_following':
      return `started following ${payload.target_display_name ?? 'someone'}`
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
  <div class="min-h-screen bg-[#0B0D09] p-4 lg:p-6">
    <!-- Loading -->
    <div v-if="pending" class="mx-auto max-w-3xl space-y-4">
      <div class="flex items-start gap-4">
        <div class="h-20 w-20 animate-pulse rounded-full bg-[#1E2E2A]" />
        <div class="flex-1 space-y-2">
          <div class="h-6 w-48 animate-pulse rounded bg-[#1E2E2A]" />
          <div class="h-4 w-32 animate-pulse rounded bg-[#1E2E2A]" />
        </div>
      </div>
      <div class="h-48 animate-pulse rounded-xl bg-[#1E2E2A]" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="mx-auto max-w-3xl rounded-xl bg-[#1E2E2A] p-8 text-center">
      <p class="text-4xl">🔒</p>
      <h2 class="mt-4 text-xl font-semibold text-white">
        {{ error.statusCode === 404 ? 'Profile Not Found' : 'Error Loading Profile' }}
      </h2>
      <p class="mt-2 text-sm text-[#6B7B75]">
        {{ error.statusCode === 404 ? 'This profile is private or does not exist.' : 'Please try again later.' }}
      </p>
      <NuxtLink to="/players" class="mt-4 inline-block rounded-lg bg-[#4DB175] px-4 py-2 text-white">
        Browse Players
      </NuxtLink>
    </div>

    <!-- Profile -->
    <div v-else-if="profile" class="mx-auto max-w-3xl space-y-6">
      <!-- Back Button -->
      <NuxtLink to="/players" class="inline-flex items-center gap-2 text-sm text-[#6B7B75] hover:text-white">
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </NuxtLink>

      <!-- Header Card -->
      <div class="rounded-xl bg-[#1E2E2A] p-6">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <!-- Avatar & Info -->
          <div class="flex items-start gap-4">
            <div class="relative">
              <div class="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full bg-[#2E4540] text-3xl font-bold text-white ring-4 ring-[#4DB175]">
                {{ profile.display_name?.charAt(0).toUpperCase() }}
              </div>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h1 class="text-2xl font-bold text-white">{{ profile.display_name }}</h1>
                <span v-if="selectedBadge" :title="selectedBadge.name" class="text-xl">{{ selectedBadge.icon }}</span>
              </div>
              <p v-if="profile.city || profile.province" class="mt-1 text-sm text-[#6B7B75]">
                {{ [profile.city, profile.province].filter(Boolean).join(', ') }}
              </p>
              <p v-if="profile.bio" class="mt-2 text-sm text-[#A6ABA7]">{{ profile.bio }}</p>
            </div>
          </div>

          <!-- Rating & Action -->
          <div class="flex flex-col items-end gap-2">
            <div class="text-right">
              <p class="text-xs uppercase text-[#6B7B75]">RATING</p>
              <p class="text-3xl font-bold text-[#4DB175]">{{ displayRating > 0 ? displayRating.toFixed(2) : '—' }}</p>
            </div>
            <!-- Partner button (replaces Follow) -->
            <template v-if="user && !isOwnProfile">
              <!-- Already partners -->
              <button
                v-if="isPartner"
                class="rounded-lg border border-[#4DB175] px-5 py-2 text-sm font-medium text-[#4DB175] transition-colors hover:border-red-400 hover:text-red-400"
                :disabled="partnerLoading"
                @click="removePartner"
              >
                {{ partnerLoading ? '...' : 'Duo Partner' }}
              </button>
              <!-- Pending request -->
              <button
                v-else-if="pendingRequest"
                class="rounded-lg border border-[#F5A623] px-5 py-2 text-sm font-medium text-[#F5A623] transition-colors hover:border-red-400 hover:text-red-400"
                :disabled="partnerLoading"
                @click="cancelPartnerRequest"
              >
                {{ partnerLoading ? '...' : 'Pending' }}
              </button>
              <!-- Not partners -->
              <button
                v-else
                class="rounded-lg bg-[#4DB175] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#5FC287]"
                :disabled="partnerLoading"
                @click="sendPartnerRequest"
              >
                {{ partnerLoading ? '...' : 'Request as Duo Partner' }}
              </button>
            </template>
          </div>
        </div>

        <!-- Stats Row -->
        <div class="mt-6 grid grid-cols-4 gap-4 border-t border-[#3A5750] pt-4">
          <div class="text-center">
            <p class="text-xl font-bold text-white">{{ stats?.total_matches ?? 0 }}</p>
            <p class="text-xs text-[#6B7B75]">Matches</p>
          </div>
          <div class="text-center">
            <p class="text-xl font-bold text-white">{{ stats ? `${stats.win_rate}%` : '—' }}</p>
            <p class="text-xs text-[#6B7B75]">Win Rate</p>
          </div>
          <div class="text-center">
            <p class="text-xl font-bold text-white">{{ stats ? `${stats.wins}-${stats.losses}` : '—' }}</p>
            <p class="text-xs text-[#6B7B75]">W - L</p>
          </div>
          <div class="text-center">
            <p class="text-xl font-bold text-white">{{ stats?.achievements_count ?? 0 }}</p>
            <p class="text-xs text-[#6B7B75]">Achievements</p>
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex gap-1 rounded-xl bg-[#1E2E2A] p-1">
        <button
          v-for="tab in ['overview', 'matches', 'stats', 'achievements', 'activity', 'clubs'] as const"
          :key="tab"
          class="flex-1 rounded-lg py-2 text-xs font-medium capitalize transition-colors"
          :class="activeTab === tab
            ? 'bg-[#4DB175] text-white'
            : 'text-[#6B7B75] hover:text-white'"
          @click="activeTab = tab"
        >
          {{ tab }}
        </button>
      </div>

      <!-- Tab Content -->
      <div class="space-y-4">
        <!-- Overview Tab -->
        <template v-if="activeTab === 'overview'">
          <!-- Rating History -->
          <div class="rounded-xl bg-[#1E2E2A] p-5">
            <div class="mb-4 flex items-center justify-between">
              <span class="text-sm font-medium text-white">Rating History (singles, last 180 days)</span>
            </div>
            <div v-if="ratingHistoryBars.length > 0" class="flex h-32 items-end gap-1">
              <div v-for="(bar, i) in ratingHistoryBars" :key="i" class="flex-1 rounded-t bg-[#4DB175]/30" :style="{ height: `${bar.heightPct}%` }" />
            </div>
            <p v-else class="flex h-32 items-center justify-center text-sm text-[#6B7B75]">
              Not enough rating history yet
            </p>
            <div v-if="ratingHistoryRangeLabel" class="mt-2 flex justify-between text-xs text-[#6B7B75]">
              <span>{{ ratingHistoryRangeLabel.start }}</span>
              <span>{{ ratingHistoryRangeLabel.end }}</span>
            </div>
          </div>

          <!-- Dominant Hand & Preferred Position -->
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="rounded-xl bg-[#1E2E2A] p-4">
              <p class="text-xs text-[#6B7B75]">Dominant Hand</p>
              <p class="mt-1 font-medium capitalize text-white">{{ profile.dominant_hand || 'Not set' }}</p>
            </div>
            <div class="rounded-xl bg-[#1E2E2A] p-4">
              <p class="text-xs text-[#6B7B75]">Preferred Position</p>
              <p class="mt-1 font-medium capitalize text-white">{{ profile.preferred_position || 'Not set' }}</p>
            </div>
          </div>
        </template>

        <!-- Matches Tab -->
        <template v-if="activeTab === 'matches'">
          <div class="rounded-xl bg-[#1E2E2A] p-5">
            <h3 class="mb-4 text-sm font-medium text-white">Recent Matches</h3>
            <div v-if="!isOwnProfile" class="py-6 text-center text-sm text-[#6B7B75]">
              Match history is only visible to the player themselves.
            </div>
            <div v-else-if="!myMatchesData?.data.length" class="py-6 text-center text-sm text-[#6B7B75]">
              No matches yet.
            </div>
            <div v-else class="space-y-3">
              <NuxtLink
                v-for="match in myMatchesData.data"
                :key="match.id"
                :to="`/matches/${match.id}`"
                class="flex items-center justify-between rounded-lg bg-[#0B0D09] p-3 transition-all hover:bg-[#2E4540]"
              >
                <div>
                  <p class="text-sm text-white">vs {{ getOpponentNames(match) }}</p>
                  <p class="text-xs text-[#6B7B75]">{{ formatScore(match) }}</p>
                </div>
                <div class="text-right">
                  <span
                    class="rounded-md px-2 py-0.5 text-xs font-medium"
                    :class="didIWin(match) === true ? 'bg-[#4DB175]/20 text-[#4DB175]' : didIWin(match) === false ? 'bg-red-500/20 text-red-400' : 'bg-[#2E4540] text-[#A6ABA7]'"
                  >
                    {{ didIWin(match) === true ? 'Won' : didIWin(match) === false ? 'Lost' : 'Played' }}
                  </span>
                  <p class="mt-1 text-xs text-[#6B7B75]">{{ formatRelativeTime(match.played_at) }}</p>
                </div>
              </NuxtLink>
            </div>
          </div>
        </template>

        <!-- Stats Tab -->
        <template v-if="activeTab === 'stats'">
          <div class="rounded-xl bg-[#1E2E2A] p-5">
            <h3 class="mb-4 text-sm font-medium text-white">Performance Stats</h3>
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="rounded-lg bg-[#0B0D09] p-3">
                <p class="text-xs text-[#6B7B75]">Singles / Doubles Played</p>
                <p class="text-xl font-bold text-white">{{ stats?.singles_matches ?? 0 }} / {{ stats?.doubles_matches ?? 0 }}</p>
              </div>
              <div class="rounded-lg bg-[#0B0D09] p-3">
                <p class="text-xs text-[#6B7B75]">Matches This Month</p>
                <p class="text-xl font-bold text-white">{{ stats?.matches_this_month ?? 0 }}</p>
              </div>
              <div class="rounded-lg bg-[#0B0D09] p-3">
                <p class="text-xs text-[#6B7B75]">Rating Trend</p>
                <p class="text-xl font-bold" :class="trendClass">{{ trendLabel }}</p>
              </div>
              <div class="rounded-lg bg-[#0B0D09] p-3">
                <p class="text-xs text-[#6B7B75]">Tournaments Played</p>
                <p class="text-xl font-bold text-white">{{ stats?.tournaments_participated ?? 0 }}</p>
              </div>
            </div>
          </div>
        </template>

        <!-- Achievements Tab -->
        <template v-if="activeTab === 'achievements'">
          <div class="rounded-xl bg-[#1E2E2A] p-5">
            <h3 class="mb-4 text-sm font-medium text-white">Achievements</h3>
            <div v-if="achievements.length > 0" class="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div
                v-for="pa in achievements"
                :key="pa.achievement_id"
                class="rounded-lg bg-[#0B0D09] p-3 text-center"
              >
                <div class="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[#F5A623]/20 text-[#F5A623]">
                  🏆
                </div>
                <p class="text-xs font-medium text-white">{{ pa.achievement.name }}</p>
                <p class="text-xs text-[#6B7B75]">+{{ pa.achievement.points }} pts</p>
              </div>
            </div>
            <p v-else class="text-center text-[#6B7B75]">No achievements yet</p>
          </div>
        </template>

        <!-- Activity Tab -->
        <template v-if="activeTab === 'activity'">
          <div class="rounded-xl bg-[#1E2E2A] p-5">
            <h3 class="mb-4 text-sm font-medium text-white">Recent Activity</h3>
            <div v-if="activities.length === 0" class="py-6 text-center text-sm text-[#6B7B75]">
              No recent activity.
            </div>
            <div v-else class="space-y-3">
              <div v-for="a in activities" :key="a.id" class="flex items-center gap-3 rounded-lg bg-[#0B0D09] p-3">
                <span class="text-lg">{{ getActivityIcon(a.activity_type) }}</span>
                <div>
                  <p class="text-sm text-white capitalize">{{ formatActivityText(a) }}</p>
                  <p class="text-xs text-[#6B7B75]">{{ formatRelativeTime(a.created_at) }}</p>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- Clubs Tab -->
        <template v-if="activeTab === 'clubs'">
          <div class="rounded-xl bg-[#1E2E2A] p-5">
            <h3 class="mb-4 text-sm font-medium text-white">Club Memberships</h3>
            <div v-if="!clubsData?.items?.length" class="py-6 text-center text-sm text-[#6B7B75]">
              Not a member of any clubs.
            </div>
            <div v-else class="space-y-3">
              <NuxtLink
                v-for="membership in clubsData.items"
                :key="membership.club.id"
                :to="`/clubs/${membership.club.id}`"
                class="flex items-center gap-3 rounded-lg bg-[#0B0D09] p-3 transition-all hover:bg-[#2E4540]"
              >
                <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-[#2E4540] text-lg font-bold text-[#A6ABA7]">
                  {{ membership.club.name.charAt(0).toUpperCase() }}
                </div>
                <div class="flex-1">
                  <p class="text-sm font-medium text-white">{{ membership.club.name }}</p>
                </div>
                <div v-if="membership.club.is_verified" class="flex items-center gap-1 text-xs text-[#4DB175]">
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Verified
                </div>
              </NuxtLink>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
