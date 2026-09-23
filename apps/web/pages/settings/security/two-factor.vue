<script setup lang="ts">
useHead({ title: 'Set up two-factor authentication' })

const supabase = useSupabaseClient()
const route = useRoute()
const { appName } = useBranding()

/**
 * Three steps, and the middle one talks to Supabase from the browser on
 * purpose. Verifying the code is what raises the session to aal2, and the
 * session lives in this browser's cookies - a server-side verify would leave
 * this tab holding an aal1 token and bounce it straight to the challenge
 * screen it just passed. The server only hands out the secret (step 1) and,
 * once Supabase says the factor is verified, mints the recovery codes (step 3).
 */
type Step = 'scan' | 'codes' | 'done'
const step = ref<Step>('scan')

const requiredBanner = route.query.required === '1'
const resetBanner = route.query.reset === '1'

interface Enrollment {
  factor_id: string
  qr_code: string
  secret: string
  uri: string
}
const enrollment = ref<Enrollment | null>(null)
const starting = ref(true)
const startError = ref('')

const code = ref('')
// The scan and confirm steps share one screen; codes and done both sit at the last dot.
const stepIndex = computed(() => (step.value === 'scan' ? (code.value ? 1 : 0) : 2))
const verifying = ref(false)
const verifyError = ref('')

const recoveryCodes = ref<string[]>([])
const saved = ref(false)
const copied = ref(false)

async function start() {
  starting.value = true
  startError.value = ''
  try {
    const response = await $fetch<{ data: Enrollment }>('/api/v1/mfa/enroll', { method: 'POST' })
    enrollment.value = response.data
  } catch (err) {
    const fetchError = err as { data?: { message?: string } }
    startError.value = fetchError.data?.message ?? 'Could not start two-factor setup.'
  } finally {
    starting.value = false
  }
}

async function verify() {
  if (!enrollment.value || verifying.value) return
  verifyError.value = ''
  const trimmed = code.value.replace(/\s/g, '')
  if (!/^\d{6}$/.test(trimmed)) {
    verifyError.value = 'Enter the 6-digit code from your app.'
    return
  }
  verifying.value = true
  try {
    const factorId = enrollment.value.factor_id
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId
    })
    if (challengeError || !challenge) throw challengeError ?? new Error('challenge')
    const { error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: trimmed
    })
    if (error) {
      verifyError.value = 'That code is not right. Codes change every 30 seconds — try the current one.'
      return
    }
    const response = await $fetch<{ data: { recovery_codes: string[] } }>(
      '/api/v1/mfa/enroll/confirm',
      { method: 'POST' }
    )
    recoveryCodes.value = response.data.recovery_codes
    step.value = 'codes'
  } catch (err) {
    const fetchError = err as { data?: { message?: string }; message?: string }
    verifyError.value =
      fetchError.data?.message ?? 'Could not verify the code. Please try again.'
  } finally {
    verifying.value = false
  }
}

const codesText = computed(
  () =>
    `${appName.value} two-factor recovery codes\nEach works once. Keep them somewhere safe.\n\n${recoveryCodes.value.join('\n')}\n`
)

