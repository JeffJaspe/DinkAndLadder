<script setup lang="ts">
/**
 * A player's name, always their profile.
 *
 * Names were plain text nearly everywhere — a roster, a score sheet, a feed
 * entry, a bracket slot — and linked in about a dozen places that each rolled
 * their own `NuxtLink :to="`/players/${id}`"`. So whether you could reach
 * somebody's profile depended on which screen you happened to see them on,
 * which is not a rule anyone can learn.
 *
 * Deliberately inherits its colour and weight from whatever it sits in: the
 * name is already styled by its context (muted in a caption, bold for a
 * winner), and a blue link in the middle of a score sheet would be louder than
 * the score. The affordance is the underline on hover and the focus ring.
 *
 * Renders a plain `<span>` when there is no id — a partner recorded as a name
 * only, an entrant not yet resolved — so callers never have to branch. That is
 * the whole point: the caller says "this is a person", not "this is a link".
 *
 * NOT for names inside a picker or a form row, where a tap means "choose this
 * person" and navigating away would drop what they were filling in.
 */
const props = withDefaults(
  defineProps<{
    /** Absent means the name is all we have; it renders as text. */
    playerId?: string | null
    name?: string | null
    /** Shown when there is no name either. */
    fallback?: string
  }>(),
  { playerId: null, name: null, fallback: 'Unknown player' }
)

const label = computed(() => props.name?.trim() || props.fallback)
</script>

<template>
  <NuxtLink
    v-if="playerId"
    :to="`/players/${playerId}`"
    class="rounded-badge underline-offset-2 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
  >
    <slot>{{ label }}</slot>
  </NuxtLink>
  <span v-else>
    <slot>{{ label }}</slot>
  </span>
</template>
