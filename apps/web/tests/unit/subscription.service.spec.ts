import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSubscriptionService } from '../../server/domains/payment/services/subscription.service'
import type { SubscriptionRepository } from '../../server/domains/payment/repositories/subscription.repository'
import type { SubscriptionPlanRecord, PlayerSubscriptionRecord, ClubSubscriptionRecord } from '../../server/domains/payment/dto/subscription.dto'

const TEST_IDS = {
  player: '11111111-1111-1111-1111-111111111111',
  club: '22222222-2222-2222-2222-222222222222',
  plan: '33333333-3333-3333-3333-333333333333'
}

function createMockPlan(overrides: Partial<SubscriptionPlanRecord> = {}): SubscriptionPlanRecord {
  return {
    id: TEST_IDS.plan,
    name: 'Pro',
    description: 'Pro plan',
    stripe_price_id: 'price_123',
    billing_interval: 'month',
    price_cents: 29900,
    currency: 'php',
    features: {
      max_matches_per_month: -1,
      max_clubs: -1,
      analytics: true,
      ad_free: true
    },
    plan_type: 'player',
    is_active: true,
    sort_order: 1,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides
  }
}

function createMockPlayerSubscription(overrides: Partial<PlayerSubscriptionRecord> = {}): PlayerSubscriptionRecord {
  return {
    id: 'sub-1',
    player_id: TEST_IDS.player,
    plan_id: TEST_IDS.plan,
    stripe_subscription_id: 'sub_123',
    stripe_customer_id: 'cus_123',
    status: 'active',
    current_period_start: '2024-01-01T00:00:00Z',
    current_period_end: '2024-02-01T00:00:00Z',
    cancel_at_period_end: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides
  }
}

function createMockClubSubscription(overrides: Partial<ClubSubscriptionRecord> = {}): ClubSubscriptionRecord {
  return {
    id: 'sub-1',
    club_id: TEST_IDS.club,
    plan_id: TEST_IDS.plan,
    stripe_subscription_id: 'sub_456',
    stripe_customer_id: 'cus_456',
    status: 'active',
    current_period_start: '2024-01-01T00:00:00Z',
    current_period_end: '2024-02-01T00:00:00Z',
    cancel_at_period_end: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides
  }
}

