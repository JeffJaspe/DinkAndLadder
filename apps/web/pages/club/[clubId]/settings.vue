<script setup lang="ts">
import { initialsFor } from '~/utils/initials'
import type { ClubDto } from '~/server/domains/club/dto/club.dto'
import type { RosterMemberDto } from '~/server/domains/club/dto/club-membership.dto'
import {
  MAX_SLUG_LENGTH,
  MIN_SLUG_LENGTH,
  slugProblemMessage,
  validateSlug
} from '~/server/domains/club/dto/club-slug'
import { apiErrorMessage } from '~/utils/api-error-message'

/**
 * Club settings.
 *
 * There was no club settings page at all: the sidebar's "Club Settings" item
 * pointed at the *public* profile, and every edit happened through inline staff
 * controls scattered across that page. That worked while the only editable
 * fields were name and description; it stops working the moment a club has a
 * cover photo, a logo and a custom URL to manage.
 *
 * Access is checked server-side by every endpoint this page calls
 * (ClubService.updateClub, ClubBrandingService.assertClubAdmin). The role check
 * below only decides what to render.
 */
const route = useRoute()
const clubId = computed(() => route.params.clubId as string)

useHead({ title: 'Club settings' })

const toast = useToast()

const {
  data: club,
  pending,
  error,
  refresh
} = await useFetch<ClubDto>(() => `/api/v1/clubs/${clubId.value}`)

const { data: myProfile, pending: profilePending } = useFetch<{ id: string } | null>(
  '/api/v1/players/me',
  { server: false }
)

const { data: rosterData, pending: rosterPending } = useFetch<{ items: RosterMemberDto[] }>(
  () => `/api/v1/clubs/${clubId.value}/members`,
  { server: false }
)

const myRole = computed(
  () => rosterData.value?.items.find((m) => m.player_id === myProfile.value?.id)?.role ?? null
)
const canEdit = computed(() => myRole.value === 'OWNER' || myRole.value === 'ADMIN')

/**
 * The role check needs the roster *and* the caller's own profile, both fetched
 * client-side. Until both land, `canEdit` is false — which used to render "Only
 * the club owner or an admin can change these settings" for a beat in front of
 * the owner, every single time the page loaded. Skeletons hold that space
 * instead, and the refusal is only shown once we actually know.
 */
const roleUnknown = computed(() => rosterPending.value || profilePending.value)

// --- Details ----------------------------------------------------------------
const form = reactive({
  name: '',
  description: '',
  court_name: '',
  court_address: '',
  visibility: 'public' as 'public' | 'private'
})

const savingDetails = ref(false)

watch(
  club,
  (value) => {
    if (!value) return
    form.name = value.name
    form.description = value.description ?? ''
    form.court_name = value.court_name ?? ''
    form.court_address = value.court_address ?? ''
    form.visibility = value.visibility
  },
  { immediate: true }
)

/**
 * Save was live from the moment the page rendered, so the primary action on the
 * commonest visit — open settings, read them, leave — wrote the same values
 * back and reported success. It now means "there is something to save", and the
 * guard below can ask about edits that would otherwise vanish on a back tap.
 */
const detailsDirty = computed(() => {
  const value = club.value
  if (!value) return false
  return (
    form.name.trim() !== value.name ||
    form.description.trim() !== (value.description ?? '') ||
    form.court_name.trim() !== (value.court_name ?? '') ||
    form.court_address.trim() !== (value.court_address ?? '') ||
    form.visibility !== value.visibility
  )
})

async function saveDetails() {
  savingDetails.value = true
  try {
    await $fetch<{ data: ClubDto }>(`/api/v1/clubs/${clubId.value}`, {
      method: 'PATCH',
      body: {
        name: form.name.trim(),
        description: form.description.trim() || null,
        court_name: form.court_name.trim() || null,
        court_address: form.court_address.trim() || null,
        visibility: form.visibility
      }
    })
    await refresh()
    toast.success('Club details saved.')
  } catch (err) {
    toast.error(apiErrorMessage(err, 'Could not save the club details.'))
  } finally {
    savingDetails.value = false
  }
}

// --- Custom URL -------------------------------------------------------------
const slugInput = ref('')
const savingSlug = ref(false)

watch(club, (value) => {
  if (value) slugInput.value = value.slug
})

