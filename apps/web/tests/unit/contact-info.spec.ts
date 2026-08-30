import { describe, expect, it } from 'vitest'
import { containsPhoneNumber } from '../../server/domains/shoutout/services/contact-info'

describe('containsPhoneNumber — the ordinary case', () => {
  it('catches a plain PH mobile number', () => {
    expect(containsPhoneNumber('Looking for a partner, text me 09171234567')).toBe(true)
  })

  it('catches the +63 form', () => {
    expect(containsPhoneNumber('reach me at +639171234567')).toBe(true)
  })

  it('catches the 0063 international prefix', () => {
    expect(containsPhoneNumber('call 00639171234567')).toBe(true)
  })

  it('catches the bare 10-digit form people write after +63', () => {
    expect(containsPhoneNumber('63 9171234567 is mine')).toBe(true)
  })
})

describe('containsPhoneNumber — separators', () => {
  it.each([
    '0917 123 4567',
    '0917-123-4567',
    '0917.123.4567',
    '(0917) 1234567',
    '0917/123/4567',
    '0917_123_4567',
    '+63 917 123 4567'
  ])('catches %s', (text) => {
    expect(containsPhoneNumber(`hit me up ${text}`)).toBe(true)
  })
})

describe('containsPhoneNumber — letters standing in for digits', () => {
  it('folds O to zero', () => {
    expect(containsPhoneNumber('O9171234567')).toBe(true)
  })

  it('folds l and I to one', () => {
    expect(containsPhoneNumber('09l7l234567')).toBe(true)
    expect(containsPhoneNumber('09I7I234567')).toBe(true)
  })

  it('catches a mixed evasion attempt', () => {
    expect(containsPhoneNumber('O9I7 - I23 . 4567')).toBe(true)
  })
})

describe('containsPhoneNumber — foreign and unrecognised formats', () => {
  it('catches a long digit run that is not a PH number', () => {
    expect(containsPhoneNumber('whatsapp 14155552671')).toBe(true)
  })
})

describe('containsPhoneNumber — text that must NOT be blocked', () => {
  it('allows an ordinary shout-out', () => {
    expect(containsPhoneNumber('Looking for a doubles partner this Saturday!')).toBe(false)
  })

  it('allows scores', () => {
    expect(containsPhoneNumber('Won 11-9, 11-7 last night')).toBe(false)
  })

  it('allows a rating', () => {
    expect(containsPhoneNumber('Just hit 4.25, chuffed')).toBe(false)
  })

  it('allows dates and times', () => {
    expect(containsPhoneNumber('Open play 6:30pm on 12/25, courts 1-4')).toBe(false)
  })

  it('allows a court and player count', () => {
    expect(containsPhoneNumber('3 courts, 16 players, 2 hours')).toBe(false)
  })

  it('does not fold s or e into digits — they are too common in real words', () => {
    // If s->5 and e->3 were folded, "sees" and similar would start matching.
    expect(containsPhoneNumber('He sees the ball early, tough opponent')).toBe(false)
  })

  it('allows an empty message', () => {
    expect(containsPhoneNumber('')).toBe(false)
  })

  it('does not match an 8-digit run, which sits below any real number', () => {
    expect(containsPhoneNumber('ref 12345678')).toBe(false)
  })
})
