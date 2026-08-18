<script setup lang="ts">
import type { MatchDto } from '~/server/domains/match/dto/match.dto'
import type { PlayerProfileDto } from '~/server/domains/player/dto/player-profile.dto'

const route = useRoute()
const matchId = computed(() => route.params.matchId as string)

const {
  data: match,
  pending,
  error,
  refresh
} = await useFetch<MatchDto>(() => `/api/v1/matches/${matchId.value}`)

const { data: myProfile } = await useFetch<PlayerProfileDto>('/api/v1/players/me')

const actionError = ref('')
const actionMessage = ref('')
const acting = ref(false)
const note = ref('')

const isParticipant = computed(
  () =>
    !!myProfile.value &&
    !!match.value?.participants.some((p) => p.player_id === myProfile.value!.id)
)
const myVerification = computed(
  () => match.value?.verifications.find((v) => v.verifier_player_id === myProfile.value?.id) ?? null
)
const canInitiate = computed(() => isParticipant.value && match.value?.status === 'submitted')
const canDecide = computed(
  () => match.value?.status === 'pending_verification' && myVerification.value?.status === 'pending'
)
const isSinglesMatch = computed(() => match.value?.participants.length === 2)
const canCounter = computed(
  () =>
    isSinglesMatch.value &&
    isParticipant.value &&
    (match.value?.status === 'submitted' || match.value?.status === 'pending_verification')
)

const showCounterForm = ref(false)
const counterSets = ref([{ team1Score: '', team2Score: '' }])

function addCounterSet() {
  if (counterSets.value.length < 5) counterSets.value.push({ team1Score: '', team2Score: '' })
}

function removeCounterSet(index: number) {
  if (counterSets.value.length > 1) counterSets.value.splice(index, 1)
}

const canSubmitCounter = computed(() =>
  counterSets.value.every((s) => s.team1Score !== '' && s.team2Score !== '')
)

async function submitCounter() {
  actionError.value = ''
  actionMessage.value = ''
  if (!canSubmitCounter.value) {
    actionError.value = 'Enter a score for every set.'
    return
  }
  acting.value = true
  try {
    await $fetch(`/api/v1/matches/${matchId.value}/counter`, {
      method: 'POST',
      body: {
        scores: counterSets.value.map((s, i) => ({
          set_number: i + 1,
          team1_score: Number(s.team1Score),
          team2_score: Number(s.team2Score)
        }))
      }
    })
    actionMessage.value = 'Your proposed score was recorded. The match is now marked disputed for review.'
    showCounterForm.value = false
    counterSets.value = [{ team1Score: '', team2Score: '' }]
    await refresh()
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    actionError.value = fetchError.data?.message ?? 'Could not propose a different score.'
  } finally {
    acting.value = false
  }
}

const statusConfig: Record<string, { bg: string; text: string }> = {
  submitted: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  pending_verification: { bg: 'bg-[#B5B9F0]/20', text: 'text-[#B5B9F0]' },
  verified: { bg: 'bg-[#4DB175]/20', text: 'text-[#4DB175]' },
  disputed: { bg: 'bg-red-500/20', text: 'text-red-400' },
  cancelled: { bg: 'bg-[#3A5750]', text: 'text-[#6B7B75]' }
}

async function startVerification() {
  actionError.value = ''
  actionMessage.value = ''
  acting.value = true
  try {
    await $fetch(`/api/v1/matches/${matchId.value}/verification`, { method: 'POST' })
    actionMessage.value = 'Verification started.'
    await refresh()
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    actionError.value = fetchError.data?.message ?? 'Could not start verification.'
  } finally {
    acting.value = false
  }
}

async function recordDecision(status: 'confirmed' | 'rejected' | 'disputed') {
  actionError.value = ''
  actionMessage.value = ''
  acting.value = true
  try {
    await $fetch(`/api/v1/matches/${matchId.value}/verification/decision`, {
      method: 'POST',
      body: { status, response_note: note.value || null }
    })
    actionMessage.value = 'Your decision was recorded.'
    note.value = ''
    await refresh()
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    actionError.value = fetchError.data?.message ?? 'Could not record your decision.'
  } finally {
    acting.value = false
  }
}

