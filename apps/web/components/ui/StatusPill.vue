<script setup lang="ts">
type Status =
  | 'pending'
  | 'verified'
  | 'disputed'
  | 'draft'
  | 'open'
  | 'closed'
  | 'cancelled'
  | 'active'
  | 'inactive'

interface Props {
  status: Status
  size?: 'sm' | 'md'
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md'
})

const statusConfig: Record<Status, { bg: string; text: string; icon: string; label: string }> = {
  pending: { bg: 'bg-warning/20', text: 'text-warning', icon: 'clock', label: 'Pending' },
  verified: { bg: 'bg-success/20', text: 'text-success', icon: 'check', label: 'Verified' },
  disputed: { bg: 'bg-danger/20', text: 'text-danger', icon: 'alert', label: 'Disputed' },
  draft: { bg: 'bg-fg-muted/20', text: 'text-fg-muted', icon: 'edit', label: 'Draft' },
  open: { bg: 'bg-success/20', text: 'text-success', icon: 'check', label: 'Open' },
  closed: { bg: 'bg-fg-muted/20', text: 'text-fg-muted', icon: 'x', label: 'Closed' },
  cancelled: { bg: 'bg-danger/20', text: 'text-danger', icon: 'x', label: 'Cancelled' },
  active: { bg: 'bg-success/20', text: 'text-success', icon: 'check', label: 'Active' },
  inactive: { bg: 'bg-fg-muted/20', text: 'text-fg-muted', icon: 'x', label: 'Inactive' }
}

const config = computed(() => statusConfig[props.status])

const sizeClasses = computed(() => {
  return props.size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
})
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-pill font-medium"
    :class="[config.bg, config.text, sizeClasses]"
  >
    <svg
      v-if="config.icon === 'clock'"
      class="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
    <svg
      v-else-if="config.icon === 'check'"
      class="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
    </svg>
    <svg
      v-else-if="config.icon === 'alert'"
      class="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
    <svg v-else class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
    {{ config.label }}
  </span>
</template>
