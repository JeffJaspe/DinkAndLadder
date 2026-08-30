import type { AuthIdentity, UserRepository } from '../repositories/user.repository'
import type { UserDto } from '../dto/user.dto'
import { toUserDto } from '../dto/user.dto'

export interface AuthService {
  provisionSession(identity: AuthIdentity): Promise<UserDto>
  getCurrentUser(authId: string): Promise<UserDto | null>
}

export function createAuthService(repository: UserRepository): AuthService {
  return {
    async provisionSession(identity) {
      const user = await repository.upsertFromAuthIdentity(identity)
      return toUserDto(user)
    },

    async getCurrentUser(authId) {
      const user = await repository.findByAuthId(authId)
      return user ? toUserDto(user) : null
    }
  }
}

export interface AuthSession {
  access_token: string
  refresh_token: string
  expires_at?: number
}

/**
 * The minimal slice of the Supabase client's auth namespace these two
 * functions need — kept narrow so they can be unit-tested with a fake client
 * instead of a real Supabase connection.
 */
export interface PasswordAuthError {
  message: string
  code?: string
}

export interface PasswordAuthClient {
  auth: {
    signUp(params: {
      email: string
      password: string
      options?: { emailRedirectTo?: string }
    }): Promise<{
      // `identities` is the only way to tell a real signup from the decoy
      // Supabase returns for an address that already has an account — see
      // registerWithPassword. Typed loosely (and optionally) because nothing
      // here reads the identity rows themselves, only how many came back.
      data?: { user?: { identities?: unknown[] | null } | null } | null
      error: PasswordAuthError | null
    }>
    signInWithPassword(params: { email: string; password: string }): Promise<{
      data: { session: AuthSession | null }
      error: PasswordAuthError | null
    }>
  }
}

/**
 * Delegates account creation to the configured auth provider (Supabase).
 * Called only from the server after Turnstile verification succeeds — see
 * server/api/v1/auth/register.post.ts. `code` is Supabase's stable
 * machine-readable error code (see auth-error-mapper.ts) — undefined for
 * error shapes that predate it or come from elsewhere.
 *
 * `emailRedirectTo` is where the confirmation email's link lands. Running here
 * rather than in the browser means there is no `window.location` to read it
 * from, so the caller supplies it (see `resolveSiteUrl`). Without it Supabase
 * builds the link from the project's Site URL, which is a single value shared
 * by every environment pointed at the project — so a signup on one host
 * confirms on another.
 */
export async function registerWithPassword(
  client: PasswordAuthClient,
  email: string,
  password: string,
  emailRedirectTo?: string
): Promise<{ error: string | null; code: string | undefined; alreadyRegistered: boolean }> {
  const { data, error } = await client.auth.signUp({
    email,
    password,
    // Omitted rather than guessed when there is nothing to send: Supabase then
    // falls back to Site URL, which is exactly the previous behaviour.
    ...(emailRedirectTo ? { options: { emailRedirectTo } } : {})
  })

  // Signing up an address that already has an account does NOT error while
  // email confirmations are on: Supabase's user-enumeration protection returns
  // success with a decoy user — a throwaway id, no session, and an *empty*
  // `identities` array — and sends no email at all. Reading only `error` (as
  // this did originally) made that indistinguishable from a real signup, so the
  // UI told people to check an inbox nothing had been sent to. A genuine new
  // signup always comes back carrying one identity, so an empty array is the
  // signal. The `user_already_exists` / `email_exists` codes in
  // auth-error-mapper.ts cover the other configuration, where confirmations are
  // off and Supabase errors outright instead.
  const identities = data?.user?.identities
  return {
    error: error?.message ?? null,
    code: error?.code,
    alreadyRegistered: !error && Array.isArray(identities) && identities.length === 0
  }
}

/**
 * Delegates credential verification to the configured auth provider (Supabase).
 * Called only from the server after Turnstile verification succeeds — see
 * server/api/v1/auth/login.post.ts. Returns the raw session tokens so the
 * client can call supabase.auth.setSession() with them — that's the only
 * thing that actually fires @nuxtjs/supabase's onAuthStateChange listener and
 * updates the reactive session state its route guard reads. Cookies alone
 * (set as a side effect of calling this through serverSupabaseClient) cover
 * subsequent *server-side* requests, but never update client-side reactive
 * state — confirmed the hard way: navigateTo() after login bounced straight
 * back to /login because useSupabaseSession() was still null client-side.
 */
export async function loginWithPassword(
  client: PasswordAuthClient,
  email: string,
  password: string
): Promise<{ error: string | null; code: string | undefined; session: AuthSession | null }> {
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  return { error: error?.message ?? null, code: error?.code, session: data?.session ?? null }
}

/**
 * The slice of the auth namespace needed to set a password on the *current*
 * session's user — kept separate from PasswordAuthClient so the register/login
 * fakes don't have to grow a method they never call.
 */
export interface PasswordUpdateClient {
  auth: {
    updateUser(params: { password: string }): Promise<{ error: PasswordAuthError | null }>
  }
}

/**
 * Adds a password to an account, or replaces the one it has. Supabase treats
 * both as the same call, and it attaches an `email` identity to a user that
 * only had `google` — which is what makes one account reachable through both
 * sign-in methods rather than becoming two accounts.
 *
 * Deliberately no "current password" argument. Supabase does not verify one
 * here; the session itself is the proof of identity, and the project-level
 * "Secure password change" setting is what escalates that to a reauthentication
 * challenge (surfaced as `reauthentication_needed` — see auth-error-mapper.ts).
 * Asking for a password the caller may not have would also lock out exactly the
 * Google-only users this exists for.
 */
export async function setPassword(
  client: PasswordUpdateClient,
  password: string
): Promise<{ error: string | null; code: string | undefined }> {
  const { error } = await client.auth.updateUser({ password })
  return { error: error?.message ?? null, code: error?.code }
}
