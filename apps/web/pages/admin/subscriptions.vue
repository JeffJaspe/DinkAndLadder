<script setup lang="ts">
import type {
  AdminClubSubscriptionPlanDto,
  ClubSubscriptionPlanDto
} from '~/server/domains/payment/dto/subscription.dto'
import type {
  AdminClubSubscriptionRowDto
} from '~/server/domains/payment/dto/club-billing.dto'
import type {
  BillingSettingsDto,
  PlanSaveResult
} from '~/server/domains/payment/services/subscription-plan-admin.service'
import { describeAnnualSaving, formatPlanPrice } from '~/utils/subscription-plan'
import { apiErrorMessage } from '~/utils/api-error-message'

/**
 * Club subscriptions, for the platform administrator.
 *
 * Three tabs. *Plans* edits what a club can buy, with a live preview drawn by
 * the same `BillingPlanCard` the pricing page and the club chooser use — the
 * direct sibling of the fee page's quoted-price table, and the point of the
 * page: what you see here is what a club owner will see. *Billing* switches
 * whether anything can be bought at all. *Clubs* is who is on what, with
 * Grant as the only route to a paid plan while nothing is on sale.
 *
 * Nothing here decides a price. Premium ships unpublished with a placeholder
 * figure (ADR-007 is open); publishing it is this page's job, and a deliberate
 * act, not a migration.
 */
definePageMeta({ middleware: ['super-admin'] })
useHead({ title: 'Subscriptions' })

const tabs = [
  { value: 'plans', label: 'Plans' },
  { value: 'billing', label: 'Billing' },
  { value: 'clubs', label: 'Clubs' }
]
const tab = ref('plans')
const toast = useToast()

/* ----------------------------------------------------------------- Plans */

const {
  data: plansData,
  pending: plansPending,
  error: plansError,
  refresh: refreshPlans
} = await useFetch<{ data: AdminClubSubscriptionPlanDto[] }>('/api/v1/admin/subscription-plans')

const notAuthorized = computed(
  () => (plansError.value as { statusCode?: number })?.statusCode === 403
)

/**
 * One editable draft per plan, keyed by id. The fetched rows stay the truth;
 * a draft only replaces them once its save succeeds.
 */
const drafts = ref<Record<string, AdminClubSubscriptionPlanDto>>({})
const expanded = ref<string | null>(null)
watch(
  plansData,
  (rows) => {
    const next: Record<string, AdminClubSubscriptionPlanDto> = {}
    for (const p of rows?.data ?? []) next[p.id] = structuredClone(toRaw(p))
    drafts.value = next
  },
  { immediate: true }
)

const planList = computed(() => plansData.value?.data ?? [])

/** The monthly twin of a draft, for the computed-saving placeholder. */
function monthlyTwinOf(draft: AdminClubSubscriptionPlanDto) {
  if (draft.billing_interval !== 'year' || !draft.plan_group) return null
  return (
    Object.values(drafts.value).find(
      (p) => p.id !== draft.id && p.plan_group === draft.plan_group && p.billing_interval === 'month'
    ) ?? null
  )
}
function computedSaving(draft: AdminClubSubscriptionPlanDto) {
  return describeAnnualSaving(monthlyTwinOf(draft), draft)
}

/** Pesos in the inputs, cents in the model — money is never a float here. */
function pesos(cents: number | null): number | null {
  return cents === null ? null : cents / 100
}
function toCents(value: number | null): number | null {
  return value === null || Number.isNaN(value) ? null : Math.round(value * 100)
}
function readNumber(e: Event): number | null {
  const raw = (e.target as HTMLInputElement).value
  return raw === '' ? null : Number(raw)
}

type LimitKey = 'max_draft_events' | 'max_live_tournaments' | 'max_live_open_play' | 'max_members'
const LIMITS: { key: LimitKey; label: string }[] = [
  { key: 'max_draft_events', label: 'Draft events' },
  { key: 'max_live_tournaments', label: 'Live tournaments' },
  { key: 'max_live_open_play', label: 'Live open play' },
  { key: 'max_members', label: 'Members' }
]

/** The Unlimited checkbox writes `null`, never -1. */
function setUnlimited(draft: AdminClubSubscriptionPlanDto, key: LimitKey, unlimited: boolean) {
  draft.entitlements[key] = unlimited ? null : (draft.entitlements[key] ?? 1)
}

function addBullet(draft: AdminClubSubscriptionPlanDto) {
  draft.marketing_bullets.push('')
}
function removeBullet(draft: AdminClubSubscriptionPlanDto, i: number) {
  draft.marketing_bullets.splice(i, 1)
}
function addFigure(draft: AdminClubSubscriptionPlanDto) {
  draft.headline_figures.push({ value: '', label: '' })
}
function removeFigure(draft: AdminClubSubscriptionPlanDto, i: number) {
  draft.headline_figures.splice(i, 1)
}

const planGroups = computed(() =>
  [...new Set(Object.values(drafts.value).map((p) => p.plan_group).filter(Boolean))] as string[]
)

