<script setup lang="ts">
import type { ClubDto } from '~/server/domains/club/dto/club.dto'
import type { RosterMemberDto } from '~/server/domains/club/dto/club-membership.dto'
import type { AnnouncementDto } from '~/server/domains/announcement/dto/announcement.dto'

interface ClubMatchDto {
  id: string
  match_type: 'singles' | 'doubles'
  status: string
  played_at: string | null
  participants: { player_id: string; team_number: number; display_name?: string }[]
}

interface ClubRankingEntry {
  rank: number
  player_id: string
  display_name: string
  rating_value: number | null
}

const route = useRoute()
const clubId = route.params.clubId as string

// GET /api/v1/clubs/{clubId} returns the club object directly, not wrapped in
// { data }, unlike the other three fetches below.
const {
  data: club,
  pending: clubPending,
  error: clubError
} = await useFetch<ClubDto>(`/api/v1/clubs/${clubId}`)

const { data: membersResponse } = await useFetch<{ items: RosterMemberDto[] }>(
  `/api/v1/clubs/${clubId}/members`
)
const { data: matchesResponse } = await useFetch<{ data: ClubMatchDto[] }>(
  `/api/v1/clubs/${clubId}/matches`,
  { query: { limit: 5 } }
)
const { data: singlesRankingsResponse } = await useFetch<{ data: ClubRankingEntry[] }>(
  `/api/v1/clubs/${clubId}/rankings`,
  { query: { rating_type: 'singles', limit: 5 } }
)
const { data: doublesRankingsResponse } = await useFetch<{ data: ClubRankingEntry[] }>(
  `/api/v1/clubs/${clubId}/rankings`,
  { query: { rating_type: 'doubles', limit: 5 } }
)
const { data: announcementsResponse } = await useFetch<{ announcements: AnnouncementDto[] }>(
  `/api/v1/clubs/${clubId}/announcements`
)

const activeMembers = computed(
  () => membersResponse.value?.items.filter((m) => m.status === 'active') ?? []
)
const recentMatches = computed(() => matchesResponse.value?.data ?? [])
const topSinglesRankings = computed(() => singlesRankingsResponse.value?.data ?? [])
const topDoublesRankings = computed(() => doublesRankingsResponse.value?.data ?? [])

const recentAnnouncements = computed(() => {
  const all = announcementsResponse.value?.announcements ?? []
  return all
    .filter(a => a.status === 'published')
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      return new Date(b.published_at ?? b.created_at).getTime() - new Date(a.published_at ?? a.created_at).getTime()
    })
    .slice(0, 3)
})

const newMembers = computed(() => {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  return activeMembers.value
    .filter(m => m.joined_at && new Date(m.joined_at) >= thirtyDaysAgo)
    .sort((a, b) => new Date(b.joined_at!).getTime() - new Date(a.joined_at!).getTime())
    .slice(0, 5)
})
</script>