/**
 * Validated with the same function the server uses, so the field can say what
 * is wrong before a round trip. The server still checks — this is feedback, not
 * a gate, and uniqueness can only be answered by the database anyway.
 */
const slugProblem = computed(() => {
  const value = slugInput.value.trim().toLowerCase()
  if (!value || value === club.value?.slug) return null
  return validateSlug(value)
})

const slugChanged = computed(
  () => slugInput.value.trim().toLowerCase() !== club.value?.slug && slugInput.value.trim() !== ''
)

async function saveSlug() {
  if (slugProblem.value) return
  savingSlug.value = true
  try {
    await $fetch<{ data: ClubDto }>(`/api/v1/clubs/${clubId.value}`, {
      method: 'PATCH',
      body: { slug: slugInput.value.trim().toLowerCase() }
    })
    await refresh()
    toast.success('Club URL updated. Your old links still work.')
  } catch (err) {
    toast.error(apiErrorMessage(err, 'Could not update the club URL.'))
  } finally {
    savingSlug.value = false
  }
}

// --- Images -----------------------------------------------------------------
const uploadingSlot = ref<'cover' | 'logo' | ''>('')

/**
 * Mirrors the server's allow-list (branding.dto.ts). The bucket's own ceiling
 * is 50 MB, but a club admin picking a 30 MB camera original would previously
 * watch a silent progress-free upload crawl and then succeed — this rejects it
 * before it leaves the machine, and says why.
 */
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg']
const SOFT_MAX_IMAGE_BYTES = 8 * 1024 * 1024

async function uploadImage(slot: 'cover' | 'logo', event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // Cleared up front so re-picking the same file fires change again, including
  // after a rejection.
  input.value = ''
  if (!file) return

  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    toast.error('That file is not a PNG or JPEG. Pick an image in one of those formats.')
    return
  }
  if (file.size > SOFT_MAX_IMAGE_BYTES) {
    toast.error('That image is over 8 MB. Pick a smaller one, or crop it first.')
    return
  }

  uploadingSlot.value = slot
  try {
    const body = new FormData()
    body.append('file', file)
    await $fetch(`/api/v1/clubs/${clubId.value}/images/${slot}`, { method: 'POST', body })
    await refresh()
    toast.success(slot === 'cover' ? 'Cover photo updated.' : 'Logo updated.')
  } catch (err) {
    toast.error(apiErrorMessage(err, 'Could not upload the image.'))
  } finally {
    uploadingSlot.value = ''
  }
}

/**
 * Removing a club's cover or logo deletes the stored object — the file is gone,
 * not unlinked — so it gets the same confirmation every other irreversible
 * action in the product gets (docs/33 §7). It used to happen on one tap.
 */
const pendingClear = ref<'cover' | 'logo' | null>(null)

const clearCopy = computed(() =>
  pendingClear.value === 'logo'
    ? {
        title: 'Remove the logo?',
        description:
          "The club goes back to the initial mark generated from its name. The uploaded file is deleted and cannot be recovered."
      }
    : {
        title: 'Remove the cover photo?',
        description:
          'The club goes back to its generated cover art. The uploaded file is deleted and cannot be recovered.'
      }
)

async function clearImage(slot: 'cover' | 'logo') {
  pendingClear.value = null
  uploadingSlot.value = slot
  try {
    await $fetch(`/api/v1/clubs/${clubId.value}/images/${slot}`, { method: 'DELETE' })
    await refresh()
    toast.success('Image removed.')
  } catch (err) {
    toast.error(apiErrorMessage(err, 'Could not remove the image.'))
  } finally {
    uploadingSlot.value = ''
  }
}
/**
 * Back returns to the page you came from; the route below is only the
 * fallback for a deep link, where there is nothing of ours behind us.
 */
// `clubId` is a computed: interpolating the ref itself put "[object Object]"
// in the URL, so a deep link into settings had no working way back.
const { goBack } = useAppBack(`/clubs/${clubId.value}`)

/**
 * Same guard as the player profile editor, for the same reason: club settings
 * is reachable from the mobile drawer, and a mistaken tap elsewhere in the nav
 * silently discarded a half-written description. `window.confirm` because the
 * router needs a synchronous answer.
 */
onBeforeRouteLeave(() => {
  if (!detailsDirty.value || savingDetails.value) return true
  return window.confirm('You have unsaved club details. Leave without saving?')
})
</script>

