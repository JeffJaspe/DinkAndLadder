import type { BrandingDto } from '~/server/domains/platform/dto/branding.dto'
import {
  DEFAULT_APP_NAME,
  DEFAULT_OVERLAY_COLOR,
  DEFAULT_OVERLAY_OPACITY
} from '~/server/domains/platform/dto/branding.dto'

/** What the platform looks like before anyone has branded it. */
const BUILT_IN: BrandingDto = {
  app_name: DEFAULT_APP_NAME,
  logo_url: null,
  favicon_url: null,
  hero: {
    title: null,
    subtitle: null,
    background_url: null,
    overlay_color: DEFAULT_OVERLAY_COLOR,
    overlay_opacity: DEFAULT_OVERLAY_OPACITY
  }
}

/**
 * The platform's name, brand images and landing hero (docs/30 §2.1, §2.3).
 *
 * One request per page load under a shared key, so the sidebar, the mobile
 * header, the document title and the landing hero all agree without four
 * fetches.
 *
 * Falls back to the built-in brand — a complete one on its own — whenever
 * nothing is set or the read fails.
 */
export function useBranding() {
  const { data, refresh } = useAsyncData(
    'platform:branding',
    () => $fetch<{ data: BrandingDto }>('/api/v1/platform/branding'),
    {
      default: () => ({ data: BUILT_IN })
    }
  )

  const branding = computed<BrandingDto>(() => data.value?.data ?? BUILT_IN)

  const appName = computed(() => branding.value.app_name || DEFAULT_APP_NAME)
  const logoUrl = computed(() => branding.value.logo_url)
  const faviconUrl = computed(() => branding.value.favicon_url)
  const hero = computed(() => branding.value.hero)

  return { branding, appName, logoUrl, faviconUrl, hero, refresh }
}
