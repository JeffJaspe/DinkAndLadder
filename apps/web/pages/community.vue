<script setup lang="ts">
import type { RankingEntryDto } from '~/server/domains/rating/dto/ranking.dto'

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

const activeTab = ref<'rankings' | 'partners' | 'opponents' | 'clubs'>('rankings')

const {
  provinces,
  cities,
  barangays,
  selectedProvince,
  selectedCity,
  selectedBarangay,
  provinceName,
  cityName,
  barangayName,
  loadingProvinces,
  loadingCities,
  loadingBarangays,
  loadProvinces,
  selectProvince,
  selectCity,
  selectBarangay
} = useLocationPicker()

onMounted(() => {
  loadProvinces()
})

const ratingType = ref<'singles' | 'doubles'>('singles')

const {
  data: rankingsData,
  pending: rankingsPending
} = await useFetch<{ data: RankingEntryDto[] }>('/api/v1/rankings', {
  query: computed(() => ({
    rating_type: ratingType.value,
    province: provinceName.value || undefined,
    city: cityName.value || undefined,
    barangay: barangayName.value || undefined,
    limit: 50
  })),
  watch: [ratingType, provinceName, cityName, barangayName]
})

const rankings = computed(() => rankingsData.value?.data ?? [])
const topThree = computed(() => rankings.value.slice(0, 3))
const restOfRankings = computed(() => rankings.value.slice(3))

