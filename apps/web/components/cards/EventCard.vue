<script setup lang="ts">
interface Props {
  id: string
  name: string
  startDate: string
  endDate?: string
  venue?: string
  province?: string
  city?: string
  registrationStatus: 'upcoming' | 'open' | 'closed'
  status: 'draft' | 'published' | 'cancelled'
  participantCount?: number
}

const props = defineProps<Props>()

const formattedDates = computed(() => {
  const start = new Date(props.startDate)
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  if (props.endDate) {
    const end = new Date(props.endDate)
    const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    return `${startStr} - ${endStr}`
  }

  return start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
})

const location = computed(() => {
  const parts = []
  if (props.venue) parts.push(props.venue)
  if (props.city) parts.push(props.city)
  if (props.province) parts.push(props.province)
  return parts.join(', ')
})

const registrationLabel = computed(() => {
  switch (props.registrationStatus) {
    case 'upcoming': return 'Opens Soon'
    case 'open': return 'Register Now'
    case 'closed': return 'Registration Closed'
    default: return ''
  }
})

const registrationClass = computed(() => {
  switch (props.registrationStatus) {
    case 'upcoming': return 'bg-warning/20 text-warning'
    case 'open': return 'bg-success/20 text-success'
    case 'closed': return 'bg-fg-muted/20 text-fg-muted'
    default: return ''
  }
})
</script>

<template>
  <NuxtLink
    :to="`/events/${id}`"
    class="group block rounded-card bg-surface p-4 shadow-card transition-all hover:shadow-card-hover hover:ring-1 hover:ring-primary/50"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <h3 class="truncate font-semibold text-fg-secondary group-hover:text-primary">
          {{ name }}
        </h3>

        <div class="mt-2 flex items-center gap-2 text-sm text-fg-muted">
          <svg class="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span>{{ formattedDates }}</span>
        </div>

        <div v-if="location" class="mt-1 flex items-center gap-2 text-sm text-fg-muted">
          <svg class="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span class="truncate">{{ location }}</span>
        </div>

        <div v-if="participantCount !== undefined" class="mt-1 flex items-center gap-2 text-sm text-fg-muted">
          <svg class="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>{{ participantCount }} registered</span>
        </div>
      </div>

      <span
        class="flex-shrink-0 rounded-pill px-3 py-1 text-xs font-medium"
        :class="registrationClass"
      >
        {{ registrationLabel }}
      </span>
    </div>
  </NuxtLink>
</template>
