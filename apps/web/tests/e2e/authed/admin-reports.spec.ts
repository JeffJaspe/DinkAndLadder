import { expect, test, type Page } from '@playwright/test'
import { answerCookieBanner, attachCollectors, visit } from '../helpers/audit'

/**
 * The SuperAdmin moderation queue, driven as the test owner with the two
 * admin endpoints mocked at the network edge.
 *
 * Why mocked: the SuperAdmin is one real account in platform_config and the
 * seeded test sessions are not it, so the real API answers 403. The guard is
 * client-side on an in-app navigation (useRequestFetch → $fetch in the
 * browser), which is what lets `page.route` stand in for the real answer. The
 * endpoints themselves are covered by the service spec; this covers the
 * screen — what the moderator sees, and what pressing Warn sends.
 */

const PLAYER = (n: number, name: string) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  display_name: name
})

function report(overrides: Record<string, unknown>) {
  const created = (overrides.created_at as string) ?? new Date(Date.now() - 3 * 864e5).toISOString()
  return {
    id: crypto.randomUUID(),
    reporter_player_id: null,
    reported_player_id: (overrides.reported as { id: string }).id,
    reason: 'harassment',
    details: null,
    status: 'pending',
    reviewed_by_user_id: null,
    reviewed_at: null,
    resolution_note: null,
    created_at: created,
    updated_at: created,
    reporter: null,
    ...overrides
  }
}

const REPORTED = PLAYER(2, 'Juan dela Cruz')
const QUEUE = [
  report({
    reason: 'harassment',
    reporter: PLAYER(1, 'Maria Santos'),
    reported: REPORTED,
    details: 'Shouted at my partner across the net.'
  }),
  report({ reason: 'no_show', reporter: null, reported: PLAYER(5, 'Gabriel Ramos') }),
  report({
    reason: 'cheating',
    status: 'actioned',
    reviewed_at: new Date().toISOString(),
    reporter: PLAYER(1, 'Maria Santos'),
    reported: PLAYER(9, 'Miguel Bautista'),
    resolution_note: 'Foot faults confirmed on court.'
  })
]
const COUNTS = { pending: 2, reviewed: 0, actioned: 1, dismissed: 0 }
const REPORT_COUNTS = { [REPORTED.id]: 4, [PLAYER(5, '').id]: 1, [PLAYER(9, '').id]: 1 }

async function openQueue(page: Page, onResolve?: (body: Record<string, unknown>) => void) {
  await page.route('**/api/v1/me/is-superadmin', (r) =>
    r.fulfill({ json: { is_superadmin: true, mfa_enrolled: true, aal: 'aal2' } })
  )
  await page.route('**/api/v1/admin/reports?**', (r) => {
    const status = new URL(r.request().url()).searchParams.get('status')
    const data = status ? QUEUE.filter((x) => x.status === status) : QUEUE
    r.fulfill({
      json: { data, total: data.length, counts: COUNTS, report_counts: REPORT_COUNTS, request_id: 'x' }
    })
  })
  await page.route('**/api/v1/admin/reports/*', async (r) => {
    onResolve?.(r.request().postDataJSON())
    await r.fulfill({ json: { data: { ...QUEUE[0], status: 'actioned' }, request_id: 'x' } })
  })
  await answerCookieBanner(page)
  await visit(page, '/dashboard')
  // In-app navigation so the route guard runs in the browser, where the
  // mocks above can answer it.
  await page.evaluate(() => {
    const root = document.querySelector('#__nuxt') as HTMLElement & {
      __vue_app__: { config: { globalProperties: { $router: { push(p: string): void } } } }
    }
    root.__vue_app__.config.globalProperties.$router.push('/admin/reports')
  })
  await page.waitForURL('**/admin/reports**')
}

test.describe('admin reports queue', () => {
  test('shows the pending queue with counts, age and repeat-offender signal', async ({ page }) => {
    const { failedRequests, consoleErrors } = attachCollectors(page)
    await openQueue(page)

    await expect(page.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Pending\s*2/ })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tab', { name: /Warned\s*1/ })).toBeVisible()

    const first = page.getByRole('article').first()
    await expect(first).toContainText('Juan dela Cruz')
    await expect(first).toContainText('Harassment or abusive behaviour')
    await expect(first).toContainText('waiting 3d')
    await expect(first).toContainText('by Maria Santos')
    await expect(first).toContainText('4 reports')
    await expect(first.getByRole('blockquote')).toContainText('Shouted at my partner')

    const second = page.getByRole('article').nth(1)
    await expect(second).toContainText('a deleted account')
    await expect(second).toContainText('No details were given')
    await expect(second.getByText(/^\d+ reports$/)).toHaveCount(0)

    expect(failedRequests).toEqual([])
    expect(consoleErrors).toEqual([])
  })

  test('previews the exact warning and sends the note with it', async ({ page }) => {
    let sent: Record<string, unknown> | undefined
    await openQueue(page, (body) => (sent = body))

    const first = page.getByRole('article').first()
    const note = first.getByLabel(/Note to the player/)
    await expect(first).toContainText(
      'Your account was reported for: Harassment or abusive behaviour. Please review the community guidelines'
    )
    await note.fill('Keep it civil on court.')
    await expect(first).toContainText(
      'Your account was reported for: Harassment or abusive behaviour. From the moderation team: Keep it civil on court.'
    )

    await first.getByRole('button', { name: 'Warn player' }).click()
    await expect(page.getByText('Warning sent to Juan dela Cruz.')).toBeVisible()
    expect(sent).toEqual({
      status: 'actioned',
      resolution_note: 'Keep it civil on court.',
      warn_player: true
    })
  })

  test('resolved reports show their outcome and the tab is linkable', async ({ page }) => {
    await openQueue(page)
    await page.getByRole('tab', { name: /Warned/ }).click()
    await expect(page).toHaveURL(/tab=actioned/)

    const card = page.getByRole('article').first()
    await expect(card).toContainText('Miguel Bautista')
    await expect(card).toContainText('Warned')
    await expect(card).toContainText('closed')
    await expect(card).toContainText('Sent with the warning')
    await expect(card).toContainText('Foot faults confirmed on court.')
    await expect(card.getByRole('button', { name: 'Warn player' })).toHaveCount(0)
  })
})
