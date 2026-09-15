# Authentication Specification

## Provider

Supabase Auth is the initial authentication provider.

## Supported Direction

- Email/password
- OAuth-ready architecture

## Application User

Authentication identity maps to an application `users` record.

Player business data maps from `users` to `player_profiles`.

## Sessions

Web and mobile clients authenticate against the provider and call the application API with authenticated context.

Do not create a second incompatible session system in application tables unless a real requirement emerges.

## Multi-factor authentication (IMPLEMENTED 2026-09-15)

A second factor from an authenticator app (TOTP, RFC 6238). Authenticator app only:
no SMS (paid on Supabase, and SIM-swappable — the exact attack a second factor is
for), no email codes. Google Authenticator, Microsoft Authenticator, Authy and
1Password all work; nothing is sent to anyone.

Supabase Auth owns the factor (`auth.mfa_factors`) and stamps the session JWT with
its assurance level: `aal1` = password or Google only, `aal2` = the second factor
was also presented. The application adds three things Supabase does not:

- **Enrolment flag.** `users.mfa_enrolled_at` (Liquibase 062). Written only by the
  MFA endpoints and re-synced from Supabase's factor list on every
  `POST /api/v1/auth/session`, so a factor enrolled from the mobile client is
  enforced from the next sign-in on.
- **Recovery codes.** `mfa_recovery_codes` — eight per enrolment, hashed
  (SHA-256 bound to the user id), shown exactly once. A code is a **self-service
  reset**, not a way in: it cannot raise a session to `aal2`, so presenting one
  (with the password) removes every factor and the owner enrols again.
- **Policy.** Who must have it. SuperAdmin today; club owners taking online
  payments once the payout-account form exists. A required account cannot turn it
  off (409 `MFA_REQUIRED_ROLE`) and is steered into the wizard from the admin guard.

### Enforcement

`aal` is checked in two places, and only the first one is security:

1. **Server middleware** `server/middleware/mfa-gate.ts` — every `/api/v1` request
   from a signed-in caller. An `aal1` session on an enrolled account gets 403
   `MFA_REQUIRED` everywhere except `/api/v1/auth/*`, `/api/v1/mfa/*` and
   `/api/v1/me/is-superadmin` (enough to finish signing in). `/api/v1/admin/**`
   requires `aal2` unconditionally (403 `MFA_STEP_UP_REQUIRED`). Decision logic is
   pure in `utils/mfa-gate.ts` and fully enumerated in its spec.
2. **Route middleware** `middleware/mfa-gate.global.ts` — a courtesy redirect to
   `/mfa/verify` so the person sees the code prompt rather than failed requests.

`requireAal2()` in `server/utils/mfa.ts` is the step-up guard for individual
endpoints (unenroll, admin reset) and is the hook the payout endpoints will use.

### Flows

- **Enrol** (`/settings/security/two-factor`): `POST /mfa/enroll` (server mints the
  factor + QR) → browser `challenge`+`verify` against Supabase (this is what raises
  *the browser's* session to `aal2`; a server-side verify would leave the tab on
  `aal1`) → `POST /mfa/enroll/confirm` (server requires the `aal2` claim **and**
  confirms a verified factor from Supabase's own list, then mints recovery codes).
- **Sign in**: after `setSession`, `login.vue`/`confirm.vue` call
  `needsMfaChallenge()` (`getAuthenticatorAssuranceLevel`, no network) and go to
  `/mfa/verify` when `nextLevel` is `aal2` and `currentLevel` is not.
- **Turn off** (`POST /mfa/unenroll`): `aal2` session **and** a fresh code.
- **Recover** (`/mfa/recover`, `POST /mfa/recover`): email + password + recovery
  code, behind Turnstile; one generic 401 for every failure; returns an `aal1`
  session and lands on the wizard with a "set it up again" banner.
- **Admin reset** (`POST /admin/users/{id}/mfa-reset`, `/admin/security`):
  SuperAdmin, `aal2`, audit-logged as `identity.mfa_admin_reset`; cannot target
  the SuperAdmin's own account.

Session-level assurance for v1: the code at sign-in makes the session `aal2` for
its lifetime. Re-prompting within a session for money actions is deferred (ADR-009).

Prerequisite per project: Supabase Dashboard → Authentication → Multi-Factor →
TOTP enabled (see `/docs/31-THIRD-PARTY-SETUP.md`).

## Mobile

Mobile token/session handling must use platform-appropriate secure storage.

Two-factor on mobile uses the same Supabase MFA SDK for enrol/challenge/verify and
the same `/api/v1/mfa/*` endpoints for status and recovery; the server gate is
client-agnostic.

## Authorization

Authentication proves identity.

Authorization determines what the identity is allowed to do.

Do not confuse the two.
