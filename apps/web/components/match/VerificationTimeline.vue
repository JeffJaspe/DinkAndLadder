<script setup lang="ts">
/**
 * Match Details verification timeline.
 *
 * docs/33 §5.6 calls this the most important element in the mockups, and the
 * reason is not decoration: match verification is the trust mechanism the whole
 * platform rests on (docs/12). An auditable, visible chain of who did what and
 * when is what makes a disputed result resolvable instead of a shouting match.
 *
 * Every step is derived from stored facts — `created_at`, each verification's
 * `responded_at`, and the match's rating transactions. Nothing here is
 * synthesised: a step that has not happened yet is simply absent, and the
 * pending step is rendered as pending rather than guessed at.
 */
import type { IconName } from '~/utils/icons'

export interface RatingChange {
  player_id: string
  display_name: string
  rating_delta: number
  new_rating: number
}

export interface TimelineVerification {
  verifier_player_id: string
  verifier_name?: string | null
  status: string
  response_note: string | null
  responded_at: string | null
}

const props = withDefaults(
  defineProps<{
    submittedAt: string
    submittedByName?: string | null
    status: string
    verifications: TimelineVerification[]
    ratingChanges?: RatingChange[]
    ratedAt?: string | null
  }>(),
  { submittedByName: null, ratingChanges: () => [], ratedAt: null }
)

interface Step {
  key: string
  title: string
  by: string | null
  at: string | null
  icon: IconName
  tone: 'done' | 'pending' | 'bad'
  note?: string | null
  changes?: RatingChange[]
}

const steps = computed<Step[]>(() => {
  const out: Step[] = []

  out.push({
    key: 'submitted',
    title: 'Match submitted',
    by: props.submittedByName ? `by ${props.submittedByName}` : null,
    at: props.submittedAt,
    icon: 'edit',
    tone: 'done'
  })

  const answered = props.verifications.filter((v) => v.responded_at)
  const waiting = props.verifications.filter((v) => !v.responded_at)

  if (props.verifications.length) {
    out.push({
      key: 'review',
      title: 'Under review',
      by: `${props.verifications.length} ${props.verifications.length === 1 ? 'verifier' : 'verifiers'} asked to confirm`,
      // The review step begins when the first verifier is asked, which is the
      // submission itself — there is no separate stored timestamp for it.
      at: props.submittedAt,
      icon: 'clock',
      tone: answered.length === props.verifications.length ? 'done' : 'pending'
    })
  }

  for (const v of answered) {
    const rejected = v.status === 'rejected' || v.status === 'disputed'
    out.push({
      key: `v-${v.verifier_player_id}`,
      title: rejected ? (v.status === 'disputed' ? 'Disputed' : 'Rejected') : 'Confirmed',
      by: v.verifier_name ? `by ${v.verifier_name}` : null,
      at: v.responded_at,
      icon: rejected ? 'alert' : 'check',
      tone: rejected ? 'bad' : 'done',
      note: v.response_note
    })
  }

  for (const v of waiting) {
    out.push({
      key: `w-${v.verifier_player_id}`,
      title: 'Awaiting confirmation',
      by: v.verifier_name ? `from ${v.verifier_name}` : null,
      at: null,
      icon: 'clock',
      tone: 'pending'
    })
  }

  // Both sides of the swing, per the mockup. Seeing that the engine is
  // symmetric is what pre-empts most disputes.
  if (props.ratingChanges.length) {
    out.push({
      key: 'rated',
      title: 'Ratings updated',
      by: null,
      at: props.ratedAt ?? null,
      icon: 'trophy',
      tone: 'done',
      changes: props.ratingChanges
    })
  }

  return out
})

const TONE = {
  done: { ring: 'bg-success/15 text-success', line: 'bg-success/30' },
  pending: { ring: 'bg-warning/15 text-warning', line: 'bg-border' },
  bad: { ring: 'bg-danger/15 text-danger', line: 'bg-danger/30' }
} as const

function absolute(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

/** Mockup timestamps are all relative; the absolute value stays on hover. */
function relative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return absolute(iso)
}
</script>

<template>
  <ol class="relative space-y-0">
    <li v-for="(step, i) in steps" :key="step.key" class="relative flex gap-3 pb-5 last:pb-0">
      <!-- Connector, drawn behind the marker and stopped on the last step. -->
      <span
        v-if="i < steps.length - 1"
        class="absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-px"
        :class="TONE[step.tone].line"
        aria-hidden="true"
      />

      <span
        class="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        :class="TONE[step.tone].ring"
      >
        <UiIcon :name="step.icon" size="h-4 w-4" :stroke-width="2" />
      </span>

      <div class="min-w-0 flex-1 pt-1">
        <p class="flex flex-wrap items-baseline gap-x-2">
          <span class="text-body-2 font-medium text-fg">{{ step.title }}</span>
          <time
            v-if="step.at"
            class="text-caption text-fg-muted"
            :datetime="step.at"
            :title="absolute(step.at)"
          >
            {{ relative(step.at) }}
          </time>
          <span v-else class="text-caption text-fg-muted">pending</span>
        </p>

        <p v-if="step.by" class="text-caption text-fg-secondary">{{ step.by }}</p>
        <p
          v-if="step.note"
          class="mt-1 rounded-button bg-surface-2 px-2 py-1 text-caption text-fg-secondary"
        >
          “{{ step.note }}”
        </p>

        <ul v-if="step.changes" class="mt-2 space-y-1">
          <li
            v-for="change in step.changes"
            :key="change.player_id"
            class="flex items-center justify-between gap-3 rounded-button bg-surface-2 px-2.5 py-1.5"
          >
            <span class="truncate text-caption text-fg">{{ change.display_name }}</span>
            <span class="flex items-baseline gap-2 whitespace-nowrap">
              <UiTrendIndicator :value="change.rating_delta" size="sm" />
              <span class="text-caption tabular-nums text-fg-muted"
                >→ {{ change.new_rating.toFixed(3) }}</span
              >
            </span>
          </li>
        </ul>
      </div>
    </li>
  </ol>
</template>