function getTeamPlayers(teamNumber: number) {
  return match.value?.participants.filter(p => p.team_number === teamNumber) ?? []
}

function getTeamScore(setNumber: number, teamNumber: number) {
  const score = match.value?.scores.find(s => s.set_number === setNumber)
  return teamNumber === 1 ? score?.team1_score : score?.team2_score
}

function didTeamWinSet(setNumber: number, teamNumber: number): boolean {
  const score = match.value?.scores.find(s => s.set_number === setNumber)
  if (!score) return false
  if (teamNumber === 1) return score.team1_score > score.team2_score
  return score.team2_score > score.team1_score
}
</script>

<template>
  <div class="min-h-screen bg-[#0B0D09] p-4 lg:p-6">
    <div class="mx-auto max-w-2xl">
      <!-- Loading -->
      <div v-if="pending" class="space-y-4">
        <div class="h-32 animate-pulse rounded-xl bg-[#1E2E2A]" />
        <div class="h-48 animate-pulse rounded-xl bg-[#1E2E2A]" />
      </div>

      <!-- Error -->
      <div
        v-else-if="error"
        class="rounded-xl bg-red-500/10 p-6 text-center"
      >
        <p class="text-red-400">
          {{
            error.statusCode === 404
              ? 'This match does not exist, or you were not a participant.'
              : 'Could not load this match.'
          }}
        </p>
        <NuxtLink to="/dashboard" class="mt-4 inline-block text-sm text-[#4DB175] hover:underline">
          Back to dashboard
        </NuxtLink>
      </div>

      <!-- Match Details -->
      <div v-else-if="match">
        <!-- Header -->
        <div class="mb-6 flex items-start justify-between">
          <div>
            <h1 class="text-2xl font-bold text-white">
              {{ match.match_type === 'singles' ? 'Singles' : 'Doubles' }} Match
            </h1>
            <p class="mt-1 text-[#6B7B75]">
              {{ new Date(match.played_at).toLocaleDateString() }} at {{ new Date(match.played_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
            </p>
            <p v-if="match.venue" class="text-sm text-[#6B7B75]">{{ match.venue }}</p>
          </div>
          <span
            class="rounded-md px-3 py-1 text-sm font-medium capitalize"
            :class="statusConfig[match.status]?.bg + ' ' + statusConfig[match.status]?.text"
          >
            {{ match.status.replace('_', ' ') }}
          </span>
        </div>

        <!-- Score Card -->
        <div class="mb-6 rounded-xl bg-[#1E2E2A] p-5">
          <div class="flex items-center justify-between gap-4">
            <!-- Team 1 -->
            <div class="flex-1 text-center">
              <div class="space-y-1">
                <NuxtLink
                  v-for="p in getTeamPlayers(1)"
                  :key="p.player_id"
                  :to="`/players/${p.player_id}`"
                  class="block text-sm font-medium text-[#4DB175] hover:underline"
                >
                  {{ p.player_id === myProfile?.id ? 'You' : p.player_id.slice(0, 8) }}
                </NuxtLink>
              </div>
            </div>

            <!-- Sets -->
            <div class="flex items-center gap-2">
              <div
                v-for="s in match.scores"
                :key="s.set_number"
                class="flex flex-col items-center rounded-lg bg-[#0B0D09] px-3 py-2"
              >
                <span class="text-xs text-[#6B7B75]">Set {{ s.set_number }}</span>
                <div class="flex items-center gap-1 text-lg font-bold">
                  <span :class="didTeamWinSet(s.set_number, 1) ? 'text-[#4DB175]' : 'text-[#A6ABA7]'">
                    {{ s.team1_score }}
                  </span>
                  <span class="text-[#6B7B75]">-</span>
                  <span :class="didTeamWinSet(s.set_number, 2) ? 'text-[#4DB175]' : 'text-[#A6ABA7]'">
                    {{ s.team2_score }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Team 2 -->
            <div class="flex-1 text-center">
              <div class="space-y-1">
                <NuxtLink
                  v-for="p in getTeamPlayers(2)"
                  :key="p.player_id"
                  :to="`/players/${p.player_id}`"
                  class="block text-sm font-medium text-[#4DB175] hover:underline"
                >
                  {{ p.player_id === myProfile?.id ? 'You' : p.player_id.slice(0, 8) }}
                </NuxtLink>
              </div>
            </div>
          </div>
        </div>

        <!-- Verification Status -->
        <div class="mb-6 rounded-xl bg-[#1E2E2A] p-5">
          <h2 class="mb-4 font-semibold text-white">Verification</h2>

          <div v-if="match.verifications.length === 0" class="text-center">
            <p class="text-[#6B7B75]">Verification has not started yet.</p>
            <button
              v-if="canInitiate"
              :disabled="acting"
              class="mt-4 rounded-lg bg-[#4DB175] px-6 py-2 font-medium text-white hover:bg-[#5FC287] disabled:opacity-50"
              @click="startVerification"
            >
              {{ acting ? 'Starting...' : 'Start Verification' }}
            </button>
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="v in match.verifications"
              :key="v.verifier_player_id"
              class="flex items-center justify-between rounded-lg bg-[#0B0D09] p-3"
            >
              <div class="flex items-center gap-3">
                <div class="flex h-8 w-8 items-center justify-center rounded-full bg-[#2E4540] text-sm font-bold text-[#A6ABA7]">
                  {{ v.verifier_player_id.charAt(0).toUpperCase() }}
                </div>
                <NuxtLink
                  :to="`/players/${v.verifier_player_id}`"
                  class="text-sm font-medium text-[#4DB175] hover:underline"
                >
                  {{ v.verifier_player_id === myProfile?.id ? 'You' : v.verifier_player_id.slice(0, 8) }}
                </NuxtLink>
              </div>
              <span
                class="rounded-md px-2 py-0.5 text-xs font-medium capitalize"
                :class="{
                  'bg-yellow-500/20 text-yellow-400': v.status === 'pending',
                  'bg-[#4DB175]/20 text-[#4DB175]': v.status === 'confirmed',
                  'bg-red-500/20 text-red-400': v.status === 'rejected' || v.status === 'disputed'
                }"
              >
                {{ v.status }}
              </span>
            </div>
          </div>
        </div>

        <!-- Decision Form -->
        <div v-if="canDecide" class="mb-6 rounded-xl bg-[#1E2E2A] p-5">
          <h2 class="mb-4 font-semibold text-white">Your Decision</h2>
          <p class="mb-4 text-sm text-[#6B7B75]">
            Please verify the match details above and confirm or dispute.
          </p>
          <textarea
            v-model="note"
            placeholder="Add an optional note..."
            class="mb-4 w-full rounded-lg border border-[#3A5750] bg-[#0B0D09] px-4 py-2.5 text-white placeholder-[#6B7B75] focus:border-[#4DB175] focus:outline-none"
            rows="2"
          />
          <div class="flex gap-2">
            <button
              :disabled="acting"
              class="flex-1 rounded-lg bg-[#4DB175] py-2.5 font-medium text-white hover:bg-[#5FC287] disabled:opacity-50"
              @click="recordDecision('confirmed')"
            >
              Confirm
            </button>
            <button
              :disabled="acting"
              class="flex-1 rounded-lg border border-red-400 py-2.5 font-medium text-red-400 hover:bg-red-400/10 disabled:opacity-50"
              @click="recordDecision('rejected')"
            >
              Reject
            </button>
            <button
              :disabled="acting"
              class="flex-1 rounded-lg border border-yellow-400 py-2.5 font-medium text-yellow-400 hover:bg-yellow-400/10 disabled:opacity-50"
              @click="recordDecision('disputed')"
            >
              Dispute
            </button>
          </div>
        </div>

        <!-- Counter-Proposal -->
        <div v-if="canCounter" class="mb-6 rounded-xl bg-[#1E2E2A] p-5">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="font-semibold text-white">Disagree with the score?</h2>
            <button
              v-if="!showCounterForm"
              type="button"
              class="text-sm text-yellow-400 hover:underline"
              @click="showCounterForm = true"
            >
              Propose Different Score
            </button>
          </div>

          <div v-if="showCounterForm" class="space-y-3">
            <p class="text-sm text-[#6B7B75]">
              This records your proposed score and marks the match disputed for organizer review.
            </p>
            <div
              v-for="(set, i) in counterSets"
              :key="i"
              class="flex items-center gap-3 rounded-lg bg-[#0B0D09] p-3"
            >
              <span class="w-14 text-sm text-[#6B7B75]">Set {{ i + 1 }}</span>
              <div class="flex flex-1 items-center gap-2">
                <input
                  v-model="set.team1Score"
                  type="number"
                  min="0"
                  placeholder="T1"
                  class="w-full rounded-lg border border-[#3A5750] bg-[#1E2E2A] px-3 py-2 text-center text-white focus:border-[#4DB175] focus:outline-none"
                />
                <span class="text-[#6B7B75]">-</span>
                <input
                  v-model="set.team2Score"
                  type="number"
                  min="0"
                  placeholder="T2"
                  class="w-full rounded-lg border border-[#3A5750] bg-[#1E2E2A] px-3 py-2 text-center text-white focus:border-[#4DB175] focus:outline-none"
                />
              </div>
              <button
                v-if="counterSets.length > 1"
                type="button"
                class="text-[#6B7B75] hover:text-red-400"
                @click="removeCounterSet(i)"
              >
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <button
              v-if="counterSets.length < 5"
              type="button"
              class="text-sm text-[#4DB175] hover:underline"
              @click="addCounterSet"
            >
              + Add Set
            </button>
            <div class="flex gap-2 pt-2">
              <button
                type="button"
                :disabled="acting"
                class="flex-1 rounded-lg border border-yellow-400 py-2.5 font-medium text-yellow-400 hover:bg-yellow-400/10 disabled:opacity-50"
                @click="submitCounter"
              >
                {{ acting ? 'Submitting...' : 'Submit Proposed Score' }}
              </button>
              <button
                type="button"
                class="rounded-lg border border-[#3A5750] px-4 py-2.5 text-[#A6ABA7] hover:bg-[#2E4540]"
                @click="showCounterForm = false"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>

        <!-- Score Proposal History -->
        <div v-if="match.score_proposals.length > 0" class="mb-6 rounded-xl bg-[#1E2E2A] p-5">
          <h2 class="mb-4 font-semibold text-white">Proposed Scores</h2>
          <div class="space-y-3">
            <div
              v-for="proposal in match.score_proposals"
              :key="proposal.id"
              class="rounded-lg bg-[#0B0D09] p-3"
            >
              <div class="mb-2 flex items-center justify-between">
                <span class="text-sm text-[#A6ABA7]">
                  Round {{ proposal.proposal_round }} by
                  {{ proposal.proposed_by_player_id === myProfile?.id ? 'you' : proposal.proposed_by_player_id.slice(0, 8) }}
                </span>
                <span class="rounded-md bg-yellow-500/20 px-2 py-0.5 text-xs font-medium capitalize text-yellow-400">
                  {{ proposal.status }}
                </span>
              </div>
              <div class="flex gap-2 text-sm text-white">
                <span v-for="s in proposal.scores" :key="s.set_number" class="rounded bg-[#2E4540] px-2 py-1">
                  {{ s.team1_score }}-{{ s.team2_score }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Messages -->
        <div
          v-if="actionMessage"
          class="mb-6 rounded-xl bg-[#4DB175]/10 p-4 text-center text-[#4DB175] ring-1 ring-[#4DB175]/30"
        >
          {{ actionMessage }}
        </div>
        <div v-if="actionError" class="mb-6 rounded-xl bg-red-500/10 p-4 text-red-400">
          {{ actionError }}
        </div>

        <!-- Back Link -->
        <div class="text-center">
          <NuxtLink to="/dashboard" class="text-sm text-[#4DB175] hover:underline">
            Back to dashboard
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>
