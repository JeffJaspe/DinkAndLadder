<script setup lang="ts">
/**
 * A player: their face, their name, and always their profile.
 *
 * Names were plain text nearly everywhere — a roster, a score sheet, a feed
 * entry, a bracket slot — and linked in about a dozen places that each rolled
 * their own hand-written link to `/players/:id`. So whether you could reach
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
 *
 * ── The avatar ──────────────────────────────────────────────────────────────
 *
 * `avatar` puts the player's face before the name, sized for the row it sits
 * in: `xs` in a bracket slot or score sheet, `sm` in a list, `md` in a card.
 * Off by default, because a name inside a running sentence ("verified by Ana
 * Lim") should stay a name.
 *
 * The avatar is keyed by `playerId`, so a photoless player gets their own
 * generated gradient rather than the shared brand mark — sixteen identical
 * logos down a bracket is the reason this prop exists. See
 * `utils/avatar-identity.ts` for how that colour is derived and why the
 * initials stay above AA on every hue it can produce.
 *
 * Only the NAME carries the hover underline. Underlining a 24px circle draws a
 * line under the image, which reads as damage rather than as a link.
 */
const props = withDefaults(
  defineProps<{
    /** Absent means the name is all we have; it renders as text. */
    playerId?: string | null
    name?: string | null
    /** Shown when there is no name either. */
    fallback?: string
    /** Show the player's avatar before the name. */
    avatar?: boolean
    /** Match it to the row: xs in dense tables, sm in lists, md in cards. */
    avatarSize?: 'xs' | 'sm' | 'md'
    /** A resolved avatar URL, for the callers that happen to have one. */
    avatarUrl?: string | null
  }>(),
  {
    playerId: null,
    name: null,
    fallback: 'Unknown player',
    avatar: false,
    avatarSize: 'sm',
    avatarUrl: null
  }
)

const label = computed(() => props.name?.trim() || props.fallback)

/** Gap scales with the avatar so the pair reads as one object at every size. */
const gapClass = computed(() =>
  props.avatarSize === 'xs' ? 'gap-1.5' : props.avatarSize === 'md' ? 'gap-3' : 'gap-2'
)
</script>

<template>
  <NuxtLink
    v-if="playerId"
    :to="`/players/${playerId}`"
    class="rounded-badge underline-offset-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    :class="avatar ? ['group inline-flex min-w-0 items-center', gapClass] : 'hover:underline'"
  >
    <UiAvatar
      v-if="avatar"
      :name="label"
      :src="avatarUrl"
      :identity-key="playerId"
      :size="avatarSize"
    />
    <span :class="avatar ? 'min-w-0 truncate group-hover:underline' : ''">
      <slot>{{ label }}</slot>
    </span>
  </NuxtLink>

  <span v-else :class="avatar ? ['inline-flex min-w-0 items-center', gapClass] : ''">
    <!-- No id: still a person and still gets a face, there is just nowhere to
         send them. The gradient keys off the name so the row stays stable. -->
    <UiAvatar
      v-if="avatar"
      :name="label"
      :src="avatarUrl"
      :identity-key="name || null"
      :size="avatarSize"
    />
    <span :class="avatar ? 'min-w-0 truncate' : ''">
      <slot>{{ label }}</slot>
    </span>
  </span>
</template>
