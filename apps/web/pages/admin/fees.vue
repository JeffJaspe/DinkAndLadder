<script setup lang="ts">
import {
  computeConvenienceFee,
  describeFeeRule,
  formatMoney,
  type PlatformFeeRule
} from '~/utils/convenience-fee'

/**
 * The convenience fee, set by the platform administrator.
 *
 * Two shapes were asked for and both are here, because a single one is wrong at
 * one end or the other: a flat percentage is trivial on a ₱200 entry and
 * punitive on a ₱5,000 one, and a flat amount is the reverse. Each rule
 * therefore matches on a band of the base amount, and a percentage can be
 * clamped so it stays sane inside its band.
 *
 * The live preview is the point of the page. A ladder of bands and clamps is
 * hard to hold in your head, and the number that matters is what a player is
 * actually quoted — so the page computes it with exactly the function the
 * registration screen uses.
 */
definePageMeta({ middleware: ['super-admin'] })
useHead({ title: 'Fees & Payments' })

const { data, pending, error, refresh } = await useFetch<{ data: PlatformFeeRule[] }>(
  '/api/v1/platform/fee-rules'
)

const notAuthorized = computed(() => (error.value as { statusCode?: number })?.statusCode === 403)

/** Editable copy — the fetched rows stay the truth until a save succeeds. */
const draft = ref<PlatformFeeRule[]>([])
watch(
  data,
  (rows) => {
    draft.value = (rows?.data ?? []).map((r) => ({ ...r }))
  },
  { immediate: true }
)

function addRule() {
  const last = draft.value.at(-1)
  draft.value.push({
    id: `new-${draft.value.length}`,
    fee_type: 'percentage',
    value: 5,
    // Starts where the previous band ended, which is what an admin means by
    // "add a band" almost every time.
    min_amount_cents: last?.max_amount_cents != null ? last.max_amount_cents + 1 : 0,
    max_amount_cents: null,
    min_fee_cents: null,
    max_fee_cents: 5000,
    is_active: true,
    sort_order: draft.value.length + 1
  })
}

function removeRule(index: number) {
  draft.value.splice(index, 1)
}

const saving = ref(false)
const saveError = ref('')
const toast = useToast()

async function save() {
  saving.value = true
  saveError.value = ''
  try {
    await $fetch('/api/v1/admin/fee-rules', {
      method: 'PUT',
      body: { rules: draft.value.map((r, i) => ({ ...r, sort_order: i + 1 })) }
    })
    await refresh()
    toast.success('Fee rules saved.')
  } catch (err) {
    saveError.value = apiErrorMessage(err, 'Could not save the fee rules.')
  } finally {
    saving.value = false
  }
}

// --- Preview ---
/** Amounts an organiser actually charges, in pesos. */
const PREVIEW_AMOUNTS = [200, 500, 1000, 2500, 5000]

const preview = computed(() =>
  PREVIEW_AMOUNTS.map((peso) => {
    const base = peso * 100
    const fee = computeConvenienceFee(base, draft.value)
    return { base, fee, total: base + fee }
  })
)

/** Pesos in the inputs, cents in the model — money is never a float here. */
function pesos(cents: number | null): number | null {
  return cents === null ? null : cents / 100
}
function toCents(value: number | null): number | null {
  return value === null || Number.isNaN(value) ? null : Math.round(value * 100)
}
</script>

