<script setup lang="ts">
import type { ClubDto } from '~/server/domains/club/dto/club.dto'
import type { RosterMemberDto } from '~/server/domains/club/dto/club-membership.dto'
import type { PlayerProfileDto } from '~/server/domains/player/dto/player-profile.dto'
import type { AnnouncementDto } from '~/server/domains/announcement/dto/announcement.dto'
import type { EventDto } from '~/server/domains/event/dto/event.dto'

interface ClubRankingEntry {
  rank: number
  player_id: string
  display_name: string
  rating_value: number | null
}

interface ClubMatchSummary {
  id: string
  match_type: 'singles' | 'doubles'
  status: string
  played_at: string
  participants: Array<{ player_id: string; team_number: 1 | 2; display_name: string }>
  scores: Array<{ set_number: number; team1_score: number; team2_score: number }>
}

const route = useRoute()
const clubId = computed(() => route.params.clubId as string)

const {
  data: club,
  pending: clubPending,
  error: clubError,
  refresh: refreshClub
} = await useFetch<ClubDto>(() => `/api/v1/clubs/${clubId.value}`)

const { data: myProfile } = await useFetch<PlayerProfileDto>('/api/v1/players/me')

const roster = ref<RosterMemberDto[] | null>(null)
const notAMember = ref(false)
const joinMessage = ref('')
const joinError = ref('')
const joining = ref(false)

const announcements = ref<AnnouncementDto[]>([])
const clubRankings = ref<ClubRankingEntry[]>([])
const clubMatches = ref<ClubMatchSummary[]>([])
const upcomingClubEvents = ref<EventDto[]>([])
const previousClubEvents = ref<EventDto[]>([])

async function loadRoster() {
  notAMember.value = false
  try {
    const response = await $fetch<{ items: RosterMemberDto[] }>(
      `/api/v1/clubs/${clubId.value}/members`
    )
    roster.value = response.items
  } catch {
    roster.value = null
    notAMember.value = true
  }
}

async function loadAnnouncements() {
  try {
    const response = await $fetch<{ announcements: AnnouncementDto[] }>(
      `/api/v1/clubs/${clubId.value}/announcements`
    )
    announcements.value = response.announcements
  } catch {
    announcements.value = []
  }
}

async function loadClubRankings() {
  try {
    const response = await $fetch<{ data: ClubRankingEntry[] }>(
      `/api/v1/clubs/${clubId.value}/rankings`
    )
    clubRankings.value = response.data
  } catch {
    clubRankings.value = []
  }
}

async function loadClubMatches() {
  try {
    const response = await $fetch<{ data: ClubMatchSummary[] }>(
      `/api/v1/clubs/${clubId.value}/matches?limit=50`
    )
    clubMatches.value = response.data
  } catch {
    clubMatches.value = []
  }
}

