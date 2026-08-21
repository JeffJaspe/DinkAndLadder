<script setup lang="ts">
import type { EventDto } from '~/server/domains/event/dto/event.dto'
import type { RankingEntryDto } from '~/server/domains/rating/dto/ranking.dto'

const user = useSupabaseUser()

// Redirect logged-in users immediately to avoid landing page flash
if (user.value) {
  await navigateTo('/dashboard', { replace: true })
}

const activeTab = ref<'home' | 'rankings' | 'events' | 'clubs' | 'players'>('home')

const { data: eventsData } = await useFetch<{ events: EventDto[] }>('/api/v1/events')
const { data: singlesRankings } = await useFetch<{ data: RankingEntryDto[] }>('/api/v1/rankings', {
  query: { rating_type: 'singles', limit: 100 }
})
const { data: doublesRankings } = await useFetch<{ data: RankingEntryDto[] }>('/api/v1/rankings', {
  query: { rating_type: 'doubles', limit: 100 }
})
const { data: clubsData } = await useFetch<{ data: Array<{ id: string; name: string; description: string | null; city: string | null; province: string | null; is_verified: boolean; member_count: number }> }>('/api/v1/clubs/all')

const events = computed(() => eventsData.value?.events ?? [])
const upcomingEvents = computed(() => events.value.filter(e => e.status === 'published' && new Date(e.start_date) > new Date()))
const pastEvents = computed(() => events.value.filter(e => e.status === 'completed'))
const clubs = computed(() => clubsData.value?.data ?? [])

const rankingType = ref<'singles' | 'doubles'>('singles')
const rankings = computed(() => rankingType.value === 'singles' ? (singlesRankings.value?.data ?? []) : (doublesRankings.value?.data ?? []))

const allPlayers = computed(() => {
  const playerMap = new Map()
  for (const p of singlesRankings.value?.data ?? []) {
    playerMap.set(p.player_id, { id: p.player_id, display_name: p.display_name, city: p.city, province: p.province, rating: p.rating_value })
  }
  for (const p of doublesRankings.value?.data ?? []) {
    if (!playerMap.has(p.player_id)) {
      playerMap.set(p.player_id, { id: p.player_id, display_name: p.display_name, city: p.city, province: p.province, rating: p.rating_value })
    }
  }
  return Array.from(playerMap.values())
})

