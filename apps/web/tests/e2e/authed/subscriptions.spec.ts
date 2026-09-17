import { expect, test, type BrowserContext } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { attachCollectors, visit } from '../helpers/audit'
import { loadEnv } from '../auth/seed'

/**
 * Club subscriptions, end to end against the dev project.
 *
 * Three journeys from the plan: hit the free-tier limit and get shown the way
 * out; buy Premium through the simulated gateway from the billing page; cancel
 * and see the end date. Plus the SuperAdmin page, driven with mocked admin
 * endpoints the way admin-reports.spec.ts does, because the test owner is not
 * the SuperAdmin.
 *
 * Premium ships inactive (its price is an open decision), so the buy journey
 * activates it — NOT publishes it — on the service role for the duration of
 * this file and restores it after. Every subscription and transaction row it
 * creates for the test club is deleted at the end.
 */
const OWNER_CLUB_ID = '777223ae-4626-4161-93af-cffcf82f33aa' // Claude Test Club 4

test.describe.configure({ mode: 'serial' })

function localDate(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function setAccountMode(ctx: BrowserContext, mode: 'player' | 'club') {
  await ctx.addCookies([
    {
      name: 'dnl-cookie-consent',
      value: encodeURIComponent(
        JSON.stringify({ v: 1, choice: 'essential', at: '2026-09-12T00:00:00.000Z' })
      ),
      domain: 'localhost',
      path: '/'
    },
    { name: 'account_mode', value: mode, domain: 'localhost', path: '/' },
    {
      name: 'active_club_id',
      value: mode === 'club' ? OWNER_CLUB_ID : '',
      domain: 'localhost',
      path: '/'
    }
  ])
}

let admin: SupabaseClient
let premiumId = ''
let premiumWasActive = false
const createdEventIds: string[] = []

test.beforeAll(async () => {
  const env = loadEnv()
  admin = createClient(env.url, env.secretKey, { auth: { persistSession: false } })
  const { data, error } = await admin
    .from('subscription_plans')
    .select('id, is_active')
    .eq('plan_type', 'club')
    .eq('name', 'Club Premium')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Club Premium plan not found in dev')
  premiumId = data.id
  premiumWasActive = data.is_active
})

test.afterAll(async () => {
  // Leave the dev project exactly as found.
  for (const id of createdEventIds) {
    await admin.from('events').delete().eq('id', id)
  }
  await admin.from('payment_transactions').delete().eq('club_id', OWNER_CLUB_ID).eq('provider', 'simulated')
  await admin.from('club_subscriptions').delete().eq('club_id', OWNER_CLUB_ID)
  await admin.from('events').update({ restricted_at: null, restricted_reason: null }).eq('club_id', OWNER_CLUB_ID)
  await admin
    .from('clubs')
    .update({ verification_status: 'unverified', verification_requested_at: null, verification_source: 'none' })
    .eq('id', OWNER_CLUB_ID)
    .eq('verification_source', 'subscription')
  await admin.from('subscription_plans').update({ is_active: premiumWasActive }).eq('id', premiumId)
})

test('billing page on the free plan: meters, origin sentence, nothing on sale', async ({ page, context }) => {
  const { failedRequests } = attachCollectors(page)
  await setAccountMode(context, 'club')
  await visit(page, `/club/${OWNER_CLUB_ID}/billing`)

  await expect(page.getByRole('heading', { name: 'Billing & plan' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Free', exact: true })).toBeVisible()
  await expect(page.getByText('Every club starts here. Nothing to pay.')).toBeVisible()
  await expect(page.getByText('Draft events')).toBeVisible()
  await expect(page.getByText('1 draft event on this plan.')).toBeVisible()
  await expect(page.getByText('Paid plans are not on sale yet')).toBeVisible()
  expect(failedRequests).toEqual([])
})

test('the sidebar has Billing & plan in club mode and the settings page has Go Premium', async ({ page, context }) => {
  await setAccountMode(context, 'club')
  await visit(page, `/club/${OWNER_CLUB_ID}/settings`)
  await expect(page.getByRole('link', { name: 'Billing & plan' }).first()).toBeVisible()
  const cta = page.getByRole('link', { name: /Go Premium|Manage plan/ })
  await expect(cta).toBeVisible()
  await cta.click()
  await expect(page).toHaveURL(new RegExp(`/club/${OWNER_CLUB_ID}/billing`))
})

test('hitting the draft limit shows "See plans", which lands on billing', async ({ page, context }) => {
  await setAccountMode(context, 'club')

  // Fill the club's one draft through the API so the UI attempt is the one
  // that is refused. If a draft already exists, the first call is the refusal.
  const body = {
    club_id: OWNER_CLUB_ID,
    name: `E2E Limit Draft ${Date.now()}`,
    event_type: 'open_casual',
    start_date: localDate(3),
    end_date: localDate(3),
    registration_closes: localDate(2),
    visibility: 'public',
    queue_courts: 1
  }
  const first = await page.request.post('/api/v1/events', { data: body })
  if (first.ok()) createdEventIds.push((await first.json()).id)
  else expect((await first.json()).code).toBe('CLUB_DRAFT_LIMIT')

  await visit(page, '/create-event')
  const club = page.locator('#event-club')
  if (await club.count()) await club.selectOption(OWNER_CLUB_ID)
  await page.locator('#event-name').fill(`E2E Second Draft ${Date.now()}`)
  await page.locator('#event-start-date').fill(localDate(4))
  await page.locator('#event-end-date').fill(localDate(4))
  await page.locator('#event-registration-closes').fill(localDate(3))
  await page.getByRole('button', { name: 'Create Event' }).click()

  await expect(page.getByText(/Your plan allows 1 draft event/)).toBeVisible({ timeout: 10_000 })
  const upsell = page.getByTestId('limit-upsell')
  await expect(upsell).toHaveText('See plans')
  await upsell.click()
  await expect(page).toHaveURL(new RegExp(`/club/${OWNER_CLUB_ID}/billing`))
  // The meter agrees with the refusal.
  await expect(page.getByText('1 of 1').first()).toBeVisible()
})

test('simulated checkout: banner, both figures, voucher refused, ₱0 activation, verification queued', async ({
  page,
  context
}) => {
  // Purchasable for this test only. Still not public: the pricing page must
  // not show it, and the billing page's chooser is mocked to offer it.
  await admin.from('subscription_plans').update({ is_active: true }).eq('id', premiumId)

  const { failedRequests } = attachCollectors(page)
  await setAccountMode(context, 'club')
  await page.route('**/api/v1/platform/subscription-plans', async (r) => {
    const { data: rows } = await admin
      .from('subscription_plans')
      .select('*')
      .in('id', [premiumId])
    const p = rows![0]
    await r.fulfill({
      json: {
        data: [
          {
            id: p.id,
            name: 'Premium',
            description: p.description,
            billing_interval: p.billing_interval,
            price_cents: p.price_cents,
            currency: p.currency,
            plan_group: p.plan_group,
            is_featured: true,
            is_default_free: false,
            tagline: null,
            marketing_bullets: [],
            headline_figures: [],
            badge_label: null,
            cta_label: 'Go Premium',
            savings_label: null,
            entitlements: {
              max_draft_events: null,
              max_live_tournaments: null,
              max_live_open_play: null,
              max_members: null,
              online_fee_collection: true,
              verified_badge_eligible: true
            }
          }
        ],
        billing: { mode: 'simulated', notice: null }
      }
    })
  })

  await visit(page, `/club/${OWNER_CLUB_ID}/billing`)
  await page.getByRole('button', { name: 'Go Premium' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(page.getByTestId('checkout-test-banner')).toContainText('no payment is taken')
  await expect(page.getByTestId('checkout-list-price')).toHaveClass(/line-through/)
  await expect(page.getByTestId('checkout-due-today')).toHaveText('₱0.00')
  const confirm = page.getByTestId('checkout-confirm')
  await expect(confirm).toHaveText('Activate (no payment)')

  // The voucher placeholder is refused by the real server.
  await page.locator('#checkout-voucher').fill('SAVE10')
  await confirm.click()
  await expect(dialog.getByRole('alert')).toContainText('not recognised')

  await page.locator('#checkout-voucher').fill('')
  await confirm.click()
  await expect(dialog).toBeHidden({ timeout: 15_000 })

  await expect(page.getByRole('heading', { name: 'Premium', exact: true })).toBeVisible()
  await expect(page.getByText('Because the club has this plan.')).toBeVisible()
  await expect(page.getByText(/Renews /)).toBeVisible()
  await expect(page.getByText('Unlimited draft events on this plan.')).toBeVisible()
  const history = page.getByRole('heading', { name: 'Payment history' }).locator('..')
  await expect(history).toContainText('Test')
  await expect(history).toContainText('₱0.00')

  // Paying entered the queue; it did not grant the badge.
  const { data: club } = await admin
    .from('clubs')
    .select('verification_status, verification_source')
    .eq('id', OWNER_CLUB_ID)
    .single()
  expect(club).toEqual({ verification_status: 'pending', verification_source: 'subscription' })

  // And the ceiling is gone: a second draft is accepted now.
  const second = await page.request.post('/api/v1/events', {
    data: {
      club_id: OWNER_CLUB_ID,
      name: `E2E Premium Draft ${Date.now()}`,
      event_type: 'open_casual',
      start_date: localDate(5),
      end_date: localDate(5),
      registration_closes: localDate(4),
      visibility: 'public',
      queue_courts: 1
    }
  })
  expect(second.ok(), `second draft → ${second.status()}`).toBe(true)
  createdEventIds.push((await second.json()).id)

  expect(failedRequests.filter((r) => !/checkout/.test(r))).toEqual([])
})

test('cancel names the end date and keeps the plan active until then', async ({ page, context }) => {
  await setAccountMode(context, 'club')
  await visit(page, `/club/${OWNER_CLUB_ID}/billing`)
  await page.getByRole('button', { name: 'Cancel plan' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText(/keeps everything until \w+ \d{1,2}, \d{4}/)
  await expect(dialog).toContainText('Nothing is deleted')
  await dialog.getByRole('button', { name: 'Cancel plan' }).click()
  await expect(dialog).toBeHidden({ timeout: 10_000 })
  await expect(page.getByText(/Cancelled — stays active until/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Premium', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel plan' })).toHaveCount(0)
})

test.describe('SuperAdmin subscriptions page (mocked admin endpoints)', () => {
  const FREE = {
    id: 'plan-free',
    name: 'Free',
    description: 'Everything a club needs to run its first event.',
    billing_interval: 'month',
    price_cents: 0,
    currency: 'php',
    plan_group: 'club-free',
    is_featured: false,
    is_default_free: true,
    tagline: null,
    marketing_bullets: [],
    headline_figures: [],
    badge_label: null,
    cta_label: null,
    savings_label: null,
    entitlements: {
      max_draft_events: 1,
      max_live_tournaments: 1,
      max_live_open_play: 1,
      max_members: null,
      online_fee_collection: false,
      verified_badge_eligible: false
    },
    is_active: true,
    is_public: true,
    sort_order: 0
  }
  const PREMIUM = {
    ...FREE,
    id: 'plan-premium',
    name: 'Club Premium',
    description: 'Unlimited events, online entry fees, and eligibility for the verified badge.',
    price_cents: 99900,
    plan_group: 'club-premium',
    is_default_free: false,
    entitlements: {
      max_draft_events: null,
      max_live_tournaments: null,
      max_live_open_play: null,
      max_members: null,
      online_fee_collection: true,
      verified_badge_eligible: true
    },
    is_active: false,
    is_public: false,
    sort_order: 10
  }

  test('edits a plan with a live preview, and refuses live billing', async ({ page, context }) => {
    await setAccountMode(context, 'player')
    let patched: Record<string, unknown> | null = null
    await page.route('**/api/v1/me/is-superadmin', (r) =>
      r.fulfill({ json: { is_superadmin: true, mfa_enrolled: true, aal: 'aal2' } })
    )
    await page.route('**/api/v1/admin/subscription-plans', (r) => r.fulfill({ json: { data: [FREE, PREMIUM] } }))
    await page.route('**/api/v1/admin/subscription-plans/*', async (r) => {
      patched = r.request().postDataJSON()
      await r.fulfill({ json: { plan: { ...PREMIUM, ...patched }, warnings: [] } })
    })
    await page.route('**/api/v1/admin/billing', (r) => {
      if (r.request().method() === 'PATCH') {
        return r.fulfill({
          status: 501,
          json: { code: 'GATEWAY_NOT_CONFIGURED', message: 'Live billing cannot be switched on: no payment provider is configured. See ADR-006.' }
        })
      }
      return r.fulfill({ json: { billing_mode: 'simulated', billing_notice: null, subscription_grace_days: 7 } })
    })
    await page.route('**/api/v1/admin/club-subscriptions', (r) => r.fulfill({ json: { data: [] } }))

    await visit(page, '/dashboard')
    await page.evaluate(() => {
      const root = document.querySelector('#__nuxt') as HTMLElement & {
        __vue_app__: { config: { globalProperties: { $router: { push(p: string): void } } } }
      }
      root.__vue_app__.config.globalProperties.$router.push('/admin/subscriptions')
    })
    await page.waitForURL('**/admin/subscriptions**')

    await expect(page.getByRole('heading', { name: 'Subscriptions' })).toBeVisible()
    await page.getByRole('button', { name: /Club Premium/ }).click()

    // The preview is the real card and follows the unsaved draft.
    const preview = page.locator('aside').filter({ hasText: 'Preview' })
    await page.getByLabel('Tagline').fill('Run everything')
    await expect(preview).toContainText('Run everything')
    await page.getByRole('button', { name: '+ Add bullet' }).click()
    await page.locator('input').filter({ hasNot: page.locator('[type=checkbox]') }).last().fill('Unlimited events')
    await expect(preview).toContainText('Unlimited events')

    await page.getByLabel('Public', { exact: true }).check()
    await page.getByLabel('Active', { exact: true }).check()
    await page.getByRole('button', { name: 'Save plan' }).click()
    await expect.poll(() => patched).toMatchObject({
      tagline: 'Run everything',
      is_public: true,
      is_active: true,
      max_draft_events: null
    })

    // Billing tab: Live is not selectable, and the server refuses it anyway.
    await page.getByRole('tab', { name: 'Billing' }).click()
    await expect(page.getByText('ADR-006 is open.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Live' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Save billing settings' }).click()
    await expect(page.getByRole('alert')).toContainText('ADR-006')

    // Clubs tab: the empty state offers Grant.
    await page.getByRole('tab', { name: 'Clubs' }).click()
    await expect(page.getByText('No club subscriptions yet')).toBeVisible()
    await page.getByRole('button', { name: 'Grant a plan' }).first().click()
    await expect(page.getByRole('dialog')).toContainText('Grant a plan')
  })
})
