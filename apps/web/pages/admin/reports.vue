<script setup lang="ts">
import {
  REPORT_REASON_LABELS,
  warningBody,
  type AdminPlayerReportDto,
  type ReportReason,
  type ReportStatus,
  type ReportStatusCounts
} from '~/server/domains/moderation/dto/report.dto'
import type { TabItem } from '~/components/ui/Tabs.vue'

/**
 * SuperAdmin moderation queue (database/liquibase/037-moderation).
 *
 * Route middleware is defence in depth — both endpoints behind this page
 * re-check the caller against platform_config.super_admin_id, and there is no
 * RLS policy to fall back on because this is the only surface allowed to see
 * who filed a report.
 *
 * The queue is worked oldest-first (the API orders it that way), one report at
 * a time. Each pending card is a complete decision: what was reported, by whom,
 * how many times this player has come up before, and — before the moderator
 * presses Warn — the exact sentence the player will receive.
 */
definePageMeta({ middleware: ['super-admin'] })

useHead({ title: 'Reports' })

interface AdminReportRow extends AdminPlayerReportDto {
  reporter: { id: string; display_name: string } | null
  reported: { id: string; display_name: string }
}

interface QueuePage {
  data: AdminReportRow[]
  total: number
  counts: ReportStatusCounts
  report_counts: Record<string, number>
}

type QueueTab = ReportStatus | 'all'

const PAGE_SIZE = 25

const route = useRoute()
const tab = ref<QueueTab>(tabFromQuery(route.query.tab))
const offset = ref(0)

function tabFromQuery(value: unknown): QueueTab {
  const v = Array.isArray(value) ? value[0] : value
  return v === 'reviewed' || v === 'actioned' || v === 'dismissed' || v === 'all' ? v : 'pending'
}

const { data, pending, error, refresh } = await useFetch<QueuePage>('/api/v1/admin/reports', {
  query: computed(() => ({
    ...(tab.value === 'all' ? {} : { status: tab.value }),
    limit: PAGE_SIZE,
    offset: offset.value
  }))
})

// Pages accumulate under "Show more"; a filter change starts the list over.
const rows = ref<AdminReportRow[]>([])
watch(
  data,
  (page) => {
    if (!page) return
    rows.value = offset.value === 0 ? page.data : [...rows.value, ...page.data]
  },
  { immediate: true }
)
watch(tab, () => {
  offset.value = 0
})

const total = computed(() => data.value?.total ?? 0)
const counts = computed(() => data.value?.counts)
const reportCounts = computed(() => data.value?.report_counts ?? {})
const hasMore = computed(() => rows.value.length < total.value)
const notAuthorized = computed(() => (error.value as { statusCode?: number })?.statusCode === 403)
const initialLoad = computed(() => pending.value && offset.value === 0)

const tabs = computed<TabItem[]>(() => [
  { value: 'pending', label: 'Pending', count: counts.value?.pending ?? null },
  { value: 'reviewed', label: 'Reviewed', count: counts.value?.reviewed ?? null },
  { value: 'actioned', label: 'Warned', count: counts.value?.actioned ?? null },
  { value: 'dismissed', label: 'Dismissed', count: counts.value?.dismissed ?? null },
  { value: 'all', label: 'All' }
])

const EMPTY: Record<QueueTab, { title: string; message: string }> = {
  pending: {
    title: 'Nothing waiting',
    message: 'Every report has been looked at. New ones appear here, oldest first.'
  },
  reviewed: {
    title: 'Nothing marked reviewed',
    message: 'Reports you looked at and closed without warning anyone will be listed here.'
  },
  actioned: {
    title: 'No warnings sent',
    message: 'Reports that ended in a warning to the player will be listed here.'
  },
  dismissed: {
    title: 'Nothing dismissed',
    message: 'Reports closed as unfounded will be listed here.'
  },
  all: { title: 'No reports yet', message: 'Nobody has reported anyone. That is the good outcome.' }
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  reviewed: 'Reviewed',
  actioned: 'Warned',
  dismissed: 'Dismissed'
}
const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-warning-soft text-warning',
  actioned: 'bg-danger-soft text-danger',
  reviewed: 'bg-success-soft text-success',
  dismissed: 'bg-surface-2 text-fg-muted'
}

