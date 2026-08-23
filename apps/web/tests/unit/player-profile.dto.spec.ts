import { describe, expect, it } from 'vitest'
import {
  parseUpdatePlayerProfileInput,
  PlayerProfileValidationError,
  UPDATABLE_TEXT_FIELDS
} from '../../server/domains/player/dto/player-profile.dto'

describe('parseUpdatePlayerProfileInput', () => {
  it('round-trips every updatable text field', () => {
    // Regression guard for the dropped-barangay bug: if a field is added to
    // UpdatePlayerProfileInput and the parser's map, this test covers it
    // automatically rather than needing a new case.
    const body: Record<string, unknown> = { display_name: 'Jeff' }
    for (const field of UPDATABLE_TEXT_FIELDS) {
      body[field] = `value-for-${field}`
    }

    const result = parseUpdatePlayerProfileInput(body) as unknown as Record<string, unknown>

    for (const field of UPDATABLE_TEXT_FIELDS) {
      expect(result[field], `${field} was dropped by the parser`).toBe(`value-for-${field}`)
    }
  })

  it('includes barangay among the updatable fields', () => {
    expect(UPDATABLE_TEXT_FIELDS).toContain('barangay')
  })

  it('keeps barangay through a realistic profile save', () => {
    const result = parseUpdatePlayerProfileInput({
      display_name: 'Jeff',
      province: 'Cavite',
      city: 'Bacoor',
      barangay: 'Molino IV'
    })

    expect(result.barangay).toBe('Molino IV')
    expect(result.city).toBe('Bacoor')
    expect(result.province).toBe('Cavite')
  })

  it('trims display_name', () => {
    expect(parseUpdatePlayerProfileInput({ display_name: '  Jeff  ' }).display_name).toBe('Jeff')
  })

  it('preserves explicit nulls so a field can be cleared', () => {
    const result = parseUpdatePlayerProfileInput({ display_name: 'Jeff', barangay: null })
    expect(result.barangay).toBeNull()
  })

  it('omits fields that were not sent at all', () => {
    const result = parseUpdatePlayerProfileInput({ display_name: 'Jeff' })
    expect('barangay' in result).toBe(false)
    expect('city' in result).toBe(false)
  })

  it('ignores unknown keys rather than passing them to the database', () => {
    const result = parseUpdatePlayerProfileInput({
      display_name: 'Jeff',
      user_id: 'someone-elses-id',
      id: 'forged',
      created_at: '1999-01-01'
    }) as unknown as Record<string, unknown>

    expect(result.user_id).toBeUndefined()
    expect(result.id).toBeUndefined()
    expect(result.created_at).toBeUndefined()
  })

  it('rejects a missing or blank display_name', () => {
    expect(() => parseUpdatePlayerProfileInput({})).toThrow(PlayerProfileValidationError)
    expect(() => parseUpdatePlayerProfileInput({ display_name: '   ' })).toThrow(
      PlayerProfileValidationError
    )
  })

  it('rejects a non-object body', () => {
    expect(() => parseUpdatePlayerProfileInput(null)).toThrow(PlayerProfileValidationError)
    expect(() => parseUpdatePlayerProfileInput('nope')).toThrow(PlayerProfileValidationError)
  })

  it('rejects a non-string text field', () => {
    expect(() => parseUpdatePlayerProfileInput({ display_name: 'Jeff', barangay: 42 })).toThrow(
      /barangay must be a string or null/
    )
  })

  it('rejects an invalid profile_visibility', () => {
    expect(() =>
      parseUpdatePlayerProfileInput({ display_name: 'Jeff', profile_visibility: 'friends' })
    ).toThrow(/profile_visibility/)
  })

  it('accepts both valid visibility values', () => {
    expect(
      parseUpdatePlayerProfileInput({ display_name: 'Jeff', profile_visibility: 'private' })
        .profile_visibility
    ).toBe('private')
    expect(
      parseUpdatePlayerProfileInput({ display_name: 'Jeff', profile_visibility: 'public' })
        .profile_visibility
    ).toBe('public')
  })
})