<template>
  <div class="min-h-screen bg-canvas p-4 lg:p-6">
    <div class="page-shell space-y-6">
      <header>
        <h1 class="text-heading-3 text-fg">Fees &amp; Payments</h1>
        <p class="mt-1 text-sm text-fg-muted">
          The convenience fee added on top of an event's entry fee. The entry itself goes to the
          organising club; this is the only part the platform collects.
        </p>
      </header>

      <UiErrorState v-if="notAuthorized" title="Not authorised" message="Administrators only." />

      <template v-else>
        <div v-if="pending" class="h-40 animate-pulse rounded-xl bg-surface-2" />

        <template v-else>
          <section class="rounded-xl bg-surface p-5 shadow-card">
            <h2 class="text-sm font-medium text-fg">Fee ladder</h2>
            <p class="mt-1 text-sm text-fg-muted">
              Each band matches on the entry total. A percentage can be given a minimum and maximum
              so it stays sensible at both ends of its band.
            </p>

            <div class="mt-4 space-y-4">
              <div
                v-for="(rule, index) in draft"
                :key="rule.id"
                class="rounded-lg border border-border-strong/60 p-4"
              >
                <div class="flex flex-wrap items-end gap-3">
                  <label class="text-xs text-fg-muted">
                    Type
                    <select
                      v-model="rule.fee_type"
                      class="mt-1 block rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-sm text-fg"
                    >
                      <option value="percentage">Percentage</option>
                      <option value="fixed">Fixed amount</option>
                    </select>
                  </label>

                  <label class="text-xs text-fg-muted">
                    {{ rule.fee_type === 'percentage' ? 'Percent' : 'Amount (₱)' }}
                    <input
                      :value="rule.fee_type === 'percentage' ? rule.value : pesos(rule.value)"
                      type="number"
                      step="0.01"
                      min="0"
                      class="mt-1 block w-28 rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-sm text-fg"
                      @input="
                        rule.value =
                          rule.fee_type === 'percentage'
                            ? Number(($event.target as HTMLInputElement).value)
                            : (toCents(Number(($event.target as HTMLInputElement).value)) ?? 0)
                      "
                    />
                  </label>

                  <label class="text-xs text-fg-muted">
                    Band from (₱)
                    <input
                      :value="pesos(rule.min_amount_cents)"
                      type="number"
                      step="0.01"
                      min="0"
                      class="mt-1 block w-28 rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-sm text-fg"
                      @input="
                        rule.min_amount_cents =
                          toCents(Number(($event.target as HTMLInputElement).value)) ?? 0
                      "
                    />
                  </label>

                  <label class="text-xs text-fg-muted">
                    to (₱, blank = no limit)
                    <input
                      :value="pesos(rule.max_amount_cents)"
                      type="number"
                      step="0.01"
                      class="mt-1 block w-32 rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-sm text-fg"
                      @input="
                        rule.max_amount_cents = ($event.target as HTMLInputElement).value
                          ? toCents(Number(($event.target as HTMLInputElement).value))
                          : null
                      "
                    />
                  </label>

                  <template v-if="rule.fee_type === 'percentage'">
                    <label class="text-xs text-fg-muted">
                      Min fee (₱)
                      <input
                        :value="pesos(rule.min_fee_cents)"
                        type="number"
                        step="0.01"
                        class="mt-1 block w-24 rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-sm text-fg"
                        @input="
                          rule.min_fee_cents = ($event.target as HTMLInputElement).value
                            ? toCents(Number(($event.target as HTMLInputElement).value))
                            : null
                        "
                      />
                    </label>
                    <label class="text-xs text-fg-muted">
                      Max fee (₱)
                      <input
                        :value="pesos(rule.max_fee_cents)"
                        type="number"
                        step="0.01"
                        class="mt-1 block w-24 rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-sm text-fg"
                        @input="
                          rule.max_fee_cents = ($event.target as HTMLInputElement).value
                            ? toCents(Number(($event.target as HTMLInputElement).value))
                            : null
                        "
                      />
                    </label>
                  </template>

                  <button
                    type="button"
                    class="ml-auto rounded-lg border border-danger px-3 py-1.5 text-sm text-danger hover:bg-danger/10"
                    @click="removeRule(index)"
                  >
                    Remove
                  </button>
                </div>

                <p class="mt-3 text-xs text-fg-muted">{{ describeFeeRule(rule) }}</p>
              </div>

              <p v-if="!draft.length" class="text-sm text-fg-muted">
                No fee rules. Registration will quote the entry fee alone and the platform will
                collect nothing.
              </p>
            </div>

            <div class="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                class="rounded-lg border border-border-strong px-4 py-2 text-sm text-fg-secondary hover:bg-surface-2"
                @click="addRule"
              >
                Add band
              </button>
              <button
                type="button"
                :disabled="saving"
                class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
                @click="save"
              >
                {{ saving ? 'Saving…' : 'Save fee rules' }}
              </button>
            </div>
            <p v-if="saveError" role="alert" class="mt-2 text-sm text-danger">{{ saveError }}</p>
          </section>

          <!-- The number that actually matters, computed by the same function
               the registration screen uses. -->
          <section class="rounded-xl bg-surface p-5 shadow-card">
            <h2 class="text-sm font-medium text-fg">What a player would be quoted</h2>
            <div class="scroll-x mt-3">
              <table class="w-full min-w-[26rem] text-sm">
                <thead>
                  <tr class="text-left text-xs uppercase tracking-wide text-fg-muted">
                    <th class="pb-2 font-medium">Entry total</th>
                    <th class="pb-2 text-right font-medium">Convenience fee</th>
                    <th class="pb-2 text-right font-medium">Player pays</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in preview"
                    :key="row.base"
                    class="border-t border-border-strong/40"
                  >
                    <td class="py-2 tabular-nums text-fg-secondary">{{ formatMoney(row.base) }}</td>
                    <td class="py-2 text-right tabular-nums text-fg-secondary">
                      {{ formatMoney(row.fee) }}
                    </td>
                    <td class="py-2 text-right font-medium tabular-nums text-fg">
                      {{ formatMoney(row.total) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="mt-3 text-xs text-fg-muted">
              A doubles entry is the event's fee twice, so it lands in a higher band than a singles
              entry at the same event.
            </p>
          </section>

          <!-- The provider side, deliberately not wired. -->
          <section class="rounded-xl bg-surface p-5 shadow-card">
            <h2 class="text-sm font-medium text-fg">PayMongo</h2>
            <p class="mt-1 text-sm text-fg-muted">
              Online payment is not switched on. Both gateway webhooks return 501 so that no event
              is silently accepted and lost.
            </p>
            <dl class="mt-4 space-y-2 text-sm">
              <div class="flex items-baseline justify-between gap-4">
                <dt class="text-fg-secondary">Entry fee</dt>
                <dd class="text-fg">Paid direct to the club's own PayMongo link</dd>
              </div>
              <div class="flex items-baseline justify-between gap-4">
                <dt class="text-fg-secondary">Convenience fee</dt>
                <dd class="text-fg">Collected by the platform</dd>
              </div>
              <div class="flex items-baseline justify-between gap-4">
                <dt class="text-fg-secondary">Club funds held by platform</dt>
                <dd class="text-fg">Never</dd>
              </div>
            </dl>
            <p class="mt-3 text-xs text-warning">
              Whether this settles as one split charge or two separate ones depends on what the
              PayMongo account supports — recorded as ADR-005, not decided in code. Secret keys stay
              in server environment variables and are never stored in the database.
            </p>
          </section>
        </template>
      </template>
    </div>
  </div>
</template>
