<script setup lang="ts">
import type { TournamentRegistrationWithPlayerDto } from '~/server/domains/event/dto/tournament.dto'

/**
 * Who is in this category.
 *
 * Confirmed entrants first — they are the field. Pending sits below, and only
 * for someone who can act on it: a pending row that a player cannot approve is
 * just noise about somebody else's application.
 */
defineProps<{
  confirmed: TournamentRegistrationWithPlayerDto[]
  pending: TournamentRegistrationWithPlayerDto[]
  canReview: boolean
  /** Registration currently being approved or rejected, so only its row waits. */
  reviewingId: string | null
  reviewError: string
}>()

const emit = defineEmits<{
  review: [registrationId: string, status: 'confirmed' | 'rejected']
}>()
</script>

<template>
  <div class="space-y-6">
    <section>
      <h3 class="mb-3 text-sm font-medium text-fg-secondary">
        Players<span v-if="confirmed.length" class="text-fg-muted"> · {{ confirmed.length }}</span>
      </h3>

      <ul v-if="confirmed.length" class="space-y-2">
        <li
          v-for="reg in confirmed"
          :key="reg.id"
          class="flex items-center justify-between gap-3 rounded-lg bg-canvas p-3"
        >
          <NuxtLink
            :to="`/players/${reg.player_id}`"
            class="flex min-w-0 items-center gap-3 hover:text-primary"
          >
            <UiAvatar :name="reg.display_name" size="sm" />
            <span class="min-w-0">
              <span class="block truncate text-sm font-medium text-fg">
                {{ reg.display_name }}
              </span>
              <span v-if="reg.partner_display_name" class="block truncate text-xs text-fg-muted">
                with {{ reg.partner_display_name }}
              </span>
            </span>
          </NuxtLink>
          <UiRatingBadge v-if="reg.rating != null" :rating="reg.rating" size="sm" />
          <span v-else class="text-xs text-fg-muted">Unrated</span>
        </li>
      </ul>

      <p v-else class="rounded-lg bg-canvas p-4 text-sm text-fg-muted">
        Nobody has been confirmed in this category yet.
      </p>
    </section>

    <!-- The PATCH endpoint existed long before any screen called it, so a
         pending registration could be seen and never actioned. -->
    <section v-if="canReview && pending.length">
      <!-- `text-accent` is mint in light mode and near-invisible on a surface;
           `warning` is the token that carries a "needs attention" heading in
           both themes. -->
      <h3 class="mb-3 text-sm font-medium text-warning">
        Awaiting approval · {{ pending.length }}
      </h3>
      <ul class="space-y-2">
        <li
          v-for="reg in pending"
          :key="reg.id"
          class="flex flex-wrap items-center gap-2 rounded-lg bg-canvas p-3"
        >
          <span class="min-w-0 flex-1 truncate text-sm text-fg">
            {{ reg.display_name
            }}<template v-if="reg.partner_display_name">
              &amp; {{ reg.partner_display_name }}</template
            >
          </span>
          <UiRatingBadge v-if="reg.rating != null" :rating="reg.rating" size="sm" />
          <button
            type="button"
            :disabled="reviewingId === reg.id"
            class="rounded-button bg-primary px-2.5 py-1 text-xs font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
            @click="emit('review', reg.id, 'confirmed')"
          >
            Approve
          </button>
          <button
            type="button"
            :disabled="reviewingId === reg.id"
            class="rounded-button border border-danger px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
            @click="emit('review', reg.id, 'rejected')"
          >
            Reject
          </button>
        </li>
      </ul>
      <p v-if="reviewError" role="alert" class="mt-2 text-xs text-danger">{{ reviewError }}</p>
    </section>

    <!-- A player sees only that people are waiting, not who. -->
    <p v-else-if="pending.length" class="text-xs text-fg-muted">
      {{ pending.length }} more awaiting the organiser's approval.
    </p>
  </div>
</template>