describe('SubscriptionService', () => {
  let repo: SubscriptionRepository

  beforeEach(() => {
    repo = {
      listActivePlans: vi.fn(),
      getPlanById: vi.fn(),
      getPlanByStripeId: vi.fn(),
      getPlayerSubscription: vi.fn(),
      getPlayerSubscriptionByStripeId: vi.fn(),
      createPlayerSubscription: vi.fn(),
      updatePlayerSubscription: vi.fn(),
      getClubSubscription: vi.fn(),
      getClubSubscriptionByStripeId: vi.fn(),
      createClubSubscription: vi.fn(),
      updateClubSubscription: vi.fn()
    }
  })

  describe('listPlans', () => {
    it('returns all active plans', async () => {
      const service = createSubscriptionService(repo)
      vi.mocked(repo.listActivePlans).mockResolvedValue([createMockPlan()])

      const plans = await service.listPlans()

      expect(plans).toHaveLength(1)
      expect(plans[0].name).toBe('Pro')
    })

    it('filters by plan type', async () => {
      const service = createSubscriptionService(repo)
      vi.mocked(repo.listActivePlans).mockResolvedValue([createMockPlan({ plan_type: 'club' })])

      const plans = await service.listPlans('club')

      expect(repo.listActivePlans).toHaveBeenCalledWith('club')
    })
  })

  describe('getPlayerFeatures', () => {
    it('returns pro features for active subscriber', async () => {
      const service = createSubscriptionService(repo)
      vi.mocked(repo.getPlayerSubscription).mockResolvedValue(createMockPlayerSubscription())
      vi.mocked(repo.getPlanById).mockResolvedValue(createMockPlan())

      const features = await service.getPlayerFeatures(TEST_IDS.player)

      expect(features.max_matches_per_month).toBe(-1)
      expect(features.analytics).toBe(true)
    })

    it('returns free features for non-subscriber', async () => {
      const service = createSubscriptionService(repo)
      vi.mocked(repo.getPlayerSubscription).mockResolvedValue(null)

      const features = await service.getPlayerFeatures(TEST_IDS.player)

      expect(features.max_matches_per_month).toBe(10)
      expect(features.max_clubs).toBe(2)
      expect(features.analytics).toBe(false)
    })

    it('returns free features for canceled subscription', async () => {
      const service = createSubscriptionService(repo)
      vi.mocked(repo.getPlayerSubscription).mockResolvedValue(
        createMockPlayerSubscription({ status: 'canceled' })
      )

      const features = await service.getPlayerFeatures(TEST_IDS.player)

      expect(features.max_matches_per_month).toBe(10)
    })
  })

  describe('canPlayerSubmitMatch', () => {
    it('allows unlimited for pro subscribers', async () => {
      const service = createSubscriptionService(repo)
      vi.mocked(repo.getPlayerSubscription).mockResolvedValue(createMockPlayerSubscription())
      vi.mocked(repo.getPlanById).mockResolvedValue(createMockPlan())

      const canSubmit = await service.canPlayerSubmitMatch(TEST_IDS.player, 100)

      expect(canSubmit).toBe(true)
    })

    it('limits free users to 10 per month', async () => {
      const service = createSubscriptionService(repo)
      vi.mocked(repo.getPlayerSubscription).mockResolvedValue(null)

      const canSubmit9 = await service.canPlayerSubmitMatch(TEST_IDS.player, 9)
      const canSubmit10 = await service.canPlayerSubmitMatch(TEST_IDS.player, 10)

      expect(canSubmit9).toBe(true)
      expect(canSubmit10).toBe(false)
    })
  })

  describe('canPlayerJoinClub', () => {
    it('allows unlimited clubs for pro subscribers', async () => {
      const service = createSubscriptionService(repo)
      vi.mocked(repo.getPlayerSubscription).mockResolvedValue(createMockPlayerSubscription())
      vi.mocked(repo.getPlanById).mockResolvedValue(createMockPlan())

      const canJoin = await service.canPlayerJoinClub(TEST_IDS.player, 50)

      expect(canJoin).toBe(true)
    })

    it('limits free users to 2 clubs', async () => {
      const service = createSubscriptionService(repo)
      vi.mocked(repo.getPlayerSubscription).mockResolvedValue(null)

      const canJoin1 = await service.canPlayerJoinClub(TEST_IDS.player, 1)
      const canJoin2 = await service.canPlayerJoinClub(TEST_IDS.player, 2)

      expect(canJoin1).toBe(true)
      expect(canJoin2).toBe(false)
    })
  })

  describe('getClubFeatures', () => {
    it('returns premium features for subscribed club', async () => {
      const service = createSubscriptionService(repo)
      vi.mocked(repo.getClubSubscription).mockResolvedValue(createMockClubSubscription())
      vi.mocked(repo.getPlanById).mockResolvedValue(
        createMockPlan({
          plan_type: 'club',
          features: { max_members: -1, tournaments: true, analytics: true }
        })
      )

      const features = await service.getClubFeatures(TEST_IDS.club)

      expect(features.tournaments).toBe(true)
      expect(features.max_members).toBe(-1)
    })

    it('returns basic features for free club', async () => {
      const service = createSubscriptionService(repo)
      vi.mocked(repo.getClubSubscription).mockResolvedValue(null)

      const features = await service.getClubFeatures(TEST_IDS.club)

      expect(features.tournaments).toBe(false)
      expect(features.max_members).toBe(50)
    })
  })

  describe('canClubHostTournament', () => {
    it('allows premium clubs to host tournaments', async () => {
      const service = createSubscriptionService(repo)
      vi.mocked(repo.getClubSubscription).mockResolvedValue(createMockClubSubscription())
      vi.mocked(repo.getPlanById).mockResolvedValue(
        createMockPlan({ features: { tournaments: true } })
      )

      const canHost = await service.canClubHostTournament(TEST_IDS.club)

      expect(canHost).toBe(true)
    })

    it('blocks free clubs from hosting tournaments', async () => {
      const service = createSubscriptionService(repo)
      vi.mocked(repo.getClubSubscription).mockResolvedValue(null)

      const canHost = await service.canClubHostTournament(TEST_IDS.club)

      expect(canHost).toBe(false)
    })
  })

  describe('canClubAddMember', () => {
    it('allows unlimited members for premium clubs', async () => {
      const service = createSubscriptionService(repo)
      vi.mocked(repo.getClubSubscription).mockResolvedValue(createMockClubSubscription())
      vi.mocked(repo.getPlanById).mockResolvedValue(
        createMockPlan({ features: { max_members: -1 } })
      )

      const canAdd = await service.canClubAddMember(TEST_IDS.club, 200)

      expect(canAdd).toBe(true)
    })

    it('limits free clubs to 50 members', async () => {
      const service = createSubscriptionService(repo)
      vi.mocked(repo.getClubSubscription).mockResolvedValue(null)

      const canAdd49 = await service.canClubAddMember(TEST_IDS.club, 49)
      const canAdd50 = await service.canClubAddMember(TEST_IDS.club, 50)

      expect(canAdd49).toBe(true)
      expect(canAdd50).toBe(false)
    })
  })
})
