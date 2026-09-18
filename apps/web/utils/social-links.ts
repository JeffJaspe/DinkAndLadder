/**
 * Social links on a player profile, and the one thing a bio may not carry.
 *
 * Pure, no imports — shared between the API layer (which is the guard) and the
 * editor (which is the courtesy), so both agree about what a handle is and what
 * a phone number looks like. Same reason `utils/game-rules.ts` is shaped this way.
 *
 * Four networks, all optional, stored as bare HANDLES rather than URLs: a handle
 * is what people actually know and type, it cannot smuggle in a link to
 * somewhere else, and the profile URL is derived from it in exactly one place.
 */

export type SocialNetwork = 'facebook' | 'instagram' | 'x' | 'tiktok'

export const SOCIAL_NETWORKS: SocialNetwork[] = ['facebook', 'instagram', 'x', 'tiktok']

export interface SocialNetworkMeta {
  label: string
  /** Where a handle lives, for the link and the editor's prefix. */
  host: string
  /** Prefix shown before the handle in the editor. */
  prefix: string
  /** The handle's grammar, applied after normalisation. */
  pattern: RegExp
  maxLength: number
  /** What the URL looks like; `{handle}` is replaced. */
  url: string
}

export const SOCIAL_META: Record<SocialNetwork, SocialNetworkMeta> = {
  facebook: {
    label: 'Facebook',
    host: 'facebook.com',
    prefix: 'facebook.com/',
    // Usernames are letters, digits and dots; profile.php?id=… is not a handle.
    pattern: /^[A-Za-z0-9.]{5,50}$/,
    maxLength: 50,
    url: 'https://www.facebook.com/{handle}'
  },
  instagram: {
    label: 'Instagram',
    host: 'instagram.com',
    prefix: '@',
    pattern: /^[A-Za-z0-9._]{1,30}$/,
    maxLength: 30,
    url: 'https://www.instagram.com/{handle}'
  },
  x: {
    label: 'X',
    host: 'x.com',
    prefix: '@',
    pattern: /^[A-Za-z0-9_]{1,15}$/,
    maxLength: 15,
    url: 'https://x.com/{handle}'
  },
  tiktok: {
    label: 'TikTok',
    host: 'tiktok.com',
    prefix: '@',
    pattern: /^[A-Za-z0-9._]{2,24}$/,
    maxLength: 24,
    url: 'https://www.tiktok.com/@{handle}'
  }
}

/** The profile column each network is stored in. */
export const SOCIAL_COLUMNS: Record<SocialNetwork, `social_${SocialNetwork}`> = {
  facebook: 'social_facebook',
  instagram: 'social_instagram',
  x: 'social_x',
  tiktok: 'social_tiktok'
}

/**
 * Hosts a pasted URL may carry for each network. Twitter is still what half
 * the world's address bars autocomplete to, so it is accepted for X.
 */
const HOSTS: Record<SocialNetwork, string[]> = {
  facebook: ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.com', 'www.fb.com'],
  instagram: ['instagram.com', 'www.instagram.com'],
  x: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'],
  tiktok: ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com']
}

/**
 * What a person typed, reduced to the handle.
 *
 * Accepts the three ways people write these — `@name`, `name`, or the whole
 * profile URL pasted from a browser — and returns the bare handle, or null for
 * an empty field. It does NOT validate; `validateSocialHandle` does, so the
 * editor can normalise on blur and the API can reject on save with one rule.
 */
export function normalizeSocialHandle(network: SocialNetwork, raw: string | null | undefined) {
  let value = (raw ?? '').trim()
  if (!value) return null

  // A pasted URL, with or without the scheme.
  const asUrl = /^(?:https?:\/\/)?([^/?#]+)(\/[^?#]*)?/i.exec(value)
  if (asUrl && HOSTS[network].includes(asUrl[1].toLowerCase())) {
    const path = (asUrl[2] ?? '').split('/').filter(Boolean)
    value = path[0] ?? ''
  }

  value = value.replace(/^@+/, '').replace(/\/+$/, '')
  return value || null
}

/** Null when the handle is acceptable, otherwise what is wrong with it. */
export function validateSocialHandle(network: SocialNetwork, handle: string | null): string | null {
  if (handle === null) return null
  const meta = SOCIAL_META[network]
  if (handle.length > meta.maxLength) {
    return `${meta.label} handles are at most ${meta.maxLength} characters.`
  }
  if (!meta.pattern.test(handle)) {
    return `That does not look like a ${meta.label} username. Paste the profile link or type the username without spaces.`
  }
  return null
}

/** The profile URL for a stored handle. */
export function socialProfileUrl(network: SocialNetwork, handle: string): string {
  return SOCIAL_META[network].url.replace('{handle}', encodeURIComponent(handle))
}

/**
 * Whether free text carries a phone number.
 *
 * A bio is public and a phone number in it is a harassment vector the product
 * would be publishing on the player's behalf. A number is a run of digit
 * groups joined by the separators people put inside numbers — space, dot,
 * dash, parentheses — adding up to seven or more digits, where every group has
 * at least two digits. The two-digit floor is what keeps a score line out of
 * it: "11-9 11-7 11-5" is nine digits, but the 9, 7 and 5 are single-digit
 * groups and break the run, while "0917 123 4567", "+63 917 123 4567",
 * "09171234567" and "917-1234" all read as dialable and are caught. A rating
 * ("3.5") and a year ("2024") are too short.
 */
export function containsPhoneNumber(text: string | null | undefined): boolean {
  if (!text) return false
  const candidates = text.match(/\+?\d+(?:[\s().\-–—]{1,2}\d+)*/g) ?? []
  for (const candidate of candidates) {
    let run = 0
    for (const group of candidate.split(/\D+/).filter(Boolean)) {
      run = group.length >= 2 ? run + group.length : 0
      if (run >= 7) return true
    }
  }
  return false
}

export const PHONE_NUMBER_MESSAGE =
  'Bios are public, so leave phone numbers out. Add your social links below instead.'
