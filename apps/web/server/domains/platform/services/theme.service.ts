import type { ThemePaletteRepository } from '../repositories/theme-palette.repository'
import type { PlatformAdminService } from './platform-admin.service'
import { toThemePaletteDto, type ThemePaletteDto } from '../dto/theme-palette.dto'

export class ThemeServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export interface ActiveTheme {
  /** null means the design system's own tokens — no palette selected. */
  palette: ThemePaletteDto | null
}

export interface ThemeService {
  listPalettes(): Promise<ThemePaletteDto[]>
  getActiveKey(): Promise<string | null>
  getActiveTheme(): Promise<ActiveTheme>
  /** SuperAdmin only. `null` resets to the design system's own tokens. */
  setActivePalette(userId: string, key: string | null): Promise<ActiveTheme>
}

export function createThemeService(
  palettes: ThemePaletteRepository,
  platformAdmin: PlatformAdminService
): ThemeService {
  async function resolveActive(): Promise<ActiveTheme> {
    const key = await palettes.getActiveKey()
    if (!key) return { palette: null }

    const record = await palettes.findByKey(key)
    // A selected palette that no longer exists falls back to the defaults
    // rather than erroring: the page still has to paint.
    if (!record) {
      console.warn(`[theme] active palette '${key}' has no row; using design-system tokens.`)
      return { palette: null }
    }
    return { palette: toThemePaletteDto(record) }
  }

  return {
    async listPalettes() {
      const records = await palettes.listAll()
      return records.map(toThemePaletteDto)
    },

    getActiveKey() {
      return palettes.getActiveKey()
    },

    getActiveTheme: resolveActive,

    async setActivePalette(userId, key) {
      // Authorization before existence, so an error message cannot be used to
      // enumerate palettes.
      if (!(await platformAdmin.isSuperAdmin(userId))) {
        throw new ThemeServiceError(
          403,
          'FORBIDDEN',
          'Only the platform SuperAdmin can change the theme.'
        )
      }

      if (key !== null) {
        const record = await palettes.findByKey(key)
        if (!record) {
          throw new ThemeServiceError(404, 'PALETTE_NOT_FOUND', 'No such theme palette.')
        }
      }

      await palettes.setActiveKey(key, userId)
      return resolveActive()
    }
  }
}
