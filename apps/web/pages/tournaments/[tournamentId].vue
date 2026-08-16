<script setup lang="ts">
import type { TournamentRegistrationDto } from '~/server/domains/event/dto/tournament.dto'
import type { BracketDto } from '~/server/domains/event/dto/bracket.dto'

interface RegistrationsResponse {
  registrations: TournamentRegistrationDto[]
}

const route = useRoute()
const tournamentId = route.params.tournamentId as string

const { data: bracket, pending: bracketPending, error: bracketError, refresh: refreshBracket } = await useFetch<BracketDto>(
  `/api/v1/tournaments/${tournamentId}/bracket`
)

const { data: registrationsData, pending: regPending, error: regError } = await useFetch<RegistrationsResponse>(
  `/api/v1/tournaments/${tournamentId}/registrations`
)

const registering = ref(false)
const registerError = ref('')
const registerSuccess = ref(false)

const statusConfig: Record<string, { bg: string; text: string }> = {
  pending: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  confirmed: { bg: 'bg-[#4DB175]/20', text: 'text-[#4DB175]' },
  waitlisted: { bg: 'bg-[#B5B9F0]/20', text: 'text-[#B5B9F0]' },
  cancelled: { bg: 'bg-red-500/20', text: 'text-red-400' }
}

const matchStatusConfig: Record<string, { bg: string; border: string }> = {
  pending: { bg: 'bg-[#2E4540]', border: 'border-[#3A5750]' },
  ready: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
  in_progress: { bg: 'bg-[#4DB175]/10', border: 'border-[#4DB175]/30' },
  completed: { bg: 'bg-[#4DB175]/10', border: 'border-[#4DB175]/30' },
  bye: { bg: 'bg-[#2E4540]', border: 'border-[#3A5750]' }
}

