<script setup lang="ts">
/**
 * Community — everyone you play with, in one place.
 *
 * Three tabs, three different relationships:
 *
 * - **Partners** — formal, mutual duo partnerships and their requests. This was
 *   the standalone `/partners` page; it lives here whole (see
 *   `CommunityDuoPartnersPanel`), and `/partners` now redirects to this tab.
 * - **Follows** — who you follow and who follows you. Replaced the TeamUp tab
 *   in 066: team-up was a roster you built by asking and waiting, and follow
 *   carries the same job without the waiting. A mutual follow is what lets
 *   either of you enter the other into an open play session.
 * - **Teammates** — anyone you have actually played alongside, open play
 *   included. No agreement required: playing one doubles match together is
 *   enough. This is the tab that used to be called "Partners", which was
 *   confusing next to the real thing.
 * - **Opponents** — the other side of the same match history, with W–L.
 *
 * Rankings and Clubs tabs were removed earlier this pass: both duplicated
 * better pages (`/rankings`, `/clubs`).
 */
// Player mode only: a club is not a party to any relationship on this page.
definePageMeta({ middleware: 'player-only' })

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

type CommunityTab = 'partners' | 'follows' | 'teammates' | 'opponents'

const route = useRoute()
const router = useRouter()

const TABS: Array<{ id: CommunityTab; label: string }> = [
  { id: 'partners', label: 'Partners' },
  // Distinct from Teammates below, which is a record of who you have PLAYED
  // with. This is who you have chosen to keep up with — and, where the follow
  // runs both ways, who you may enter into an open play session.
  //
  // Replaced the TeamUp tab in 066-follow-and-kudos. The id changed with it:
  // a `?tab=team` link now falls through to Partners, which is the safe
  // landing rather than a tab that no longer exists.
  { id: 'follows', label: 'Follows' },
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

// Partners carries the count the sidebar badge shows, so the number a player
// saw in the nav resolves to a tab once they arrive. Follows has no count by
// design: following needs no permission, so nothing there waits on an answer.
const { incomingCount } = usePartnerRequestCount()

/** The waiting-for-an-answer count for a tab, or 0 where a tab has none. */
function pendingCountFor(tab: CommunityTab): number {
  return tab === 'partners' ? incomingCount.value : 0
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
      <h1 class="font-display text-heading-1 text-fg">Community</h1>
      <p class="mt-1 text-sm text-fg-muted">
        Your duo partners, who you follow, and everyone you have played
      </p>

      <!-- Tabs.

           Scrolls on a phone and splits evenly from `sm`. Four `flex-1` tabs in
           a fixed strip squeezed the last label until it clipped mid-word at
           390px — "Opponent" with the s cut off, which reads as a rendering
           fault rather than a tab. -->
      <div class="my-6 flex gap-1 overflow-x-auto rounded-xl bg-surface p-1 shadow-card">
        <button
          v-for="tab in TABS"
          :key="tab.id"
          class="shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:flex-1"
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

      <CommunityFollowPanel v-else-if="activeTab === 'follows'" />

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
              <UiAvatar
                :name="teammate.display_name"
                :identity-key="teammate.player_id"
                size="lg"
              />
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
              <UiAvatar
                :name="opponent.display_name"
                :identity-key="opponent.player_id"
                size="lg"
              />
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
                <span class="text-danger">{{ opponent.losses }}L</span>
              </p>
              <p class="text-xs text-fg-muted">{{ formatRelativeTime(opponent.last_played) }}</p>
            </div>
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>
