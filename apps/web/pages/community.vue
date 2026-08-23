<script setup lang="ts">
import type { RankingEntryDto } from '~/server/domains/rating/dto/ranking.dto'

useHead({ title: 'Community' })

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

// A failed rankings load must not take the page down. Without default + a
// handled error this await threw during SSR and rendered a blank screen — a
// transient database hiccup was enough to do it.
const {
  data: rankingsData,
  pending: rankingsPending,
  error: rankingsError
} = await useFetch<{ data: RankingEntryDto[] }>('/api/v1/rankings', {
  query: computed(() => ({
    rating_type: ratingType.value,
    province: provinceName.value || undefined,
    city: cityName.value || undefined,
    barangay: barangayName.value || undefined,
    limit: 50
  })),
  watch: [ratingType, provinceName, cityName, barangayName],
  default: () => ({ data: [] as RankingEntryDto[] })
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
  <div class="min-h-screen bg-canvas p-4 lg:p-6">
    <div class="page-shell">
      <h1 class="text-2xl font-bold text-fg">Community</h1>
      <p class="mt-1 text-sm text-fg-muted">Players from your matches and clubs</p>

      <!-- Tabs -->
      <div class="my-6 flex gap-1 rounded-xl bg-surface p-1">
        <button
          class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          :class="activeTab === 'rankings' ? 'bg-primary text-on-primary' : 'text-fg-muted hover:text-on-primary'"
          @click="activeTab = 'rankings'"
        >
          Rankings
        </button>
        <button
          class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          :class="activeTab === 'partners' ? 'bg-primary text-on-primary' : 'text-fg-muted hover:text-on-primary'"
          @click="activeTab = 'partners'"
        >
          Partners
        </button>
        <button
          class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          :class="activeTab === 'opponents' ? 'bg-primary text-on-primary' : 'text-fg-muted hover:text-on-primary'"
          @click="activeTab = 'opponents'"
        >
          Opponents
        </button>
        <button
          class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          :class="activeTab === 'clubs' ? 'bg-primary text-on-primary' : 'text-fg-muted hover:text-on-primary'"
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
          <div class="flex rounded-lg bg-surface p-1">
            <button
              v-for="type in ['singles', 'doubles'] as const"
              :key="type"
              type="button"
              class="flex-1 rounded-md px-4 py-2 text-sm font-medium capitalize transition-colors"
              :class="type === ratingType ? 'bg-primary text-on-primary' : 'text-fg-muted hover:text-on-primary'"
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
              class="rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none disabled:opacity-50"
              @change="selectProvince(($event.target as HTMLSelectElement).value)"
            >
              <option value="">{{ loadingProvinces ? 'Loading...' : 'All Provinces' }}</option>
              <option v-for="p in provinces" :key="p.code" :value="p.code">{{ p.name }}</option>
            </select>
            <select
              :value="selectedCity"
              :disabled="!selectedProvince || loadingCities"
              class="rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none disabled:opacity-50"
              @change="selectCity(($event.target as HTMLSelectElement).value)"
            >
              <option value="">{{ loadingCities ? 'Loading...' : (selectedProvince ? 'All Cities' : 'Select province') }}</option>
              <option v-for="c in cities" :key="c.code" :value="c.code">{{ c.name }}</option>
            </select>
            <select
              :value="selectedBarangay"
              :disabled="!selectedCity || loadingBarangays"
              class="rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none disabled:opacity-50"
              @change="selectBarangay(($event.target as HTMLSelectElement).value)"
            >
              <option value="">{{ loadingBarangays ? 'Loading...' : (selectedCity ? 'All Barangays' : 'Select city') }}</option>
              <option v-for="b in barangays" :key="b.code" :value="b.code">{{ b.name }}</option>
            </select>
          </div>
        </div>

        <!-- Loading -->
        <div v-if="rankingsPending" class="flex justify-center py-12">
          <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>

        <!-- Error -->
        <div v-else-if="rankingsError" class="rounded-xl bg-surface p-8 text-center">
          <p class="text-4xl">⚠️</p>
          <h3 class="mt-3 font-semibold text-fg">Rankings are unavailable</h3>
          <p class="mt-1 text-sm text-fg-muted">Something went wrong loading them. Try again shortly.</p>
        </div>

        <!-- Empty -->
        <div v-else-if="rankings.length === 0" class="rounded-xl bg-surface p-8 text-center">
          <p class="text-4xl">🏆</p>
          <h3 class="mt-4 text-lg font-semibold text-fg">No ranked players</h3>
          <p class="mt-2 text-sm text-fg-muted">
            Be the first to get ranked in {{ ratingType }} for {{ locationLabel }}!
          </p>
        </div>

        <!-- Rankings Content -->
        <div v-else class="space-y-4">
          <!-- Top 3 Podium -->
          <div v-if="topThree.length >= 3" class="rounded-xl bg-surface p-4">
            <h3 class="mb-3 text-center text-sm font-semibold text-fg">
              🏆 Top 3 {{ ratingType === 'singles' ? 'Singles' : 'Doubles' }} - {{ locationLabel }}
            </h3>
            <div class="flex items-end justify-center gap-3">
              <!-- 2nd Place -->
              <NuxtLink :to="`/players/${topThree[1].player_id}`" class="flex flex-col items-center">
                <div class="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-sm font-bold text-rating-silver ring-2 ring-rating-silver">
                  {{ topThree[1].display_name.charAt(0) }}
                </div>
                <p class="text-xs text-fg-secondary">{{ topThree[1].display_name.split(' ')[0] }}</p>
                <p class="text-xs text-fg-muted">{{ Math.round(topThree[1].rating_value) }}</p>
                <div class="mt-1 flex h-12 w-10 items-end justify-center rounded-t-lg bg-rating-silver/20">
                  <span class="mb-1 text-lg font-bold text-rating-silver">2</span>
                </div>
              </NuxtLink>
              <!-- 1st Place -->
              <NuxtLink :to="`/players/${topThree[0].player_id}`" class="flex flex-col items-center">
                <div class="relative mb-1">
                  <span class="absolute -top-3 left-1/2 -translate-x-1/2 text-sm">👑</span>
                  <div class="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-lg font-bold text-warning ring-2 ring-warning-fill">
                    {{ topThree[0].display_name.charAt(0) }}
                  </div>
                </div>
                <p class="text-xs text-fg-secondary">{{ topThree[0].display_name.split(' ')[0] }}</p>
                <p class="text-xs text-fg-muted">{{ Math.round(topThree[0].rating_value) }}</p>
                <div class="mt-1 flex h-16 w-12 items-end justify-center rounded-t-lg bg-warning-fill/20">
                  <span class="mb-1 text-xl font-bold text-warning">1</span>
                </div>
              </NuxtLink>
              <!-- 3rd Place -->
              <NuxtLink :to="`/players/${topThree[2].player_id}`" class="flex flex-col items-center">
                <div class="mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-xs font-bold text-rating-bronze ring-2 ring-rating-bronze">
                  {{ topThree[2].display_name.charAt(0) }}
                </div>
                <p class="text-xs text-fg-secondary">{{ topThree[2].display_name.split(' ')[0] }}</p>
                <p class="text-xs text-fg-muted">{{ Math.round(topThree[2].rating_value) }}</p>
                <div class="mt-1 flex h-8 w-10 items-end justify-center rounded-t-lg bg-rating-bronze/20">
                  <span class="mb-1 text-lg font-bold text-rating-bronze">3</span>
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
              class="flex items-center justify-between rounded-xl bg-surface p-3 transition-all hover:bg-surface-2"
            >
              <div class="flex items-center gap-3">
                <span class="w-6 text-center text-sm font-medium text-fg-muted">{{ entry.rank }}</span>
                <div class="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-sm font-bold text-fg-secondary">
                  {{ entry.display_name.charAt(0).toUpperCase() }}
                </div>
                <div>
                  <p class="font-medium text-fg">{{ entry.display_name }}</p>
                  <p v-if="entry.city" class="text-xs text-fg-muted">{{ entry.city }}</p>
                </div>
              </div>
              <span class="text-sm font-semibold text-primary">{{ Math.round(entry.rating_value) }}</span>
            </NuxtLink>
          </div>

          <!-- View Full Rankings Link -->
          <NuxtLink
            to="/rankings"
            class="block rounded-xl border border-border-strong p-3 text-center text-sm text-fg-secondary transition-colors hover:bg-surface"
          >
            View Full Rankings →
          </NuxtLink>
        </div>
      </div>

      <!-- Partners Tab -->
      <div v-if="activeTab === 'partners'">
        <div v-if="historyPending" class="flex justify-center py-12">
          <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>

        <div v-else-if="partners.length === 0" class="rounded-xl bg-surface p-8 text-center">
          <p class="text-fg-muted">No match partners yet.</p>
          <p class="mt-2 text-sm text-fg-muted">
            Play doubles matches and your teammates will appear here.
          </p>
        </div>

        <div v-else class="space-y-3">
          <NuxtLink
            v-for="partner in partners"
            :key="partner.player_id"
            :to="`/players/${partner.player_id}`"
            class="flex items-center justify-between rounded-xl bg-surface p-4 transition-all hover:bg-surface-2"
          >
            <div class="flex items-center gap-3">
              <div class="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-lg font-bold text-fg-secondary">
                {{ partner.display_name.charAt(0).toUpperCase() }}
              </div>
              <div>
                <p class="font-medium text-fg">{{ partner.display_name }}</p>
                <p class="text-sm text-fg-muted">
                  {{ partner.match_count }} match{{ partner.match_count !== 1 ? 'es' : '' }} together
                </p>
              </div>
            </div>
            <div class="text-right">
              <p class="text-xs text-fg-muted">Last played</p>
              <p class="text-sm text-fg-secondary">{{ formatRelativeTime(partner.last_played) }}</p>
            </div>
          </NuxtLink>
        </div>
      </div>

      <!-- Opponents Tab -->
      <div v-else-if="activeTab === 'opponents'">
        <div v-if="historyPending" class="flex justify-center py-12">
          <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>

        <div v-else-if="opponents.length === 0" class="rounded-xl bg-surface p-8 text-center">
          <p class="text-fg-muted">No opponents yet.</p>
          <p class="mt-2 text-sm text-fg-muted">
            Play matches and your opponents will appear here with head-to-head records.
          </p>
        </div>

        <div v-else class="space-y-3">
          <NuxtLink
            v-for="opponent in opponents"
            :key="opponent.player_id"
            :to="`/players/${opponent.player_id}/head-to-head`"
            class="flex items-center justify-between rounded-xl bg-surface p-4 transition-all hover:bg-surface-2"
          >
            <div class="flex items-center gap-3">
              <div class="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-lg font-bold text-fg-secondary">
                {{ opponent.display_name.charAt(0).toUpperCase() }}
              </div>
              <div>
                <p class="font-medium text-fg">{{ opponent.display_name }}</p>
                <p class="text-sm text-fg-muted">
                  {{ opponent.match_count }} match{{ opponent.match_count !== 1 ? 'es' : '' }}
                </p>
              </div>
            </div>
            <div class="text-right">
              <p class="font-medium">
                <span class="text-primary">{{ opponent.wins }}W</span>
                <span class="mx-1 text-fg-muted">-</span>
                <span class="text-red-400">{{ opponent.losses }}L</span>
              </p>
              <p class="text-xs text-fg-muted">{{ formatRelativeTime(opponent.last_played) }}</p>
            </div>
          </NuxtLink>
        </div>
      </div>

      <!-- Clubs Tab -->
      <div v-else-if="activeTab === 'clubs'">
        <div v-if="clubsPending" class="flex justify-center py-12">
          <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>

        <div v-else-if="clubs.length === 0" class="rounded-xl bg-surface p-8 text-center">
          <p class="text-fg-muted">No clubs yet.</p>
        </div>

        <div v-else class="space-y-3">
          <NuxtLink
            v-for="club in clubs"
            :key="club.id"
            :to="`/clubs/${club.id}`"
            class="flex items-center justify-between rounded-xl bg-surface p-4 transition-all hover:bg-surface-2"
          >
            <div class="flex items-center gap-3">
              <div class="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-lg font-bold text-fg-secondary">
                {{ club.name.charAt(0).toUpperCase() }}
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <p class="font-medium text-fg">{{ club.name }}</p>
                  <span
                    v-if="club.is_verified"
                    class="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary"
                  >
                    Verified
                  </span>
                  <span
                    v-if="club.is_private"
                    class="rounded-full bg-fg-muted/20 px-2 py-0.5 text-xs font-medium text-fg-muted"
                  >
                    Private
                  </span>
                </div>
                <p v-if="club.city || club.province" class="text-sm text-fg-muted">
                  {{ [club.city, club.province].filter(Boolean).join(', ') }}
                </p>
              </div>
            </div>
            <div class="text-right">
              <p class="text-sm text-fg-secondary">{{ club.member_count }} members</p>
            </div>
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>