const toast = useToast()

const resolvingId = ref('')
const noteFor = ref<Record<string, string>>({})

function reasonLabel(reason: string): string {
  return REPORT_REASON_LABELS[reason as ReportReason] ?? reason
}

/** Reports ever filed against this player, this one included. */
function priorReports(report: AdminReportRow): number {
  return reportCounts.value[report.reported.id] ?? 1
}

/**
 * `warn` is what sends the reported player a `moderation.warning`. The service
 * builds that notification from the reason code and this note only — never from
 * the report row — so nothing in it can identify the reporter. The preview on
 * the card is rendered from the same function the service uses.
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
    // Re-read from the top: the counts changed and the resolved card leaves
    // the Pending list, so an appended page would now be off by one.
    offset.value = 0
    await refresh()
    toast.success(
      warn
        ? `Warning sent to ${report.reported.display_name}.`
        : status === 'dismissed'
          ? 'Report dismissed.'
          : 'Report marked reviewed.'
    )
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    toast.error(fetchError.data?.message ?? 'Could not resolve the report.')
  } finally {
    resolvingId.value = ''
  }
}

function showMore() {
  offset.value = rows.value.length
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit'
  })
}

/** How long a pending report has sat in the queue — "2h", "3d", "5w". */
function waiting(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 14) return `${d}d`
  return `${Math.floor(d / 7)}w`
}
</script>

