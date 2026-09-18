<script setup lang="ts">
import type { ClubSubscriptionPlanDto } from '~/server/domains/payment/dto/subscription.dto'
import { groupPlans } from '~/utils/subscription-plan'

/**
 * The pricing table: every public plan as a joined column, separated by
 * hairlines. No Monthly / Annually switch — a yearly plan is its own column
 * beside its monthly twin, so both prices are on the page at once and nothing
 * is hidden behind a toggle.
 *
 * A yearly column still shows its saving against the monthly twin (or the
 * admin's override label), computed from the two prices so it can never
 * disagree with them. Owns no data: pages pass the plans and decide what the
 * button does.
 */
const props = withDefaults(
  defineProps<{
    plans: ClubSubscriptionPlanDto[]
    currentPlanId?: string | null
    /** True when the club is on the free tier and the free column should read as current. */
    onFreeTier?: boolean
    hideAction?: boolean
    disabledReason?: string | null
    caption?: string | null
    showEntitlements?: boolean
  }>(),
  {
    currentPlanId: null,
    onFreeTier: false,
    hideAction: false,
    disabledReason: null,
    caption: null,
    showEntitlements: true
  }
)

const emit = defineEmits<{ choose: [plan: ClubSubscriptionPlanDto] }>()

/** The saving a yearly plan advertises, looked up through its group. */
const savingById = computed(() => {
  const map = new Map<string, ReturnType<typeof groupPlans>[number]['saving']>()
  for (const g of groupPlans(props.plans)) {
    if (g.yearly) map.set(g.yearly.id, g.saving)
  }
  return map
})

function isCurrent(plan: ClubSubscriptionPlanDto) {
  return plan.id === props.currentPlanId || (plan.is_default_free && props.onFreeTier)
}

const columns = computed(() => Math.min(Math.max(props.plans.length, 1), 4))
</script>

<template>
  <div
    class="mx-auto grid overflow-hidden rounded-card bg-surface shadow-card ring-1 ring-border"
    :class="{
      'max-w-sm': columns === 1,
      'max-w-3xl sm:grid-cols-2': columns === 2,
      'sm:grid-cols-2 lg:grid-cols-3': columns === 3,
      'sm:grid-cols-2 xl:grid-cols-4': columns === 4
    }"
  >
    <div
      v-for="(plan, i) in plans"
      :key="plan.id"
      class="relative"
      :class="{ 'border-t border-border sm:border-t-0 sm:border-l': i > 0 }"
    >
      <BillingPlanCard
        :plan="plan"
        :saving="savingById.get(plan.id) ?? null"
        :current="isCurrent(plan)"
        :hide-action="hideAction"
        :disabled-reason="disabledReason"
        :caption="plan.price_cents === 0 ? null : caption"
        :show-entitlements="showEntitlements"
        :standalone="false"
        @choose="emit('choose', $event)"
      />
    </div>
  </div>
</template>
