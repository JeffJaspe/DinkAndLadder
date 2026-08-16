<script setup lang="ts">
const user = useSupabaseUser()

const stats = ref({
  players: 1247,
  matches: 8934,
  clubs: 86,
  tournaments: 42
})

// Rating tiers based on 2.0-8.0 DUPR-style scale
const ratingTiers = [
  { min: 2.0, max: 2.99, label: 'Beginner', color: '#6B7B75' },
  { min: 3.0, max: 3.49, label: 'Novice', color: '#A6ABA7' },
  { min: 3.5, max: 3.99, label: 'Intermediate', color: '#4DB175' },
  { min: 4.0, max: 4.49, label: 'Advanced', color: '#4DB175' },
  { min: 4.5, max: 4.99, label: 'Skilled', color: '#F5A623' },
  { min: 5.0, max: 5.49, label: 'Expert', color: '#F5A623' },
  { min: 5.5, max: 5.99, label: 'Pro', color: '#C0C0C0' },
  { min: 6.0, max: 8.0, label: 'Elite', color: '#F5A623' }
]

const playerFeatures = [
  {
    icon: '🪜',
    title: 'Climb the Ladder',
    description: 'Challenge players at your level and work your way up the rankings with every match you win.'
  },
  {
    icon: '🎯',
    title: 'Play Open Play with Confidence',
    description: 'Know exactly where you stand. Your verified rating helps you find balanced, competitive games.'
  },
  {
    icon: '🏠',
    title: 'Browse & Join from Home',
    description: 'Discover tournaments and open play sessions near you. Register online and show up ready to play.'
  },
  {
    icon: '⭐',
    title: 'Get Your Skills Recognized',
    description: 'Earn achievements, build your match history, and let your rating speak for your game.'
  }
]

const organizerFeatures = [
  {
    icon: '🏢',
    title: 'Create Your Club',
    description: 'Build your pickleball community. Manage members, organize events, and grow your local scene.'
  },
  {
    icon: '🏆',
    title: 'Host Tournaments',
    description: 'Set up brackets, manage registrations, and run professional tournaments with ease.'
  },
  {
    icon: '📅',
    title: 'Schedule Open Play',
    description: 'Organize regular sessions, set skill level requirements, and let players find you online.'
  },
  {
    icon: '📊',
    title: 'Track Everything',
    description: 'See club stats, member activity, and tournament results all in one place.'
  }
]

const howItWorksPlayer = [
  { step: '1', title: 'Create Profile', desc: 'Sign up free and set your skill level' },
  { step: '2', title: 'Find Events', desc: 'Browse tournaments and open play near you' },
  { step: '3', title: 'Play & Record', desc: 'Submit match results for verification' },
  { step: '4', title: 'Rise Up', desc: 'Watch your rating climb the ladder' }
]

const howItWorksOrganizer = [
  { step: '1', title: 'Create Club', desc: 'Set up your club profile and invite members' },
  { step: '2', title: 'Plan Events', desc: 'Create tournaments with custom formats' },
  { step: '3', title: 'Manage', desc: 'Handle registrations and run brackets' },
  { step: '4', title: 'Grow', desc: 'Build your community and reputation' }
]
</script>

