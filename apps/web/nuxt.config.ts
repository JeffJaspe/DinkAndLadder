import { resolveTrustProxy } from './server/utils/trust-proxy'
import { resolveSiteUrl } from './server/utils/site-url'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  // tokens.css first: it declares the custom properties everything else reads.
  css: ['~/assets/css/tokens.css', '~/assets/css/fonts.css', '~/assets/css/main.css'],
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      link: [
        {
          // Body text is Inter on every screen, so it is on the critical path.
          // Preloading it removes the swap-in flash on first paint. Poppins is
          // headings-only and small, so it is left to normal discovery.
          rel: 'preload',
          as: 'font',
          type: 'font/woff2',
          href: '/fonts/inter-latin-var.woff2',
          crossorigin: 'anonymous'
        }
      ],
      script: [
        {
          // Pre-hydration theme resolution. SSR already renders the right class
          // for an explicit light/dark cookie, but it cannot know the OS
          // preference of a `system` user — without this the page would paint
          // light and then snap to dark. Small, synchronous, and the only
          // inline script in the app. See docs/33 §3.4.
          key: 'dnl-theme-preflight',
          tagPosition: 'head',
          tagPriority: -1,
          innerHTML:
            '(function(){try{var m=document.cookie.match(/(?:^|;\\s*)dnl-theme=([^;]*)/);' +
            "var p=m?decodeURIComponent(m[1]):'light';" +
            "var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);" +
            "document.documentElement.classList.toggle('dark',d);}catch(e){}})()"
        }
      ]
    }
  },
  modules: ['@nuxtjs/tailwindcss', '@nuxt/eslint', '@nuxtjs/supabase'],
  typescript: {
    strict: true
  },
  runtimeConfig: {
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    paymongoSecretKey: process.env.PAYMONGO_SECRET_KEY,
    paymongoWebhookSecret: process.env.PAYMONGO_WEBHOOK_SECRET,
    turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY,
    // Overridable at runtime with NUXT_TRUST_PROXY_HEADERS.
    trustProxyHeaders: resolveTrustProxy(process.env),
    // Origin for links inside emails, detected per deployment from the
    // platform's own variables. Overridable at runtime with NUXT_SITE_URL.
    siteUrl: resolveSiteUrl(process.env),
    public: {
      stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      paymongoPublicKey: process.env.PAYMONGO_PUBLIC_KEY,
      turnstileSiteKey: process.env.TURNSTILE_SITE_KEY
    }
  },
  supabase: {
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
      exclude: [
        '/',
        '/register',
        '/check-email',
        '/players/*',
        '/clubs/*',
        '/rankings',
        '/clubs',
        // Retired route, kept public because it was public and in the sidebar:
        // it redirects to /clubs?verified=1, and a signed-out visitor following
        // an old bookmark must reach that redirect rather than the login page.
        '/verified-clubs',
        '/events/*',
        // Dev-only token preview; it 404s outside dev, so there is nothing to guard.
        '/dev/*',
        '/api/webhooks/*'
      ]
    }
  }
})
