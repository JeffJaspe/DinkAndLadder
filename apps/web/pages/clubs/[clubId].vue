<script setup lang="ts">
import type { ClubDto } from '~/server/domains/club/dto/club.dto'
import type { RosterMemberDto } from '~/server/domains/club/dto/club-membership.dto'
import type { PlayerProfileDto } from '~/server/domains/player/dto/player-profile.dto'
import type { AnnouncementDto } from '~/server/domains/announcement/dto/announcement.dto'

const route = useRoute()
const clubId = computed(() => route.params.clubId as string)

const {
  data: club,
  pending: clubPending,
  error: clubError
} = await useFetch<ClubDto>(() => `/api/v1/clubs/${clubId.value}`)

const { data: myProfile } = await useFetch<PlayerProfileDto>('/api/v1/players/me')

const roster = ref<RosterMemberDto[] | null>(null)
const notAMember = ref(false)
const joinMessage = ref('')
const joinError = ref('')
const joining = ref(false)

const announcements = ref<AnnouncementDto[]>([])

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

onMounted(() => {
  loadRoster()
  loadAnnouncements()
})

const myMembership = computed(
  () => roster.value?.find((m) => m.player_id === myProfile.value?.id) ?? null
)
const isAdmin = computed(
  () => myMembership.value?.role === 'OWNER' || myMembership.value?.role === 'ADMIN'
)
const isStaff = computed(
  () => ['OWNER', 'ADMIN', 'MODERATOR'].includes(myMembership.value?.role ?? '')
)

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
              <h1 class="text-2xl font-bold text-white">{{ club.name }}</h1>
              <p v-if="club.city || club.province" class="mt-1 text-[#6B7B75]">
                {{ [club.city, club.province].filter(Boolean).join(', ') }}
              </p>
              <p v-if="club.description" class="mt-3 text-[#A6ABA7]">
                {{ club.description }}
              </p>
            </div>
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
