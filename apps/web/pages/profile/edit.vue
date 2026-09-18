<script setup lang="ts">
import type {
  PlayerProfileDto,
  ProfileVisibility
} from '~/server/domains/player/dto/player-profile.dto'
import {
  MAX_BIO_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_NAME_LENGTH
} from '~/server/domains/player/dto/player-profile.dto'
import { apiErrorMessage } from '~/utils/api-error-message'
import {
  containsPhoneNumber,
  normalizeSocialHandle,
  PHONE_NUMBER_MESSAGE,
  SOCIAL_COLUMNS,
  SOCIAL_META,
  SOCIAL_NETWORKS,
  validateSocialHandle,
  type SocialNetwork
} from '~/utils/social-links'

useHead({ title: 'Edit profile' })

const {
  data: existingProfile,
  pending,
  error,
  refresh
} = await useFetch<PlayerProfileDto>('/api/v1/players/me')

const {
  provinces,
  cities,
  barangays,
  selectedProvince,
  selectedCity,
  selectedBarangay,
  loadingProvinces,
  loadingCities,
  loadingBarangays,
  loadProvinces,
  selectProvince,
  selectCity,
  selectBarangay
} = useLocationPicker()

onMounted(() => {
  loadProvinces()
})

const { data: authInfo } = await useFetch<{
  provider: string
  providers: string[]
  created_at: string
}>('/api/v1/me/auth-info')

const authMethodLabel = computed(() => {
  const provider = authInfo.value?.provider
  if (provider === 'google') return 'Signed in with Google'
  if (provider === 'email') return 'Signed in with email'
  return provider ? `Signed in with ${provider}` : 'Unknown'
})

/**
 * province/city/barangay are held here as the saved *names*, seeded from the
 * loaded profile and only overwritten when the user actually picks something.
 * Saving reads these, never the picker's computed names — so a slow or failed
 * PSGC lookup can no longer blank out a location the user never touched.
 */
const form = reactive({
  display_name: '',
  first_name: '',
  last_name: '',
  bio: '',
  province: '',
  city: '',
  barangay: '',
  dominant_hand: '',
  preferred_position: '',
  profile_visibility: 'public' as ProfileVisibility,
  show_match_history: true,
  social_facebook: '',
  social_instagram: '',
  social_x: '',
  social_tiktok: ''
})

/**
 * The bio's one rule, checked as they type so the save button never has to
 * be the thing that tells them. The API enforces the same rule.
 */
const bioPhoneWarning = computed(() => (containsPhoneNumber(form.bio) ? PHONE_NUMBER_MESSAGE : ''))

/**
 * A handle field tidies itself on blur — `@name`, a pasted profile URL, a
 * trailing slash all become the bare username — and says what is wrong with
 * whatever is left. Same functions the API runs, so the two cannot disagree.
 */
const socialErrors = reactive<Record<SocialNetwork, string>>({
  facebook: '',
  instagram: '',
  x: '',
  tiktok: ''
})

function tidySocial(network: SocialNetwork) {
  const column = SOCIAL_COLUMNS[network]
  const handle = normalizeSocialHandle(network, form[column])
  form[column] = handle ?? ''
  socialErrors[network] = validateSocialHandle(network, handle) ?? ''
}

const hasFieldProblem = computed(
  () => !!bioPhoneWarning.value || SOCIAL_NETWORKS.some((n) => !!socialErrors[n])
)

/**
 * A snapshot of the form as last loaded or saved.
 *
 * Save used to be enabled from the moment the page rendered, so the commonest
 * visit to this screen — open it, read it, leave — offered a primary action
 * that would write the same values back. Comparing against the snapshot makes
 * Save mean "there is something to save", and gives the leave guard below
 * something to ask about.
 */
const baseline = ref('')
const snapshot = () => JSON.stringify(form)
const dirty = computed(() => baseline.value !== '' && snapshot() !== baseline.value)

function onProvinceChange(code: string) {
  const promise = selectProvince(code)
  form.province = code ? (provinces.value.find((p) => p.code === code)?.name ?? '') : ''
  form.city = ''
  form.barangay = ''
  return promise
}