<template>
  <div class="min-h-screen bg-canvas p-4 lg:p-6">
    <div class="page-shell">
      <header class="max-w-3xl">
        <h1 class="font-display text-heading-1 text-fg">Reports</h1>
        <p class="mt-1 text-body-2 text-fg-muted">
          Worked oldest first. The reported player is never told who reported them — a warning
          names the reason and your note, nothing else.
        </p>
      </header>

      <UiTabs v-model="tab" :tabs="tabs" class="mt-5" />

      <!-- Loading -->
      <div v-if="initialLoad" class="mt-6 space-y-4" aria-busy="true">
        <div v-for="i in 3" :key="i" class="h-40 animate-pulse rounded-card bg-surface" />
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
        v-else-if="!rows.length"
        class="mt-6"
        icon="shield"
        :title="EMPTY[tab].title"
        :message="EMPTY[tab].message"
      />

      <template v-else>
        <p class="mt-6 text-caption text-fg-muted" aria-live="polite">
          Showing <span class="tabular-nums">{{ rows.length }}</span> of
          <span class="tabular-nums">{{ total }}</span>
        </p>

        <ol class="mt-3 space-y-4">
          <li v-for="report in rows" :key="report.id">
            <article
              class="rounded-card bg-surface p-5 shadow-card"
              :aria-labelledby="`report-${report.id}-title`"
            >
              <!-- Who, what, when -->
              <!-- Pills drop under the title on a phone: side by side they
                   squeezed a two-word name into a three-line column. -->
              <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-x-4">
                <div class="min-w-0 sm:flex-1">
                  <h2
                    :id="`report-${report.id}-title`"
                    class="text-body-1 font-medium leading-snug text-fg"
                  >
                    <NuxtLink
                      :to="`/players/${report.reported.id}`"
                      class="text-primary hover:underline"
                    >
                      {{ report.reported.display_name }}
                    </NuxtLink>
                    <span class="font-normal text-fg-muted"> · </span>
                    {{ reasonLabel(report.reason) }}
                  </h2>
                  <p class="mt-1 text-caption text-fg-muted">
                    <time :datetime="report.created_at" class="tabular-nums">{{
                      formatDate(report.created_at)
                    }}</time>
                    <template v-if="report.status === 'pending'">
                      · waiting <span class="tabular-nums">{{ waiting(report.created_at) }}</span>
                    </template>
                    <template v-else-if="report.reviewed_at">
                      · closed
                      <time :datetime="report.reviewed_at" class="tabular-nums">{{
                        formatDate(report.reviewed_at)
                      }}</time>
                    </template>
                    · by
                    <NuxtLink
                      v-if="report.reporter"
                      :to="`/players/${report.reporter.id}`"
                      class="text-fg-secondary hover:text-fg hover:underline"
                      >{{ report.reporter.display_name }}</NuxtLink
                    >
                    <span v-else>a deleted account</span>
                  </p>
                </div>

                <div class="flex shrink-0 items-center gap-2">
                  <!-- A repeat is the single most useful fact on the card, so it
                       sits next to the status rather than in the small print. -->
                  <span
                    v-if="priorReports(report) > 1"
                    class="inline-flex items-center gap-1 rounded-pill bg-warning-soft px-2.5 py-1 text-caption font-medium text-warning"
                    :title="`${priorReports(report)} reports have been filed against this player in total`"
                  >
                    <UiIcon name="alert" size="h-3.5 w-3.5" :stroke-width="2" />
                    <span class="tabular-nums">{{ priorReports(report) }}</span> reports
                  </span>
                  <span
                    class="rounded-pill px-2.5 py-1 text-caption font-medium"
                    :class="STATUS_STYLES[report.status] ?? 'bg-surface-2 text-fg-muted'"
                  >
                    {{ STATUS_LABEL[report.status] ?? report.status }}
                  </span>
                </div>
              </div>

              <!-- The reporter's own words -->
              <blockquote
                v-if="report.details"
                class="mt-4 whitespace-pre-wrap rounded-button bg-canvas px-4 py-3 text-body-2 leading-relaxed text-fg-secondary"
              >
                {{ report.details }}
              </blockquote>
              <p v-else class="mt-4 text-caption italic text-fg-muted">
                No details were given with this report.
              </p>

              <!-- Decision -->
              <div v-if="report.status === 'pending'" class="mt-5 border-t border-border pt-4">
                <label
                  :for="`note-${report.id}`"
                  class="block text-caption font-medium text-fg-secondary"
                >
                  Note to the player <span class="font-normal text-fg-muted">(optional)</span>
                </label>
                <textarea
                  :id="`note-${report.id}`"
                  v-model="noteFor[report.id]"
                  rows="2"
                  maxlength="500"
                  :aria-describedby="`note-${report.id}-help`"
                  class="mt-1.5 w-full rounded-button border border-border-strong bg-surface px-3 py-2 text-body-2 text-fg placeholder-fg-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="Describe the behaviour, not the person who reported it."
                />
                <p :id="`note-${report.id}-help`" class="mt-2 max-w-3xl text-caption text-fg-muted">
                  <span class="font-medium text-fg-secondary">If you warn, they will read:</span>
                  “{{ warningBody(report.reason, noteFor[report.id]) }}”
                </p>

                <div class="mt-4 flex flex-wrap justify-end gap-2">
                  <UiButton
                    variant="ghost"
                    size="sm"
                    :disabled="!!resolvingId"
                    :loading="resolvingId === report.id"
                    @click="resolve(report, 'dismissed', false)"
                  >
                    Dismiss
                  </UiButton>
                  <UiButton
                    variant="secondary"
                    size="sm"
                    :disabled="!!resolvingId"
                    :loading="resolvingId === report.id"
                    @click="resolve(report, 'reviewed', false)"
                  >
                    Mark reviewed
                  </UiButton>
                  <UiButton
                    variant="danger"
                    size="sm"
                    :disabled="!!resolvingId"
                    :loading="resolvingId === report.id"
                    @click="resolve(report, 'actioned', true)"
                  >
                    Warn player
                  </UiButton>
                </div>
              </div>

              <!-- Outcome -->
              <div v-else-if="report.resolution_note" class="mt-4 border-t border-border pt-3">
                <p class="text-caption font-medium text-fg-secondary">
                  {{ report.status === 'actioned' ? 'Sent with the warning' : 'Moderator note' }}
                </p>
                <p class="mt-1 whitespace-pre-wrap text-body-2 text-fg-secondary">
                  {{ report.resolution_note }}
                </p>
              </div>
            </article>
          </li>
        </ol>

        <div v-if="hasMore" class="mt-6 flex justify-center">
          <UiButton variant="secondary" :loading="pending" @click="showMore">
            Show more
          </UiButton>
        </div>
      </template>
    </div>
  </div>
</template>
