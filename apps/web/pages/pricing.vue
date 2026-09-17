<script setup lang="ts">
import type { ClubSubscriptionPlanDto } from '~/server/domains/payment/dto/subscription.dto'
import { groupPlans } from '~/utils/subscription-plan'

/**
 * Public pricing.
 *
 * Driven entirely by the public plan rows: zero plan copy lives in this file.
 * Until a SuperAdmin publishes a paid plan the page shows the free plan and
 * says, in words, that paid plans are not on sale — never a placeholder price
 * presented as fact (ADR-007 is open; CLAUDE.md §7).
 *
 * The buttons here go to the club billing page, because a plan belongs to a
 * club and a visitor may not have one yet; a signed-out visitor is bounced to
 * sign in by the club route, not by this page.
 */
useHead({ title: 'Pricing' })

const { data, pending, error, refresh } = await useFetch<{
  data: ClubSubscriptionPlanDto[]
  billing: { mode: 'off' | 'simulated' | 'live'; notice: string | null }
}>('/api/v1/platform/subscription-plans')

const groups = computed(() => groupPlans(data.value?.data ?? []))
const paidOnSale = computed(() => (data.value?.data ?? []).some((p) => !p.is_default_free))
const hasYearly = computed(() => groups.value.some((g) => g.monthly && g.yearly))
const interval = ref<'month' | 'year'>('month')
const intervalItems = [
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' }
]
function cardFor(group: ReturnType<typeof groupPlans>[number]) {
  if (interval.value === 'year' && group.yearly) return group.yearly
  return group.monthly ?? group.primary
}

const user = useSupabaseUser()
async function choose() {
  // A plan is bought for a club, from that club's billing page.
  await navigateTo(user.value ? '/my-clubs' : '/login?redirect=/pricing')
}
</script>

<template>
  <div class="page-shell min-h-screen bg-canvas p-4 lg:p-6">
    <div class="mx-auto max-w-5xl">
      <UiPageHeader to="/" back-label="Home" title="Plans for clubs" />
      <p class="mt-1 max-w-2xl text-sm text-fg-muted">
        Every club starts free. A plan is for the club, bought by its owner or an admin from the
        club's billing page.
      </p>

      <div v-if="pending" class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="i in 2" :key="i" class="h-72 animate-pulse rounded-card bg-surface" />
      </div>

      <UiErrorState
        v-else-if="error"
        class="mt-6"
        title="Could not load the plans"
        message="Please try again."
        @retry="refresh"
      />

      <template v-else>
        <div v-if="hasYearly" class="mt-6">
          <UiSegmented v-model="interval" :items="intervalItems" size="sm" label="Billing interval" />
        </div>

        <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <BillingPlanCard
            v-for="group in groups"
            :key="group.key"
            :plan="cardFor(group)"
            :saving="interval === 'year' ? group.saving : null"
            :hide-action="cardFor(group).is_default_free"
            :disabled-reason="data?.billing.mode === 'off' ? 'Not on sale right now.' : null"
            @choose="choose"
          />
        </div>

        <UiEmptyState
          v-if="!paidOnSale"
          class="mt-6"
          title="Paid plans are not on sale yet"
          message="The free plan is everything a club needs to run its first events. Paid plans will appear here when they are available."
          icon="card"
          compact
        />
      </template>
    </div>
  </div>
</template>