function onCityChange(code: string) {
  const promise = selectCity(code)
  form.city = code ? (cities.value.find((c) => c.code === code)?.name ?? '') : ''
  form.barangay = ''
  return promise
}

function onBarangayChange(code: string) {
  selectBarangay(code)
  form.barangay = code ? (barangays.value.find((b) => b.code === code)?.name ?? '') : ''
}

watch(
  existingProfile,
  async (profile) => {
    if (!profile) return
    form.display_name = profile.display_name
    form.first_name = profile.first_name ?? ''
    form.last_name = profile.last_name ?? ''
    form.bio = profile.bio ?? ''
    form.dominant_hand = profile.dominant_hand ?? ''
    form.preferred_position = profile.preferred_position ?? ''
    form.profile_visibility = profile.profile_visibility
    form.show_match_history = profile.show_match_history
    for (const network of SOCIAL_NETWORKS) {
      form[SOCIAL_COLUMNS[network]] = profile[SOCIAL_COLUMNS[network]] ?? ''
    }

    form.province = profile.province ?? ''
    form.city = profile.city ?? ''
    form.barangay = profile.barangay ?? ''
    baseline.value = snapshot()

    // Resolve the saved names back to PSGC codes so the dropdowns show the
    // current selection. Each step awaits the list it depends on rather than
    // guessing with a timer. If any lookup fails, form.* above still holds the
    // stored values, so saving preserves them.
    if (!profile.province) return
    await loadProvinces()
    const matchedProvince = provinces.value.find((p) => p.name === profile.province)
    if (!matchedProvince) return

    await selectProvince(matchedProvince.code)
    form.province = matchedProvince.name
    if (!profile.city) return

    const matchedCity = cities.value.find((c) => c.name === profile.city)
    if (!matchedCity) return

    await selectCity(matchedCity.code)
    form.city = matchedCity.name
    if (!profile.barangay) return

    const matchedBarangay = barangays.value.find((b) => b.name === profile.barangay)
    if (!matchedBarangay) return

    selectBarangay(matchedBarangay.code)
    form.barangay = matchedBarangay.name
  },
  { immediate: true }
)

/**
 * Re-baseline after the PSGC round trip.
 *
 * Resolving the saved names back to codes rewrites form.province/city/barangay
 * with the *same* names, but only after the snapshot above was taken — which
 * would otherwise leave the page permanently dirty on load and put an "unsaved
 * changes" prompt in front of someone who changed nothing.
 */
watch([() => form.province, () => form.city, () => form.barangay], () => {
  const profile = existingProfile.value
  if (!profile || !dirty.value) return
  const locationUntouched =
    form.province === (profile.province ?? '') &&
    form.city === (profile.city ?? '') &&
    form.barangay === (profile.barangay ?? '')
  if (locationUntouched) baseline.value = snapshot()
})

// --- Photo ------------------------------------------------------------------
const photoInput = ref<HTMLInputElement | null>(null)
const uploadingPhoto = ref(false)
const removingPhoto = ref(false)
const photoError = ref('')
/** Shown the instant a file is picked, so the swap is not a blank second. */
const localPreview = ref<string | null>(null)
const confirmRemovePhoto = ref(false)

const avatarSrc = computed(() => localPreview.value ?? existingProfile.value?.avatar_url ?? null)
const photoBusy = computed(() => uploadingPhoto.value || removingPhoto.value)

/**
 * Mirrors the server's allow-list (branding.dto.ts). The bucket's own ceiling
 * is 50 MB, but a phone camera JPEG is a few MB and anything far past that is a
 * mistake worth catching here rather than after it has crawled up a mobile
 * connection — this page is used courtside.
 */
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg']
const SOFT_MAX_BYTES = 8 * 1024 * 1024