<template>
  <div class="min-h-screen bg-canvas p-4 lg:p-6">
    <div class="mx-auto max-w-3xl">
      <UiPageHeader
        :to="`/clubs/${clubId}`"
        back-label="Club profile"
        title="Club settings"
        subtitle="Only the club owner and admins can change these."
      />

      <div v-if="pending || roleUnknown" class="space-y-4">
        <div v-for="i in 3" :key="i" class="h-40 animate-pulse rounded-card bg-surface" />
      </div>

      <UiErrorState
        v-else-if="error"
        title="Could not load the club"
        message="The club settings could not be read."
        @retry="refresh()"
      />

      <div v-else-if="!canEdit" class="rounded-card bg-danger/10 p-6 text-center">
        <p class="text-danger">Only the club owner or an admin can change these settings.</p>
        <button type="button" class="mt-3 inline-block text-body-2 text-primary" @click="goBack">
          Back
        </button>
      </div>

      <div v-else-if="club" class="space-y-6">
        <!-- Images -->
        <section class="rounded-card bg-surface p-5 shadow-card">
          <h2 class="font-display text-heading-3 text-fg">Cover photo &amp; logo</h2>
          <p class="mt-1 text-caption text-fg-muted">
            Leave either blank and the club keeps its generated artwork, which is designed from the
            club's name.
          </p>

          <!-- Cover -->
          <div class="mt-4">
            <p class="mb-2 text-body-2 font-medium text-fg-secondary">Cover photo</p>
            <div class="overflow-hidden rounded-card">
              <img
                v-if="club.cover_photo_url"
                :src="club.cover_photo_url"
                alt=""
                class="h-32 w-full object-cover"
              />
              <UiCoverArt v-else :name="club.name" variant="banner" rounded="rounded-none" />
            </div>
            <div class="mt-2 flex flex-wrap items-center gap-3">
              <label
                class="cursor-pointer rounded-button border border-border-strong px-3 py-1.5 text-caption text-fg-secondary transition-colors hover:border-primary hover:text-fg"
              >
                {{ uploadingSlot === 'cover' ? 'Uploading…' : 'Upload cover' }}
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  class="hidden"
                  :disabled="uploadingSlot !== ''"
                  @change="uploadImage('cover', $event)"
                />
              </label>
              <button
                v-if="club.cover_photo_url"
                type="button"
                class="text-caption text-danger hover:underline"
                :disabled="uploadingSlot !== ''"
                @click="pendingClear = 'cover'"
              >
                Remove
              </button>
            </div>
          </div>

          <!-- Logo -->
          <div class="mt-6">
            <p class="mb-2 text-body-2 font-medium text-fg-secondary">Logo</p>
            <div class="flex items-center gap-4">
              <img
                v-if="club.logo_url"
                :src="club.logo_url"
                alt=""
                class="h-16 w-16 rounded-card object-cover"
              />
              <div
                v-else
                class="flex h-16 w-16 items-center justify-center rounded-card bg-primary-soft text-heading-3 font-bold text-primary"
              >
                {{ initialsFor(club.name, 1) }}
              </div>
              <div class="flex flex-wrap items-center gap-3">
                <label
                  class="cursor-pointer rounded-button border border-border-strong px-3 py-1.5 text-caption text-fg-secondary transition-colors hover:border-primary hover:text-fg"
                >
                  {{ uploadingSlot === 'logo' ? 'Uploading…' : 'Upload logo' }}
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    class="hidden"
                    :disabled="uploadingSlot !== ''"
                    @change="uploadImage('logo', $event)"
                  />
                </label>
                <button
                  v-if="club.logo_url"
                  type="button"
                  class="text-caption text-danger hover:underline"
                  :disabled="uploadingSlot !== ''"
                  @click="pendingClear = 'logo'"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- Custom URL -->
        <section class="rounded-card bg-surface p-5 shadow-card">
          <h2 class="font-display text-heading-3 text-fg">Club URL</h2>
          <p class="mt-1 text-caption text-fg-muted">
            A name people can read and remember instead of an ID. Changing it never breaks your old
            links — the ID address keeps working.
          </p>

          <label for="club-slug" class="sr-only">Club URL</label>
          <div class="mt-4 flex flex-wrap items-center gap-2">
            <span class="text-body-2 text-fg-muted" aria-hidden="true">/clubs/</span>
            <input
              id="club-slug"
              v-model="slugInput"
              type="text"
              inputmode="url"
              autocapitalize="none"
              autocorrect="off"
              spellcheck="false"
              :minlength="MIN_SLUG_LENGTH"
              :maxlength="MAX_SLUG_LENGTH"
              :aria-invalid="slugProblem !== null || undefined"
              :aria-describedby="slugProblem ? 'club-slug-error' : undefined"
              class="min-w-0 flex-1 rounded-button border bg-canvas px-3 py-2 text-body-1 text-fg focus:outline-none focus:ring-2 sm:text-body-2"
              :class="
                slugProblem
                  ? 'border-danger focus:border-danger focus:ring-danger/40'
                  : 'border-border-strong focus:border-primary focus:ring-primary/40'
              "
              @input="slugInput = slugInput.toLowerCase()"
            />
            <UiButton
              size="sm"
              :loading="savingSlug"
              :disabled="savingSlug || !slugChanged || slugProblem !== null"
              @click="saveSlug"
            >
              {{ savingSlug ? 'Saving…' : 'Save URL' }}
            </UiButton>
          </div>

          <p v-if="slugProblem" id="club-slug-error" role="alert" class="mt-2 text-caption text-danger">
            {{ slugProblemMessage(slugProblem) }}
          </p>
        </section>

        <!-- Details -->
        <section class="rounded-card bg-surface p-5 shadow-card">
          <h2 class="font-display text-heading-3 text-fg">Details</h2>

          <div class="mt-4 space-y-4">
            <div>
              <label for="club-name" class="mb-1.5 block text-body-2 font-medium text-fg-secondary">
                Club name
              </label>
              <input
                id="club-name"
                v-model="form.name"
                type="text"
                class="w-full rounded-button border border-border-strong bg-canvas px-3 py-2 text-body-1 text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 sm:text-body-2"
              />
            </div>

            <div>
              <label for="club-desc" class="mb-1.5 block text-body-2 font-medium text-fg-secondary">
                Description
              </label>
              <textarea
                id="club-desc"
                v-model="form.description"
                rows="3"
                class="w-full rounded-button border border-border-strong bg-canvas px-3 py-2 text-body-1 text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 sm:text-body-2"
              />
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  for="club-court"
                  class="mb-1.5 block text-body-2 font-medium text-fg-secondary"
                >
                  Court name
                </label>
                <input
                  id="club-court"
                  v-model="form.court_name"
                  type="text"
                  class="w-full rounded-button border border-border-strong bg-canvas px-3 py-2 text-body-1 text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 sm:text-body-2"
                />
              </div>
              <div>
                <label
                  for="club-court-address"
                  class="mb-1.5 block text-body-2 font-medium text-fg-secondary"
                >
                  Court address
                </label>
                <input
                  id="club-court-address"
                  v-model="form.court_address"
                  type="text"
                  class="w-full rounded-button border border-border-strong bg-canvas px-3 py-2 text-body-1 text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 sm:text-body-2"
                />
              </div>
            </div>

            <div>
              <label
                for="club-visibility"
                class="mb-1.5 block text-body-2 font-medium text-fg-secondary"
              >
                Visibility
              </label>
              <select
                id="club-visibility"
                v-model="form.visibility"
                class="w-full rounded-button border border-border-strong bg-canvas px-3 py-2 text-body-1 text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 sm:text-body-2"
              >
                <option value="public">Public — anyone can find this club</option>
                <option value="private">Private — only members can see it</option>
              </select>
            </div>

            <div class="flex justify-end">
              <UiButton
                :loading="savingDetails"
                :disabled="savingDetails || !detailsDirty || !form.name.trim()"
                @click="saveDetails"
              >
                {{ savingDetails ? 'Saving…' : detailsDirty ? 'Save details' : 'Saved' }}
              </UiButton>
            </div>
          </div>
        </section>
      </div>
    </div>

    <UiModal
      :model-value="pendingClear !== null"
      :title="clearCopy.title"
      :description="clearCopy.description"
      confirm-label="Remove"
      destructive
      @update:model-value="(value: boolean) => !value && (pendingClear = null)"
      @confirm="pendingClear && clearImage(pendingClear)"
    />
  </div>
</template>
