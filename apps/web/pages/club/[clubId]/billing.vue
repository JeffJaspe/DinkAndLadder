<script setup lang="ts">
import type { ClubDto } from '~/server/domains/club/dto/club.dto'
import type { ClubBillingDto, CheckoutResultDto } from '~/server/domains/payment/dto/club-billing.dto'
import type { ClubSubscriptionPlanDto } from '~/server/domains/payment/dto/subscription.dto'
import { groupPlans } from '~/utils/subscription-plan'
import { apiErrorMessage } from '~/utils/api-error-message'

/**
 * The club's plan: what it allows, what the club is using, and what it could
 * buy instead.
 *
 * The meters read the SAME `ClubEntitlements` the server refuses against — the
 * response of `/subscription` is the resolver's output, not a client-side
 * recomputation — so the number here can never disagree with the 409 the
 * create-event page shows.
 *
 * When only the free plan is public, the chooser says so in words rather than
 * showing a placeholder price as fact: the paid tier's price is an open
 * decision (ADR-007), and this page must not settle it by rendering it.
 */
const route = useRoute()
const clubId = route.params.clubId as string

const { data: club } = await useFetch<ClubDto>(`/api/v1/clubs/${clubId}`)
useHead({ title: () => (club.value ? `${club.value.name} — Billing & plan` : 'Billing & plan') })

const {
  data: billing,
  pending,
  error,
  refresh
} = await useFetch<ClubBillingDto>(`/api/v1/clubs/${clubId}/subscription`)

const { data: plansData } = await useFetch<{
  data: ClubSubscriptionPlanDto[]
  billing: { mode: 'off' | 'simulated' | 'live'; notice: string | null }
}>('/api/v1/platform/subscription-plans')

const forbidden = computed(() => (error.value as { statusCode?: number })?.statusCode === 403)

const ORIGIN_SENTENCE: Record<string, string> = {
  plan: 'Because the club has this plan.',
  default_plan: 'Every club starts here. Nothing to pay.',
  verified_override:
    'Unlimited because a platform administrator verified this club. No plan is needed.',
  fallback: 'No plan could be read, so the safe default applies. Nothing has been taken away.'
}

const ent = computed(() => billing.value?.entitlements ?? null)
const usage = computed(() => billing.value?.usage ?? null)
const sub = computed(() => billing.value?.subscription ?? null)
const onPaidPlan = computed(() => ent.value?.origin === 'plan')

const groups = computed(() => groupPlans(plansData.value?.data ?? []))
const paidPublic = computed(() => (plansData.value?.data ?? []).some((p) => !p.is_default_free))
const billingMode = computed(() => billing.value?.billing.mode ?? plansData.value?.billing.mode ?? 'off')
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
const disabledReason = computed(() =>
  billingMode.value === 'off' ? 'Plans cannot be purchased right now.' : null
)

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}

// Checkout
const checkoutOpen = ref(false)
const checkoutPlan = ref<ClubSubscriptionPlanDto | null>(null)
const checkoutBusy = ref(false)
const checkoutError = ref<string | null>(null)
const toast = useToast()

function choose(plan: ClubSubscriptionPlanDto) {
  checkoutPlan.value = plan
  checkoutError.value = null
  checkoutOpen.value = true
}

async function confirmCheckout(payload: { plan_id: string; voucher_code: string | null }) {
  checkoutBusy.value = true
  checkoutError.value = null
  try {
    const result = await $fetch<CheckoutResultDto>(`/api/v1/clubs/${clubId}/subscription/checkout`, {
      method: 'POST',
      body: payload,
      headers: { 'Idempotency-Key': crypto.randomUUID() }
    })
    await refresh()
    checkoutOpen.value = false
    toast.success(
      result.verification_requested
        ? `${checkoutPlan.value?.name} is active. The club is now in the verification queue.`
        : `${checkoutPlan.value?.name} is active.`
    )
  } catch (err) {
    checkoutError.value = apiErrorMessage(err, 'Could not activate the plan.')
  } finally {
    checkoutBusy.value = false
  }
}