async function onPhotoPicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // Cleared immediately so re-picking the same file fires change again.
  input.value = ''
  if (!file) return

  photoError.value = ''
  if (!ACCEPTED_TYPES.includes(file.type)) {
    photoError.value = 'That file is not a PNG or JPEG. Pick a photo in one of those formats.'
    return
  }
  if (file.size > SOFT_MAX_BYTES) {
    photoError.value = 'That photo is over 8 MB. Pick a smaller one, or crop it first.'
    return
  }

  if (localPreview.value) URL.revokeObjectURL(localPreview.value)
  localPreview.value = URL.createObjectURL(file)
  uploadingPhoto.value = true
  try {
    const body = new FormData()
    body.append('file', file)
    await $fetch('/api/v1/players/me/avatar', { method: 'POST', body })
    await refresh()
    // Hand back to the stored URL now that there is one. Holding the blob would
    // show a photo the rest of the app cannot see, and keep bytes alive that
    // the browser has no other way to reclaim.
    if (localPreview.value) URL.revokeObjectURL(localPreview.value)
    localPreview.value = null
  } catch (err) {
    photoError.value = apiErrorMessage(err, 'Could not upload the photo.')
    // Drop the optimistic preview: leaving it up would show a photo that is
    // not actually saved anywhere.
    if (localPreview.value) URL.revokeObjectURL(localPreview.value)
    localPreview.value = null
  } finally {
    uploadingPhoto.value = false
  }
}

async function removePhoto() {
  confirmRemovePhoto.value = false
  photoError.value = ''
  removingPhoto.value = true
  try {
    await $fetch('/api/v1/players/me/avatar', { method: 'DELETE' })
    if (localPreview.value) URL.revokeObjectURL(localPreview.value)
    localPreview.value = null
    await refresh()
  } catch (err) {
    photoError.value = apiErrorMessage(err, 'Could not remove the photo.')
  } finally {
    removingPhoto.value = false
  }
}

// A blob URL held past the page's life is memory the browser cannot reclaim.
onBeforeUnmount(() => {
  if (localPreview.value) URL.revokeObjectURL(localPreview.value)
})

// --- Saving -----------------------------------------------------------------
const saving = ref(false)
const errorMessage = ref('')
const savedMessage = ref('')

async function handleSave() {
  errorMessage.value = ''
  savedMessage.value = ''
  saving.value = true
  try {
    await $fetch('/api/v1/players/me', {
      method: 'PATCH',
      body: {
        display_name: form.display_name.trim(),
        first_name: form.first_name.trim() || null,
        last_name: form.last_name.trim() || null,
        bio: form.bio.trim() || null,
        province: form.province || null,
        city: form.city || null,
        barangay: form.barangay || null,
        dominant_hand: form.dominant_hand || null,
        preferred_position: form.preferred_position || null,
        profile_visibility: form.profile_visibility,
        show_match_history: form.show_match_history,
        social_facebook: normalizeSocialHandle('facebook', form.social_facebook),
        social_instagram: normalizeSocialHandle('instagram', form.social_instagram),
        social_x: normalizeSocialHandle('x', form.social_x),
        social_tiktok: normalizeSocialHandle('tiktok', form.social_tiktok)
      }
    })
    baseline.value = snapshot()
    savedMessage.value = 'Profile saved.'
    setTimeout(() => {
      savedMessage.value = ''
    }, 3000)
  } catch (err) {
    errorMessage.value = apiErrorMessage(err, 'Could not save your profile.')
  } finally {
    saving.value = false
  }
}

/**
 * Leaving with edits still in the form loses them silently, and this page sits
 * on the mobile tab bar — one mistaken tap on Home was the whole edit gone.
 * `window.confirm` rather than UiModal because the guard has to answer the
 * router synchronously, and the browser's own prompt is the only thing that can.
 */
onBeforeRouteLeave(() => {
  if (!dirty.value || saving.value) return true
  return window.confirm('You have unsaved changes to your profile. Leave without saving?')
})

const VISIBILITY_OPTIONS = [
  {
    value: 'public' as const,
    title: 'Public profile',
    hint: 'Anyone can view your profile and your rating. Your match history stays private unless you turn it on below.'
  },
  {
    value: 'private' as const,
    title: 'Private profile',
    hint: 'Only your followers can view your profile, and your match history is never published.'
  }
]

/**
 * 16px on mobile, 14px from `sm`. Anything under 16px makes iOS Safari zoom the
 * viewport the moment a field takes focus, and this form is nine fields long.
 */
