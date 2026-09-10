/**
 * The Dink and Ladder brand files, and the switch that makes them the app's
 * default imagery.
 *
 * The source set lives in `assets/dal-assets` with its README; the copies under
 * `public/` are what the browser actually fetches. Two variants of each drawing
 * exist because the artwork is charcoal on light backgrounds and white on dark
 * ones. The `-auto` files in the set follow the OS setting only, which would
 * ignore the app's own theme toggle, so callers render both and let the `dark`
 * class choose — see UiBrandImage.
 */
export const DAL_MARK_LIGHT = '/brand/mark/dal-mark-light.svg'
export const DAL_MARK_DARK = '/brand/mark/dal-mark-dark.svg'
export const DAL_LOGO_LIGHT = '/brand/logo/dal-logo-light.svg'
export const DAL_LOGO_DARK = '/brand/logo/dal-logo-dark.svg'

/** Charcoal from the brand palette, for surfaces that need a solid ground. */
export const DAL_CHARCOAL = '#1F2024'

/**
 * While true, uploaded images — player avatars, club logos and covers, the
 * SuperAdmin's platform logo — are **not displayed**; every one of those
 * surfaces shows the brand artwork instead.
 *
 * This is a deliberate presentation choice, not a feature removal. Every upload
 * path is untouched and still working: the files are stored, the URLs are still
 * resolved and still arrive in the DTOs, and the settings screens still upload
 * and remove them. Flipping this to `false` restores uploaded imagery
 * everywhere with no other change.
 */
export const USE_BRAND_DEFAULTS = true
