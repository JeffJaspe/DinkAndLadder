<script setup lang="ts">
useHead({ title: 'Privacy Policy' })

const LAST_UPDATED = '2026-09-21'
</script>

<template>
  <div class="page-shell min-h-screen bg-canvas p-4 lg:p-6">
    <div class="mx-auto max-w-3xl">
      <UiPageHeader to="/" back-label="Home" title="Privacy Policy" />
      <p class="mt-1 text-sm text-fg-muted">Last updated {{ LAST_UPDATED }}.</p>

      <article class="prose-legal mt-8 space-y-6 text-body-2 text-fg-secondary">
        <section>
          <h2 class="font-display text-heading-3 text-fg">Introduction</h2>
          <p class="mt-2">
            DinkAndLadder ("we", "our", or "us") operates the DinkAndLadder platform. This Privacy
            Policy explains how we collect, use, disclose, and safeguard your information when you
            use our service.
          </p>
        </section>

        <section>
          <h2 class="font-display text-heading-3 text-fg">Information We Collect</h2>
          <p class="mt-2">We collect information you provide directly to us, including:</p>
          <ul class="mt-2 list-inside list-disc space-y-1">
            <li>Account information (name, email address, password)</li>
            <li>Profile information (skill level, playing preferences, location)</li>
            <li>Match and tournament data (scores, results, ratings)</li>
            <li>Club membership information</li>
            <li>Communications with us</li>
          </ul>
        </section>

        <section>
          <h2 class="font-display text-heading-3 text-fg">How We Use Your Information</h2>
          <p class="mt-2">We use the information we collect to:</p>
          <ul class="mt-2 list-inside list-disc space-y-1">
            <li>Provide, maintain, and improve our services</li>
            <li>Calculate and display player ratings and rankings</li>
            <li>Facilitate event registration and management</li>
            <li>Enable club management features</li>
            <li>Send you notifications about events, matches, and updates</li>
            <li>Respond to your requests and provide customer support</li>
            <li>Protect against fraud and unauthorized activity</li>
          </ul>
        </section>

        <section>
          <h2 class="font-display text-heading-3 text-fg">Information Sharing</h2>
          <p class="mt-2">We may share your information in the following circumstances:</p>
          <ul class="mt-2 list-inside list-disc space-y-1">
            <li>
              <strong>Public profile:</strong> Your name, rating, and match history are visible to
              other users as part of the platform's core functionality.
            </li>
            <li>
              <strong>Club organizers:</strong> When you register for events or join clubs,
              organizers can see your relevant information.
            </li>
            <li>
              <strong>Service providers:</strong> We may share information with third-party vendors
              who help us operate our platform.
            </li>
            <li>
              <strong>Legal requirements:</strong> We may disclose information when required by law
              or to protect our rights.
            </li>
          </ul>
        </section>

        <section>
          <h2 class="font-display text-heading-3 text-fg">Data Security</h2>
          <p class="mt-2">
            We implement appropriate technical and organizational measures to protect your personal
            information. However, no method of transmission over the Internet is 100% secure, and we
            cannot guarantee absolute security.
          </p>
        </section>

        <section>
          <h2 class="font-display text-heading-3 text-fg">Data Retention</h2>
          <p class="mt-2">
            We retain your information for as long as your account is active or as needed to provide
            you services. Match history and ratings are retained to maintain the integrity of the
            ranking system. You may request deletion of your account, subject to our data retention
            obligations.
          </p>
        </section>

        <section>
          <h2 class="font-display text-heading-3 text-fg">Your Rights</h2>
          <p class="mt-2">Depending on your location, you may have the right to:</p>
          <ul class="mt-2 list-inside list-disc space-y-1">
            <li>Access the personal information we hold about you</li>
            <li>Request correction of inaccurate information</li>
            <li>Request deletion of your personal information</li>
            <li>Object to or restrict certain processing</li>
            <li>Data portability</li>
          </ul>
          <p class="mt-2">
            To exercise these rights, please contact us using the information below.
          </p>
        </section>

        <section>
          <h2 class="font-display text-heading-3 text-fg">Children's Privacy</h2>
          <p class="mt-2">
            Our service is not directed to children under 13. We do not knowingly collect personal
            information from children under 13. If you believe we have collected information from a
            child under 13, please contact us.
          </p>
        </section>

        <section>
          <h2 class="font-display text-heading-3 text-fg">Changes to This Policy</h2>
          <p class="mt-2">
            We may update this Privacy Policy from time to time. We will notify you of any changes
            by posting the new Privacy Policy on this page and updating the "Last updated" date.
          </p>
        </section>

        <section>
          <h2 class="font-display text-heading-3 text-fg">Contact Us</h2>
          <p class="mt-2">
            If you have questions about this Privacy Policy, please contact us at
            privacy@dinkandladder.com.
          </p>
        </section>
      </article>
    </div>
  </div>
</template>
