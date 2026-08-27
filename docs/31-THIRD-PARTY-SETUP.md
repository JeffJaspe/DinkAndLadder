# Third-Party Integration Setup Guide

## 1. Google OAuth (Supabase)

### Setup Steps

1. **Google Cloud Console** (https://console.cloud.google.com)
   - Create a new project or select existing
   - Go to "APIs & Services" → "Credentials"
   - Create OAuth 2.0 Client ID (Web application)
   - Add authorized redirect URI:
     ```
     https://<your-project>.supabase.co/auth/v1/callback
     ```

2. **Supabase Dashboard**
   - Go to Authentication → Providers → Google
   - Enable Google provider
   - Enter Client ID and Client Secret from Google
   - Save

3. **Supabase Dashboard → Authentication → URL Configuration**

   This step is not optional, and skipping it fails *silently*. Supabase checks
   the `redirectTo` an app sends against the **Redirect URLs** allow-list; a URL
   that is not on the list is discarded without an error anywhere and the user
   is sent to **Site URL** instead. Leaving Site URL at its initial
   `http://localhost:3000` while deploying elsewhere therefore sends every
   OAuth sign-in — from every environment — to localhost.

   **Site URL** — the deployment, since that is where real users are:
   ```
   https://dink-and-ladder-web.vercel.app
   ```

   **Redirect URLs** — every origin the app is served from:
   ```
   http://localhost:3000/**
   https://dink-and-ladder-web.vercel.app/**
   https://dink-and-ladder-web-*.vercel.app/**
   ```

   The third entry covers Vercel preview deployments, which get a fresh
   generated hostname per deploy. These patterns are globs: `*` does not cross
   `.` or `/`, `**` does.

   The Google Cloud Console redirect URI above needs no per-environment entry —
   it points at Supabase's own `/auth/v1/callback`, which is the same for all of
   them.

4. **Environment Variables** (already handled by Supabase module)
   ```env
   # .env
   SUPABASE_URL=https://<your-project>.supabase.co
   SUPABASE_KEY=<your-anon-key>
   ```

   Confirmation emails are built server-side, where there is no
   `window.location`, so their origin comes from `server/utils/site-url.ts`.
   It is detected per deployment from Vercel's own variables and falls back to
   localhost, so there is nothing to set; `NUXT_SITE_URL` forces a value if a
   future host is neither Vercel nor local.

### Frontend Usage
```vue
<script setup>
const supabase = useSupabaseClient()

async function signInWithGoogle() {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/confirm`
    }
  })
}
</script>
```

---

## 2. Stripe (International Cards)

### Setup Steps

1. **Stripe Dashboard** (https://dashboard.stripe.com)
   - Create account (free)
   - Get API keys from Developers → API keys
   - Set up webhook endpoint

2. **Environment Variables**
   ```env
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

