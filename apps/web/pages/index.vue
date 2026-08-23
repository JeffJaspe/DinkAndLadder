<script setup lang="ts">
import type { IconName } from '~/utils/icons'
import type { EventDto } from '~/server/domains/event/dto/event.dto'
import type { RankingEntryDto } from '~/server/domains/rating/dto/ranking.dto'

const user = useSupabaseUser()

/**
 * Landing hero, overridable by the SuperAdmin (docs/30 §2.3).
 *
 * Every field falls back to the copy this page shipped with, so an unbranded
 * platform looks exactly as it always has. The built-in headline keeps its
 * two-line, gradient-highlighted treatment; a custom one is rendered as plain
 * text, because splitting someone else's sentence to colour half of it guesses
 * at emphasis they did not ask for.
 */
const { hero } = useBranding()

const heroBackground = computed(() => {
  if (!hero.value.background_url) return null
  // The scrim is a solid colour at the operator's opacity, laid over the image
  // in one background shorthand so there is no extra element to position.
  const { overlay_color: color, overlay_opacity: opacity } = hero.value
  return {
    backgroundImage: `linear-gradient(${withAlpha(color, opacity)}, ${withAlpha(color, opacity)}), url("${cssUrl(hero.value.background_url)}")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center'
  }
})

/** #RRGGBB + 0..1 -> rgb(r g b / a), so one colour value serves both stops. */
function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgb(${r} ${g} ${b} / ${alpha})`
}

/** Closes the url() a stray quote or paren could otherwise escape. */
function cssUrl(url: string): string {
  return url.replace(/["'()\\]/g, encodeURIComponent)
}

// Redirect logged-in users immediately to avoid landing page flash
if (user.value) {
  await navigateTo('/dashboard', { replace: true })
}

type LandingTabId = 'home' | 'rankings' | 'events' | 'clubs' | 'players'

const activeTab = ref<LandingTabId>('home')

// Hoisted out of the template: it was an inline array literal, which Vue
// rebuilt on every render, and it carried emoji glyphs while the rest of the
// app has been on UiIcon since the theme pass.
const landingTabs: ReadonlyArray<{ id: LandingTabId; label: string; icon: IconName }> = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'rankings', label: 'Rankings', icon: 'rankings' },
  { id: 'events', label: 'Events', icon: 'calendar' },
  { id: 'clubs', label: 'Clubs', icon: 'clubs' },
  { id: 'players', label: 'Players', icon: 'players' }
]

const { data: eventsData } = await useFetch<{ events: EventDto[] }>('/api/v1/events')
const { data: singlesRankings } = await useFetch<{ data: RankingEntryDto[] }>('/api/v1/rankings', {
  query: { rating_type: 'singles', limit: 100 }
})
const { data: doublesRankings } = await useFetch<{ data: RankingEntryDto[] }>('/api/v1/rankings', {
  query: { rating_type: 'doubles', limit: 100 }
})
const { data: clubsData } = await useFetch<{
  data: Array<{
    id: string
    name: string
    description: string | null
    city: string | null
    province: string | null
    is_verified: boolean
    member_count: number
  }>
}>('/api/v1/clubs/all')

const events = computed(() => eventsData.value?.events ?? [])
const upcomingEvents = computed(() =>
  events.value.filter((e) => e.status === 'published' && new Date(e.start_date) > new Date())
)
const pastEvents = computed(() => events.value.filter((e) => e.status === 'completed'))
const clubs = computed(() => clubsData.value?.data ?? [])

const rankingType = ref<'singles' | 'doubles'>('singles')
const rankings = computed(() =>
  rankingType.value === 'singles'
    ? (singlesRankings.value?.data ?? [])
    : (doublesRankings.value?.data ?? [])
)

const allPlayers = computed(() => {
  const playerMap = new Map()
  for (const p of singlesRankings.value?.data ?? []) {
    playerMap.set(p.player_id, {
      id: p.player_id,
      display_name: p.display_name,
      city: p.city,
      province: p.province,
      rating: p.rating_value
    })
  }
  for (const p of doublesRankings.value?.data ?? []) {
    if (!playerMap.has(p.player_id)) {
      playerMap.set(p.player_id, {
        id: p.player_id,
        display_name: p.display_name,
        city: p.city,
        province: p.province,
        rating: p.rating_value
      })
    }
  }
  return Array.from(playerMap.values())
})

function formatEventDate(start: string, end?: string): string {
  const startDate = new Date(start).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  })
  if (!end || start === end) return startDate
  const endDate = new Date(end).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${startDate} - ${endDate}`
}

// Fetch real stats from database
const { data: statsData } = await useFetch<{
  data: { players: number; matches: number; clubs: number; events: number }
}>('/api/v1/stats/public')

const stats = computed(() => ({
  players: statsData.value?.data?.players ?? allPlayers.value.length,
  matches: statsData.value?.data?.matches ?? 0,
  clubs: statsData.value?.data?.clubs ?? clubs.value.length,
  tournaments: statsData.value?.data?.events ?? events.value.length
}))
</script>

<template>
  <div class="min-h-screen bg-canvas">
    <div class="pointer-events-none fixed inset-0 overflow-hidden">
      <div class="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-primary/10 blur-[100px]" />
      <div class="absolute -bottom-20 -right-20 h-60 w-60 rounded-full bg-primary/5 blur-[80px]" />
    </div>

    <header class="fixed left-0 right-0 top-0 z-50 bg-canvas/80 backdrop-blur-xl">
      <div class="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <div class="flex items-center gap-3">
          <div
            class="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-hover text-sm font-bold text-on-primary shadow-lg shadow-primary/20"
          >
            D
          </div>
          <span class="text-lg font-semibold text-fg">DinkAndLadder</span>
        </div>
        <div class="flex items-center gap-2">
          <UiThemeToggle size="sm" />
          <NuxtLink
            to="/login"
            class="rounded-lg px-4 py-2 text-sm font-medium text-fg-secondary transition-colors hover:text-fg"
            >Log in</NuxtLink
          >
          <NuxtLink
            to="/register"
            class="rounded-xl bg-gradient-to-r from-primary to-primary-hover px-5 py-2.5 text-sm font-semibold text-on-primary shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30"
            >Get Started</NuxtLink
          >
        </div>
      </div>
    </header>

    <!-- Centred on wide viewports, horizontally scrollable on a phone. The row
         was justify-start inside a max-w-6xl container, so five pills packed
         against the left edge under the brand and, below ~640px, overflowed
         with no way to reach the last tab. -->
    <nav class="fixed left-0 right-0 top-16 z-40 bg-canvas/60 backdrop-blur-lg">
      <div
        class="dnl-navstrip mx-auto flex max-w-6xl justify-start gap-1 px-4 py-3 sm:justify-center"
      >
        <button
          v-for="tab in landingTabs"
          :key="tab.id"
          type="button"
          class="group relative flex shrink-0 items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-safe:hover:-translate-y-0.5"
          :class="
            activeTab === tab.id
              ? 'bg-gradient-to-r from-primary to-primary-hover text-on-primary shadow-lg shadow-primary/25 ring-1 ring-primary/30'
              : 'text-fg-muted hover:bg-fg/5 hover:text-fg'
          "
          :aria-current="activeTab === tab.id ? 'page' : undefined"
          @click="activeTab = tab.id"
        >
          <UiIcon
            :name="tab.icon"
            size="h-4 w-4"
            :stroke-width="activeTab === tab.id ? 2.2 : 1.8"
            class="transition-transform duration-200 motion-safe:group-hover:scale-110"
          />
          <span>{{ tab.label }}</span>
          <!-- The pill already carries the active state; this is the small
               moving part that makes switching read as motion rather than a
               repaint. Decorative, so it is hidden from assistive tech. -->
          <span
            v-if="activeTab === tab.id"
            class="dnl-tab-underline absolute inset-x-4 -bottom-0.5 h-0.5 rounded-pill bg-on-primary/70"
            aria-hidden="true"
          />
        </button>
      </div>
    </nav>

    <main class="relative mx-auto max-w-6xl px-4 pb-12 pt-36">
      <!-- HOME -->
      <div v-if="activeTab === 'home'" class="space-y-10">
        <div
          class="relative overflow-hidden rounded-3xl p-8 sm:p-12"
          :class="
            heroBackground ? 'bg-canvas' : 'bg-gradient-to-br from-grad-from via-surface to-canvas'
          "
          :style="heroBackground ?? undefined"
        >
          <!-- The brand glow belongs to the generated background; over a
               photograph it just muddies the scrim. -->
          <div
            v-if="!heroBackground"
            class="absolute right-0 top-0 h-64 w-64 rounded-full bg-primary/10 blur-[80px]"
          />
          <div class="relative">
            <div
              class="mb-4 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm"
              :class="
                heroBackground ? 'bg-on-scrim/15 text-on-scrim' : 'bg-primary/10 text-primary'
              "
            >
              <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />Philippine
              Pickleball Rating Platform
            </div>
            <h1
              class="text-4xl font-bold tracking-tight sm:text-5xl"
              :class="heroBackground ? 'text-on-scrim' : 'text-fg'"
            >
              <template v-if="hero.title">{{ hero.title }}</template>
              <template v-else>
                Play. Compete.<br /><span
                  class="bg-gradient-to-r from-primary to-primary-hover bg-clip-text text-transparent"
                  >Rise Up.</span
                >
              </template>
            </h1>
            <p
              class="mt-4 max-w-xl text-lg"
              :class="heroBackground ? 'text-on-scrim/85' : 'text-fg-muted'"
            >
              {{
                hero.subtitle ??
                'Track your rating, find tournaments, and connect with the pickleball community. Browse everything free — sign up to compete.'
              }}
            </p>
            <div class="mt-8 flex flex-wrap gap-3">
              <NuxtLink
                to="/register"
                class="rounded-xl bg-gradient-to-r from-primary to-primary-hover px-7 py-3.5 text-base font-semibold text-on-primary shadow-xl shadow-primary/25 transition-all hover:shadow-2xl hover:shadow-primary/30"
                >Join Free</NuxtLink
              >
              <button
                class="rounded-xl bg-fg/5 px-7 py-3.5 text-base font-semibold text-fg backdrop-blur-sm transition-all hover:bg-fg/10"
                @click="activeTab = 'events'"
              >
                Browse Events
              </button>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div class="rounded-2xl bg-gradient-to-br from-grad-from to-grad-to p-5">
            <p class="text-3xl font-bold text-fg">{{ stats.players.toLocaleString() }}</p>
            <p class="mt-1 text-sm text-fg-muted">Rated Players</p>
          </div>
          <div class="rounded-2xl bg-gradient-to-br from-grad-from to-grad-to p-5">
            <p class="text-3xl font-bold text-fg">{{ stats.matches.toLocaleString() }}</p>
            <p class="mt-1 text-sm text-fg-muted">Verified Matches</p>
          </div>
          <div class="rounded-2xl bg-gradient-to-br from-grad-from to-grad-to p-5">
            <p class="text-3xl font-bold text-fg">{{ stats.clubs }}</p>
            <p class="mt-1 text-sm text-fg-muted">Active Clubs</p>
          </div>
          <div class="rounded-2xl bg-gradient-to-br from-grad-from to-grad-to p-5">
            <p class="text-3xl font-bold text-fg">{{ stats.tournaments }}</p>
            <p class="mt-1 text-sm text-fg-muted">Tournaments</p>
          </div>
        </div>

        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <button
            class="group rounded-2xl bg-gradient-to-br from-grad-from to-grad-to p-6 text-left transition-all hover:from-grad-from hover:to-surface"
            @click="activeTab = 'rankings'"
          >
            <div
              class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-2xl transition-transform group-hover:scale-110"
            >
              🏆
            </div>
            <h3 class="font-semibold text-fg">Rankings</h3>
            <p class="mt-1 text-sm text-fg-muted">See top-rated players</p>
          </button>
          <button
            class="group rounded-2xl bg-gradient-to-br from-grad-from to-grad-to p-6 text-left transition-all hover:from-grad-from hover:to-grad-to"
            @click="activeTab = 'events'"
          >
            <div
              class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-2xl transition-transform group-hover:scale-110"
            >
              📅
            </div>
            <h3 class="font-semibold text-fg">Events</h3>
            <p class="mt-1 text-sm text-fg-muted">Tournaments & open play</p>
          </button>
          <button
            class="group rounded-2xl bg-gradient-to-br from-grad-from to-grad-to p-6 text-left transition-all hover:from-grad-from hover:to-grad-to"
            @click="activeTab = 'clubs'"
          >
            <div
              class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-2xl transition-transform group-hover:scale-110"
            >
              🏢
            </div>
            <h3 class="font-semibold text-fg">Clubs</h3>
            <p class="mt-1 text-sm text-fg-muted">Find local communities</p>
          </button>
          <button
            class="group rounded-2xl bg-gradient-to-br from-grad-from to-grad-to p-6 text-left transition-all hover:from-grad-from hover:to-grad-to"
            @click="activeTab = 'players'"
          >
            <div
              class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-2xl transition-transform group-hover:scale-110"
            >
              👥
            </div>
            <h3 class="font-semibold text-fg">Players</h3>
            <p class="mt-1 text-sm text-fg-muted">Browse all players</p>
          </button>
        </div>

        <div class="rounded-3xl bg-gradient-to-br from-grad-from to-grad-to p-8">
          <div class="mb-6 flex items-center gap-3">
            <span class="text-2xl">🏸</span>
            <h2 class="text-2xl font-bold text-fg">For Players</h2>
          </div>
          <div class="grid gap-6 sm:grid-cols-2">
            <div class="flex gap-4">
              <div
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-lg"
              >
                🪜
              </div>
              <div>
                <h4 class="font-semibold text-fg">Climb the Ladder</h4>
                <p class="mt-1 text-sm text-fg-muted">
                  Win matches, improve your rating, rise through the ranks
                </p>
              </div>
            </div>
            <div class="flex gap-4">
              <div
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-lg"
              >
                🎯
              </div>
              <div>
                <h4 class="font-semibold text-fg">Find Fair Games</h4>
                <p class="mt-1 text-sm text-fg-muted">
                  Your verified rating helps match you with the right opponents
                </p>
              </div>
            </div>
            <div class="flex gap-4">
              <div
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-lg"
              >
                🏆
              </div>
              <div>
                <h4 class="font-semibold text-fg">Compete in Tournaments</h4>
                <p class="mt-1 text-sm text-fg-muted">Browse and register for events near you</p>
              </div>
            </div>
            <div class="flex gap-4">
              <div
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-lg"
              >
                ⭐
              </div>
              <div>
                <h4 class="font-semibold text-fg">Earn Recognition</h4>
                <p class="mt-1 text-sm text-fg-muted">
                  Unlock achievements and build your match history
                </p>
              </div>
            </div>
          </div>
        </div>

        <div class="rounded-3xl bg-gradient-to-br from-grad-from to-grad-to p-8">
          <div class="mb-6 flex items-center gap-3">
            <span class="text-2xl">🏢</span>
            <h2 class="text-2xl font-bold text-fg">For Club Organizers</h2>
          </div>
          <div class="grid gap-6 sm:grid-cols-2">
            <div class="flex gap-4">
              <div
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-lg"
              >
                🏢
              </div>
              <div>
                <h4 class="font-semibold text-fg">Create Your Club</h4>
                <p class="mt-1 text-sm text-fg-muted">Build your community, manage members</p>
              </div>
            </div>
            <div class="flex gap-4">
              <div
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-lg"
              >
                🏆
              </div>
              <div>
                <h4 class="font-semibold text-fg">Host Tournaments</h4>
                <p class="mt-1 text-sm text-fg-muted">Set up brackets, manage registrations</p>
              </div>
            </div>
            <div class="flex gap-4">
              <div
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-lg"
              >
                📅
              </div>
              <div>
                <h4 class="font-semibold text-fg">Schedule Open Play</h4>
                <p class="mt-1 text-sm text-fg-muted">Organize sessions, set skill requirements</p>
              </div>
            </div>
            <div class="flex gap-4">
              <div
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-lg"
              >
                📊
              </div>
              <div>
                <h4 class="font-semibold text-fg">Track Everything</h4>
                <p class="mt-1 text-sm text-fg-muted">Club stats, member activity, results</p>
              </div>
            </div>
          </div>
          <div class="mt-6">
            <NuxtLink
              to="/register"
              class="inline-flex items-center gap-2 rounded-xl bg-fg/5 px-6 py-3 font-semibold text-fg transition-all hover:bg-fg/10"
              >+ Create Your Club</NuxtLink
            >
          </div>
        </div>

        <div class="rounded-3xl bg-gradient-to-br from-grad-from to-grad-to p-8">
          <h2 class="mb-8 text-center text-2xl font-bold text-fg">How It Works</h2>
          <div class="grid gap-6 sm:grid-cols-4">
            <div class="text-center">
              <div
                class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-hover text-xl font-bold text-on-primary shadow-lg shadow-primary/20"
              >
                1
              </div>
              <h4 class="font-semibold text-fg">Sign Up Free</h4>
              <p class="mt-1 text-sm text-fg-muted">Create your profile</p>
            </div>
            <div class="text-center">
              <div
                class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-hover text-xl font-bold text-on-primary shadow-lg shadow-primary/20"
              >
                2
              </div>
              <h4 class="font-semibold text-fg">Find Events</h4>
              <p class="mt-1 text-sm text-fg-muted">Browse tournaments & Open Play</p>
            </div>
            <div class="text-center">
              <div
                class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-hover text-xl font-bold text-on-primary shadow-lg shadow-primary/20"
              >
                3
              </div>
              <h4 class="font-semibold text-fg">Play & Record</h4>
              <p class="mt-1 text-sm text-fg-muted">Submit results</p>
            </div>
            <div class="text-center">
              <div
                class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-hover text-xl font-bold text-on-primary shadow-lg shadow-primary/20"
              >
                4
              </div>
              <h4 class="font-semibold text-fg">Climb Rankings</h4>
              <p class="mt-1 text-sm text-fg-muted">Watch rating rise</p>
            </div>
          </div>
        </div>

        <div
          class="relative overflow-hidden rounded-3xl bg-gradient-to-r from-primary to-primary-hover p-8 text-center sm:p-12"
        >
          <div
            class="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-on-primary/10 blur-2xl"
          />
          <h2 class="relative text-3xl font-bold text-on-primary">Ready to Play?</h2>
          <p class="relative mt-3 text-lg text-on-primary/80">
            Join the Philippine pickleball community today
          </p>
          <!-- Inverted card on a brand-green banner. `bg-white text-primary` was
               2.67:1 in dark mode, because primary flips to the light green
               while the button stayed white. canvas/primary passes in both. -->
          <NuxtLink
            to="/register"
            class="relative mt-6 inline-block rounded-xl bg-canvas px-8 py-4 text-lg font-bold text-primary shadow-xl transition-all hover:shadow-2xl"
            >Create Free Account</NuxtLink
          >
        </div>
      </div>

      <!-- RANKINGS -->
      <div v-else-if="activeTab === 'rankings'" class="space-y-6">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 class="text-2xl font-bold text-fg">Rankings</h2>
          <div class="flex gap-2 rounded-xl bg-grad-to p-1.5">
            <button
              class="rounded-lg px-5 py-2 text-sm font-medium transition-all"
              :class="
                rankingType === 'singles'
                  ? 'bg-gradient-to-r from-primary to-primary-hover text-on-primary shadow-lg'
                  : 'text-fg-muted hover:text-on-primary'
              "
              @click="rankingType = 'singles'"
            >
              Singles
            </button>
            <button
              class="rounded-lg px-5 py-2 text-sm font-medium transition-all"
              :class="
                rankingType === 'doubles'
                  ? 'bg-gradient-to-r from-primary to-primary-hover text-on-primary shadow-lg'
                  : 'text-fg-muted hover:text-on-primary'
              "
              @click="rankingType = 'doubles'"
            >
              Doubles
            </button>
          </div>
        </div>
        <div
          v-if="rankings.length === 0"
          class="rounded-2xl bg-gradient-to-br from-grad-from to-grad-to p-12 text-center"
        >
          <p class="text-lg text-fg-muted">No ranked players yet.</p>
          <NuxtLink
            to="/register"
            class="mt-4 inline-block rounded-xl bg-gradient-to-r from-primary to-primary-hover px-6 py-3 font-semibold text-on-primary"
            >Be the First</NuxtLink
          >
        </div>
        <!-- The same RankingBoard /rankings renders, so the signed-out view of
             the ladder and the signed-in one cannot drift apart. The rows below
             the podium used to be bespoke gradient cards with their own medal
             colours — a half-migration that shared the podium and nothing else. -->
        <RankingBoard
          v-else
          :entries="rankings"
          @select="navigateTo(`/players/${$event.player_id}`)"
        />
      </div>

      <!-- EVENTS -->
      <div v-else-if="activeTab === 'events'" class="space-y-8">
        <h2 class="text-2xl font-bold text-fg">Events</h2>
        <div>
          <h3 class="mb-4 flex items-center gap-2 text-lg font-semibold text-fg-secondary">
            <span class="h-2 w-2 rounded-full bg-primary" />Upcoming
          </h3>
          <div
            v-if="upcomingEvents.length === 0"
            class="rounded-2xl bg-gradient-to-br from-grad-from to-grad-to p-10 text-center"
          >
            <p class="text-fg-muted">No upcoming events</p>
          </div>
          <div v-else class="grid gap-4 sm:grid-cols-2">
            <NuxtLink
              v-for="event in upcomingEvents"
              :key="event.id"
              :to="`/events/${event.id}`"
              class="group rounded-2xl bg-gradient-to-br from-grad-from to-grad-to p-5 transition-all hover:from-grad-from hover:to-grad-to"
            >
              <div class="flex items-start justify-between gap-4">
                <div>
                  <span
                    class="mb-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium"
                    :class="
                      event.event_type === 'tournament'
                        ? 'bg-warning-fill/10 text-warning'
                        : 'bg-primary/10 text-primary'
                    "
                    >{{
                      event.event_type === 'tournament' ? '🏆 Tournament' : '🎾 Open Play'
                    }}</span
                  >
                  <h4 class="mt-2 font-semibold text-fg group-hover:text-primary">
                    {{ event.name }}
                  </h4>
                  <p class="mt-1 text-sm text-fg-muted">{{ event.venue || event.city || 'TBA' }}</p>
                </div>
                <div class="shrink-0 rounded-xl bg-primary/10 px-3 py-2 text-center">
                  <p class="text-lg font-bold text-primary">
                    {{ formatEventDate(event.start_date) }}
                  </p>
                </div>
              </div>
            </NuxtLink>
          </div>
        </div>
        <div v-if="pastEvents.length > 0">
          <h3 class="mb-4 text-lg font-semibold text-fg-muted">Past Events</h3>
          <div class="space-y-2">
            <NuxtLink
              v-for="event in pastEvents.slice(0, 5)"
              :key="event.id"
              :to="`/events/${event.id}`"
              class="flex items-center justify-between rounded-xl bg-grad-to/50 p-4 transition-all hover:bg-grad-from"
            >
              <div>
                <h4 class="font-medium text-fg-secondary">{{ event.name }}</h4>
                <p class="text-sm text-fg-muted">{{ event.city || event.venue }}</p>
              </div>
              <span class="text-sm text-fg-muted">{{ formatEventDate(event.start_date) }}</span>
            </NuxtLink>
          </div>
        </div>
      </div>

      <!-- CLUBS -->
      <div v-else-if="activeTab === 'clubs'" class="space-y-6">
        <h2 class="text-2xl font-bold text-fg">Clubs</h2>
        <div
          v-if="clubs.length === 0"
          class="rounded-2xl bg-gradient-to-br from-grad-from to-grad-to p-12 text-center"
        >
          <p class="text-lg text-fg-muted">No clubs yet.</p>
          <NuxtLink
            to="/register"
            class="mt-4 inline-block rounded-xl bg-gradient-to-r from-primary to-primary-hover px-6 py-3 font-semibold text-on-primary"
            >Create the First Club</NuxtLink
          >
        </div>
        <div v-else class="grid gap-4 sm:grid-cols-2">
          <NuxtLink
            v-for="club in clubs"
            :key="club.id"
            :to="`/clubs/${club.id}`"
            class="group rounded-2xl bg-gradient-to-br from-grad-from to-grad-to p-5 transition-all hover:from-grad-from hover:to-grad-to"
          >
            <div class="flex items-start gap-4">
              <div
                class="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-surface-2 to-grad-from text-xl font-bold text-primary"
              >
                {{ club.name.charAt(0).toUpperCase() }}
              </div>
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <h4 class="font-semibold text-fg group-hover:text-primary">{{ club.name }}</h4>
                  <span
                    v-if="club.is_verified"
                    class="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary"
                    >Verified</span
                  >
                </div>
                <p class="mt-1 text-sm text-fg-muted">
                  {{ [club.city, club.province].filter(Boolean).join(', ') || 'Philippines' }}
                </p>
                <p class="mt-2 text-xs text-fg-muted">{{ club.member_count }} members</p>
              </div>
            </div>
          </NuxtLink>
        </div>
      </div>

      <!-- PLAYERS -->
      <div v-else-if="activeTab === 'players'" class="space-y-6">
        <div class="flex items-center justify-between">
          <h2 class="text-2xl font-bold text-fg">Players</h2>
          <span class="text-sm text-fg-muted">{{ allPlayers.length }} rated players</span>
        </div>
        <div
          v-if="allPlayers.length === 0"
          class="rounded-2xl bg-gradient-to-br from-grad-from to-grad-to p-12 text-center"
        >
          <p class="text-lg text-fg-muted">No players yet.</p>
          <NuxtLink
            to="/register"
            class="mt-4 inline-block rounded-xl bg-gradient-to-r from-primary to-primary-hover px-6 py-3 font-semibold text-on-primary"
            >Be the First</NuxtLink
          >
        </div>
        <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <NuxtLink
            v-for="player in allPlayers"
            :key="player.id"
            :to="`/players/${player.id}`"
            class="group flex items-center gap-3 rounded-2xl bg-gradient-to-br from-grad-from to-grad-to p-4 transition-all hover:from-grad-from hover:to-grad-to"
          >
            <div
              class="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 font-bold text-primary"
            >
              {{ player.display_name.charAt(0).toUpperCase() }}
            </div>
            <div class="flex-1 overflow-hidden">
              <p class="truncate font-medium text-fg group-hover:text-primary">
                {{ player.display_name }}
              </p>
              <p class="text-sm text-fg-muted">
                {{ player.city || player.province || 'Philippines' }}
              </p>
            </div>
            <div v-if="player.rating" class="text-right">
              <p class="font-bold text-primary">{{ player.rating.toFixed(2) }}</p>
            </div>
          </NuxtLink>
        </div>
      </div>
    </main>

    <footer class="relative mt-12 bg-canvas px-4 py-8">
      <div class="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <div class="flex items-center gap-2">
          <div
            class="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary-hover text-xs font-bold text-on-primary"
          >
            D
          </div>
          <span class="text-sm font-medium text-fg">DinkAndLadder</span>
        </div>
        <p class="text-xs text-fg-muted">© 2026 Jeff Jaspe. All Rights Reserved.</p>
      </div>
    </footer>
  </div>
</template>
