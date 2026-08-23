<script setup lang="ts" generic="Row">
/**
 * The table shape the mockups repeat: Rankings, Club Members, Match lists.
 *
 * Numeric columns are right-aligned with tabular figures so digits line up and
 * a column of ratings can be scanned vertically — the single most useful thing
 * a rankings table does. Wide tables scroll inside `.scroll-x` rather than
 * moving the document sideways.
 *
 * Cells render through a per-column slot, so callers can drop avatars, badges
 * and trend arrows in without this component knowing they exist.
 */

export interface Column<T> {
  key: string
  label: string
  /** Right-align and tabular-figure the cell — use for any number. */
  numeric?: boolean
  /** Hide below `sm`. The mobile mockups drop Location, for instance. */
  hideOnMobile?: boolean
  /** Fixed width utility, e.g. `w-12`. */
  width?: string
  /** Fallback text when no `cell-<key>` slot is supplied. */
  value?: (row: T) => unknown
}

withDefaults(
  defineProps<{
    columns: Column<Row>[]
    rows: Row[]
    /** Stable key per row. */
    rowKey: (row: Row) => string | number
    /** Marks one row as the reader's own — the "where am I?" highlight. */
    isHighlighted?: (row: Row) => boolean
    /** Describes what the table lists, for screen readers. */
    caption?: string
    loading?: boolean
    skeletonRows?: number
    /** Only set when a row actually navigates somewhere. */
    clickableRows?: boolean
  }>(),
  {
    isHighlighted: undefined,
    caption: undefined,
    loading: false,
    skeletonRows: 8,
    clickableRows: false
  }
)

const emit = defineEmits<{ rowClick: [Row] }>()
</script>

<template>
  <div class="scroll-x rounded-card border border-border bg-surface shadow-card">
    <table class="w-full border-collapse text-body-2">
      <caption v-if="caption" class="sr-only">
        {{
          caption
        }}
      </caption>
      <thead>
        <tr class="border-b border-border">
          <th
            v-for="col in columns"
            :key="col.key"
            scope="col"
            class="px-4 py-3 text-caption font-semibold uppercase tracking-wide text-fg-muted"
            :class="[
              col.numeric ? 'text-right' : 'text-left',
              col.hideOnMobile ? 'hidden sm:table-cell' : '',
              col.width ?? ''
            ]"
          >
            {{ col.label }}
          </th>
        </tr>
      </thead>

      <tbody>
        <!-- Skeleton rows are shaped like the real ones so the table does not
             jump when the data lands. -->
        <template v-if="loading">
          <tr
            v-for="n in skeletonRows"
            :key="`sk-${n}`"
            class="border-b border-border last:border-0"
          >
            <td
              v-for="col in columns"
              :key="col.key"
              class="px-4 py-3"
              :class="col.hideOnMobile ? 'hidden sm:table-cell' : ''"
            >
              <div
                class="h-4 animate-pulse rounded bg-surface-2"
                :class="col.numeric ? 'ml-auto w-12' : 'w-24'"
              />
            </td>
          </tr>
        </template>

        <tr v-else-if="!rows.length">
          <td :colspan="columns.length" class="px-4 py-10 text-center text-fg-muted">
            <slot name="empty">Nothing to show yet.</slot>
          </td>
        </tr>

        <tr
          v-for="row in rows"
          v-else
          :key="rowKey(row)"
          class="border-b border-border transition-colors last:border-0"
          :class="[
            isHighlighted?.(row) ? 'bg-primary-soft' : 'hover:bg-surface-2',
            clickableRows ? 'cursor-pointer' : ''
          ]"
          @click="clickableRows && emit('rowClick', row)"
        >
          <td
            v-for="col in columns"
            :key="col.key"
            class="px-4 py-3"
            :class="[
              col.numeric ? 'text-right tabular-nums' : 'text-left',
              col.hideOnMobile ? 'hidden sm:table-cell' : ''
            ]"
          >
            <slot :name="`cell-${col.key}`" :row="row" :value="col.value?.(row)">
              {{ col.value ? col.value(row) : '' }}
            </slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