/**
 * Event types grouped by category for the entitlements UI.
 * Matches EventType from event.dto.ts.
 */
interface EventTypeOption {
  value: string
  label: string
  ranked?: boolean
}
interface EventTypeGroup {
  category: string
  types: EventTypeOption[]
}
const EVENT_TYPE_GROUPS: EventTypeGroup[] = [
  {
    category: 'Open Play',
    types: [
      { value: 'open_casual', label: 'Casual Open Play' },
      { value: 'open_ranked', label: 'Ranked Open Play', ranked: true }
    ]
  },
  {
    category: 'Club Play',
    types: [
      { value: 'club_casual', label: 'Casual Club Play' },
      { value: 'club_ranked', label: 'Ranked Club Play', ranked: true }
    ]
  },
  {
    category: 'Tournament',
    types: [
      { value: 'tournament', label: 'Tournament', ranked: true }
    ]
  },
  {
    category: 'Other',
    types: [
      { value: 'coaching', label: 'Coaching' }
    ]
  }
]

function isEventTypeAllowed(draft: AdminClubSubscriptionPlanDto, eventType: string): boolean {
  if (draft.entitlements.allowed_event_types === null) return true
  return draft.entitlements.allowed_event_types.includes(eventType)
}

function toggleEventType(draft: AdminClubSubscriptionPlanDto, eventType: string, allowed: boolean) {
  if (draft.entitlements.allowed_event_types === null) {
    // Convert from "all allowed" to explicit list
    const allTypes = EVENT_TYPE_GROUPS.flatMap(g => g.types.map(t => t.value))
    draft.entitlements.allowed_event_types = allowed
      ? allTypes
      : allTypes.filter(t => t !== eventType)
  } else if (allowed) {
    if (!draft.entitlements.allowed_event_types.includes(eventType)) {
      draft.entitlements.allowed_event_types.push(eventType)
    }
  } else {
    draft.entitlements.allowed_event_types = draft.entitlements.allowed_event_types.filter(
      t => t !== eventType
    )
  }
}

function setAllEventTypesUnlimited(draft: AdminClubSubscriptionPlanDto, unlimited: boolean) {
  draft.entitlements.allowed_event_types = unlimited ? null : []
}

const savingPlan = ref<string | null>(null)
const planErrors = ref<Record<string, string>>({})
const planWarnings = ref<Record<string, string[]>>({})

/** The flat PATCH body: the nested `entitlements` go back to their columns. */
function toPatch(draft: AdminClubSubscriptionPlanDto) {
  return {
    name: draft.name,
    description: draft.description,
    tagline: draft.tagline,
    badge_label: draft.badge_label,
    cta_label: draft.cta_label,
    savings_label: draft.savings_label,
    plan_group: draft.plan_group,
    sort_order: draft.sort_order,
    price_cents: draft.price_cents,
    billing_interval: draft.billing_interval,
    marketing_bullets: draft.marketing_bullets,
    headline_figures: draft.headline_figures,
    is_active: draft.is_active,
    is_public: draft.is_public,
    is_featured: draft.is_featured,
    ...draft.entitlements
  }
}

async function savePlan(draft: AdminClubSubscriptionPlanDto) {
  savingPlan.value = draft.id
  planErrors.value = { ...planErrors.value, [draft.id]: '' }
  try {
    const result = await $fetch<PlanSaveResult>(`/api/v1/admin/subscription-plans/${draft.id}`, {
      method: 'PATCH',
      body: toPatch(draft)
    })
    planWarnings.value = { ...planWarnings.value, [draft.id]: result.warnings }
    await refreshPlans()
    toast.success(`${result.plan.name} saved.`)
  } catch (err) {
    planErrors.value = { ...planErrors.value, [draft.id]: apiErrorMessage(err, 'Could not save the plan.') }
  } finally {
    savingPlan.value = null
  }
}

const creating = ref(false)
const createError = ref('')

async function createPlan(from?: AdminClubSubscriptionPlanDto) {
  creating.value = true
  createError.value = ''
  try {
    const body = from
      ? {
          // "Create yearly twin": same everything, yearly, twelve months at the
          // monthly price so the admin starts from "no discount" and lowers it.
          ...toPatch(from),
          name: `${from.name} (yearly)`,
          billing_interval: 'year' as const,
          price_cents: from.price_cents * 12,
          is_public: false,
          is_featured: false,
          savings_label: null
        }
      : { name: 'New plan', billing_interval: 'month' as const, price_cents: 0 }
    const result = await $fetch<PlanSaveResult>('/api/v1/admin/subscription-plans', {
      method: 'POST',
      body
    })
    await refreshPlans()
    expanded.value = result.plan.id
    toast.success(`${result.plan.name} created — unpublished.`)
  } catch (err) {
    createError.value = apiErrorMessage(err, 'Could not create the plan.')
  } finally {
    creating.value = false
  }
}

/* --------------------------------------------------------------- Billing */

