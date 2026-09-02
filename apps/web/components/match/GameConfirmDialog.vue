<script setup lang="ts">
/**
 * "Game 2 complete — is this the final score?"
 *
 * The confirmation the scoresheet mockup puts on the point that ends a game.
 * The scorer is at a court with a phone, watching a rally; closing a game
 * silently on the tap that qualified meant a mis-tap ended a game and opened
 * the next one before they could look up. This shows the score they are about
 * to commit, names the side taking the game, and offers a way back.
 *
 * It deliberately shows only the closing game, not the whole sheet — the
 * question is "did I read that right", and the sheet is already on screen
 * behind it.
 *
 * Built on UiModal for its focus trap and Escape handling; Escape and the
 * backdrop both mean "No, go back", which is the safe direction.
 */
const props = defineProps<{
  modelValue: boolean
  /** Zero-based index of the game that just closed. */
  gameIndex: number
  /** Players per side, one name per line. Index 0 is team 1. */
  teams: [string[], string[]]
  team1Score: number
  team2Score: number
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
  confirm: []
  cancel: []
}>()

/**
 * Which side took it.
 *
 * Read straight off the two numbers rather than from the rules: this dialog is
 * only ever opened for a game that has already met them, so the higher score is
 * the winner by definition here.
 */
const winningSide = computed<1 | 2>(() => (props.team1Score > props.team2Score ? 1 : 2))

const winnerName = computed(() => props.teams[winningSide.value - 1].join(' / '))
</script>

<template>
  <UiModal
    :model-value="modelValue"
    :title="`Is this the final score?`"
    hide-actions
    @update:model-value="emit('update:modelValue', $event)"
    @cancel="emit('cancel')"
  >
    <p class="text-caption font-medium uppercase tracking-wide text-fg-muted">
      Game {{ gameIndex + 1 }} complete
    </p>

    <div class="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      <div
        v-for="side in [1, 2] as const"
        :key="side"
        :class="[
          side === 2 ? 'order-3' : '',
          'rounded-card border p-3 text-center',
          winningSide === side
            ? 'border-primary bg-primary-soft'
            : 'border-border bg-surface-2 text-fg-muted'
        ]"
      >
        <span
          v-for="name in teams[side - 1]"
          :key="name"
          class="block truncate text-body-2 font-medium"
          :class="winningSide === side ? 'text-fg' : 'text-fg-muted'"
        >
          {{ name }}
        </span>
        <span class="mt-1 block font-mono text-3xl font-bold tabular-nums">
          {{ side === 1 ? team1Score : team2Score }}
        </span>
      </div>

      <span class="order-2 text-lg text-fg-muted" aria-hidden="true">–</span>
    </div>

    <p class="mt-3 text-body-2 text-fg-secondary">
      <strong class="font-medium text-fg">{{ winnerName }}</strong> takes game
      {{ gameIndex + 1 }}.
    </p>

    <div class="mt-4 flex flex-wrap gap-2">
      <UiButton @click="emit('confirm')">Yes, record this game</UiButton>
      <UiButton variant="secondary" @click="emit('cancel')">No, go back</UiButton>
    </div>

    <p class="mt-3 text-caption text-fg-muted">
      Going back restores the score to what it was before the last point.
    </p>
  </UiModal>
</template>