const fieldClass =
  'w-full rounded-button border border-border-strong bg-canvas px-4 py-2.5 text-body-1 text-fg placeholder-fg-muted transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 sm:text-body-2'
</script>

<template>
  <div class="page-shell px-4 py-6 lg:px-6">
    <div class="mx-auto max-w-2xl">
      <UiPageHeader to="/settings" back-label="Settings" />

      <div class="mb-6">
        <h1 class="font-display text-heading-1 text-fg">Edit profile</h1>
        <p class="mt-1 text-body-2 text-fg-muted">
          What other players see on your profile, in the rankings and beside your matches.
        </p>
      </div>

      <!-- Loading -->
      <div v-if="pending" class="space-y-4">
        <div class="h-32 animate-pulse rounded-card bg-surface" />
        <div class="h-48 animate-pulse rounded-card bg-surface" />
        <div class="h-32 animate-pulse rounded-card bg-surface" />
      </div>

      <!-- Error. 404 is not one: it means "no profile saved yet", and the
           empty form below is exactly the right thing to show for that. -->
      <UiErrorState
        v-else-if="error && error.statusCode !== 404"
        title="Could not load your profile"
        message="Your profile could not be read just now."
        @retry="refresh()"
      />

      <!-- Form -->
      <form v-else class="space-y-6" @submit.prevent="handleSave">
        <!-- Photo -->
        <section class="rounded-card bg-surface p-5 shadow-card">
          <h2 class="font-display text-heading-3 text-fg">Photo</h2>
          <p class="mt-1 text-caption text-fg-muted">
            Leave this blank and your initials are used — a finished look on their own.
          </p>

          <div class="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
            <div class="relative shrink-0 self-start sm:self-auto">
              <UiAvatar :name="form.display_name" :src="avatarSrc" size="xl" />
              <span
                v-if="photoBusy"
                class="absolute inset-0 flex items-center justify-center rounded-full bg-canvas/80"
              >
                <UiIcon name="refresh" size="h-6 w-6" class="animate-spin text-primary" />
              </span>
            </div>

            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <UiButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  :disabled="photoBusy"
                  @click="photoInput?.click()"
                >
                  <UiIcon name="camera" size="h-4 w-4" />
                  {{ uploadingPhoto ? 'Uploading…' : avatarSrc ? 'Replace photo' : 'Upload photo' }}
                </UiButton>
                <UiButton
                  v-if="existingProfile?.avatar_url"
                  type="button"
                  variant="danger"
                  size="sm"
                  :disabled="photoBusy"
                  @click="confirmRemovePhoto = true"
                >
                  <UiIcon name="trash" size="h-4 w-4" />
                  {{ removingPhoto ? 'Removing…' : 'Remove' }}
                </UiButton>
              </div>
              <p class="mt-2 text-caption text-fg-muted">PNG or JPEG, up to 8 MB.</p>
              <p v-if="photoError" role="alert" class="mt-2 text-caption text-danger">
                {{ photoError }}
              </p>
            </div>
          </div>

          <!-- Driven by the button above rather than wrapped in a styled label:
               a label wrapping a hidden input cannot show a disabled or busy
               state, and this control has both. -->
          <input
            ref="photoInput"
            type="file"
            accept="image/png,image/jpeg"
            class="sr-only"
            tabindex="-1"
            aria-hidden="true"
            @change="onPhotoPicked"
          />
        </section>

        <!-- Account -->
        <section class="rounded-card bg-surface p-5 shadow-card">
          <h2 class="font-display text-heading-3 text-fg">Account</h2>
          <div class="mt-4 flex items-center gap-3">
            <span
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-button bg-surface-2 text-fg-secondary"
            >
              <UiIcon :name="authInfo?.provider === 'google' ? 'verified' : 'user'" />
            </span>
            <div class="min-w-0">
              <p class="truncate text-body-2 font-medium text-fg">{{ authMethodLabel }}</p>
              <p v-if="authInfo?.created_at" class="text-caption tabular-nums text-fg-muted">
                Member since {{ new Date(authInfo.created_at).toLocaleDateString() }}
              </p>
            </div>
            <NuxtLink
              to="/settings/security"
              class="ml-auto shrink-0 rounded-button px-2 py-1.5 text-caption text-primary transition-colors hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Manage
            </NuxtLink>
          </div>
        </section>

        <!-- Basic information -->
        <section class="rounded-card bg-surface p-5 shadow-card">
          <h2 class="font-display text-heading-3 text-fg">Basic information</h2>
          <div class="mt-4 space-y-4">
            <div>
              <label
                for="display-name"
                class="mb-1.5 block text-body-2 font-medium text-fg-secondary"
              >
                Display name <span class="text-danger" aria-hidden="true">*</span>
              </label>
              <input
                id="display-name"
                v-model="form.display_name"
                type="text"
                required
                autocomplete="nickname"
                :maxlength="MAX_DISPLAY_NAME_LENGTH"
                placeholder="Your public name"
                :class="fieldClass"
              />
              <p class="mt-1.5 flex justify-between gap-3 text-caption text-fg-muted">
                <span>Shown everywhere in the app.</span>
                <span class="tabular-nums"
                  >{{ form.display_name.length }}/{{ MAX_DISPLAY_NAME_LENGTH }}</span
                >
              </p>
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  for="first-name"
                  class="mb-1.5 block text-body-2 font-medium text-fg-secondary"
                >
                  First name
                </label>
                <input
                  id="first-name"
                  v-model="form.first_name"
                  type="text"
                  autocomplete="given-name"
                  :maxlength="MAX_NAME_LENGTH"
                  placeholder="First name"
                  :class="fieldClass"
                />
              </div>
              <div>
                <label
                  for="last-name"
                  class="mb-1.5 block text-body-2 font-medium text-fg-secondary"
                >
                  Last name
                </label>
                <input
                  id="last-name"
                  v-model="form.last_name"
                  type="text"
                  autocomplete="family-name"
                  :maxlength="MAX_NAME_LENGTH"
                  placeholder="Last name"
                  :class="fieldClass"
                />
              </div>
            </div>
            <div>
              <label for="bio" class="mb-1.5 block text-body-2 font-medium text-fg-secondary">
                Bio
              </label>
              <textarea
                id="bio"
                v-model="form.bio"
                rows="3"
                :maxlength="MAX_BIO_LENGTH"
                placeholder="How you play, where you play, who you play with."
                :class="[
                  fieldClass,
                  bioPhoneWarning ? 'border-danger focus:border-danger focus:ring-danger/40' : ''
                ]"
                :aria-invalid="bioPhoneWarning ? 'true' : undefined"
                :aria-describedby="bioPhoneWarning ? 'bio-phone' : undefined"
              />
              <div class="mt-1.5 flex items-start justify-between gap-3">
                <p v-if="bioPhoneWarning" id="bio-phone" class="text-caption text-danger">
                  {{ bioPhoneWarning }}
                </p>
                <p class="ml-auto shrink-0 text-caption tabular-nums text-fg-muted">
                  {{ form.bio.length }}/{{ MAX_BIO_LENGTH }}
                </p>
              </div>
            </div>
          </div>
        </section>

        <!-- Social links. Four fields, all optional, each tidying itself on
             blur so a pasted URL and a typed @handle end up as the same thing.
             The mark sits inside the field as the prefix, so a row reads as
             the network it is, not as four identical boxes. -->
        <section class="rounded-card bg-surface p-5 shadow-card">
          <h2 class="font-display text-heading-3 text-fg">Social links</h2>
          <p class="mt-1 text-caption text-fg-muted">
            Optional. Shown on your profile so people can find you where you already are — paste the
            link or type the username.
          </p>
          <div class="mt-4 grid gap-4 sm:grid-cols-2">
            <div v-for="network in SOCIAL_NETWORKS" :key="network">
              <label
                :for="`social-${network}`"
                class="mb-1.5 block text-body-2 font-medium text-fg-secondary"
              >
                {{ SOCIAL_META[network].label }}
              </label>
              <div class="relative">
                <span
                  class="pointer-events-none absolute inset-y-0 left-0 flex items-center gap-1.5 pl-3 text-fg-muted"
                  aria-hidden="true"
                >
                  <UiSocialIcon :network="network" size="h-4 w-4" />
                  <span class="text-body-2">{{ SOCIAL_META[network].prefix }}</span>
                </span>
                <input
                  :id="`social-${network}`"
                  v-model="form[SOCIAL_COLUMNS[network]]"
                  type="text"
                  autocomplete="off"
                  autocapitalize="none"
                  spellcheck="false"
                  :placeholder="'username'"
                  :class="[
                    fieldClass,
                    network === 'facebook' ? 'pl-[7.25rem]' : 'pl-11',
                    socialErrors[network]
                      ? 'border-danger focus:border-danger focus:ring-danger/40'
                      : ''
                  ]"
                  :aria-invalid="socialErrors[network] ? 'true' : undefined"
                  :aria-describedby="socialErrors[network] ? `social-${network}-error` : undefined"
                  @blur="tidySocial(network)"
                />
              </div>
              <p
                v-if="socialErrors[network]"
                :id="`social-${network}-error`"
                class="mt-1.5 text-caption text-danger"
              >
                {{ socialErrors[network] }}
              </p>
            </div>
          </div>
        </section>

        <!-- Location -->
        <section class="rounded-card bg-surface p-5 shadow-card">
          <h2 class="font-display text-heading-3 text-fg">Location</h2>
          <p class="mt-1 text-caption text-fg-muted">
            Used to put nearby open play and nearby players in front of you.
          </p>
          <div class="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label for="province" class="mb-1.5 block text-body-2 font-medium text-fg-secondary">
                Province
              </label>
              <select
                id="province"
                :value="selectedProvince"
                :disabled="loadingProvinces"
                :class="[fieldClass, 'disabled:opacity-50']"
                @change="onProvinceChange(($event.target as HTMLSelectElement).value)"
              >
                <option value="">{{ loadingProvinces ? 'Loading…' : 'Select province' }}</option>
                <option v-for="p in provinces" :key="p.code" :value="p.code">{{ p.name }}</option>
              </select>
            </div>
            <div>
              <label for="city" class="mb-1.5 block text-body-2 font-medium text-fg-secondary">
                City / municipality
              </label>
              <select
                id="city"
                :value="selectedCity"
                :disabled="!selectedProvince || loadingCities"
                :class="[fieldClass, 'disabled:opacity-50']"
                @change="onCityChange(($event.target as HTMLSelectElement).value)"
              >
                <option value="">
                  {{
                    loadingCities
                      ? 'Loading…'
                      : selectedProvince
                        ? 'Select city'
                        : 'Select province first'
                  }}
                </option>
                <option v-for="c in cities" :key="c.code" :value="c.code">{{ c.name }}</option>
              </select>
            </div>
            <div>
              <label for="barangay" class="mb-1.5 block text-body-2 font-medium text-fg-secondary">
                Barangay
              </label>
              <select
                id="barangay"
                :value="selectedBarangay"
                :disabled="!selectedCity || loadingBarangays"
                :class="[fieldClass, 'disabled:opacity-50']"
                @change="onBarangayChange(($event.target as HTMLSelectElement).value)"
              >
                <option value="">
                  {{
                    loadingBarangays
                      ? 'Loading…'
                      : selectedCity
                        ? 'Select barangay'
                        : 'Select city first'
                  }}
                </option>
                <option v-for="b in barangays" :key="b.code" :value="b.code">{{ b.name }}</option>
              </select>
            </div>
          </div>
        </section>

        <!-- Play style -->
        <section class="rounded-card bg-surface p-5 shadow-card">
          <h2 class="font-display text-heading-3 text-fg">Play style</h2>
          <div class="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label
                for="dominant-hand"
                class="mb-1.5 block text-body-2 font-medium text-fg-secondary"
              >
                Dominant hand
              </label>
              <select id="dominant-hand" v-model="form.dominant_hand" :class="fieldClass">
                <option value="">Select hand</option>
                <option value="right">Right</option>
                <option value="left">Left</option>
                <option value="ambidextrous">Ambidextrous</option>
              </select>
            </div>
            <div>
              <label
                for="preferred-position"
                class="mb-1.5 block text-body-2 font-medium text-fg-secondary"
              >
                Preferred position
              </label>
              <select id="preferred-position" v-model="form.preferred_position" :class="fieldClass">
                <option value="">Select position</option>
                <option value="forehand">Forehand</option>
                <option value="backhand">Backhand</option>
                <option value="either">Either</option>
              </select>
            </div>
          </div>
        </section>

        <!-- Privacy -->
        <section class="rounded-card bg-surface p-5 shadow-card">
          <h2 class="font-display text-heading-3 text-fg">Privacy</h2>
          <div class="mt-4 space-y-3" role="radiogroup" aria-label="Profile visibility">
            <label
              v-for="option in VISIBILITY_OPTIONS"
              :key="option.value"
              class="flex cursor-pointer items-start gap-3 rounded-button border p-4 transition-colors"
              :class="
                form.profile_visibility === option.value
                  ? 'border-primary bg-primary-soft'
                  : 'border-border-strong hover:bg-surface-2'
              "
            >
              <input
                v-model="form.profile_visibility"
                type="radio"
                :value="option.value"
                class="mt-0.5 h-4 w-4 shrink-0 border-border-strong text-primary focus:ring-primary"
              />
              <span class="min-w-0">
                <span class="block text-body-2 font-medium text-fg">{{ option.title }}</span>
                <span class="mt-0.5 block text-caption text-fg-muted">{{ option.hint }}</span>
              </span>
            </label>
          </div>

          <!-- Separate from the public/private choice above, because it answers
               a different question. A public profile still says nothing about
               who you have played until you decide it should. -->
          <div
            class="mt-4 flex items-start justify-between gap-4 border-t border-border pt-4"
            :class="form.profile_visibility === 'private' ? 'opacity-50' : ''"
          >
            <div class="min-w-0">
              <p id="match-history-label" class="text-body-2 font-medium text-fg">
                Show my match history
              </p>
              <p class="mt-0.5 text-caption text-fg-muted">
                On by default. Turn it off to hide your results from your profile — you will appear
                as “Private player” in other people’s histories, and anyone who has turned theirs
                off appears that way in yours.
              </p>
              <p
                v-if="form.profile_visibility === 'private'"
                class="mt-1 text-caption text-fg-muted"
              >
                A private profile publishes nothing either way.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              :aria-checked="form.show_match_history"
              aria-labelledby="match-history-label"
              :disabled="form.profile_visibility === 'private'"
              class="relative inline-flex h-8 w-14 shrink-0 items-center rounded-pill border border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-50"
              :class="form.show_match_history ? 'bg-primary' : 'bg-switch-track'"
              @click="form.show_match_history = !form.show_match_history"
            >
              <span
                class="pointer-events-none absolute h-6 w-6 rounded-pill bg-switch-thumb shadow-card transition-transform"
                :class="form.show_match_history ? 'translate-x-7' : 'translate-x-1'"
              />
            </button>
          </div>
        </section>

        <!-- Live regions, so a save that succeeds or fails is announced rather
             than only drawn. -->
        <p
          v-if="savedMessage"
          role="status"
          class="rounded-button bg-primary-soft px-4 py-3 text-body-2 text-primary"
        >
          {{ savedMessage }}
        </p>
        <p
          v-if="errorMessage"
          role="alert"
          class="rounded-button bg-danger-soft px-4 py-3 text-body-2 text-danger"
        >
          {{ errorMessage }}
        </p>

        <!-- Actions. Reversed on mobile so the primary sits nearest the thumb. -->
        <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <UiButton to="/dashboard" variant="secondary" size="lg" class="justify-center">
            Cancel
          </UiButton>
          <UiButton
            type="submit"
            size="lg"
            class="justify-center"
            :loading="saving"
            :disabled="saving || !dirty || !form.display_name.trim() || hasFieldProblem"
          >
            {{ saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved' }}
          </UiButton>
        </div>
      </form>
    </div>

    <UiModal
      v-model="confirmRemovePhoto"
      title="Remove your photo?"
      description="Your profile goes back to showing your initials. You can upload another one at any time."
      confirm-label="Remove photo"
      destructive
      @confirm="removePhoto"
    />
  </div>
</template>
