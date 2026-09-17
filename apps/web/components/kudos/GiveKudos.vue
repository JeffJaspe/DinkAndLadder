<script setup lang="ts">
import { KUDOS_SKILL_META, KUDOS_SKILLS } from '~/server/domains/kudos/dto/kudos.dto'
import type { KudosSkill } from '~/server/domains/kudos/dto/kudos.dto'

/**
 * Credit an opponent with one skill for this match.
 *
 * Shown only to somebody who played, only on a recorded result, and only for
 * the players on the other side — all decided by the server
 * (`GET /matches/:id/kudos`) so this component renders what it is told rather
 * than re-deriving the eligibility rules and eventually disagreeing with them.
 *
 * Six skills, laid out as a grid you read in one pass. No free text and no
 * rating: the whole value of the tally on a profile is that it is countable,
 * and the moment somebody can write their own label it stops being.
 *
 * There is no undo, and the copy says so before you commit rather than after.
 */
const props = defineProps<{
  matchId: string
  /** Display names by player id, for naming the opponent. */
  players: Record<string, string>
}>()

interface KudosState {
  eligible: { player_id: string }[]
  given: { to_player_id: string; skill: string }[]
  unavailable_reason: string | null
}

const { data, refresh } = await useFetch<{ data: KudosState }>(
  () => `/api/v1/matches/${props.matchId}/kudos`,
  {
    server: false,
    ignoreResponseError: true,
    default: () => ({ data: { eligible: [], given: [], unavailable_reason: null } })
  }
)

const eligible = computed(() => data.value?.data?.eligible ?? [])
const given = computed(() => data.value?.data?.given ?? [])
const reason = computed(() => data.value?.data?.unavailable_reason ?? null)

const skills = KUDOS_SKILLS.map((skill) => KUDOS_SKILL_META[skill])

/** Which opponent the picker is open for, or null when it is closed. */
const openFor = ref<string | null>(null)
const saving = ref(false)
const error = ref('')

function nameOf(playerId: string): string {
  return props.players[playerId] ?? 'your opponent'
}

function labelOfSkill(skill: string): string {
  return KUDOS_SKILL_META[skill as KudosSkill]?.label ?? skill
}

function iconOfSkill(skill: string): string {
  return KUDOS_SKILL_META[skill as KudosSkill]?.icon ?? '👏'
}

async function give(playerId: string, skill: KudosSkill) {
  saving.value = true
  error.value = ''
  try {
    await $fetch(`/api/v1/matches/${props.matchId}/kudos`, {
      method: 'POST',
      body: { to_player_id: playerId, skill }
    })
    openFor.value = null
    await refresh()
  } catch (err) {
    error.value = apiErrorMessage(err, 'Could not record the kudos.')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <!-- Nothing to say: not a participant, nobody left to credit, and nothing
       already given. Rendering an empty panel here would be noise on every
       match page somebody is only reading. -->
  <section v-if="reason || eligible.length || given.length" class="mt-6">
    <h2 class="font-display text-heading-3 text-fg">Kudos</h2>

    <p v-if="reason" class="mt-1 text-body-2 text-fg-muted">{{ reason }}</p>
    <p v-else class="mt-1 max-w-prose text-body-2 text-fg-secondary">
      Credit one thing your opponent did well. One per opponent, and it cannot be taken back.
    </p>

    <p v-if="error" role="alert" class="mt-3 text-body-2 text-danger">{{ error }}</p>

    <!-- Already given. Shown as a plain record, not as a control: the whole
         point is that it is settled. -->
    <ul v-if="given.length" class="mt-3">
      <li
        v-for="entry in given"
        :key="entry.to_player_id"
        class="flex items-center gap-2 border-t border-border py-2 text-body-2 text-fg-secondary first:border-t-0 first:pt-0"
      >
        <span class="text-base" aria-hidden="true">{{ iconOfSkill(entry.skill) }}</span>
        <span>
          You credited {{ nameOf(entry.to_player_id) }}'s
          <span class="font-medium text-fg">{{ labelOfSkill(entry.skill) }}</span>
        </span>
      </li>
    </ul>

    <div v-for="opponent in eligible" :key="opponent.player_id" class="mt-3">
      <button
        v-if="openFor !== opponent.player_id"
        type="button"
        class="rounded-button border border-border-strong px-4 py-2 text-body-2 font-medium text-fg-secondary transition-colors hover:border-primary hover:text-fg"
        @click="openFor = opponent.player_id"
      >
        Give {{ nameOf(opponent.player_id) }} kudos
      </button>

      <div v-else class="rounded-card border border-border bg-surface-2 p-4">
        <div class="flex items-baseline justify-between gap-4">
          <p class="text-body-2 font-medium text-fg">
            What did {{ nameOf(opponent.player_id) }} do well?
          </p>
          <button
            type="button"
            class="text-caption text-fg-muted underline-offset-2 hover:text-fg hover:underline"
            @click="openFor = null"
          >
            Cancel
          </button>
        </div>

        <!-- Two columns at every width. Six items in one column is a list to
             scroll; in two it is a shape you take in at once, and these are
             short labels. -->
        <ul class="mt-3 grid grid-cols-2 gap-2">
          <li v-for="skill in skills" :key="skill.id">
            <button
              type="button"
              class="flex h-full w-full items-start gap-2 rounded-button border border-border bg-surface p-3 text-left transition-colors hover:border-primary disabled:opacity-60"
              :disabled="saving"
              @click="give(opponent.player_id, skill.id)"
            >
              <span class="text-lg leading-none" aria-hidden="true">{{ skill.icon }}</span>
              <span class="min-w-0">
                <span class="block text-body-2 font-medium text-fg">{{ skill.label }}</span>
                <span class="block text-caption text-fg-muted">{{ skill.hint }}</span>
              </span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
