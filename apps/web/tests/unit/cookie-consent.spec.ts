import { describe, expect, it } from 'vitest'
import {
  CONSENT_CATEGORIES,
  CONSENT_COOKIE,
  CONSENT_VERSION,
  isCategoryAllowed,
  isCurrentConsent,
  makeConsentRecord
} from '~/utils/cookie-consent'

/**
 * The consent record is what decides whether the banner shows and whether a
 * non-essential category may run. Both must fail closed: anything that is not
 * a well-formed, current-version record means "no choice yet".
 */

describe('cookie consent', () => {
  it('a fresh record is current and carries the version it was made against', () => {
    const record = makeConsentRecord('all', new Date('2026-09-12T00:00:00Z'))
    expect(record).toEqual({ v: CONSENT_VERSION, choice: 'all', at: '2026-09-12T00:00:00.000Z' })
    expect(isCurrentConsent(record)).toBe(true)
  })

  it('a record from a previous consent version reads as no choice', () => {
    const stale = { ...makeConsentRecord('all'), v: CONSENT_VERSION - 1 }
    expect(isCurrentConsent(stale)).toBe(false)
    expect(isCategoryAllowed('analytics', stale)).toBe(false)
  })

  it.each([
    null,
    undefined,
    '',
    'all',
    42,
    {},
    { v: CONSENT_VERSION },
    { v: CONSENT_VERSION, choice: 'yes', at: 'x' }
  ])('rejects malformed value %j', (value) => {
    expect(isCurrentConsent(value)).toBe(false)
  })

  it('essential is always allowed, analytics only under "all"', () => {
    expect(isCategoryAllowed('essential', null)).toBe(true)
    expect(isCategoryAllowed('analytics', null)).toBe(false)
    expect(isCategoryAllowed('analytics', makeConsentRecord('essential'))).toBe(false)
    expect(isCategoryAllowed('analytics', makeConsentRecord('all'))).toBe(true)
  })

  it('the inventory lists the consent cookie itself and locks only essential', () => {
    const essential = CONSENT_CATEGORIES.find((c) => c.key === 'essential')
    expect(essential?.locked).toBe(true)
    expect(essential?.cookies.map((c) => c.name)).toContain(CONSENT_COOKIE)
    expect(CONSENT_CATEGORIES.filter((c) => c.locked)).toHaveLength(1)
  })

  it('no non-essential category sets a cookie today — if this fails, bump CONSENT_VERSION', () => {
    for (const category of CONSENT_CATEGORIES) {
      if (!category.locked) expect(category.cookies).toHaveLength(0)
    }
  })
})
