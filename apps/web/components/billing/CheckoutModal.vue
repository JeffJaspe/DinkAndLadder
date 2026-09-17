<script setup lang="ts">
import type { BillingMode, ClubSubscriptionPlanDto } from '~/server/domains/payment/dto/subscription.dto'
import { formatPlanPrice } from '~/utils/subscription-plan'

/**
 * Confirm a plan purchase.
 *
 * Two things here are non-negotiable while `billing_mode !== 'live'`:
 *
 * 1. The test-mode banner sits at the TOP, in the warning tone, not as a
 *    footnote. Court Green is confirmed-or-actionable; "nothing is charged"
 *    is neither.
 * 2. BOTH figures are shown: the list price struck through, and "₱0.00 due
 *    today" as the prominent one. Showing only zero hides what the plan
 *    claims to cost; showing only the price is a lie. The confirm button never
 *    contains a currency amount in this state — a unit test enforces it.
 *
 * The voucher field is a placeholder for a contract that does not exist yet.
 * The server refuses every code with `VOUCHER_UNKNOWN`; the field shows that
 * refusal rather than pretending to apply something.
 */
const props = withDefaults(
  defineProps<{
    modelValue: boolean
    plan: ClubSubscriptionPlanDto | null
    billingMode: BillingMode
    /** SuperAdmin-owned copy; null falls back to the default sentence. */
    billingNotice?: string | null
    loading?: boolean
    error?: string | null
  }>(),
  { billingNotice: null, loading: false, error: null }
)

const emit = defineEmits<{
  'update:modelValue': [boolean]
  confirm: [payload: { plan_id: string; voucher_code: string | null }]
}>()

const DEFAULT_NOTICE =
  'Test mode — no payment is taken. You will not be asked for a card and nothing will be charged.'

const isLive = computed(() => props.billingMode === 'live')
const notice = computed(() => props.billingNotice?.trim() || DEFAULT_NOTICE)
const listPrice = computed(() =>
  props.plan ? formatPlanPrice(props.plan.price_cents, props.plan.currency) : ''
)
const interval = computed(() => (props.plan?.billing_interval === 'year' ? 'year' : 'month'))
const dueToday = computed(() =>
  props.plan && isLive.value
    ? listPrice.value
    : formatPlanPrice(0, props.plan?.currency ?? 'php', { freeLabel: '₱0.00' })
)
const confirmLabel = computed(() => (isLive.value ? 'Pay and activate' : 'Activate (no payment)'))

const voucher = ref('')
const voucherMessage = ref('')
watch(
  () => props.error,
  (e) => {
    // The server's VOUCHER_UNKNOWN message lands beside the field, where the
    // person typed it, not in the generic error slot.
    if (e && /voucher/i.test(e)) voucherMessage.value = e
  }
)
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      voucher.value = ''
      voucherMessage.value = ''
    }
  }
)

function submit() {
  if (!props.plan) return
  emit('confirm', { plan_id: props.plan.id, voucher_code: voucher.value.trim() || null })
}
</script>

<template>
  <UiModal
    :model-value="modelValue"
    :title="plan ? `Activate ${plan.name}` : 'Activate plan'"
    hide-actions
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div v-if="plan" class="space-y-4">
      <div
        v-if="!isLive"
        class="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning"
        role="status"
        data-testid="checkout-test-banner"
      >
        {{ notice }}
      </div>

      <dl class="space-y-1.5 text-sm">
        <div class="flex items-baseline justify-between gap-4">
          <dt class="text-fg-secondary">{{ plan.name }}, billed every {{ interval }}</dt>
          <dd class="tabular-nums" :class="isLive ? 'text-fg' : 'text-fg-muted line-through'" data-testid="checkout-list-price">
            {{ listPrice }}
          </dd>
        </div>
        <div class="flex items-baseline justify-between gap-4 border-t border-border pt-2">
          <dt class="font-medium text-fg">Due today</dt>
          <dd class="font-display text-heading-3 tabular-nums text-fg" data-testid="checkout-due-today">
            {{ dueToday }}
          </dd>
        </div>
      </dl>

      <div>
        <label class="block text-xs text-fg-muted" for="checkout-voucher">Voucher code</label>
        <div class="mt-1 flex gap-2">
          <input
            id="checkout-voucher"
            v-model="voucher"
            class="block w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-base text-fg sm:text-sm"
            placeholder="Optional"
            autocomplete="off"
            :disabled="loading"
          />
        </div>
        <p v-if="voucherMessage" class="mt-1 text-xs text-danger" role="alert">{{ voucherMessage }}</p>
        <p v-else class="mt-1 text-xs text-fg-muted">Vouchers are coming soon.</p>
      </div>

      <p v-if="plan.entitlements.verified_badge_eligible" class="text-xs text-fg-muted">
        This plan puts the club in the verified-badge queue. A reviewer still decides; activating does
        not grant the badge.
      </p>

      <p v-if="error && !voucherMessage" role="alert" class="text-sm text-danger">{{ error }}</p>

      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <UiButton variant="secondary" :disabled="loading" class="justify-center" @click="emit('update:modelValue', false)">
          Cancel
        </UiButton>
        <UiButton :loading="loading" class="justify-center" data-testid="checkout-confirm" @click="submit">
          {{ confirmLabel }}
        </UiButton>
      </div>
    </div>
  </UiModal>
</template>
