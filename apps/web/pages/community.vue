<script setup lang="ts">
interface PlayHistoryEntry {
  player_id: string
  display_name: string
  match_count: number
  last_played: string
}

interface OpponentEntry extends PlayHistoryEntry {
  wins: number
  losses: number
}

interface ClubItem {
  id: string
  name: string
  description: string | null
  city: string | null
  province: string | null
  is_verified: boolean
  is_private: boolean
  member_count: number
}

const activeTab = ref<'partners' | 'opponents' | 'clubs'>('partners')

const {
  data: playHistoryData,
  pending: historyPending
} = await useFetch<{ data: { partners: PlayHistoryEntry[]; opponents: OpponentEntry[] } }>(
  '/api/v1/players/me/play-history'
)

const {
  data: clubsData,
  pending: clubsPending
} = await useFetch<{ data: ClubItem[] }>('/api/v1/clubs/all')

const partners = computed(() => playHistoryData.value?.data?.partners ?? [])
const opponents = computed(() => playHistoryData.value?.data?.opponents ?? [])
const clubs = computed(() => clubsData.value?.data ?? [])

function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return 'Unknown'
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}
</script>

<template>
  <div class="min-h-screen bg-[#0B0D09] p-4 lg:p-6">
    <div class="mx-auto max-w-2xl">
      <h1 class="text-2xl font-bold text-white">Community</h1>
      <p class="mt-1 text-sm text-[#6B7B75]">Players from your matches and clubs</p>

      <!-- Tabs -->
      <div class="my-6 flex gap-1 rounded-xl bg-[#1E2E2A] p-1">
        <button
          class="flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          :class="activeTab === 'partners' ? 'bg-[#4DB175] text-white' : 'text-[#6B7B75] hover:text-white'"
          @click="activeTab = 'partners'"
        >
          Match Partners ({{ partners.length }})
        </button>
        <button
          class="flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          :class="activeTab === 'opponents' ? 'bg-[#4DB175] text-white' : 'text-[#6B7B75] hover:text-white'"
          @click="activeTab = 'opponents'"
        >
          Opponents ({{ opponents.length }})
        </button>
        <button
          class="flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          :class="activeTab === 'clubs' ? 'bg-[#4DB175] text-white' : 'text-[#6B7B75] hover:text-white'"
          @click="activeTab = 'clubs'"
        >
          Clubs ({{ clubs.length }})
        </button>
      </div>

      <!-- Partners Tab -->
      <div v-if="activeTab === 'partners'">
        <div v-if="historyPending" class="flex justify-center py-12">
          <div class="h-8 w-8 animate-spin rounded-full border-4 border-[#4DB175] border-t-transparent" />
        </div>

        <div v-else-if="partners.length === 0" class="rounded-xl bg-[#1E2E2A] p-8 text-center">
          <p class="text-[#6B7B75]">No match partners yet.</p>
          <p class="mt-2 text-sm text-[#6B7B75]">
            Play doubles matches and your teammates will appear here.
          </p>
        </div>

        <div v-else class="space-y-3">
          <NuxtLink
            v-for="partner in partners"
            :key="partner.player_id"
            :to="`/players/${partner.player_id}`"
            class="flex items-center justify-between rounded-xl bg-[#1E2E2A] p-4 transition-all hover:bg-[#2E4540]"
          >
            <div class="flex items-center gap-3">
              <div class="flex h-12 w-12 items-center justify-center rounded-full bg-[#2E4540] text-lg font-bold text-[#A6ABA7]">
                {{ partner.display_name.charAt(0).toUpperCase() }}
              </div>
              <div>
                <p class="font-medium text-white">{{ partner.display_name }}</p>
                <p class="text-sm text-[#6B7B75]">
                  {{ partner.match_count }} match{{ partner.match_count !== 1 ? 'es' : '' }} together
                </p>
              </div>
            </div>
            <div class="text-right">
              <p class="text-xs text-[#6B7B75]">Last played</p>
              <p class="text-sm text-[#A6ABA7]">{{ formatRelativeTime(partner.last_played) }}</p>
            </div>
          </NuxtLink>
        </div>
      </div>

      <!-- Opponents Tab -->
      <div v-else-if="activeTab === 'opponents'">
        <div v-if="historyPending" class="flex justify-center py-12">
          <div class="h-8 w-8 animate-spin rounded-full border-4 border-[#4DB175] border-t-transparent" />
        </div>

        <div v-else-if="opponents.length === 0" class="rounded-xl bg-[#1E2E2A] p-8 text-center">
          <p class="text-[#6B7B75]">No opponents yet.</p>
          <p class="mt-2 text-sm text-[#6B7B75]">
            Play matches and your opponents will appear here with head-to-head records.
          </p>
        </div>

        <div v-else class="space-y-3">
          <NuxtLink
            v-for="opponent in opponents"
            :key="opponent.player_id"
            :to="`/players/${opponent.player_id}/head-to-head`"
            class="flex items-center justify-between rounded-xl bg-[#1E2E2A] p-4 transition-all hover:bg-[#2E4540]"
          >
            <div class="flex items-center gap-3">
              <div class="flex h-12 w-12 items-center justify-center rounded-full bg-[#2E4540] text-lg font-bold text-[#A6ABA7]">
                {{ opponent.display_name.charAt(0).toUpperCase() }}
              </div>
              <div>
                <p class="font-medium text-white">{{ opponent.display_name }}</p>
                <p class="text-sm text-[#6B7B75]">
                  {{ opponent.match_count }} match{{ opponent.match_count !== 1 ? 'es' : '' }}
                </p>
              </div>
            </div>
            <div class="text-right">
              <p class="font-medium">
                <span class="text-[#4DB175]">{{ opponent.wins }}W</span>
                <span class="mx-1 text-[#6B7B75]">-</span>
                <span class="text-red-400">{{ opponent.losses }}L</span>
              </p>
              <p class="text-xs text-[#6B7B75]">{{ formatRelativeTime(opponent.last_played) }}</p>
            </div>
          </NuxtLink>
        </div>
      </div>

      <!-- Clubs Tab -->
      <div v-else-if="activeTab === 'clubs'">
        <div v-if="clubsPending" class="flex justify-center py-12">
          <div class="h-8 w-8 animate-spin rounded-full border-4 border-[#4DB175] border-t-transparent" />
        </div>

        <div v-else-if="clubs.length === 0" class="rounded-xl bg-[#1E2E2A] p-8 text-center">
          <p class="text-[#6B7B75]">No clubs yet.</p>
        </div>

        <div v-else class="space-y-3">
          <NuxtLink
            v-for="club in clubs"
            :key="club.id"
            :to="`/clubs/${club.id}`"
            class="flex items-center justify-between rounded-xl bg-[#1E2E2A] p-4 transition-all hover:bg-[#2E4540]"
          >
            <div class="flex items-center gap-3">
              <div class="flex h-12 w-12 items-center justify-center rounded-full bg-[#2E4540] text-lg font-bold text-[#A6ABA7]">
                {{ club.name.charAt(0).toUpperCase() }}
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <p class="font-medium text-white">{{ club.name }}</p>
                  <span
                    v-if="club.is_verified"
                    class="rounded-full bg-[#4DB175]/20 px-2 py-0.5 text-xs font-medium text-[#4DB175]"
                  >
                    Verified
                  </span>
                  <span
                    v-if="club.is_private"
                    class="rounded-full bg-[#6B7B75]/20 px-2 py-0.5 text-xs font-medium text-[#6B7B75]"
                  >
                    Private
                  </span>
                </div>
                <p v-if="club.city || club.province" class="text-sm text-[#6B7B75]">
                  {{ [club.city, club.province].filter(Boolean).join(', ') }}
                </p>
              </div>
            </div>
            <div class="text-right">
              <p class="text-sm text-[#A6ABA7]">{{ club.member_count }} members</p>
            </div>
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>
