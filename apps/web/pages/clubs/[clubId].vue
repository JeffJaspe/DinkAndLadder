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
const hasPendingRequest = ref(false)
const membershipStatus = ref<string | null>(null)

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

async function checkPendingRequest() {
  try {
    const response = await $fetch<{ pending: boolean; status: string | null }>(
      `/api/v1/clubs/${clubId.value}/membership-requests`
    )
    hasPendingRequest.value = response.pending
    membershipStatus.value = response.status
  } catch {
    hasPendingRequest.value = false
    membershipStatus.value = null
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
  checkPendingRequest()
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
  OWNER: 'bg-warning-fill text-on-accent',
  ADMIN: 'bg-accent text-on-accent',
  MODERATOR: 'bg-primary text-on-primary',
  MEMBER: 'bg-surface-3 text-fg-secondary'
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

// Split roster into pending requests and active members for admin view
const pendingRequests = computed(() =>
  roster.value?.filter((m) => m.status === 'pending') ?? []
)
const activeMembers = computed(() =>
  roster.value?.filter((m) => m.status === 'active') ?? []
)
</script>

<template>
  <div class="min-h-screen bg-canvas p-4 lg:p-6">
    <div class="page-shell">
      <!-- Loading -->
      <div v-if="clubPending" class="space-y-4">
        <div class="h-32 animate-pulse rounded-xl bg-surface" />
        <div class="h-48 animate-pulse rounded-xl bg-surface" />
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
        <NuxtLink to="/clubs" class="mt-4 inline-block text-sm text-primary hover:underline">
          Browse clubs
        </NuxtLink>
      </div>

      <template v-else-if="club">
        <!-- Header. The mockup leads with a cover photo; there is no image
             column on clubs, so this is generated from the name — see
             UiCoverArt. The logo tile overlaps the cover, as drawn. -->
        <div class="mb-6 overflow-hidden rounded-card border border-border bg-surface">
          <UiCoverArt :name="club.name" variant="banner" rounded="rounded-none" />

          <div class="flex items-start gap-4 p-6 pt-0">
            <div class="-mt-8 flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl border-4 border-surface bg-surface-2 text-2xl font-bold text-fg">
              {{ club.name.charAt(0).toUpperCase() }}
            </div>
            <div class="flex-1 pt-4">
              <div class="flex items-center gap-2">
                <h1 class="text-2xl font-bold text-fg">{{ club.name }}</h1>
                <VerifiedBadge v-if="club.verification_status === 'verified'" />
                <span
                  v-if="club.visibility === 'private'"
                  class="rounded-full bg-fg-muted/20 px-2 py-0.5 text-xs font-medium text-fg-muted"
                >
                  Private Club
                </span>
              </div>
              <p v-if="club.city || club.province || club.barangay" class="mt-1 text-fg-muted">
                {{ [club.barangay, club.city, club.province].filter(Boolean).join(', ') }}
              </p>
              <p v-if="club.description" class="mt-3 text-fg-secondary">
                {{ club.description }}
              </p>

              <!-- Court Details -->
              <div v-if="club.court_name || club.court_address" class="mt-3 rounded-lg bg-canvas p-3">
                <p v-if="club.court_name" class="text-sm font-medium text-fg">
                  🏸 {{ club.court_name }}
                </p>
                <p v-if="club.court_address" class="mt-1 text-xs text-fg-muted">
                  📍 {{ club.court_address }}
                </p>
              </div>

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
                  class="rounded-lg border border-border-strong px-3 py-1.5 text-xs text-fg-secondary hover:bg-surface-2 disabled:opacity-50"
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
        <div v-if="roster" class="mb-6 rounded-xl bg-surface p-5">
          <h2 class="mb-3 text-sm font-medium uppercase tracking-wider text-fg-muted">Club Stats</h2>
          <div class="flex gap-6 text-fg-secondary">
            <span>👥 {{ roster.filter(m => m.status === 'active').length }} Members</span>
            <span>🎾 {{ clubMatches.length }}{{ clubMatches.length === 50 ? '+' : '' }} Matches</span>
            <span>📅 {{ upcomingClubEvents.length + previousClubEvents.length }} Events</span>
          </div>
        </div>

        <!-- Top Members Podium -->
        <div v-if="clubRankings.length > 0" class="mb-6 rounded-xl bg-surface p-5">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="font-semibold text-fg">Top Members</h2>
            <span class="text-xs text-fg-muted">By singles rating</span>
          </div>
          <div class="flex items-end justify-center gap-3 pt-2">
            <template v-for="place in [2, 1, 3]" :key="place">
              <div v-if="clubRankings[place - 1]" class="flex flex-col items-center">
                <div
                  class="mb-2 flex items-center justify-center rounded-full bg-surface-2 font-bold ring-2"
                  :class="place === 1 ? 'h-14 w-14 text-lg text-warning ring-warning-fill' : place === 2 ? 'h-11 w-11 text-sm text-rating-silver ring-rating-silver' : 'h-10 w-10 text-sm text-rating-bronze ring-rating-bronze'"
                >
                  {{ clubRankings[place - 1].display_name.charAt(0) }}
                </div>
                <p class="text-xs text-fg-secondary">{{ clubRankings[place - 1].display_name }}</p>
                <p class="text-xs text-fg-muted">{{ clubRankings[place - 1].rating_value?.toFixed(2) ?? '—' }}</p>
                <div
                  class="mt-2 flex w-14 items-end justify-center rounded-t-lg"
                  :class="place === 1 ? 'h-24 bg-warning-fill/20' : place === 2 ? 'h-16 bg-rating-silver/20' : 'h-12 bg-rating-bronze/20'"
                >
                  <span
                    class="mb-2 text-xl font-bold"
                    :class="place === 1 ? 'text-warning' : place === 2 ? 'text-rating-silver' : 'text-rating-bronze'"
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
              class="flex items-center justify-between rounded-lg bg-canvas px-3 py-2 text-sm"
            >
              <span class="text-fg-secondary">#{{ r.rank }} {{ r.display_name }}</span>
              <span class="text-fg-muted">{{ r.rating_value?.toFixed(2) ?? '—' }}</span>
            </div>
          </div>
        </div>

        <!-- Recent Club Matches -->
        <div v-if="clubMatches.length > 0" class="mb-6 rounded-xl bg-surface p-5">
          <h2 class="mb-4 font-semibold text-fg">Recent Club Matches</h2>
          <div class="space-y-2">
            <NuxtLink
              v-for="match in clubMatches.slice(0, 5)"
              :key="match.id"
              :to="`/matches/${match.id}`"
              class="flex items-center justify-between rounded-lg bg-canvas p-3 hover:bg-surface-2"
            >
              <div class="text-sm text-fg">
                <span v-for="(p, i) in match.participants.filter(pp => pp.team_number === 1)" :key="p.player_id">
                  {{ i > 0 ? ' & ' : '' }}{{ p.display_name }}
                </span>
                <span class="mx-1 text-fg-muted">vs</span>
                <span v-for="(p, i) in match.participants.filter(pp => pp.team_number === 2)" :key="p.player_id">
                  {{ i > 0 ? ' & ' : '' }}{{ p.display_name }}
                </span>
                <span class="ml-2 text-primary">{{ formatScore(match.scores) }}</span>
              </div>
              <span class="text-xs text-fg-muted">{{ new Date(match.played_at).toLocaleDateString() }}</span>
            </NuxtLink>
          </div>
        </div>

        <!-- Upcoming Events -->
        <div v-if="upcomingClubEvents.length > 0" class="mb-6 rounded-xl bg-surface p-5">
          <h2 class="mb-4 font-semibold text-fg">Upcoming Events</h2>
          <div class="space-y-2">
            <NuxtLink
              v-for="e in upcomingClubEvents"
              :key="e.id"
              :to="`/events/${e.id}`"
              class="flex items-center justify-between rounded-lg bg-canvas p-3 hover:bg-surface-2"
            >
              <span class="text-sm text-fg">
                📅 {{ e.name }}
                <span class="text-fg-muted">{{ [e.venue, e.city].filter(Boolean).join(', ') }}</span>
              </span>
              <span class="text-xs text-fg-muted">{{ formatEventDate(e.start_date) }}</span>
            </NuxtLink>
          </div>
        </div>

        <!-- Previous Events -->
        <div v-if="previousClubEvents.length > 0" class="mb-6 rounded-xl bg-surface p-5">
          <h2 class="mb-4 font-semibold text-fg">Previous Events</h2>
          <div class="space-y-2">
            <NuxtLink
              v-for="e in previousClubEvents"
              :key="e.id"
              :to="`/events/${e.id}`"
              class="flex items-center justify-between rounded-lg bg-canvas p-3 hover:bg-surface-2"
            >
              <span class="text-sm text-fg-secondary">📅 {{ e.name }}</span>
              <span class="text-xs text-fg-muted">{{ formatEventDate(e.start_date) }}</span>
            </NuxtLink>
          </div>
        </div>

        <!-- Announcements -->
        <div v-if="publishedAnnouncements.length > 0" class="mb-6 rounded-xl bg-surface p-5">
          <h2 class="mb-4 font-semibold text-fg">Announcements</h2>
          <div class="space-y-3">
            <div
              v-for="ann in publishedAnnouncements"
              :key="ann.id"
              class="rounded-lg p-4 transition-all"
              :class="ann.pinned ? 'bg-warning-fill/10 ring-1 ring-warning-fill/30' : 'bg-canvas'"
              @click="markAsRead(ann.id)"
            >
              <div class="flex items-start justify-between">
                <div class="flex items-center gap-2">
                  <span v-if="ann.pinned" class="text-warning">
                    <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  </span>
                  <span class="font-medium text-fg">{{ ann.title }}</span>
                </div>
                <span class="text-xs text-fg-muted">{{ formatDate(ann.published_at || ann.created_at) }}</span>
              </div>
              <p class="mt-2 text-fg-secondary">{{ ann.body }}</p>
              <div v-if="isStaff" class="mt-3 flex gap-3">
                <button class="text-xs text-primary hover:underline" @click.stop="togglePin(ann.id)">
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
        <div v-if="isStaff && draftAnnouncements.length > 0" class="mb-6 rounded-xl bg-surface p-5">
          <h2 class="mb-4 font-semibold text-fg-muted">Drafts</h2>
          <div class="space-y-3">
            <div
              v-for="ann in draftAnnouncements"
              :key="ann.id"
              class="rounded-lg border-2 border-dashed border-border-strong p-4"
            >
              <div class="flex items-start justify-between">
                <span class="font-medium text-fg-secondary">{{ ann.title }}</span>
                <span class="rounded-md bg-surface-3 px-2 py-0.5 text-xs text-fg-muted">Draft</span>
              </div>
              <p class="mt-2 text-fg-muted">{{ ann.body }}</p>
              <div class="mt-3 flex gap-3">
                <button class="text-xs text-primary hover:underline" @click="publishAnnouncement(ann.id)">
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
            class="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            @click="showAnnouncementForm = true"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            New Announcement
          </button>
          <div v-else class="rounded-xl bg-surface p-5">
            <h3 class="mb-4 font-semibold text-fg">Create Announcement</h3>
            <div class="mb-3">
              <label class="mb-1.5 block text-sm text-fg-secondary">Title</label>
              <input
                v-model="newAnnouncement.title"
                type="text"
                placeholder="Announcement title"
                class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none"
              />
            </div>
            <div class="mb-3">
              <label class="mb-1.5 block text-sm text-fg-secondary">Content</label>
              <textarea
                v-model="newAnnouncement.body"
                placeholder="Announcement content..."
                rows="3"
                class="w-full rounded-lg border border-border-strong bg-canvas px-4 py-2.5 text-fg placeholder-fg-muted focus:border-primary focus:outline-none"
              />
            </div>
            <p v-if="announcementError" class="mb-3 text-sm text-red-400">{{ announcementError }}</p>
            <div class="flex gap-2">
              <button
                :disabled="creatingAnnouncement"
                class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
                @click="createAnnouncement"
              >
                {{ creatingAnnouncement ? 'Creating...' : 'Create Draft' }}
              </button>
              <button
                class="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-fg-secondary hover:bg-surface-2"
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
            class="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-medium text-on-primary hover:bg-primary-hover"
          >
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            Submit Match
          </NuxtLink>
          <NuxtLink
            :to="`/create-event?club=${clubId}`"
            class="flex items-center justify-center gap-2 rounded-xl border border-primary px-4 py-3 font-medium text-primary hover:bg-primary/10"
          >
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Create Event
          </NuxtLink>
        </div>

        <!-- Join CTA (Non-Members) -->
        <div v-if="notAMember" class="mb-6 rounded-xl bg-surface p-6 text-center">
          <h2 class="font-semibold text-fg">
            {{ club.visibility === 'private' ? 'Private Club' : 'Join This Club' }}
          </h2>
          <p class="mt-1 text-fg-muted">
            {{ club.visibility === 'private'
              ? 'This is a private club. Request membership to access full details.'
              : 'Request membership to see member roster and announcements' }}
          </p>

          <!-- Already has pending request -->
          <div
            v-if="hasPendingRequest"
            class="mt-4 rounded-lg bg-amber-500/10 p-3 text-amber-400 ring-1 ring-amber-500/30"
          >
            Your membership request is pending approval.
          </div>

          <!-- Request was rejected -->
          <div
            v-else-if="membershipStatus === 'rejected'"
            class="mt-4 rounded-lg bg-red-500/10 p-3 text-red-400 ring-1 ring-red-500/30"
          >
            Your membership request was declined. You may request again.
          </div>

          <!-- Success message after requesting -->
          <div
            v-else-if="joinMessage"
            class="mt-4 rounded-lg bg-primary/10 p-3 text-primary ring-1 ring-primary/30"
          >
            {{ joinMessage }}
          </div>

          <p v-if="joinError" class="mt-4 text-sm text-red-400">{{ joinError }}</p>

          <!-- Show join button only if no pending request and not just submitted -->
          <button
            v-if="!hasPendingRequest && !joinMessage"
            :disabled="joining"
            class="mt-4 rounded-lg bg-primary px-6 py-2.5 font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
            @click="handleJoin"
          >
            {{ joining ? 'Requesting...' : 'Request to Join' }}
          </button>
        </div>

        <!-- Pending Requests Section (Admins Only) -->
        <div
          v-if="roster && isAdmin && pendingRequests.length > 0"
          class="mb-6 rounded-xl bg-amber-500/10 p-5 ring-1 ring-amber-500/30"
        >
          <h2 class="mb-4 flex items-center gap-2 font-semibold text-amber-400">
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Pending Requests ({{ pendingRequests.length }})
          </h2>
          <div class="space-y-2">
            <div
              v-for="member in pendingRequests"
              :key="member.id"
              class="flex items-center justify-between rounded-lg bg-canvas p-3"
            >
              <div class="flex items-center gap-3">
                <div class="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-sm font-bold text-fg-secondary">
                  {{ member.display_name.charAt(0).toUpperCase() }}
                </div>
                <NuxtLink
                  :to="`/players/${member.player_id}`"
                  class="font-medium text-fg hover:text-primary"
                >
                  {{ member.display_name }}
                </NuxtLink>
              </div>
              <div class="flex gap-2">
                <button
                  class="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-on-primary hover:bg-primary-hover"
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
              </div>
            </div>
          </div>
        </div>

        <!-- Members List (Active Members Only) -->
        <div v-if="roster" class="mb-6 rounded-xl bg-surface p-5">
          <h2 class="mb-4 font-semibold text-fg">Members ({{ activeMembers.length }})</h2>
          <div class="space-y-2">
            <div
              v-for="member in activeMembers"
              :key="member.id"
              class="flex items-center justify-between rounded-lg bg-canvas p-3"
            >
              <div class="flex items-center gap-3">
                <div class="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-sm font-bold text-fg-secondary">
                  {{ member.display_name.charAt(0).toUpperCase() }}
                </div>
                <NuxtLink
                  :to="`/players/${member.player_id}`"
                  class="font-medium text-fg hover:text-primary"
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
                <button
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
          <NuxtLink to="/my-clubs" class="text-sm text-primary hover:underline">
            Back to My Clubs
          </NuxtLink>
        </div>
      </template>
    </div>
  </div>
</template>
