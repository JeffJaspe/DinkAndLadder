import type { SubscriptionRepository } from '../repositories/subscription.repository'
import type {
  SubscriptionPlanDto,
  PlayerSubscriptionDto,
  ClubSubscriptionDto,
  PlanType,
  SubscriptionPlanFeatures
} from '../dto/subscription.dto'
import {
  toSubscriptionPlanDto,
  toPlayerSubscriptionDto,
  toClubSubscriptionDto
} from '../dto/subscription.dto'

/**
 * **Four predicates were deleted from this service (056):**
 * `canPlayerSubmitMatch`, `canPlayerJoinClub`, `canClubHostTournament` and
 * `canClubAddMember`.
 *
 * Not one of them was called by anything in the product. They read like
 * authority — a named function returning a business decision — while enforcing
 * nothing, which is the most dangerous shape a dead function can take: the next
 * person to need a member limit would have found `canClubAddMember`, believed
 * it, and shipped a limit built on `features.max_members`, a jsonb key where
 * `-1` means unlimited and a missing key means 50.
 *
 * Club allowances now resolve through `club-entitlements.service.ts`, against
 * typed columns where `null` means unlimited.
 *
 * What stays, and why: `listPlans`, `getPlanById`, `getPlayerSubscription`,
 * `getPlayerFeatures` and `getClubFeatures` are live read contracts —
 * `/subscriptions/me`, `/subscriptions/plans` and `/clubs/{id}/subscription`
 * all return them, and the Flutter client is a documented consumer. The
 * `features` blob they read is frozen legacy; nothing new consults it.
 */
export class SubscriptionServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export interface SubscriptionService {
  listPlans(planType?: PlanType): Promise<SubscriptionPlanDto[]>
  getPlanById(planId: string): Promise<SubscriptionPlanDto | null>

  getPlayerSubscription(playerId: string): Promise<PlayerSubscriptionDto | null>
  getPlayerFeatures(playerId: string): Promise<SubscriptionPlanFeatures>

  getClubSubscription(clubId: string): Promise<ClubSubscriptionDto | null>
  getClubFeatures(clubId: string): Promise<SubscriptionPlanFeatures>
}

const FREE_FEATURES: SubscriptionPlanFeatures = {
  max_matches_per_month: 10,
  max_clubs: 2,
  analytics: false,
  ad_free: false
}

const FREE_CLUB_FEATURES: SubscriptionPlanFeatures = {
  max_members: 50,
  announcements: true,
  tournaments: false,
  analytics: false
}

export function createSubscriptionService(
  subscriptions: SubscriptionRepository
): SubscriptionService {
  async function getPlayerFeaturesInternal(playerId: string): Promise<SubscriptionPlanFeatures> {
    const sub = await subscriptions.getPlayerSubscription(playerId)
    if (!sub || sub.status !== 'active') {
      return FREE_FEATURES
    }

    const plan = await subscriptions.getPlanById(sub.plan_id)
    if (!plan) {
      return FREE_FEATURES
    }

    return plan.features
  }

  async function getClubFeaturesInternal(clubId: string): Promise<SubscriptionPlanFeatures> {
    const sub = await subscriptions.getClubSubscription(clubId)
    if (!sub || sub.status !== 'active') {
      return FREE_CLUB_FEATURES
    }

    const plan = await subscriptions.getPlanById(sub.plan_id)
    if (!plan) {
      return FREE_CLUB_FEATURES
    }

    return plan.features
  }

  return {
    async listPlans(planType) {
      const records = await subscriptions.listActivePlans(planType)
      return records.map(toSubscriptionPlanDto)
    },

    async getPlanById(planId) {
      const record = await subscriptions.getPlanById(planId)
      return record ? toSubscriptionPlanDto(record) : null
    },

    async getPlayerSubscription(playerId) {
      const record = await subscriptions.getPlayerSubscription(playerId)
      if (!record) return null

      const plan = await subscriptions.getPlanById(record.plan_id)
      return toPlayerSubscriptionDto(record, plan ?? undefined)
    },

    async getPlayerFeatures(playerId) {
      return getPlayerFeaturesInternal(playerId)
    },

    async getClubSubscription(clubId) {
      const record = await subscriptions.getClubSubscription(clubId)
      if (!record) return null

      const plan = await subscriptions.getPlanById(record.plan_id)
      return toClubSubscriptionDto(record, plan ?? undefined)
    },

    async getClubFeatures(clubId) {
      return getClubFeaturesInternal(clubId)
    }
  }
}
