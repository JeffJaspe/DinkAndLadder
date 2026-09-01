<script setup lang="ts">
/**
 * Community — everyone you play with, in one place.
 *
 * Three tabs, three different relationships:
 *
 * - **Partners** — formal, mutual duo partnerships and their requests. This was
 *   the standalone `/partners` page; it lives here whole (see
 *   `CommunityDuoPartnersPanel`), and `/partners` now redirects to this tab.
 * - **Teammates** — anyone you have actually played alongside, open play
 *   included. No agreement required: playing one doubles match together is
 *   enough. This is the tab that used to be called "Partners", which was
 *   confusing next to the real thing.
 * - **Opponents** — the other side of the same match history, with W–L.
 *
 * Rankings and Clubs tabs were removed earlier this pass: both duplicated
 * better pages (`/rankings`, `/clubs`).
 */
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

type CommunityTab = 'partners' | 'team' | 'teammates' | 'opponents'

const route = useRoute()
const router = useRouter()

const TABS: Array<{ id: CommunityTab; label: string }> = [
  { id: 'partners', label: 'Partners' },
  // Distinct from Teammates below, which is a record of who you have played
  // with. This is the roster you may register FOR an open play session.
  //
  // Labelled TeamUp, which is what the rest of the product calls this
  // relationship — the API path, the table and the notification type all say
  // team-up, and "Team" here was the only place that did not. The tab ID stays
  // `team` so existing links and the ?tab= query keep working.
  { id: 'team', label: 'TeamUp' },
  { id: 'teammates', label: 'Teammates' },
  { id: 'opponents', label: 'Opponents' }
]

function tabFromQuery(value: unknown): CommunityTab {
  return TABS.some((tab) => tab.id === value) ? (value as CommunityTab) : 'partners'
}

// URL-backed so the /partners redirect can land on the right tab, and so a
// linked tab survives a reload.
const activeTab = ref<CommunityTab>(tabFromQuery(route.query.tab))

watch(activeTab, (tab) => {
  router.replace({ query: { ...route.query, tab: tab === 'partners' ? undefined : tab } })
})

watch(
  () => route.query.tab,
  (tab) => {
    activeTab.value = tabFromQuery(tab)
  }
)

// The Partners and TeamUp tabs carry the same counts the sidebar badge sums,
// so the number a player saw in the nav resolves to a tab once they arrive.
const { incomingCount } = usePartnerRequestCount()
const { incomingCount: teamUpCount } = useTeamUpRequestCount()

/** The waiting-for-an-answer count for a tab, or 0 where a tab has none. */
function pendingCountFor(tab: CommunityTab): number {
  if (tab === 'partners') return incomingCount.value
  if (tab === 'team') return teamUpCount.value
  return 0
}

/**
 * Deferred, and only for the tabs that need it.
 *
 * This was a top-level `await useFetch`, which suspends the whole route until
 * it resolves — so arriving at Community cost a full play-history query before
 * anything rendered, even though the default tab is Partners and never reads
 * it. `immediate: false` plus a watch means the Partners tab paints straight
 * away and the history is fetched the first time someone actually opens
 * Teammates or Opponents.
 */
const {
  data: playHistoryData,
  pending: historyPending,
  execute: loadPlayHistory
} = useLazyFetch<{
  data: { partners: PlayHistoryEntry[]; opponents: OpponentEntry[] }
}>('/api/v1/players/me/play-history', { immediate: false })

const historyLoaded = ref(false)

watch(
  activeTab,
  (tab) => {
    if (historyLoaded.value) return
    if (tab !== 'teammates' && tab !== 'opponents') return
    historyLoaded.value = true
    loadPlayHistory()
  },
  { immediate: true }
)

/** The endpoint still calls them `partners`; on this page they are Teammates. */
const teammates = computed(() => playHistoryData.value?.data?.partners ?? [])
const opponents = computed(() => playHistoryData.value?.data?.opponents ?? [])

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
      <p class="mt-1 text-sm text-fg-muted">Your duo partners, teammates and opponents</p>

      <!-- Tabs -->
      <div class="my-6 flex gap-1 rounded-xl bg-surface p-1 shadow-card">
        <button
          v-for="tab in TABS"
          :key="tab.id"
          class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          :class="
            activeTab === tab.id
              ? 'bg-primary text-on-primary'
              : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
          "
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
          <span
            v-if="pendingCountFor(tab.id)"
            class="ml-1.5 rounded-pill px-1.5 py-0.5 text-caption font-semibold tabular-nums"
            :class="
              activeTab === tab.id
                ? 'bg-on-primary/20 text-on-primary'
                : 'bg-primary text-on-primary'
            "
            :aria-label="`${pendingCountFor(tab.id)} waiting`"
            >{{ pendingCountFor(tab.id) }}</span
          >
        </button>
      </div>

      <!-- Partners Tab — the whole former /partners page -->
      <CommunityDuoPartnersPanel v-if="activeTab === 'partners'" />

      <CommunityTeamPanel v-else-if="activeTab === 'team'" />

      <!-- Teammates Tab -->
      <div v-else-if="activeTab === 'teammates'">
        <p class="mb-4 text-sm text-fg-muted">
          Everyone you have played alongside, open play included — no partnership required.
        </p>

        <div v-if="historyPending" class="flex justify-center py-12">
          <div
            class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"
          />
        </div>

        <div
          v-else-if="teammates.length === 0"
          class="rounded-xl bg-surface p-8 text-center shadow-card"
        >
          <p class="text-fg-muted">No teammates yet.</p>
          <p class="mt-2 text-sm text-fg-muted">
            Play doubles matches and whoever is on your side of the net appears here.
          </p>
        </div>

        <div v-else class="space-y-3">
          <NuxtLink
            v-for="teammate in teammates"
            :key="teammate.player_id"
            :to="`/players/${teammate.player_id}`"
            class="flex items-center justify-between rounded-xl bg-surface p-4 transition-all hover:bg-surface-2 shadow-card hover:shadow-card-hover"
          >
            <div class="flex items-center gap-3">
              <div
                class="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-lg font-bold text-fg-secondary"
              >
                {{ teammate.display_name.charAt(0).toUpperCase() }}
              </div>
              <div>
                <p class="font-medium text-fg">{{ teammate.display_name }}</p>
                <p class="text-sm text-fg-muted">
                  {{ teammate.match_count }} match{{ teammate.match_count !== 1 ? 'es' : '' }}
                  together
                </p>
              </div>
            </div>
            <div class="text-right">
              <p class="text-xs text-fg-muted">Last played</p>
              <p class="text-sm text-fg-secondary">
                {{ formatRelativeTime(teammate.last_played) }}
              </p>
            </div>
          </NuxtLink>
        </div>
      </div>

      <!-- Opponents Tab -->
      <div v-else-if="activeTab === 'opponents'">
        <div v-if="historyPending" class="flex justify-center py-12">
          <div
            class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"
          />
        </div>

        <div
          v-else-if="opponents.length === 0"
          class="rounded-xl bg-surface p-8 text-center shadow-card"
        >
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
            class="flex items-center justify-between rounded-xl bg-surface p-4 transition-all hover:bg-surface-2 shadow-card hover:shadow-card-hover"
          >
            <div class="flex items-center gap-3">
              <div
                class="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-lg font-bold text-fg-secondary"
              >
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
    </div>
  </div>
</template>
