<script setup lang="ts">
import type { PlayerProfileDto } from '~/server/domains/player/dto/player-profile.dto'
import type { MatchDto } from '~/server/domains/match/dto/match.dto'

const { data: myProfile } = await useFetch<PlayerProfileDto>('/api/v1/players/me')

const matchType = ref<'singles' | 'doubles'>('singles')
const playedAt = ref('')
const venue = ref('')
const partnerId = ref('')
const opponent1Id = ref('')
const opponent2Id = ref('')
const sets = ref([{ team1Score: '', team2Score: '' }])

function addSet() {
  sets.value.push({ team1Score: '', team2Score: '' })
}

const saving = ref(false)
const errorMessage = ref('')

async function handleSubmit() {
  errorMessage.value = ''
  if (!myProfile.value) {
    errorMessage.value = 'Complete your player profile first.'
    return
  }
  saving.value = true
  try {
    const participants = [{ player_id: myProfile.value.id, team_number: 1 }]
    if (matchType.value === 'doubles') {
      participants.push({ player_id: partnerId.value, team_number: 1 })
    }
    participants.push({ player_id: opponent1Id.value, team_number: 2 })
    if (matchType.value === 'doubles') {
      participants.push({ player_id: opponent2Id.value, team_number: 2 })
    }

    const scores = sets.value.map((s, i) => ({
      set_number: i + 1,
      team1_score: Number(s.team1Score),
      team2_score: Number(s.team2Score)
    }))

    const response = await $fetch<{ data: MatchDto }>('/api/v1/matches', {
      method: 'POST',
      body: {
        match_type: matchType.value,
        played_at: new Date(playedAt.value).toISOString(),
        venue: venue.value || null,
        participants,
        scores
      }
    })
    await navigateTo(`/matches/${response.data.id}`)
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    errorMessage.value = fetchError.data?.message ?? 'Could not submit the match.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <main class="mx-auto max-w-xl px-4 py-10">
    <h1 class="text-2xl font-semibold">Submit a match</h1>
    <p class="mt-2 text-sm text-gray-500">
      There's no player search yet, so enter the other player(s)' profile IDs directly — ask them to
      share it from their own profile page's URL.
    </p>
    <form class="mt-6 flex flex-col gap-3" @submit.prevent="handleSubmit">
      <label class="flex flex-col gap-1 text-sm">
        Match type
        <select v-model="matchType" class="rounded border px-3 py-2">
          <option value="singles">Singles</option>
          <option value="doubles">Doubles</option>
        </select>
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Played at
        <input v-model="playedAt" type="datetime-local" required class="rounded border px-3 py-2" />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Venue
        <input v-model="venue" class="rounded border px-3 py-2" />
      </label>

      <template v-if="matchType === 'doubles'">
        <label class="flex flex-col gap-1 text-sm">
          Your partner's player ID
          <input v-model="partnerId" required class="rounded border px-3 py-2" />
        </label>
        <label class="flex flex-col gap-1 text-sm">
          Opponent 1 player ID
          <input v-model="opponent1Id" required class="rounded border px-3 py-2" />
        </label>
        <label class="flex flex-col gap-1 text-sm">
          Opponent 2 player ID
          <input v-model="opponent2Id" required class="rounded border px-3 py-2" />
        </label>
      </template>
      <label v-else class="flex flex-col gap-1 text-sm">
        Opponent's player ID
        <input v-model="opponent1Id" required class="rounded border px-3 py-2" />
      </label>

      <fieldset class="rounded border p-3">
        <legend class="text-sm font-medium">Set scores</legend>
        <div v-for="(set, i) in sets" :key="i" class="mt-2 flex items-center gap-2">
          <span class="text-sm">Set {{ i + 1 }}</span>
          <input
            v-model="set.team1Score"
            type="number"
            min="0"
            required
            placeholder="Your team"
            class="w-24 rounded border px-2 py-1"
          />
          <span>-</span>
          <input
            v-model="set.team2Score"
            type="number"
            min="0"
            required
            placeholder="Opponent team"
            class="w-24 rounded border px-2 py-1"
          />
        </div>
        <button type="button" class="mt-2 text-sm underline" @click="addSet">
          Add another set
        </button>
      </fieldset>

      <p v-if="errorMessage" role="alert" class="text-sm text-red-600">{{ errorMessage }}</p>
      <button
        type="submit"
        :disabled="saving"
        class="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
      >
        {{ saving ? 'Submitting…' : 'Submit match' }}
      </button>
    </form>
    <NuxtLink to="/dashboard" class="mt-4 inline-block text-sm underline"
      >Back to dashboard</NuxtLink
    >
  </main>
</template>
