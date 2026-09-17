# Payments Domain Specification

## Overview

The Payments domain handles all monetary transactions within DinkAndLadder, including subscription billing, tournament entry fees, and sponsorship payments.

## Payment Providers

### Stripe (International)
- Well-documented API
- Strong developer experience
- Built-in subscription management
- Webhook-driven architecture
- PCI compliance handled by Stripe

### GCash (Philippines)
- Most popular mobile wallet in PH
- GCash for Business / PayMongo integration
- No setup fees
- Local payment preference for Filipino users

**Note:** Live payment integration is deferred until full app flow is working. Both providers are free to set up.

## Domain Entities

### Subscription Plans

```
subscription_plans
├── id: UUID
├── name: string (e.g., "Free", "Pro", "Club Premium")
├── stripe_price_id: string
├── billing_interval: 'month' | 'year'
├── price_cents: integer
├── features: jsonb
├── is_active: boolean
├── created_at: timestamptz
└── updated_at: timestamptz
```

### Player Subscriptions

```
player_subscriptions
├── id: UUID
├── player_id: UUID FK → player_profiles
├── plan_id: UUID FK → subscription_plans
├── stripe_subscription_id: string
├── stripe_customer_id: string
├── status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'paused'
├── current_period_start: timestamptz
├── current_period_end: timestamptz
├── cancel_at_period_end: boolean
├── created_at: timestamptz
└── updated_at: timestamptz
```

### Club Subscriptions

```
club_subscriptions
├── id: UUID
├── club_id: UUID FK → clubs
├── plan_id: UUID FK → subscription_plans
├── stripe_subscription_id: string
├── stripe_customer_id: string
├── status: 'active' | 'canceled' | 'past_due' | 'trialing'
├── current_period_start: timestamptz
├── current_period_end: timestamptz
├── created_at: timestamptz
└── updated_at: timestamptz
```

### Payment Transactions

```
payment_transactions
├── id: UUID
├── player_id: UUID FK → player_profiles (nullable)
├── club_id: UUID FK → clubs (nullable)
├── stripe_payment_intent_id: string
├── amount_cents: integer
├── currency: string (default 'php')
├── status: 'pending' | 'succeeded' | 'failed' | 'refunded'
├── transaction_type: 'subscription' | 'tournament_entry' | 'sponsorship' | 'donation'
├── metadata: jsonb
├── created_at: timestamptz
└── updated_at: timestamptz
```

### Sponsorships

```
sponsorships
├── id: UUID
├── sponsor_player_id: UUID FK → player_profiles
├── target_type: 'player' | 'club' | 'tournament'
├── target_id: UUID
├── amount_cents: integer
├── message: text (nullable)
├── is_anonymous: boolean
├── stripe_payment_intent_id: string
├── status: 'pending' | 'completed' | 'failed'
├── created_at: timestamptz
└── updated_at: timestamptz
```

## Subscription Tiers (Initial)

### Free Tier
- Basic profile
- View rankings
- Submit matches (limited: 10/month)
- Join clubs (max 2)
- View events

### Pro Tier (Player)
- Unlimited match submissions
- Join unlimited clubs
- Priority in tournament registration
- Rating history analytics
- Achievement bonuses
- Ad-free experience

### Club Premium Tier
- Unlimited club members
- Club announcements
- Tournament hosting
- Club analytics
- Priority support

## API Endpoints

### Subscription Management
- `GET /api/v1/subscriptions/plans` — list available plans
- `GET /api/v1/players/me/subscription` — get current subscription
- `POST /api/v1/subscriptions/checkout` — create Stripe checkout session
- `POST /api/v1/subscriptions/portal` — create Stripe billing portal session
- `POST /api/v1/subscriptions/cancel` — cancel subscription at period end

### Club Subscriptions (built 2026-09-17; 056 + steps 5–8)

The player-plan endpoints above are legacy; player plans are deactivated
(056-0009). Club plans are the live surface. Entitlements are typed columns
(`max_draft_events`, `max_live_tournaments`, `max_live_open_play`,
`max_members`, `online_fee_collection`, `verified_badge_eligible`; **NULL =
unlimited**), not the `features` blob. Prices are undecided — ADR-007.

