import type {
  CreatePlanInput,
  SubscriptionRepository,
  UpdatePlanInput
} from '../repositories/subscription.repository'
import type { PlatformAdminService } from '../../platform/services/platform-admin.service'
import type { PlatformConfigRepository } from '../../platform/repositories/platform-config.repository'
import type { AdminClubSubscriptionPlanDto, BillingMode } from '../dto/subscription.dto'
import { toAdminClubSubscriptionPlanDto } from '../dto/subscription.dto'

export class SubscriptionPlanAdminServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export interface BillingSettingsDto {
  billing_mode: BillingMode
  billing_notice: string | null
  subscription_grace_days: number
}

export interface UpdateBillingSettingsDto {
  billing_mode?: BillingMode
  billing_notice?: string | null
  subscription_grace_days?: number
}

/** What the SuperAdmin may send. `plan_type` is forced to 'club' on create. */
export type AdminCreatePlanDto = Omit<CreatePlanInput, 'plan_type'>
export type AdminUpdatePlanDto = UpdatePlanInput

/**
 * A saved plan plus the things worth saying about it that are not refusals.
 * The refusals come back as thrown errors with a sentence; the warnings ride
 * alongside a success so the page can show them without blocking the save.
 */
export interface PlanSaveResult {
  plan: AdminClubSubscriptionPlanDto
  warnings: string[]
}

export interface SubscriptionPlanAdminService {
  listPlans(actingUserId: string): Promise<AdminClubSubscriptionPlanDto[]>
  createPlan(actingUserId: string, input: AdminCreatePlanDto): Promise<PlanSaveResult>
  updatePlan(actingUserId: string, planId: string, input: AdminUpdatePlanDto): Promise<PlanSaveResult>
  getBilling(actingUserId: string): Promise<BillingSettingsDto>
  updateBilling(actingUserId: string, input: UpdateBillingSettingsDto): Promise<BillingSettingsDto>
}

const BILLING_MODES: BillingMode[] = ['off', 'simulated', 'live']
const MAX_NAME = 60
const MAX_BULLETS = 12
const MAX_FIGURES = 4

function trimOrNull(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  const t = value.trim()
  return t.length === 0 ? null : t
}

/**
 * Plan CRUD behind the SuperAdmin.
 *
 * Validation comes back as sentences, the `fee-rules.put.ts` discipline. And,
 * unlike fee rules, plans are **per-row CRUD with soft deactivation only**:
 * `club_subscriptions.plan_id` is a foreign key, so a delete-and-reinsert
 * would orphan every subscription. There is no delete here and no route for
 * one.
 */
