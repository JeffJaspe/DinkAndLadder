import type { SubscriptionRepository } from '../repositories/subscription.repository'
import type { TransactionRepository } from '../repositories/transaction.repository'
import type { PlatformConfigRepository } from '../../platform/repositories/platform-config.repository'
import type { PlatformAdminService } from '../../platform/services/platform-admin.service'
import type { ClubMembershipRepository } from '../../club/repositories/club-membership.repository'
import type { ClubRepository } from '../../club/repositories/club.repository'
import type { ClubVerificationService } from '../../club/services/club-verification.service'
import type { EventRepository } from '../../event/repositories/event.repository'
import type { EventRecord } from '../../event/dto/event.dto'
import type { ClubEntitlementsService } from './club-entitlements.service'
import type { PaymentGateway } from '../gateways/payment-gateway'
import { resolvePaymentGateway, PaymentGatewayError } from '../gateways'
import type {
  BillingMode,
  ClubPlanRecord,
  ClubSubscriptionRecord,
  SubscriptionStatus
} from '../dto/subscription.dto'
import { toClubSubscriptionDto, toClubSubscriptionPlanDto } from '../dto/subscription.dto'
import type { PaymentTransactionRecord } from '../dto/transaction.dto'
import { toPaymentTransactionDto } from '../dto/transaction.dto'
import type {
  AdminClubSubscriptionRowDto,
  CheckoutResultDto,
  ClubBillingDto,
  RestrictedEventSummary
} from '../dto/club-billing.dto'

export class ClubSubscriptionServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

const ADMIN_ROLES = ['OWNER', 'ADMIN']
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The events repository, narrowed to what billing may touch. Billing must not
 * be able to reach `update`, `cancel` or anything else on an event: restriction
 * is a separate nullable timestamp precisely so a billing state cannot leak
 * into the event's own lifecycle.
 */
export type BillingEventRepository = Pick<
  EventRepository,
  'countByClubForLimits' | 'findRestrictableForClub' | 'setRestricted'
>

export interface ClubSubscriptionService {
  /** Everything the billing page shows, resolved at one instant. */
  getForClub(actingPlayerId: string, clubId: string): Promise<ClubBillingDto>
  startCheckout(
    actingPlayerId: string,
    clubId: string,
    planId: string,
    idempotencyKey: string,
    voucherCode?: string | null
  ): Promise<CheckoutResultDto>
  /** Cancel at period end. The club keeps what it paid for. */
  cancel(actingPlayerId: string, clubId: string): Promise<ClubBillingDto>

  /* --- SuperAdmin --- */
  listForAdmin(actingUserId: string): Promise<AdminClubSubscriptionRowDto[]>
  grant(
    actingUserId: string,
    clubId: string,
    planId: string,
    months: number,
    notes?: string | null
  ): Promise<AdminClubSubscriptionRowDto>
  extend(
    actingUserId: string,
    subscriptionId: string,
    months: number,
    notes?: string | null
  ): Promise<AdminClubSubscriptionRowDto>
  /** Immediate. The only way to see a lapse happen without waiting a month. */
  adminCancel(
    actingUserId: string,
    subscriptionId: string,
    notes?: string | null
  ): Promise<AdminClubSubscriptionRowDto>

  /* --- Lapse --- */
  /**
   * On downgrade to free, the OLDEST unfinished event of each type stays live
   * and every other one is restricted. Nothing is cancelled. Returns how many
   * events were restricted.
   */
  applyDowngradeRestrictions(clubId: string): Promise<number>
  /** Resubscribing clears every restriction in one call. Returns how many were cleared. */
  clearDowngradeRestrictions(clubId: string): Promise<number>
  /**
   * The scheduled sweep: closes subscriptions whose paid period (plus grace,
   * for `past_due`) has run out, restricts their events and revokes a
   * subscription-sourced badge. Idempotent — a closed row has `ended_at` set
   * and is never read again.
   */
  sweepLapsed(): Promise<{ lapsed: string[]; restricted: number }>
}

export interface ClubSubscriptionServiceDeps {
  subscriptions: SubscriptionRepository
  transactions: TransactionRepository
  platformConfig: PlatformConfigRepository
  platformAdmin: PlatformAdminService
  memberships: ClubMembershipRepository
  clubs: ClubRepository
  events: BillingEventRepository
  entitlements: ClubEntitlementsService
  verification: ClubVerificationService
}

export interface ClubSubscriptionServiceOptions {
  /** Injectable clock, as in the entitlements service. */
  now?: () => Date
  /** Test seam. Production resolves from `billing_mode`. */
  gateway?: (mode: BillingMode) => PaymentGateway
}

