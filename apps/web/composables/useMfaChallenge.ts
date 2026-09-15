/**
 * Whether the current browser session still owes a second factor.
 *
 * `getAuthenticatorAssuranceLevel` decodes the access token in memory: no
 * network, safe to call on every navigation. `nextLevel` is what the account
 * can reach (aal2 once a verified factor exists); `currentLevel` is what this
 * session has proven. Owing one means the two differ.
 *
 * Shared by login.vue, confirm.vue and middleware/mfa-gate.global.ts so the
 * three cannot disagree about what "half signed in" means. Typed on the one
 * method it uses so any Supabase client shape (and a test fake) fits.
 */
export interface AssuranceLevelClient {
  auth: {
    mfa: {
      getAuthenticatorAssuranceLevel(): Promise<{
        data: { currentLevel: string | null; nextLevel: string | null } | null
        error: unknown
      }>
    }
  }
}

export async function needsMfaChallenge(supabase: AssuranceLevelClient): Promise<boolean> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error || !data) return false
  return data.nextLevel === 'aal2' && data.currentLevel !== 'aal2'
}
