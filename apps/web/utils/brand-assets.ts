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
 * While true, uploaded **club and platform** imagery — club logos and covers,
 * the SuperAdmin's platform logo — is not displayed; those surfaces show the
 * brand artwork instead.
 *
 * A deliberate presentation choice, not a feature removal. Every upload path is
 * untouched: files are stored, URLs are resolved and still arrive in the DTOs,
 * and the settings screens still upload and remove them. Flipping this to
 * `false` restores that imagery with no other change.
 *
 * This used to cover player photos too. It no longer does — see
 * USE_BRAND_DEFAULT_AVATARS, which is the same idea held separately because the
 * two turned out not to be one decision.
 */
export const USE_BRAND_DEFAULTS = false

/**
 * While true, a player's uploaded photo is not displayed and their avatar is
 * the brand mark.
 *
 * Split out of USE_BRAND_DEFAULTS and turned off, because the two were never
 * really the same call. A club logo standing in as the brand mark is a
 * branding decision. A *player* photo is identity: an avatar that renders the
 * same mark for everybody cannot tell two people apart, which is the one job
 * it has in a bracket, a queue or a roster.
 *
 * With this false, `UiAvatar` shows, in order: the uploaded photo, then — when
 * there is none and the caller passed an `identity-key` — initials on that
 * player's own generated gradient, then the mark. The photo was the missing
 * step: it was uploaded, stored and resolved into `avatar_url` correctly the
 * whole time, and suppressed at the last hop, including in the profile
 * editor's own preview. Which is why it looked like the upload was broken.
 */
export const USE_BRAND_DEFAULT_AVATARS = false