/** Whole calendar months forward, on the same day where the month has it. */
export function addMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime())
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, lastDay))
  return d
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505'
}

/**
 * Which of a club's unfinished events survive a downgrade.
 *
 * One per "type" as the limits count types: `tournament` on its own, everything
 * else together as open play. Drafts are a third bucket — the free tier allows
 * one draft, so one draft survives. Oldest by `start_date`, then `created_at`,
 * because the oldest is the one people have already made plans around.
 */
export function chooseEventsToRestrict(events: EventRecord[]): EventRecord[] {
  const sorted = [...events].sort((a, b) => {
    const byDate = a.start_date.localeCompare(b.start_date)
    return byDate !== 0 ? byDate : a.created_at.localeCompare(b.created_at)
  })

  const survivors = new Set<string>()
  const buckets = new Set<string>()
  for (const ev of sorted) {
    const bucket =
      ev.status === 'draft'
        ? 'draft'
        : ['tournament', 'tournament_casual', 'tournament_club'].includes(ev.event_type)
          ? 'tournament'
          : 'open_play'
    if (!buckets.has(bucket)) {
      buckets.add(bucket)
      survivors.add(ev.id)
    }
  }

  return sorted.filter((ev) => !survivors.has(ev.id) && ev.restricted_at === null)
}

