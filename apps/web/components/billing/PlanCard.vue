<script setup lang="ts">
import type { ClubSubscriptionPlanDto } from '~/server/domains/payment/dto/subscription.dto'
import {
  describeEntitlements,
  formatPlanPrice,
  perMonthEquivalent,
  type AnnualSaving
} from '~/utils/subscription-plan'

/**
 * One plan, as a card.
 *
 * Three call sites — the public pricing page, the club's chooser, and the
 * SuperAdmin's live preview of an unsaved draft — and this is the only
 * component any of them render. That shared use is what makes the preview
 * trustworthy: what the admin sees IS what the club will see.
 *
 * **Every string comes from the row.** There is no plan copy in here: no
 * "most popular", no default tagline, no invented bullet. A card with nothing
 * to say says nothing, and the admin sees that gap in the preview and fills it.
 * The one exception is the entitlements table, which is derived from the typed
 * limits the code actually enforces — a bullet is a claim, a limit is a fact,
 * and the two are kept visually distinct.
 */
const props = withDefaults(
  defineProps<{
    plan: ClubSubscriptionPlanDto
    /** From `groupPlans()`; drawn under the price when set and not overridden. */
    saving?: AnnualSaving | null
    /** The club's current plan: the CTA becomes "Current plan" and disables. */
    current?: boolean
    /** Hides the CTA entirely — the public pricing page while nothing is on sale. */
    hideAction?: boolean
    /** Disables the CTA with a reason, e.g. billing is off. */
    disabledReason?: string | null
    /** Draws the limits table. Off on the compact chooser, on everywhere else. */
    showEntitlements?: boolean
  }>(),
  {
    saving: null,
    current: false,
    hideAction: false,
    disabledReason: null,
    showEntitlements: true
  }
)

const emit = defineEmits<{ choose: [plan: ClubSubscriptionPlanDto] }>()

const price = computed(() => formatPlanPrice(props.plan.price_cents, props.plan.currency))
const interval = computed(() => {
  if (props.plan.price_cents === 0) return null
  return props.plan.billing_interval === 'year' ? '/year' : '/month'
})
const perMonth = computed(() => {
  const cents = perMonthEquivalent(props.plan.price_cents, props.plan.billing_interval)
  return cents === null ? null : formatPlanPrice(cents, props.plan.currency)
})
/** The override wins; otherwise the computed saving, which cannot disagree with the prices. */
const savingLine = computed(() => props.plan.savings_label ?? props.saving?.label ?? null)
const rows = computed(() => describeEntitlements(props.plan.entitlements))
const ctaLabel = computed(() => {
  if (props.current) return 'Current plan'
  return props.plan.cta_label ?? (props.plan.price_cents === 0 ? 'Included' : 'Choose plan')
})
const ctaDisabled = computed(
  () => props.current || props.plan.is_default_free || props.disabledReason !== null
)
</script>

<template>
  <article
    class="relative flex h-full flex-col rounded-card bg-surface p-5 shadow-card"
    :class="plan.is_featured ? 'ring-2 ring-primary' : 'ring-1 ring-border'"
    :aria-label="plan.name"
  >
    <span
      v-if="plan.badge_label"
      class="absolute -top-3 left-5 rounded-pill bg-primary px-3 py-0.5 text-xs font-medium text-on-primary"
    >
      {{ plan.badge_label }}
    </span>

    <header>
      <h3 class="font-display text-heading-3 font-medium text-fg">{{ plan.name }}</h3>
      <p v-if="plan.tagline" class="mt-1 text-sm text-fg-secondary">{{ plan.tagline }}</p>
    </header>

    <div class="mt-4">
      <p class="flex items-baseline gap-1">
        <span class="font-display text-heading-1 font-medium tabular-nums text-fg">{{ price }}</span>
        <span v-if="interval" class="text-sm text-fg-muted">{{ interval }}</span>
      </p>
      <p v-if="perMonth" class="mt-0.5 text-xs tabular-nums text-fg-muted">{{ perMonth }} per month</p>
      <p v-if="savingLine" class="mt-1 text-xs font-medium text-success">{{ savingLine }}</p>
    </div>

    <p v-if="plan.description" class="mt-3 text-sm text-fg-secondary">{{ plan.description }}</p>

    <dl v-if="plan.headline_figures.length" class="mt-4 grid grid-cols-2 gap-3">
      <div
        v-for="figure in plan.headline_figures"
        :key="figure.label"
        class="rounded-lg bg-surface-2 px-3 py-2"
      >
        <dt class="text-xs text-fg-muted">{{ figure.label }}</dt>
        <dd class="font-display text-heading-3 tabular-nums text-fg">{{ figure.value }}</dd>
      </div>
    </dl>

    <ul v-if="plan.marketing_bullets.length" class="mt-4 space-y-1.5 text-sm text-fg-secondary">
      <li v-for="bullet in plan.marketing_bullets" :key="bullet" class="flex gap-2">
        <UiIcon name="check" size="h-4 w-4" class="mt-0.5 shrink-0 text-success" />
        <span>{{ bullet }}</span>
      </li>
    </ul>

    <dl
      v-if="showEntitlements"
      class="mt-4 space-y-1 border-t border-border pt-3 text-xs"
      aria-label="What this plan allows"
    >
      <div v-for="row in rows" :key="row.label" class="flex justify-between gap-3">
        <dt class="text-fg-muted">{{ row.label }}</dt>
        <dd class="text-right tabular-nums text-fg-secondary">{{ row.value }}</dd>
      </div>
    </dl>

    <div v-if="!hideAction" class="mt-auto pt-5">
      <button
        type="button"
        :disabled="ctaDisabled"
        class="w-full rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        :class="
          plan.is_featured && !ctaDisabled
            ? 'bg-primary text-on-primary hover:bg-primary-hover'
            : 'border border-border-strong text-fg-secondary hover:bg-surface-2'
        "
        @click="emit('choose', plan)"
      >
        {{ ctaLabel }}
      </button>
      <p v-if="disabledReason && !current" class="mt-2 text-center text-xs text-fg-muted">
        {{ disabledReason }}
      </p>
    </div>
  </article>
</template>