async function loadClubEvents() {
  try {
    const [published, active, previous] = await Promise.all([
      $fetch<{ events: EventDto[] }>('/api/v1/events', {
        query: { club_id: clubId.value, status: 'published' }
      }),
      $fetch<{ events: EventDto[] }>('/api/v1/events', {
        query: { club_id: clubId.value, status: 'active' }
      }),
      $fetch<{ events: EventDto[] }>('/api/v1/events', {
        query: { club_id: clubId.value, status: 'completed' }
      })
    ])
    upcomingClubEvents.value = [...published.events, ...active.events].sort(
      (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
    )
    previousClubEvents.value = previous.events
  } catch {
    upcomingClubEvents.value = []
    previousClubEvents.value = []
  }
}

onMounted(() => {
  loadRoster()
  loadAnnouncements()
  loadClubRankings()
  loadClubMatches()
  loadClubEvents()
})

function formatScore(scores: ClubMatchSummary['scores']): string {
  return scores.map(s => `${s.team1_score}-${s.team2_score}`).join(', ')
}

function formatEventDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const myMembership = computed(
  () => roster.value?.find((m) => m.player_id === myProfile.value?.id) ?? null
)
const isAdmin = computed(
  () => myMembership.value?.role === 'OWNER' || myMembership.value?.role === 'ADMIN'
)
const isStaff = computed(
  () => ['OWNER', 'ADMIN', 'MODERATOR'].includes(myMembership.value?.role ?? '')
)
const isOwner = computed(() => myMembership.value?.role === 'OWNER')

const verificationLoading = ref(false)
const verificationError = ref('')

async function handleRequestVerification() {
  verificationError.value = ''
  verificationLoading.value = true
  try {
    await $fetch(`/api/v1/clubs/${clubId.value}/request-verification`, { method: 'POST' })
    await refreshClub()
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    verificationError.value = fetchError.data?.message ?? 'Could not request verification.'
  } finally {
    verificationLoading.value = false
  }
}

const roleColors: Record<string, string> = {
  OWNER: 'bg-[#F5A623] text-[#0B0D09]',
  ADMIN: 'bg-[#B5B9F0] text-[#0B0D09]',
  MODERATOR: 'bg-[#4DB175] text-white',
  MEMBER: 'bg-[#3A5750] text-[#A6ABA7]'
}

async function handleJoin() {
  joinError.value = ''
  joinMessage.value = ''
  joining.value = true
  try {
    await $fetch(`/api/v1/clubs/${clubId.value}/membership-requests`, { method: 'POST' })
    joinMessage.value = 'Request sent — waiting for approval.'
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    joinError.value = fetchError.data?.message ?? 'Could not send the request.'
  } finally {
    joining.value = false
  }
}

async function handleLeave() {
  await $fetch(`/api/v1/clubs/${clubId.value}/leave`, { method: 'POST' })
  await loadRoster()
}

async function updateMember(playerId: string, body: { status?: string; role?: string }) {
  await $fetch(`/api/v1/clubs/${clubId.value}/members/${playerId}`, { method: 'PATCH', body })
  await loadRoster()
}

const showAnnouncementForm = ref(false)
const newAnnouncement = ref({ title: '', body: '' })
const announcementError = ref('')
const creatingAnnouncement = ref(false)

async function createAnnouncement() {
  if (!newAnnouncement.value.title || !newAnnouncement.value.body) return
  announcementError.value = ''
  creatingAnnouncement.value = true
  try {
    await $fetch(`/api/v1/clubs/${clubId.value}/announcements`, {
      method: 'POST',
      body: newAnnouncement.value
    })
    newAnnouncement.value = { title: '', body: '' }
    showAnnouncementForm.value = false
    await loadAnnouncements()
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    announcementError.value = fetchError.data?.message ?? 'Failed to create announcement.'
  } finally {
    creatingAnnouncement.value = false
  }
}

async function publishAnnouncement(id: string) {
  await $fetch(`/api/v1/clubs/${clubId.value}/announcements/${id}/publish`, { method: 'POST' })
  await loadAnnouncements()
}

async function archiveAnnouncement(id: string) {
  await $fetch(`/api/v1/clubs/${clubId.value}/announcements/${id}/archive`, { method: 'POST' })
  await loadAnnouncements()
}

async function togglePin(id: string) {
  await $fetch(`/api/v1/clubs/${clubId.value}/announcements/${id}/pin`, { method: 'POST' })
  await loadAnnouncements()
}

async function markAsRead(id: string) {
  await $fetch(`/api/v1/clubs/${clubId.value}/announcements/${id}/read`, { method: 'POST' })
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString()
}

const publishedAnnouncements = computed(() =>
  announcements.value.filter(a => a.status === 'published')
)
const draftAnnouncements = computed(() =>
  announcements.value.filter(a => a.status === 'draft')
)
</script>

<template>
  <div class="min-h-screen bg-[#0B0D09] p-4 lg:p-6">
    <div class="mx-auto max-w-3xl">
      <!-- Loading -->
      <div v-if="clubPending" class="space-y-4">
        <div class="h-32 animate-pulse rounded-xl bg-[#1E2E2A]" />
        <div class="h-48 animate-pulse rounded-xl bg-[#1E2E2A]" />
      </div>

      <!-- Error -->
      <div
        v-else-if="clubError"
        class="rounded-xl bg-red-500/10 p-6 text-center"
      >
        <p class="text-red-400">
          {{
            clubError.statusCode === 404
              ? 'This club is private or does not exist.'
              : 'Could not load this club.'
          }}
        </p>
        <NuxtLink to="/clubs" class="mt-4 inline-block text-sm text-[#4DB175] hover:underline">
          Browse clubs
        </NuxtLink>
      </div>

      <template v-else-if="club">
        <!-- Header -->
        <div class="mb-6 rounded-xl bg-[#1E2E2A] p-6">
          <div class="flex items-start gap-4">
            <div class="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl bg-[#2E4540] text-2xl font-bold text-[#A6ABA7]">
              {{ club.name.charAt(0).toUpperCase() }}
            </div>
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <h1 class="text-2xl font-bold text-white">{{ club.name }}</h1>
                <VerifiedBadge v-if="club.verification_status === 'verified'" />
              </div>
              <p v-if="club.city || club.province" class="mt-1 text-[#6B7B75]">
                {{ [club.city, club.province].filter(Boolean).join(', ') }}
              </p>
              <p v-if="club.description" class="mt-3 text-[#A6ABA7]">
                {{ club.description }}
              </p>

              <!-- Verification status/action, owner only -->
              <div v-if="isOwner" class="mt-3">
                <span
                  v-if="club.verification_status === 'pending'"
                  class="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs text-amber-400"
                >
                  Verification requested — awaiting review
                </span>
                <button
                  v-else-if="club.verification_status !== 'verified'"
                  type="button"
                  :disabled="verificationLoading"
                  class="rounded-lg border border-[#3A5750] px-3 py-1.5 text-xs text-[#A6ABA7] hover:bg-[#2E4540] disabled:opacity-50"
                  @click="handleRequestVerification"
                >
                  {{ verificationLoading ? 'Requesting…' : 'Request Verification' }}
                </button>
                <p v-if="verificationError" class="mt-1 text-xs text-red-400">{{ verificationError }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Club Stats -->
        <div v-if="roster" class="mb-6 rounded-xl bg-[#1E2E2A] p-5">
          <h2 class="mb-3 text-sm font-medium uppercase tracking-wider text-[#6B7B75]">Club Stats</h2>
          <div class="flex gap-6 text-[#A6ABA7]">
            <span>👥 {{ roster.filter(m => m.status === 'active').length }} Members</span>
            <span>🎾 {{ clubMatches.length }}{{ clubMatches.length === 50 ? '+' : '' }} Matches</span>
            <span>📅 {{ upcomingClubEvents.length + previousClubEvents.length }} Events</span>
          </div>
        </div>

        <!-- Top Members Podium -->
        <div v-if="clubRankings.length > 0" class="mb-6 rounded-xl bg-[#1E2E2A] p-5">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="font-semibold text-white">Top Members</h2>
            <span class="text-xs text-[#6B7B75]">By singles rating</span>
          </div>
          <div class="flex items-end justify-center gap-3 pt-2">
            <template v-for="place in [2, 1, 3]" :key="place">
              <div v-if="clubRankings[place - 1]" class="flex flex-col items-center">
                <div
                  class="mb-2 flex items-center justify-center rounded-full bg-[#2E4540] font-bold ring-2"
                  :class="place === 1 ? 'h-14 w-14 text-lg text-[#F5A623] ring-[#F5A623]' : place === 2 ? 'h-11 w-11 text-sm text-[#C0C0C0] ring-[#C0C0C0]' : 'h-10 w-10 text-sm text-[#CD7F32] ring-[#CD7F32]'"
                >
                  {{ clubRankings[place - 1].display_name.charAt(0) }}
                </div>
                <p class="text-xs text-[#A6ABA7]">{{ clubRankings[place - 1].display_name }}</p>
                <p class="text-xs text-[#6B7B75]">{{ clubRankings[place - 1].rating_value?.toFixed(2) ?? '—' }}</p>
                <div
                  class="mt-2 flex w-14 items-end justify-center rounded-t-lg"
                  :class="place === 1 ? 'h-24 bg-[#F5A623]/20' : place === 2 ? 'h-16 bg-[#C0C0C0]/20' : 'h-12 bg-[#CD7F32]/20'"
                >
                  <span
                    class="mb-2 text-xl font-bold"
                    :class="place === 1 ? 'text-[#F5A623]' : place === 2 ? 'text-[#C0C0C0]' : 'text-[#CD7F32]'"
                  >
                    {{ place }}
                  </span>
                </div>
              </div>
            </template>
          </div>
          <div v-if="clubRankings.length > 3" class="mt-4 space-y-1">
            <div
              v-for="r in clubRankings.slice(3)"
              :key="r.player_id"
              class="flex items-center justify-between rounded-lg bg-[#0B0D09] px-3 py-2 text-sm"
            >
              <span class="text-[#A6ABA7]">#{{ r.rank }} {{ r.display_name }}</span>
              <span class="text-[#6B7B75]">{{ r.rating_value?.toFixed(2) ?? '—' }}</span>
            </div>
          </div>
        </div>

        <!-- Recent Club Matches -->
        <div v-if="clubMatches.length > 0" class="mb-6 rounded-xl bg-[#1E2E2A] p-5">
          <h2 class="mb-4 font-semibold text-white">Recent Club Matches</h2>
          <div class="space-y-2">
            <NuxtLink
              v-for="match in clubMatches.slice(0, 5)"
              :key="match.id"
              :to="`/matches/${match.id}`"
              class="flex items-center justify-between rounded-lg bg-[#0B0D09] p-3 hover:bg-[#2E4540]"
            >
              <div class="text-sm text-white">
                <span v-for="(p, i) in match.participants.filter(pp => pp.team_number === 1)" :key="p.player_id">
                  {{ i > 0 ? ' & ' : '' }}{{ p.display_name }}
                </span>
                <span class="mx-1 text-[#6B7B75]">vs</span>
                <span v-for="(p, i) in match.participants.filter(pp => pp.team_number === 2)" :key="p.player_id">
                  {{ i > 0 ? ' & ' : '' }}{{ p.display_name }}
                </span>
                <span class="ml-2 text-[#4DB175]">{{ formatScore(match.scores) }}</span>
              </div>
              <span class="text-xs text-[#6B7B75]">{{ new Date(match.played_at).toLocaleDateString() }}</span>
            </NuxtLink>
          </div>
        </div>

        <!-- Upcoming Events -->
        <div v-if="upcomingClubEvents.length > 0" class="mb-6 rounded-xl bg-[#1E2E2A] p-5">
          <h2 class="mb-4 font-semibold text-white">Upcoming Events</h2>
          <div class="space-y-2">
            <NuxtLink
              v-for="e in upcomingClubEvents"
              :key="e.id"
              :to="`/events/${e.id}`"
              class="flex items-center justify-between rounded-lg bg-[#0B0D09] p-3 hover:bg-[#2E4540]"
            >
              <span class="text-sm text-white">
                📅 {{ e.name }}
                <span class="text-[#6B7B75]">{{ [e.venue, e.city].filter(Boolean).join(', ') }}</span>
              </span>
              <span class="text-xs text-[#6B7B75]">{{ formatEventDate(e.start_date) }}</span>
            </NuxtLink>
          </div>
        </div>

        <!-- Previous Events -->
        <div v-if="previousClubEvents.length > 0" class="mb-6 rounded-xl bg-[#1E2E2A] p-5">
          <h2 class="mb-4 font-semibold text-white">Previous Events</h2>
          <div class="space-y-2">
            <NuxtLink
              v-for="e in previousClubEvents"
              :key="e.id"
              :to="`/events/${e.id}`"
              class="flex items-center justify-between rounded-lg bg-[#0B0D09] p-3 hover:bg-[#2E4540]"
            >
              <span class="text-sm text-[#A6ABA7]">📅 {{ e.name }}</span>
              <span class="text-xs text-[#6B7B75]">{{ formatEventDate(e.start_date) }}</span>
            </NuxtLink>
          </div>
        </div>

        <!-- Announcements -->
        <div v-if="publishedAnnouncements.length > 0" class="mb-6 rounded-xl bg-[#1E2E2A] p-5">
          <h2 class="mb-4 font-semibold text-white">Announcements</h2>
          <div class="space-y-3">
            <div
              v-for="ann in publishedAnnouncements"
              :key="ann.id"
              class="rounded-lg p-4 transition-all"
              :class="ann.pinned ? 'bg-[#F5A623]/10 ring-1 ring-[#F5A623]/30' : 'bg-[#0B0D09]'"
              @click="markAsRead(ann.id)"
            >
              <div class="flex items-start justify-between">
                <div class="flex items-center gap-2">
                  <span v-if="ann.pinned" class="text-[#F5A623]">
                    <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  </span>
                  <span class="font-medium text-white">{{ ann.title }}</span>
                </div>
                <span class="text-xs text-[#6B7B75]">{{ formatDate(ann.published_at || ann.created_at) }}</span>
              </div>
              <p class="mt-2 text-[#A6ABA7]">{{ ann.body }}</p>
              <div v-if="isStaff" class="mt-3 flex gap-3">
                <button class="text-xs text-[#4DB175] hover:underline" @click.stop="togglePin(ann.id)">
                  {{ ann.pinned ? 'Unpin' : 'Pin' }}
                </button>
                <button class="text-xs text-red-400 hover:underline" @click.stop="archiveAnnouncement(ann.id)">
                  Archive
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Draft Announcements (Staff Only) -->
        <div v-if="isStaff && draftAnnouncements.length > 0" class="mb-6 rounded-xl bg-[#1E2E2A] p-5">
          <h2 class="mb-4 font-semibold text-[#6B7B75]">Drafts</h2>
          <div class="space-y-3">
            <div
              v-for="ann in draftAnnouncements"
              :key="ann.id"
              class="rounded-lg border-2 border-dashed border-[#3A5750] p-4"
            >
              <div class="flex items-start justify-between">
                <span class="font-medium text-[#A6ABA7]">{{ ann.title }}</span>
                <span class="rounded-md bg-[#3A5750] px-2 py-0.5 text-xs text-[#6B7B75]">Draft</span>
              </div>
              <p class="mt-2 text-[#6B7B75]">{{ ann.body }}</p>
              <div class="mt-3 flex gap-3">
                <button class="text-xs text-[#4DB175] hover:underline" @click="publishAnnouncement(ann.id)">
                  Publish
                </button>
                <button class="text-xs text-red-400 hover:underline" @click="archiveAnnouncement(ann.id)">
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- New Announcement Form (Staff Only) -->
        <div v-if="isStaff" class="mb-6">
          <button
            v-if="!showAnnouncementForm"
            class="flex items-center gap-2 text-sm font-medium text-[#4DB175] hover:underline"
            @click="showAnnouncementForm = true"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            New Announcement
          </button>
          <div v-else class="rounded-xl bg-[#1E2E2A] p-5">
            <h3 class="mb-4 font-semibold text-white">Create Announcement</h3>
            <div class="mb-3">
              <label class="mb-1.5 block text-sm text-[#A6ABA7]">Title</label>
              <input
                v-model="newAnnouncement.title"
                type="text"
                placeholder="Announcement title"
                class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white placeholder-[#6B7B75] focus:border-[#4DB175] focus:outline-none"
              />
            </div>
            <div class="mb-3">
              <label class="mb-1.5 block text-sm text-[#A6ABA7]">Content</label>
              <textarea
                v-model="newAnnouncement.body"
                placeholder="Announcement content..."
                rows="3"
                class="w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white placeholder-[#6B7B75] focus:border-[#4DB175] focus:outline-none"
              />
            </div>
            <p v-if="announcementError" class="mb-3 text-sm text-red-400">{{ announcementError }}</p>
            <div class="flex gap-2">
              <button
                :disabled="creatingAnnouncement"
                class="rounded-lg bg-[#4DB175] px-4 py-2 text-sm font-medium text-white hover:bg-[#5FC287] disabled:opacity-50"
                @click="createAnnouncement"
              >
                {{ creatingAnnouncement ? 'Creating...' : 'Create Draft' }}
              </button>
              <button
                class="rounded-lg border border-[#3A5750] px-4 py-2 text-sm font-medium text-[#A6ABA7] hover:bg-[#2E4540]"
                @click="showAnnouncementForm = false"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>

        <!-- Admin Actions -->
        <div v-if="isAdmin" class="mb-6 grid gap-3 sm:grid-cols-2">
          <NuxtLink
            :to="`/matches/submit?club=${clubId}`"
            class="flex items-center justify-center gap-2 rounded-xl bg-[#4DB175] px-4 py-3 font-medium text-white hover:bg-[#5FC287]"
          >
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            Submit Match
          </NuxtLink>
          <NuxtLink
            :to="`/create-event?club=${clubId}`"
            class="flex items-center justify-center gap-2 rounded-xl border border-[#4DB175] px-4 py-3 font-medium text-[#4DB175] hover:bg-[#4DB175]/10"
          >
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Create Event
          </NuxtLink>
        </div>

        <!-- Join CTA (Non-Members) -->
        <div v-if="notAMember" class="mb-6 rounded-xl bg-[#1E2E2A] p-6 text-center">
          <h2 class="font-semibold text-white">Join This Club</h2>
          <p class="mt-1 text-[#6B7B75]">Request membership to see member roster and announcements</p>
          <div
            v-if="joinMessage"
            class="mt-4 rounded-lg bg-[#4DB175]/10 p-3 text-[#4DB175] ring-1 ring-[#4DB175]/30"
          >
            {{ joinMessage }}
          </div>
          <p v-if="joinError" class="mt-4 text-sm text-red-400">{{ joinError }}</p>
          <button
            v-if="!joinMessage"
            :disabled="joining"
            class="mt-4 rounded-lg bg-[#4DB175] px-6 py-2.5 font-medium text-white hover:bg-[#5FC287] disabled:opacity-50"
            @click="handleJoin"
          >
            {{ joining ? 'Requesting...' : 'Request to Join' }}
          </button>
        </div>

        <!-- Members List -->
        <div v-else-if="roster" class="mb-6 rounded-xl bg-[#1E2E2A] p-5">
          <h2 class="mb-4 font-semibold text-white">Members ({{ roster.length }})</h2>
          <div class="space-y-2">
            <div
              v-for="member in roster"
              :key="member.id"
              class="flex items-center justify-between rounded-lg bg-[#0B0D09] p-3"
            >
              <div class="flex items-center gap-3">
                <div class="flex h-8 w-8 items-center justify-center rounded-full bg-[#2E4540] text-sm font-bold text-[#A6ABA7]">
                  {{ member.display_name.charAt(0).toUpperCase() }}
                </div>
                <NuxtLink
                  :to="`/players/${member.player_id}`"
                  class="font-medium text-white hover:text-[#4DB175]"
                >
                  {{ member.display_name }}
                </NuxtLink>
                <span
                  class="rounded-md px-2 py-0.5 text-xs font-medium"
                  :class="roleColors[member.role] || roleColors.MEMBER"
                >
                  {{ member.role }}
                </span>
              </div>

              <div v-if="isAdmin && member.role !== 'OWNER' && member.player_id !== myProfile?.id" class="flex gap-2">
                <template v-if="member.status === 'pending'">
                  <button
                    class="rounded-lg bg-[#4DB175] px-3 py-1 text-xs font-medium text-white hover:bg-[#5FC287]"
                    @click="updateMember(member.player_id, { status: 'active' })"
                  >
                    Approve
                  </button>
                  <button
                    class="rounded-lg border border-red-400 px-3 py-1 text-xs font-medium text-red-400 hover:bg-red-400/10"
                    @click="updateMember(member.player_id, { status: 'rejected' })"
                  >
                    Reject
                  </button>
                </template>
                <button
                  v-if="member.status === 'active'"
                  class="rounded-lg border border-red-400 px-3 py-1 text-xs font-medium text-red-400 hover:bg-red-400/10"
                  @click="updateMember(member.player_id, { status: 'left' })"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>

          <button
            v-if="myMembership && myMembership.role !== 'OWNER'"
            class="mt-4 rounded-lg border border-red-400 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-400/10"
            @click="handleLeave"
          >
            Leave Club
          </button>
        </div>

        <!-- Back Link -->
        <div class="text-center">
          <NuxtLink to="/my-clubs" class="text-sm text-[#4DB175] hover:underline">
            Back to My Clubs
          </NuxtLink>
        </div>
      </template>
    </div>
  </div>
</template>
