import { describe, it, expect } from 'vitest'
import { findAuthCookies, sessionCookieString } from '../../utils/remember-me'

const PREFIX = 'sb-ycwgksyqvkoshdojujkz-auth-token'

describe('findAuthCookies', () => {
  it('picks every chunk of the auth cookie and nothing else', () => {
    const header = [
      'account_mode=club',
      `${PREFIX}.0=base64-part-one`,
      `${PREFIX}.1=base64-part-two`,
      `${PREFIX}-code-verifier=abc`,
      'dnl_remember=me%40example.com'
    ].join('; ')

    expect(findAuthCookies(header, PREFIX)).toEqual([
      { name: `${PREFIX}.0`, value: 'base64-part-one' },
      { name: `${PREFIX}.1`, value: 'base64-part-two' },
      { name: `${PREFIX}-code-verifier`, value: 'abc' }
    ])
  })

  it('keeps the value verbatim, including = signs inside it', () => {
    const [cookie] = findAuthCookies(`${PREFIX}=a=b=c`, PREFIX)
    expect(cookie.value).toBe('a=b=c')
  })

  it('returns nothing for an empty jar', () => {
    expect(findAuthCookies('', PREFIX)).toEqual([])
  })
})

describe('sessionCookieString', () => {
  it('writes the same cookie with no Max-Age and no Expires', () => {
    const out = sessionCookieString(
      { name: `${PREFIX}.0`, value: 'v' },
      { sameSite: 'lax', secure: true }
    )
    expect(out).toBe(`${PREFIX}.0=v; Path=/; SameSite=Lax; Secure`)
    expect(out).not.toMatch(/max-age|expires/i)
  })

  it('omits Secure when the auth library did not set it', () => {
    expect(sessionCookieString({ name: 'a', value: 'b' }, { secure: false })).toBe(
      'a=b; Path=/; SameSite=Lax'
    )
  })
})
