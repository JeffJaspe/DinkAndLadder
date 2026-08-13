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

## Mobile

Mobile token/session handling must use platform-appropriate secure storage.

## Authorization

Authentication proves identity.

Authorization determines what the identity is allowed to do.

Do not confuse the two.
