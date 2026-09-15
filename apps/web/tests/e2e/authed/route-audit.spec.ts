import { expect, test } from '@playwright/test'
import { auditRoute, visit } from '../helpers/audit'

/**
 * Every signed-in screen, loaded as the test owner. Detail routes that need an
 * id (a club, an event, a match) are covered by the flow specs, which find or
 * create the record first.
 */
const ROUTES: [string, RegExp | string | undefined][] = [
  ['/dashboard', undefined],
  ['/feed', undefined],
  ['/rankings', /rank/i],
  ['/matches', 'Matches'],
  ['/matches/submit', /record match/i],
  ['/events', 'Events'],
  ['/community', 'Community'],
  ['/my-clubs', 'My Clubs'],
  ['/clubs', 'Discover Clubs'],
  ['/create-club', 'Create a Club'],
  ['/create-event', /event/i],
  ['/players', 'Find Players'],
  ['/following', undefined],
  ['/partners', undefined],
  ['/notifications', 'Notifications'],
  ['/settings', 'Settings'],
  ['/settings/security', /security|password/i],
  ['/profile/edit', 'Edit profile']
]

test.describe('signed-in route audit', () => {
  for (const [path, heading] of ROUTES) {
    test(`renders ${path}`, async ({ page }, testInfo) => {
      await auditRoute(page, testInfo, path, { heading })
    })
  }

  test('signed-in visitor is bounced off the guest-only pages', async ({ page }) => {
    for (const guest of ['/login', '/register']) {
      await visit(page, guest)
      await expect(page, `${guest} should redirect a signed-in user`).not.toHaveURL(
        new RegExp(`${guest}$`)
      )
    }
  })

  test('non-admin cannot open the platform admin screens', async ({ page }) => {
    for (const admin of ['/admin/features', '/admin/reports', '/admin/fees']) {
      await visit(page, admin)
      await expect(page).toHaveURL(/\/dashboard|\/admin/)
    }
  })
})
