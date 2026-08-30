<script setup lang="ts">
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

const { data: myProfile } = useFetch<{ id: string } | null>('/api/v1/players/me', {
  server: false
})

const { data: rosterData } = useFetch<{ items: RosterMemberDto[] }>(
  () => `/api/v1/clubs/${clubId.value}/members`,
  { server: false }
)

const myRole = computed(
  () => rosterData.value?.items.find((m) => m.player_id === myProfile.value?.id)?.role ?? null
)
const canEdit = computed(() => myRole.value === 'OWNER' || myRole.value === 'ADMIN')

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

async function uploadImage(slot: 'cover' | 'logo', event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

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
    // Clear the input so re-picking the same file fires change again.
    input.value = ''
  }
}

async function clearImage(slot: 'cover' | 'logo') {
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

      <div v-if="pending" class="space-y-4">
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
        <NuxtLink :to="`/clubs/${clubId}`" class="mt-3 inline-block text-body-2 text-primary">
          Back to the club profile
        </NuxtLink>
      </div>

      <div v-else-if="club" class="space-y-6">
        <!-- Images -->
        <section class="rounded-card bg-surface p-5 shadow-card">
          <h2 class="font-semibold text-fg">Cover photo &amp; logo</h2>
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
                @click="clearImage('cover')"
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
                {{ club.name.charAt(0).toUpperCase() }}
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
                  @click="clearImage('logo')"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- Custom URL -->
        <section class="rounded-card bg-surface p-5 shadow-card">
          <h2 class="font-semibold text-fg">Club URL</h2>
          <p class="mt-1 text-caption text-fg-muted">
            A name people can read and remember instead of an ID. Changing it never breaks your old
            links — the ID address keeps working.
          </p>

          <div class="mt-4 flex flex-wrap items-center gap-2">
            <span class="text-body-2 text-fg-muted">/clubs/</span>
            <input
              v-model="slugInput"
              type="text"
              :minlength="MIN_SLUG_LENGTH"
              :maxlength="MAX_SLUG_LENGTH"
              class="min-w-0 flex-1 rounded-button border border-border-strong bg-canvas px-3 py-2 text-body-2 text-fg focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              @input="slugInput = slugInput.toLowerCase()"
            />
            <UiButton
              size="sm"
              :disabled="savingSlug || !slugChanged || slugProblem !== null"
              @click="saveSlug"
            >
              {{ savingSlug ? 'Saving…' : 'Save URL' }}
            </UiButton>
          </div>

          <p v-if="slugProblem" class="mt-2 text-caption text-danger">
            {{ slugProblemMessage(slugProblem) }}
          </p>
        </section>

        <!-- Details -->
        <section class="rounded-card bg-surface p-5 shadow-card">
          <h2 class="font-semibold text-fg">Details</h2>

          <div class="mt-4 space-y-4">
            <div>
              <label for="club-name" class="mb-1.5 block text-body-2 font-medium text-fg-secondary">
                Club name
              </label>
              <input
                id="club-name"
                v-model="form.name"
                type="text"
                class="w-full rounded-button border border-border-strong bg-canvas px-3 py-2 text-body-2 text-fg focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
                class="w-full rounded-button border border-border-strong bg-canvas px-3 py-2 text-body-2 text-fg focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
                  class="w-full rounded-button border border-border-strong bg-canvas px-3 py-2 text-body-2 text-fg focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
                  class="w-full rounded-button border border-border-strong bg-canvas px-3 py-2 text-body-2 text-fg focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
                class="w-full rounded-button border border-border-strong bg-canvas px-3 py-2 text-body-2 text-fg focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="public">Public — anyone can find this club</option>
                <option value="private">Private — only members can see it</option>
              </select>
            </div>

            <div class="flex justify-end">
              <UiButton :disabled="savingDetails || !form.name.trim()" @click="saveDetails">
                {{ savingDetails ? 'Saving…' : 'Save details' }}
              </UiButton>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
