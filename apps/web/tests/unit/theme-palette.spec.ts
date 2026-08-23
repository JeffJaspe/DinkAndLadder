/**
 * Platform theme palettes.
 *
 * The palette values end up interpolated into a stylesheet served to every
 * visitor, so most of these are about what must never reach that stylesheet:
 * a token outside the brand set, a value that is not a colour, and a selected
 * palette whose row has gone.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  PALETTE_TOKENS,
  hexToRgbChannels,
  paletteToCss,
  sanitizePaletteColors,
  toThemePaletteDto,
  type ThemePaletteRecord
} from '../../server/domains/platform/dto/theme-palette.dto'
import {
  createThemeService,
  ThemeServiceError
} from '../../server/domains/platform/services/theme.service'
import type { ThemePaletteRepository } from '../../server/domains/platform/repositories/theme-palette.repository'
import type { PlatformAdminService } from '../../server/domains/platform/services/platform-admin.service'

const SUPER_ADMIN = 'super-admin-user-id'

function makePalette(overrides: Partial<ThemePaletteRecord> = {}): ThemePaletteRecord {
  return {
    id: 'palette-1',
    key: 'deep-ocean',
    name: 'Deep Ocean',
    description: 'Cool blue brand.',
    light: { primary: '#0B69C7', 'on-primary': '#FFFFFF' },
    dark: { primary: '#58AEEA', 'on-primary': '#04121F' },
    display_order: 2,
    ...overrides
  }
}

function serviceWith(
  records: ThemePaletteRecord[],
  { activeKey = null as string | null, isSuperAdmin = true } = {}
) {
  let stored = activeKey
  const repository = {
    listAll: vi.fn().mockResolvedValue(records),
    findByKey: vi
      .fn()
      .mockImplementation(async (key: string) => records.find((r) => r.key === key) ?? null),
    getActiveKey: vi.fn().mockImplementation(async () => stored),
    setActiveKey: vi.fn().mockImplementation(async (key: string | null) => {
      stored = key
    })
  } as unknown as ThemePaletteRepository & {
    listAll: ReturnType<typeof vi.fn>
    findByKey: ReturnType<typeof vi.fn>
    getActiveKey: ReturnType<typeof vi.fn>
    setActiveKey: ReturnType<typeof vi.fn>
  }

  const platformAdmin: PlatformAdminService = { isSuperAdmin: async () => isSuperAdmin }

  return { service: createThemeService(repository, platformAdmin), repository }
}

describe('palette colours', () => {
  it('accepts only brand tokens', () => {
    // Surfaces and text stay with the design system: a palette that could set
    // --dnl-canvas or --dnl-fg could make body text unreadable.
    const colors = sanitizePaletteColors({
      primary: '#0B69C7',
      canvas: '#000000',
      fg: '#000000'
    })

    expect(colors).toEqual({ primary: '#0B69C7' })
    expect(PALETTE_TOKENS).not.toContain('canvas')
    expect(PALETTE_TOKENS).not.toContain('fg')
  })

  it('drops anything that is not a six-digit hex', () => {
    // These are interpolated into CSS. A string that is not a colour is either
    // a mistake or an injection attempt; both fall back to the token default.
    const colors = sanitizePaletteColors({
      primary: 'red',
      'primary-hover': '#FFF',
      'primary-soft': 'rgb(0,0,0)',
      'on-primary': '#FFFFFF; } html { display: none } .x {',
      accent: 42,
      'accent-soft': '#A7E3C1'
    })

    expect(colors).toEqual({ 'accent-soft': '#A7E3C1' })
  })

  it('survives a null, an array and a primitive', () => {
    for (const stored of [null, undefined, [], 'nope', 7]) {
      expect(sanitizePaletteColors(stored)).toEqual({})
    }
  })

  it('converts hex to the channel triplet the tokens hold', () => {
    // Tokens are space-separated channels so Tailwind's /alpha modifiers work.
    expect(hexToRgbChannels('#0A7F45')).toBe('10 127 69')
    expect(hexToRgbChannels('#FFFFFF')).toBe('255 255 255')
    expect(hexToRgbChannels('#fff')).toBeNull()
    expect(hexToRgbChannels('nope')).toBeNull()
  })
})

describe('palette stylesheet', () => {
  it('emits both counterparts under selectors that outrank the base tokens', () => {
    const css = paletteToCss(toThemePaletteDto(makePalette()))

    expect(css).toContain('html:root{--dnl-primary: 11 105 199;')
    expect(css).toContain('html:root.dark{--dnl-primary: 88 174 234;')
  })

  it('emits nothing when there is no palette', () => {
    // The caller skips the <style> element entirely, leaving the design
    // system's own tokens in place.
    expect(paletteToCss(null)).toBe('')
    expect(paletteToCss({ light: {}, dark: {} })).toBe('')
  })

  it('emits nothing for a palette whose stored colours are all junk', () => {
    const css = paletteToCss(
      toThemePaletteDto(makePalette({ light: { primary: 'red' }, dark: { canvas: '#000000' } }))
    )
    expect(css).toBe('')
  })
})

describe('theme service', () => {
  it('reports no palette when none is selected', async () => {
    const { service } = serviceWith([makePalette()])
    expect(await service.getActiveTheme()).toEqual({ palette: null })
  })

  it('falls back to the defaults when the selected palette has no row', async () => {
    // A palette deleted under a live selection must not break the page.
    const { service } = serviceWith([], { activeKey: 'deep-ocean' })
    expect(await service.getActiveTheme()).toEqual({ palette: null })
  })

  it('lets the super admin choose a palette', async () => {
    const { service, repository } = serviceWith([makePalette()])

    const theme = await service.setActivePalette(SUPER_ADMIN, 'deep-ocean')

    expect(theme.palette?.key).toBe('deep-ocean')
    expect(repository.setActiveKey).toHaveBeenCalledWith('deep-ocean', SUPER_ADMIN)
  })

  it('lets the super admin reset to the built-in colours', async () => {
    const { service, repository } = serviceWith([makePalette()], { activeKey: 'deep-ocean' })

    const theme = await service.setActivePalette(SUPER_ADMIN, null)

    expect(theme.palette).toBeNull()
    expect(repository.setActiveKey).toHaveBeenCalledWith(null, SUPER_ADMIN)
  })

  it('refuses anyone who is not the super admin', async () => {
    const { service, repository } = serviceWith([makePalette()], { isSuperAdmin: false })

    await expect(service.setActivePalette('someone-else', 'deep-ocean')).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN'
    })
    expect(repository.setActiveKey).not.toHaveBeenCalled()
  })

  it('checks the caller before looking the palette up', async () => {
    const { service, repository } = serviceWith([makePalette()], { isSuperAdmin: false })

    await expect(service.setActivePalette('someone-else', 'made-up')).rejects.toMatchObject({
      status: 403
    })
    expect(repository.findByKey).not.toHaveBeenCalled()
  })

  it('404s a palette key with no row', async () => {
    const { service, repository } = serviceWith([makePalette()])

    await expect(service.setActivePalette(SUPER_ADMIN, 'made-up')).rejects.toBeInstanceOf(
      ThemeServiceError
    )
    expect(repository.setActiveKey).not.toHaveBeenCalled()
  })
})
