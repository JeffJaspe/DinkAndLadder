<script setup lang="ts">
import { computeRegistrationCost, formatMoney, type PlatformFeeRule } from '~/utils/convenience-fee'

/**
 * What entering this category costs, before you commit to it.
 *
 * Register used to post straight through, so the first a player heard of a fee
 * was on the day. Doubles is the sharpest case: a pair is two entries on one
 * row, so the amount is double the number printed on the event — which nothing
 * anywhere said.
 *
 * The convenience fee is shown as its own line rather than folded into the
 * total. A fee a payer cannot see is a fee they will dispute, and the platform
 * takes only this line: the entry itself goes to the club.
 *
 * Payment is not wired. This quotes the total and records the intent; the
 * charge itself is deferred (docs/03 puts payments out of MVP, and ADR-005
 * records the unresolved split-settlement question).
 */
const props = defineProps<{
  modelValue: boolean
  categoryName: string
  isDoubles: boolean
  partnerName: string | null
  /** `events.fee_amount`, in major units. Null or 0 for a free event. */
  feeAmount: number | null
  feeCurrency: string
  rules: PlatformFeeRule[]
  submitting: boolean
  error: string
}>()

const emit = defineEmits<{ 'update:modelValue': [boolean]; confirm: [] }>()

const cost = computed(() =>
  computeRegistrationCost(props.feeAmount, props.isDoubles, props.rules, props.feeCurrency)
)

const isFree = computed(() => cost.value.totalCents === 0)

const money = (cents: number) => formatMoney(cents, props.feeCurrency)
</script>

<template>
  <UiModal
    :model-value="modelValue"
    :title="isFree ? 'Confirm your entry' : 'Confirm and pay'"
    :confirm-label="isFree ? 'Register' : `Pay ${money(cost.totalCents)}`"
    :loading="submitting"
    @update:model-value="(v) => emit('update:modelValue', v)"
    @confirm="emit('confirm')"
  >
    <div class="space-y-4">
      <div>
        <p class="text-sm font-medium text-fg">{{ categoryName }}</p>
        <p class="text-xs text-fg-muted">
          {{ isDoubles ? 'Doubles' : 'Singles' }}
          <template v-if="isDoubles && partnerName"> · with {{ partnerName }}</template>
        </p>
      </div>

      <div v-if="!isFree" class="rounded-lg bg-canvas p-4">
        <dl class="space-y-2 text-sm">
          <div class="flex items-baseline justify-between gap-4">
            <dt class="text-fg-secondary">
              Entry fee
              <!-- The doubling is the thing most worth spelling out. -->
              <span v-if="cost.players > 1" class="text-fg-muted">
                — {{ money(cost.unitCents) }} × {{ cost.players }} players
              </span>
            </dt>
            <dd class="shrink-0 tabular-nums text-fg">{{ money(cost.entryCents) }}</dd>
          </div>

          <div v-if="cost.feeCents > 0" class="flex items-baseline justify-between gap-4">
            <dt class="text-fg-secondary">Convenience fee</dt>
            <dd class="shrink-0 tabular-nums text-fg">{{ money(cost.feeCents) }}</dd>
          </div>

          <div
            class="flex items-baseline justify-between gap-4 border-t border-border-strong/50 pt-2"
          >
            <dt class="font-medium text-fg">Total</dt>
            <dd class="shrink-0 font-semibold tabular-nums text-fg">
              {{ money(cost.totalCents) }}
            </dd>
          </div>
        </dl>
      </div>

      <p v-else class="rounded-lg bg-canvas p-4 text-sm text-fg-muted">
        This event is free to enter.
      </p>

      <!-- Where the money is meant to go, said plainly. The platform never
           holds the club's funds; it takes the convenience line only. -->
      <p v-if="!isFree" class="text-xs text-fg-muted">
        The entry fee goes directly to the organising club. Only the convenience fee is collected
        by DinkAndLadder.
      </p>

      <p v-if="!isFree" class="text-xs text-warning">
        Online payment is not switched on yet — your entry is submitted for the organiser to
        approve, and they will tell you how to pay.
      </p>

      <p v-if="error" role="alert" class="text-sm text-danger">{{ error }}</p>
    </div>
  </UiModal>
</template>
