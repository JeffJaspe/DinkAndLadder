export interface UserRecord {
  id: string
  email: string
  status: string
  email_verified_at: string | null
  last_login_at: string | null
  created_at: string
}

export interface UserDto {
  id: string
  email: string
  status: string
  email_verified_at: string | null
  last_login_at: string | null
  created_at: string
}

export function toUserDto(user: UserRecord): UserDto {
  return {
    id: user.id,
    email: user.email,
    status: user.status,
    email_verified_at: user.email_verified_at,
    last_login_at: user.last_login_at,
    created_at: user.created_at
  }
}
