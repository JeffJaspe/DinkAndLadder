# Security Architecture

## Roles

### Guest
Public access only.

### Player
Own account/profile operations and player-authorized match/club actions.

### Club Admin
Club-scoped administrative operations.

### System Admin
Platform-wide administrative capabilities.

## Authentication

Use the selected authentication provider for:
- password handling,
- session management,
- OAuth identity.

The application database should reference the authenticated user identity.

## Authorization

Authorization must be checked at the service boundary and enforced in database access policy/RLS where applicable.

## RLS

RLS is required for direct client-accessible tables.

The application must not rely only on frontend checks.

## Service Role

A privileged Supabase/service credential must never be shipped to web/mobile clients.

Use privileged access only in trusted server-side execution where necessary and minimize its scope.

## Privacy

Separate:
- public profile data,
- authenticated-player-only data,
- club-scoped data,
- administrative data.

## Audit

Audit sensitive operations.

## Abuse Controls

Future production hardening should include:
- rate limits,
- anti-spam controls,
- match fraud/dispute handling,
- suspicious activity monitoring.

### Bot protection (Cloudflare Turnstile) — IMPLEMENTED

Registration (`POST /api/v1/auth/register`) and login (`POST /api/v1/auth/login`)
are enforced server-side, not client-side: the browser no longer calls
Supabase's `signUp`/`signInWithPassword` directly — it calls these two app
endpoints, which verify a Cloudflare Turnstile token via Cloudflare's
`siteverify` API before delegating to Supabase. This closes the gap where a
bot could otherwise drive the register/login forms directly.

- **Fails closed, not open**: if Turnstile's verification service is
  unreachable, the request is rejected, not silently allowed through.
- **Config point, not a hard requirement**: enforcement only activates once
  `TURNSTILE_SECRET_KEY` is set (see `apps/web/server/utils/turnstile.ts`).
  Unconfigured environments (local dev, CI without a Cloudflare account)
  bypass the check rather than being unable to register/log in at all.
- **Known limitation**: Supabase's Auth API (anon key) is directly reachable
  over the network regardless of this app's own UI. Turnstile raises the bar
  for bots driving *this app's* register/login forms; it is not a guarantee
  against a determined attacker calling Supabase directly. Supabase's own
  provider-side abuse controls are the backstop for that case.
- Setup steps (getting a Cloudflare account/site key): `docs/31-THIRD-PARTY-SETUP.md`.

### Edge protection (Cloudflare DNS proxy + firewall rules) — NOT IMPLEMENTED IN CODE

Putting the deployed domain behind Cloudflare's DNS proxy (basic DDoS
mitigation, SSL, a small number of free custom firewall rules) is a
dashboard/DNS configuration action against the user's own domain and
Cloudflare account — not something expressed in this codebase. Manual setup
steps are documented in `docs/31-THIRD-PARTY-SETUP.md` for whoever manages
the domain/DNS to perform.
