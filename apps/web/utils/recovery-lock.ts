/**
 * Marks a session as "recovery only" — arrived via a password-reset link and
 * good for exactly one thing: setting a new password.
 *
 * Supabase gives a recovery link a real session, which is why the reset flow
 * previously dropped the user into the app with the full sidebar and no
 * password actually changed. There is nothing on the session object that says
 * "this one is only for recovery", so the flag is ours to keep.
 *
 * `sessionStorage`, not a ref: the middleware has to answer on a hard reload
 * too, and this must not leak into another tab or outlive the browser session.
 * Every access is wrapped — Safari private mode throws on access rather than
 * returning null, and a storage failure must not take the reset flow with it.
 */
const KEY = 'dnl-recovery-lock'

export function lockToRecovery(): void {
  try {
    sessionStorage.setItem(KEY, '1')
  } catch {
    // Non-fatal: the page still works, it just cannot trap navigation away.
  }
}

export function clearRecoveryLock(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

export function isRecoveryLocked(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    // Fail *open*: a storage error must never strand someone on the password
    // form with no way forward. The worst case is the old behaviour.
    return false
  }
}
