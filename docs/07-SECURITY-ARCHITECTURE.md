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
