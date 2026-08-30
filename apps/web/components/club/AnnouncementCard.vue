<script setup lang="ts">
import type { AnnouncementDto } from '~/server/domains/announcement/dto/announcement.dto'
import type { IconName } from '~/utils/icons'

/**
 * A published club announcement.
 *
 * Extracted from the 40 lines that were inline in pages/clubs/[clubId].vue,
 * where the highlight was driven by `pinned` alone:
 * `bg-warning-fill/10 ring-1 ring-warning-fill/30`. `announcement_type` — which
 * already includes `urgent` and `maintenance` — had no colour treatment at all,
 * so a court closure and a social announcement looked identical, and the one
 * highlight that did exist was a 10% wash that barely read on either theme.
 *
 * Colour now comes from the type, with `pinned` as an intensifier rather than
 * the whole signal. Every value is a semantic token, so both themes are handled
 * by the token layer rather than by two sets of hardcoded classes.
 */
const props = defineProps<{
  announcement: AnnouncementDto
  canManage: boolean
}>()

const emit = defineEmits<{
  read: [id: string]
  pin: [id: string]
  archive: [id: string]
}>()

interface TypeStyle {
  /** Left rule + tint. Solid enough to read, short of vivid. */
  container: string
  accent: string
  icon: IconName
  label: string | null
}

/**
 * `/15` rather than the old `/10`, plus a 2px left rule.
 *
 * The rule is what actually carries the signal: a tint alone has to get loud to
 * be noticed, whereas a solid edge reads at a glance and stays quiet. That is
 * the "easier to see but not too vivid" balance — the colour is doing less work
 * here, not more.
 */
const TYPE_STYLES: Record<string, TypeStyle> = {
  urgent: {
    container: 'border-l-2 border-danger bg-danger/15',
    accent: 'text-danger',
    icon: 'alert',
    label: 'Urgent'
  },
  maintenance: {
    container: 'border-l-2 border-warning-fill bg-warning-fill/15',
    accent: 'text-warning',
    icon: 'alert',
    label: 'Maintenance'
  },
  event: {
    container: 'border-l-2 border-primary bg-primary-soft',
    accent: 'text-primary',
    icon: 'calendar',
    label: 'Event'
  },
  general: {
    container: 'border-l-2 border-border-strong bg-canvas',
    accent: 'text-fg-muted',
    icon: 'info',
    label: null
  }
}

const style = computed<TypeStyle>(
  () => TYPE_STYLES[props.announcement.announcement_type] ?? TYPE_STYLES.general
)
</script>

<template>
  <article
    class="rounded-lg p-4 transition-colors"
    :class="[style.container, announcement.pinned ? 'ring-1 ring-inset ring-current/20' : '']"
    @click="emit('read', announcement.id)"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="flex min-w-0 items-center gap-2">
        <!-- Pinned keeps its own mark rather than borrowing the type colour:
             "pinned" and "urgent" are different claims and a reader has to be
             able to tell which one they are looking at. -->
        <UiIcon
          v-if="announcement.pinned"
          name="star"
          size="h-4 w-4"
          class="shrink-0 text-warning"
        />
        <UiIcon v-else :name="style.icon" size="h-4 w-4" class="shrink-0" :class="style.accent" />
        <span class="truncate font-medium text-fg">{{ announcement.title }}</span>
        <span
          v-if="style.label"
          class="shrink-0 rounded-pill px-2 py-0.5 text-caption font-medium"
          :class="style.accent"
        >
          {{ style.label }}
        </span>
      </div>
      <time class="shrink-0 text-caption text-fg-muted">
        <slot name="date" />
      </time>
    </div>

    <p class="mt-2 whitespace-pre-wrap text-body-2 text-fg-secondary">{{ announcement.body }}</p>

    <div v-if="canManage" class="mt-3 flex gap-3">
      <button
        type="button"
        class="text-caption text-primary hover:underline"
        @click.stop="emit('pin', announcement.id)"
      >
        {{ announcement.pinned ? 'Unpin' : 'Pin' }}
      </button>
      <button
        type="button"
        class="text-caption text-danger hover:underline"
        @click.stop="emit('archive', announcement.id)"
      >
        Archive
      </button>
    </div>
  </article>
</template>