async function register() {
  registering.value = true
  registerError.value = ''
  try {
    await $fetch(`/api/v1/tournaments/${tournamentId}/registrations`, {
      method: 'POST',
      body: {}
    })
    registerSuccess.value = true
    window.location.reload()
  } catch (e: any) {
    registerError.value = e?.data?.statusMessage || 'Registration failed.'
  } finally {
    registering.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-[#0B0D09] p-4 lg:p-6">
    <div class="mx-auto max-w-4xl">
      <!-- Header -->
      <div class="mb-6">
        <h1 class="text-2xl font-bold text-white">Tournament</h1>
        <p class="mt-1 text-sm text-[#6B7B75]">View registrations and bracket</p>
      </div>

      <!-- Registration Section -->
      <div class="mb-6 rounded-xl bg-[#1E2E2A] p-5">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="font-semibold text-white">Registrations</h2>
          <span v-if="registrationsData?.registrations.length" class="text-sm text-[#6B7B75]">
            {{ registrationsData.registrations.length }} registered
          </span>
        </div>

        <!-- Loading -->
        <div v-if="regPending" class="space-y-2">
          <div v-for="i in 3" :key="i" class="h-10 w-full animate-pulse rounded-lg bg-[#2E4540]" />
        </div>

        <!-- Error -->
        <div v-else-if="regError" class="rounded-lg bg-red-500/10 p-4 text-center">
          <p class="text-red-400">Could not load registrations.</p>
        </div>

        <!-- Registrations List -->
        <div v-else-if="registrationsData?.registrations.length" class="space-y-2">
          <div
            v-for="reg in registrationsData.registrations"
            :key="reg.id"
            class="flex items-center justify-between rounded-lg bg-[#0B0D09] p-3"
          >
            <div class="flex items-center gap-3">
              <div class="flex h-8 w-8 items-center justify-center rounded-full bg-[#2E4540] text-sm font-bold text-[#A6ABA7]">
                {{ reg.player_id.charAt(0).toUpperCase() }}
              </div>
              <span class="text-sm text-white">{{ reg.player_id.slice(0, 8) }}...</span>
            </div>
            <span
              class="rounded-md px-2 py-0.5 text-xs font-medium capitalize"
              :class="statusConfig[reg.status]?.bg + ' ' + statusConfig[reg.status]?.text"
            >
              {{ reg.status }}
            </span>
          </div>
        </div>

        <!-- Empty -->
        <p v-else class="text-[#6B7B75]">No registrations yet.</p>

        <!-- Register Button -->
        <div class="mt-4">
          <button
            type="button"
            :disabled="registering"
            class="rounded-lg bg-[#4DB175] px-6 py-2.5 font-medium text-white hover:bg-[#5FC287] disabled:opacity-50"
            @click="register"
          >
            {{ registering ? 'Registering...' : 'Register for Tournament' }}
          </button>
          <p v-if="registerError" class="mt-2 text-sm text-red-400">{{ registerError }}</p>
          <p v-if="registerSuccess" class="mt-2 text-sm text-[#4DB175]">Successfully registered!</p>
        </div>
      </div>

      <!-- Bracket Section -->
      <div class="rounded-xl bg-[#1E2E2A] p-5">
        <h2 class="mb-4 font-semibold text-white">Bracket</h2>

        <!-- Loading -->
        <div v-if="bracketPending" class="flex gap-6 overflow-x-auto py-4">
          <div v-for="i in 3" :key="i" class="h-72 w-48 animate-pulse rounded-xl bg-[#2E4540]" />
        </div>

        <!-- Error -->
        <div v-else-if="bracketError" class="rounded-lg bg-red-500/10 p-4 text-center">
          <p class="text-red-400">Could not load bracket.</p>
        </div>

        <!-- Bracket Display -->
        <div v-else-if="bracket?.rounds.length" class="overflow-x-auto">
          <div class="flex gap-6 pb-4">
            <div v-for="round in bracket.rounds" :key="round.round" class="min-w-[220px] flex-shrink-0">
              <h3 class="mb-3 text-sm font-medium text-[#A6ABA7]">
                Round {{ round.round }}
              </h3>
              <div class="space-y-3">
                <div
                  v-for="match in round.matches"
                  :key="match.id"
                  class="rounded-lg border p-3"
                  :class="matchStatusConfig[match.status]?.bg + ' ' + matchStatusConfig[match.status]?.border"
                >
                  <!-- Participant 1 -->
                  <div
                    class="flex items-center justify-between rounded-md px-2 py-1"
                    :class="match.winner_registration_id === match.participant1_registration_id
                      ? 'bg-[#4DB175]/20'
                      : 'bg-[#0B0D09]'"
                  >
                    <span class="text-sm font-medium text-white">
                      {{ match.participant1_registration_id?.slice(0, 8) || 'TBD' }}
                    </span>
                    <span v-if="match.winner_registration_id === match.participant1_registration_id" class="text-xs text-[#4DB175]">
                      W
                    </span>
                  </div>

                  <div class="my-1 text-center text-xs text-[#6B7B75]">vs</div>

                  <!-- Participant 2 -->
                  <div
                    class="flex items-center justify-between rounded-md px-2 py-1"
                    :class="match.winner_registration_id === match.participant2_registration_id
                      ? 'bg-[#4DB175]/20'
                      : 'bg-[#0B0D09]'"
                  >
                    <span class="text-sm font-medium text-white">
                      {{ match.participant2_registration_id?.slice(0, 8) || 'TBD' }}
                    </span>
                    <span v-if="match.winner_registration_id === match.participant2_registration_id" class="text-xs text-[#4DB175]">
                      W
                    </span>
                  </div>

                  <!-- Status -->
                  <div class="mt-2 text-center">
                    <span class="text-xs capitalize text-[#6B7B75]">{{ match.status.replace('_', ' ') }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty -->
        <p v-else class="text-[#6B7B75]">Bracket not generated yet.</p>
      </div>

      <!-- Back Link -->
      <div class="mt-6 text-center">
        <NuxtLink to="/events" class="text-sm text-[#4DB175] hover:underline">
          Back to events
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
