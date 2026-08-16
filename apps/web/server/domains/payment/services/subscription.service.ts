import type { SubscriptionRepository } from '../repositories/subscription.repository'
import type {
  SubscriptionPlanDto,
  PlayerSubscriptionDto,
  ClubSubscriptionDto,
  PlanType,
  SubscriptionPlanFeatures
} from '../dto/subscription.dto'
import { toSubscriptionPlanDto, toPlayerSubscriptionDto, toClubSubscriptionDto } from '../dto/subscription.dto'

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
  canPlayerSubmitMatch(playerId: string, currentMonthSubmissions: number): Promise<boolean>
  canPlayerJoinClub(playerId: string, currentClubCount: number): Promise<boolean>

  getClubSubscription(clubId: string): Promise<ClubSubscriptionDto | null>
  getClubFeatures(clubId: string): Promise<SubscriptionPlanFeatures>
  canClubHostTournament(clubId: string): Promise<boolean>
  canClubAddMember(clubId: string, currentMemberCount: number): Promise<boolean>
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

    async canPlayerSubmitMatch(playerId, currentMonthSubmissions) {
      const features = await getPlayerFeaturesInternal(playerId)
      const maxMatches = features.max_matches_per_month ?? 10

      if (maxMatches === -1) return true
      return currentMonthSubmissions < maxMatches
    },

    async canPlayerJoinClub(playerId, currentClubCount) {
      const features = await getPlayerFeaturesInternal(playerId)
      const maxClubs = features.max_clubs ?? 2

      if (maxClubs === -1) return true
      return currentClubCount < maxClubs
    },

    async getClubSubscription(clubId) {
      const record = await subscriptions.getClubSubscription(clubId)
      if (!record) return null

      const plan = await subscriptions.getPlanById(record.plan_id)
      return toClubSubscriptionDto(record, plan ?? undefined)
    },

    async getClubFeatures(clubId) {
      return getClubFeaturesInternal(clubId)
    },

    async canClubHostTournament(clubId) {
      const features = await getClubFeaturesInternal(clubId)
      return features.tournaments === true
    },

    async canClubAddMember(clubId, currentMemberCount) {
      const features = await getClubFeaturesInternal(clubId)
      const maxMembers = features.max_members ?? 50

      if (maxMembers === -1) return true
      return currentMemberCount < maxMembers
    }
  }
}