export function createClubSubscriptionService(
  deps: ClubSubscriptionServiceDeps,
  options: ClubSubscriptionServiceOptions = {}
): ClubSubscriptionService {
  const {
    subscriptions,
    transactions,
    platformConfig,
    platformAdmin,
    memberships,
    clubs,
    events,
    entitlements,
    verification
  } = deps
  const clock = options.now ?? (() => new Date())
  const gatewayFor = options.gateway ?? resolvePaymentGateway

  async function assertClubAdmin(actingPlayerId: string, clubId: string) {
    const membership = await memberships.findByClubAndPlayer(clubId, actingPlayerId)
    if (!membership || membership.status !== 'active' || !ADMIN_ROLES.includes(membership.role)) {
      throw new ClubSubscriptionServiceError(
        403,
        'FORBIDDEN',
        'Only the club owner or an admin can manage the club plan.'
      )
    }
  }

  async function requireSuperAdmin(actingUserId: string) {
    const isAdmin = await platformAdmin.isSuperAdmin(actingUserId)
    if (!isAdmin) {
      throw new ClubSubscriptionServiceError(
        403,
        'FORBIDDEN',
        'Only the platform super admin can manage club subscriptions.'
      )
    }
  }

  async function readBilling() {
    const config = await platformConfig.getConfig()
    return {
      mode: (config?.billing_mode ?? 'off') as BillingMode,
      notice: config?.billing_notice ?? null,
      graceDays: config?.subscription_grace_days ?? 7
    }
  }

  async function loadPurchasablePlan(planId: string): Promise<ClubPlanRecord> {
    const plan = await subscriptions.getClubPlanById(planId)
    if (!plan || plan.plan_type !== 'club') {
      throw new ClubSubscriptionServiceError(404, 'PLAN_NOT_FOUND', 'That plan does not exist.')
    }
    if (!plan.is_active) {
      throw new ClubSubscriptionServiceError(
        409,
        'PLAN_UNAVAILABLE',
        'That plan is not on sale right now.'
      )
    }
    if (plan.is_default_free) {
      throw new ClubSubscriptionServiceError(
        409,
        'PLAN_IS_FREE',
        'The free plan is what every club has already; there is nothing to buy.'
      )
    }
    if (plan.billing_interval === 'one_time') {
      throw new ClubSubscriptionServiceError(
        409,
        'PLAN_UNAVAILABLE',
        'A club plan must renew monthly or yearly.'
      )
    }
    return plan
  }

  function periodFor(plan: ClubPlanRecord, from: Date, months?: number) {
    const span = months ?? (plan.billing_interval === 'year' ? 12 : 1)
    return {
      current_period_start: from.toISOString(),
      current_period_end: addMonths(from, span).toISOString()
    }
  }

  /**
   * Any live row the club still has is closed before a new one is inserted.
   * `ux_club_subscriptions_one_live` would refuse the insert otherwise; doing
   * it here makes the replacement explicit and records when the old row ended.
   */
  async function closeLiveRows(clubId: string, now: Date, notes: string | null) {
    const live = await subscriptions.listClubSubscriptions({
      clubId,
      status: ['active', 'trialing', 'past_due']
    })
    for (const row of live) {
      await subscriptions.updateClubSubscription(row.id, {
        status: 'canceled',
        canceled_at: now.toISOString(),
        ended_at: now.toISOString(),
        notes: notes ?? row.notes
      })
    }
  }

  async function restrictedEvents(clubId: string): Promise<RestrictedEventSummary[]> {
    const rows = await events.findRestrictableForClub(clubId)
    return rows
      .filter((ev) => ev.restricted_at !== null)
      .map((ev) => ({
        id: ev.id,
        name: ev.name,
        event_type: ev.event_type,
        start_date: ev.start_date,
        restricted_at: ev.restricted_at as string
      }))
  }

  async function billingFor(clubId: string): Promise<ClubBillingDto> {
    const [sub, resolved, counts, roster, billing, held, history] = await Promise.all([
      subscriptions.findLatestForClub(clubId),
      entitlements.resolve(clubId),
      events.countByClubForLimits(clubId),
      memberships.listByClub(clubId),
      readBilling(),
      restrictedEvents(clubId),
      transactions.listByClub(clubId, 20)
    ])
    const plan = sub ? await subscriptions.getClubPlanById(sub.plan_id) : null

    return {
      subscription: sub ? toClubSubscriptionDto(sub) : null,
      plan: plan ? toClubSubscriptionPlanDto(plan) : null,
      entitlements: resolved,
      usage: {
        drafts: counts.drafts,
        live_tournaments: counts.liveTournaments,
        live_open_play: counts.liveOpenPlay,
        members: roster.filter((m) => m.status === 'active').length
      },
      billing: { mode: billing.mode, notice: billing.notice },
      restricted_events: held,
      transactions: history.map(toPaymentTransactionDto)
    }
  }

  async function adminRow(sub: ClubSubscriptionRecord): Promise<AdminClubSubscriptionRowDto> {
    const [club, plan, history] = await Promise.all([
      clubs.findById(sub.club_id),
      subscriptions.getClubPlanById(sub.plan_id),
      transactions.listByClub(sub.club_id, 20)
    ])
    const last = history.find((t) => t.subscription_id === sub.id) ?? null
    return {
      subscription: toClubSubscriptionDto(sub),
      club: club
        ? { id: club.id, name: club.name, verification_status: club.verification_status }
        : { id: sub.club_id, name: 'Unknown club', verification_status: 'unverified' },
      plan: plan ? { id: plan.id, name: plan.name } : null,
      source: sub.source,
      last_transaction: last ? toPaymentTransactionDto(last) : null
    }
  }

  /** Everything that follows a subscription stopping, in one place. */
  async function onLapse(clubId: string) {
    const restricted = await service.applyDowngradeRestrictions(clubId)
    await verification.onSubscriptionLapsed(clubId)
    return restricted
  }

  /** Everything that follows a subscription starting, in one place. */
  async function onActivate(clubId: string, plan: ClubPlanRecord) {
    await service.clearDowngradeRestrictions(clubId)
    if (plan.verified_badge_eligible) {
      return verification.requestVerificationFromSubscription(clubId)
    }
    return false
  }

  const service: ClubSubscriptionService = {
    async getForClub(actingPlayerId, clubId) {
      await assertClubAdmin(actingPlayerId, clubId)
      return billingFor(clubId)
    },

    async startCheckout(actingPlayerId, clubId, planId, idempotencyKey, voucherCode) {
      await assertClubAdmin(actingPlayerId, clubId)

      // Vouchers are a contract placeholder, not a feature. Refusing every code
      // with a real error is more honest than a field that silently does
      // nothing; recorded as deferred in ADR-007.
      if (voucherCode && voucherCode.trim().length > 0) {
        throw new ClubSubscriptionServiceError(
          400,
          'VOUCHER_UNKNOWN',
          'That voucher code is not recognised. Vouchers are not available yet.'
        )
      }

      // 1. May anything be bought at all?
      const billing = await readBilling()
      let gateway: PaymentGateway
      try {
        gateway = gatewayFor(billing.mode)
      } catch (err) {
        if (err instanceof PaymentGatewayError) {
          throw new ClubSubscriptionServiceError(err.status, err.code, err.message)
        }
        throw err
      }

      // 2. Is this a plan a club can buy?
      const plan = await loadPurchasablePlan(planId)

      // 3. Charge — or, with the simulated gateway, do not.
      const result = await gateway.createSubscriptionCheckout({
        club_id: clubId,
        plan_id: plan.id,
        plan_name: plan.name,
        list_price_cents: plan.price_cents,
        currency: plan.currency,
        // `one_time` was refused by loadPurchasablePlan above.
        billing_interval: plan.billing_interval === 'year' ? 'year' : 'month',
        idempotency_key: idempotencyKey
      })

      if (result.outcome === 'failed') {
        throw new ClubSubscriptionServiceError(
          402,
          'PAYMENT_FAILED',
          result.failure_reason ?? 'The payment did not go through.'
        )
      }

      if (result.outcome === 'requires_redirect') {
        // No configured gateway produces this today; when one does, the
        // subscription is activated by its webhook, not here.
        throw new ClubSubscriptionServiceError(
          501,
          'GATEWAY_NOT_CONFIGURED',
          'This payment method needs a redirect flow that is not built yet.'
        )
      }

      const now = clock()

      // 4. Record the transaction FIRST. A transaction with no subscription is
      //    a reconcilable orphan; a subscription with no transaction is an
      //    unexplained grant. `charged_cents`, never the list price.
      let transaction: PaymentTransactionRecord
      try {
        transaction = await transactions.create({
          club_id: clubId,
          amount_cents: result.charged_cents,
          currency: plan.currency,
          status: 'succeeded',
          transaction_type: 'subscription',
          description: `${plan.name} (${plan.billing_interval}ly)`,
          provider: result.provider,
          provider_reference: result.provider_reference,
          is_test: result.is_test,
          metadata: {
            list_price_cents: plan.price_cents,
            idempotency_key: idempotencyKey,
            acting_player_id: actingPlayerId
          }
        })
      } catch (err) {
        if (!isUniqueViolation(err)) throw err
        // Already processed: the exact branch a retrying webhook will need.
        const existing = await transactions.findByProviderReference(
          result.provider,
          result.provider_reference
        )
        const current = await subscriptions.findLatestForClub(clubId)
        if (!existing || !current) throw err
        return {
          outcome: 'already_processed',
          subscription: toClubSubscriptionDto(current),
          transaction: toPaymentTransactionDto(existing),
          redirect_url: null,
          verification_requested: false
        }
      }

      // 5. Replace whatever live row exists with the new one.
      await closeLiveRows(clubId, now, 'Replaced by a new checkout.')
      const subscription = await subscriptions.createClubSubscription({
        club_id: clubId,
        plan_id: plan.id,
        status: 'active',
        provider: result.provider,
        source: result.is_test ? 'simulated_checkout' : 'self_serve',
        provider_subscription_id: result.provider_reference,
        ...periodFor(plan, now)
      })

      // Tie the two rows together now that both exist.
      await transactions.updateSubscription(transaction.id, subscription.id)

      // 6 & 7.
      const verificationRequested = await onActivate(clubId, plan)

      return {
        outcome: 'activated',
        subscription: toClubSubscriptionDto(subscription),
        transaction: toPaymentTransactionDto({ ...transaction, subscription_id: subscription.id }),
        redirect_url: null,
        verification_requested: verificationRequested
      }
    },

    async cancel(actingPlayerId, clubId) {
      await assertClubAdmin(actingPlayerId, clubId)
      const sub = await subscriptions.findLatestForClub(clubId)
      const live: SubscriptionStatus[] = ['active', 'trialing', 'past_due']
      if (!sub || !live.includes(sub.status)) {
        throw new ClubSubscriptionServiceError(
          409,
          'NO_ACTIVE_SUBSCRIPTION',
          'This club has no plan to cancel.'
        )
      }

      const now = clock()
      // Cancel at period end. The lapse sweep closes it when the period runs
      // out; until then the entitlements resolver honours the paid month.
      await subscriptions.updateClubSubscription(sub.id, {
        status: 'canceled',
        cancel_at_period_end: true,
        canceled_at: now.toISOString(),
        // A subscription with no period end cancels immediately in the resolver;
        // give it one so the club keeps the rest of what it was granted.
        current_period_end: sub.current_period_end ?? now.toISOString()
      })

      return billingFor(clubId)
    },

    async listForAdmin(actingUserId) {
      await requireSuperAdmin(actingUserId)
      const rows = await subscriptions.listClubSubscriptions({ limit: 200 })
      return Promise.all(rows.map(adminRow))
    },

    async grant(actingUserId, clubId, planId, months, notes) {
      await requireSuperAdmin(actingUserId)
      if (!Number.isInteger(months) || months < 1 || months > 36) {
        throw new ClubSubscriptionServiceError(
          400,
          'VALIDATION_ERROR',
          'Grant between 1 and 36 whole months.'
        )
      }
      const club = await clubs.findById(clubId)
      if (!club) {
        throw new ClubSubscriptionServiceError(404, 'NOT_FOUND', 'Club not found.')
      }
      const plan = await loadPurchasablePlan(planId)
      const now = clock()

      await closeLiveRows(clubId, now, 'Replaced by an admin grant.')
      const subscription = await subscriptions.createClubSubscription({
        club_id: clubId,
        plan_id: plan.id,
        status: 'active',
        provider: 'manual',
        source: 'admin_grant',
        granted_by_user_id: actingUserId,
        notes: notes ?? null,
        ...periodFor(plan, now, months)
      })

      await onActivate(clubId, plan)
      return adminRow(subscription)
    },

    async extend(actingUserId, subscriptionId, months, notes) {
      await requireSuperAdmin(actingUserId)
      if (!Number.isInteger(months) || months < 1 || months > 36) {
        throw new ClubSubscriptionServiceError(
          400,
          'VALIDATION_ERROR',
          'Extend by between 1 and 36 whole months.'
        )
      }
      const sub = await subscriptions.findClubSubscriptionById(subscriptionId)
      if (!sub) {
        throw new ClubSubscriptionServiceError(404, 'NOT_FOUND', 'Subscription not found.')
      }
      if (sub.ended_at) {
        throw new ClubSubscriptionServiceError(
          409,
          'SUBSCRIPTION_ENDED',
          'This subscription has ended. Grant a new one instead.'
        )
      }

      const now = clock()
      const base = sub.current_period_end ? new Date(sub.current_period_end) : now
      const from = base.getTime() > now.getTime() ? base : now
      const updated = await subscriptions.updateClubSubscription(sub.id, {
        status: 'active',
        cancel_at_period_end: false,
        canceled_at: null,
        current_period_end: addMonths(from, months).toISOString(),
        notes: notes ?? sub.notes
      })

      const plan = await subscriptions.getClubPlanById(sub.plan_id)
      if (plan) await onActivate(sub.club_id, plan)
      return adminRow(updated)
    },

    async adminCancel(actingUserId, subscriptionId, notes) {
      await requireSuperAdmin(actingUserId)
      const sub = await subscriptions.findClubSubscriptionById(subscriptionId)
      if (!sub) {
        throw new ClubSubscriptionServiceError(404, 'NOT_FOUND', 'Subscription not found.')
      }
      if (sub.ended_at) {
        throw new ClubSubscriptionServiceError(
          409,
          'SUBSCRIPTION_ENDED',
          'This subscription has already ended.'
        )
      }

      const now = clock()
      const updated = await subscriptions.updateClubSubscription(sub.id, {
        status: 'canceled',
        canceled_at: now.toISOString(),
        ended_at: now.toISOString(),
        // Immediate: the period is closed now, so the resolver drops the club today.
        current_period_end: now.toISOString(),
        notes: notes ?? sub.notes
      })

      await onLapse(sub.club_id)
      return adminRow(updated)
    },

    async applyDowngradeRestrictions(clubId) {
      const unfinished = await events.findRestrictableForClub(clubId)
      const toRestrict = chooseEventsToRestrict(unfinished)
      return events.setRestricted(
        toRestrict.map((ev) => ev.id),
        'plan_downgrade'
      )
    },

    async clearDowngradeRestrictions(clubId) {
      const unfinished = await events.findRestrictableForClub(clubId)
      const held = unfinished.filter((ev) => ev.restricted_at !== null)
      return events.setRestricted(
        held.map((ev) => ev.id),
        null
      )
    },

    async sweepLapsed() {
      const now = clock()
      const { graceDays } = await readBilling()
      // Candidates are anything past its period end; grace is applied here,
      // per row, because only `past_due` gets it.
      const candidates = await subscriptions.findLapsedCandidates(now.toISOString())

      const lapsed: string[] = []
      let restricted = 0

      for (const sub of candidates) {
        const periodEnd = sub.current_period_end ? new Date(sub.current_period_end) : null
        if (!periodEnd) continue
        if (
          sub.status === 'past_due' &&
          now.getTime() <= periodEnd.getTime() + graceDays * DAY_MS
        ) {
          continue
        }

        await subscriptions.updateClubSubscription(sub.id, {
          status: 'canceled',
          ended_at: now.toISOString(),
          canceled_at: sub.canceled_at ?? now.toISOString()
        })
        restricted += await onLapse(sub.club_id)
        lapsed.push(sub.id)
      }

      return { lapsed, restricted }
    }
  }

  return service
}
