<script setup lang="ts">
interface PartnerDto {
  player_id: string
  display_name: string
  province: string | null
  city: string | null
  singles_rating: number | null
  doubles_rating: number | null
  partnered_since: string
}

interface PartnerRequestDto {
  id: string
  from_player_id: string
  to_player_id: string
  status: string
  message: string | null
  created_at: string
  player?: {
    id: string
    display_name: string
    rating?: number | null
  }
}

const activeTab = ref<'partners' | 'incoming' | 'outgoing'>('partners')

const {
  data: partnersData,
  refresh: refreshPartners,
  pending: partnersPending
} = await useFetch<{ data: PartnerDto[] }>('/api/v1/players/me/partners')

const {
  data: incomingData,
  refresh: refreshIncoming
} = await useFetch<{ data: PartnerRequestDto[] }>('/api/v1/players/me/partner-requests/incoming')

const {
  data: outgoingData,
  refresh: refreshOutgoing
} = await useFetch<{ data: PartnerRequestDto[] }>('/api/v1/players/me/partner-requests/outgoing')

const partners = computed(() => partnersData.value?.data ?? [])
const incomingRequests = computed(() => incomingData.value?.data ?? [])
const outgoingRequests = computed(() => outgoingData.value?.data ?? [])

const removingPartner = ref<string | null>(null)
const acceptingRequest = ref<string | null>(null)
const decliningRequest = ref<string | null>(null)
const cancellingRequest = ref<string | null>(null)

async function removePartner(partnerId: string) {
  removingPartner.value = partnerId
  try {
    await $fetch(`/api/v1/players/me/partners/${partnerId}`, { method: 'DELETE' })
    await refreshPartners()
  } finally {
    removingPartner.value = null
  }
}

async function acceptRequest(requestId: string) {
  acceptingRequest.value = requestId
  try {
    await $fetch(`/api/v1/partner-requests/${requestId}/accept`, { method: 'POST' })
    await Promise.all([refreshPartners(), refreshIncoming()])
  } finally {
    acceptingRequest.value = null
  }
}

async function declineRequest(requestId: string) {
  decliningRequest.value = requestId
  try {
    await $fetch(`/api/v1/partner-requests/${requestId}/decline`, { method: 'POST' })
    await refreshIncoming()
  } finally {
    decliningRequest.value = null
  }
}

