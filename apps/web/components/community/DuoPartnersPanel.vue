<script setup lang="ts">
/**
 * Duo partners — formal partnerships, their requests, and the duo star.
 *
 * This was the standalone `/partners` page. It moved under Community's Partners
 * tab whole: same three sections, same actions, same copy. Community is where
 * every other "people" list already lives, and a top-level nav item for one
 * doubles setting was more prominence than it earned.
 *
 * A partnership here is a mutual, accepted relationship — distinct from the
 * Teammates tab next door, which is simply everyone you have played alongside.
 */
interface PartnerDto {
  player_id: string
  display_name: string
  province: string | null
  city: string | null
  singles_rating: number | null
  doubles_rating: number | null
  partnered_since: string
  is_default: boolean
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

type Section = 'partners' | 'incoming' | 'outgoing'

const section = ref<Section>('partners')

const {
  data: partnersData,
  refresh: refreshPartners,
  pending: partnersPending
} = await useFetch<{ data: PartnerDto[] }>('/api/v1/players/me/partners')

const { data: incomingData, refresh: refreshIncoming } = await useFetch<{
  data: PartnerRequestDto[]
}>('/api/v1/players/me/partner-requests/incoming')

const { data: outgoingData, refresh: refreshOutgoing } = await useFetch<{
  data: PartnerRequestDto[]
}>('/api/v1/players/me/partner-requests/outgoing')

const partners = computed(() => partnersData.value?.data ?? [])
const incomingRequests = computed(() => incomingData.value?.data ?? [])
const outgoingRequests = computed(() => outgoingData.value?.data ?? [])

const toast = useToast()

/**
 * The duo: the one partner every doubles picker pre-selects — tournament
 * registration, event queue join, and doubles match submission.
 *
 * It is a pre-fill and nothing more. Setting it never registers anyone for
 * anything; each of those screens still shows an editable partner field that
 * simply arrives already filled in.
 */
const settingDefault = ref<string | null>(null)

async function setDuo(partnerId: string | null) {
  settingDefault.value = partnerId ?? 'clear'
  try {
    await $fetch('/api/v1/players/me/default-partner', {
      method: 'PUT',
      body: { partner_id: partnerId }
    })
    await refreshPartners()
    toast.success(partnerId ? 'Duo updated.' : 'Duo cleared.')
  } catch (err) {
    toast.error(apiErrorMessage(err, 'Could not update your duo.'))
  } finally {
    settingDefault.value = null
  }
}

const removingPartner = ref<string | null>(null)
// Answering a request has to clear the badge the player followed to get here.
const { refreshPartnerRequestCount } = usePartnerRequestCount()

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
    await Promise.all([refreshPartners(), refreshIncoming(), refreshPartnerRequestCount()])
  } finally {
    acceptingRequest.value = null
  }
}

