<script setup lang="ts">
import type { IconName } from '~/utils/icons'

/**
 * The platform-admin block in the app nav.
 *
 * Admin destinations used to sit in the same flat list as Notifications and
 * Settings, styled identically and separated by nothing — so "Sponsors" and
 * "Theme" read as ordinary account settings that other players simply happened
 * not to have. They are not. Each one changes the product for everybody, and a
 * SuperAdmin needs to be able to tell at a glance which half of the nav is
 * theirs alone.
 *
 * The separation is structural rather than chromatic: the block sits on its own
 * `surface-2` ground inside a `border-strong` outline, under a heading that
 * says who can see it. Court Green stays reserved for the primary action and
 * for confirmed state (DESIGN.md, the Confirmed-Or-Actionable rule), so nothing
 * here borrows it except the ordinary active-item treatment every nav item has.
 *
 * Collapsible because the block is eight items long and used rarely; the parent
 * opens it whenever the current route is already inside it, so the group you
 * are standing in is never folded away under you.
 */
interface NavItem {
  name: string
  href: string
  icon: IconName
  badge?: number
}

defineProps<{
  items: NavItem[]
  /** The layout owns route matching, so both navs highlight identically. */
  isActive: (href: string) => boolean
  /** Compact rows, for the mobile drawer. */
  dense?: boolean
}>()

const open = defineModel<boolean>('open', { default: false })
const panelId = useId()
</script>

<template>
  <section
    class="mt-3 overflow-hidden rounded-button border border-border-strong bg-surface-2"
    aria-labelledby="admin-nav-heading"
  >
    <button
      type="button"
      class="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      :aria-expanded="open"
      :aria-controls="panelId"
      @click="open = !open"
    >
      <UiIcon name="shield" size="h-4 w-4" class="shrink-0 text-fg-secondary" />
      <span class="min-w-0 flex-1">
        <span
          id="admin-nav-heading"
          class="block text-caption font-semibold uppercase tracking-widest text-fg-secondary"
        >
          Platform admin
        </span>
        <span class="block text-caption text-fg-muted">Only you can see this</span>
      </span>
      <UiIcon
        :name="open ? 'chevron-up' : 'chevron-down'"
        size="h-4 w-4"
        class="shrink-0 text-fg-muted"
      />
    </button>

    <div v-show="open" :id="panelId" class="border-t border-border-strong p-1">
      <NuxtLink
        v-for="item in items"
        :key="item.href"
        :to="item.href"
        class="flex items-center gap-3 rounded-button px-2 text-body-2 transition-colors"
        :class="[
          dense ? 'py-2.5' : 'py-2',
          isActive(item.href)
            ? 'bg-primary-soft text-primary'
            : 'text-fg-secondary hover:bg-surface hover:text-fg'
        ]"
        :aria-current="isActive(item.href) ? 'page' : undefined"
      >
        <UiIcon :name="item.icon" size="h-4 w-4" class="shrink-0" />
        <span class="min-w-0 flex-1 truncate">{{ item.name }}</span>
        <span
          v-if="item.badge"
          class="rounded-pill bg-primary px-1.5 py-0.5 text-caption font-semibold tabular-nums text-on-primary"
          :aria-label="`${item.badge} waiting`"
          >{{ item.badge }}</span
        >
      </NuxtLink>
    </div>
  </section>
</template>