async function cancelRequest(requestId: string) {
  cancellingRequest.value = requestId
  try {
    await $fetch(`/api/v1/partner-requests/${requestId}`, { method: 'DELETE' })
    await refreshOutgoing()
  } finally {
    cancellingRequest.value = null
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
</script>

<template>
  <div class="min-h-screen bg-[#0B0D09] p-4 lg:p-6">
    <div class="mx-auto max-w-2xl">
      <h1 class="text-2xl font-bold text-white">Duo Partners</h1>
      <p class="mt-1 text-sm text-[#6B7B75]">Manage your doubles partners for events</p>

      <!-- Tabs -->
      <div class="my-6 flex gap-1 rounded-xl bg-[#1E2E2A] p-1">
        <button
          class="flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          :class="activeTab === 'partners' ? 'bg-[#4DB175] text-white' : 'text-[#6B7B75] hover:text-white'"
          @click="activeTab = 'partners'"
        >
          My Duo Partners ({{ partners.length }})
        </button>
        <button
          class="flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          :class="activeTab === 'incoming' ? 'bg-[#4DB175] text-white' : 'text-[#6B7B75] hover:text-white'"
          @click="activeTab = 'incoming'"
        >
          Incoming ({{ incomingRequests.length }})
        </button>
        <button
          class="flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          :class="activeTab === 'outgoing' ? 'bg-[#4DB175] text-white' : 'text-[#6B7B75] hover:text-white'"
          @click="activeTab = 'outgoing'"
        >
          Outgoing ({{ outgoingRequests.length }})
        </button>
      </div>

      <!-- Partners Tab -->
      <div v-if="activeTab === 'partners'">
        <div v-if="partnersPending" class="flex justify-center py-12">
          <div class="h-8 w-8 animate-spin rounded-full border-4 border-[#4DB175] border-t-transparent" />
        </div>

        <div v-else-if="partners.length === 0" class="rounded-xl bg-[#1E2E2A] p-8 text-center">
          <p class="text-[#6B7B75]">No duo partners yet.</p>
          <p class="mt-2 text-sm text-[#6B7B75]">
            Find players and send them a duo partner request to play doubles events together.
          </p>
          <NuxtLink
            to="/players"
            class="mt-4 inline-block rounded-lg bg-[#4DB175] px-6 py-2 text-sm font-medium text-white hover:bg-[#5FC287]"
          >
            Find Players
          </NuxtLink>
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="partner in partners"
            :key="partner.player_id"
            class="flex items-center justify-between rounded-xl bg-[#1E2E2A] p-4"
          >
            <NuxtLink :to="`/players/${partner.player_id}`" class="flex items-center gap-3">
              <div class="flex h-12 w-12 items-center justify-center rounded-full bg-[#2E4540] text-lg font-bold text-[#A6ABA7]">
                {{ partner.display_name.charAt(0).toUpperCase() }}
              </div>
              <div>
                <p class="font-medium text-white hover:text-[#4DB175]">{{ partner.display_name }}</p>
                <p class="text-sm text-[#6B7B75]">
                  <span v-if="partner.doubles_rating">{{ partner.doubles_rating.toFixed(2) }} doubles</span>
                  <span v-else-if="partner.singles_rating">{{ partner.singles_rating.toFixed(2) }} singles</span>
                  <span v-else>Unrated</span>
                  <span class="mx-1">·</span>
                  Partners since {{ formatDate(partner.partnered_since) }}
                </p>
              </div>
            </NuxtLink>
            <button
              :disabled="removingPartner === partner.player_id"
              class="rounded-lg border border-red-400 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-400/10 disabled:opacity-50"
              @click="removePartner(partner.player_id)"
            >
              {{ removingPartner === partner.player_id ? 'Removing...' : 'Remove' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Incoming Requests Tab -->
      <div v-else-if="activeTab === 'incoming'">
        <div v-if="incomingRequests.length === 0" class="rounded-xl bg-[#1E2E2A] p-8 text-center">
          <p class="text-[#6B7B75]">No incoming partner requests.</p>
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="request in incomingRequests"
            :key="request.id"
            class="rounded-xl bg-[#1E2E2A] p-4"
          >
            <div class="flex items-center justify-between">
              <NuxtLink :to="`/players/${request.from_player_id}`" class="flex items-center gap-3">
                <div class="flex h-12 w-12 items-center justify-center rounded-full bg-[#2E4540] text-lg font-bold text-[#A6ABA7]">
                  {{ request.player?.display_name?.charAt(0).toUpperCase() ?? '?' }}
                </div>
                <div>
                  <p class="font-medium text-white hover:text-[#4DB175]">{{ request.player?.display_name ?? 'Unknown' }}</p>
                  <p class="text-sm text-[#6B7B75]">
                    {{ request.player?.rating ? `${request.player.rating.toFixed(2)} doubles` : 'Unrated' }}
                    <span class="mx-1">·</span>
                    {{ formatDate(request.created_at) }}
                  </p>
                </div>
              </NuxtLink>
              <div class="flex gap-2">
                <button
                  :disabled="acceptingRequest === request.id"
                  class="rounded-lg bg-[#4DB175] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#5FC287] disabled:opacity-50"
                  @click="acceptRequest(request.id)"
                >
                  {{ acceptingRequest === request.id ? 'Accepting...' : 'Accept' }}
                </button>
                <button
                  :disabled="decliningRequest === request.id"
                  class="rounded-lg border border-[#3A5750] px-4 py-1.5 text-sm font-medium text-[#A6ABA7] hover:bg-[#2E4540] disabled:opacity-50"
                  @click="declineRequest(request.id)"
                >
                  {{ decliningRequest === request.id ? 'Declining...' : 'Decline' }}
                </button>
              </div>
            </div>
            <p v-if="request.message" class="mt-3 rounded-lg bg-[#0B0D09] p-3 text-sm italic text-[#A6ABA7]">
              "{{ request.message }}"
            </p>
          </div>
        </div>
      </div>

      <!-- Outgoing Requests Tab -->
      <div v-else-if="activeTab === 'outgoing'">
        <div v-if="outgoingRequests.length === 0" class="rounded-xl bg-[#1E2E2A] p-8 text-center">
          <p class="text-[#6B7B75]">No outgoing partner requests.</p>
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="request in outgoingRequests"
            :key="request.id"
            class="flex items-center justify-between rounded-xl bg-[#1E2E2A] p-4"
          >
            <NuxtLink :to="`/players/${request.to_player_id}`" class="flex items-center gap-3">
              <div class="flex h-12 w-12 items-center justify-center rounded-full bg-[#2E4540] text-lg font-bold text-[#A6ABA7]">
                {{ request.player?.display_name?.charAt(0).toUpperCase() ?? '?' }}
              </div>
              <div>
                <p class="font-medium text-white hover:text-[#4DB175]">{{ request.player?.display_name ?? 'Unknown' }}</p>
                <p class="text-sm text-[#6B7B75]">
                  Pending
                  <span class="mx-1">·</span>
                  Sent {{ formatDate(request.created_at) }}
                </p>
              </div>
            </NuxtLink>
            <button
              :disabled="cancellingRequest === request.id"
              class="rounded-lg border border-red-400 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-400/10 disabled:opacity-50"
              @click="cancelRequest(request.id)"
            >
              {{ cancellingRequest === request.id ? 'Cancelling...' : 'Cancel' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Find Players Link -->
      <div class="mt-8 text-center">
        <NuxtLink to="/players" class="text-sm text-[#4DB175] hover:underline">
          Find players to be your duo partner
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
