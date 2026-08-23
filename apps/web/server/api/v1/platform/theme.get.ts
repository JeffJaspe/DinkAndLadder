import { paletteToCss } from '~/server/domains/platform/dto/theme-palette.dto'
import { apiError } from '~/server/utils/api-error'
import { getActiveTheme } from '~/server/utils/theme'

/**
 * The active palette, plus the stylesheet that applies it.
 *
 * Public: this paints the page for every visitor, signed in or not. The CSS is
 * built server-side so the browser never has to know how a token maps to a
 * colour channel, and so the same string can be inlined during SSR — a palette
 * fetched after hydration would flash the default brand first.
 */
export default defineEventHandler(async (event) => {
  try {
    const theme = await getActiveTheme(event)
    return {
      data: {
        palette: theme.palette,
        css: paletteToCss(theme.palette)
      },
      request_id: crypto.randomUUID()
    }
  } catch (err) {
    console.error('[GET /api/v1/platform/theme] failed:', err)
    throw apiError(500, 'INTERNAL_ERROR', 'Could not load the platform theme.')
  }
})