// Cancel
const cancelOpen = ref(false)
const cancelBusy = ref(false)
const cancelError = ref('')
async function confirmCancel() {
  cancelBusy.value = true
  cancelError.value = ''
  try {
    await $fetch(`/api/v1/clubs/${clubId}/subscription/cancel`, { method: 'POST' })
    await refresh()
    cancelOpen.value = false
    toast.success(`Cancelled. The plan stays active until ${fmtDate(sub.value?.current_period_end ?? null)}.`)
  } catch (err) {
    cancelError.value = apiErrorMessage(err, 'Could not cancel the plan.')
  } finally {
    cancelBusy.value = false
  }
}

const EVENT_TYPE_LABEL: Record<string, string> = {
  tournament: 'Tournament',
  open_casual: 'Open play',
  open_ranked: 'Open play (ranked)',
  club_casual: 'Club session',
  club_ranked: 'Club session (ranked)',
  coaching: 'Coaching'
}
</script>

<template>
  <div class="min-h-screen bg-canvas p-4 lg:p-6">
    <div class="page-shell space-y-6">
      <UiPageHeader
        :to="`/club/${clubId}/dashboard`"
        back-label="Club dashboard"
        title="Billing & plan"
        subtitle="What the club can run right now, and what it could run on another plan."
      />

      <UiErrorState
        v-if="forbidden"
        title="Owners and admins only"
        message="Only the club owner or an admin can see billing."
      />
      <UiErrorState
        v-else-if="error"
        title="Could not load billing"
        :message="apiErrorMessage(error, 'Something went wrong.')"
        @retry="refresh"
      />

      <div v-else-if="pending" class="space-y-4">
        <div class="h-32 animate-pulse rounded-xl bg-surface" />
        <div class="h-48 animate-pulse rounded-xl bg-surface" />
      </div>

      <template v-else-if="billing && ent && usage">
        <!-- Current plan -->
        <section class="rounded-card bg-surface p-5 shadow-card" aria-labelledby="current-plan">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="text-xs font-medium uppercase tracking-wide text-fg-muted">Current plan</p>
              <h2 id="current-plan" class="mt-1 font-display text-heading-2 text-fg">{{ ent.plan_name }}</h2>
              <p class="mt-1 text-sm text-fg-secondary">{{ ORIGIN_SENTENCE[ent.origin] }}</p>
              <p v-if="ent.in_grace" class="mt-1 text-sm text-warning">
                The last payment period has ended. The plan keeps working for a few more days.
              </p>
              <p v-else-if="sub?.cancel_at_period_end && sub.status === 'canceled' && onPaidPlan" class="mt-1 text-sm text-fg-muted">
                Cancelled — stays active until {{ fmtDate(sub.current_period_end) }}.
              </p>
              <p v-else-if="onPaidPlan && sub?.current_period_end" class="mt-1 text-sm text-fg-muted">
                Renews {{ fmtDate(sub.current_period_end) }}.
              </p>
            </div>
            <div class="flex gap-2">
              <button
                v-if="onPaidPlan && sub && !sub.cancel_at_period_end && sub.status !== 'canceled'"
                type="button"
                class="rounded-lg border border-border-strong px-4 py-2 text-sm text-fg-secondary hover:bg-surface-2"
                @click="cancelOpen = true"
              >
                Cancel plan
              </button>
            </div>
          </div>

          <div class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <BillingUsageMeter label="Draft events" :used="usage.drafts" :limit="ent.max_draft_events" noun="draft event" />
            <BillingUsageMeter label="Live tournaments" :used="usage.live_tournaments" :limit="ent.max_live_tournaments" noun="tournament" />
            <BillingUsageMeter label="Live open play" :used="usage.live_open_play" :limit="ent.max_live_open_play" noun="open play event" />
            <BillingUsageMeter label="Members" :used="usage.members" :limit="ent.max_members" noun="member" />
          </div>
        </section>

        <!-- Held events -->
        <section v-if="billing.restricted_events.length" class="rounded-card border border-warning/40 bg-warning-soft/40 p-5" aria-labelledby="held">
          <h2 id="held" class="font-display text-heading-3 text-fg">Events on hold</h2>
          <p class="mt-1 text-sm text-fg-secondary">
            These were held when the club's plan lapsed. Nothing was cancelled or deleted — registrations,
            brackets and scores are all still there. They come back the moment a plan is active again.
          </p>
          <ul class="mt-3 divide-y divide-border text-sm">
            <li v-for="ev in billing.restricted_events" :key="ev.id" class="flex items-center justify-between gap-3 py-2">
              <NuxtLink :to="`/events/${ev.id}`" class="font-medium text-fg hover:underline">{{ ev.name }}</NuxtLink>
              <span class="text-xs text-fg-muted">{{ EVENT_TYPE_LABEL[ev.event_type] ?? ev.event_type }} · {{ fmtDate(ev.start_date) }}</span>
            </li>
          </ul>
        </section>

        <!-- Plans -->
        <section aria-labelledby="plans">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h2 id="plans" class="font-display text-heading-3 text-fg">Plans</h2>
            <UiSegmented v-if="hasYearly" v-model="interval" :items="intervalItems" size="sm" label="Billing interval" />
          </div>

          <UiEmptyState
            v-if="!paidPublic"
            class="mt-3"
            title="Paid plans are not on sale yet"
            message="Every club is on the free plan for now. When a paid plan is available it will appear here."
            icon="card"
          />
          <div v-else class="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <BillingPlanCard
              v-for="group in groups"
              :key="group.key"
              :plan="cardFor(group)"
              :saving="interval === 'year' ? group.saving : null"
              :current="cardFor(group).id === ent.plan_id || (cardFor(group).is_default_free && !onPaidPlan)"
              :disabled-reason="disabledReason"
              @choose="choose"
            />
          </div>
          <p v-if="ent.origin === 'verified_override' && paidPublic" class="mt-3 text-xs text-fg-muted">
            This club is already unrestricted. A plan adds online entry-fee collection and nothing else it does not already have.
          </p>
        </section>

        <!-- History -->
        <section class="rounded-card bg-surface p-5 shadow-card" aria-labelledby="history">
          <h2 id="history" class="font-display text-heading-3 text-fg">Payment history</h2>
          <p v-if="!billing.transactions.length" class="mt-2 text-sm text-fg-muted">No payments yet.</p>
          <ul v-else class="mt-3 divide-y divide-border text-sm">
            <li v-for="t in billing.transactions" :key="t.id" class="flex items-center justify-between gap-3 py-2">
              <div>
                <p class="text-fg">{{ t.description ?? t.transaction_type }}</p>
                <p class="text-xs text-fg-muted">{{ fmtDate(t.created_at) }} · {{ t.status }}</p>
              </div>
              <div class="flex items-center gap-2 tabular-nums text-fg">
                <span v-if="t.is_test" class="rounded-pill bg-warning-soft px-2 py-0.5 text-xs text-warning">Test</span>
                {{ t.amount_cents === 0 ? '₱0.00' : new Intl.NumberFormat('en-PH', { style: 'currency', currency: t.currency.toUpperCase() }).format(t.amount_cents / 100) }}
              </div>
            </li>
          </ul>
        </section>
      </template>
    </div>

    <BillingCheckoutModal
      v-model="checkoutOpen"
      :plan="checkoutPlan"
      :billing-mode="billingMode"
      :billing-notice="billing?.billing.notice ?? plansData?.billing.notice ?? null"
      :loading="checkoutBusy"
      :error="checkoutError"
      @confirm="confirmCheckout"
    />

    <UiModal
      v-model="cancelOpen"
      title="Cancel the plan?"
      :description="`The club keeps everything until ${fmtDate(sub?.current_period_end ?? null)}. After that it returns to the free plan, and all but its oldest unfinished event of each type are held until a plan is active again. Nothing is deleted.`"
      confirm-label="Cancel plan"
      cancel-label="Keep plan"
      destructive
      :loading="cancelBusy"
      @confirm="confirmCancel"
    >
      <p v-if="cancelError" role="alert" class="text-sm text-danger">{{ cancelError }}</p>
    </UiModal>
  </div>
</template>
