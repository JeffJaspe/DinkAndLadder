<script setup lang="ts">
import type { ClubDto } from '~/server/domains/club/dto/club.dto'
import type { RosterMemberDto } from '~/server/domains/club/dto/club-membership.dto'

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
const { data: rankingsResponse } = await useFetch<{ data: ClubRankingEntry[] }>(
  `/api/v1/clubs/${clubId}/rankings`,
  { query: { rating_type: 'singles', limit: 5 } }
)

const activeMembers = computed(
  () => membersResponse.value?.items.filter((m) => m.status === 'active') ?? []
)
const recentMatches = computed(() => matchesResponse.value?.data ?? [])
const topRankings = computed(() => rankingsResponse.value?.data ?? [])
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

      <div class="grid gap-6 lg:grid-cols-2">
        <!-- Top members by rating -->
        <div class="rounded-xl bg-[#1E2E2A] p-5">
          <h2 class="mb-4 font-semibold text-white">Top Members (Singles)</h2>
          <p v-if="!topRankings.length" class="text-sm text-[#6B7B75]">No rated members yet.</p>
          <ul v-else class="space-y-2">
            <li
              v-for="entry in topRankings"
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
