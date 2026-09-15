import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { attachCollectors, visit } from '../helpers/audit'

/**
 * The core MVP chain, end to end through the real UI against the dev project:
 *
 *   owner (club mode) creates an Open Ranked singles event and publishes it
 *   → owner and member register as players
 *   → owner starts the event
 *   → owner, as organiser in club mode, records the singles result
 *   → the record is verified on save and both players' singles ratings move
 *   → the member, a player, is refused the form and the endpoint
 *
 * It creates a real event and a real match in the dev project every run; the
 * event name carries a timestamp so runs are distinguishable. Nothing is
 * cleaned up — that is what the test accounts and the dev project are for.
 */

const OWNER_CLUB_ID = '777223ae-4626-4161-93af-cffcf82f33aa' // Claude Test Club 4
const MEMBER_NAME = 'Claude Test Member'
const MEMBER_STATE = 'test-results/.auth/member.json'

test.describe.configure({ mode: 'serial' })

// Local calendar dates: toISOString() is UTC and lands on yesterday for most
// of the day in the Philippines, which would close registration in the past.
function localDate(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const today = localDate()
const tomorrow = localDate(1)
const eventName = `E2E Ranked Singles ${Date.now()}`
let eventId = ''
let matchId = ''

async function setAccountMode(ctx: BrowserContext, mode: 'player' | 'club') {
  await ctx.addCookies([
    // The cookie bar sits over the bottom of every page and swallows the click
    // on any button under it (Create Event, Save result). Answer it up front,
    // the same record answerCookieBanner() seeds for the audit.
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

async function expectEventStatus(page: Page, status: string) {
  await expect
    .poll(
      async () => {
        const res = await page.request.get(`/api/v1/events/${eventId}`)
        return res.ok()
          ? ((await res.json()) as { status?: string }).status
          : `http ${res.status()}`
      },
      { timeout: 15_000, message: `event ${eventId} should be ${status}` }
    )
    .toBe(status)
}

async function registerViaUi(page: Page) {
  await visit(page, `/events/${eventId}`)
  await page.getByRole('button', { name: 'Register', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Register' }).click()
  await expect(page.getByText('You are registered for this event.')).toBeVisible()
  await expect(
    page.getByRole('main').getByText('Registered', { exact: true }).first()
  ).toBeVisible()
}

test('0. leftover E2E events from earlier runs are cancelled', async ({ page, context }) => {
  // The club plan allows one live open-play event at a time, so a previous
  // run's event would block publishing this one. Cancel is the only exit for
  // a published/active event; drafts can simply be deleted.
  await setAccountMode(context, 'club')
  const res = await page.request.get(`/api/v1/events?club_id=${OWNER_CLUB_ID}&q=E2E%20Ranked`)
  expect(res.ok()).toBe(true)
  const { events } = (await res.json()) as {
    events: { id: string; name: string; status: string }[]
  }
  for (const e of events.filter((e) => e.name.startsWith('E2E Ranked Singles'))) {
    if (['cancelled', 'completed'].includes(e.status)) continue
    const action = e.status === 'draft' ? 'delete' : 'cancel'
    const r =
      action === 'delete'
        ? await page.request.delete(`/api/v1/events/${e.id}`)
        : await page.request.post(`/api/v1/events/${e.id}/cancel`)
    expect(r.ok(), `${action} ${e.name} (${e.status}) → ${r.status()}`).toBe(true)
  }
})

test('1. owner creates and publishes an Open Ranked singles event', async ({ page, context }) => {
  const { failedRequests } = attachCollectors(page)
  await setAccountMode(context, 'club')
  await visit(page, '/create-event')

  const club = page.locator('#event-club')
  if (await club.count()) await club.selectOption(OWNER_CLUB_ID)

  await page.locator('#event-name').fill(eventName)
  await page.locator('#event-description').fill('Created by the Playwright match-chain spec.')
  await page.getByRole('radio', { name: /Open Ranked/ }).check()
  await page.locator('#event-start-date').fill(today)
  await page.locator('#event-end-date').fill(tomorrow)
  await page.locator('#event-registration-closes').fill(today)
  await page.getByRole('radio', { name: 'singles' }).check()

  await page.getByRole('button', { name: 'Create Event' }).click()
  await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}$/, { timeout: 15_000 })
  eventId = page.url().match(/[0-9a-f-]{36}/)![0]
  await expect(page.getByRole('main')).toContainText(eventName)

  await page.getByRole('button', { name: 'Publish Event' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Publish' }).click()
  await expect(page.getByRole('button', { name: 'Publish Event' })).toHaveCount(0, {
    timeout: 10_000
  })
  await expectEventStatus(page, 'published')
  expect(failedRequests).toEqual([])
})

test('2. owner registers as a player', async ({ page, context }) => {
  await setAccountMode(context, 'player')
  await registerViaUi(page)
})

test('3. member registers', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: MEMBER_STATE })
  await setAccountMode(ctx, 'player')
  const page = await ctx.newPage()
  await registerViaUi(page)
  await ctx.close()
})

test('4. owner starts the event', async ({ page, context }) => {
  await setAccountMode(context, 'club')
  await visit(page, `/events/${eventId}`)
  const start = page.getByRole('button', { name: 'Start Event' })
  await expect(start).toBeEnabled()
  await start.click()
  await expect(start).toHaveCount(0, { timeout: 10_000 })
  await expectEventStatus(page, 'active')
})

test('5. owner records the result as organiser, and it is verified on save', async ({
  page,
  context
}) => {
  const { failedRequests } = attachCollectors(page)
  // Club mode: recording is organiser work. The picker lists the events this
  // player organises, not the ones they are registered for.
  await setAccountMode(context, 'club')
  await visit(page, '/matches/submit')
  await expect(page.getByRole('heading', { name: 'Which event was this?' })).toBeVisible()
  await page.getByRole('link', { name: new RegExp(eventName) }).click()
  await expect(page).toHaveURL(new RegExp(`/matches/submit\\?event=${eventId}`))

  await page.getByRole('button', { name: /^Singles/ }).click()
  // Nobody is pre-seated: the organiser at the desk did not necessarily play.
  // Both sides are picked from the registered list.
  const pick = async (nth: number, typed: string, name: string) => {
    const search = page.getByPlaceholder('Search registered players...').nth(nth)
    await search.click()
    await search.fill(typed)
    await page.getByRole('button', { name: new RegExp(name) }).first().click()
    await expect(page.getByRole('main')).toContainText(name)
  }
  await pick(0, 'Claude Test Own', 'Claude Test Owner')
  await pick(0, 'Claude Test Mem', MEMBER_NAME)

  await page.getByRole('spinbutton', { name: /Claude Test Owner, game 1/ }).fill('11')
  await page.getByRole('spinbutton', { name: /Claude Test Member, game 1/ }).fill('5')
  await expect(page.getByRole('main')).toContainText(/wins\./)

  await page.getByRole('button', { name: 'Save result' }).click()
  await expect(page).toHaveURL(/\/matches\/[0-9a-f-]{36}$/, { timeout: 15_000 })
  matchId = page.url().match(/[0-9a-f-]{36}/)![0]
  // No verification round: the organiser's record is the verification.
  await expect(page.getByRole('main')).toContainText(/verified/i)
  await expect(page.getByRole('button', { name: 'Start verification' })).toHaveCount(0)
  expect(failedRequests).toEqual([])
})

test('6. a registered player cannot record for an event they do not organise', async ({
  browser
}) => {
  const ctx = await browser.newContext({ storageState: MEMBER_STATE })
  await setAccountMode(ctx, 'player')
  const page = await ctx.newPage()
  await visit(page, `/matches/submit?event=${eventId}`)
  await expect(
    page.getByRole('heading', { name: 'Only the organiser records results here' })
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save result' })).toHaveCount(0)

  // And the API says the same thing, whatever the page shows.
  const res = await page.request.post('/api/v1/matches', {
    data: {
      event_id: eventId,
      match_type: 'singles',
      played_at: new Date().toISOString(),
      participants: [
        { player_id: '00000000-0000-4000-8000-000000000001', team_number: 1 },
        { player_id: '00000000-0000-4000-8000-000000000002', team_number: 2 }
      ],
      scores: [{ set_number: 1, team1_score: 11, team2_score: 5 }]
    }
  })
  expect(res.status()).toBe(403)
  await ctx.close()
})

test('7. the member sees the verified match and their rating moved', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: MEMBER_STATE })
  await setAccountMode(ctx, 'player')
  const page = await ctx.newPage()
  const { failedRequests } = attachCollectors(page)

  await visit(page, `/matches/${matchId}`)
  await expect(page.getByRole('main')).toContainText(/verified/i)
  await expect(page.getByRole('heading', { name: 'Your Decision' })).toHaveCount(0)

  // The rating history is the proof the settle step ran for this match.
  const res = await page.request.get(`/api/v1/matches/${matchId}/rating-changes`)
  expect(res.ok()).toBe(true)
  const body = (await res.json()) as { data: unknown[] }
  expect(body.data.length).toBeGreaterThan(0)

  expect(failedRequests).toEqual([])
  await ctx.close()
})

test('8. the verified match is in the owner match list and reads as verified', async ({
  page,
  context
}) => {
  await setAccountMode(context, 'player')
  await visit(page, '/matches')
  const link = page.getByRole('main').locator(`a[href="/matches/${matchId}"]`).first()
  await expect(link).toBeVisible()
  await link.click()
  await expect(page).toHaveURL(new RegExp(`/matches/${matchId}`))
  await expect(page.getByRole('main')).toContainText(/verified/i)
  await expect(page.getByRole('main')).toContainText(MEMBER_NAME)
})