- `GET /api/v1/platform/subscription-plans` — public; `is_public AND is_active`
  club plans as `ClubSubscriptionPlanDto` (no `is_public` field, so a draft
  price cannot leak) plus `billing.mode` / `billing.notice`.
- `GET /api/v1/clubs/{clubId}/subscription` — OWNER/ADMIN; `ClubBillingDto`:
  subscription, plan, the resolved `ClubEntitlements`, `ClubUsage`, billing
  mode, held events, transactions.
- `POST /api/v1/clubs/{clubId}/subscription/checkout` — `{ plan_id,
  voucher_code? }`, `Idempotency-Key` header. Billing mode gates it: `off` →
  503 `BILLING_DISABLED`, `live` → 501 `GATEWAY_NOT_CONFIGURED`, `simulated`
  → zero-charge activation (transaction `is_test`, `charged_cents: 0`).
  Any non-empty `voucher_code` → 400 `VOUCHER_UNKNOWN` (placeholder).
- `POST /api/v1/clubs/{clubId}/subscription/cancel` — cancel at period end.
- `POST /api/v1/tasks/sweep-lapsed-subscriptions` — scheduler only
  (`CRON_SECRET`); closes rows past period end (+grace for `past_due`),
  restricts all but the oldest unfinished event per type, revokes a
  subscription-sourced badge.

SuperAdmin (service role, `isSuperAdmin` inside the service):
- `GET|POST /api/v1/admin/subscription-plans`, `PATCH
  /api/v1/admin/subscription-plans/{planId}` — no DELETE (FK from
  `club_subscriptions`); deactivate instead.
- `GET|PATCH /api/v1/admin/billing` — `billing_mode` (`live` refused 501),
  `billing_notice`, `subscription_grace_days`.
- `GET|POST /api/v1/admin/club-subscriptions` (grant), `PATCH
  /api/v1/admin/club-subscriptions/{id}` (`extend` | `cancel`, immediate).

Event limits: `events/index.post` and `events/{id}/publish.post` resolve the
club's entitlements per request (`server/utils/club-entitlements.ts`, no
cache). A verified club bypasses the resolver entirely.

### Webhooks
- `POST /api/v1/webhooks/stripe` — handle Stripe webhook events

### Sponsorships
- `POST /api/v1/sponsorships` — create sponsorship payment
- `GET /api/v1/players/{playerId}/sponsorships/received` — list received sponsorships
- `GET /api/v1/players/me/sponsorships/given` — list given sponsorships

## Stripe Webhook Events

Handle the following events:
- `checkout.session.completed` — subscription created
- `customer.subscription.updated` — subscription status changed
- `customer.subscription.deleted` — subscription canceled
- `invoice.paid` — payment successful
- `invoice.payment_failed` — payment failed
- `payment_intent.succeeded` — one-time payment completed

## Security Considerations

1. **Stripe Customer Creation**: Create Stripe customer on first payment intent
2. **Webhook Verification**: Always verify Stripe webhook signatures
3. **Idempotency**: Use Stripe's idempotency keys for retries
4. **RLS**: Payment tables owner-only access
5. **Audit**: Log all payment state changes

## Feature Gating

Use a service to check subscription status before allowing premium features:

```typescript
interface SubscriptionService {
  canSubmitMatch(playerId: string): Promise<boolean>
  canJoinClub(playerId: string, currentClubCount: number): Promise<boolean>
  canHostTournament(clubId: string): Promise<boolean>
  getFeatures(playerId: string): Promise<FeatureFlags>
}
```

## Environment Variables

```
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
```

## Out of Scope (Phase 4)

- Refund management UI (use Stripe dashboard)
- Multiple currencies (PHP only initially)
- Invoicing
- Tax calculation
- Payout to sponsored players (manual process initially)

## Implementation Order

1. Database schema (Liquibase)
2. Stripe integration service
3. Subscription plans + checkout flow
4. Webhook handler
5. Feature gating service
6. Club subscriptions
7. Sponsorship payments
8. UI pages
