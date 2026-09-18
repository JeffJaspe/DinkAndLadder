<script setup lang="ts">
import {
  SOCIAL_COLUMNS,
  SOCIAL_META,
  SOCIAL_NETWORKS,
  socialProfileUrl,
  type SocialNetwork
} from '~/utils/social-links'

/**
 * Where a player can be found, as a row of marks.
 *
 * Renders nothing at all when no handle is set — an empty "Links" row would be
 * a label for an absence. Each mark is a real link, opens in a new tab, and is
 * named for a screen reader ("Ana on Instagram"), because the mark alone is not
 * a name.
 */
const props = defineProps<{
  links: Partial<Record<`social_${SocialNetwork}`, string | null>>
  /** The player's name, for the accessible label. */
  name?: string | null
}>()

const present = computed(() =>
  SOCIAL_NETWORKS.flatMap((network) => {
    const handle = props.links[SOCIAL_COLUMNS[network]]
    return handle ? [{ network, handle, href: socialProfileUrl(network, handle) }] : []
  })
)
</script>

<template>
  <ul v-if="present.length" class="flex flex-wrap items-center gap-1">
    <li v-for="link in present" :key="link.network">
      <a
        :href="link.href"
        target="_blank"
        rel="noopener noreferrer me"
        class="inline-flex h-9 w-9 items-center justify-center rounded-button text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        :title="`${SOCIAL_META[link.network].label}: ${link.handle}`"
      >
        <UiSocialIcon :network="link.network" size="h-[18px] w-[18px]" />
        <span class="sr-only">
          {{
            name ? `${name} on ${SOCIAL_META[link.network].label}` : SOCIAL_META[link.network].label
          }}
          ({{ link.handle }}, opens in a new tab)
        </span>
      </a>
    </li>
  </ul>
</template>