const { data: billingData, refresh: refreshBilling } = await useFetch<BillingSettingsDto>(
  '/api/v1/admin/billing'
)
const billingDraft = ref<BillingSettingsDto>({
  billing_mode: 'off',
  billing_notice: null,
  subscription_grace_days: 7
})
watch(
  billingData,
  (v) => {
    if (v) billingDraft.value = { ...v }
  },
  { immediate: true }
)

const modeItems = [
  { value: 'off', label: 'Off' },
  { value: 'simulated', label: 'Test' }
]
const DEFAULT_NOTICE =
  'Test mode — no payment is taken. You will not be asked for a card and nothing will be charged.'

const savingBilling = ref(false)
const billingError = ref('')

async function saveBilling() {
  savingBilling.value = true
  billingError.value = ''
  try {
    await $fetch('/api/v1/admin/billing', { method: 'PATCH', body: billingDraft.value })
    await refreshBilling()
    toast.success('Billing settings saved.')
  } catch (err) {
    billingError.value = apiErrorMessage(err, 'Could not save billing settings.')
  } finally {
    savingBilling.value = false
  }
}

/* ----------------------------------------------------------------- Clubs */

const {
  data: subsData,
  pending: subsPending,
  refresh: refreshSubs
} = await useFetch<{ data: AdminClubSubscriptionRowDto[] }>('/api/v1/admin/club-subscriptions')
const subRows = computed(() => subsData.value?.data ?? [])

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
function statusTone(status: string): 'active' | 'pending' | 'cancelled' | 'inactive' {
  if (status === 'active' || status === 'trialing') return 'active'
  if (status === 'past_due') return 'pending'
  if (status === 'canceled') return 'cancelled'
  return 'inactive'
}
const SOURCE_LABEL: Record<string, string> = {
  self_serve: 'Self-serve',
  admin_grant: 'Admin grant',
  simulated_checkout: 'Test checkout'
}

// Grant
const grantOpen = ref(false)
const grantBusy = ref(false)
const grantError = ref('')
const grantForm = ref({ club_id: '', club_name: '', plan_id: '', months: 1, notes: '' })
const clubQuery = ref('')
const clubResults = ref<{ id: string; name: string }[]>([])
let clubSearchTimer: ReturnType<typeof setTimeout> | null = null

watch(clubQuery, (q) => {
  if (clubSearchTimer) clearTimeout(clubSearchTimer)
  if (!q.trim()) {
    clubResults.value = []
    return
  }
  clubSearchTimer = setTimeout(async () => {
    try {
      const res = await $fetch<{ data: { id: string; name: string }[] }>('/api/v1/clubs/search', {
        query: { q: q.trim(), limit: 8 }
      })
      clubResults.value = res.data
    } catch {
      clubResults.value = []
    }
  }, 250)
})

const grantablePlans = computed(() => planList.value.filter((p) => p.is_active && !p.is_default_free))

function openGrant() {
  grantForm.value = {
    club_id: '',
    club_name: '',
    plan_id: grantablePlans.value[0]?.id ?? '',
    months: 1,
    notes: ''
  }
  clubQuery.value = ''
  clubResults.value = []
  grantError.value = ''
  grantOpen.value = true
}
function pickClub(c: { id: string; name: string }) {
  grantForm.value.club_id = c.id
  grantForm.value.club_name = c.name
  clubResults.value = []
  clubQuery.value = c.name
}
async function submitGrant() {
  if (!grantForm.value.club_id || !grantForm.value.plan_id) {
    grantError.value = 'Pick a club and a plan.'
    return
  }
  grantBusy.value = true
  grantError.value = ''
  try {
    await $fetch('/api/v1/admin/club-subscriptions', {
      method: 'POST',
      body: {
        club_id: grantForm.value.club_id,
        plan_id: grantForm.value.plan_id,
        months: Number(grantForm.value.months),
        notes: grantForm.value.notes || null
      }
    })
    await refreshSubs()
    grantOpen.value = false
    toast.success(`${grantForm.value.club_name} granted.`)
  } catch (err) {
    grantError.value = apiErrorMessage(err, 'Could not grant the plan.')
  } finally {
    grantBusy.value = false
  }
}

// Extend / Cancel
const actionRow = ref<AdminClubSubscriptionRowDto | null>(null)
const actionKind = ref<'extend' | 'cancel'>('extend')
const actionBusy = ref(false)
const actionError = ref('')
const actionForm = ref({ months: 1, notes: '' })

function openAction(row: AdminClubSubscriptionRowDto, kind: 'extend' | 'cancel') {
  actionRow.value = row
  actionKind.value = kind
  actionForm.value = { months: 1, notes: '' }
  actionError.value = ''
}
async function submitAction() {
  if (!actionRow.value) return
  actionBusy.value = true
  actionError.value = ''
  try {
    await $fetch(`/api/v1/admin/club-subscriptions/${actionRow.value.subscription.id}`, {
      method: 'PATCH',
      body: {
        action: actionKind.value,
        months: Number(actionForm.value.months),
        notes: actionForm.value.notes || null
      }
    })
    await refreshSubs()
    toast.success(actionKind.value === 'extend' ? 'Subscription extended.' : 'Subscription cancelled.')
    actionRow.value = null
  } catch (err) {
    actionError.value = apiErrorMessage(err, 'Could not update the subscription.')
  } finally {
    actionBusy.value = false
  }
}