<template>
  <div class="min-h-screen bg-[#0B0D09]">
    <!-- Hero Section -->
    <section class="relative overflow-hidden px-4 py-20 lg:py-32">
      <!-- Background gradient -->
      <div class="absolute inset-0 bg-gradient-to-br from-[#4DB175]/10 via-transparent to-[#B5B9F0]/5" />

      <!-- Decorative elements -->
      <div class="absolute left-10 top-20 h-64 w-64 rounded-full bg-[#4DB175]/5 blur-3xl" />
      <div class="absolute bottom-10 right-10 h-48 w-48 rounded-full bg-[#B5B9F0]/5 blur-3xl" />

      <div class="relative mx-auto max-w-5xl text-center">
        <!-- Badge -->
        <div class="mb-6 inline-flex items-center gap-2 rounded-full bg-[#4DB175]/10 px-4 py-1.5">
          <span class="h-2 w-2 animate-pulse rounded-full bg-[#4DB175]" />
          <span class="text-sm text-[#4DB175]">Philippine Pickleball Rating Platform</span>
        </div>

        <h1 class="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
          Play with Confidence.
          <span class="block text-[#4DB175]">Dink & Ladder.</span>
        </h1>

        <p class="mx-auto mt-6 max-w-2xl text-lg text-[#A6ABA7]">
          Whether you're a player looking for your next match or an organizer building your pickleball community —
          DinkAndLadder is your home for verified ratings, tournaments, and open play.
        </p>

        <div class="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <NuxtLink
            v-if="!user"
            to="/register"
            class="rounded-xl bg-[#4DB175] px-8 py-3.5 text-lg font-semibold text-white shadow-lg shadow-[#4DB175]/20 transition-all hover:bg-[#5FC287] hover:shadow-xl"
          >
            Join Free
          </NuxtLink>
          <NuxtLink
            v-else
            to="/dashboard"
            class="rounded-xl bg-[#4DB175] px-8 py-3.5 text-lg font-semibold text-white shadow-lg shadow-[#4DB175]/20 transition-all hover:bg-[#5FC287] hover:shadow-xl"
          >
            Go to Dashboard
          </NuxtLink>
          <NuxtLink
            to="/events"
            class="rounded-xl border border-[#3A5750] bg-[#1E2E2A] px-8 py-3.5 text-lg font-semibold text-white transition-all hover:border-[#4DB175]/50 hover:bg-[#2E4540]"
          >
            Browse Events
          </NuxtLink>
        </div>

        <!-- Browse without account notice -->
        <p class="mt-6 text-sm text-[#6B7B75]">
          Browse tournaments, open play, and rankings without an account.
          <span class="text-[#A6ABA7]">Create a free account to join and play.</span>
        </p>
      </div>
    </section>

    <!-- Stats Section -->
    <section class="border-y border-[#2E4540]/50 bg-[#1A2420] px-4 py-12">
      <div class="mx-auto grid max-w-4xl grid-cols-2 gap-8 text-center sm:grid-cols-4">
        <div>
          <p class="text-3xl font-bold text-[#4DB175]">{{ stats.players.toLocaleString() }}</p>
          <p class="mt-1 text-sm text-[#6B7B75]">Rated Players</p>
        </div>
        <div>
          <p class="text-3xl font-bold text-[#4DB175]">{{ stats.matches.toLocaleString() }}</p>
          <p class="mt-1 text-sm text-[#6B7B75]">Verified Matches</p>
        </div>
        <div>
          <p class="text-3xl font-bold text-[#4DB175]">{{ stats.clubs.toLocaleString() }}</p>
          <p class="mt-1 text-sm text-[#6B7B75]">Active Clubs</p>
        </div>
        <div>
          <p class="text-3xl font-bold text-[#4DB175]">{{ stats.tournaments.toLocaleString() }}</p>
          <p class="mt-1 text-sm text-[#6B7B75]">Tournaments</p>
        </div>
      </div>
    </section>

    <!-- For Players Section -->
    <section class="px-4 py-20">
      <div class="mx-auto max-w-5xl">
        <div class="mb-4 flex items-center justify-center gap-3">
          <span class="text-3xl">🏸</span>
          <h2 class="text-3xl font-bold text-white">For Players</h2>
        </div>
        <p class="mx-auto mb-12 max-w-2xl text-center text-[#A6ABA7]">
          Find games, track your rating, and compete with confidence
        </p>

        <div class="grid gap-6 sm:grid-cols-2">
          <div
            v-for="feature in playerFeatures"
            :key="feature.title"
            class="group rounded-xl bg-[#1E2E2A] p-6 transition-all hover:bg-[#2E4540]"
          >
            <div class="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-[#4DB175]/10 text-3xl transition-transform group-hover:scale-110">
              {{ feature.icon }}
            </div>
            <h3 class="text-xl font-semibold text-white">{{ feature.title }}</h3>
            <p class="mt-2 text-[#A6ABA7]">{{ feature.description }}</p>
          </div>
        </div>

        <!-- How it works for players -->
        <div class="mt-16">
          <h3 class="mb-8 text-center text-xl font-semibold text-[#A6ABA7]">How It Works</h3>
          <div class="grid gap-4 sm:grid-cols-4">
            <div
              v-for="item in howItWorksPlayer"
              :key="item.step"
              class="rounded-xl bg-[#1E2E2A] p-5 text-center"
            >
              <div class="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#4DB175] text-lg font-bold text-white">
                {{ item.step }}
              </div>
              <h4 class="font-semibold text-white">{{ item.title }}</h4>
              <p class="mt-1 text-sm text-[#6B7B75]">{{ item.desc }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- For Organizers Section -->
    <section class="bg-[#1A2420] px-4 py-20">
      <div class="mx-auto max-w-5xl">
        <div class="mb-4 flex items-center justify-center gap-3">
          <span class="text-3xl">🏢</span>
          <h2 class="text-3xl font-bold text-white">For Club Organizers</h2>
        </div>
        <p class="mx-auto mb-12 max-w-2xl text-center text-[#A6ABA7]">
          Build your community, host events, and grow the sport
        </p>

        <div class="grid gap-6 sm:grid-cols-2">
          <div
            v-for="feature in organizerFeatures"
            :key="feature.title"
            class="group rounded-xl bg-[#0B0D09] p-6 transition-all hover:ring-1 hover:ring-[#4DB175]/30"
          >
            <div class="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-[#4DB175]/10 text-3xl transition-transform group-hover:scale-110">
              {{ feature.icon }}
            </div>
            <h3 class="text-xl font-semibold text-white">{{ feature.title }}</h3>
            <p class="mt-2 text-[#A6ABA7]">{{ feature.description }}</p>
          </div>
        </div>

        <!-- How it works for organizers -->
        <div class="mt-16">
          <h3 class="mb-8 text-center text-xl font-semibold text-[#A6ABA7]">Start Organizing</h3>
          <div class="grid gap-4 sm:grid-cols-4">
            <div
              v-for="item in howItWorksOrganizer"
              :key="item.step"
              class="rounded-xl bg-[#0B0D09] p-5 text-center"
            >
              <div class="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#4DB175] text-lg font-bold text-white">
                {{ item.step }}
              </div>
              <h4 class="font-semibold text-white">{{ item.title }}</h4>
              <p class="mt-1 text-sm text-[#6B7B75]">{{ item.desc }}</p>
            </div>
          </div>
        </div>

        <!-- CTA for organizers -->
        <div class="mt-12 text-center">
          <NuxtLink
            v-if="!user"
            to="/register"
            class="inline-flex items-center gap-2 rounded-xl bg-[#4DB175] px-8 py-3.5 text-lg font-semibold text-white transition-all hover:bg-[#5FC287]"
          >
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            Create Your Club
          </NuxtLink>
          <NuxtLink
            v-else
            to="/create-club"
            class="inline-flex items-center gap-2 rounded-xl bg-[#4DB175] px-8 py-3.5 text-lg font-semibold text-white transition-all hover:bg-[#5FC287]"
          >
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            Create Your Club
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- Browse Section - Emphasize no account needed to browse -->
    <section class="px-4 py-20">
      <div class="mx-auto max-w-5xl">
        <h2 class="mb-4 text-center text-3xl font-bold text-white">
          Start Exploring Now
        </h2>
        <p class="mx-auto mb-12 max-w-2xl text-center text-[#A6ABA7]">
          No account needed to browse. See what's happening in Philippine pickleball.
        </p>

        <div class="grid gap-6 sm:grid-cols-3">
          <NuxtLink
            to="/events"
            class="group rounded-xl bg-[#1E2E2A] p-6 text-center transition-all hover:bg-[#2E4540]"
          >
            <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#4DB175]/10 text-4xl transition-transform group-hover:scale-110">
              📅
            </div>
            <h3 class="text-xl font-semibold text-white">Tournaments</h3>
            <p class="mt-2 text-[#6B7B75]">Browse upcoming events and see past results</p>
            <p class="mt-4 text-sm text-[#4DB175]">View Events →</p>
          </NuxtLink>

          <NuxtLink
            to="/clubs"
            class="group rounded-xl bg-[#1E2E2A] p-6 text-center transition-all hover:bg-[#2E4540]"
          >
            <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#4DB175]/10 text-4xl transition-transform group-hover:scale-110">
              🏢
            </div>
            <h3 class="text-xl font-semibold text-white">Clubs</h3>
            <p class="mt-2 text-[#6B7B75]">Find clubs and open play sessions near you</p>
            <p class="mt-4 text-sm text-[#4DB175]">Browse Clubs →</p>
          </NuxtLink>

          <NuxtLink
            to="/rankings"
            class="group rounded-xl bg-[#1E2E2A] p-6 text-center transition-all hover:bg-[#2E4540]"
          >
            <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#4DB175]/10 text-4xl transition-transform group-hover:scale-110">
              🏆
            </div>
            <h3 class="text-xl font-semibold text-white">Rankings</h3>
            <p class="mt-2 text-[#6B7B75]">See the top-rated players in your area</p>
            <p class="mt-4 text-sm text-[#4DB175]">View Rankings →</p>
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- Testimonial -->
    <section class="bg-[#1A2420] px-4 py-20">
      <div class="mx-auto max-w-3xl text-center">
        <div class="mb-6 text-5xl">🏸</div>
        <blockquote class="text-xl italic text-[#A6ABA7]">
          "Finally, a platform that lets me prove my skill level. Now when I show up to open play,
          people know I'm legit — and I can find games that actually challenge me."
        </blockquote>
        <div class="mt-6">
          <p class="font-semibold text-white">— Early DinkAndLadder Player</p>
          <p class="text-sm text-[#6B7B75]">Cebu City</p>
        </div>
      </div>
    </section>

    <!-- Final CTA Section -->
    <section class="px-4 py-20">
      <div class="mx-auto max-w-3xl rounded-2xl bg-gradient-to-br from-[#4DB175]/20 to-[#2E4540] p-10 text-center">
        <h2 class="text-3xl font-bold text-white">
          Ready to Join the Community?
        </h2>
        <p class="mt-4 text-[#A6ABA7]">
          Whether you want to play, organize, or both — your pickleball journey starts here.
          Create your free account and start climbing.
        </p>
        <div class="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <NuxtLink
            v-if="!user"
            to="/register"
            class="rounded-xl bg-[#4DB175] px-8 py-3.5 text-lg font-semibold text-white transition-all hover:bg-[#5FC287]"
          >
            Create Free Account
          </NuxtLink>
          <NuxtLink
            v-else
            to="/dashboard"
            class="rounded-xl bg-[#4DB175] px-8 py-3.5 text-lg font-semibold text-white transition-all hover:bg-[#5FC287]"
          >
            Go to Dashboard
          </NuxtLink>
          <NuxtLink
            to="/events"
            class="text-[#4DB175] hover:underline"
          >
            Browse Events First →
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="border-t border-[#2E4540]/50 px-4 py-8">
      <div class="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 sm:flex-row">
        <div class="flex items-center gap-2">
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-[#4DB175] text-sm font-bold text-white">
            D
          </div>
          <span class="font-semibold text-white">DinkAndLadder</span>
        </div>
        <p class="text-sm text-[#6B7B75]">
          © {{ new Date().getFullYear() }} DinkAndLadder. Philippine Pickleball Rating Platform.
        </p>
      </div>
    </footer>
  </div>
</template>
