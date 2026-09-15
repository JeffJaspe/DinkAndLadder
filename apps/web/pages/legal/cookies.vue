<script setup lang="ts">
/**
 * The cookies page. Its table is rendered from `CONSENT_CATEGORIES`, the
 * same list the banner gates on, so this page cannot list a cookie the
 * banner does not know about or vice versa (docs/38 §6).
 *
 * "Change your choice" lives here because the banner never comes back on its
 * own once answered — this page and Settings are the only two ways to revisit
 * it, and the page is the one a signed-out visitor can reach.
 */

import { CONSENT_CATEGORIES } from '~/utils/cookie-consent'

useHead({ title: 'Cookies' })

const { choice, hasChosen, accept, reset } = useConsent()

const choiceLabel = computed(() =>
  choice.value === 'all' ? 'Accept all' : choice.value === 'essential' ? 'Essential only' : null
)

const LAST_UPDATED = '2026-09-12'
</script>

<template>
  <div class="page-shell min-h-screen bg-canvas p-4 lg:p-6">
    <div class="mx-auto max-w-3xl">
      <UiPageHeader to="/" back-label="Home" title="Cookies" />
      <p class="mt-1 text-sm text-fg-muted">
        What DinkAndLadder stores in your browser, and why. Last updated {{ LAST_UPDATED }}.
      </p>

      <!-- Your choice -->
      <section
        aria-labelledby="cookie-choice-title"
        class="mt-6 rounded-card border border-border bg-surface p-4 sm:p-5"
      >
        <h2 id="cookie-choice-title" class="font-display text-heading-3 text-fg">Your choice</h2>
        <p v-if="hasChosen" class="mt-1 text-body-2 text-fg-secondary" data-testid="cookie-choice">
          You chose <strong class="font-semibold text-fg">{{ choiceLabel }}</strong
          >.
        </p>
        <p v-else class="mt-1 text-body-2 text-fg-secondary" data-testid="cookie-choice">
          You have not chosen yet. Until you do, only essential cookies are set.
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          <UiButton
            :variant="choice === 'essential' ? 'primary' : 'secondary'"
            size="sm"
            @click="accept('essential')"
            >Essential only</UiButton
          >
          <UiButton
            :variant="choice === 'all' ? 'primary' : 'secondary'"
            size="sm"
            @click="accept('all')"
            >Accept all</UiButton
          >
          <UiButton v-if="hasChosen" variant="ghost" size="sm" @click="reset"
            >Ask me again</UiButton
          >
        </div>
      </section>

      <!-- Plain-language summary -->
      <section class="mt-8 space-y-3 text-body-2 text-fg-secondary">
        <p>
          A cookie is a small piece of text a website asks your browser to keep. We use them for one
          thing today: making the site work for you between page loads — staying signed in,
          remembering whether you are acting as a player or a club, and your light or dark
          preference.
        </p>
        <p>
          We do not run advertising, and no cookie on this site is shared with an advertising
          network. The Analytics category below is empty; it is listed so that if we ever add usage
          measurement, it only runs for people who have said yes.
        </p>
      </section>

      <!-- Categories -->
      <section
        v-for="category in CONSENT_CATEGORIES"
        :key="category.key"
        :aria-labelledby="`cookie-cat-${category.key}`"
        class="mt-8"
      >
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 :id="`cookie-cat-${category.key}`" class="font-display text-heading-3 text-fg">
            {{ category.title }}
          </h2>
          <span
            v-if="category.locked"
            class="rounded-pill bg-fg-muted/20 px-2 py-0.5 text-caption font-medium text-fg-muted"
            >Always on</span
          >
          <span
            v-else-if="choice === 'all'"
            class="rounded-pill bg-success-soft px-2 py-0.5 text-caption font-medium text-success"
            >On</span
          >
          <span
            v-else
            class="rounded-pill bg-fg-muted/20 px-2 py-0.5 text-caption font-medium text-fg-muted"
            >Off</span
          >
        </div>
        <p class="mt-1 text-body-2 text-fg-secondary">{{ category.description }}</p>

        <div v-if="category.cookies.length" class="scroll-x mt-3">
          <table class="w-full text-left text-body-2">
            <thead>
              <tr
                class="border-b border-border text-caption font-semibold uppercase tracking-wider text-fg-muted"
              >
                <th scope="col" class="py-2 pr-4">Name</th>
                <th scope="col" class="py-2 pr-4">Purpose</th>
                <th scope="col" class="py-2 pr-4">Lifetime</th>
                <th scope="col" class="py-2">Set by</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="cookie in category.cookies"
                :key="cookie.name"
                class="border-b border-border last:border-0"
              >
                <td class="py-2 pr-4 font-mono text-caption text-fg">{{ cookie.name }}</td>
                <td class="py-2 pr-4 text-fg-secondary">{{ cookie.purpose }}</td>
                <td class="py-2 pr-4 text-fg-secondary">{{ cookie.lifetime }}</td>
                <td class="py-2 text-fg-secondary">{{ cookie.setBy }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="mt-3 text-caption text-fg-muted">No cookies in this category today.</p>
      </section>

      <!-- Browser controls -->
      <section aria-labelledby="cookie-browser-title" class="mt-8">
        <h2 id="cookie-browser-title" class="font-display text-heading-3 text-fg">
          Controlling cookies in your browser
        </h2>
        <p class="mt-1 text-body-2 text-fg-secondary">
          You can delete or block cookies in your browser settings. If you block the essential ones,
          you will be signed out and the site will forget your preferences on every visit.
        </p>
      </section>
    </div>
  </div>
</template>