const canBuyAnything = computed(
  () => billingDraft.value.billing_mode !== 'off' && planList.value.some((p) => p.is_public && p.is_active && !p.is_default_free)
)

const inputClass =
  'mt-1 block w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-base text-fg sm:text-sm'
</script>

<template>
  <div class="min-h-screen bg-canvas p-4 lg:p-6">
    <div class="page-shell space-y-6">
      <header>
        <h1 class="font-display text-heading-1 text-fg">Subscriptions</h1>
        <p class="mt-1 text-sm text-fg-muted">
          What a club can buy, whether anything can be bought, and who is on what.
        </p>
      </header>

      <UiErrorState v-if="notAuthorized" title="Not authorised" message="Administrators only." />

      <template v-else>
        <UiTabs v-model="tab" :tabs="tabs" id-prefix="subs" />

        <!-- ============================================================ Plans -->
        <section v-if="tab === 'plans'" id="subs-panel-plans" role="tabpanel" aria-labelledby="subs-tab-plans" class="space-y-4">
          <div v-if="plansPending" class="h-40 animate-pulse rounded-xl bg-surface-2" />

          <template v-else>
            <p class="text-sm text-fg-muted">
              A plan is created unpublished. Tick <strong class="text-fg">Public</strong> and
              <strong class="text-fg">Active</strong> to put it on the pricing page. There is no
              delete: a plan with subscriptions on it is deactivated instead.
            </p>

            <article
              v-for="plan in planList"
              :key="plan.id"
              class="rounded-xl bg-surface shadow-card"
            >
              <button
                type="button"
                class="flex w-full items-center justify-between gap-3 p-5 text-left"
                :aria-expanded="expanded === plan.id"
                @click="expanded = expanded === plan.id ? null : plan.id"
              >
                <div class="min-w-0">
                  <h2 class="truncate text-body-2 font-medium text-fg">
                    {{ plan.name }}
                    <span v-if="plan.is_default_free" class="ml-2 rounded-pill bg-surface-2 px-2 py-0.5 text-xs text-fg-muted">Default free</span>
                  </h2>
                  <p class="mt-0.5 text-xs tabular-nums text-fg-muted">
                    {{ formatPlanPrice(plan.price_cents, plan.currency) }}
                    <template v-if="plan.price_cents > 0">/ {{ plan.billing_interval }}</template>
                    · {{ plan.is_public && plan.is_active ? 'On the pricing page' : plan.is_active ? 'Active, not public' : 'Inactive' }}
                  </p>
                </div>
                <UiIcon :name="expanded === plan.id ? 'chevron-up' : 'chevron-down'" size="h-5 w-5" class="shrink-0 text-fg-muted" />
              </button>

              <div v-if="expanded === plan.id && drafts[plan.id]" class="grid gap-6 border-t border-border p-5 lg:grid-cols-[1fr,20rem]">
                <form class="space-y-5" @submit.prevent="savePlan(drafts[plan.id])">
                  <!-- Identity -->
                  <div class="grid gap-3 sm:grid-cols-2">
                    <label class="text-xs text-fg-muted">Name
                      <input v-model="drafts[plan.id].name" :class="inputClass" maxlength="60" required />
                    </label>
                    <label class="text-xs text-fg-muted">Plan group
                      <input v-model="drafts[plan.id].plan_group" :class="inputClass" list="plan-groups" placeholder="e.g. club-premium" />
                      <datalist id="plan-groups">
                        <option v-for="g in planGroups" :key="g" :value="g" />
                      </datalist>
                    </label>
                    <label class="text-xs text-fg-muted sm:col-span-2">Tagline
                      <input v-model="drafts[plan.id].tagline" :class="inputClass" placeholder="One line under the name" />
                    </label>
                    <label class="text-xs text-fg-muted sm:col-span-2">Description
                      <textarea v-model="drafts[plan.id].description" :class="inputClass" rows="2" />
                    </label>
                  </div>

                  <!-- Price -->
                  <div class="grid gap-3 sm:grid-cols-3">
                    <label class="text-xs text-fg-muted">Price (₱)
                      <input
                        :value="pesos(drafts[plan.id].price_cents)"
                        type="number" step="0.01" min="0" :class="inputClass"
                        :disabled="plan.is_default_free"
                        @input="drafts[plan.id].price_cents = toCents(readNumber($event)) ?? 0"
                      />
                    </label>
                    <label class="text-xs text-fg-muted">Billing
                      <select v-model="drafts[plan.id].billing_interval" :class="inputClass" :disabled="plan.is_default_free">
                        <option value="month">Monthly</option>
                        <option value="year">Yearly</option>
                      </select>
                    </label>
                    <label class="text-xs text-fg-muted">Sort order
                      <input v-model.number="drafts[plan.id].sort_order" type="number" :class="inputClass" />
                    </label>
                  </div>

                  <!-- Discount: a label today, a rule later -->
                  <div>
                    <label class="text-xs text-fg-muted">Discount label
                      <input
                        v-model="drafts[plan.id].savings_label"
                        :class="inputClass"
                        :placeholder="computedSaving(drafts[plan.id])?.label ?? 'e.g. Save ₱1,200 (17%)'"
                      />
                    </label>
                    <p class="mt-1 text-xs text-fg-muted">
                      Percentage discounts and vouchers are not built yet — this is the text shown on
                      the card. Left blank, a yearly plan shows its saving against its monthly twin
                      automatically.
                    </p>
                  </div>

                  <!-- Entitlements -->
                  <fieldset>
                    <legend class="text-xs font-medium uppercase tracking-wide text-fg-muted">What it allows</legend>
                    <div class="mt-2 grid gap-3 sm:grid-cols-2">
                      <div v-for="limit in LIMITS" :key="limit.key" class="rounded-lg border border-border p-3">
                        <div class="flex items-center justify-between gap-2">
                          <span class="text-sm text-fg">{{ limit.label }}</span>
                          <label class="flex items-center gap-1.5 text-xs text-fg-muted">
                            <input
                              type="checkbox"
                              :checked="drafts[plan.id].entitlements[limit.key] === null"
                              @change="setUnlimited(drafts[plan.id], limit.key, ($event.target as HTMLInputElement).checked)"
                            />
                            Unlimited
                          </label>
                        </div>
                        <input
                          v-if="drafts[plan.id].entitlements[limit.key] !== null"
                          v-model.number="drafts[plan.id].entitlements[limit.key]"
                          type="number" min="0" step="1"
                          :class="inputClass"
                        />
                      </div>
                    </div>
                    <div class="mt-3 flex flex-wrap gap-4 text-sm text-fg">
                      <label class="flex items-center gap-2">
                        <input v-model="drafts[plan.id].entitlements.online_fee_collection" type="checkbox" />
                        Online entry fee collection
                      </label>
                      <label class="flex items-center gap-2">
                        <input
                          v-model="drafts[plan.id].entitlements.verified_badge_eligible"
                          type="checkbox"
                          :disabled="plan.is_default_free"
                        />
                        Eligible for the verified badge
                        <span class="text-xs text-fg-muted">(queues the club for review; does not grant it)</span>
                      </label>
                    </div>

                    <!-- Allowed event types -->
                    <div class="mt-4 rounded-lg border border-border p-3">
                      <div class="flex items-center justify-between gap-2">
                        <span class="text-sm font-medium text-fg">Allowed event types</span>
                        <label class="flex items-center gap-1.5 text-xs text-fg-muted">
                          <input
                            type="checkbox"
                            :checked="drafts[plan.id].entitlements.allowed_event_types === null"
                            @change="setAllEventTypesUnlimited(drafts[plan.id], ($event.target as HTMLInputElement).checked)"
                          />
                          All types
                        </label>
                      </div>
                      <div v-if="drafts[plan.id].entitlements.allowed_event_types !== null" class="mt-3 grid gap-3 sm:grid-cols-2">
                        <div v-for="group in EVENT_TYPE_GROUPS" :key="group.category" class="space-y-1">
                          <p class="text-xs font-medium text-fg-muted">{{ group.category }}</p>
                          <label
                            v-for="eventType in group.types"
                            :key="eventType.value"
                            class="flex items-center gap-2 text-sm text-fg"
                          >
                            <input
                              type="checkbox"
                              :checked="isEventTypeAllowed(drafts[plan.id], eventType.value)"
                              @change="toggleEventType(drafts[plan.id], eventType.value, ($event.target as HTMLInputElement).checked)"
                            />
                            {{ eventType.label }}
                            <span v-if="eventType.ranked" class="rounded-pill bg-ranked/20 px-1.5 py-0.5 text-xs text-ranked">Ranked</span>
                          </label>
                        </div>
                      </div>
                    </div>

                    <!-- Ranked events toggle -->
                    <div class="mt-3">
                      <label class="flex items-center gap-2 text-sm text-fg">
                        <input
                          v-model="drafts[plan.id].entitlements.can_create_ranked_events"
                          type="checkbox"
                        />
                        Can create ranked events
                        <span class="text-xs text-fg-muted">(open_ranked, club_ranked, tournament)</span>
                      </label>
                      <p class="mt-1 text-xs text-fg-muted">
                        Even if ranked event types are allowed above, this must be enabled for the club
                        to actually create them. Verified clubs bypass this check.
                      </p>
                    </div>
                  </fieldset>

                  <!-- Marketing -->
                  <fieldset>
                    <legend class="text-xs font-medium uppercase tracking-wide text-fg-muted">Card copy</legend>
                    <div class="mt-2 grid gap-3 sm:grid-cols-2">
                      <label class="text-xs text-fg-muted">Badge label
                        <input v-model="drafts[plan.id].badge_label" :class="inputClass" placeholder="e.g. Most popular" />
                      </label>
                      <label class="text-xs text-fg-muted">Button label
                        <input v-model="drafts[plan.id].cta_label" :class="inputClass" placeholder="e.g. Go Premium" />
                      </label>
                    </div>

                    <div class="mt-3">
                      <p class="text-xs text-fg-muted">Bullets</p>
                      <div v-for="(_, i) in drafts[plan.id].marketing_bullets" :key="i" class="mt-1 flex gap-2">
                        <input v-model="drafts[plan.id].marketing_bullets[i]" :class="inputClass" class="!mt-0" />
                        <button type="button" class="text-fg-muted hover:text-danger" aria-label="Remove bullet" @click="removeBullet(drafts[plan.id], i)">
                          <UiIcon name="x" size="h-4 w-4" />
                        </button>
                      </div>
                      <button type="button" class="mt-2 text-xs text-primary hover:underline" @click="addBullet(drafts[plan.id])">+ Add bullet</button>
                    </div>

                    <div class="mt-3">
                      <p class="text-xs text-fg-muted">Headline figures</p>
                      <div v-for="(fig, i) in drafts[plan.id].headline_figures" :key="i" class="mt-1 flex gap-2">
                        <input v-model="fig.value" :class="inputClass" class="!mt-0 w-24" placeholder="∞" />
                        <input v-model="fig.label" :class="inputClass" class="!mt-0" placeholder="events per month" />
                        <button type="button" class="text-fg-muted hover:text-danger" aria-label="Remove figure" @click="removeFigure(drafts[plan.id], i)">
                          <UiIcon name="x" size="h-4 w-4" />
                        </button>
                      </div>
                      <button type="button" class="mt-2 text-xs text-primary hover:underline" @click="addFigure(drafts[plan.id])">+ Add figure</button>
                    </div>
                  </fieldset>

                  <!-- Visibility -->
                  <div class="flex flex-wrap gap-4 text-sm text-fg">
                    <label class="flex items-center gap-2">
                      <input v-model="drafts[plan.id].is_active" type="checkbox" :disabled="plan.is_default_free" /> Active
                    </label>
                    <label class="flex items-center gap-2">
                      <input v-model="drafts[plan.id].is_public" type="checkbox" :disabled="plan.is_default_free" /> Public
                    </label>
                    <label class="flex items-center gap-2">
                      <input v-model="drafts[plan.id].is_featured" type="checkbox" /> Featured
                    </label>
                  </div>
                  <p v-if="plan.is_default_free" class="text-xs text-fg-muted">
                    The default free plan is what every club starts on. It stays active, public and free;
                    moving that flag to another plan is a data migration, not a form field.
                  </p>

                  <div class="flex flex-wrap items-center gap-2">
                    <button
                      type="submit"
                      :disabled="savingPlan === plan.id"
                      class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
                    >
                      {{ savingPlan === plan.id ? 'Saving…' : 'Save plan' }}
                    </button>
                    <button
                      v-if="plan.billing_interval === 'month' && !plan.is_default_free"
                      type="button"
                      :disabled="creating"
                      class="rounded-lg border border-border-strong px-4 py-2 text-sm text-fg-secondary hover:bg-surface-2 disabled:opacity-50"
                      @click="createPlan(drafts[plan.id])"
                    >
                      Create yearly twin
                    </button>
                  </div>
                  <p v-if="planErrors[plan.id]" role="alert" class="text-sm text-danger">{{ planErrors[plan.id] }}</p>
                  <ul v-if="planWarnings[plan.id]?.length" class="space-y-1 text-xs text-warning">
                    <li v-for="w in planWarnings[plan.id]" :key="w">{{ w }}</li>
                  </ul>
                </form>

                <!-- The live preview: the unsaved draft, drawn by the real card. -->
                <aside>
                  <p class="mb-2 text-xs font-medium uppercase tracking-wide text-fg-muted">Preview</p>
                  <BillingPlanCard
                    :plan="drafts[plan.id] as ClubSubscriptionPlanDto"
                    :saving="computedSaving(drafts[plan.id])"
                    hide-action
                  />
                </aside>
              </div>
            </article>

            <div class="flex flex-wrap items-center gap-2">
              <button
                type="button"
                :disabled="creating"
                class="rounded-lg border border-border-strong px-4 py-2 text-sm text-fg-secondary hover:bg-surface-2 disabled:opacity-50"
                @click="createPlan()"
              >
                {{ creating ? 'Creating…' : 'New plan' }}
              </button>
              <p v-if="createError" role="alert" class="text-sm text-danger">{{ createError }}</p>
            </div>
          </template>
        </section>

        <!-- ========================================================== Billing -->
        <section v-else-if="tab === 'billing'" id="subs-panel-billing" role="tabpanel" aria-labelledby="subs-tab-billing" class="space-y-4">
          <div class="rounded-xl bg-surface p-5 shadow-card">
            <h2 class="text-body-2 font-medium text-fg">Billing mode</h2>
            <p class="mt-1 text-sm text-fg-muted">
              Whether a club can buy a plan at all. Not a feature flag on purpose: flags are cached
              for 30 seconds, and this gates money.
            </p>
            <div class="mt-4 flex flex-wrap items-center gap-3">
              <UiSegmented v-model="billingDraft.billing_mode" :items="modeItems" label="Billing mode" />
              <span class="rounded-pill border border-border px-3 py-1 text-sm text-fg-muted line-through" aria-disabled="true">Live</span>
              <span class="text-xs text-fg-muted">No gateway is configured. ADR-006 is open.</span>
            </div>

            <label class="mt-5 block text-xs text-fg-muted">Test-mode notice (shown at the top of checkout)
              <textarea v-model="billingDraft.billing_notice" :class="inputClass" rows="2" :placeholder="DEFAULT_NOTICE" />
            </label>
            <div class="mt-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning" role="status">
              {{ billingDraft.billing_notice || DEFAULT_NOTICE }}
            </div>

            <label class="mt-5 block text-xs text-fg-muted">Grace days after a period ends
              <input v-model.number="billingDraft.subscription_grace_days" type="number" min="0" max="90" :class="inputClass" class="sm:w-32" />
            </label>

            <div class="mt-5 flex items-center gap-3">
              <button
                type="button"
                :disabled="savingBilling"
                class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
                @click="saveBilling"
              >
                {{ savingBilling ? 'Saving…' : 'Save billing settings' }}
              </button>
              <p v-if="billingError" role="alert" class="text-sm text-danger">{{ billingError }}</p>
            </div>
          </div>

          <div class="rounded-xl bg-surface p-5 shadow-card">
            <h2 class="text-body-2 font-medium text-fg">What happens in Test mode</h2>
            <dl class="mt-3 space-y-2 text-sm">
              <div class="flex items-baseline justify-between gap-4">
                <dt class="text-fg-secondary">Charged</dt>
                <dd class="text-fg">Nothing. Every transaction records ₱0.00 and is tagged Test.</dd>
              </div>
              <div class="flex items-baseline justify-between gap-4">
                <dt class="text-fg-secondary">Activation</dt>
                <dd class="text-fg">Immediate, for one billing period; the daily sweep closes it when the period ends.</dd>
              </div>
              <div class="flex items-baseline justify-between gap-4">
                <dt class="text-fg-secondary">Verified badge</dt>
                <dd class="text-fg">An eligible plan queues the club for review. You still approve it.</dd>
              </div>
              <div class="flex items-baseline justify-between gap-4">
                <dt class="text-fg-secondary">Webhooks</dt>
                <dd class="text-fg">Return 501, deliberately, until a provider is chosen.</dd>
              </div>
            </dl>
            <p v-if="!canBuyAnything" class="mt-3 text-xs text-warning">
              Right now nothing can be bought: either billing is off or no paid plan is public and
              active. Clubs see "Paid plans are not on sale yet."
            </p>
          </div>
        </section>

        <!-- ============================================================ Clubs -->
        <section v-else id="subs-panel-clubs" role="tabpanel" aria-labelledby="subs-tab-clubs" class="space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-sm text-fg-muted">
              Grant is the only route to a paid plan while nothing is on sale. Cancel here is
              immediate — the way to see a lapse happen without waiting a month.
            </p>
            <button
              type="button"
              class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover"
              @click="openGrant"
            >
              Grant a plan
            </button>
          </div>

          <div v-if="subsPending" class="h-40 animate-pulse rounded-xl bg-surface-2" />
          <UiEmptyState
            v-else-if="!subRows.length"
            title="No club subscriptions yet"
            message="Every club is on the free plan. Grant one to see the paid flow end to end."
            icon="card"
            action-label="Grant a plan"
            @action="openGrant"
          />
          <div v-else class="scroll-x rounded-xl bg-surface shadow-card">
            <table class="w-full min-w-[56rem] text-sm">
              <thead>
                <tr class="text-left text-xs uppercase tracking-wide text-fg-muted">
                  <th class="px-4 py-3 font-medium">Club</th>
                  <th class="px-4 py-3 font-medium">Plan</th>
                  <th class="px-4 py-3 font-medium">Status</th>
                  <th class="px-4 py-3 font-medium">Period ends</th>
                  <th class="px-4 py-3 font-medium">Source</th>
                  <th class="px-4 py-3 font-medium">Payment</th>
                  <th class="px-4 py-3 font-medium"><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in subRows" :key="row.subscription.id" class="border-t border-border">
                  <td class="px-4 py-3">
                    <NuxtLink :to="`/clubs/${row.club.id}`" class="font-medium text-fg hover:underline">{{ row.club.name }}</NuxtLink>
                    <p class="text-xs text-fg-muted">{{ row.club.verification_status }}</p>
                  </td>
                  <td class="px-4 py-3 text-fg-secondary">{{ row.plan?.name ?? '—' }}</td>
                  <td class="px-4 py-3">
                    <UiStatusPill :status="statusTone(row.subscription.status)" size="sm" />
                    <p v-if="row.subscription.ended_at" class="mt-1 text-xs text-fg-muted">Ended {{ fmtDate(row.subscription.ended_at) }}</p>
                    <p v-else-if="row.subscription.cancel_at_period_end" class="mt-1 text-xs text-fg-muted">Ends at period end</p>
                  </td>
                  <td class="px-4 py-3 tabular-nums text-fg-secondary">{{ fmtDate(row.subscription.current_period_end) }}</td>
                  <td class="px-4 py-3 text-fg-secondary">
                    {{ SOURCE_LABEL[row.source] ?? row.source }}
                    <p class="text-xs text-fg-muted">{{ row.subscription.provider }}</p>
                  </td>
                  <td class="px-4 py-3 tabular-nums text-fg-secondary">
                    <template v-if="row.last_transaction">
                      {{ formatPlanPrice(row.last_transaction.amount_cents, row.last_transaction.currency, { freeLabel: '₱0.00' }) }}
                      · {{ row.last_transaction.status }}
                      <span v-if="row.last_transaction.is_test" class="ml-1 rounded-pill bg-warning-soft px-2 py-0.5 text-xs text-warning">Test</span>
                    </template>
                    <span v-else class="text-fg-muted">No payment</span>
                  </td>
                  <td class="px-4 py-3 text-right">
                    <template v-if="!row.subscription.ended_at">
                      <button type="button" class="text-xs text-primary hover:underline" @click="openAction(row, 'extend')">Extend</button>
                      <button type="button" class="ml-3 text-xs text-danger hover:underline" @click="openAction(row, 'cancel')">Cancel</button>
                    </template>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </div>

    <!-- Grant modal -->
    <UiModal v-model="grantOpen" title="Grant a plan" :loading="grantBusy" confirm-label="Grant" @confirm="submitGrant">
      <div class="space-y-3">
        <label class="block text-xs text-fg-muted">Club
          <input v-model="clubQuery" :class="inputClass" placeholder="Search by name" autocomplete="off" />
          <ul v-if="clubResults.length" class="mt-1 max-h-40 overflow-auto rounded-lg border border-border bg-surface text-sm">
            <li v-for="c in clubResults" :key="c.id">
              <button type="button" class="block w-full px-3 py-2 text-left text-fg hover:bg-surface-2" @click="pickClub(c)">{{ c.name }}</button>
            </li>
          </ul>
          <p v-if="grantForm.club_id" class="mt-1 text-xs text-success">Selected: {{ grantForm.club_name }}</p>
        </label>
        <label class="block text-xs text-fg-muted">Plan
          <select v-model="grantForm.plan_id" :class="inputClass">
            <option v-for="p in grantablePlans" :key="p.id" :value="p.id">{{ p.name }} — {{ formatPlanPrice(p.price_cents, p.currency) }}</option>
          </select>
          <p v-if="!grantablePlans.length" class="mt-1 text-xs text-warning">No active paid plan. Activate one on the Plans tab first.</p>
        </label>
        <label class="block text-xs text-fg-muted">Months
          <input v-model.number="grantForm.months" type="number" min="1" max="36" :class="inputClass" />
        </label>
        <label class="block text-xs text-fg-muted">Notes
          <textarea v-model="grantForm.notes" :class="inputClass" rows="2" placeholder="Why this club is being granted a plan" />
        </label>
        <p v-if="grantError" role="alert" class="text-sm text-danger">{{ grantError }}</p>
      </div>
    </UiModal>

    <!-- Extend / cancel modal -->
    <UiModal
      :model-value="actionRow !== null"
      :title="actionKind === 'extend' ? `Extend ${actionRow?.club.name ?? ''}` : `Cancel ${actionRow?.club.name ?? ''} now?`"
      :description="actionKind === 'cancel' ? 'Immediate. The club drops to the free plan today; all but its oldest unfinished event of each type are held until it resubscribes. Nothing is deleted.' : null"
      :loading="actionBusy"
      :destructive="actionKind === 'cancel'"
      :confirm-label="actionKind === 'extend' ? 'Extend' : 'Cancel subscription'"
      @update:model-value="(v) => { if (!v) actionRow = null }"
      @confirm="submitAction"
    >
      <div class="space-y-3">
        <label v-if="actionKind === 'extend'" class="block text-xs text-fg-muted">Months to add
          <input v-model.number="actionForm.months" type="number" min="1" max="36" :class="inputClass" />
        </label>
        <label class="block text-xs text-fg-muted">Notes
          <textarea v-model="actionForm.notes" :class="inputClass" rows="2" />
        </label>
        <p v-if="actionError" role="alert" class="text-sm text-danger">{{ actionError }}</p>
      </div>
    </UiModal>
  </div>
</template>
