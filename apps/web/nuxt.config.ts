// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  modules: ['@nuxtjs/tailwindcss', '@nuxt/eslint', '@nuxtjs/supabase'],
  typescript: {
    strict: true
  },
  runtimeConfig: {
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    paymongoSecretKey: process.env.PAYMONGO_SECRET_KEY,
    paymongoWebhookSecret: process.env.PAYMONGO_WEBHOOK_SECRET,
    public: {
      stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      paymongoPublicKey: process.env.PAYMONGO_PUBLIC_KEY
    }
  },
  supabase: {
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
      exclude: ['/', '/register', '/players/*', '/clubs/*', '/rankings', '/events/*', '/api/webhooks/*']
    }
  }
})
