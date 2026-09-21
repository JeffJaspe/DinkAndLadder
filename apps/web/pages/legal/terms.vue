<script setup lang="ts">
useHead({ title: 'Terms of Service' })

const LAST_UPDATED = '2026-09-21'
</script>

<template>
  <div class="page-shell min-h-screen bg-canvas p-4 lg:p-6">
    <div class="mx-auto max-w-3xl">
      <UiPageHeader to="/" back-label="Home" title="Terms of Service" />
      <p class="mt-1 text-sm text-fg-muted">Last updated {{ LAST_UPDATED }}.</p>

      <article class="prose-legal mt-8 space-y-6 text-body-2 text-fg-secondary">
        <section>
          <h2 class="font-display text-heading-3 text-fg">Agreement to Terms</h2>
          <p class="mt-2">
            By accessing or using DinkAndLadder ("the Service"), you agree to be bound by these
            Terms of Service. If you do not agree to these terms, do not use the Service.
          </p>
        </section>

        <section>
          <h2 class="font-display text-heading-3 text-fg">Use of the Service</h2>
          <p class="mt-2">
            DinkAndLadder provides a platform for pickleball players and clubs to organize events,
            track match results, and maintain player ratings. You may use the Service only for
            lawful purposes and in accordance with these Terms.
          </p>
          <p class="mt-2">You agree not to:</p>
          <ul class="mt-2 list-inside list-disc space-y-1">
            <li>Use the Service in any way that violates applicable laws</li>
            <li>Submit false or misleading information, including match results</li>
            <li>Impersonate another person or entity</li>
            <li>Attempt to gain unauthorized access to any portion of the Service</li>
            <li>Interfere with or disrupt the Service or servers</li>
            <li>Use automated means to access the Service without our permission</li>
          </ul>
        </section>

        <section>
          <h2 class="font-display text-heading-3 text-fg">Account Registration</h2>
          <p class="mt-2">
            To use certain features of the Service, you must register for an account. You agree to
            provide accurate information and keep it updated. You are responsible for maintaining
            the confidentiality of your account credentials and for all activities under your
            account.
          </p>
        </section>

        <section>
          <h2 class="font-display text-heading-3 text-fg">Ratings and Rankings</h2>
          <p class="mt-2">
            Player ratings and rankings are calculated based on recorded match results. Only matches
            recorded by authorized club organizers affect ratings. We strive to maintain accurate
            ratings but make no guarantees about their precision or suitability for any particular
            purpose.
          </p>
        </section>

        <section>
          <h2 class="font-display text-heading-3 text-fg">Club Organizers</h2>
          <p class="mt-2">
            Club organizers are responsible for accurately recording match results and managing
            their club's events. Organizers must ensure they have appropriate authority to create
            and manage club activities on the platform.
          </p>
        </section>

        <section>
          <h2 class="font-display text-heading-3 text-fg">Intellectual Property</h2>
          <p class="mt-2">
            The Service and its original content, features, and functionality are owned by
            DinkAndLadder and are protected by intellectual property laws. You may not copy, modify,
            distribute, or create derivative works based on our Service without our express written
            permission.
          </p>
        </section>

        <section>
          <h2 class="font-display text-heading-3 text-fg">User Content</h2>
          <p class="mt-2">
            You retain ownership of content you submit to the Service. By submitting content, you
            grant us a non-exclusive, worldwide, royalty-free license to use, display, and
            distribute that content in connection with the Service.
          </p>
        </section>

        <section>
          <h2 class="font-display text-heading-3 text-fg">Termination</h2>
          <p class="mt-2">
            We may terminate or suspend your account at any time for any reason, including violation
            of these Terms. Upon termination, your right to use the Service ceases immediately.
            Match history and rating data may be retained to maintain system integrity.
          </p>
        </section>

        <section>
          <h2 class="font-display text-heading-3 text-fg">Disclaimer of Warranties</h2>
          <p class="mt-2">
            THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. WE DISCLAIM ALL
            WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR
            PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED
            OR ERROR-FREE.
          </p>
        </section>

        <section>
          <h2 class="font-display text-heading-3 text-fg">Limitation of Liability</h2>
          <p class="mt-2">
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, DINKANDLADDER SHALL NOT BE LIABLE FOR ANY
            INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE
            OF THE SERVICE.
          </p>
        </section>

        <section>
          <h2 class="font-display text-heading-3 text-fg">Changes to Terms</h2>
          <p class="mt-2">
            We may modify these Terms at any time. We will notify you of material changes by posting
            the updated Terms on this page. Your continued use of the Service after changes
            constitutes acceptance of the modified Terms.
          </p>
        </section>

        <section>
          <h2 class="font-display text-heading-3 text-fg">Governing Law</h2>
          <p class="mt-2">
            These Terms shall be governed by the laws of the Philippines, without regard to conflict
            of law principles.
          </p>
        </section>

        <section>
          <h2 class="font-display text-heading-3 text-fg">Contact Us</h2>
          <p class="mt-2">
            If you have questions about these Terms, please contact us at legal@dinkandladder.com.
          </p>
        </section>
      </article>
    </div>
  </div>
</template>