async function declineRequest(requestId: string) {
  decliningRequest.value = requestId
  try {
    await $fetch(`/api/v1/partner-requests/${requestId}/decline`, { method: 'POST' })
    await Promise.all([refreshIncoming(), refreshPartnerRequestCount()])
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
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

/**
 * A segmented control rather than a second pill bar: stacking two identical tab
 * bars read as if the tabs had broken. Same three sections, same counts.
 */
const sectionItems = computed(() => [
  { value: 'partners', label: 'My Duo Partners', count: partners.value.length },
  { value: 'incoming', label: 'Incoming', count: incomingRequests.value.length },
  { value: 'outgoing', label: 'Outgoing', count: outgoingRequests.value.length }
])
</script>

<template>
  <div>
    <p class="text-sm text-fg-muted">
      Manage your doubles partners for events. Star one as your
      <strong class="font-medium text-fg-secondary">duo</strong> and every doubles sign-up will
      pre-select them — you can still change it each time.
    </p>

    <div class="my-4 overflow-x-auto">
      <UiSegmented
        :model-value="section"
        label="Partner section"
        :items="sectionItems"
        @update:model-value="section = $event as Section"
      />
    </div>

    <!-- My Duo Partners -->
    <div v-if="section === 'partners'">
      <div v-if="partnersPending" class="flex justify-center py-12">
        <div
          class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"
        />
      </div>

      <div
        v-else-if="partners.length === 0"
        class="rounded-xl bg-surface p-8 text-center shadow-card"
      >
        <p class="text-fg-muted">No duo partners yet.</p>
        <p class="mt-2 text-sm text-fg-muted">
          Find players and send them a duo partner request to play doubles events together.
        </p>
        <NuxtLink
          to="/players"
          class="mt-4 inline-block rounded-lg bg-primary px-6 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover"
        >
          Find Players
        </NuxtLink>
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="partner in partners"
          :key="partner.player_id"
          class="flex items-center justify-between rounded-xl bg-surface p-4 shadow-card"
          :class="partner.is_default ? 'ring-1 ring-primary/40' : ''"
        >
          <NuxtLink :to="`/players/${partner.player_id}`" class="flex items-center gap-3">
            <div
              class="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-lg font-bold text-fg-secondary"
            >
              {{ partner.display_name.charAt(0).toUpperCase() }}
            </div>
            <div>
              <p class="flex items-center gap-2 font-medium text-fg hover:text-primary">
                {{ partner.display_name }}
                <span
                  v-if="partner.is_default"
                  class="rounded-pill bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary"
                  >Your duo</span
                >
              </p>
              <p class="text-sm text-fg-muted">
                <span v-if="partner.doubles_rating"
                  >{{ partner.doubles_rating.toFixed(2) }} doubles</span
                >
                <span v-else-if="partner.singles_rating"
                  >{{ partner.singles_rating.toFixed(2) }} singles</span
                >
                <span v-else>Unrated</span>
                <span class="mx-1">·</span>
                Partners since {{ formatDate(partner.partnered_since) }}
              </p>
            </div>
          </NuxtLink>
          <div class="flex shrink-0 items-center gap-2">
            <!-- One control, two directions: star an ordinary partner to make
                 them the duo, click the filled star to clear it. -->
            <button
              type="button"
              :disabled="settingDefault !== null"
              class="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              :class="
                partner.is_default
                  ? 'border-primary bg-primary-soft text-primary'
                  : 'border-border-strong text-fg-secondary hover:bg-surface-2 hover:text-fg'
              "
              :aria-pressed="partner.is_default"
              :title="
                partner.is_default
                  ? 'Clear your duo'
                  : `Set ${partner.display_name} as your default duo`
              "
              @click="setDuo(partner.is_default ? null : partner.player_id)"
            >
              <UiIcon name="star" size="h-4 w-4" />
              <span class="hidden sm:inline">
                {{ partner.is_default ? 'Duo' : 'Set as duo' }}
              </span>
            </button>
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
    </div>

    <!-- Incoming Requests -->
    <div v-else-if="section === 'incoming'">
      <div
        v-if="incomingRequests.length === 0"
        class="rounded-xl bg-surface p-8 text-center shadow-card"
      >
        <p class="text-fg-muted">No incoming partner requests.</p>
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="request in incomingRequests"
          :key="request.id"
          class="rounded-xl bg-surface p-4 shadow-card"
        >
          <div class="flex items-center justify-between">
            <NuxtLink :to="`/players/${request.from_player_id}`" class="flex items-center gap-3">
              <div
                class="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-lg font-bold text-fg-secondary"
              >
                {{ request.player?.display_name?.charAt(0).toUpperCase() ?? '?' }}
              </div>
              <div>
                <p class="font-medium text-fg hover:text-primary">
                  {{ request.player?.display_name ?? 'Unknown' }}
                </p>
                <p class="text-sm text-fg-muted">
                  {{
                    request.player?.rating
                      ? `${request.player.rating.toFixed(2)} doubles`
                      : 'Unrated'
                  }}
                  <span class="mx-1">·</span>
                  {{ formatDate(request.created_at) }}
                </p>
              </div>
            </NuxtLink>
            <div class="flex gap-2">
              <button
                :disabled="acceptingRequest === request.id"
                class="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
                @click="acceptRequest(request.id)"
              >
                {{ acceptingRequest === request.id ? 'Accepting...' : 'Accept' }}
              </button>
              <button
                :disabled="decliningRequest === request.id"
                class="rounded-lg border border-border-strong px-4 py-1.5 text-sm font-medium text-fg-secondary hover:bg-surface-2 disabled:opacity-50"
                @click="declineRequest(request.id)"
              >
                {{ decliningRequest === request.id ? 'Declining...' : 'Decline' }}
              </button>
            </div>
          </div>
          <p
            v-if="request.message"
            class="mt-3 rounded-lg bg-canvas p-3 text-sm italic text-fg-secondary"
          >
            "{{ request.message }}"
          </p>
        </div>
      </div>
    </div>

    <!-- Outgoing Requests -->
    <div v-else-if="section === 'outgoing'">
      <div
        v-if="outgoingRequests.length === 0"
        class="rounded-xl bg-surface p-8 text-center shadow-card"
      >
        <p class="text-fg-muted">No outgoing partner requests.</p>
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="request in outgoingRequests"
          :key="request.id"
          class="flex items-center justify-between rounded-xl bg-surface p-4 shadow-card"
        >
          <NuxtLink :to="`/players/${request.to_player_id}`" class="flex items-center gap-3">
            <div
              class="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-lg font-bold text-fg-secondary"
            >
              {{ request.player?.display_name?.charAt(0).toUpperCase() ?? '?' }}
            </div>
            <div>
              <p class="font-medium text-fg hover:text-primary">
                {{ request.player?.display_name ?? 'Unknown' }}
              </p>
              <p class="text-sm text-fg-muted">
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
      <NuxtLink to="/players" class="text-sm text-primary hover:underline">
        Find players to be your duo partner
      </NuxtLink>
    </div>
  </div>
</template>
