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

3. **Environment Variables** (already handled by Supabase module)
   ```env
   # .env
   SUPABASE_URL=https://<your-project>.supabase.co
   SUPABASE_KEY=<your-anon-key>
   ```

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

## 5. Environment Variables Summary

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
```

---

## 6. Webhook Endpoints to Create

| Provider | Endpoint | Purpose |
|----------|----------|---------|
| Stripe | `/api/webhooks/stripe` | Subscription events |
| PayMongo | `/api/webhooks/paymongo` | Payment confirmations |

---

## 7. Testing

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

## 8. Go-Live Checklist

- [ ] Switch all API keys from test to live
- [ ] Complete PayMongo business verification
- [ ] Set up Stripe tax settings for Philippines
- [ ] Configure webhook URLs to production domain
- [ ] Test full payment flow end-to-end
- [ ] Set up payment failure notifications
- [ ] Configure refund policies