function formatEventDate(start: string, end?: string): string {
  const startDate = new Date(start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  if (!end || start === end) return startDate
  const endDate = new Date(end).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${startDate} - ${endDate}`
}

function getRatingTier(rating: number): { label: string; color: string; bg: string } {
  if (rating >= 5.5) return { label: 'Pro', color: 'text-purple-400', bg: 'bg-purple-500/20' }
  if (rating >= 4.5) return { label: 'Advanced', color: 'text-yellow-400', bg: 'bg-yellow-500/20' }
  if (rating >= 3.5) return { label: 'Intermediate', color: 'text-blue-400', bg: 'bg-blue-500/20' }
  if (rating >= 3.0) return { label: 'Beginner', color: 'text-emerald-400', bg: 'bg-emerald-500/20' }
  return { label: 'Novice', color: 'text-gray-400', bg: 'bg-gray-500/20' }
}

// Fetch real stats from database
const { data: statsData } = await useFetch<{ data: { players: number; matches: number; clubs: number; events: number } }>('/api/v1/stats/public')

const stats = computed(() => ({
  players: statsData.value?.data?.players ?? allPlayers.value.length,
  matches: statsData.value?.data?.matches ?? 0,
  clubs: statsData.value?.data?.clubs ?? clubs.value.length,
  tournaments: statsData.value?.data?.events ?? events.value.length
}))
</script>

<template>
  <div class="min-h-screen bg-[#0a0c08]">
    <div class="pointer-events-none fixed inset-0 overflow-hidden">
      <div class="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-[#4DB175]/10 blur-[100px]" />
      <div class="absolute -bottom-20 -right-20 h-60 w-60 rounded-full bg-[#4DB175]/5 blur-[80px]" />
    </div>

    <header class="fixed left-0 right-0 top-0 z-50 bg-[#0a0c08]/80 backdrop-blur-xl">
      <div class="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <div class="flex items-center gap-3">
          <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#4DB175] to-[#3a9d5e] text-sm font-bold text-white shadow-lg shadow-[#4DB175]/20">D</div>
          <span class="text-lg font-semibold text-white">DinkAndLadder</span>
        </div>
        <div class="flex items-center gap-2">
          <NuxtLink to="/login" class="rounded-lg px-4 py-2 text-sm font-medium text-[#A6ABA7] transition-colors hover:text-white">Log in</NuxtLink>
          <NuxtLink to="/register" class="rounded-xl bg-gradient-to-r from-[#4DB175] to-[#3a9d5e] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#4DB175]/25 transition-all hover:shadow-xl hover:shadow-[#4DB175]/30">Get Started</NuxtLink>
        </div>
      </div>
    </header>

    <nav class="fixed left-0 right-0 top-16 z-40 bg-[#0a0c08]/60 backdrop-blur-lg">
      <div class="mx-auto flex max-w-6xl gap-1 px-4 py-3">
        <button
          v-for="tab in [{ id: 'home', label: 'Home', icon: '🏠' }, { id: 'rankings', label: 'Rankings', icon: '🏆' }, { id: 'events', label: 'Events', icon: '📅' }, { id: 'clubs', label: 'Clubs', icon: '🏢' }, { id: 'players', label: 'Players', icon: '👥' }] as const"
          :key="tab.id"
          class="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-all"
          :class="activeTab === tab.id ? 'bg-gradient-to-r from-[#4DB175] to-[#3a9d5e] text-white shadow-lg shadow-[#4DB175]/20' : 'text-[#8a9a94] hover:bg-white/5 hover:text-white'"
          @click="activeTab = tab.id"
        >
          <span class="text-base">{{ tab.icon }}</span>
          <span>{{ tab.label }}</span>
        </button>
      </div>
    </nav>

    <main class="relative mx-auto max-w-6xl px-4 pb-12 pt-36">
      <!-- HOME -->
      <div v-if="activeTab === 'home'" class="space-y-10">
        <div class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1a2a24] via-[#162220] to-[#0f1a17] p-8 sm:p-12">
          <div class="absolute right-0 top-0 h-64 w-64 rounded-full bg-[#4DB175]/10 blur-[80px]" />
          <div class="relative">
            <div class="mb-4 inline-flex items-center gap-2 rounded-full bg-[#4DB175]/10 px-4 py-1.5 text-sm text-[#4DB175]">
              <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-[#4DB175]" />Philippine Pickleball Rating Platform
            </div>
            <h1 class="text-4xl font-bold tracking-tight text-white sm:text-5xl">Play. Compete.<br /><span class="bg-gradient-to-r from-[#4DB175] to-[#6ee7a0] bg-clip-text text-transparent">Rise Up.</span></h1>
            <p class="mt-4 max-w-xl text-lg text-[#8a9a94]">Track your rating, find tournaments, and connect with the pickleball community. Browse everything free — sign up to compete.</p>
            <div class="mt-8 flex flex-wrap gap-3">
              <NuxtLink to="/register" class="rounded-xl bg-gradient-to-r from-[#4DB175] to-[#3a9d5e] px-7 py-3.5 text-base font-semibold text-white shadow-xl shadow-[#4DB175]/25 transition-all hover:shadow-2xl hover:shadow-[#4DB175]/30">Join Free</NuxtLink>
              <button class="rounded-xl bg-white/5 px-7 py-3.5 text-base font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/10" @click="activeTab = 'events'">Browse Events</button>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div class="rounded-2xl bg-gradient-to-br from-[#1a2a24] to-[#14201c] p-5"><p class="text-3xl font-bold text-white">{{ stats.players.toLocaleString() }}</p><p class="mt-1 text-sm text-[#6B7B75]">Rated Players</p></div>
          <div class="rounded-2xl bg-gradient-to-br from-[#1a2a24] to-[#14201c] p-5"><p class="text-3xl font-bold text-white">{{ stats.matches.toLocaleString() }}</p><p class="mt-1 text-sm text-[#6B7B75]">Verified Matches</p></div>
          <div class="rounded-2xl bg-gradient-to-br from-[#1a2a24] to-[#14201c] p-5"><p class="text-3xl font-bold text-white">{{ stats.clubs }}</p><p class="mt-1 text-sm text-[#6B7B75]">Active Clubs</p></div>
          <div class="rounded-2xl bg-gradient-to-br from-[#1a2a24] to-[#14201c] p-5"><p class="text-3xl font-bold text-white">{{ stats.tournaments }}</p><p class="mt-1 text-sm text-[#6B7B75]">Tournaments</p></div>
        </div>

        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <button class="group rounded-2xl bg-gradient-to-br from-[#1a2a24] to-[#14201c] p-6 text-left transition-all hover:from-[#1f322b] hover:to-[#182621]" @click="activeTab = 'rankings'">
            <div class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#4DB175]/10 text-2xl transition-transform group-hover:scale-110">🏆</div>
            <h3 class="font-semibold text-white">Rankings</h3><p class="mt-1 text-sm text-[#6B7B75]">See top-rated players</p>
          </button>
          <button class="group rounded-2xl bg-gradient-to-br from-[#1a2a24] to-[#14201c] p-6 text-left transition-all hover:from-[#1f322b] hover:to-[#18262a]" @click="activeTab = 'events'">
            <div class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#4DB175]/10 text-2xl transition-transform group-hover:scale-110">📅</div>
            <h3 class="font-semibold text-white">Events</h3><p class="mt-1 text-sm text-[#6B7B75]">Tournaments & open play</p>
          </button>
          <button class="group rounded-2xl bg-gradient-to-br from-[#1a2a24] to-[#14201c] p-6 text-left transition-all hover:from-[#1f322b] hover:to-[#18262a]" @click="activeTab = 'clubs'">
            <div class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#4DB175]/10 text-2xl transition-transform group-hover:scale-110">🏢</div>
            <h3 class="font-semibold text-white">Clubs</h3><p class="mt-1 text-sm text-[#6B7B75]">Find local communities</p>
          </button>
          <button class="group rounded-2xl bg-gradient-to-br from-[#1a2a24] to-[#14201c] p-6 text-left transition-all hover:from-[#1f322b] hover:to-[#18262a]" @click="activeTab = 'players'">
            <div class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#4DB175]/10 text-2xl transition-transform group-hover:scale-110">👥</div>
            <h3 class="font-semibold text-white">Players</h3><p class="mt-1 text-sm text-[#6B7B75]">Browse all players</p>
          </button>
        </div>

        <div class="rounded-3xl bg-gradient-to-br from-[#1a2a24] to-[#14201c] p-8">
          <div class="mb-6 flex items-center gap-3"><span class="text-2xl">🏸</span><h2 class="text-2xl font-bold text-white">For Players</h2></div>
          <div class="grid gap-6 sm:grid-cols-2">
            <div class="flex gap-4"><div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#4DB175]/10 text-lg">🪜</div><div><h4 class="font-semibold text-white">Climb the Ladder</h4><p class="mt-1 text-sm text-[#6B7B75]">Win matches, improve your rating, rise through the ranks</p></div></div>
            <div class="flex gap-4"><div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#4DB175]/10 text-lg">🎯</div><div><h4 class="font-semibold text-white">Find Fair Games</h4><p class="mt-1 text-sm text-[#6B7B75]">Your verified rating helps match you with the right opponents</p></div></div>
            <div class="flex gap-4"><div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#4DB175]/10 text-lg">🏆</div><div><h4 class="font-semibold text-white">Compete in Tournaments</h4><p class="mt-1 text-sm text-[#6B7B75]">Browse and register for events near you</p></div></div>
            <div class="flex gap-4"><div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#4DB175]/10 text-lg">⭐</div><div><h4 class="font-semibold text-white">Earn Recognition</h4><p class="mt-1 text-sm text-[#6B7B75]">Unlock achievements and build your match history</p></div></div>
          </div>
        </div>

        <div class="rounded-3xl bg-gradient-to-br from-[#1a2a24] to-[#14201c] p-8">
          <div class="mb-6 flex items-center gap-3"><span class="text-2xl">🏢</span><h2 class="text-2xl font-bold text-white">For Club Organizers</h2></div>
          <div class="grid gap-6 sm:grid-cols-2">
            <div class="flex gap-4"><div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#4DB175]/10 text-lg">🏢</div><div><h4 class="font-semibold text-white">Create Your Club</h4><p class="mt-1 text-sm text-[#6B7B75]">Build your community, manage members</p></div></div>
            <div class="flex gap-4"><div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#4DB175]/10 text-lg">🏆</div><div><h4 class="font-semibold text-white">Host Tournaments</h4><p class="mt-1 text-sm text-[#6B7B75]">Set up brackets, manage registrations</p></div></div>
            <div class="flex gap-4"><div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#4DB175]/10 text-lg">📅</div><div><h4 class="font-semibold text-white">Schedule Open Play</h4><p class="mt-1 text-sm text-[#6B7B75]">Organize sessions, set skill requirements</p></div></div>
            <div class="flex gap-4"><div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#4DB175]/10 text-lg">📊</div><div><h4 class="font-semibold text-white">Track Everything</h4><p class="mt-1 text-sm text-[#6B7B75]">Club stats, member activity, results</p></div></div>
          </div>
          <div class="mt-6"><NuxtLink to="/register" class="inline-flex items-center gap-2 rounded-xl bg-white/5 px-6 py-3 font-semibold text-white transition-all hover:bg-white/10">+ Create Your Club</NuxtLink></div>
        </div>

        <div class="rounded-3xl bg-gradient-to-br from-[#1a2a24] to-[#14201c] p-8">
          <h2 class="mb-8 text-center text-2xl font-bold text-white">How It Works</h2>
          <div class="grid gap-6 sm:grid-cols-4">
            <div class="text-center"><div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4DB175] to-[#3a9d5e] text-xl font-bold text-white shadow-lg shadow-[#4DB175]/20">1</div><h4 class="font-semibold text-white">Sign Up Free</h4><p class="mt-1 text-sm text-[#6B7B75]">Create your profile</p></div>
            <div class="text-center"><div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4DB175] to-[#3a9d5e] text-xl font-bold text-white shadow-lg shadow-[#4DB175]/20">2</div><h4 class="font-semibold text-white">Find Events</h4><p class="mt-1 text-sm text-[#6B7B75]">Browse tournaments</p></div>
            <div class="text-center"><div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4DB175] to-[#3a9d5e] text-xl font-bold text-white shadow-lg shadow-[#4DB175]/20">3</div><h4 class="font-semibold text-white">Play & Record</h4><p class="mt-1 text-sm text-[#6B7B75]">Submit results</p></div>
            <div class="text-center"><div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4DB175] to-[#3a9d5e] text-xl font-bold text-white shadow-lg shadow-[#4DB175]/20">4</div><h4 class="font-semibold text-white">Climb Rankings</h4><p class="mt-1 text-sm text-[#6B7B75]">Watch rating rise</p></div>
          </div>
        </div>

        <div class="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#4DB175] to-[#3a9d5e] p-8 text-center sm:p-12">
          <div class="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <h2 class="relative text-3xl font-bold text-white">Ready to Play?</h2>
          <p class="relative mt-3 text-lg text-white/80">Join the Philippine pickleball community today</p>
          <NuxtLink to="/register" class="relative mt-6 inline-block rounded-xl bg-white px-8 py-4 text-lg font-bold text-[#4DB175] shadow-xl transition-all hover:shadow-2xl">Create Free Account</NuxtLink>
        </div>
      </div>

      <!-- RANKINGS -->
      <div v-else-if="activeTab === 'rankings'" class="space-y-6">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 class="text-2xl font-bold text-white">Rankings</h2>
          <div class="flex gap-2 rounded-xl bg-[#14201c] p-1.5">
            <button class="rounded-lg px-5 py-2 text-sm font-medium transition-all" :class="rankingType === 'singles' ? 'bg-gradient-to-r from-[#4DB175] to-[#3a9d5e] text-white shadow-lg' : 'text-[#6B7B75] hover:text-white'" @click="rankingType = 'singles'">Singles</button>
            <button class="rounded-lg px-5 py-2 text-sm font-medium transition-all" :class="rankingType === 'doubles' ? 'bg-gradient-to-r from-[#4DB175] to-[#3a9d5e] text-white shadow-lg' : 'text-[#6B7B75] hover:text-white'" @click="rankingType = 'doubles'">Doubles</button>
          </div>
        </div>
        <div v-if="rankings.length === 0" class="rounded-2xl bg-gradient-to-br from-[#1a2a24] to-[#14201c] p-12 text-center">
          <p class="text-lg text-[#6B7B75]">No ranked players yet.</p>
          <NuxtLink to="/register" class="mt-4 inline-block rounded-xl bg-gradient-to-r from-[#4DB175] to-[#3a9d5e] px-6 py-3 font-semibold text-white">Be the First</NuxtLink>
        </div>
        <div v-else class="space-y-3">
          <NuxtLink v-for="player in rankings" :key="player.player_id" :to="`/players/${player.player_id}`" class="flex items-center gap-4 rounded-2xl bg-gradient-to-br from-[#1a2a24] to-[#14201c] p-4 transition-all hover:from-[#1f322b] hover:to-[#18262a]">
            <div class="flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold" :class="player.rank === 1 ? 'bg-gradient-to-br from-[#F5A623] to-[#d4920f] text-white shadow-lg shadow-[#F5A623]/30' : player.rank === 2 ? 'bg-gradient-to-br from-[#C0C0C0] to-[#a0a0a0] text-white shadow-lg' : player.rank === 3 ? 'bg-gradient-to-br from-[#CD7F32] to-[#a66628] text-white shadow-lg' : 'bg-[#1a2a24] text-[#6B7B75]'">{{ player.rank }}</div>
            <div class="flex-1"><p class="font-semibold text-white">{{ player.display_name }}</p><p class="text-sm text-[#6B7B75]">{{ player.city || player.province || 'Philippines' }}</p></div>
            <div class="text-right"><p class="text-2xl font-bold text-[#4DB175]">{{ player.rating_value.toFixed(2) }}</p><span class="text-xs font-medium" :class="getRatingTier(player.rating_value).color">{{ getRatingTier(player.rating_value).label }}</span></div>
          </NuxtLink>
        </div>
      </div>

      <!-- EVENTS -->
      <div v-else-if="activeTab === 'events'" class="space-y-8">
        <h2 class="text-2xl font-bold text-white">Events</h2>
        <div>
          <h3 class="mb-4 flex items-center gap-2 text-lg font-semibold text-[#A6ABA7]"><span class="h-2 w-2 rounded-full bg-[#4DB175]" />Upcoming</h3>
          <div v-if="upcomingEvents.length === 0" class="rounded-2xl bg-gradient-to-br from-[#1a2a24] to-[#14201c] p-10 text-center"><p class="text-[#6B7B75]">No upcoming events</p></div>
          <div v-else class="grid gap-4 sm:grid-cols-2">
            <NuxtLink v-for="event in upcomingEvents" :key="event.id" :to="`/events/${event.id}`" class="group rounded-2xl bg-gradient-to-br from-[#1a2a24] to-[#14201c] p-5 transition-all hover:from-[#1f322b] hover:to-[#18262a]">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <span class="mb-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium" :class="event.event_type === 'tournament' ? 'bg-[#F5A623]/10 text-[#F5A623]' : 'bg-[#4DB175]/10 text-[#4DB175]'">{{ event.event_type === 'tournament' ? '🏆 Tournament' : '🎾 Open Play' }}</span>
                  <h4 class="mt-2 font-semibold text-white group-hover:text-[#4DB175]">{{ event.name }}</h4>
                  <p class="mt-1 text-sm text-[#6B7B75]">{{ event.venue || event.city || 'TBA' }}</p>
                </div>
                <div class="shrink-0 rounded-xl bg-[#4DB175]/10 px-3 py-2 text-center"><p class="text-lg font-bold text-[#4DB175]">{{ formatEventDate(event.start_date) }}</p></div>
              </div>
            </NuxtLink>
          </div>
        </div>
        <div v-if="pastEvents.length > 0">
          <h3 class="mb-4 text-lg font-semibold text-[#6B7B75]">Past Events</h3>
          <div class="space-y-2">
            <NuxtLink v-for="event in pastEvents.slice(0, 5)" :key="event.id" :to="`/events/${event.id}`" class="flex items-center justify-between rounded-xl bg-[#14201c]/50 p-4 transition-all hover:bg-[#1a2a24]">
              <div><h4 class="font-medium text-[#A6ABA7]">{{ event.name }}</h4><p class="text-sm text-[#6B7B75]">{{ event.city || event.venue }}</p></div>
              <span class="text-sm text-[#6B7B75]">{{ formatEventDate(event.start_date) }}</span>
            </NuxtLink>
          </div>
        </div>
      </div>

      <!-- CLUBS -->
      <div v-else-if="activeTab === 'clubs'" class="space-y-6">
        <h2 class="text-2xl font-bold text-white">Clubs</h2>
        <div v-if="clubs.length === 0" class="rounded-2xl bg-gradient-to-br from-[#1a2a24] to-[#14201c] p-12 text-center">
          <p class="text-lg text-[#6B7B75]">No clubs yet.</p>
          <NuxtLink to="/register" class="mt-4 inline-block rounded-xl bg-gradient-to-r from-[#4DB175] to-[#3a9d5e] px-6 py-3 font-semibold text-white">Create the First Club</NuxtLink>
        </div>
        <div v-else class="grid gap-4 sm:grid-cols-2">
          <NuxtLink v-for="club in clubs" :key="club.id" :to="`/clubs/${club.id}`" class="group rounded-2xl bg-gradient-to-br from-[#1a2a24] to-[#14201c] p-5 transition-all hover:from-[#1f322b] hover:to-[#18262a]">
            <div class="flex items-start gap-4">
              <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2a3f38] to-[#1f322b] text-xl font-bold text-[#4DB175]">{{ club.name.charAt(0).toUpperCase() }}</div>
              <div class="flex-1">
                <div class="flex items-center gap-2"><h4 class="font-semibold text-white group-hover:text-[#4DB175]">{{ club.name }}</h4><span v-if="club.is_verified" class="rounded-full bg-[#4DB175]/20 px-2 py-0.5 text-xs font-medium text-[#4DB175]">Verified</span></div>
                <p class="mt-1 text-sm text-[#6B7B75]">{{ [club.city, club.province].filter(Boolean).join(', ') || 'Philippines' }}</p>
                <p class="mt-2 text-xs text-[#6B7B75]">{{ club.member_count }} members</p>
              </div>
            </div>
          </NuxtLink>
        </div>
      </div>

      <!-- PLAYERS -->
      <div v-else-if="activeTab === 'players'" class="space-y-6">
        <div class="flex items-center justify-between"><h2 class="text-2xl font-bold text-white">Players</h2><span class="text-sm text-[#6B7B75]">{{ allPlayers.length }} rated players</span></div>
        <div v-if="allPlayers.length === 0" class="rounded-2xl bg-gradient-to-br from-[#1a2a24] to-[#14201c] p-12 text-center">
          <p class="text-lg text-[#6B7B75]">No players yet.</p>
          <NuxtLink to="/register" class="mt-4 inline-block rounded-xl bg-gradient-to-r from-[#4DB175] to-[#3a9d5e] px-6 py-3 font-semibold text-white">Be the First</NuxtLink>
        </div>
        <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <NuxtLink v-for="player in allPlayers" :key="player.id" :to="`/players/${player.id}`" class="group flex items-center gap-3 rounded-2xl bg-gradient-to-br from-[#1a2a24] to-[#14201c] p-4 transition-all hover:from-[#1f322b] hover:to-[#18262a]">
            <div class="flex h-11 w-11 items-center justify-center rounded-xl bg-[#2a3f38] font-bold text-[#4DB175]">{{ player.display_name.charAt(0).toUpperCase() }}</div>
            <div class="flex-1 overflow-hidden"><p class="truncate font-medium text-white group-hover:text-[#4DB175]">{{ player.display_name }}</p><p class="text-sm text-[#6B7B75]">{{ player.city || player.province || 'Philippines' }}</p></div>
            <div v-if="player.rating" class="text-right"><p class="font-bold text-[#4DB175]">{{ player.rating.toFixed(2) }}</p></div>
          </NuxtLink>
        </div>
      </div>
    </main>

    <footer class="relative mt-12 bg-[#0a0c08] px-4 py-8">
      <div class="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <div class="flex items-center gap-2"><div class="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#4DB175] to-[#3a9d5e] text-xs font-bold text-white">D</div><span class="text-sm font-medium text-white">DinkAndLadder</span></div>
        <p class="text-xs text-[#6B7B75]">© 2024 · Philippine Pickleball Rating Platform</p>
      </div>
    </footer>
  </div>
</template>
