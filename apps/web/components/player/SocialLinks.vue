<script setup lang="ts">
import {
  SOCIAL_COLUMNS,
  SOCIAL_META,
  SOCIAL_NETWORKS,
  socialProfileUrl,
  type SocialNetwork
} from '~/utils/social-links'

/**
 * Where a player can be found: one labelled chip per network.
 *
 * A bare grey mark was too quiet to read as a link and too small to read as
 * a brand — four muted glyphs in a row looked like decoration. Each is now a
 * chip: the mark in its brand colour, the network's name beside it, the
 * handle in the tooltip. Renders nothing at all when no handle is set; an
 * empty "Social links" row would be a heading for an absence.
 */
const props = defineProps<{
  links: Partial<Record<`social_${SocialNetwork}`, string | null>>
  /** The player's name, for the accessible label. */
  name?: string | null
  /** Show the "Social links" heading over the row. */
  heading?: boolean
}>()

const present = computed(() =>
  SOCIAL_NETWORKS.flatMap((network) => {
    const handle = props.links[SOCIAL_COLUMNS[network]]
    return handle ? [{ network, handle, href: socialProfileUrl(network, handle) }] : []
  })
)

const MARK: Record<SocialNetwork, string> = {
  facebook: 'text-brand-facebook',
  instagram: 'text-brand-instagram',
  x: 'text-brand-x',
  tiktok: 'text-brand-tiktok'
}
</script>

<template>
  <div v-if="present.length">
    <p
      v-if="heading"
      class="mb-2 text-caption font-semibold uppercase tracking-wider text-fg-muted"
    >
      Social links
    </p>
    <ul class="flex flex-wrap items-center gap-2">
      <li v-for="link in present" :key="link.network">
        <a
          :href="link.href"
          target="_blank"
          rel="noopener noreferrer me"
          class="inline-flex min-h-9 items-center gap-2 rounded-pill border border-border bg-surface py-1.5 pl-2.5 pr-3 text-body-2 font-medium text-fg shadow-card transition-colors hover:border-border-strong hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          :title="`${SOCIAL_META[link.network].label}: ${SOCIAL_META[link.network].prefix}${link.handle}`"
        >
          <UiSocialIcon
            :network="link.network"
            size="h-[18px] w-[18px]"
            :class="MARK[link.network]"
          />
          <span>{{ SOCIAL_META[link.network].label }}</span>
          <span class="sr-only">
            — {{ name ? `${name} on ${SOCIAL_META[link.network].label}` : link.handle }}, opens in a
            new tab
          </span>
        </a>
      </li>
    </ul>
  </div>
</template>
