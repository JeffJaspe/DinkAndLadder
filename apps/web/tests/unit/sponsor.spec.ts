import { describe, expect, it } from 'vitest'
import {
  isSafeSponsorLink,
  toSponsorDto,
  type SponsorRecord
} from '../../server/domains/platform/dto/sponsor.dto'

function makeRecord(overrides: Partial<SponsorRecord> = {}): SponsorRecord {
  return {
    id: 'sponsor-1',
    label: 'Acme Sports',
    image_path: 'sponsors/sponsor-1-123.png',
    link_url: 'https://example.com',
    display_order: 0,
    enabled: true,
    created_at: '2026-08-30T00:00:00Z',
    updated_at: '2026-08-30T00:00:00Z',
    ...overrides
  }
}

describe('isSafeSponsorLink', () => {
  it('accepts ordinary http and https links', () => {
    expect(isSafeSponsorLink('https://example.com')).toBe(true)
    expect(isSafeSponsorLink('http://example.com/path?a=1')).toBe(true)
  })

  it('refuses javascript: — this is rendered as an href on the public page', () => {
    // Stored XSS with an audience if it got through.
    expect(isSafeSponsorLink('javascript:alert(1)')).toBe(false)
    expect(isSafeSponsorLink('JavaScript:alert(1)')).toBe(false)
  })

  it('refuses data: URLs', () => {
    expect(isSafeSponsorLink('data:text/html,<script>alert(1)</script>')).toBe(false)
  })

  it('refuses other schemes', () => {
    expect(isSafeSponsorLink('file:///etc/passwd')).toBe(false)
    expect(isSafeSponsorLink('ftp://example.com')).toBe(false)
  })

  it('refuses a relative URL, which would point back into the platform', () => {
    expect(isSafeSponsorLink('/clubs')).toBe(false)
    expect(isSafeSponsorLink('example.com')).toBe(false)
  })

  it('refuses empty and malformed input', () => {
    expect(isSafeSponsorLink('')).toBe(false)
    expect(isSafeSponsorLink('   ')).toBe(false)
    expect(isSafeSponsorLink('https://')).toBe(false)
  })
})

describe('toSponsorDto', () => {
  it('carries the resolved URL rather than the stored path', () => {
    // The path is bucket-relative; the URL shape depends on whether the bucket
    // is public, so the two are deliberately different fields.
    const dto = toSponsorDto(makeRecord(), 'https://cdn.example.com/signed.png')

    expect(dto.image_url).toBe('https://cdn.example.com/signed.png')
    expect(JSON.stringify(dto)).not.toContain('sponsors/sponsor-1-123.png')
  })

  it('emits a null image URL for a sponsor with no logo', () => {
    const dto = toSponsorDto(makeRecord({ image_path: null }), null)
    expect(dto.image_url).toBeNull()
  })

  it('keeps the label, which is the image alt text', () => {
    const dto = toSponsorDto(makeRecord({ label: 'Acme Sports' }), null)
    expect(dto.label).toBe('Acme Sports')
  })

  it('preserves the enabled flag so the console can show hidden sponsors', () => {
    expect(toSponsorDto(makeRecord({ enabled: false }), null).enabled).toBe(false)
  })
})
