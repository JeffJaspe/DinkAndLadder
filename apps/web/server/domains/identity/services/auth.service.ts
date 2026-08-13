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
