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
</script>

<template>
  <main class="mx-auto max-w-xl px-4 py-10">
    <p v-if="pending">Loading…</p>
    <p v-else-if="error" role="alert" class="text-red-600">
      {{
        error.statusCode === 404
          ? 'This match does not exist, or you were not a participant.'
          : 'Could not load this match.'
      }}
    </p>
    <div v-else-if="match">
      <h1 class="text-2xl font-semibold">
        {{ match.match_type === 'singles' ? 'Singles' : 'Doubles' }} match
      </h1>
      <p class="text-sm text-gray-500">Status: {{ match.status }}</p>
      <p class="text-sm text-gray-500">Played: {{ new Date(match.played_at).toLocaleString() }}</p>
      <p v-if="match.venue" class="text-sm text-gray-500">Venue: {{ match.venue }}</p>

      <h2 class="mt-4 text-lg font-medium">Participants</h2>
      <ul class="mt-2 divide-y">
        <li v-for="p in match.participants" :key="p.player_id" class="py-2 text-sm">
          Team {{ p.team_number }} —
          <NuxtLink :to="`/players/${p.player_id}`" class="underline">{{ p.player_id }}</NuxtLink>
          <span class="text-xs text-gray-500">({{ p.result_status }})</span>
        </li>
      </ul>

      <h2 class="mt-4 text-lg font-medium">Scores</h2>
      <table class="mt-2 w-full text-sm">
        <thead>
          <tr class="text-left text-gray-500">
            <th>Set</th>
            <th>Team 1</th>
            <th>Team 2</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in match.scores" :key="s.set_number">
            <td>{{ s.set_number }}</td>
            <td>{{ s.team1_score }}</td>
            <td>{{ s.team2_score }}</td>
          </tr>
        </tbody>
      </table>

      <h2 class="mt-4 text-lg font-medium">Verification</h2>
      <p v-if="match.verifications.length === 0" class="text-sm text-gray-500">
        Verification has not started yet.
      </p>
      <ul v-else class="mt-2 divide-y">
        <li v-for="v in match.verifications" :key="v.verifier_player_id" class="py-2 text-sm">
          <NuxtLink :to="`/players/${v.verifier_player_id}`" class="underline">{{
            v.verifier_player_id
          }}</NuxtLink>
          <span class="text-xs text-gray-500">({{ v.status }})</span>
          <span v-if="v.response_note" class="block text-xs text-gray-500">{{
            v.response_note
          }}</span>
        </li>
      </ul>

      <p v-if="actionMessage" class="mt-3 text-sm text-green-700">{{ actionMessage }}</p>
      <p v-if="actionError" role="alert" class="mt-3 text-sm text-red-600">{{ actionError }}</p>

      <button
        v-if="canInitiate"
        :disabled="acting"
        class="mt-3 rounded bg-black px-3 py-2 text-white disabled:opacity-50"
        @click="startVerification"
      >
        {{ acting ? 'Starting…' : 'Start verification' }}
      </button>

      <div v-if="canDecide" class="mt-3 space-y-2">
        <textarea
          v-model="note"
          placeholder="Optional note"
          class="w-full rounded border px-2 py-1 text-sm"
          rows="2"
        />
        <div class="flex gap-2">
          <button
            :disabled="acting"
            class="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
            @click="recordDecision('confirmed')"
          >
            Confirm
          </button>
          <button
            :disabled="acting"
            class="rounded border px-3 py-2 text-sm disabled:opacity-50"
            @click="recordDecision('rejected')"
          >
            Reject
          </button>
          <button
            :disabled="acting"
            class="rounded border px-3 py-2 text-sm disabled:opacity-50"
            @click="recordDecision('disputed')"
          >
            Dispute
          </button>
        </div>
      </div>
    </div>
    <NuxtLink to="/dashboard" class="mt-6 inline-block text-sm underline"
      >Back to dashboard</NuxtLink
    >
  </main>
</template>