async function copyCodes() {
  try {
    await navigator.clipboard.writeText(codesText.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    // Clipboard blocked - the codes are on screen to copy by hand.
  }
}

function downloadCodes() {
  const blob = new Blob([codesText.value], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'recovery-codes.txt'
  a.click()
  URL.revokeObjectURL(url)
}

onMounted(start)
</script>

<template>
  <div class="page-shell px-4 py-6 lg:px-6">
    <div class="mx-auto max-w-2xl">
      <UiPageHeader to="/settings/security" />

      <h1 class="mb-2 font-display text-heading-1 text-fg">Two-factor authentication</h1>
      <p class="mb-6 text-body-2 text-fg-muted">
        A 6-digit code from an app on your phone, on top of your password. No SMS, nothing sent
        to anyone.
      </p>

      <div
        v-if="requiredBanner && step === 'scan'"
        role="status"
        class="mb-6 rounded-button bg-warning-soft px-4 py-3 text-body-2 text-warning"
      >
        Your account administers the platform, so two-factor authentication is required before
        you can use the admin console.
      </div>
      <div
        v-if="resetBanner && step === 'scan'"
        role="status"
        class="mb-6 rounded-button bg-primary-soft px-4 py-3 text-body-2 text-primary"
      >
        Two-factor authentication was reset with a recovery code. Set it up again now so your
        account is protected.
      </div>

      <ol class="mb-6 flex items-center gap-2 text-caption font-semibold uppercase tracking-widest" aria-label="Setup progress">
        <li
          v-for="(label, i) in ['Scan', 'Confirm', 'Save codes']"
          :key="label"
          class="flex items-center gap-2"
          :class="i <= stepIndex ? 'text-primary' : 'text-fg-muted'"
          :aria-current="i === stepIndex ? 'step' : undefined"
        >
          <span
            class="flex h-6 w-6 items-center justify-center rounded-full border text-[11px]"
            :class="i <= stepIndex ? 'border-primary bg-primary text-on-primary' : 'border-border-strong'"
            >{{ i + 1 }}</span
          >
          <span class="hidden sm:inline">{{ label }}</span>
          <span v-if="i < 2" class="mx-1 h-px w-6 bg-border" aria-hidden="true" />
        </li>
      </ol>

      <!-- Step 1 + 2: scan, then confirm with a code -->
      <section v-if="step === 'scan'" class="rounded-card border border-border bg-surface p-4 shadow-card sm:p-6">
        <div v-if="starting" class="flex items-center gap-3 text-body-2 text-fg-muted">
          <span
            class="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent"
          />
          Preparing your setup…
        </div>

        <div v-else-if="startError">
          <p role="alert" class="text-body-2 text-danger">{{ startError }}</p>
          <button type="button" class="mt-3 text-body-2 font-medium text-primary" @click="start">
            Try again
          </button>
        </div>

        <template v-else-if="enrollment">
          <!-- Quick-start instructions visible by default -->
          <div class="mb-6 rounded-button border border-primary/30 bg-primary-soft p-4">
            <p class="font-medium text-fg">Before you start:</p>
            <ol class="mt-2 list-decimal space-y-1 pl-5 text-body-2 text-fg-secondary">
              <li>
                <span class="font-medium text-fg">Download an authenticator app</span> on your phone
                (Google Authenticator, Microsoft Authenticator, or Authy)
              </li>
              <li>
                <span class="font-medium text-fg">Open the app</span> and tap the
                <span class="font-medium text-fg">+</span> button to add an account
              </li>
              <li>
                <span class="font-medium text-fg">Scan the QR code below</span> with your phone's
                camera
              </li>
            </ol>
          </div>

          <!-- Detailed walkthrough for first-time users -->
          <details class="group mb-6 rounded-button border border-border bg-surface-2">
            <summary
              class="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-body-2 font-medium text-fg [&::-webkit-details-marker]:hidden"
            >
              <span class="flex items-center gap-2">
                <UiIcon name="info" class="text-primary" />
                Need more help? Read the full guide
              </span>
              <span class="text-fg-muted" aria-hidden="true">
                <UiIcon name="minus" class="hidden group-open:block" />
                <UiIcon name="plus" class="group-open:hidden" />
              </span>
            </summary>
            <div class="space-y-4 border-t border-border px-4 py-4 text-body-2 text-fg-secondary">
              <p>
                An authenticator app is a free app on your phone that shows a 6-digit number
                which changes every 30 seconds. Once it is set up, signing in asks for the
                current number as well as your password — so someone who knows your password
                still can't get in without your phone. Nothing is texted or emailed to you, and
                it works without signal.
              </p>

              <ol class="list-decimal space-y-3 pl-5">
                <li>
                  <span class="font-medium text-fg">Install one of these on your phone</span>
                  (any of them works — pick whichever you like):
                  <ul class="mt-1.5 list-disc space-y-1 pl-5">
                    <li>
                      <span class="font-medium text-fg">Google Authenticator</span> — search for
                      it in the App Store (iPhone) or Play Store (Android).
                    </li>
                    <li>
                      <span class="font-medium text-fg">Microsoft Authenticator</span> — same
                      stores. If you already use it for work, it can hold this account too.
                    </li>
                    <li>
                      <span class="font-medium text-fg">Authy</span>,
                      <span class="font-medium text-fg">1Password</span> or
                      <span class="font-medium text-fg">Bitwarden</span> — also fine if you
                      already have one.
                    </li>
                  </ul>
                </li>
                <li>
                  <span class="font-medium text-fg">Open the app and add an account.</span>
                  Look for a <span class="font-medium text-fg">+</span> button, then choose
                  <span class="font-medium text-fg">Scan a QR code</span>.
                </li>
                <li>
                  <span class="font-medium text-fg">Point your phone's camera at the square code below.</span>
                  A new entry named after this site appears in the app, showing a 6-digit
                  number. Can't scan? Choose
                  <span class="font-medium text-fg">Enter a setup key</span> in the app instead
                  and type the key shown next to the code.
                </li>
                <li>
                  <span class="font-medium text-fg">Type the 6-digit number into the box below</span>
                  and press <span class="font-medium text-fg">Turn on</span>. The number changes
                  every 30 seconds — if it's about to change, wait for the next one.
                </li>
                <li>
                  <span class="font-medium text-fg">Save the recovery codes</span> you're shown on
                  the next screen. They are your way back in if you lose your phone. Each works
                  once, and you won't be shown them again.
                </li>
              </ol>

              <p class="rounded-button bg-surface px-3 py-2 text-caption text-fg-muted">
                Getting a new phone later? Move your accounts in the authenticator app first
                (both Google and Microsoft can transfer them), or use a recovery code here and
                set up again on the new phone.
              </p>
            </div>
          </details>

          <h2 class="font-display text-heading-3 text-fg">1. Scan this with your authenticator app</h2>
          <p class="mt-1 text-body-2 text-fg-secondary">
            Google Authenticator, Microsoft Authenticator, Authy or 1Password all work.
          </p>

          <div class="mt-4 flex flex-col items-start gap-4 sm:flex-row">
            <img
              :src="enrollment.qr_code"
              alt="QR code for your authenticator app"
              width="176"
              height="176"
              class="h-44 w-44 shrink-0 rounded-button border border-border bg-white p-2"
            />
            <div class="min-w-0 flex-1">
              <p class="text-body-2 text-fg-secondary">Can't scan? Enter this key by hand:</p>
              <code
                class="mt-2 block break-all rounded-button bg-surface-2 px-3 py-2 font-mono text-body-2 text-fg"
                >{{ enrollment.secret }}</code
              >
            </div>
          </div>

          <h2 class="mt-8 font-display text-heading-3 text-fg">2. Enter the code the app shows</h2>
          <form class="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start" @submit.prevent="verify">
            <div class="flex-1">
              <label for="totp-code" class="sr-only">6-digit code</label>
              <input
                id="totp-code"
                v-model="code"
                type="text"
                inputmode="numeric"
                autocomplete="one-time-code"
                maxlength="7"
                placeholder="123 456"
                class="w-full rounded-button border border-border-strong bg-canvas px-4 py-2.5 font-mono text-lg tracking-[0.3em] text-fg placeholder-fg-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <p v-if="verifyError" role="alert" class="mt-2 text-body-2 text-danger">
                {{ verifyError }}
              </p>
            </div>
            <button
              type="submit"
              :disabled="verifying"
              class="rounded-button bg-primary px-6 py-3 font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {{ verifying ? 'Checking…' : 'Turn on' }}
            </button>
          </form>
        </template>
      </section>

      <!-- Step 3: recovery codes, shown once -->
      <section v-else-if="step === 'codes'" class="rounded-card border border-border bg-surface p-4 shadow-card sm:p-6">
        <div
          role="status"
          class="mb-4 rounded-button bg-primary-soft px-4 py-3 text-body-2 text-primary"
        >
          Two-factor authentication is on.
        </div>

        <h2 class="font-display text-heading-3 text-fg">3. Save your recovery codes</h2>
        <p class="mt-1 text-body-2 text-fg-secondary">
          If you lose your phone, one of these plus your password gets you back in. Each works
          once. <strong class="font-semibold text-fg">This is the only time they are shown.</strong>
        </p>

        <ul
          class="mt-4 grid grid-cols-2 gap-2 rounded-button bg-surface-2 p-4 font-mono text-body-1 text-fg"
          data-testid="recovery-codes"
        >
          <li v-for="c in recoveryCodes" :key="c">{{ c }}</li>
        </ul>

        <div class="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-button border border-border-strong px-4 py-2.5 font-medium text-fg transition-colors hover:bg-surface-2"
            @click="copyCodes"
          >
            {{ copied ? 'Copied' : 'Copy' }}
          </button>
          <button
            type="button"
            class="rounded-button border border-border-strong px-4 py-2.5 font-medium text-fg transition-colors hover:bg-surface-2"
            @click="downloadCodes"
          >
            Download .txt
          </button>
        </div>

        <label class="mt-6 flex items-start gap-3 text-body-2 text-fg">
          <input v-model="saved" type="checkbox" class="mt-0.5 h-4 w-4 rounded border-border-strong" />
          I have saved these codes somewhere safe.
        </label>

        <button
          type="button"
          :disabled="!saved"
          class="mt-4 w-full rounded-button bg-primary py-3 font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50 sm:w-auto sm:px-6"
          @click="step = 'done'"
        >
          Done
        </button>
      </section>

      <section v-else class="rounded-card border border-border bg-surface p-6 text-center shadow-card">
        <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
          <UiIcon name="check" />
        </div>
        <h2 class="font-display text-heading-3 text-fg">You're protected</h2>
        <p class="mt-1 text-body-2 text-fg-secondary">
          From now on, signing in asks for a code from your app after your password.
        </p>
        <NuxtLink
          :to="requiredBanner ? '/admin/reports' : '/settings/security'"
          class="mt-4 inline-flex items-center rounded-button bg-primary px-6 py-3 font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          {{ requiredBanner ? 'Go to admin console' : 'Back to sign-in methods' }}
        </NuxtLink>
      </section>
    </div>
  </div>
</template>
