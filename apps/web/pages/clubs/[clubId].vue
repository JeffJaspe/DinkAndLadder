<script setup lang="ts">
import type { ClubDto } from '~/server/domains/club/dto/club.dto'
import type { RosterMemberDto } from '~/server/domains/club/dto/club-membership.dto'
import type { PlayerProfileDto } from '~/server/domains/player/dto/player-profile.dto'

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

onMounted(loadRoster)

const myMembership = computed(
  () => roster.value?.find((m) => m.player_id === myProfile.value?.id) ?? null
)
const isAdmin = computed(
  () => myMembership.value?.role === 'OWNER' || myMembership.value?.role === 'ADMIN'
)

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
</script>

<template>
  <main class="mx-auto max-w-2xl px-4 py-10">
    <p v-if="clubPending">Loading…</p>
    <p v-else-if="clubError" role="alert" class="text-red-600">
      {{
        clubError.statusCode === 404
          ? 'This club is private or does not exist.'
          : 'Could not load this club.'
      }}
    </p>
    <template v-else-if="club">
      <h1 class="text-2xl font-semibold">{{ club.name }}</h1>
      <p v-if="club.city || club.province" class="text-sm text-gray-500">
        {{ [club.city, club.province].filter(Boolean).join(', ') }}
      </p>
      <p v-if="club.description" class="mt-4">{{ club.description }}</p>

      <div v-if="notAMember" class="mt-6">
        <p v-if="joinMessage" class="text-sm text-green-700">{{ joinMessage }}</p>
        <p v-if="joinError" role="alert" class="text-sm text-red-600">{{ joinError }}</p>
        <button
          v-if="!joinMessage"
          :disabled="joining"
          class="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
          @click="handleJoin"
        >
          {{ joining ? 'Requesting…' : 'Request to join' }}
        </button>
      </div>

      <div v-else-if="roster" class="mt-6">
        <h2 class="text-lg font-medium">Members</h2>
        <ul class="mt-2 divide-y">
          <li
            v-for="member in roster"
            :key="member.id"
            class="flex items-center justify-between py-2"
          >
            <span>
              {{ member.display_name }}
              <span class="text-xs text-gray-500">({{ member.role }}, {{ member.status }})</span>
            </span>
            <span
              v-if="isAdmin && member.role !== 'OWNER' && member.player_id !== myProfile?.id"
              class="flex gap-2"
            >
              <button
                v-if="member.status === 'pending'"
                class="text-sm underline"
                @click="updateMember(member.player_id, { status: 'active' })"
              >
                Approve
              </button>
              <button
                v-if="member.status === 'pending'"
                class="text-sm underline"
                @click="updateMember(member.player_id, { status: 'rejected' })"
              >
                Reject
              </button>
              <button
                v-if="member.status === 'active'"
                class="text-sm underline"
                @click="updateMember(member.player_id, { status: 'left' })"
              >
                Remove
              </button>
            </span>
          </li>
        </ul>
        <button
          v-if="myMembership && myMembership.role !== 'OWNER'"
          class="mt-4 rounded border px-3 py-2"
          @click="handleLeave"
        >
          Leave club
        </button>
      </div>
    </template>
    <NuxtLink to="/dashboard" class="mt-6 inline-block text-sm underline"
      >Back to dashboard</NuxtLink
    >
  </main>
</template>