3. **Webhook Events to Subscribe**
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`

### Products to Create in Stripe
- **DinkAndLadder Pro** (Player subscription) - PHP 299/month
- **DinkAndLadder Club** (Club subscription) - PHP 999/month
- **DinkAndLadder Club Pro** (Club premium) - PHP 1999/month

---

## 3. PayMongo (Philippine Cards, GCash, GrabPay)

### Setup Steps

1. **PayMongo Dashboard** (https://dashboard.paymongo.com)
   - Create account (free for testing)
   - Complete business verification for live
   - Get API keys from Developers

2. **Environment Variables**
   ```env
   PAYMONGO_SECRET_KEY=sk_test_...
   PAYMONGO_PUBLIC_KEY=pk_test_...
   PAYMONGO_WEBHOOK_SECRET=whsec_...
   ```

3. **Supported Payment Methods**
   - Credit/Debit Cards (Visa, Mastercard)
   - GCash
   - GrabPay
   - Maya (PayMaya)
   - BPI Online
   - UnionBank Online

4. **Webhook Events**
   - `source.chargeable` (for e-wallets)
   - `payment.paid`
   - `payment.failed`

### Payment Flow (GCash/GrabPay)
1. Create Source → Get checkout URL
2. Redirect user to e-wallet app
3. User authorizes payment
4. Webhook: `source.chargeable`
5. Create Payment from Source
6. Webhook: `payment.paid`

---

## 4. GCash Direct (via PayMongo)

GCash is accessed through PayMongo's API. No separate integration needed.

### Flow
```
User selects GCash → 
Create PayMongo Source (type: gcash) → 
Redirect to GCash app → 
User authorizes → 
Webhook notification → 
Charge the source
```

---

## 5. Cloudflare (free tier)

Two independent pieces. The first is implemented in this app's code; the
second is a dashboard/DNS action against your own domain that no amount of
application code can do for you.

### 5a. Turnstile (bot protection on register/login) — code already wired up

1. **Cloudflare Dashboard** (https://dash.cloudflare.com) → **Turnstile** → **Add site**
   - Domain: your production domain (e.g. `dinkandladder.app`). For local
     testing you can add `localhost` as an additional domain on the same site.
   - Widget mode: "Managed" is fine — the app doesn't depend on a specific mode.
   - Copy the **Site Key** (public) and **Secret Key** (server-only).

2. **Environment Variables** (`apps/web/.env`)
   ```env
   TURNSTILE_SITE_KEY=0x4AAAAAAA...
   TURNSTILE_SECRET_KEY=0x4AAAAAAA...
   ```
   Leaving these unset does **not** break the app — registration/login work
   without Turnstile enforcement (see `docs/07-SECURITY-ARCHITECTURE.md`).
   Set them to actually enforce bot protection.

3. **What already exists in code** (nothing further to build):
   - `apps/web/components/TurnstileWidget.vue` — renders the Cloudflare widget
     on `/register` and `/login`.
   - `apps/web/server/utils/turnstile.ts` — server-side `siteverify` check.
   - `POST /api/v1/auth/register` / `POST /api/v1/auth/login` — the two
     endpoints that verify the token before delegating to Supabase.

4. **Testing without a real Cloudflare account**: Cloudflare publishes dummy
   test keypairs for exactly this purpose (see
   https://developers.cloudflare.com/turnstile/troubleshooting/testing/):
   ```env
   # Always passes — used in this repo's CI (.github/workflows/ci.yml)
   TURNSTILE_SITE_KEY=1x00000000000000000000AA
   TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
   ```
   These are not secrets and are safe to commit/share.

### 5b. DNS proxy + firewall rules (edge protection) — manual, dashboard-only

This is **not** something the app's code can set up — it's a change to how
your domain's DNS resolves and is configured directly in Cloudflare's
dashboard by whoever controls the domain. Steps, for the free tier:

1. **Add your domain to Cloudflare**: Dashboard → "Add a site" → enter your
   domain → pick the **Free** plan.
2. **Update nameservers**: Cloudflare gives you two nameservers to set at
   your domain registrar (wherever the domain was bought), replacing
   whatever nameservers point at it today (e.g. Vercel's, if using Vercel DNS).
   This is the step that actually routes traffic through Cloudflare — DNS
   propagation can take a few hours.
3. **Re-create your DNS records in Cloudflare**, pointing at the same target
   the domain already resolves to (e.g. a `CNAME` to your Vercel deployment).
   Make sure the record's proxy status is "Proxied" (orange cloud icon), not
   "DNS only" (grey cloud) — only proxied records get Cloudflare's DDoS
   mitigation/WAF/firewall rules; unproxied records bypass it entirely.
4. **SSL/TLS mode**: set to "Full" or "Full (strict)" under SSL/TLS →
   Overview, so Cloudflare-to-origin traffic stays encrypted (not "Flexible").
5. **Free-tier firewall rules** (Security → WAF → Custom rules — a small
   number of rules are included free): a few concrete starting rules for
   this app, since the API surface is public-read-heavy:
   - Rate-limit or challenge repeated POSTs to `/api/v1/auth/register` and
     `/api/v1/auth/login` from the same IP (defense in depth on top of
     Turnstile — free-tier rate limiting rules are limited, treat this as
     "some," not "unlimited").
   - Block or challenge known bad user agents (empty UA, common scraper
     strings) hitting `/api/*`.
   - Consider a "Managed Challenge" (not outright block) rather than hard
     blocks, since this is a public sports app, not something behind a login
     wall by default.
6. **Verify**: after nameservers propagate, `dig your-domain.com` should
   resolve to Cloudflare's IPs, and response headers on any request should
   include `cf-ray`/`server: cloudflare`.

None of this is reversible-free to get wrong (a bad SSL mode or a missed DNS
record can take the whole site down), so do it during a low-traffic window
and verify the site still loads immediately after switching nameservers.

## 6. Environment Variables Summary

```env
# Supabase (required)
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Stripe (for international cards)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# PayMongo (for Philippine payments)
PAYMONGO_SECRET_KEY=sk_test_...
PAYMONGO_PUBLIC_KEY=pk_test_...
PAYMONGO_WEBHOOK_SECRET=whsec_...

# Optional: Direct GCash API (if not using PayMongo)
GCASH_APP_ID=...
GCASH_APP_SECRET=...

# Cloudflare Turnstile (bot protection on register/login — optional, see section 5a)
TURNSTILE_SITE_KEY=0x4AAAAAAA...
TURNSTILE_SECRET_KEY=0x4AAAAAAA...
```

---

## 7. Webhook Endpoints to Create

| Provider | Endpoint | Purpose |
|----------|----------|---------|
| Stripe | `/api/webhooks/stripe` | Subscription events |
| PayMongo | `/api/webhooks/paymongo` | Payment confirmations |

---

## 8. Testing

### Stripe Test Cards
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- 3D Secure: `4000 0025 0000 3155`

### PayMongo Test Cards
- Success: `4343 4343 4343 4345`
- Decline: `4571 7360 0000 0005`

### GCash/GrabPay Testing
- Use PayMongo test mode
- Simulates e-wallet flow without real money

---

## 9. Go-Live Checklist

- [ ] Switch all API keys from test to live
- [ ] Complete PayMongo business verification
- [ ] Set up Stripe tax settings for Philippines
- [ ] Configure webhook URLs to production domain
- [ ] Test full payment flow end-to-end
- [ ] Set up payment failure notifications
- [ ] Configure refund policies
- [ ] Create a production Cloudflare Turnstile site and set real `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY` (see 5a)
- [ ] Point the production domain's nameservers at Cloudflare and re-add DNS records as proxied (see 5b)
