<script setup lang="ts">
import {
  REPORT_REASON_LABELS,
  type AdminPlayerReportDto,
  type ReportReason
} from '~/server/domains/moderation/dto/report.dto'

/**
 * SuperAdmin moderation queue (database/liquibase/037-moderation).
 *
 * Route middleware is defence in depth — both endpoints behind this page
 * re-check the caller against platform_config.super_admin_id, and there is no
 * RLS policy to fall back on because this is the only surface allowed to see
 * who filed a report.
 */
definePageMeta({ middleware: ['super-admin'] })

useHead({ title: 'Reports' })

interface AdminReportRow extends AdminPlayerReportDto {
  reporter: { id: string; display_name: string } | null
  reported: { id: string; display_name: string }
}

const statusFilter = ref<'pending' | 'actioned' | 'dismissed' | 'reviewed' | ''>('pending')

const { data, pending, error, refresh } = await useFetch<{
  data: AdminReportRow[]
  total: number
}>('/api/v1/admin/reports', {
  query: computed(() => (statusFilter.value ? { status: statusFilter.value } : {}))
})

const reports = computed(() => data.value?.data ?? [])
const notAuthorized = computed(() => (error.value as { statusCode?: number })?.statusCode === 403)

const STATUS_TABS = [
  { value: 'pending', label: 'Pending' },
  { value: 'actioned', label: 'Actioned' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: '', label: 'All' }
]

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-warning/20 text-warning',
  actioned: 'bg-danger/20 text-danger',
  reviewed: 'bg-success/20 text-success',
  dismissed: 'bg-fg-muted/20 text-fg-muted'
}

const toast = useToast()

const resolvingId = ref('')
const noteFor = ref<Record<string, string>>({})

function reasonLabel(reason: string): string {
  return REPORT_REASON_LABELS[reason as ReportReason] ?? reason
}

/**
 * `warn` is what sends the reported player a `moderation.warning`. The service
 * builds that notification from the reason code and this note only — never from
 * the report row — so nothing in it can identify the reporter.
 */
async function resolve(
  report: AdminReportRow,
  status: 'actioned' | 'dismissed' | 'reviewed',
  warn: boolean
) {
  if (resolvingId.value) return
  resolvingId.value = report.id
  try {
    await $fetch(`/api/v1/admin/reports/${report.id}`, {
      method: 'PATCH',
      body: {
        status,
        resolution_note: noteFor.value[report.id]?.trim() || null,
        warn_player: warn
      }
    })
    await refresh()
    toast.success(warn ? 'Warning sent to the player.' : 'Report resolved.')
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    toast.error(fetchError.data?.message ?? 'Could not resolve the report.')
  } finally {
    resolvingId.value = ''
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}
</script>

<template>
  <div class="min-h-screen bg-canvas p-4 lg:p-6">
    <div class="page-shell">
      <h1 class="text-2xl font-bold text-fg">Reports</h1>
      <p class="mt-1 text-sm text-fg-muted">
        Super admin only. The reported player is never told who reported them — a warning names the
        reason and nothing else.
      </p>

      <div class="mt-4 flex flex-wrap gap-2">
        <button
          v-for="tab in STATUS_TABS"
          :key="tab.value"
          type="button"
          class="rounded-pill px-3 py-1.5 text-body-2 transition-colors"
          :class="
            statusFilter === tab.value
              ? 'bg-primary text-on-primary'
              : 'bg-surface text-fg-secondary hover:bg-surface-2'
          "
          @click="statusFilter = tab.value as typeof statusFilter"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Loading -->
      <div v-if="pending" class="mt-6 space-y-3">
        <div v-for="i in 3" :key="i" class="h-32 animate-pulse rounded-card bg-surface" />
      </div>

      <div v-else-if="notAuthorized" class="mt-6 rounded-card bg-danger/10 p-6 text-center">
        <p class="text-danger">Reports are limited to the SuperAdmin account.</p>
      </div>

      <UiErrorState
        v-else-if="error"
        class="mt-6"
        title="Could not load reports"
        message="The moderation queue could not be read."
        @retry="refresh()"
      />

      <UiEmptyState
        v-else-if="!reports.length"
        class="mt-6"
        title="Nothing to review"
        :message="
          statusFilter === 'pending'
            ? 'No reports are waiting. That is the good outcome.'
            : 'No reports match this filter.'
        "
      />

      <div v-else class="mt-6 space-y-4">
        <article
          v-for="report in reports"
          :key="report.id"
          class="rounded-card bg-surface p-5 shadow-card"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-body font-semibold text-fg">
                <NuxtLink
                  :to="`/players/${report.reported.id}`"
                  class="text-primary hover:underline"
                >
                  {{ report.reported.display_name }}
                </NuxtLink>
                <span class="font-normal text-fg-muted"> was reported for </span>
                {{ reasonLabel(report.reason) }}
              </p>
              <p class="mt-1 text-caption text-fg-muted">
                {{ formatDate(report.created_at) }} · reported by
                <template v-if="report.reporter">
                  <NuxtLink
                    :to="`/players/${report.reporter.id}`"
                    class="hover:text-fg hover:underline"
                    >{{ report.reporter.display_name }}</NuxtLink
                  >
                </template>
                <template v-else>a deleted account</template>
              </p>
            </div>
            <span
              class="shrink-0 rounded-pill px-2.5 py-1 text-caption font-medium capitalize"
              :class="STATUS_STYLES[report.status] ?? 'bg-fg-muted/20 text-fg-muted'"
            >
              {{ report.status }}
            </span>
          </div>

          <p
            v-if="report.details"
            class="mt-3 whitespace-pre-wrap rounded-button bg-canvas p-3 text-body-2 text-fg-secondary"
          >
            {{ report.details }}
          </p>

          <template v-if="report.status === 'pending'">
            <label :for="`note-${report.id}`" class="sr-only">Note to the player</label>
            <textarea
              :id="`note-${report.id}`"
              v-model="noteFor[report.id]"
              rows="2"
              maxlength="500"
              placeholder="Optional note. Included in the warning, so keep it about the behaviour."
              class="mt-3 w-full rounded-button border border-border-strong bg-canvas px-3 py-2 text-body-2 text-fg placeholder-fg-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />

            <div class="mt-3 flex flex-wrap justify-end gap-2">
              <UiButton
                variant="ghost"
                size="sm"
                :disabled="resolvingId === report.id"
                @click="resolve(report, 'dismissed', false)"
              >
                Dismiss
              </UiButton>
              <UiButton
                variant="secondary"
                size="sm"
                :disabled="resolvingId === report.id"
                @click="resolve(report, 'reviewed', false)"
              >
                Mark reviewed
              </UiButton>
              <UiButton
                variant="danger"
                size="sm"
                :disabled="resolvingId === report.id"
                @click="resolve(report, 'actioned', true)"
              >
                {{ resolvingId === report.id ? 'Sending…' : 'Warn player' }}
              </UiButton>
            </div>
          </template>

          <p v-else-if="report.resolution_note" class="mt-3 text-caption text-fg-muted">
            Resolution note: {{ report.resolution_note }}
          </p>
        </article>
      </div>
    </div>
  </div>
</template>
