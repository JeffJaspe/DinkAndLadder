export interface RegisterRequestDto {
  email: string
  password: string
  turnstile_token: string
}

export interface LoginRequestDto {
  email: string
  password: string
  turnstile_token: string
}

/**
 * Setting a password on an account that has none (created through Google) and
 * changing an existing one are the same operation to Supabase, so they share
 * one contract. No Turnstile token: unlike register/login this requires an
 * authenticated session already, so there is nothing to gate against bots.
 */
export interface SetPasswordRequestDto {
  password: string
}
