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
