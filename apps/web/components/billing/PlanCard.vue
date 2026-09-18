<script setup lang="ts">
import type { ClubSubscriptionPlanDto } from '~/server/domains/payment/dto/subscription.dto'
import { describeLimit, type AnnualSaving } from '~/utils/subscription-plan'

/**
 * One plan, as a pricing-table column.
 *
 * Three call sites — the public pricing page, the club's chooser, and the
 * SuperAdmin's live preview of an unsaved draft — and this is the only
 * component any of them render. That shared use is what makes the preview
 * trustworthy: what the admin sees IS what the club will see.
 *
 * The shape is the classic three-column table: name, a big price in a soft
 * pill with the currency and period stacked beside it, a one-line subline,
 * the button, a caption under it, then "What's included" as a check list.
 * `BillingPlanTable` joins several of these with hairline dividers; alone it
 * is a single card.
 *
 * **Every string comes from the row.** There is no plan copy in here: no
 * "most popular", no default tagline, no invented bullet. The one exception
 * is the entitlements list, derived from the typed limits the code actually
 * enforces — a bullet is a claim, a limit is a fact, and both are shown as
 * check rows because to a club owner they are the same kind of promise.
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
    /** The small line under the button, e.g. "(nothing is charged in test mode)". Page-owned. */
    caption?: string | null
    /** Appends the enforced limits to the check list. Off on a compact chooser. */
    showEntitlements?: boolean
    /** Standalone card chrome (shadow, rounding). Off inside a table. */
    standalone?: boolean
  }>(),
  {
    saving: null,
    current: false,
    hideAction: false,
    disabledReason: null,
    caption: null,
    showEntitlements: true,
    standalone: true
  }
)

const emit = defineEmits<{ choose: [plan: ClubSubscriptionPlanDto] }>()

/**
 * The price split into the parts the pill sets separately: the big whole
 * number, and the currency code + period stacked beside it. Minor units are
 * dropped on purpose — "39 USD /mo." not "39.00" — unless the price has them,
 * in which case they stay so a ₱499.50 plan is not shown as ₱499.
 */
const priceParts = computed(() => {
  const cents = props.plan.price_cents
  const whole = Math.floor(cents / 100)
  const minor = cents % 100
  return {
    whole: whole.toLocaleString('en-PH'),
    minor: minor === 0 ? null : String(minor).padStart(2, '0'),
    code: props.plan.currency.toUpperCase(),
    period: props.plan.billing_interval === 'year' ? '/yr.' : '/mo.'
  }
})
/** The override wins; otherwise the computed saving, which cannot disagree with the prices. */
const savingLine = computed(() => props.plan.savings_label ?? props.saving?.label ?? null)

const included = computed<{ text: string; sub?: string }[]>(() => {
  const rows: { text: string; sub?: string }[] = props.plan.marketing_bullets.map((text) => ({ text }))
  if (props.showEntitlements) {
    const e = props.plan.entitlements
    // The enforced limits, phrased the way a club owner would say them. A
    // feature the plan does not include is simply not listed: a check mark
    // beside "Not included" is a lie.
    rows.push(
      { text: describeLimit(e.max_draft_events, 'draft event') },
      { text: describeLimit(e.max_live_tournaments, 'live tournament') },
      { text: describeLimit(e.max_live_open_play, 'live open play session') },
      { text: describeLimit(e.max_members, 'member') }
    )
    if (e.online_fee_collection) rows.push({ text: 'Online entry fees' })
    if (e.verified_badge_eligible) rows.push({ text: 'Verified badge', sub: 'Eligible to apply — a reviewer still approves it' })
  }
  return rows
})

const ctaLabel = computed(() => {
  if (props.current) return 'Current plan'
  return props.plan.cta_label ?? (props.plan.price_cents === 0 ? 'Included' : 'Choose plan')
})
const ctaDisabled = computed(
  () => props.current || props.plan.is_default_free || props.disabledReason !== null
)
const ctaPrimary = computed(() => props.plan.price_cents > 0 && !ctaDisabled.value)
</script>

<template>
  <article
    class="relative flex h-full flex-col items-center bg-surface px-6 pb-8 pt-10 text-center"
    :class="standalone ? 'rounded-card shadow-card ring-1 ring-border' : ''"
    :aria-label="plan.name"
  >
    <span
      v-if="plan.badge_label"
      class="absolute left-1/2 top-3 -translate-x-1/2 rounded-pill bg-primary px-3 py-0.5 text-caption font-medium text-on-primary"
    >
      {{ plan.badge_label }}
    </span>

    <h3 class="font-display text-heading-2 font-medium text-fg">{{ plan.name }}</h3>

    <!-- The price pill -->
    <div class="mt-6 inline-flex items-center gap-1.5 rounded-pill bg-surface-2 px-8 py-3">
      <span class="font-display text-[2.75rem] font-semibold leading-none tabular-nums text-fg">
        {{ priceParts.whole }}<span v-if="priceParts.minor" class="text-[1.25rem]">.{{ priceParts.minor }}</span>
      </span>
      <span class="flex flex-col items-start leading-none">
        <span class="text-label uppercase tracking-wide text-fg">{{ priceParts.code }}</span>
        <span class="font-display text-heading-3 font-semibold text-fg">{{ priceParts.period }}</span>
      </span>
    </div>

    <p
      v-if="plan.tagline"
      class="mt-2 text-body-2 text-fg-secondary underline decoration-border-strong decoration-dotted underline-offset-4"
    >
      {{ plan.tagline }}
    </p>
    <p v-if="savingLine" class="mt-1 text-caption font-medium text-success">{{ savingLine }}</p>

    <template v-if="!hideAction">
      <button
        type="button"
        :disabled="ctaDisabled"
        class="mt-6 w-full max-w-[13rem] rounded-button px-4 py-2.5 text-body-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        :class="
          ctaPrimary
            ? 'bg-primary text-on-primary hover:bg-primary-hover'
            : 'border border-border-strong text-fg hover:bg-surface-2'
        "
        @click="emit('choose', plan)"
      >
        {{ ctaLabel }}
      </button>
      <p v-if="disabledReason && !current" class="mt-2 text-caption text-fg-muted">{{ disabledReason }}</p>
      <p v-else-if="caption" class="mt-2 text-caption text-fg-muted">{{ caption }}</p>
    </template>

    <p v-if="plan.description" class="mt-5 max-w-[24ch] text-body-2 text-fg-secondary">{{ plan.description }}</p>

    <dl v-if="plan.headline_figures.length" class="mt-5 grid w-full grid-cols-2 gap-2">
      <div v-for="figure in plan.headline_figures" :key="figure.label" class="rounded-badge bg-surface-2 px-3 py-2">
        <dd class="font-display text-heading-3 tabular-nums text-fg">{{ figure.value }}</dd>
        <dt class="text-caption text-fg-muted">{{ figure.label }}</dt>
      </div>
    </dl>

    <div v-if="included.length" class="mt-8 w-full text-left">
      <p class="text-center text-body-2 text-fg-muted">What's included:</p>
      <ul class="mx-auto mt-4 max-w-[17rem] space-y-3" aria-label="What this plan includes">
        <li v-for="(row, i) in included" :key="i" class="flex items-start gap-3">
          <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-primary">
            <UiIcon name="check" size="h-3 w-3" :stroke-width="3" />
          </span>
          <span class="text-body-2 leading-snug text-fg">
            {{ row.text }}
            <span v-if="row.sub" class="block text-caption text-fg-muted">{{ row.sub }}</span>
          </span>
        </li>
      </ul>
    </div>
  </article>
</template>