<template>
  <div class="min-h-screen bg-[#0B0D09] p-4 lg:p-6">
    <div v-if="clubPending" class="space-y-4">
      <div class="h-8 w-64 animate-pulse rounded bg-[#1E2E2A]" />
      <div class="grid gap-4 sm:grid-cols-3">
        <div v-for="i in 3" :key="i" class="h-24 animate-pulse rounded-xl bg-[#1E2E2A]" />
      </div>
    </div>

    <div v-else-if="clubError || !club" class="rounded-xl bg-red-500/10 p-6 text-center">
      <p class="text-red-400">Could not load this club's dashboard.</p>
    </div>

    <div v-else class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-white">{{ club.name }}</h1>
          <p class="mt-1 text-sm text-[#6B7B75]">Club dashboard</p>
        </div>
        <VerifiedBadge v-if="club.verification_status === 'verified'" />
      </div>

      <!-- Stats -->
      <div class="grid gap-4 sm:grid-cols-3">
        <div class="rounded-xl bg-[#1E2E2A] p-5">
          <p class="text-xs uppercase tracking-wider text-[#6B7B75]">Members</p>
          <p class="mt-1 text-2xl font-bold text-white">{{ activeMembers.length }}</p>
        </div>
        <div class="rounded-xl bg-[#1E2E2A] p-5">
          <p class="text-xs uppercase tracking-wider text-[#6B7B75]">Recent Matches</p>
          <p class="mt-1 text-2xl font-bold text-white">{{ recentMatches.length }}</p>
        </div>
        <div class="rounded-xl bg-[#1E2E2A] p-5">
          <p class="text-xs uppercase tracking-wider text-[#6B7B75]">Verification</p>
          <p class="mt-1 text-2xl font-bold capitalize text-white">{{ club.verification_status }}</p>
        </div>
      </div>

      <!-- Announcements -->
      <div v-if="recentAnnouncements.length" class="rounded-xl bg-[#1E2E2A] p-5">
        <h2 class="mb-4 font-semibold text-white">Announcements</h2>
        <div class="space-y-3">
          <div
            v-for="announcement in recentAnnouncements"
            :key="announcement.id"
            class="rounded-lg bg-[#0B0D09] p-4"
          >
            <div class="flex items-start gap-2">
              <span v-if="announcement.pinned" class="text-[#4DB175]" title="Pinned">
                <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </span>
              <div class="flex-1">
                <h3 class="font-medium text-white">{{ announcement.title }}</h3>
                <p class="mt-1 text-sm text-[#A6ABA7] line-clamp-2">{{ announcement.body }}</p>
                <p class="mt-2 text-xs text-[#6B7B75]">
                  {{ new Date(announcement.published_at ?? announcement.created_at).toLocaleDateString() }}
                </p>
              </div>
            </div>
          </div>
        </div>
        <NuxtLink
          :to="`/clubs/${clubId}`"
          class="mt-4 inline-block text-sm text-[#4DB175] hover:underline"
        >
          View all announcements →
        </NuxtLink>
      </div>

      <!-- New Members -->
      <div v-if="newMembers.length" class="rounded-xl bg-[#1E2E2A] p-5">
        <h2 class="mb-4 font-semibold text-white">New Members</h2>
        <div class="flex flex-wrap gap-3">
          <NuxtLink
            v-for="member in newMembers"
            :key="member.id"
            :to="`/players/${member.player_id}`"
            class="flex items-center gap-2 rounded-lg bg-[#0B0D09] px-3 py-2 transition-all hover:bg-[#2E4540]"
          >
            <div class="flex h-8 w-8 items-center justify-center rounded-full bg-[#2E4540] text-sm font-bold text-[#A6ABA7]">
              {{ member.display_name.charAt(0).toUpperCase() }}
            </div>
            <span class="text-sm text-white">{{ member.display_name }}</span>
          </NuxtLink>
        </div>
      </div>

      <div class="grid gap-6 lg:grid-cols-2">
        <!-- Top members by singles rating -->
        <div class="rounded-xl bg-[#1E2E2A] p-5">
          <h2 class="mb-4 font-semibold text-white">Top Members (Singles)</h2>
          <p v-if="!topSinglesRankings.length" class="text-sm text-[#6B7B75]">No rated members yet.</p>
          <ul v-else class="space-y-2">
            <li
              v-for="entry in topSinglesRankings"
              :key="entry.player_id"
              class="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-[#2E4540]/30"
            >
              <NuxtLink :to="`/players/${entry.player_id}`" class="text-sm text-white hover:text-[#4DB175]">
                {{ entry.rank }}. {{ entry.display_name }}
              </NuxtLink>
              <span class="text-sm font-semibold text-[#4DB175]">
                {{ entry.rating_value != null ? Math.round(entry.rating_value * 100) / 100 : '—' }}
              </span>
            </li>
          </ul>
        </div>

        <!-- Top members by doubles rating -->
        <div class="rounded-xl bg-[#1E2E2A] p-5">
          <h2 class="mb-4 font-semibold text-white">Top Members (Doubles)</h2>
          <p v-if="!topDoublesRankings.length" class="text-sm text-[#6B7B75]">No rated members yet.</p>
          <ul v-else class="space-y-2">
            <li
              v-for="entry in topDoublesRankings"
              :key="entry.player_id"
              class="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-[#2E4540]/30"
            >
              <NuxtLink :to="`/players/${entry.player_id}`" class="text-sm text-white hover:text-[#4DB175]">
                {{ entry.rank }}. {{ entry.display_name }}
              </NuxtLink>
              <span class="text-sm font-semibold text-[#4DB175]">
                {{ entry.rating_value != null ? Math.round(entry.rating_value * 100) / 100 : '—' }}
              </span>
            </li>
          </ul>
        </div>
      </div>

      <!-- Recent matches -->
      <div class="rounded-xl bg-[#1E2E2A] p-5">
        <h2 class="mb-4 font-semibold text-white">Recent Matches</h2>
        <p v-if="!recentMatches.length" class="text-sm text-[#6B7B75]">No matches yet.</p>
        <ul v-else class="space-y-2">
          <li
            v-for="match in recentMatches"
            :key="match.id"
            class="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-[#2E4540]/30"
          >
            <NuxtLink :to="`/matches/${match.id}`" class="text-sm text-white hover:text-[#4DB175]">
              {{ match.participants.map((p) => p.display_name).join(' vs ') }}
            </NuxtLink>
            <span class="text-xs capitalize text-[#6B7B75]">{{ match.status }}</span>
          </li>
        </ul>
      </div>

      <NuxtLink
        :to="`/clubs/${clubId}`"
        class="inline-block rounded-lg border border-[#3A5750] px-4 py-2 text-sm text-[#A6ABA7] hover:bg-[#2E4540]"
      >
        Manage club settings →
      </NuxtLink>
    </div>
  </div>
</template>