const locationLabel = computed(() => {
  if (barangayName.value) return barangayName.value
  if (cityName.value) return cityName.value
  if (provinceName.value) return provinceName.value
  return 'Nationwide'
})

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
          class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          :class="activeTab === 'rankings' ? 'bg-[#4DB175] text-white' : 'text-[#6B7B75] hover:text-white'"
          @click="activeTab = 'rankings'"
        >
          Rankings
        </button>
        <button
          class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          :class="activeTab === 'partners' ? 'bg-[#4DB175] text-white' : 'text-[#6B7B75] hover:text-white'"
          @click="activeTab = 'partners'"
        >
          Partners
        </button>
        <button
          class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          :class="activeTab === 'opponents' ? 'bg-[#4DB175] text-white' : 'text-[#6B7B75] hover:text-white'"
          @click="activeTab = 'opponents'"
        >
          Opponents
        </button>
        <button
          class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          :class="activeTab === 'clubs' ? 'bg-[#4DB175] text-white' : 'text-[#6B7B75] hover:text-white'"
          @click="activeTab = 'clubs'"
        >
          Clubs
        </button>
      </div>

      <!-- Rankings Tab -->
      <div v-if="activeTab === 'rankings'" class="space-y-4">
        <!-- Filters -->
        <div class="space-y-3">
          <!-- Rating Type Toggle -->
          <div class="flex rounded-lg bg-[#1E2E2A] p-1">
            <button
              v-for="type in ['singles', 'doubles'] as const"
              :key="type"
              type="button"
              class="flex-1 rounded-md px-4 py-2 text-sm font-medium capitalize transition-colors"
              :class="type === ratingType ? 'bg-[#4DB175] text-white' : 'text-[#6B7B75] hover:text-white'"
              @click="ratingType = type"
            >
              {{ type }}
            </button>
          </div>

          <!-- Location Filters -->
          <div class="grid gap-2 sm:grid-cols-3">
            <select
              :value="selectedProvince"
              :disabled="loadingProvinces"
              class="rounded-lg border border-[#3A5750] bg-[#1E2E2A] px-3 py-2 text-sm text-white focus:border-[#4DB175] focus:outline-none disabled:opacity-50"
              @change="selectProvince(($event.target as HTMLSelectElement).value)"
            >
              <option value="">{{ loadingProvinces ? 'Loading...' : 'All Provinces' }}</option>
              <option v-for="p in provinces" :key="p.code" :value="p.code">{{ p.name }}</option>
            </select>
            <select
              :value="selectedCity"
              :disabled="!selectedProvince || loadingCities"
              class="rounded-lg border border-[#3A5750] bg-[#1E2E2A] px-3 py-2 text-sm text-white focus:border-[#4DB175] focus:outline-none disabled:opacity-50"
              @change="selectCity(($event.target as HTMLSelectElement).value)"
            >
              <option value="">{{ loadingCities ? 'Loading...' : (selectedProvince ? 'All Cities' : 'Select province') }}</option>
              <option v-for="c in cities" :key="c.code" :value="c.code">{{ c.name }}</option>
            </select>
            <select
              :value="selectedBarangay"
              :disabled="!selectedCity || loadingBarangays"
              class="rounded-lg border border-[#3A5750] bg-[#1E2E2A] px-3 py-2 text-sm text-white focus:border-[#4DB175] focus:outline-none disabled:opacity-50"
              @change="selectBarangay(($event.target as HTMLSelectElement).value)"
            >
              <option value="">{{ loadingBarangays ? 'Loading...' : (selectedCity ? 'All Barangays' : 'Select city') }}</option>
              <option v-for="b in barangays" :key="b.code" :value="b.code">{{ b.name }}</option>
            </select>
          </div>
        </div>

        <!-- Loading -->
        <div v-if="rankingsPending" class="flex justify-center py-12">
          <div class="h-8 w-8 animate-spin rounded-full border-4 border-[#4DB175] border-t-transparent" />
        </div>

        <!-- Empty -->
        <div v-else-if="rankings.length === 0" class="rounded-xl bg-[#1E2E2A] p-8 text-center">
          <p class="text-4xl">🏆</p>
          <h3 class="mt-4 text-lg font-semibold text-white">No ranked players</h3>
          <p class="mt-2 text-sm text-[#6B7B75]">
            Be the first to get ranked in {{ ratingType }} for {{ locationLabel }}!
          </p>
        </div>

        <!-- Rankings Content -->
        <div v-else class="space-y-4">
          <!-- Top 3 Podium -->
          <div v-if="topThree.length >= 3" class="rounded-xl bg-[#1E2E2A] p-4">
            <h3 class="mb-3 text-center text-sm font-semibold text-white">
              🏆 Top 3 {{ ratingType === 'singles' ? 'Singles' : 'Doubles' }} - {{ locationLabel }}
            </h3>
            <div class="flex items-end justify-center gap-3">
              <!-- 2nd Place -->
              <NuxtLink :to="`/players/${topThree[1].player_id}`" class="flex flex-col items-center">
                <div class="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-[#2E4540] text-sm font-bold text-[#C0C0C0] ring-2 ring-[#C0C0C0]">
                  {{ topThree[1].display_name.charAt(0) }}
                </div>
                <p class="text-xs text-[#A6ABA7]">{{ topThree[1].display_name.split(' ')[0] }}</p>
                <p class="text-xs text-[#6B7B75]">{{ Math.round(topThree[1].rating_value) }}</p>
                <div class="mt-1 flex h-12 w-10 items-end justify-center rounded-t-lg bg-[#C0C0C0]/20">
                  <span class="mb-1 text-lg font-bold text-[#C0C0C0]">2</span>
                </div>
              </NuxtLink>
              <!-- 1st Place -->
              <NuxtLink :to="`/players/${topThree[0].player_id}`" class="flex flex-col items-center">
                <div class="relative mb-1">
                  <span class="absolute -top-3 left-1/2 -translate-x-1/2 text-sm">👑</span>
                  <div class="flex h-12 w-12 items-center justify-center rounded-full bg-[#2E4540] text-lg font-bold text-[#F5A623] ring-2 ring-[#F5A623]">
                    {{ topThree[0].display_name.charAt(0) }}
                  </div>
                </div>
                <p class="text-xs text-[#A6ABA7]">{{ topThree[0].display_name.split(' ')[0] }}</p>
                <p class="text-xs text-[#6B7B75]">{{ Math.round(topThree[0].rating_value) }}</p>
                <div class="mt-1 flex h-16 w-12 items-end justify-center rounded-t-lg bg-[#F5A623]/20">
                  <span class="mb-1 text-xl font-bold text-[#F5A623]">1</span>
                </div>
              </NuxtLink>
              <!-- 3rd Place -->
              <NuxtLink :to="`/players/${topThree[2].player_id}`" class="flex flex-col items-center">
                <div class="mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-[#2E4540] text-xs font-bold text-[#CD7F32] ring-2 ring-[#CD7F32]">
                  {{ topThree[2].display_name.charAt(0) }}
                </div>
                <p class="text-xs text-[#A6ABA7]">{{ topThree[2].display_name.split(' ')[0] }}</p>
                <p class="text-xs text-[#6B7B75]">{{ Math.round(topThree[2].rating_value) }}</p>
                <div class="mt-1 flex h-8 w-10 items-end justify-center rounded-t-lg bg-[#CD7F32]/20">
                  <span class="mb-1 text-lg font-bold text-[#CD7F32]">3</span>
                </div>
              </NuxtLink>
            </div>
          </div>

          <!-- Rest of Rankings List -->
          <div class="space-y-2">
            <NuxtLink
              v-for="entry in (topThree.length >= 3 ? restOfRankings : rankings)"
              :key="entry.player_id"
              :to="`/players/${entry.player_id}`"
              class="flex items-center justify-between rounded-xl bg-[#1E2E2A] p-3 transition-all hover:bg-[#2E4540]"
            >
              <div class="flex items-center gap-3">
                <span class="w-6 text-center text-sm font-medium text-[#6B7B75]">{{ entry.rank }}</span>
                <div class="flex h-10 w-10 items-center justify-center rounded-full bg-[#2E4540] text-sm font-bold text-[#A6ABA7]">
                  {{ entry.display_name.charAt(0).toUpperCase() }}
                </div>
                <div>
                  <p class="font-medium text-white">{{ entry.display_name }}</p>
                  <p v-if="entry.city" class="text-xs text-[#6B7B75]">{{ entry.city }}</p>
                </div>
              </div>
              <span class="text-sm font-semibold text-[#4DB175]">{{ Math.round(entry.rating_value) }}</span>
            </NuxtLink>
          </div>

          <!-- View Full Rankings Link -->
          <NuxtLink
            to="/rankings"
            class="block rounded-xl border border-[#3A5750] p-3 text-center text-sm text-[#A6ABA7] transition-colors hover:bg-[#1E2E2A]"
          >
            View Full Rankings →
          </NuxtLink>
        </div>
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
