import type { FeatureFlagMap } from '~/server/domains/platform/dto/feature-flag.dto'

/**
 * Client-side access to the platform feature flags (docs/30 §2.5).
 *
 * Fetched once per page load under a shared key, so several components asking
 * about flags cost one request, and the answer is the same everywhere on the
 * page.
 *
 * Hiding UI is all this is for. Anything that must not be *served* when a flag
 * is off has to be gated on the server as well — a client cannot be trusted to
 * withhold data it was already sent.
 */
export function useFeatureFlags() {
  const { data, refresh } = useAsyncData(
    'platform:feature-flags',
    () => $fetch<{ data: FeatureFlagMap }>('/api/v1/platform/feature-flags'),
    {
      // A failed flag read must not take the page with it: everything gated
      // stays hidden, which is the same answer as "off".
      default: () => ({ data: {} as FeatureFlagMap })
    }
  )

  const flags = computed<FeatureFlagMap>(() => data.value?.data ?? {})

  /** Unknown keys read as off — a missing row hides its feature, never reveals it. */
  function isEnabled(key: string): boolean {
    return flags.value[key] === true
  }

  return { flags, isEnabled, refresh }
}
