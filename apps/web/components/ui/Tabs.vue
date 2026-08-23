<script setup lang="ts">
/**
 * Underlined tab bar — Player Profile (Overview / Matches / Stats /
 * Achievements / Activity), Club Page, Match Details.
 *
 * The mockup's tabs are navigation, not just local state, so the selected tab
 * is written to a route query by default (`?tab=matches`). That makes a tab
 * linkable and makes the browser back button behave the way users expect,
 * which is the whole reason §5.4 called for it.
 *
 * Keyboard behaviour follows the ARIA tabs pattern: arrows move between tabs,
 * Home/End jump to the ends.
 */

export interface TabItem {
  /** Stable key, also the query value. */
  value: string
  label: string
  /** Optional count rendered as a trailing pill. */
  count?: number | null
}

const props = withDefaults(
  defineProps<{
    tabs: TabItem[]
    modelValue?: string
    /** Query param to sync with. Pass null to keep the tab purely local. */
    queryKey?: string | null
  }>(),
  { modelValue: undefined, queryKey: 'tab' }
)

const emit = defineEmits<{ 'update:modelValue': [string] }>()

const route = useRoute()
const router = useRouter()

const active = computed(() => {
  if (props.modelValue !== undefined) return props.modelValue
  if (props.queryKey) {
    const fromQuery = route.query[props.queryKey]
    const value = Array.isArray(fromQuery) ? fromQuery[0] : fromQuery
    if (value && props.tabs.some((t) => t.value === value)) return value
  }
  return props.tabs[0]?.value ?? ''
})

function select(value: string) {
  emit('update:modelValue', value)
  if (props.queryKey) {
    // `replace`, not `push`: flipping between tabs should not stack a dozen
    // history entries the user has to back out through.
    router.replace({ query: { ...route.query, [props.queryKey]: value } })
  }
}

function onKeydown(event: KeyboardEvent) {
  const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
  if (!keys.includes(event.key)) return
  event.preventDefault()

  const index = props.tabs.findIndex((t) => t.value === active.value)
  const last = props.tabs.length - 1
  const next =
    event.key === 'Home' ? 0
      : event.key === 'End' ? last
        : event.key === 'ArrowLeft' ? (index <= 0 ? last : index - 1)
          : (index >= last ? 0 : index + 1)

  select(props.tabs[next]!.value)
}
</script>

<template>
  <div
    class="scroll-x -mb-px flex gap-1 border-b border-border"
    role="tablist"
    @keydown="onKeydown"
  >
    <button
      v-for="tab in tabs"
      :key="tab.value"
      type="button"
      role="tab"
      :aria-selected="tab.value === active"
      :tabindex="tab.value === active ? 0 : -1"
      class="relative shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-body-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      :class="tab.value === active
        ? 'border-primary text-primary'
        : 'border-transparent text-fg-secondary hover:border-border-strong hover:text-fg'"
      @click="select(tab.value)"
    >
      {{ tab.label }}
      <span
        v-if="tab.count !== null && tab.count !== undefined"
        class="ml-1.5 rounded-pill bg-surface-2 px-1.5 py-0.5 text-caption text-fg-muted"
      >{{ tab.count }}</span>
    </button>
  </div>
</template>
