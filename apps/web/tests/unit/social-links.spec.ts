import { describe, expect, it } from 'vitest'
import {
  containsPhoneNumber,
  normalizeSocialHandle,
  socialProfileUrl,
  validateSocialHandle
} from '~/utils/social-links'
import {
  parseUpdatePlayerProfileInput,
  PlayerProfileValidationError
} from '~/server/domains/player/dto/player-profile.dto'

describe('containsPhoneNumber', () => {
  it.each([
    '0917 123 4567',
    '+63 917 123 4567',
    '09171234567',
    'text me at 917-1234',
    'call (02) 8123 4567',
    'viber +63.917.123.4567'
  ])('catches %s', (text) => {
    expect(containsPhoneNumber(text)).toBe(true)
  })

  it.each([
    'Won 11-9, 11-7 last night',
    '11-9 11-7 11-5 and out',
    'Rated 3.5, playing since 2024',
    'Court 4 at 7pm',
    'Best of 3 to 11',
    '',
    null
  ])('lets %s through', (text) => {
    expect(containsPhoneNumber(text)).toBe(false)
  })
})

describe('normalizeSocialHandle', () => {
  it('strips the @', () => {
    expect(normalizeSocialHandle('instagram', '@ana.reyes')).toBe('ana.reyes')
  })

  it('reduces a pasted profile URL to the handle', () => {
    expect(normalizeSocialHandle('instagram', 'https://www.instagram.com/ana.reyes/')).toBe(
      'ana.reyes'
    )
    expect(normalizeSocialHandle('tiktok', 'https://www.tiktok.com/@ana.reyes?lang=en')).toBe(
      'ana.reyes'
    )
    expect(normalizeSocialHandle('x', 'twitter.com/anareyes')).toBe('anareyes')
    expect(normalizeSocialHandle('facebook', 'https://fb.com/ana.reyes.pickleball')).toBe(
      'ana.reyes.pickleball'
    )
  })

  it('does not treat a URL for a different network as a handle', () => {
    // Left alone, so validation rejects it rather than storing a wrong link.
    expect(normalizeSocialHandle('x', 'https://instagram.com/ana')).toBe(
      'https://instagram.com/ana'
    )
  })

  it('returns null for an empty field', () => {
    expect(normalizeSocialHandle('x', '')).toBeNull()
    expect(normalizeSocialHandle('x', '  @ ')).toBeNull()
  })
})

describe('validateSocialHandle', () => {
  it('accepts a bare handle and null', () => {
    expect(validateSocialHandle('x', 'ana_reyes')).toBeNull()
    expect(validateSocialHandle('x', null)).toBeNull()
  })

  it('rejects spaces, slashes and over-long handles', () => {
    expect(validateSocialHandle('instagram', 'ana reyes')).toMatch(/username/)
    expect(validateSocialHandle('instagram', 'instagram.com/ana')).toMatch(/username/)
    expect(validateSocialHandle('x', 'a'.repeat(16))).toMatch(/at most 15/)
  })
})

describe('socialProfileUrl', () => {
  it('builds each network’s profile URL', () => {
    expect(socialProfileUrl('facebook', 'ana.reyes')).toBe('https://www.facebook.com/ana.reyes')
    expect(socialProfileUrl('instagram', 'ana.reyes')).toBe('https://www.instagram.com/ana.reyes')
    expect(socialProfileUrl('x', 'anareyes')).toBe('https://x.com/anareyes')
    expect(socialProfileUrl('tiktok', 'ana.reyes')).toBe('https://www.tiktok.com/@ana.reyes')
  })
})

describe('parseUpdatePlayerProfileInput — bio and social links', () => {
  it('refuses a bio carrying a phone number', () => {
    expect(() =>
      parseUpdatePlayerProfileInput({ display_name: 'Ana', bio: 'Book me: 0917 123 4567' })
    ).toThrow(PlayerProfileValidationError)
  })

  it('stores handles bare, whatever shape they arrived in', () => {
    const input = parseUpdatePlayerProfileInput({
      display_name: 'Ana',
      social_instagram: 'https://www.instagram.com/ana.reyes/',
      social_x: '@anareyes',
      social_tiktok: '',
      social_facebook: null
    })
    expect(input.social_instagram).toBe('ana.reyes')
    expect(input.social_x).toBe('anareyes')
    expect(input.social_tiktok).toBeNull()
    expect(input.social_facebook).toBeNull()
  })

  it('rejects a handle that is not one', () => {
    expect(() =>
      parseUpdatePlayerProfileInput({ display_name: 'Ana', social_x: 'not a handle' })
    ).toThrow(/username/)
  })

  it('leaves untouched fields untouched', () => {
    const input = parseUpdatePlayerProfileInput({ display_name: 'Ana' })
    expect('social_x' in input).toBe(false)
  })
})
