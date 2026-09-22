import { resolveTrustProxy } from './server/utils/trust-proxy'
import { resolveSiteUrl } from './server/utils/site-url'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  // tokens.css first: it declares the custom properties everything else reads.
  css: ['~/assets/css/tokens.css', '~/assets/css/fonts.css', '~/assets/css/main.css'],
  app: {
    // Deliberately short and opacity-only: anything longer, or anything that
    // moves the page, reads as lag rather than polish on a slow connection.
    // prefers-reduced-motion is honoured in assets/css/main.css.
    pageTransition: { name: 'page', mode: 'out-in' },
    head: {
      htmlAttrs: { lang: 'en' },
      link: [
        {
          // Body text is Inter on every screen, so it is on the critical path.
          // Preloading it removes the swap-in flash on first paint. Lexend is
          // headings-only and small, so it is left to normal discovery.
          rel: 'preload',
          as: 'font',
          type: 'font/woff2',
          href: '/fonts/inter-latin-var.woff2',
          crossorigin: 'anonymous'
        },
        // Brand icons (public/icons, from assets/dal-assets). The .ico is kept
        // first and sized for the browsers that only read that one; the SVG is
        // what modern browsers pick.
        { rel: 'icon', href: '/icons/favicon.ico', sizes: '48x48' },
        { rel: 'icon', href: '/icons/favicon.svg', type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' },
        { rel: 'manifest', href: '/manifest.webmanifest' }
      ],
      meta: [
        // Charcoal from the brand palette — the colour the app icons and the
        // social image are drawn on.
        { name: 'theme-color', content: '#408175' },
        // Absolute: a scraper fetching a link preview has no page origin to
        // resolve a relative path against. Same resolver the email links use.
        { property: 'og:image', content: `${resolveSiteUrl(process.env)}/social/og-image.png` },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { name: 'twitter:card', content: 'summary_large_image' }
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
  modules: ['@nuxtjs/tailwindcss', '@nuxt/eslint', '@nuxtjs/supabase', '@vite-pwa/nuxt'],
  pwa: {
    registerType: 'autoUpdate',
    includeAssets: ['icons/favicon.ico', 'icons/favicon.svg', 'icons/apple-touch-icon.png'],
    manifest: {
      name: 'DinkAndLadder',
      short_name: 'DAL',
      description: 'Philippine Pickleball Platform',
      start_url: '/',
      display: 'standalone',
      theme_color: '#408175',
      background_color: '#0b0909',
      icons: [
        {
          src: '/icons/icon-192.png',
          sizes: '192x192',
          type: 'image/png'
        },
        {
          src: '/icons/icon-512.png',
          sizes: '512x512',
          type: 'image/png'
        },
        {
          src: '/icons/icon-maskable-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable'
        }
      ]
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
      navigateFallback: null,
      navigateFallbackDenylist: [
        /^\/confirm/,
        /^\/auth-error/,
        /^\/update-password/,
        /^\/reset-password/,
        /^\/check-email/,
        /^\/onboarding/,
        /^\/create-club/,
        /^\/mfa\//,
        /^\/api\//
      ],
      runtimeCaching: [
        {
          urlPattern: /^https:\/\/.*\.supabase\.co\/auth\/.*/i,
          handler: 'NetworkOnly'
        },
        {
          urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
          handler: 'NetworkFirst',
          options: {
            cacheName: 'supabase-cache',
            expiration: {
              maxEntries: 50,
              maxAgeSeconds: 60 * 60 * 24
            }
          }
        }
      ]
    },
    devOptions: {
      enabled: false,
      type: 'module'
    }
  },
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
        // Both are for people who cannot sign in — guarding them redirects the
        // only visitors who need them straight back to /login. /update-password
        // is where the recovery email lands, before any normal session exists.
        '/reset-password',
        '/update-password',
        // Where a failed email link is trapped — by definition nobody
        // reaching it has a session.
        '/auth-error',
        // Two-factor recovery has no session at all (the whole point), and
        // the challenge page has one the module accepts - listed so a future
        // tightening of the module's guard cannot lock the second half of
        // sign-in behind the first.
        '/mfa/recover',
        '/mfa/verify',
        '/players/*',
        '/clubs/*',
        '/rankings',
        '/clubs',
        // The index pages, not just their detail routes. `/clubs` and
        // `/rankings` were listed but `/events` and `/players` were not, so a
        // signed-out visitor could open one event and one player profile yet
        // got bounced to /login the moment they asked to see the list — and the
        // landing page's own "Find play near you" button points at /events.
        // Browsing is free; the login prompt belongs at the point of joining,
        // registering or submitting, not at the point of looking.
        '/events',
        '/players',
        // Retired route, kept public because it was public and in the sidebar:
        // it redirects to /clubs?verified=1, and a signed-out visitor following
        // an old bookmark must reach that redirect rather than the login page.
        '/verified-clubs',
        '/events/*',
        // Policies are for everyone, most of all the visitor deciding whether
        // to sign up.
        '/legal/*',
        // What a club would pay is for the visitor deciding whether to bring
        // their club here; driven by the public plan rows only.
        '/pricing',
        // Dev-only token preview; it 404s outside dev, so there is nothing to guard.
        '/dev/*',
        '/api/webhooks/*'
      ]
    }
  }
})
