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
    }): Promise<{ error: PasswordAuthError | null }>
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
): Promise<{ error: string | null; code: string | undefined }> {
  const { error } = await client.auth.signUp({
    email,
    password,
    // Omitted rather than guessed when there is nothing to send: Supabase then
    // falls back to Site URL, which is exactly the previous behaviour.
    ...(emailRedirectTo ? { options: { emailRedirectTo } } : {})
  })
  return { error: error?.message ?? null, code: error?.code }
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