export function createSubscriptionPlanAdminService(
  plans: SubscriptionRepository,
  platformAdmin: PlatformAdminService,
  platformConfig: PlatformConfigRepository
): SubscriptionPlanAdminService {
  async function requireSuperAdmin(actingUserId: string) {
    const isAdmin = await platformAdmin.isSuperAdmin(actingUserId)
    if (!isAdmin) {
      throw new SubscriptionPlanAdminServiceError(
        403,
        'FORBIDDEN',
        'Only the platform super admin can manage subscription plans.'
      )
    }
  }

  function refuse(message: string): never {
    throw new SubscriptionPlanAdminServiceError(400, 'VALIDATION_ERROR', message)
  }

  /**
   * Field-level checks that apply to both create and update. `merged` is what
   * the row will look like after the write, which is the only thing the
   * cross-field rules can be judged against.
   */
  function validateShape(merged: {
    name?: string
    price_cents?: number
    billing_interval?: string
    marketing_bullets?: string[] | null
    headline_figures?: { value: string; label: string }[] | null
    max_draft_events?: number | null
    max_live_tournaments?: number | null
    max_live_open_play?: number | null
    max_members?: number | null
    sort_order?: number
    is_default_free?: boolean
    verified_badge_eligible?: boolean
  }) {
    if (merged.name !== undefined) {
      if (merged.name.trim().length === 0) refuse('Give the plan a name.')
      if (merged.name.length > MAX_NAME) refuse(`Keep the plan name under ${MAX_NAME} characters.`)
    }
    if (merged.price_cents !== undefined) {
      if (!Number.isInteger(merged.price_cents) || merged.price_cents < 0) {
        refuse('The price must be a whole number of centavos, zero or more.')
      }
    }
    if (merged.billing_interval === 'one_time') {
      refuse('A club plan renews monthly or yearly; one-time plans are not club plans.')
    }
    for (const [key, label] of [
      ['max_draft_events', 'draft events'],
      ['max_live_tournaments', 'live tournaments'],
      ['max_live_open_play', 'live open play sessions'],
      ['max_members', 'members']
    ] as const) {
      const v = merged[key]
      if (v === undefined || v === null) continue
      if (!Number.isInteger(v) || v < 0) {
        refuse(`The ${label} limit must be a whole number, or unlimited.`)
      }
    }
    if (merged.sort_order !== undefined && !Number.isInteger(merged.sort_order)) {
      refuse('Sort order must be a whole number.')
    }
    if (merged.marketing_bullets && merged.marketing_bullets.length > MAX_BULLETS) {
      refuse(`Keep it to ${MAX_BULLETS} bullets or fewer.`)
    }
    if (merged.headline_figures && merged.headline_figures.length > MAX_FIGURES) {
      refuse(`Keep it to ${MAX_FIGURES} headline figures or fewer.`)
    }
    if (merged.is_default_free) {
      if ((merged.price_cents ?? 0) > 0) {
        refuse('The default free plan cannot have a price.')
      }
      if (merged.verified_badge_eligible) {
        refuse(
          'The default free plan cannot be verified-badge eligible — that would queue every club on the platform for review.'
        )
      }
    }
  }

  async function warningsFor(planId: string | null, merged: {
    is_public?: boolean
    price_cents?: number
    plan_group?: string | null
    billing_interval?: string
  }): Promise<string[]> {
    const warnings: string[] = []
    if (merged.is_public && (merged.price_cents ?? 0) > 0 && !merged.plan_group) {
      warnings.push(
        'This is a public priced plan with no plan group, so it cannot be paired with a yearly or monthly twin on the pricing page.'
      )
    }
    if (merged.billing_interval === 'year' && merged.plan_group) {
      const all = await plans.listPlansForAdmin('club')
      const monthlyTwin = all.find(
        (p) => p.id !== planId && p.plan_group === merged.plan_group && p.billing_interval === 'month'
      )
      if (!monthlyTwin) {
        warnings.push('A yearly plan with no monthly sibling has no saving to advertise.')
      }
    }
    return warnings
  }

  function sanitise<T extends AdminCreatePlanDto | AdminUpdatePlanDto>(input: T): T {
    const out = { ...input }
    if (typeof out.name === 'string') out.name = out.name.trim()
    out.description = trimOrNull(out.description)
    out.tagline = trimOrNull(out.tagline)
    out.badge_label = trimOrNull(out.badge_label)
    out.cta_label = trimOrNull(out.cta_label)
    out.savings_label = trimOrNull(out.savings_label)
    out.plan_group = trimOrNull(out.plan_group)
    if (out.marketing_bullets) {
      out.marketing_bullets = out.marketing_bullets.map((b) => b.trim()).filter(Boolean)
    }
    if (out.headline_figures) {
      out.headline_figures = out.headline_figures
        .map((f) => ({ value: f.value.trim(), label: f.label.trim() }))
        .filter((f) => f.value && f.label)
    }
    // Strip undefined so a PATCH does not null out untouched columns.
    return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as T
  }

  return {
    async listPlans(actingUserId) {
      await requireSuperAdmin(actingUserId)
      const rows = await plans.listPlansForAdmin('club')
      return rows.map(toAdminClubSubscriptionPlanDto)
    },

    async createPlan(actingUserId, input) {
      await requireSuperAdmin(actingUserId)
      const clean = sanitise(input)
      if (!clean.name) refuse('Give the plan a name.')
      if (clean.billing_interval !== 'month' && clean.billing_interval !== 'year') {
        refuse('Choose monthly or yearly billing.')
      }
      validateShape({ ...clean, is_default_free: false })

      const created = await plans.createPlan({ ...clean, plan_type: 'club' })
      return {
        plan: toAdminClubSubscriptionPlanDto(created),
        warnings: await warningsFor(created.id, created)
      }
    },

    async updatePlan(actingUserId, planId, input) {
      await requireSuperAdmin(actingUserId)
      const existing = await plans.getClubPlanById(planId)
      if (!existing || existing.plan_type !== 'club') {
        throw new SubscriptionPlanAdminServiceError(404, 'NOT_FOUND', 'Plan not found.')
      }

      const clean = sanitise(input)
      const merged = { ...existing, ...clean }
      validateShape(merged)

      // The default free plan must stay reachable: it is what every club with
      // no subscription resolves to, and deactivating it would send them all to
      // the SAFE_DEFAULT fallback with no plan name to show.
      if (existing.is_default_free && clean.is_active === false) {
        refuse('The default free plan cannot be deactivated.')
      }
      if (existing.is_default_free && clean.is_public === false) {
        refuse('The default free plan is what every club starts on; keep it public.')
      }

      const updated = await plans.updatePlan(planId, clean)
      return {
        plan: toAdminClubSubscriptionPlanDto(updated),
        warnings: await warningsFor(planId, updated)
      }
    },

    async getBilling(actingUserId) {
      await requireSuperAdmin(actingUserId)
      const config = await platformConfig.getConfig()
      return {
        billing_mode: config?.billing_mode ?? 'off',
        billing_notice: config?.billing_notice ?? null,
        subscription_grace_days: config?.subscription_grace_days ?? 7
      }
    },

    async updateBilling(actingUserId, input) {
      await requireSuperAdmin(actingUserId)
      const patch: UpdateBillingSettingsDto = {}

      if (input.billing_mode !== undefined) {
        if (!BILLING_MODES.includes(input.billing_mode)) {
          refuse('Billing mode must be off, simulated or live.')
        }
        if (input.billing_mode === 'live') {
          // Refused here, not merely disabled in the UI: a mode that no code
          // can honour must not be persistable by a well-formed request.
          throw new SubscriptionPlanAdminServiceError(
            501,
            'GATEWAY_NOT_CONFIGURED',
            'Live billing cannot be switched on: no payment provider is configured. See ADR-006.'
          )
        }
        patch.billing_mode = input.billing_mode
      }
      if (input.billing_notice !== undefined) {
        patch.billing_notice = trimOrNull(input.billing_notice) ?? null
      }
      if (input.subscription_grace_days !== undefined) {
        const days = input.subscription_grace_days
        if (!Number.isInteger(days) || days < 0 || days > 90) {
          refuse('Grace days must be a whole number from 0 to 90.')
        }
        patch.subscription_grace_days = days
      }

      const saved = await platformConfig.updateBilling(patch)
      return {
        billing_mode: saved.billing_mode,
        billing_notice: saved.billing_notice,
        subscription_grace_days: saved.subscription_grace_days
      }
    }
  }
}
